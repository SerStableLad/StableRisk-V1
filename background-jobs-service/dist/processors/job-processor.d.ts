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
import { JobHandler, WorkerInfo, ProcessorConfig } from '../types';
import { HandlerRegistry } from './handlers/base-handler';
export declare class JobProcessor {
    private queue;
    private database;
    private config;
    private isRunning;
    private workers;
    private handlerRegistry;
    private maintenanceInterval;
    private statsInterval;
    private shutdownPromise;
    constructor(queue?: JobQueue, database?: DatabaseConnection, config?: ProcessorConfig, handlerRegistry?: HandlerRegistry);
    /**
     * Register job handler for specific job type
     */
    registerHandler(jobType: string, handler: JobHandler): void;
    /**
     * Get handler registry for external access
     */
    getHandlerRegistry(): HandlerRegistry;
    /**
     * Start job processing with workers
     */
    start(): Promise<void>;
    /**
     * Stop job processing gracefully
     */
    stop(timeout?: number): Promise<void>;
    private performGracefulShutdown;
    private startWorkers;
    private startMaintenance;
    private startStatsCollection;
    private monitorWorkerHealth;
    private restartWorker;
    getStatus(): {
        running: boolean;
        workers: WorkerInfo[];
        handlers: string[];
        handlerMetrics: Record<string, any>;
        config: ProcessorConfig;
    };
    private getWorkerStats;
}
//# sourceMappingURL=job-processor.d.ts.map