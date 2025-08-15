"use strict";
/**
 * Job Controller - REST API for Job Management
 *
 * Provides HTTP endpoints for:
 * - Job submission (single and bulk)
 * - Job status monitoring
 * - Job cancellation
 * - Queue statistics
 * - Job history and search
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobController = void 0;
const express_1 = require("express");
const job_queue_1 = require("../redis/job-queue");
const connection_1 = require("../db/connection");
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
const rate_limiter_1 = require("../utils/rate-limiter");
class JobController {
    constructor(queue, database) {
        this.queue = queue || new job_queue_1.JobQueue();
        this.database = database || connection_1.DatabaseConnection.getInstance();
        this.rateLimiter = new rate_limiter_1.RateLimiter();
    }
    getRoutes() {
        const router = (0, express_1.Router)();
        // Middleware for request logging
        router.use((req, res, next) => {
            const correlationId = (0, logger_1.generateCorrelationId)();
            req.headers['x-correlation-id'] = correlationId;
            res.setHeader('x-correlation-id', correlationId);
            const startTime = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - startTime;
                logger_1.logger.httpRequest(req.method, req.path, res.statusCode, duration, {
                    correlationId,
                    metadata: { userAgent: req.get('user-agent') }
                });
            });
            next();
        });
        // Content-Type validation
        router.use(validation_1.requireJsonContent);
        // Request size validation
        router.use((0, validation_1.validateRequestSize)(10 * 1024 * 1024)); // 10MB limit
        // General rate limiting
        router.use(this.rateLimiter.createGeneralLimiter(1000)); // 1000 requests per minute
        // Job submission endpoints
        router.post('/submit', this.rateLimiter.createJobSubmissionLimiter(100), (0, validation_1.validateRequest)(validation_1.schemas.jobSubmission), this.submitJob.bind(this));
        router.post('/bulk', this.rateLimiter.createBulkJobSubmissionLimiter(10), (0, validation_1.validateRequest)(validation_1.schemas.bulkJobSubmission), this.submitBulkJobs.bind(this));
        // Job monitoring endpoints
        router.get('/:jobId', validation_1.validateJobId, this.getJob.bind(this));
        router.get('/:jobId/result', validation_1.validateJobId, this.getJobResult.bind(this));
        router.get('/', (0, validation_1.validateRequest)(validation_1.schemas.jobQuery, 'query'), this.listJobs.bind(this));
        // Job management endpoints
        router.delete('/:jobId', validation_1.validateJobId, this.cancelJob.bind(this));
        router.post('/cleanup', (0, validation_1.validateRequest)(validation_1.schemas.jobCleanup), this.cleanupJobs.bind(this));
        // Queue information endpoints
        router.get('/stats/queue', this.getQueueStats.bind(this));
        router.get('/stats/metrics', this.getJobMetrics.bind(this));
        return router;
    }
    async submitJob(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const jobRequest = req.body;
            // Validation is already done by middleware
            const options = {
                priority: jobRequest.options?.priority || types_1.JobPriority.MEDIUM,
                attempts: jobRequest.options?.attempts || 3,
                delay: jobRequest.options?.delay || 0,
                timeout: jobRequest.options?.timeout || 300000,
                ...jobRequest.options
            };
            // Submit job
            const jobId = await this.queue.addJob(jobRequest.type, jobRequest.data, options);
            // Estimate completion time based on queue size and priority
            const estimatedCompletion = await this.estimateCompletionTime(options.priority, options.delay);
            logger_1.logger.info('Job submitted via API', {
                operation: 'job_submit_api',
                correlationId,
                metadata: {
                    jobId,
                    type: jobRequest.type,
                    priority: options.priority
                }
            });
            res.status(201).json({
                jobId,
                status: options.delay > 0 ? types_1.JobStatus.DELAYED : types_1.JobStatus.PENDING,
                message: 'Job submitted successfully',
                estimatedCompletion,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Job submission failed', error, {
                operation: 'job_submit_api_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to submit job',
                details: error.message,
                correlationId
            });
        }
    }
    async submitBulkJobs(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const bulkRequest = req.body;
            // Validation is already done by middleware
            const jobIds = [];
            const failedJobs = [];
            // Process jobs in parallel with concurrency control
            const concurrencyLimit = 10;
            const chunks = [];
            for (let i = 0; i < bulkRequest.jobs.length; i += concurrencyLimit) {
                chunks.push(bulkRequest.jobs.slice(i, i + concurrencyLimit));
            }
            for (const chunk of chunks) {
                const chunkPromises = chunk.map(async (jobRequest, index) => {
                    try {
                        const options = {
                            priority: jobRequest.options?.priority || types_1.JobPriority.MEDIUM,
                            attempts: jobRequest.options?.attempts || 3,
                            delay: jobRequest.options?.delay || 0,
                            timeout: jobRequest.options?.timeout || 300000,
                            ...jobRequest.options
                        };
                        const jobId = await this.queue.addJob(jobRequest.type, jobRequest.data, options);
                        return { success: true, jobId, index: index + jobIds.length + failedJobs.length };
                    }
                    catch (error) {
                        return {
                            success: false,
                            error: error.message,
                            index: index + jobIds.length + failedJobs.length
                        };
                    }
                });
                const chunkResults = await Promise.all(chunkPromises);
                for (const result of chunkResults) {
                    if (result.success) {
                        jobIds.push(result.jobId);
                    }
                    else {
                        failedJobs.push({
                            index: result.index,
                            error: result.error
                        });
                    }
                }
            }
            logger_1.logger.info('Bulk jobs submitted via API', {
                operation: 'bulk_job_submit_api',
                correlationId,
                metadata: {
                    totalRequested: bulkRequest.jobs.length,
                    successful: jobIds.length,
                    failed: failedJobs.length
                }
            });
            const response = {
                jobIds,
                count: jobIds.length,
                message: `${jobIds.length} jobs submitted successfully`,
                correlationId
            };
            if (failedJobs.length > 0) {
                response.failedJobs = failedJobs;
                response.message += `, ${failedJobs.length} jobs failed`;
            }
            res.status(201).json(response);
        }
        catch (error) {
            logger_1.logger.error('Bulk job submission failed', error, {
                operation: 'bulk_job_submit_api_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to submit bulk jobs',
                details: error.message,
                correlationId
            });
        }
    }
    async getJob(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { jobId } = req.params;
        try {
            const job = await this.queue.getJob(jobId);
            if (!job) {
                res.status(404).json({
                    error: 'Job not found',
                    jobId,
                    correlationId
                });
                return;
            }
            res.json({
                ...job,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get job', error, {
                operation: 'get_job_api_error',
                correlationId,
                metadata: { jobId }
            });
            res.status(500).json({
                error: 'Failed to retrieve job',
                details: error.message,
                correlationId
            });
        }
    }
    async getJobResult(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { jobId } = req.params;
        try {
            const result = await this.database.getJobResult(jobId);
            if (!result) {
                res.status(404).json({
                    error: 'Job result not found',
                    jobId,
                    correlationId
                });
                return;
            }
            res.json({
                jobId,
                result,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get job result', error, {
                operation: 'get_job_result_api_error',
                correlationId,
                metadata: { jobId }
            });
            res.status(500).json({
                error: 'Failed to retrieve job result',
                details: error.message,
                correlationId
            });
        }
    }
    async listJobs(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const options = {
                status: req.query.status ? this.parseStatusFilter(req.query.status) : undefined,
                type: req.query.type,
                limit: parseInt(req.query.limit) || 50,
                offset: parseInt(req.query.offset) || 0,
                sortBy: req.query.sortBy || 'createdAt',
                sortOrder: req.query.sortOrder || 'desc'
            };
            // Validate limits
            if (options.limit > 1000) {
                res.status(400).json({
                    error: 'Limit cannot exceed 1000',
                    correlationId
                });
                return;
            }
            // This would typically query the database or Redis
            // For now, return mock response structure
            const jobs = await this.queryJobs(options);
            const total = await this.countJobs(options);
            res.json({
                jobs,
                pagination: {
                    limit: options.limit,
                    offset: options.offset,
                    total,
                    hasMore: (options.offset + options.limit) < total
                },
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to list jobs', error, {
                operation: 'list_jobs_api_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to list jobs',
                details: error.message,
                correlationId
            });
        }
    }
    async cancelJob(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        const { jobId } = req.params;
        try {
            const cancelled = await this.queue.cancelJob(jobId);
            if (!cancelled) {
                const job = await this.queue.getJob(jobId);
                const message = !job
                    ? 'Job not found'
                    : `Job cannot be cancelled (status: ${job.status})`;
                res.status(400).json({
                    error: message,
                    jobId,
                    correlationId
                });
                return;
            }
            logger_1.logger.info('Job cancelled via API', {
                operation: 'job_cancel_api',
                correlationId,
                metadata: { jobId }
            });
            res.json({
                message: 'Job cancelled successfully',
                jobId,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to cancel job', error, {
                operation: 'cancel_job_api_error',
                correlationId,
                metadata: { jobId }
            });
            res.status(500).json({
                error: 'Failed to cancel job',
                details: error.message,
                correlationId
            });
        }
    }
    async cleanupJobs(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const { maxAge, dryRun = false } = req.body;
            const maxAgeMs = maxAge || 7 * 24 * 60 * 60 * 1000; // 7 days default
            if (!dryRun) {
                const deletedJobs = await this.queue.cleanupOldJobs(maxAgeMs);
                const deletedResults = await this.database.cleanupOldJobResults(maxAgeMs);
                logger_1.logger.info('Job cleanup completed via API', {
                    operation: 'job_cleanup_api',
                    correlationId,
                    metadata: { deletedJobs, deletedResults, maxAgeMs }
                });
                res.json({
                    message: 'Cleanup completed successfully',
                    deletedJobs,
                    deletedResults,
                    correlationId
                });
            }
            else {
                // Dry run - estimate what would be deleted
                res.json({
                    message: 'Dry run completed',
                    estimatedDeletions: {
                        jobs: 'N/A - not implemented in this demo',
                        results: 'N/A - not implemented in this demo'
                    },
                    correlationId
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Job cleanup failed', error, {
                operation: 'job_cleanup_api_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to cleanup jobs',
                details: error.message,
                correlationId
            });
        }
    }
    async getQueueStats(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const stats = await this.queue.getQueueStats();
            res.json({
                ...stats,
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get queue stats', error, {
                operation: 'queue_stats_api_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to retrieve queue statistics',
                details: error.message,
                correlationId
            });
        }
    }
    async getJobMetrics(req, res) {
        const correlationId = req.headers['x-correlation-id'];
        try {
            const { startDate, endDate, jobType } = req.query;
            const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
            const end = endDate ? new Date(endDate) : new Date();
            const metrics = await this.database.getJobMetrics(start, end, jobType);
            res.json({
                metrics,
                period: {
                    startDate: start.toISOString(),
                    endDate: end.toISOString()
                },
                correlationId
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get job metrics', error, {
                operation: 'job_metrics_api_error',
                correlationId
            });
            res.status(500).json({
                error: 'Failed to retrieve job metrics',
                details: error.message,
                correlationId
            });
        }
    }
    // Helper methods
    parseStatusFilter(status) {
        const statuses = status.split(',').map(s => s.trim());
        return statuses.length === 1 ? statuses[0] : statuses;
    }
    async estimateCompletionTime(priority, delay) {
        // Simple estimation based on queue size and priority
        const stats = await this.queue.getQueueStats();
        const queuePosition = this.estimateQueuePosition(priority, stats.pending);
        const avgProcessingTime = stats.averageProcessingTime || 30000; // 30 seconds default
        const estimatedWaitTime = queuePosition * avgProcessingTime + delay;
        return new Date(Date.now() + estimatedWaitTime);
    }
    estimateQueuePosition(priority, totalPending) {
        // Rough estimation based on priority
        const priorityMultipliers = {
            [types_1.JobPriority.HIGH]: 0.1,
            [types_1.JobPriority.MEDIUM]: 0.5,
            [types_1.JobPriority.LOW]: 0.9
        };
        return Math.floor(totalPending * (priorityMultipliers[priority] || 0.5));
    }
    async queryJobs(options) {
        // This would normally query Redis or database
        // Return mock data for demo purposes
        return [
            {
                id: 'job_demo_1',
                type: 'collect-stablecoin-data',
                status: types_1.JobStatus.COMPLETED,
                createdAt: new Date(),
                completedAt: new Date()
            }
        ];
    }
    async countJobs(options) {
        // This would normally count matching jobs
        return 1;
    }
}
exports.JobController = JobController;
//# sourceMappingURL=job-controller.js.map