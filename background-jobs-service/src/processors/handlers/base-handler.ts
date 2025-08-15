/**
 * Base Handler Infrastructure
 * 
 * Provides common patterns, error handling, and utilities
 * for all job handlers in the background jobs service
 */

import { Job, JobHandler, JobError } from '../../types';
import { logger, withJobContext } from '../../utils/logger';

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
export abstract class BaseHandler implements JobHandler {
  protected readonly config: HandlerConfig;
  protected readonly metrics: HandlerMetrics;
  private circuitBreakerOpen = false;
  private lastCircuitBreakerCheck = Date.now();

  constructor(config: HandlerConfig = {}) {
    this.config = {
      timeoutMs: 120000, // 2 minutes default
      retries: 3,
      enableMetrics: true,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 0.5, // 50% error rate threshold
      ...config
    };

    this.metrics = {
      totalProcessed: 0,
      totalFailed: 0,
      averageProcessingTime: 0,
      errorRate: 0
    };
  }

  /**
   * Main process method with common error handling and metrics
   */
  public async process(job: Job): Promise<any> {
    const jobLogger = withJobContext(job.id);
    const startTime = Date.now();

    // Circuit breaker check
    if (this.isCircuitBreakerOpen()) {
      throw new JobError('Circuit breaker is open', job.id);
    }

    try {
      // Create timeout promise
      const timeoutPromise = this.createTimeoutPromise(job.id);
      const processingPromise = this.processWithRetries(job, jobLogger);

      // Race between processing and timeout
      const result = await Promise.race([processingPromise, timeoutPromise]);
      
      // Update success metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(true, processingTime);

      jobLogger.debug(`Handler ${this.constructor.name} completed successfully`, {
        operation: 'handler_success',
        metadata: { 
          processingTime,
          handlerType: this.constructor.name
        }
      });

      return result;

    } catch (error) {
      // Update failure metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(false, processingTime);

      jobLogger.error(`Handler ${this.constructor.name} failed`, error as Error, {
        operation: 'handler_failure',
        metadata: { 
          processingTime,
          handlerType: this.constructor.name,
          attempt: job.attempts + 1,
          maxAttempts: job.maxAttempts
        }
      });

      // Check if we should open circuit breaker
      this.checkCircuitBreaker();

      throw error instanceof JobError ? error : new JobError((error as Error).message, job.id, error as Error);
    }
  }

  /**
   * Abstract method to be implemented by concrete handlers
   */
  protected abstract executeJob(job: Job, logger: any): Promise<any>;

  /**
   * Process job with retry logic
   */
  private async processWithRetries(job: Job, logger: any): Promise<any> {
    const maxRetries = this.config.retries || 0;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info(`Retrying job execution (attempt ${attempt + 1}/${maxRetries + 1})`, {
            operation: 'job_retry',
            metadata: { attempt: attempt + 1, maxRetries: maxRetries + 1 }
          });
          
          // Exponential backoff delay
          await this.delay(Math.pow(2, attempt) * 1000);
        }

        return await this.executeJob(job, logger);

      } catch (error) {
        lastError = error as Error;
        logger.warn(`Job execution attempt ${attempt + 1} failed`, {
          operation: 'job_attempt_failed',
          metadata: { 
            attempt: attempt + 1, 
            maxRetries: maxRetries + 1,
            error: (error as Error).message 
          }
        });

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }
      }
    }

    throw lastError || new Error('All retry attempts failed');
  }

  /**
   * Create timeout promise for job processing
   */
  private createTimeoutPromise(jobId: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new JobError(`Job processing timeout after ${this.config.timeoutMs}ms`, jobId));
      }, this.config.timeoutMs);
    });
  }

  /**
   * Update handler metrics
   */
  private updateMetrics(success: boolean, processingTime: number): void {
    if (!this.config.enableMetrics) return;

    if (success) {
      this.metrics.totalProcessed++;
    } else {
      this.metrics.totalFailed++;
    }

    // Update average processing time
    const totalJobs = this.metrics.totalProcessed + this.metrics.totalFailed;
    this.metrics.averageProcessingTime = 
      (this.metrics.averageProcessingTime * (totalJobs - 1) + processingTime) / totalJobs;

    // Update error rate
    this.metrics.errorRate = this.metrics.totalFailed / totalJobs;
    this.metrics.lastProcessedAt = new Date();
  }

  /**
   * Check if circuit breaker should be opened
   */
  private checkCircuitBreaker(): void {
    if (!this.config.enableCircuitBreaker) return;

    const totalJobs = this.metrics.totalProcessed + this.metrics.totalFailed;
    
    // Only check after minimum number of jobs
    if (totalJobs < 10) return;

    // Check if error rate exceeds threshold
    if (this.metrics.errorRate >= (this.config.circuitBreakerThreshold || 0.5)) {
      this.circuitBreakerOpen = true;
      this.lastCircuitBreakerCheck = Date.now();
      
      logger.warn(`Circuit breaker opened for handler ${this.constructor.name}`, {
        operation: 'circuit_breaker_opened',
        metadata: {
          handlerType: this.constructor.name,
          errorRate: this.metrics.errorRate,
          threshold: this.config.circuitBreakerThreshold,
          totalJobs
        }
      });
    }
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (!this.config.enableCircuitBreaker || !this.circuitBreakerOpen) {
      return false;
    }

    // Auto-reset circuit breaker after 5 minutes
    const resetTimeoutMs = 5 * 60 * 1000;
    if (Date.now() - this.lastCircuitBreakerCheck > resetTimeoutMs) {
      this.circuitBreakerOpen = false;
      
      logger.info(`Circuit breaker reset for handler ${this.constructor.name}`, {
        operation: 'circuit_breaker_reset',
        metadata: { handlerType: this.constructor.name }
      });
    }

    return this.circuitBreakerOpen;
  }

  /**
   * Get handler metrics
   */
  public getMetrics(): HandlerMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset handler metrics
   */
  public resetMetrics(): void {
    this.metrics.totalProcessed = 0;
    this.metrics.totalFailed = 0;
    this.metrics.averageProcessingTime = 0;
    this.metrics.errorRate = 0;
    this.metrics.lastProcessedAt = undefined;
  }

  /**
   * Utility method for delays
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate job data against expected schema
   */
  protected validateJobData(job: Job, requiredFields: string[]): void {
    if (!job.data) {
      throw new JobError('Job data is missing', job.id);
    }

    const missingFields = requiredFields.filter(field => !(field in job.data));
    if (missingFields.length > 0) {
      throw new JobError(`Missing required fields: ${missingFields.join(', ')}`, job.id);
    }
  }

  /**
   * Create standardized result structure
   */
  protected createResult(data: any, metadata: any = {}): any {
    return {
      ...data,
      metadata: {
        handlerType: this.constructor.name,
        processedAt: new Date().toISOString(),
        ...metadata
      }
    };
  }

  /**
   * Handle external service timeout wrapper
   */
  protected async withTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number, 
    operationName: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Execute operations in parallel with error collection
   */
  protected async executeInParallel<T>(
    operations: (() => Promise<T>)[], 
    operationNames: string[]
  ): Promise<{
    results: T[];
    errors: { operation: string; error: string }[];
    successCount: number;
    failureCount: number;
  }> {
    const settledResults = await Promise.allSettled(
      operations.map((op, index) => 
        op().catch(error => {
          throw { operationName: operationNames[index], error };
        })
      )
    );

    const results: T[] = [];
    const errors: { operation: string; error: string }[] = [];

    settledResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        const reason = result.reason;
        errors.push({
          operation: reason.operationName || operationNames[index] || `operation_${index}`,
          error: reason.error?.message || reason.message || 'Unknown error'
        });
      }
    });

    return {
      results,
      errors,
      successCount: results.length,
      failureCount: errors.length
    };
  }
}

/**
 * Handler registry for managing job handlers
 */
export class HandlerRegistry {
  private handlers: Map<string, JobHandler> = new Map();
  private handlerMetrics: Map<string, HandlerMetrics> = new Map();

  /**
   * Register a handler for a job type
   */
  public register(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
    
    if (handler instanceof BaseHandler) {
      this.handlerMetrics.set(jobType, handler.getMetrics());
    }

    logger.info(`Handler registered for job type: ${jobType}`, {
      operation: 'handler_registered',
      metadata: { 
        jobType,
        handlerType: handler.constructor.name 
      }
    });
  }

  /**
   * Get handler for job type
   */
  public get(jobType: string): JobHandler | undefined {
    return this.handlers.get(jobType);
  }

  /**
   * Get all registered job types
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get metrics for all handlers
   */
  public getAllMetrics(): Record<string, HandlerMetrics> {
    const metrics: Record<string, HandlerMetrics> = {};
    
    for (const [jobType, handler] of this.handlers) {
      if (handler instanceof BaseHandler) {
        metrics[jobType] = handler.getMetrics();
      }
    }

    return metrics;
  }

  /**
   * Reset metrics for all handlers
   */
  public resetAllMetrics(): void {
    for (const handler of this.handlers.values()) {
      if (handler instanceof BaseHandler) {
        handler.resetMetrics();
      }
    }
  }

  /**
   * Unregister a handler
   */
  public unregister(jobType: string): boolean {
    const removed = this.handlers.delete(jobType);
    this.handlerMetrics.delete(jobType);
    
    if (removed) {
      logger.info(`Handler unregistered for job type: ${jobType}`, {
        operation: 'handler_unregistered',
        metadata: { jobType }
      });
    }

    return removed;
  }

  /**
   * Check if a job type has a registered handler
   */
  public has(jobType: string): boolean {
    return this.handlers.has(jobType);
  }

  /**
   * Get handler registry status
   */
  public getStatus(): {
    totalHandlers: number;
    registeredTypes: string[];
    metrics: Record<string, HandlerMetrics>;
  } {
    return {
      totalHandlers: this.handlers.size,
      registeredTypes: this.getRegisteredTypes(),
      metrics: this.getAllMetrics()
    };
  }
}