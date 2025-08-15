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

import { configManager } from '../config';

export enum LogLevel {
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

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private serviceName: string = 'background-jobs-service';
  private enableConsole: boolean;
  private enableFile: boolean;
  private filename?: string;

  private constructor() {
    const config = configManager.getLoggingConfig();
    this.logLevel = this.parseLogLevel(config.level);
    this.enableConsole = config.enableConsole;
    this.enableFile = config.enableFile;
    this.filename = config.filename;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      case 'trace': return LogLevel.TRACE;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatLogEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
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
        code: (error as any).code
      };
    }

    return entry;
  }

  private writeLog(entry: LogEntry): void {
    const formatted = JSON.stringify(entry);

    if (this.enableConsole) {
      // Color coding for console output
      const colors = {
        error: '\x1b[31m', // Red
        warn: '\x1b[33m',  // Yellow
        info: '\x1b[36m',  // Cyan
        debug: '\x1b[37m', // White
        trace: '\x1b[90m'  // Gray
      };
      
      const color = colors[entry.level as keyof typeof colors] || '';
      const reset = '\x1b[0m';
      
      if (configManager.isDevelopment()) {
        // Pretty print for development
        console.log(`${color}[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${reset}`);
        if (entry.context) {
          console.log(`${color}Context:${reset}`, entry.context);
        }
        if (entry.error) {
          console.log(`${color}Error:${reset}`, entry.error);
        }
      } else {
        console.log(formatted);
      }
    }

    if (this.enableFile && this.filename) {
      // In a real implementation, this would write to a file
      // For now, we'll just append to a theoretical log file
      this.writeToFile(formatted);
    }
  }

  private writeToFile(entry: string): void {
    // Placeholder for file logging implementation
    // In production, you'd use a proper logging library like winston
    console.log(`[FILE_LOG] ${entry}`);
  }

  public error(message: string, error?: Error, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.formatLogEntry(LogLevel.ERROR, message, context, error);
    this.writeLog(entry);
    
    // Track error metrics
    this.trackErrorMetric(message, error, context);
  }

  public warn(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry = this.formatLogEntry(LogLevel.WARN, message, context);
    this.writeLog(entry);
  }

  public info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry = this.formatLogEntry(LogLevel.INFO, message, context);
    this.writeLog(entry);
  }

  public debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry = this.formatLogEntry(LogLevel.DEBUG, message, context);
    this.writeLog(entry);
  }

  public trace(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.TRACE)) return;
    
    const entry = this.formatLogEntry(LogLevel.TRACE, message, context);
    this.writeLog(entry);
  }

  // Specialized logging methods for job processing

  public jobStarted(jobId: string, jobType: string, workerId?: number): void {
    this.info('Job processing started', {
      jobId,
      workerId,
      operation: 'job_start',
      metadata: { jobType }
    });
  }

  public jobCompleted(jobId: string, jobType: string, duration: number, workerId?: number): void {
    this.info('Job processing completed', {
      jobId,
      workerId,
      operation: 'job_complete',
      duration,
      metadata: { jobType }
    });
  }

  public jobFailed(jobId: string, jobType: string, error: Error, attempt: number, maxAttempts: number, workerId?: number): void {
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

  public jobRetry(jobId: string, jobType: string, attempt: number, delay: number, workerId?: number): void {
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

  public workerStarted(workerId: number): void {
    this.info('Worker started', {
      workerId,
      operation: 'worker_start'
    });
  }

  public workerStopped(workerId: number, processed: number, failed: number): void {
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

  public queueStats(stats: any): void {
    this.debug('Queue statistics', {
      operation: 'queue_stats',
      metadata: stats
    });
  }

  // Performance logging

  public performance(operation: string, duration: number, context?: LogContext): void {
    const message = `Performance: ${operation} completed in ${duration}ms`;
    
    if (duration > 5000) { // Log slow operations as warnings
      this.warn(message, { ...context, operation, duration });
    } else {
      this.debug(message, { ...context, operation, duration });
    }
  }

  // HTTP request logging

  public httpRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    const message = `${method} ${path} ${statusCode} - ${duration}ms`;
    
    if (statusCode >= 400) {
      this.warn(message, { ...context, operation: 'http_request', duration, metadata: { method, path, statusCode } });
    } else {
      this.info(message, { ...context, operation: 'http_request', duration, metadata: { method, path, statusCode } });
    }
  }

  // Connection logging

  public connectionEstablished(service: string, details?: any): void {
    this.info(`Connection established: ${service}`, {
      operation: 'connection_established',
      metadata: { service, ...details }
    });
  }

  public connectionLost(service: string, error?: Error): void {
    this.error(`Connection lost: ${service}`, error, {
      operation: 'connection_lost',
      metadata: { service }
    });
  }

  public connectionRecovered(service: string, attempts: number): void {
    this.info(`Connection recovered: ${service}`, {
      operation: 'connection_recovered',
      metadata: { service, attempts }
    });
  }

  // Error tracking and metrics

  private trackErrorMetric(message: string, error?: Error, context?: LogContext): void {
    // In a real implementation, this would send metrics to a monitoring system
    if (configManager.getMonitoringConfig().enableMetrics) {
      console.log(`[METRICS] Error tracked: ${message}`, {
        error: error?.name,
        jobId: context?.jobId,
        operation: context?.operation
      });
    }
  }

  // Utility methods

  public createChildLogger(context: LogContext): ChildLogger {
    return new ChildLogger(this, context);
  }

  public setLogLevel(level: string): void {
    this.logLevel = this.parseLogLevel(level);
    this.info(`Log level changed to: ${level}`);
  }

  public getLogLevel(): string {
    return LogLevel[this.logLevel].toLowerCase();
  }
}

// Child logger for maintaining context across multiple log calls
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: LogContext
  ) {}

  private mergeContext(additionalContext?: LogContext): LogContext {
    return { ...this.context, ...additionalContext };
  }

  public error(message: string, error?: Error, context?: LogContext): void {
    this.parent.error(message, error, this.mergeContext(context));
  }

  public warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  public info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  public debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  public trace(message: string, context?: LogContext): void {
    this.parent.trace(message, this.mergeContext(context));
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Utility functions for common patterns
export function withJobContext(jobId: string, workerId?: number) {
  return logger.createChildLogger({ jobId, workerId });
}

export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const start = Date.now();
  return fn().finally(() => {
    const duration = Date.now() - start;
    logger.performance(operation, duration, context);
  });
}