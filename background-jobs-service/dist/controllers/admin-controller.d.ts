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
import { Router } from 'express';
import { JobProcessor } from '../processors/job-processor';
import { JobQueue } from '../redis/job-queue';
export declare class AdminController {
    private processor;
    private queue;
    private database;
    constructor(processor: JobProcessor, queue?: JobQueue);
    getRoutes(): Router;
    private authenticateAdmin;
    private getWorkerStatus;
    private scaleWorkerPool;
    private restartWorkers;
    private stopWorker;
    private pauseQueue;
    private resumeQueue;
    private clearQueue;
    private purgeFailedJobs;
    private getSystemStatus;
    private updateConfig;
    private enableMaintenanceMode;
    private disableMaintenanceMode;
    private getPerformanceMetrics;
    private resetPerformanceMetrics;
    private getRecentLogs;
    private getSystemLoadMetrics;
    private getSystemHealth;
    private getSettledValue;
    private determineOverallHealth;
}
//# sourceMappingURL=admin-controller.d.ts.map