/**
 * Base Handler Infrastructure
 *
 * Provides common patterns, error handling, and utilities
 * for all job handlers in the background jobs service
 */
import { Job, JobHandler } from '../../types';
export interface HandlerMetrics {
    totalProcessed: number;
    totalFailed: number;
    averageProcessingTime: number;
    lastProcessedAt?: Date;
    errorRate: number;
}
export interface HandlerConfig {
    timeoutMs?: number;
    retries?: number;
    enableMetrics?: boolean;
    enableCircuitBreaker?: boolean;
    circuitBreakerThreshold?: number;
}
/**
 * Abstract base handler with common functionality
 */
export declare abstract class BaseHandler implements JobHandler {
    protected readonly config: HandlerConfig;
    protected readonly metrics: HandlerMetrics;
    private circuitBreakerOpen;
    private lastCircuitBreakerCheck;
    constructor(config?: HandlerConfig);
    /**
     * Main process method with common error handling and metrics
     */
    process(job: Job): Promise<any>;
    /**
     * Abstract method to be implemented by concrete handlers
     */
    protected abstract executeJob(job: Job, logger: any): Promise<any>;
    /**
     * Process job with retry logic
     */
    private processWithRetries;
    /**
     * Create timeout promise for job processing
     */
    private createTimeoutPromise;
    /**
     * Update handler metrics
     */
    private updateMetrics;
    /**
     * Check if circuit breaker should be opened
     */
    private checkCircuitBreaker;
    /**
     * Check if circuit breaker is open
     */
    private isCircuitBreakerOpen;
    /**
     * Get handler metrics
     */
    getMetrics(): HandlerMetrics;
    /**
     * Reset handler metrics
     */
    resetMetrics(): void;
    /**
     * Utility method for delays
     */
    protected delay(ms: number): Promise<void>;
    /**
     * Validate job data against expected schema
     */
    protected validateJobData(job: Job, requiredFields: string[]): void;
    /**
     * Create standardized result structure
     */
    protected createResult(data: any, metadata?: any): any;
    /**
     * Handle external service timeout wrapper
     */
    protected withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T>;
    /**
     * Execute operations in parallel with error collection
     */
    protected executeInParallel<T>(operations: (() => Promise<T>)[], operationNames: string[]): Promise<{
        results: T[];
        errors: {
            operation: string;
            error: string;
        }[];
        successCount: number;
        failureCount: number;
    }>;
}
/**
 * Handler registry for managing job handlers
 */
export declare class HandlerRegistry {
    private handlers;
    private handlerMetrics;
    /**
     * Register a handler for a job type
     */
    register(jobType: string, handler: JobHandler): void;
    /**
     * Get handler for job type
     */
    get(jobType: string): JobHandler | undefined;
    /**
     * Get all registered job types
     */
    getRegisteredTypes(): string[];
    /**
     * Get metrics for all handlers
     */
    getAllMetrics(): Record<string, HandlerMetrics>;
    /**
     * Reset metrics for all handlers
     */
    resetAllMetrics(): void;
    /**
     * Unregister a handler
     */
    unregister(jobType: string): boolean;
    /**
     * Check if a job type has a registered handler
     */
    has(jobType: string): boolean;
    /**
     * Get handler registry status
     */
    getStatus(): {
        totalHandlers: number;
        registeredTypes: string[];
        metrics: Record<string, HandlerMetrics>;
    };
}
//# sourceMappingURL=base-handler.d.ts.map