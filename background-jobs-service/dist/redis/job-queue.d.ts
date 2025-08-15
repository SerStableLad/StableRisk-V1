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
import { Job, JobOptions, QueueStatistics } from '../types';
export declare class JobQueue {
    private redis;
    private queueName;
    private connection;
    constructor(queueName?: string);
    /**
     * Add a new job to the queue
     */
    addJob(type: string, data: any, options?: JobOptions): Promise<string>;
    /**
     * Get the next job to process
     */
    getNextJob(): Promise<Job | null>;
    /**
     * Mark job as completed
     */
    completeJob(jobId: string, result?: any): Promise<void>;
    /**
     * Mark job as failed and handle retry logic
     */
    failJob(jobId: string, error: string): Promise<void>;
    /**
     * Cancel a pending or delayed job
     */
    cancelJob(jobId: string): Promise<boolean>;
    /**
     * Get job by ID
     */
    getJob(jobId: string): Promise<Job | null>;
    /**
     * Promote delayed jobs that are ready to be processed
     */
    promoteDelayedJobs(): Promise<number>;
    /**
     * Clean up stale processing jobs (timed out)
     */
    cleanupStaleJobs(): Promise<number>;
    /**
     * Get comprehensive queue statistics
     */
    getQueueStats(): Promise<QueueStatistics>;
    /**
     * Remove old completed and failed jobs
     */
    cleanupOldJobs(maxAge?: number): Promise<number>;
    private generateJobId;
    private getPriorityScore;
    private calculateBackoffDelay;
    testConnection(): Promise<boolean>;
    close(): Promise<void>;
}
//# sourceMappingURL=job-queue.d.ts.map