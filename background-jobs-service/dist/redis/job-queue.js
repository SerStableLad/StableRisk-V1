"use strict";
/**
 * Redis-based Job Queue Implementation
 *
 * Features:
 * - Priority-based job processing using sorted sets
 * - Delayed job scheduling with promotion
 * - Atomic operations for job state transitions
 * - Exponential backoff retry logic
 * - Job timeout and cleanup management
 * - Comprehensive queue statistics
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobQueue = void 0;
const connection_1 = require("./connection");
const types_1 = require("../types");
class JobQueue {
    constructor(queueName = 'stablerisk:jobs') {
        this.queueName = queueName;
        this.connection = connection_1.RedisConnection.getInstance();
        this.redis = this.connection.getClient();
    }
    /**
     * Add a new job to the queue
     */
    async addJob(type, data, options = {}) {
        const jobId = this.generateJobId();
        const priority = options.priority || types_1.JobPriority.MEDIUM;
        const maxAttempts = options.attempts || 3;
        const delay = options.delay || 0;
        const job = {
            id: jobId,
            type,
            data,
            options,
            createdAt: new Date(),
            scheduledFor: new Date(Date.now() + delay),
            attempts: 0,
            maxAttempts,
            status: delay > 0 ? types_1.JobStatus.DELAYED : types_1.JobStatus.PENDING,
            timeoutAt: options.timeout ? new Date(Date.now() + options.timeout) : undefined
        };
        try {
            await this.connection.safeExecute(async () => {
                const pipeline = this.connection.createPipeline();
                // Store job data
                pipeline.hset(`${this.queueName}:jobs`, jobId, JSON.stringify(job));
                // Add to appropriate queue based on delay
                if (delay > 0) {
                    pipeline.zadd(`${this.queueName}:delayed`, Date.now() + delay, jobId);
                }
                else {
                    const priorityScore = this.getPriorityScore(priority, Date.now());
                    pipeline.zadd(`${this.queueName}:pending`, priorityScore, jobId);
                }
                // Update queue statistics
                pipeline.hincrby(`${this.queueName}:stats`, 'total', 1);
                pipeline.hincrby(`${this.queueName}:stats`, job.status, 1);
                pipeline.hset(`${this.queueName}:stats`, 'lastAdded', Date.now());
                await this.connection.executePipeline(pipeline);
            });
            console.log(`[JobQueue] Added job ${jobId} (type: ${type}, priority: ${priority})`);
            return jobId;
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to add job: ${error.message}`, 'addJob', error);
        }
    }
    /**
     * Get the next job to process
     */
    async getNextJob() {
        try {
            return await this.connection.safeExecute(async () => {
                // First, promote any ready delayed jobs
                await this.promoteDelayedJobs();
                // Get highest priority pending job atomically
                const transaction = this.connection.createTransaction();
                // Check for available jobs
                const availableJobs = await this.redis.zrange(`${this.queueName}:pending`, 0, 0);
                if (availableJobs.length === 0) {
                    return null;
                }
                const jobId = availableJobs[0];
                // Atomically move job from pending to processing
                transaction.zrem(`${this.queueName}:pending`, jobId);
                const processingTimeout = 30 * 60 * 1000; // 30 minutes
                transaction.zadd(`${this.queueName}:processing`, Date.now() + processingTimeout, jobId);
                // Update statistics
                transaction.hincrby(`${this.queueName}:stats`, 'pending', -1);
                transaction.hincrby(`${this.queueName}:stats`, 'processing', 1);
                const results = await this.connection.executeTransaction(transaction);
                // If transaction failed, job was already taken
                if (results === null || results[0][0] !== null) {
                    return null;
                }
                // Get job data and update status
                const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
                if (!jobData) {
                    // Cleanup orphaned job reference
                    await this.redis.zrem(`${this.queueName}:processing`, jobId);
                    return null;
                }
                const job = JSON.parse(jobData);
                job.status = types_1.JobStatus.PROCESSING;
                job.processingStartedAt = new Date();
                // Update job in storage
                await this.redis.hset(`${this.queueName}:jobs`, jobId, JSON.stringify(job));
                return job;
            });
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to get next job: ${error.message}`, 'getNextJob', error);
        }
    }
    /**
     * Mark job as completed
     */
    async completeJob(jobId, result) {
        try {
            await this.connection.safeExecute(async () => {
                const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
                if (!jobData) {
                    throw new types_1.JobError(`Job not found: ${jobId}`, jobId);
                }
                const job = JSON.parse(jobData);
                job.status = types_1.JobStatus.COMPLETED;
                job.result = result;
                job.completedAt = new Date();
                job.processingTimeMs = job.processingStartedAt
                    ? Date.now() - job.processingStartedAt.getTime()
                    : undefined;
                const pipeline = this.connection.createPipeline();
                // Update job data
                pipeline.hset(`${this.queueName}:jobs`, jobId, JSON.stringify(job));
                // Remove from processing queue
                pipeline.zrem(`${this.queueName}:processing`, jobId);
                // Add to completed queue with TTL
                pipeline.zadd(`${this.queueName}:completed`, Date.now(), jobId);
                // Update statistics
                pipeline.hincrby(`${this.queueName}:stats`, 'processing', -1);
                pipeline.hincrby(`${this.queueName}:stats`, 'completed', 1);
                pipeline.hset(`${this.queueName}:stats`, 'lastProcessed', Date.now());
                await this.connection.executePipeline(pipeline);
                // Set TTL on completed jobs (7 days)
                await this.redis.expire(`${this.queueName}:completed`, 7 * 24 * 3600);
            });
            console.log(`[JobQueue] Job ${jobId} completed successfully`);
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to complete job: ${error.message}`, 'completeJob', error);
        }
    }
    /**
     * Mark job as failed and handle retry logic
     */
    async failJob(jobId, error) {
        try {
            await this.connection.safeExecute(async () => {
                const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
                if (!jobData) {
                    throw new types_1.JobError(`Job not found: ${jobId}`, jobId);
                }
                const job = JSON.parse(jobData);
                job.attempts++;
                job.error = error;
                job.processingTimeMs = job.processingStartedAt
                    ? Date.now() - job.processingStartedAt.getTime()
                    : undefined;
                const pipeline = this.connection.createPipeline();
                // Remove from processing queue
                pipeline.zrem(`${this.queueName}:processing`, jobId);
                pipeline.hincrby(`${this.queueName}:stats`, 'processing', -1);
                // Check if we should retry
                if (job.attempts < job.maxAttempts) {
                    // Calculate backoff delay
                    const delay = this.calculateBackoffDelay(job);
                    job.status = types_1.JobStatus.DELAYED;
                    job.scheduledFor = new Date(Date.now() + delay);
                    // Add back to delayed queue
                    pipeline.zadd(`${this.queueName}:delayed`, Date.now() + delay, jobId);
                    pipeline.hincrby(`${this.queueName}:stats`, 'delayed', 1);
                    console.log(`[JobQueue] Job ${jobId} scheduled for retry in ${delay}ms (attempt ${job.attempts}/${job.maxAttempts})`);
                }
                else {
                    // All attempts exhausted
                    job.status = types_1.JobStatus.FAILED;
                    job.completedAt = new Date();
                    // Add to failed queue
                    pipeline.zadd(`${this.queueName}:failed`, Date.now(), jobId);
                    pipeline.hincrby(`${this.queueName}:stats`, 'failed', 1);
                    console.error(`[JobQueue] Job ${jobId} failed after ${job.attempts} attempts: ${error}`);
                }
                // Update job data
                pipeline.hset(`${this.queueName}:jobs`, jobId, JSON.stringify(job));
                await this.connection.executePipeline(pipeline);
            });
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to fail job: ${error.message}`, 'failJob', error);
        }
    }
    /**
     * Cancel a pending or delayed job
     */
    async cancelJob(jobId) {
        try {
            return await this.connection.safeExecute(async () => {
                const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
                if (!jobData) {
                    return false;
                }
                const job = JSON.parse(jobData);
                // Can only cancel pending or delayed jobs
                if (job.status !== types_1.JobStatus.PENDING && job.status !== types_1.JobStatus.DELAYED) {
                    return false;
                }
                const pipeline = this.connection.createPipeline();
                // Remove from appropriate queue
                if (job.status === types_1.JobStatus.PENDING) {
                    pipeline.zrem(`${this.queueName}:pending`, jobId);
                    pipeline.hincrby(`${this.queueName}:stats`, 'pending', -1);
                }
                else {
                    pipeline.zrem(`${this.queueName}:delayed`, jobId);
                    pipeline.hincrby(`${this.queueName}:stats`, 'delayed', -1);
                }
                // Update job status
                job.status = types_1.JobStatus.CANCELLED;
                job.completedAt = new Date();
                pipeline.hset(`${this.queueName}:jobs`, jobId, JSON.stringify(job));
                pipeline.hincrby(`${this.queueName}:stats`, 'cancelled', 1);
                await this.connection.executePipeline(pipeline);
                console.log(`[JobQueue] Job ${jobId} cancelled`);
                return true;
            });
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to cancel job: ${error.message}`, 'cancelJob', error);
        }
    }
    /**
     * Get job by ID
     */
    async getJob(jobId) {
        try {
            return await this.connection.safeExecute(async () => {
                const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
                return jobData ? JSON.parse(jobData) : null;
            });
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to get job: ${error.message}`, 'getJob', error);
        }
    }
    /**
     * Promote delayed jobs that are ready to be processed
     */
    async promoteDelayedJobs() {
        try {
            return await this.connection.safeExecute(async () => {
                const now = Date.now();
                const readyJobs = await this.redis.zrangebyscore(`${this.queueName}:delayed`, '-inf', now);
                if (readyJobs.length === 0) {
                    return 0;
                }
                const pipeline = this.connection.createPipeline();
                for (const jobId of readyJobs) {
                    // Get job data to determine priority
                    const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
                    if (!jobData) {
                        // Cleanup orphaned job reference
                        pipeline.zrem(`${this.queueName}:delayed`, jobId);
                        continue;
                    }
                    const job = JSON.parse(jobData);
                    job.status = types_1.JobStatus.PENDING;
                    // Move from delayed to pending
                    pipeline.zrem(`${this.queueName}:delayed`, jobId);
                    const priorityScore = this.getPriorityScore(job.options.priority || types_1.JobPriority.MEDIUM, Date.now());
                    pipeline.zadd(`${this.queueName}:pending`, priorityScore, jobId);
                    // Update job data
                    pipeline.hset(`${this.queueName}:jobs`, jobId, JSON.stringify(job));
                }
                // Update statistics
                pipeline.hincrby(`${this.queueName}:stats`, 'delayed', -readyJobs.length);
                pipeline.hincrby(`${this.queueName}:stats`, 'pending', readyJobs.length);
                await this.connection.executePipeline(pipeline);
                if (readyJobs.length > 0) {
                    console.log(`[JobQueue] Promoted ${readyJobs.length} delayed jobs to pending`);
                }
                return readyJobs.length;
            });
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to promote delayed jobs: ${error.message}`, 'promoteDelayedJobs', error);
        }
    }
    /**
     * Clean up stale processing jobs (timed out)
     */
    async cleanupStaleJobs() {
        try {
            return await this.connection.safeExecute(async () => {
                const now = Date.now();
                const staleJobs = await this.redis.zrangebyscore(`${this.queueName}:processing`, '-inf', now);
                if (staleJobs.length === 0) {
                    return 0;
                }
                const pipeline = this.connection.createPipeline();
                let cleanedUp = 0;
                for (const jobId of staleJobs) {
                    const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
                    if (!jobData) {
                        pipeline.zrem(`${this.queueName}:processing`, jobId);
                        cleanedUp++;
                        continue;
                    }
                    const job = JSON.parse(jobData);
                    // Check if job has custom timeout
                    const jobTimeout = job.timeoutAt ? job.timeoutAt.getTime() : now;
                    if (jobTimeout > now) {
                        continue; // Job is not actually stale
                    }
                    // Mark as failed due to timeout
                    job.status = types_1.JobStatus.FAILED;
                    job.error = 'Job timed out';
                    job.completedAt = new Date();
                    pipeline.zrem(`${this.queueName}:processing`, jobId);
                    pipeline.zadd(`${this.queueName}:failed`, now, jobId);
                    pipeline.hset(`${this.queueName}:jobs`, jobId, JSON.stringify(job));
                    cleanedUp++;
                }
                if (cleanedUp > 0) {
                    pipeline.hincrby(`${this.queueName}:stats`, 'processing', -cleanedUp);
                    pipeline.hincrby(`${this.queueName}:stats`, 'failed', cleanedUp);
                }
                await this.connection.executePipeline(pipeline);
                if (cleanedUp > 0) {
                    console.log(`[JobQueue] Cleaned up ${cleanedUp} stale jobs`);
                }
                return cleanedUp;
            });
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to cleanup stale jobs: ${error.message}`, 'cleanupStaleJobs', error);
        }
    }
    /**
     * Get comprehensive queue statistics
     */
    async getQueueStats() {
        try {
            return await this.connection.safeExecute(async () => {
                const [pending, processing, delayed, completed, failed, cancelled, stats] = await Promise.all([
                    this.redis.zcard(`${this.queueName}:pending`),
                    this.redis.zcard(`${this.queueName}:processing`),
                    this.redis.zcard(`${this.queueName}:delayed`),
                    this.redis.zcard(`${this.queueName}:completed`),
                    this.redis.zcard(`${this.queueName}:failed`),
                    this.redis.zcard(`${this.queueName}:cancelled`),
                    this.redis.hmget(`${this.queueName}:stats`, 'lastProcessed', 'processingRate', 'averageProcessingTime')
                ]);
                const total = pending + processing + delayed + completed + failed + cancelled;
                const errorRate = total > 0 ? (failed / total) * 100 : 0;
                return {
                    pending,
                    processing,
                    delayed,
                    completed,
                    failed,
                    cancelled,
                    total,
                    processingRate: parseFloat(stats[1]) || 0,
                    averageProcessingTime: parseFloat(stats[2]) || 0,
                    errorRate,
                    lastProcessed: stats[0] ? new Date(parseInt(stats[0])) : undefined
                };
            });
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to get queue stats: ${error.message}`, 'getQueueStats', error);
        }
    }
    /**
     * Remove old completed and failed jobs
     */
    async cleanupOldJobs(maxAge = 7 * 24 * 60 * 60 * 1000) {
        try {
            return await this.connection.safeExecute(async () => {
                const cutoff = Date.now() - maxAge;
                const [completedRemoved, failedRemoved] = await Promise.all([
                    this.redis.zremrangebyscore(`${this.queueName}:completed`, '-inf', cutoff),
                    this.redis.zremrangebyscore(`${this.queueName}:failed`, '-inf', cutoff)
                ]);
                const totalRemoved = completedRemoved + failedRemoved;
                if (totalRemoved > 0) {
                    console.log(`[JobQueue] Cleaned up ${totalRemoved} old jobs (${completedRemoved} completed, ${failedRemoved} failed)`);
                }
                return totalRemoved;
            });
        }
        catch (error) {
            throw new types_1.QueueError(`Failed to cleanup old jobs: ${error.message}`, 'cleanupOldJobs', error);
        }
    }
    // Private helper methods
    generateJobId() {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getPriorityScore(priority, timestamp) {
        const priorityWeights = {
            [types_1.JobPriority.HIGH]: 1000000,
            [types_1.JobPriority.MEDIUM]: 100000,
            [types_1.JobPriority.LOW]: 10000
        };
        // Higher priority gets lower score (for min-heap behavior)
        // Add timestamp to maintain FIFO within same priority
        return priorityWeights[priority] - timestamp;
    }
    calculateBackoffDelay(job) {
        const backoff = job.options.backoff;
        if (job.options.retryDelays && job.attempts <= job.options.retryDelays.length) {
            return job.options.retryDelays[job.attempts - 1];
        }
        if (!backoff) {
            // Default exponential backoff: 1s, 2s, 4s, 8s, 16s
            return Math.min(1000 * Math.pow(2, job.attempts - 1), 30000);
        }
        if (backoff.type === types_1.BackoffStrategy.FIXED) {
            return backoff.delay;
        }
        else {
            // Exponential backoff
            return Math.min(backoff.delay * Math.pow(2, job.attempts - 1), 30000);
        }
    }
    // Test connection method for compatibility
    async testConnection() {
        try {
            await this.connection.testConnection();
            return true;
        }
        catch (error) {
            console.error('[JobQueue] Test connection failed:', error.message);
            return false;
        }
    }
    // Close method for compatibility
    async close() {
        return this.connection.close();
    }
}
exports.JobQueue = JobQueue;
//# sourceMappingURL=job-queue.js.map