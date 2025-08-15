"use strict";
/**
 * Base Handler Infrastructure
 *
 * Provides common patterns, error handling, and utilities
 * for all job handlers in the background jobs service
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandlerRegistry = exports.BaseHandler = void 0;
const types_1 = require("../../types");
const logger_1 = require("../../utils/logger");
/**
 * Abstract base handler with common functionality
 */
class BaseHandler {
    constructor(config = {}) {
        this.circuitBreakerOpen = false;
        this.lastCircuitBreakerCheck = Date.now();
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
    async process(job) {
        const jobLogger = (0, logger_1.withJobContext)(job.id);
        const startTime = Date.now();
        // Circuit breaker check
        if (this.isCircuitBreakerOpen()) {
            throw new types_1.JobError('Circuit breaker is open', job.id);
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
        }
        catch (error) {
            // Update failure metrics
            const processingTime = Date.now() - startTime;
            this.updateMetrics(false, processingTime);
            jobLogger.error(`Handler ${this.constructor.name} failed`, error, {
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
            throw error instanceof types_1.JobError ? error : new types_1.JobError(error.message, job.id, error);
        }
    }
    /**
     * Process job with retry logic
     */
    async processWithRetries(job, logger) {
        const maxRetries = this.config.retries || 0;
        let lastError = null;
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
            }
            catch (error) {
                lastError = error;
                logger.warn(`Job execution attempt ${attempt + 1} failed`, {
                    operation: 'job_attempt_failed',
                    metadata: {
                        attempt: attempt + 1,
                        maxRetries: maxRetries + 1,
                        error: error.message
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
    createTimeoutPromise(jobId) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new types_1.JobError(`Job processing timeout after ${this.config.timeoutMs}ms`, jobId));
            }, this.config.timeoutMs);
        });
    }
    /**
     * Update handler metrics
     */
    updateMetrics(success, processingTime) {
        if (!this.config.enableMetrics)
            return;
        if (success) {
            this.metrics.totalProcessed++;
        }
        else {
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
    checkCircuitBreaker() {
        if (!this.config.enableCircuitBreaker)
            return;
        const totalJobs = this.metrics.totalProcessed + this.metrics.totalFailed;
        // Only check after minimum number of jobs
        if (totalJobs < 10)
            return;
        // Check if error rate exceeds threshold
        if (this.metrics.errorRate >= (this.config.circuitBreakerThreshold || 0.5)) {
            this.circuitBreakerOpen = true;
            this.lastCircuitBreakerCheck = Date.now();
            logger_1.logger.warn(`Circuit breaker opened for handler ${this.constructor.name}`, {
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
    isCircuitBreakerOpen() {
        if (!this.config.enableCircuitBreaker || !this.circuitBreakerOpen) {
            return false;
        }
        // Auto-reset circuit breaker after 5 minutes
        const resetTimeoutMs = 5 * 60 * 1000;
        if (Date.now() - this.lastCircuitBreakerCheck > resetTimeoutMs) {
            this.circuitBreakerOpen = false;
            logger_1.logger.info(`Circuit breaker reset for handler ${this.constructor.name}`, {
                operation: 'circuit_breaker_reset',
                metadata: { handlerType: this.constructor.name }
            });
        }
        return this.circuitBreakerOpen;
    }
    /**
     * Get handler metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Reset handler metrics
     */
    resetMetrics() {
        this.metrics.totalProcessed = 0;
        this.metrics.totalFailed = 0;
        this.metrics.averageProcessingTime = 0;
        this.metrics.errorRate = 0;
        this.metrics.lastProcessedAt = undefined;
    }
    /**
     * Utility method for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Validate job data against expected schema
     */
    validateJobData(job, requiredFields) {
        if (!job.data) {
            throw new types_1.JobError('Job data is missing', job.id);
        }
        const missingFields = requiredFields.filter(field => !(field in job.data));
        if (missingFields.length > 0) {
            throw new types_1.JobError(`Missing required fields: ${missingFields.join(', ')}`, job.id);
        }
    }
    /**
     * Create standardized result structure
     */
    createResult(data, metadata = {}) {
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
    async withTimeout(promise, timeoutMs, operationName) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`${operationName} timeout after ${timeoutMs}ms`));
            }, timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]);
    }
    /**
     * Execute operations in parallel with error collection
     */
    async executeInParallel(operations, operationNames) {
        const settledResults = await Promise.allSettled(operations.map((op, index) => op().catch(error => {
            throw { operationName: operationNames[index], error };
        })));
        const results = [];
        const errors = [];
        settledResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
            else {
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
exports.BaseHandler = BaseHandler;
/**
 * Handler registry for managing job handlers
 */
class HandlerRegistry {
    constructor() {
        this.handlers = new Map();
        this.handlerMetrics = new Map();
    }
    /**
     * Register a handler for a job type
     */
    register(jobType, handler) {
        this.handlers.set(jobType, handler);
        if (handler instanceof BaseHandler) {
            this.handlerMetrics.set(jobType, handler.getMetrics());
        }
        logger_1.logger.info(`Handler registered for job type: ${jobType}`, {
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
    get(jobType) {
        return this.handlers.get(jobType);
    }
    /**
     * Get all registered job types
     */
    getRegisteredTypes() {
        return Array.from(this.handlers.keys());
    }
    /**
     * Get metrics for all handlers
     */
    getAllMetrics() {
        const metrics = {};
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
    resetAllMetrics() {
        for (const handler of this.handlers.values()) {
            if (handler instanceof BaseHandler) {
                handler.resetMetrics();
            }
        }
    }
    /**
     * Unregister a handler
     */
    unregister(jobType) {
        const removed = this.handlers.delete(jobType);
        this.handlerMetrics.delete(jobType);
        if (removed) {
            logger_1.logger.info(`Handler unregistered for job type: ${jobType}`, {
                operation: 'handler_unregistered',
                metadata: { jobType }
            });
        }
        return removed;
    }
    /**
     * Check if a job type has a registered handler
     */
    has(jobType) {
        return this.handlers.has(jobType);
    }
    /**
     * Get handler registry status
     */
    getStatus() {
        return {
            totalHandlers: this.handlers.size,
            registeredTypes: this.getRegisteredTypes(),
            metrics: this.getAllMetrics()
        };
    }
}
exports.HandlerRegistry = HandlerRegistry;
//# sourceMappingURL=base-handler.js.map