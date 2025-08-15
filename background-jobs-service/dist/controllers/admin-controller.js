"use strict";
/**
 * Admin Controller - REST API for Administrative Operations
 *
 * Provides HTTP endpoints for:
 * - Worker management and scaling
 * - Queue control operations
 * - System administration
 * - Performance monitoring
 * - Service configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const express_1 = require("express");
const job_queue_1 = require("../redis/job-queue");
const connection_1 = require("../db/connection");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
class AdminController {
    constructor(processor, queue) {
        this.processor = processor;
        this.queue = queue || new job_queue_1.JobQueue();
        this.database = connection_1.DatabaseConnection.getInstance();
    }
    getRoutes() {
        const router = (0, express_1.Router)();
        // Admin middleware for request logging and authentication
        router.use((req, res, next) => {
            const correlationId = (0, logger_1.generateCorrelationId)();
            req.headers['x-correlation-id'] = correlationId;
            res.setHeader('x-correlation-id', correlationId);
            const startTime = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                logger_1.logger.httpRequest(`ADMIN_${req.method}`, req.path, res.statusCode, duration, {
                    correlationId,
                    metadata: {
                        adminOperation: true,
                        userAgent: req.get('user-agent'),
                        ip: req.ip
                    }
                });
            });
            next();
        });
        // Authentication middleware placeholder
        router.use(this.authenticateAdmin.bind(this));
        // Worker management endpoints
        router.get('/workers', this.getWorkerStatus.bind(this));
        router.post('/workers/scale', this.scaleWorkerPool.bind(this));
        router.post('/workers/restart', this.restartWorkers.bind(this));
        router.delete('/workers/:workerId', this.stopWorker.bind(this));
        // Queue control endpoints
        router.post('/queue/pause', this.pauseQueue.bind(this));
        router.post('/queue/resume', this.resumeQueue.bind(this));
        router.post('/queue/clear', this.clearQueue.bind(this));
        router.post('/queue/purge', this.purgeFailedJobs.bind(this));
        // System administration endpoints
        router.get('/status', this.getSystemStatus.bind(this));
        router.post('/config/update', this.updateConfig.bind(this));
        router.post('/maintenance/enable', this.enableMaintenanceMode.bind(this));
        router.post('/maintenance/disable', this.disableMaintenanceMode.bind(this));
        // Performance monitoring endpoints
        router.get('/performance', this.getPerformanceMetrics.bind(this));
        router.post('/performance/reset', this.resetPerformanceMetrics.bind(this));
        router.get('/logs/recent', this.getRecentLogs.bind(this));
        return router;
    }
    async authenticateAdmin(req, res, next) {
        // Placeholder for admin authentication
        // In production, implement proper authentication/authorization
        const apiKey = req.headers['x-admin-api-key'];
        const expectedKey = process.env.ADMIN_API_KEY;
        if (!expectedKey) {
            // Skip authentication in development if no key is set
            if (process.env.NODE_ENV !== 'production') {
                next();
                return;
            }
            res.status(500).json({
                error: 'Admin API key not configured',
                correlationId: req.headers['x-correlation-id']
            });
            return;
        }
        if (!apiKey || apiKey !== expectedKey) {
            res.status(401).json({
                error: 'Unauthorized - Invalid admin API key',
                correlationId: req.headers['x-correlation-id']
            });
            return;
        }
        next();
    }
    async getWorkerStatus(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const processorStatus = this.processor.getStatus();
            const workers = await this.processor.getWorkerInfo();
            const systemLoad = await this.getSystemLoadMetrics();
            res.json({
                workers,
                summary: {
                    totalWorkers: workers.length,
                    activeWorkers: workers.filter(w => w.status === 'processing').length,
                    idleWorkers: workers.filter(w => w.status === 'idle').length,
                    stoppingWorkers: workers.filter(w => w.status === 'stopping').length
                },
                processor: processorStatus,
                systemLoad,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get worker status', error, {
                operation: 'get_worker_status_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to retrieve worker status',
                details: error.message,
                correlationId
            });
        }
    }
    async scaleWorkerPool(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { targetWorkers, reason } = req.body;
        try {
            if (!targetWorkers || targetWorkers < 0 || targetWorkers > 50) {
                res.status(400).json({
                    error: 'Invalid targetWorkers value. Must be between 0 and 50',
                    correlationId
                });
                return;
            }
            const currentWorkers = await this.processor.getWorkerInfo();
            const currentCount = currentWorkers.length;
            if (targetWorkers === currentCount) {
                res.json({
                    message: 'Worker pool already at target size',
                    currentWorkers: currentCount,
                    targetWorkers,
                    correlationId
                });
                return;
            }
            const operation = targetWorkers > currentCount ? 'scale_up' : 'scale_down';
            const difference = Math.abs(targetWorkers - currentCount);
            // Perform scaling operation
            await this.processor.scaleWorkers(targetWorkers);
            logger_1.logger.info(`Worker pool scaled via admin API`, {
                operation: 'worker_pool_scaled',
                correlationId,
                metadata: {
                    from: currentCount,
                    to: targetWorkers,
                    difference,
                    operation,
                    reason
                }
            });
            res.json({
                message: `Worker pool ${operation} completed`,
                previousWorkers: currentCount,
                currentWorkers: targetWorkers,
                operation,
                difference,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to scale worker pool', error, {
                operation: 'scale_worker_pool_error',
                correlationId,
                metadata: { targetWorkers }
            });
            res.status(500).json({
                error: 'Failed to scale worker pool',
                details: error.message,
                correlationId
            });
        }
    }
    async restartWorkers(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { graceful = true, timeout = 30000 } = req.body;
        try {
            const workersBefore = await this.processor.getWorkerInfo();
            await this.processor.restartWorkers({ graceful, timeout });
            const workersAfter = await this.processor.getWorkerInfo();
            logger_1.logger.info('Workers restarted via admin API', {
                operation: 'workers_restarted',
                correlationId,
                metadata: {
                    beforeCount: workersBefore.length,
                    afterCount: workersAfter.length,
                    graceful,
                    timeout
                }
            });
            res.json({
                message: 'Workers restarted successfully',
                workersBefore: workersBefore.length,
                workersAfter: workersAfter.length,
                restartType: graceful ? 'graceful' : 'forced',
                timeout,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to restart workers', error, {
                operation: 'restart_workers_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to restart workers',
                details: error.message,
                correlationId
            });
        }
    }
    async stopWorker(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { workerId } = req.params;
        const { graceful = true, timeout = 10000 } = req.body;
        try {
            const workerIdNum = parseInt(workerId);
            if (isNaN(workerIdNum)) {
                res.status(400).json({
                    error: 'Invalid worker ID',
                    correlationId
                });
                return;
            }
            const success = await this.processor.stopWorker(workerIdNum, { graceful, timeout });
            if (!success) {
                res.status(404).json({
                    error: 'Worker not found or already stopped',
                    workerId: workerIdNum,
                    correlationId
                });
                return;
            }
            logger_1.logger.info('Worker stopped via admin API', {
                operation: 'worker_stopped',
                correlationId,
                metadata: { workerId: workerIdNum, graceful, timeout }
            });
            res.json({
                message: 'Worker stopped successfully',
                workerId: workerIdNum,
                graceful,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to stop worker', error, {
                operation: 'stop_worker_error',
                correlationId,
                metadata: { workerId }
            });
            res.status(500).json({
                error: 'Failed to stop worker',
                details: error.message,
                correlationId
            });
        }
    }
    async pauseQueue(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { reason } = req.body;
        try {
            await this.queue.pause();
            logger_1.logger.info('Queue paused via admin API', {
                operation: 'queue_paused',
                correlationId,
                metadata: { reason }
            });
            res.json({
                message: 'Queue processing paused',
                reason,
                timestamp: new Date().toISOString(),
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to pause queue', error, {
                operation: 'pause_queue_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to pause queue',
                details: error.message,
                correlationId
            });
        }
    }
    async resumeQueue(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            await this.queue.resume();
            logger_1.logger.info('Queue resumed via admin API', {
                operation: 'queue_resumed',
                correlationId
            });
            res.json({
                message: 'Queue processing resumed',
                timestamp: new Date().toISOString(),
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to resume queue', error, {
                operation: 'resume_queue_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to resume queue',
                details: error.message,
                correlationId
            });
        }
    }
    async clearQueue(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { statuses = ['failed'], confirm = false } = req.body;
        try {
            if (!confirm) {
                res.status(400).json({
                    error: 'Confirmation required. Set confirm: true to proceed',
                    warning: 'This operation will permanently delete jobs',
                    correlationId
                });
                return;
            }
            const clearedJobs = await this.queue.clearJobs(statuses);
            logger_1.logger.warning('Queue cleared via admin API', {
                operation: 'queue_cleared',
                correlationId,
                metadata: { clearedJobs, statuses }
            });
            res.json({
                message: 'Queue cleared successfully',
                clearedJobs,
                statuses,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to clear queue', error, {
                operation: 'clear_queue_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to clear queue',
                details: error.message,
                correlationId
            });
        }
    }
    async purgeFailedJobs(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { maxAge = 7 * 24 * 60 * 60 * 1000, confirm = false } = req.body;
        try {
            if (!confirm) {
                res.status(400).json({
                    error: 'Confirmation required. Set confirm: true to proceed',
                    warning: 'This operation will permanently delete failed jobs',
                    correlationId
                });
                return;
            }
            const purgedJobs = await this.queue.purgeFailedJobs(maxAge);
            logger_1.logger.warning('Failed jobs purged via admin API', {
                operation: 'failed_jobs_purged',
                correlationId,
                metadata: { purgedJobs, maxAge }
            });
            res.json({
                message: 'Failed jobs purged successfully',
                purgedJobs,
                maxAge,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to purge jobs', error, {
                operation: 'purge_failed_jobs_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to purge failed jobs',
                details: error.message,
                correlationId
            });
        }
    }
    async getSystemStatus(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const [processorStatus, queueStats, workerInfo, systemHealth] = await Promise.allSettled([
                this.processor.getStatus(),
                this.queue.getQueueStats(),
                this.processor.getWorkerInfo(),
                this.getSystemHealth()
            ]);
            const status = {
                service: {
                    name: 'background-jobs-service',
                    version: '1.0.0',
                    uptime: process.uptime(),
                    environment: config_1.configManager.getEnvironment(),
                    startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
                },
                processor: this.getSettledValue(processorStatus),
                queue: this.getSettledValue(queueStats),
                workers: this.getSettledValue(workerInfo),
                health: this.getSettledValue(systemHealth),
                timestamp: new Date().toISOString(),
                correlationId
            };
            res.json(status);
        }
        catch (error) {
            logger_1.logger.error('Failed to get system status', error, {
                operation: 'get_system_status_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to retrieve system status',
                details: error.message,
                correlationId
            });
        }
    }
    async updateConfig(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { config, restart = false } = req.body;
        try {
            // Validate configuration update
            if (!config || typeof config !== 'object') {
                res.status(400).json({
                    error: 'Invalid configuration object',
                    correlationId
                });
                return;
            }
            // Apply configuration changes
            await config_1.configManager.updateConfig(config);
            logger_1.logger.info('Configuration updated via admin API', {
                operation: 'config_updated',
                correlationId,
                metadata: { config, restart }
            });
            if (restart) {
                // Restart processor to apply new configuration
                await this.processor.restart();
            }
            res.json({
                message: 'Configuration updated successfully',
                config,
                restart,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to update configuration', error, {
                operation: 'update_config_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to update configuration',
                details: error.message,
                correlationId
            });
        }
    }
    async enableMaintenanceMode(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { message, allowNewJobs = false } = req.body;
        try {
            await this.processor.enableMaintenanceMode({ message, allowNewJobs });
            logger_1.logger.info('Maintenance mode enabled via admin API', {
                operation: 'maintenance_mode_enabled',
                correlationId,
                metadata: { message, allowNewJobs }
            });
            res.json({
                message: 'Maintenance mode enabled',
                maintenanceMessage: message,
                allowNewJobs,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to enable maintenance mode', error, {
                operation: 'enable_maintenance_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to enable maintenance mode',
                details: error.message,
                correlationId
            });
        }
    }
    async disableMaintenanceMode(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            await this.processor.disableMaintenanceMode();
            logger_1.logger.info('Maintenance mode disabled via admin API', {
                operation: 'maintenance_mode_disabled',
                correlationId
            });
            res.json({
                message: 'Maintenance mode disabled',
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to disable maintenance mode', error, {
                operation: 'disable_maintenance_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to disable maintenance mode',
                details: error.message,
                correlationId
            });
        }
    }
    async getPerformanceMetrics(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const metrics = {
                system: {
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    cpuUsage: process.cpuUsage()
                },
                processor: await this.processor.getPerformanceMetrics(),
                queue: await this.queue.getPerformanceMetrics(),
                handlers: this.processor.getHandlerRegistry().getAllMetrics(),
                timestamp: new Date().toISOString(),
                correlationId
            };
            res.json(metrics);
        }
        catch (error) {
            logger_1.logger.error('Failed to get performance metrics', error, {
                operation: 'get_performance_metrics_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to retrieve performance metrics',
                details: error.message,
                correlationId
            });
        }
    }
    async resetPerformanceMetrics(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            await this.processor.resetMetrics();
            await this.queue.resetMetrics();
            logger_1.logger.info('Performance metrics reset via admin API', {
                operation: 'performance_metrics_reset',
                correlationId
            });
            res.json({
                message: 'Performance metrics reset successfully',
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to reset performance metrics', error, {
                operation: 'reset_performance_metrics_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to reset performance metrics',
                details: error.message,
                correlationId
            });
        }
    }
    async getRecentLogs(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { limit = 100, level, operation } = req.query;
        try {
            const logs = await logger_1.logger.getRecentLogs({
                limit: parseInt(limit),
                level: level,
                operation: operation
            });
            res.json({
                logs,
                filters: { limit, level, operation },
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get recent logs', error, {
                operation: 'get_recent_logs_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to retrieve recent logs',
                details: error.message,
                correlationId
            });
        }
    }
    // Helper methods
    async getSystemLoadMetrics() {
        return {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpuUsage: process.cpuUsage(),
            platform: process.platform,
            nodeVersion: process.version
        };
    }
    async getSystemHealth() {
        const [redisHealth, dbHealth] = await Promise.allSettled([
            this.queue.healthCheck(),
            this.database.healthCheck()
        ]);
        return {
            redis: this.getSettledValue(redisHealth),
            database: this.getSettledValue(dbHealth),
            overall: this.determineOverallHealth([redisHealth, dbHealth])
        };
    }
    getSettledValue(result) {
        return result.status === 'fulfilled' ? result.value : null;
    }
    determineOverallHealth(results) {
        const fulfilled = results.filter(r => r.status === 'fulfilled');
        if (fulfilled.length === results.length)
            return 'healthy';
        if (fulfilled.length > 0)
            return 'degraded';
        return 'unhealthy';
    }
}
exports.AdminController = AdminController;
//# sourceMappingURL=admin-controller.js.map