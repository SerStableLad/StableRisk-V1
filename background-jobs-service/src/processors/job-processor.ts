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

import { JobQueue } from '../redis/job-queue';
import { DatabaseConnection } from '../db/connection';
import { Job, JobHandler, WorkerInfo, ProcessorConfig, WorkerError } from '../types';
import { logger, withJobContext } from '../utils/logger';
import { configManager } from '../config';
import { HandlerRegistry } from './handlers/base-handler';

export class JobProcessor {
  private queue: JobQueue;
  private database: DatabaseConnection;
  private config: ProcessorConfig;
  private isRunning = false;
  private workers: Map<number, Worker> = new Map();
  private handlerRegistry: HandlerRegistry;
  private maintenanceInterval: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    queue?: JobQueue,
    database?: DatabaseConnection,
    config?: ProcessorConfig,
    handlerRegistry?: HandlerRegistry
  ) {
    this.queue = queue || new JobQueue();
    this.database = database || DatabaseConnection.getInstance();
    this.config = config || configManager.getProcessorConfig();
    this.handlerRegistry = handlerRegistry || new HandlerRegistry();
    
    logger.info('JobProcessor initialized', {
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
  public registerHandler(jobType: string, handler: JobHandler): void {
    this.handlerRegistry.register(jobType, handler);
  }

  /**
   * Get handler registry for external access
   */
  public getHandlerRegistry(): HandlerRegistry {
    return this.handlerRegistry;
  }

  /**
   * Start job processing with workers
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('JobProcessor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting JobProcessor', {
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

      logger.info('JobProcessor started successfully', {
        operation: 'processor_started',
        metadata: { 
          activeWorkers: this.workers.size,
          registeredHandlers: this.handlers.size
        }
      });
    } catch (error) {
      this.isRunning = false;
      logger.error('Failed to start JobProcessor', error as Error, {
        operation: 'processor_start_failed'
      });
      throw error;
    }
  }

  /**
   * Stop job processing gracefully
   */
  public async stop(timeout: number = 30000): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performGracefulShutdown(timeout);
    return this.shutdownPromise;
  }

  private async performGracefulShutdown(timeout: number): Promise<void> {
    logger.info('Starting graceful shutdown', {
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
    const workerStopPromises = Array.from(this.workers.values()).map(worker => 
      worker.stop(timeout / this.workers.size)
    );

    try {
      await Promise.allSettled(workerStopPromises);
    } catch (error) {
      logger.error('Error during worker shutdown', error as Error, {
        operation: 'worker_shutdown_error'
      });
    }

    this.workers.clear();

    logger.info('JobProcessor shutdown completed', {
      operation: 'processor_shutdown_complete'
    });
  }

  private async startWorkers(): Promise<void> {
    for (let i = 0; i < this.config.maxWorkers; i++) {
      const worker = new Worker(
        i,
        this.queue,
        this.database,
        this.handlerRegistry,
        this.config
      );

      this.workers.set(i, worker);
      
      // Start worker (non-blocking)
      worker.start().catch(error => {
        logger.error(`Worker ${i} failed to start`, error as Error, {
          operation: 'worker_start_failed',
          workerId: i
        });
        this.workers.delete(i);
      });
    }

    // Wait a moment for workers to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    logger.info(`Started ${this.workers.size} workers`);
  }

  private startMaintenance(): void {
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
        
      } catch (error) {
        logger.error('Maintenance task failed', error as Error, {
          operation: 'maintenance_error'
        });
      }
    }, this.config.pollingInterval);
  }

  private startStatsCollection(): void {
    if (!this.config.enableMetrics) return;

    this.statsInterval = setInterval(async () => {
      try {
        const queueStats = await this.queue.getQueueStats();
        const workerStats = this.getWorkerStats();
        const handlerMetrics = this.handlerRegistry.getAllMetrics();

        logger.queueStats({
          queue: queueStats,
          workers: workerStats,
          handlers: handlerMetrics
        });

      } catch (error) {
        logger.error('Stats collection failed', error as Error, {
          operation: 'stats_collection_error'
        });
      }
    }, 30000); // Every 30 seconds
  }

  private async monitorWorkerHealth(): Promise<void> {
    const unhealthyWorkers: number[] = [];
    
    for (const [workerId, worker] of this.workers) {
      if (!worker.isHealthy()) {
        unhealthyWorkers.push(workerId);
        logger.warn(`Worker ${workerId} is unhealthy`, {
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

  private async restartWorker(workerId: number): Promise<void> {
    try {
      const oldWorker = this.workers.get(workerId);
      if (oldWorker) {
        await oldWorker.stop(5000); // 5 second timeout
        this.workers.delete(workerId);
      }

      const newWorker = new Worker(
        workerId,
        this.queue,
        this.database,
        this.handlerRegistry,
        this.config
      );

      this.workers.set(workerId, newWorker);
      await newWorker.start();

      logger.info(`Worker ${workerId} restarted`, {
        operation: 'worker_restarted',
        workerId
      });

    } catch (error) {
      logger.error(`Failed to restart worker ${workerId}`, error as Error, {
        operation: 'worker_restart_failed',
        workerId
      });
    }
  }

  public getStatus(): {
    running: boolean;
    workers: WorkerInfo[];
    handlers: string[];
    handlerMetrics: Record<string, any>;
    config: ProcessorConfig;
  } {
    return {
      running: this.isRunning,
      workers: this.getWorkerStats(),
      handlers: this.handlerRegistry.getRegisteredTypes(),
      handlerMetrics: this.handlerRegistry.getAllMetrics(),
      config: this.config
    };
  }

  private getWorkerStats(): WorkerInfo[] {
    return Array.from(this.workers.values()).map(worker => worker.getStats());
  }
}

/**
 * Individual Worker for job processing
 */
class Worker {
  private id: number;
  private queue: JobQueue;
  private database: DatabaseConnection;
  private handlerRegistry: HandlerRegistry;
  private config: ProcessorConfig;
  private isRunning = false;
  private currentJob: Job | null = null;
  private stats: WorkerInfo;
  private processingTimeout: NodeJS.Timeout | null = null;

  constructor(
    id: number,
    queue: JobQueue,
    database: DatabaseConnection,
    handlerRegistry: HandlerRegistry,
    config: ProcessorConfig
  ) {
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

  public async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.stats.status = 'idle';
    
    logger.workerStarted(this.id);
    
    // Start processing loop
    this.processLoop().catch(error => {
      logger.error(`Worker ${this.id} processing loop failed`, error as Error, {
        operation: 'worker_loop_failed',
        workerId: this.id
      });
    });
  }

  public async stop(timeout: number = 10000): Promise<void> {
    if (!this.isRunning) return;

    logger.info(`Stopping worker ${this.id}`, {
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
        logger.warn(`Worker ${this.id} stopping with job still in progress`, {
          operation: 'worker_force_stop',
          workerId: this.id,
          metadata: { jobId: this.currentJob.id }
        });
      }
    }

    logger.workerStopped(this.id, this.stats.processed, this.stats.failed);
  }

  private async processLoop(): Promise<void> {
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
        
      } catch (error) {
        logger.error(`Worker ${this.id} processing error`, error as Error, {
          operation: 'worker_process_error',
          workerId: this.id
        });
        
        // Wait before retrying on error
        await this.sleep(Math.min(this.config.pollingInterval * 2, 5000));
      }
    }
  }

  private async processJob(job: Job): Promise<void> {
    this.currentJob = job;
    this.stats.status = 'processing';
    this.stats.currentJob = job.id;

    const jobLogger = withJobContext(job.id, this.id);
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

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      // Mark as failed
      await this.queue.failJob(job.id, errorMessage);
      
      // Persist metrics
      await this.database.persistJobMetrics(job.id, job.type, duration, false, errorMessage);

      // Update stats
      this.stats.failed++;
      jobLogger.jobFailed(job.id, job.type, error as Error, job.attempts + 1, job.maxAttempts, this.id);

    } finally {
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public isHealthy(): boolean {
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

  public getStats(): WorkerInfo {
    return { ...this.stats };
  }
}