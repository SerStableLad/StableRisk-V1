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
export declare enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4
}
export interface LogContext {
    jobId?: string;
    workerId?: number;
    correlationId?: string;
    operation?: string;
    duration?: number;
    metadata?: Record<string, any>;
}
export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    service: string;
    context?: LogContext;
    error?: {
        name: string;
        message: string;
        stack?: string;
        code?: string;
    };
}
declare class Logger {
    private static instance;
    private logLevel;
    private serviceName;
    private enableConsole;
    private enableFile;
    private filename?;
    private constructor();
    static getInstance(): Logger;
    private parseLogLevel;
    private shouldLog;
    private formatLogEntry;
    private writeLog;
    private writeToFile;
    error(message: string, error?: Error, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
    trace(message: string, context?: LogContext): void;
    jobStarted(jobId: string, jobType: string, workerId?: number): void;
    jobCompleted(jobId: string, jobType: string, duration: number, workerId?: number): void;
    jobFailed(jobId: string, jobType: string, error: Error, attempt: number, maxAttempts: number, workerId?: number): void;
    jobRetry(jobId: string, jobType: string, attempt: number, delay: number, workerId?: number): void;
    workerStarted(workerId: number): void;
    workerStopped(workerId: number, processed: number, failed: number): void;
    queueStats(stats: any): void;
    performance(operation: string, duration: number, context?: LogContext): void;
    httpRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void;
    connectionEstablished(service: string, details?: any): void;
    connectionLost(service: string, error?: Error): void;
    connectionRecovered(service: string, attempts: number): void;
    private trackErrorMetric;
    createChildLogger(context: LogContext): ChildLogger;
    setLogLevel(level: string): void;
    getLogLevel(): string;
}
declare class ChildLogger {
    private parent;
    private context;
    constructor(parent: Logger, context: LogContext);
    private mergeContext;
    error(message: string, error?: Error, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    debug(message: string, context?: LogContext): void;
    trace(message: string, context?: LogContext): void;
}
export declare const logger: Logger;
export declare function withJobContext(jobId: string, workerId?: number): ChildLogger;
export declare function generateCorrelationId(): string;
export declare function measurePerformance<T>(operation: string, fn: () => Promise<T>, context?: LogContext): Promise<T>;
export {};
//# sourceMappingURL=logger.d.ts.map