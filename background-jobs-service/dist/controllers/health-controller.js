"use strict";
/**
 * Health Check Controller
 *
 * Provides comprehensive health monitoring endpoints:
 * - Overall service health
 * - Component-specific health checks
 * - Readiness and liveness probes
 * - Performance metrics
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const express_1 = require("express");
const connection_1 = require("../redis/connection");
const connection_2 = require("../db/connection");
const job_queue_1 = require("../redis/job-queue");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
class HealthController {
    constructor() {
        this.redisConnection = connection_1.RedisConnection.getInstance();
        this.databaseConnection = connection_2.DatabaseConnection.getInstance();
        this.jobQueue = new job_queue_1.JobQueue();
    }
    getRoutes() {
        const router = (0, express_1.Router)();
        // Health check endpoints
        router.get('/', this.healthCheck.bind(this));
        router.get('/detailed', this.detailedHealthCheck.bind(this));
        router.get('/ready', this.readinessCheck.bind(this));
        router.get('/live', this.livenessCheck.bind(this));
        // Component-specific health checks
        router.get('/redis', this.redisHealth.bind(this));
        router.get('/database', this.databaseHealth.bind(this));
        router.get('/queue', this.queueHealth.bind(this));
        // Detailed system information
        router.get('/info', this.systemInfo.bind(this));
        router.get('/metrics', this.healthMetrics.bind(this));
        router.get('/status', this.getServiceStatus.bind(this));
        return router;
    }
    async healthCheck(req, res) {
        try {
            const startTime = Date.now();
            // Basic health check - fast response
            const basicChecks = await Promise.allSettled([
                this.redisConnection.healthCheck(),
                this.databaseConnection.healthCheck()
            ]);
            const totalResponseTime = Date.now() - startTime;
            const redisOk = basicChecks[0].status === 'fulfilled';
            const databaseOk = basicChecks[1].status === 'fulfilled';
            const overallStatus = redisOk && databaseOk ? 'healthy' : 'unhealthy';
            const response = {
                status: overallStatus,
                timestamp: new Date().toISOString(),
                service: 'background-jobs-service',
                version: '1.0.0',
                uptime: process.uptime(),
                responseTime: totalResponseTime,
                checks: {
                    redis: redisOk,
                    database: databaseOk
                }
            };
            res.status(overallStatus === 'healthy' ? 200 : 503)
                .set('Cache-Control', 'no-cache, no-store, must-revalidate')
                .json(response);
        }
        catch (error) {
            logger_1.logger.error('Health check failed', error, {
                operation: 'health_check_error'
            });
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                service: 'background-jobs-service',
                error: 'Health check failed',
                details: error.message
            });
        }
    }
    async detailedHealthCheck(req, res) {
        try {
            const startTime = Date.now();
            // Perform all health checks in parallel
            const [redisHealth, databaseHealth, queueHealth] = await Promise.allSettled([
                this.redisConnection.healthCheck(),
                this.databaseConnection.healthCheck(),
                this.performQueueHealthCheck()
            ]);
            const totalResponseTime = Date.now() - startTime;
            // Aggregate results
            const components = {
                redis: this.getHealthResult(redisHealth),
                database: this.getHealthResult(databaseHealth),
                queue: this.getHealthResult(queueHealth)
            };
            // Determine overall health
            const overallStatus = this.determineOverallHealth(components);
            const response = {
                status: overallStatus,
                timestamp: new Date().toISOString(),
                service: 'background-jobs-service',
                version: '1.0.0',
                environment: config_1.configManager.getEnvironment(),
                responseTime: totalResponseTime,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                components
            };
            // Set appropriate HTTP status
            const httpStatus = overallStatus === 'healthy' ? 200 :
                overallStatus === 'degraded' ? 200 : 503;
            res.status(httpStatus)
                .set('Cache-Control', 'no-cache, no-store, must-revalidate')
                .json(response);
            // Log detailed health check
            logger_1.logger.debug('Detailed health check performed', {
                operation: 'detailed_health_check',
                metadata: {
                    status: overallStatus,
                    responseTime: totalResponseTime,
                    componentStatus: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, value.status]))
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Detailed health check failed', error, {
                operation: 'detailed_health_check_error'
            });
            res.status(503).json({
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                service: 'background-jobs-service',
                error: 'Detailed health check failed',
                details: error.message
            });
        }
    }
    async readinessCheck(req, res) {
        try {
            // Readiness check - can the service handle requests?
            const checks = await Promise.allSettled([
                this.redisConnection.healthCheck(),
                this.databaseConnection.healthCheck()
            ]);
            const redisReady = this.isComponentReady(this.getHealthResult(checks[0]));
            const databaseReady = this.isComponentReady(this.getHealthResult(checks[1]));
            const ready = redisReady && databaseReady;
            const response = {
                ready,
                timestamp: new Date().toISOString(),
                checks: {
                    redis: redisReady,
                    database: databaseReady
                }
            };
            res.status(ready ? 200 : 503)
                .set('Cache-Control', 'no-cache, no-store, must-revalidate')
                .json(response);
        }
        catch (error) {
            logger_1.logger.error('Readiness check failed', error, {
                operation: 'readiness_check_error'
            });
            res.status(503).json({
                ready: false,
                timestamp: new Date().toISOString(),
                error: 'Readiness check failed'
            });
        }
    }
    async livenessCheck(req, res) {
        try {
            // Liveness check - is the service alive and not deadlocked?
            const startTime = Date.now();
            const alive = await this.performLivenessChecks();
            const responseTime = Date.now() - startTime;
            const response = {
                alive,
                timestamp: new Date().toISOString(),
                responseTime,
                uptime: process.uptime(),
                memory: process.memoryUsage()
            };
            res.status(alive ? 200 : 503)
                .set('Cache-Control', 'no-cache, no-store, must-revalidate')
                .json(response);
        }
        catch (error) {
            logger_1.logger.error('Liveness check failed', error, {
                operation: 'liveness_check_error'
            });
            res.status(503).json({
                alive: false,
                timestamp: new Date().toISOString(),
                error: 'Liveness check failed'
            });
        }
    }
    async redisHealth(req, res) {
        try {
            const health = await this.redisConnection.healthCheck();
            const httpStatus = health.status === 'healthy' ? 200 :
                health.status === 'degraded' ? 200 : 503;
            res.status(httpStatus).json(health);
        }
        catch (error) {
            res.status(503).json({
                service: 'redis',
                status: 'unhealthy',
                timestamp: new Date(),
                error: error.message
            });
        }
    }
    async databaseHealth(req, res) {
        try {
            const health = await this.databaseConnection.healthCheck();
            const httpStatus = health.status === 'healthy' ? 200 :
                health.status === 'degraded' ? 200 : 503;
            res.status(httpStatus).json(health);
        }
        catch (error) {
            res.status(503).json({
                service: 'database',
                status: 'unhealthy',
                timestamp: new Date(),
                error: error.message
            });
        }
    }
    async queueHealth(req, res) {
        try {
            const health = await this.performQueueHealthCheck();
            const httpStatus = health.status === 'healthy' ? 200 :
                health.status === 'degraded' ? 200 : 503;
            res.status(httpStatus).json(health);
        }
        catch (error) {
            res.status(503).json({
                service: 'queue',
                status: 'unhealthy',
                timestamp: new Date(),
                error: error.message
            });
        }
    }
    async systemInfo(req, res) {
        try {
            const info = {
                service: {
                    name: 'background-jobs-service',
                    version: '1.0.0',
                    environment: config_1.configManager.getEnvironment(),
                    startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                    uptime: process.uptime()
                },
                system: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    architecture: process.arch,
                    memory: process.memoryUsage(),
                    cpuUsage: process.cpuUsage()
                },
                configuration: {
                    maxWorkers: config_1.configManager.getProcessorConfig().maxWorkers,
                    pollingInterval: config_1.configManager.getProcessorConfig().pollingInterval,
                    redisHost: config_1.configManager.getRedisConfig().host,
                    databaseHost: config_1.configManager.getDatabaseConfig().host
                },
                connections: {
                    redis: this.redisConnection.getConnectionInfo(),
                    database: this.databaseConnection.getConnectionInfo()
                }
            };
            res.json(info);
        }
        catch (error) {
            logger_1.logger.error('System info request failed', error, {
                operation: 'system_info_error'
            });
            res.status(500).json({
                error: 'Failed to retrieve system information',
                details: error.message
            });
        }
    }
    async healthMetrics(req, res) {
        try {
            const [queueStats, systemMetrics] = await Promise.allSettled([
                this.jobQueue.getQueueStats(),
                this.gatherSystemMetrics()
            ]);
            const response = {
                timestamp: new Date().toISOString(),
                queue: this.getResultValue(queueStats),
                system: this.getResultValue(systemMetrics),
                performance: {
                    memoryUsage: process.memoryUsage(),
                    cpuUsage: process.cpuUsage(),
                    uptime: process.uptime()
                }
            };
            res.json(response);
        }
        catch (error) {
            logger_1.logger.error('Health metrics request failed', error, {
                operation: 'health_metrics_error'
            });
            res.status(500).json({
                error: 'Failed to retrieve health metrics',
                details: error.message
            });
        }
    }
    // Helper methods
    async performQueueHealthCheck() {
        const result = {
            service: 'queue',
            status: 'unhealthy',
            timestamp: new Date()
        };
        try {
            const startTime = Date.now();
            const stats = await this.jobQueue.getQueueStats();
            const responseTime = Date.now() - startTime;
            // Determine health based on queue metrics
            const totalJobs = stats.total;
            const errorRate = stats.errorRate;
            const processingRate = stats.processingRate;
            let status = 'healthy';
            if (errorRate > 50 || (totalJobs > 10000 && processingRate < 10)) {
                status = 'unhealthy';
            }
            else if (errorRate > 20 || (totalJobs > 5000 && processingRate < 50)) {
                status = 'degraded';
            }
            result.status = status;
            result.details = {
                responseTime,
                queueSize: totalJobs,
                errorRate,
                processingRate,
                breakdown: {
                    pending: stats.pending,
                    processing: stats.processing,
                    completed: stats.completed,
                    failed: stats.failed
                }
            };
        }
        catch (error) {
            result.error = error.message;
            result.details = { available: false };
        }
        return result;
    }
    async performLivenessChecks() {
        // Simple liveness checks
        const checks = [
            // Memory check - ensure we're not using excessive memory
            this.checkMemoryUsage(),
            // Event loop check - ensure event loop is not blocked
            this.checkEventLoop(),
            // Basic functionality check
            this.checkBasicFunctionality()
        ];
        const results = await Promise.allSettled(checks);
        return results.every(result => result.status === 'fulfilled' && result.value === true);
    }
    async checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const maxMemory = 512 * 1024 * 1024; // 512MB threshold
        return memUsage.heapUsed < maxMemory;
    }
    async checkEventLoop() {
        return new Promise((resolve) => {
            const start = Date.now();
            setImmediate(() => {
                const lag = Date.now() - start;
                resolve(lag < 100); // Less than 100ms lag is acceptable
            });
        });
    }
    async checkBasicFunctionality() {
        try {
            // Test that we can generate a job ID (basic functionality)
            const testId = `test_${Date.now()}`;
            return testId.length > 0;
        }
        catch {
            return false;
        }
    }
    async gatherSystemMetrics() {
        return {
            timestamp: new Date().toISOString(),
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                cpuUsage: process.cpuUsage()
            },
            system: {
                platform: process.platform,
                nodeVersion: process.version,
                architecture: process.arch
            }
        };
    }
    getHealthResult(settledResult) {
        if (settledResult.status === 'fulfilled') {
            return settledResult.value;
        }
        else {
            return {
                service: 'unknown',
                status: 'unhealthy',
                timestamp: new Date(),
                error: settledResult.reason.message || 'Health check failed'
            };
        }
    }
    getResultValue(settledResult) {
        return settledResult.status === 'fulfilled' ? settledResult.value : null;
    }
    isComponentReady(health) {
        return health.status === 'healthy' || health.status === 'degraded';
    }
    determineOverallHealth(components) {
        const statuses = Object.values(components).map(c => c.status);
        if (statuses.includes('unhealthy')) {
            return 'unhealthy';
        }
        if (statuses.includes('degraded')) {
            return 'degraded';
        }
        return 'healthy';
    }
    async getServiceStatus(req, res) {
        try {
            const status = {
                service: {
                    name: 'background-jobs-service',
                    version: '1.0.0',
                    environment: config_1.configManager.getEnvironment(),
                    uptime: process.uptime(),
                    startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
                },
                system: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    architecture: process.arch,
                    pid: process.pid
                },
                memory: process.memoryUsage(),
                connections: {
                    redis: this.redisConnection.getConnectionInfo(),
                    database: this.databaseConnection.getConnectionInfo()
                },
                timestamp: new Date().toISOString()
            };
            res.json(status);
        }
        catch (error) {
            logger_1.logger.error('Service status request failed', error, {
                operation: 'service_status_error'
            });
            res.status(500).json({
                error: 'Failed to retrieve service status',
                details: error.message
            });
        }
    }
}
exports.HealthController = HealthController;
//# sourceMappingURL=health-controller.js.map