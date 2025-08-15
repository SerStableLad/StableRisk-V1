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
import { Router } from 'express';
import { JobQueue } from '../redis/job-queue';
import { DatabaseConnection } from '../db/connection';
export declare class JobController {
    private queue;
    private database;
    private rateLimiter;
    constructor(queue?: JobQueue, database?: DatabaseConnection);
    getRoutes(): Router;
    private submitJob;
    private submitBulkJobs;
    private getJob;
    private getJobResult;
    private listJobs;
    private cancelJob;
    private cleanupJobs;
    private getQueueStats;
    private getJobMetrics;
    private parseStatusFilter;
    private estimateCompletionTime;
    private estimateQueuePosition;
    private queryJobs;
    private countJobs;
}
//# sourceMappingURL=job-controller.d.ts.map