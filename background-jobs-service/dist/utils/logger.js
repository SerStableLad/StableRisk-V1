"use strict";
/**
 * Logging Utilities and Error Handling
 *
 * Features:
 * - Structured JSON logging
 * - Multiple log levels and filtering
 * - Context-aware logging with correlation IDs
 * - Performance monitoring integration
 * - Error tracking and aggregation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
exports.withJobContext = withJobContext;
exports.generateCorrelationId = generateCorrelationId;
exports.measurePerformance = measurePerformance;
const config_1 = require("../config");
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
    LogLevel[LogLevel["TRACE"] = 4] = "TRACE";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor() {
        this.serviceName = 'background-jobs-service';
        const config = config_1.configManager.getLoggingConfig();
        this.logLevel = this.parseLogLevel(config.level);
        this.enableConsole = config.enableConsole;
        this.enableFile = config.enableFile;
        this.filename = config.filename;
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    parseLogLevel(level) {
        switch (level.toLowerCase()) {
            case 'error': return LogLevel.ERROR;
            case 'warn': return LogLevel.WARN;
            case 'info': return LogLevel.INFO;
            case 'debug': return LogLevel.DEBUG;
            case 'trace': return LogLevel.TRACE;
            default: return LogLevel.INFO;
        }
    }
    shouldLog(level) {
        return level <= this.logLevel;
    }
    formatLogEntry(level, message, context, error) {
        const entry = {
            timestamp: new Date().toISOString(),
            level: LogLevel[level].toLowerCase(),
            message,
            service: this.serviceName,
            context
        };
        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code
            };
        }
        return entry;
    }
    writeLog(entry) {
        const formatted = JSON.stringify(entry);
        if (this.enableConsole) {
            // Color coding for console output
            const colors = {
                error: '\x1b[31m', // Red
                warn: '\x1b[33m', // Yellow
                info: '\x1b[36m', // Cyan
                debug: '\x1b[37m', // White
                trace: '\x1b[90m' // Gray
            };
            const color = colors[entry.level] || '';
            const reset = '\x1b[0m';
            if (config_1.configManager.isDevelopment()) {
                // Pretty print for development
                console.log(`${color}[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${reset}`);
                if (entry.context) {
                    console.log(`${color}Context:${reset}`, entry.context);
                }
                if (entry.error) {
                    console.log(`${color}Error:${reset}`, entry.error);
                }
            }
            else {
                console.log(formatted);
            }
        }
        if (this.enableFile && this.filename) {
            // In a real implementation, this would write to a file
            // For now, we'll just append to a theoretical log file
            this.writeToFile(formatted);
        }
    }
    writeToFile(entry) {
        // Placeholder for file logging implementation
        // In production, you'd use a proper logging library like winston
        console.log(`[FILE_LOG] ${entry}`);
    }
    error(message, error, context) {
        if (!this.shouldLog(LogLevel.ERROR))
            return;
        const entry = this.formatLogEntry(LogLevel.ERROR, message, context, error);
        this.writeLog(entry);
        // Track error metrics
        this.trackErrorMetric(message, error, context);
    }
    warn(message, context) {
        if (!this.shouldLog(LogLevel.WARN))
            return;
        const entry = this.formatLogEntry(LogLevel.WARN, message, context);
        this.writeLog(entry);
    }
    info(message, context) {
        if (!this.shouldLog(LogLevel.INFO))
            return;
        const entry = this.formatLogEntry(LogLevel.INFO, message, context);
        this.writeLog(entry);
    }
    debug(message, context) {
        if (!this.shouldLog(LogLevel.DEBUG))
            return;
        const entry = this.formatLogEntry(LogLevel.DEBUG, message, context);
        this.writeLog(entry);
    }
    trace(message, context) {
        if (!this.shouldLog(LogLevel.TRACE))
            return;
        const entry = this.formatLogEntry(LogLevel.TRACE, message, context);
        this.writeLog(entry);
    }
    // Specialized logging methods for job processing
    jobStarted(jobId, jobType, workerId) {
        this.info('Job processing started', {
            jobId,
            workerId,
            operation: 'job_start',
            metadata: { jobType }
        });
    }
    jobCompleted(jobId, jobType, duration, workerId) {
        this.info('Job processing completed', {
            jobId,
            workerId,
            operation: 'job_complete',
            duration,
            metadata: { jobType }
        });
    }
    jobFailed(jobId, jobType, error, attempt, maxAttempts, workerId) {
        this.error('Job processing failed', error, {
            jobId,
            workerId,
            operation: 'job_failed',
            metadata: {
                jobType,
                attempt,
                maxAttempts,
                willRetry: attempt < maxAttempts
            }
        });
    }
    jobRetry(jobId, jobType, attempt, delay, workerId) {
        this.warn('Job scheduled for retry', {
            jobId,
            workerId,
            operation: 'job_retry',
            metadata: {
                jobType,
                attempt,
                delay
            }
        });
    }
    workerStarted(workerId) {
        this.info('Worker started', {
            workerId,
            operation: 'worker_start'
        });
    }
    workerStopped(workerId, processed, failed) {
        this.info('Worker stopped', {
            workerId,
            operation: 'worker_stop',
            metadata: {
                processed,
                failed,
                successRate: processed > 0 ? ((processed - failed) / processed * 100).toFixed(2) + '%' : '0%'
            }
        });
    }
    queueStats(stats) {
        this.debug('Queue statistics', {
            operation: 'queue_stats',
            metadata: stats
        });
    }
    // Performance logging
    performance(operation, duration, context) {
        const message = `Performance: ${operation} completed in ${duration}ms`;
        if (duration > 5000) { // Log slow operations as warnings
            this.warn(message, { ...context, operation, duration });
        }
        else {
            this.debug(message, { ...context, operation, duration });
        }
    }
    // HTTP request logging
    httpRequest(method, path, statusCode, duration, context) {
        const message = `${method} ${path} ${statusCode} - ${duration}ms`;
        if (statusCode >= 400) {
            this.warn(message, { ...context, operation: 'http_request', duration, metadata: { method, path, statusCode } });
        }
        else {
            this.info(message, { ...context, operation: 'http_request', duration, metadata: { method, path, statusCode } });
        }
    }
    // Connection logging
    connectionEstablished(service, details) {
        this.info(`Connection established: ${service}`, {
            operation: 'connection_established',
            metadata: { service, ...details }
        });
    }
    connectionLost(service, error) {
        this.error(`Connection lost: ${service}`, error, {
            operation: 'connection_lost',
            metadata: { service }
        });
    }
    connectionRecovered(service, attempts) {
        this.info(`Connection recovered: ${service}`, {
            operation: 'connection_recovered',
            metadata: { service, attempts }
        });
    }
    // Error tracking and metrics
    trackErrorMetric(message, error, context) {
        // In a real implementation, this would send metrics to a monitoring system
        if (config_1.configManager.getMonitoringConfig().enableMetrics) {
            console.log(`[METRICS] Error tracked: ${message}`, {
                error: error?.name,
                jobId: context?.jobId,
                operation: context?.operation
            });
        }
    }
    // Utility methods
    createChildLogger(context) {
        return new ChildLogger(this, context);
    }
    setLogLevel(level) {
        this.logLevel = this.parseLogLevel(level);
        this.info(`Log level changed to: ${level}`);
    }
    getLogLevel() {
        return LogLevel[this.logLevel].toLowerCase();
    }
}
// Child logger for maintaining context across multiple log calls
class ChildLogger {
    constructor(parent, context) {
        this.parent = parent;
        this.context = context;
    }
    mergeContext(additionalContext) {
        return { ...this.context, ...additionalContext };
    }
    error(message, error, context) {
        this.parent.error(message, error, this.mergeContext(context));
    }
    warn(message, context) {
        this.parent.warn(message, this.mergeContext(context));
    }
    info(message, context) {
        this.parent.info(message, this.mergeContext(context));
    }
    debug(message, context) {
        this.parent.debug(message, this.mergeContext(context));
    }
    trace(message, context) {
        this.parent.trace(message, this.mergeContext(context));
    }
}
// Export singleton instance
exports.logger = Logger.getInstance();
// Utility functions for common patterns
function withJobContext(jobId, workerId) {
    return exports.logger.createChildLogger({ jobId, workerId });
}
function generateCorrelationId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function measurePerformance(operation, fn, context) {
    const start = Date.now();
    return fn().finally(() => {
        const duration = Date.now() - start;
        exports.logger.performance(operation, duration, context);
    });
}
//# sourceMappingURL=logger.js.map