"use strict";
/**
 * Job Processor with Worker Management
 *
 * Features:
 * - Multi-worker job processing with load balancing
 * - Dynamic worker scaling based on queue size
 * - Job type-specific handlers registration
 * - Worker health monitoring and recovery
 * - Graceful shutdown with job completion
 * - Performance metrics collection
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobProcessor = void 0;
const job_queue_1 = require("../redis/job-queue");
const connection_1 = require("../db/connection");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
const base_handler_1 = require("./handlers/base-handler");
class JobProcessor {
    constructor(queue, database, config, handlerRegistry) {
        this.isRunning = false;
        this.workers = new Map();
        this.maintenanceInterval = null;
        this.statsInterval = null;
        this.shutdownPromise = null;
        this.queue = queue || new job_queue_1.JobQueue();
        this.database = database || connection_1.DatabaseConnection.getInstance();
        this.config = config || config_1.configManager.getProcessorConfig();
        this.handlerRegistry = handlerRegistry || new base_handler_1.HandlerRegistry();
        logger_1.logger.info('JobProcessor initialized', {
            operation: 'processor_init',
            metadata: {
                maxWorkers: this.config.maxWorkers,
                pollingInterval: this.config.pollingInterval,
                registryEnabled: true
            }
        });
    }
    /**
     * Register job handler for specific job type
     */
    registerHandler(jobType, handler) {
        this.handlerRegistry.register(jobType, handler);
    }
    /**
     * Get handler registry for external access
     */
    getHandlerRegistry() {
        return this.handlerRegistry;
    }
    /**
     * Start job processing with workers
     */
    async start() {
        if (this.isRunning) {
            logger_1.logger.warn('JobProcessor is already running');
            return;
        }
        this.isRunning = true;
        logger_1.logger.info('Starting JobProcessor', {
            operation: 'processor_start',
            metadata: { maxWorkers: this.config.maxWorkers }
        });
        try {
            // Start workers
            await this.startWorkers();
            // Start maintenance tasks
            this.startMaintenance();
            // Start statistics collection
            this.startStatsCollection();
            logger_1.logger.info('JobProcessor started successfully', {
                operation: 'processor_started',
                metadata: {
                    activeWorkers: this.workers.size,
                    registeredHandlers: this.handlers.size
                }
            });
        }
        catch (error) {
            this.isRunning = false;
            logger_1.logger.error('Failed to start JobProcessor', error, {
                operation: 'processor_start_failed'
            });
            throw error;
        }
    }
    /**
     * Stop job processing gracefully
     */
    async stop(timeout = 30000) {
        if (!this.isRunning) {
            return;
        }
        if (this.shutdownPromise) {
            return this.shutdownPromise;
        }
        this.shutdownPromise = this.performGracefulShutdown(timeout);
        return this.shutdownPromise;
    }
    async performGracefulShutdown(timeout) {
        logger_1.logger.info('Starting graceful shutdown', {
            operation: 'processor_shutdown',
            metadata: { timeout, activeWorkers: this.workers.size }
        });
        this.isRunning = false;
        // Stop maintenance tasks
        if (this.maintenanceInterval) {
            clearInterval(this.maintenanceInterval);
            this.maintenanceInterval = null;
        }
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
        // Stop all workers with timeout
        const workerStopPromises = Array.from(this.workers.values()).map(worker => worker.stop(timeout / this.workers.size));
        try {
            await Promise.allSettled(workerStopPromises);
        }
        catch (error) {
            logger_1.logger.error('Error during worker shutdown', error, {
                operation: 'worker_shutdown_error'
            });
        }
        this.workers.clear();
        logger_1.logger.info('JobProcessor shutdown completed', {
            operation: 'processor_shutdown_complete'
        });
    }
    async startWorkers() {
        for (let i = 0; i < this.config.maxWorkers; i++) {
            const worker = new Worker(i, this.queue, this.database, this.handlerRegistry, this.config);
            this.workers.set(i, worker);
            // Start worker (non-blocking)
            worker.start().catch(error => {
                logger_1.logger.error(`Worker ${i} failed to start`, error, {
                    operation: 'worker_start_failed',
                    workerId: i
                });
                this.workers.delete(i);
            });
        }
        // Wait a moment for workers to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        logger_1.logger.info(`Started ${this.workers.size} workers`);
    }
    startMaintenance() {
        this.maintenanceInterval = setInterval(async () => {
            try {
                // Promote delayed jobs
                await this.queue.promoteDelayedJobs();
                // Cleanup stale jobs
                await this.queue.cleanupStaleJobs();
                // Cleanup old job results
                await this.database.cleanupOldJobResults();
                // Monitor worker health
                await this.monitorWorkerHealth();
            }
            catch (error) {
                logger_1.logger.error('Maintenance task failed', error, {
                    operation: 'maintenance_error'
                });
            }
        }, this.config.pollingInterval);
    }
    startStatsCollection() {
        if (!this.config.enableMetrics)
            return;
        this.statsInterval = setInterval(async () => {
            try {
                const queueStats = await this.queue.getQueueStats();
                const workerStats = this.getWorkerStats();
                const handlerMetrics = this.handlerRegistry.getAllMetrics();
                logger_1.logger.queueStats({
                    queue: queueStats,
                    workers: workerStats,
                    handlers: handlerMetrics
                });
            }
            catch (error) {
                logger_1.logger.error('Stats collection failed', error, {
                    operation: 'stats_collection_error'
                });
            }
        }, 30000); // Every 30 seconds
    }
    async monitorWorkerHealth() {
        const unhealthyWorkers = [];
        for (const [workerId, worker] of this.workers) {
            if (!worker.isHealthy()) {
                unhealthyWorkers.push(workerId);
                logger_1.logger.warn(`Worker ${workerId} is unhealthy`, {
                    operation: 'worker_health_check',
                    workerId,
                    metadata: worker.getStats()
                });
            }
        }
        // Restart unhealthy workers if needed
        for (const workerId of unhealthyWorkers) {
            await this.restartWorker(workerId);
        }
    }
    async restartWorker(workerId) {
        try {
            const oldWorker = this.workers.get(workerId);
            if (oldWorker) {
                await oldWorker.stop(5000); // 5 second timeout
                this.workers.delete(workerId);
            }
            const newWorker = new Worker(workerId, this.queue, this.database, this.handlerRegistry, this.config);
            this.workers.set(workerId, newWorker);
            await newWorker.start();
            logger_1.logger.info(`Worker ${workerId} restarted`, {
                operation: 'worker_restarted',
                workerId
            });
        }
        catch (error) {
            logger_1.logger.error(`Failed to restart worker ${workerId}`, error, {
                operation: 'worker_restart_failed',
                workerId
            });
        }
    }
    getStatus() {
        return {
            running: this.isRunning,
            workers: this.getWorkerStats(),
            handlers: this.handlerRegistry.getRegisteredTypes(),
            handlerMetrics: this.handlerRegistry.getAllMetrics(),
            config: this.config
        };
    }
    getWorkerStats() {
        return Array.from(this.workers.values()).map(worker => worker.getStats());
    }
}
exports.JobProcessor = JobProcessor;
/**
 * Individual Worker for job processing
 */
class Worker {
    constructor(id, queue, database, handlerRegistry, config) {
        this.isRunning = false;
        this.currentJob = null;
        this.processingTimeout = null;
        this.id = id;
        this.queue = queue;
        this.database = database;
        this.handlerRegistry = handlerRegistry;
        this.config = config;
        this.stats = {
            id,
            startedAt: new Date(),
            processed: 0,
            failed: 0,
            status: 'idle'
        };
    }
    async start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.stats.status = 'idle';
        logger_1.logger.workerStarted(this.id);
        // Start processing loop
        this.processLoop().catch(error => {
            logger_1.logger.error(`Worker ${this.id} processing loop failed`, error, {
                operation: 'worker_loop_failed',
                workerId: this.id
            });
        });
    }
    async stop(timeout = 10000) {
        if (!this.isRunning)
            return;
        logger_1.logger.info(`Stopping worker ${this.id}`, {
            operation: 'worker_stop',
            workerId: this.id,
            metadata: { currentJob: this.currentJob?.id }
        });
        this.isRunning = false;
        this.stats.status = 'stopping';
        // Clear any processing timeout
        if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
            this.processingTimeout = null;
        }
        // Wait for current job to complete or timeout
        if (this.currentJob) {
            const start = Date.now();
            while (this.currentJob && Date.now() - start < timeout) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (this.currentJob) {
                logger_1.logger.warn(`Worker ${this.id} stopping with job still in progress`, {
                    operation: 'worker_force_stop',
                    workerId: this.id,
                    metadata: { jobId: this.currentJob.id }
                });
            }
        }
        logger_1.logger.workerStopped(this.id, this.stats.processed, this.stats.failed);
    }
    async processLoop() {
        while (this.isRunning) {
            try {
                // Get next job
                const job = await this.queue.getNextJob();
                if (!job) {
                    // No jobs available, wait before next poll
                    await this.sleep(this.config.pollingInterval);
                    continue;
                }
                await this.processJob(job);
            }
            catch (error) {
                logger_1.logger.error(`Worker ${this.id} processing error`, error, {
                    operation: 'worker_process_error',
                    workerId: this.id
                });
                // Wait before retrying on error
                await this.sleep(Math.min(this.config.pollingInterval * 2, 5000));
            }
        }
    }
    async processJob(job) {
        this.currentJob = job;
        this.stats.status = 'processing';
        this.stats.currentJob = job.id;
        const jobLogger = (0, logger_1.withJobContext)(job.id, this.id);
        jobLogger.jobStarted(job.id, job.type, this.id);
        const startTime = Date.now();
        // Set processing timeout
        this.processingTimeout = setTimeout(() => {
            if (this.currentJob?.id === job.id) {
                jobLogger.warn('Job processing timeout', {
                    operation: 'job_timeout',
                    metadata: { timeoutMs: this.config.staleJobTimeout }
                });
            }
        }, this.config.staleJobTimeout);
        try {
            // Get handler for job type
            const handler = this.handlerRegistry.get(job.type);
            if (!handler) {
                throw new Error(`No handler registered for job type: ${job.type}`);
            }
            // Process job
            const result = await handler.process(job);
            const duration = Date.now() - startTime;
            // Mark as completed
            await this.queue.completeJob(job.id, result);
            // Persist result to database
            await this.database.persistJobResult(job.id, result, new Date());
            await this.database.persistJobMetrics(job.id, job.type, duration, true);
            // Update stats
            this.stats.processed++;
            jobLogger.jobCompleted(job.id, job.type, duration, this.id);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error.message;
            // Mark as failed
            await this.queue.failJob(job.id, errorMessage);
            // Persist metrics
            await this.database.persistJobMetrics(job.id, job.type, duration, false, errorMessage);
            // Update stats
            this.stats.failed++;
            jobLogger.jobFailed(job.id, job.type, error, job.attempts + 1, job.maxAttempts, this.id);
        }
        finally {
            // Clear processing timeout
            if (this.processingTimeout) {
                clearTimeout(this.processingTimeout);
                this.processingTimeout = null;
            }
            // Clear current job
            this.currentJob = null;
            this.stats.status = 'idle';
            this.stats.currentJob = undefined;
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    isHealthy() {
        // Worker is unhealthy if:
        // 1. It's been processing the same job for too long
        // 2. It has too many consecutive failures
        // 3. It's not running when it should be
        if (!this.isRunning) {
            return false;
        }
        if (this.currentJob && this.processingTimeout) {
            const processingTime = Date.now() - (this.currentJob.processingStartedAt?.getTime() || Date.now());
            if (processingTime > this.config.staleJobTimeout * 2) {
                return false;
            }
        }
        // Check failure rate (more than 80% failures in last 10 jobs)
        const recentFailureRate = this.stats.processed > 0 ? this.stats.failed / this.stats.processed : 0;
        if (this.stats.processed > 10 && recentFailureRate > 0.8) {
            return false;
        }
        return true;
    }
    getStats() {
        return { ...this.stats };
    }
}
//# sourceMappingURL=job-processor.js.map