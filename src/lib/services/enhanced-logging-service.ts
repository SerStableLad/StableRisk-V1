import { DatabaseIntegrationService } from './database-integration-service';

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

interface QueueStatus {
  queueLength: number;
  queueSize: number;
  batchSize: number;
  batchInterval: number;
  uptime: number;
  enabled: boolean;
}

export class EnhancedLoggingService {
  private static instance: EnhancedLoggingService;
  private enabled: boolean = true;
  private logQueue: (LogEntry & { timestamp: Date; id: string })[] = [];
  private batchSize: number = 50;
  private batchInterval: number = 5000;
  private startTime: number = Date.now();
  private processingBatch: boolean = false;
  private databaseService: DatabaseIntegrationService;
  private batchTimer: NodeJS.Timeout | null = null;

  private constructor() {
    // Environment-based configuration
    this.enabled = process.env.DATABASE_LOGGING_ENABLED !== 'false';
    this.batchSize = parseInt(process.env.LOG_BATCH_SIZE || '50');
    this.batchInterval = parseInt(process.env.LOG_BATCH_INTERVAL || '5000');
    
    // Validate and enforce limits
    if (isNaN(this.batchSize) || this.batchSize <= 0) {
      this.batchSize = 50;
    }
    if (isNaN(this.batchInterval) || this.batchInterval <= 0) {
      this.batchInterval = 5000;
    }
    
    // Enforce reasonable limits
    this.batchSize = Math.min(Math.max(this.batchSize, 1), 1000);
    this.batchInterval = Math.min(Math.max(this.batchInterval, 1000), 60000);

    this.databaseService = DatabaseIntegrationService.getInstance();

    // Start periodic batch processing
    if (this.enabled) {
      this.startBatchTimer();
    }
  }

  public static getInstance(): EnhancedLoggingService {
    if (!EnhancedLoggingService.instance) {
      EnhancedLoggingService.instance = new EnhancedLoggingService();
    }
    return EnhancedLoggingService.instance;
  }

  // Core logging methods required by task specification
  public async logStablecoinOperation(
    ticker: string,
    operation: string,
    success: boolean,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.log({
      level: success ? 'info' : 'error',
      message: `Stablecoin operation: ${operation} for ${ticker}`,
      metadata: {
        ticker,
        operation,
        success,
        ...metadata
      }
    });
  }

  public async logCacheOperation(
    cacheKey: string,
    action: 'hit' | 'miss' | 'set' | 'invalidate',
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.log({
      level: 'debug',
      message: `Cache ${action}: ${cacheKey}`,
      metadata: {
        cacheKey,
        action,
        ...metadata
      }
    });
  }

  public async logAPIRequest(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
    
    await this.log({
      level,
      message: `API ${method} ${endpoint} - ${statusCode} (${duration}ms)`,
      metadata: {
        endpoint,
        method,
        statusCode,
        duration,
        ...metadata
      }
    });
  }

  public async logPerformanceMetric(
    service: string,
    metric: string,
    value: number,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.log({
      level: 'info',
      message: `Performance metric: ${service}.${metric} = ${value}`,
      metadata: {
        service,
        metric,
        value,
        ...metadata
      }
    });
  }

  // Core log method
  public async log(entry: LogEntry): Promise<void> {
    if (!this.enabled || !entry || !entry.level || !entry.message) {
      return;
    }

    // Validate log entry
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(entry.level) || typeof entry.message !== 'string') {
      return;
    }

    const enhancedEntry = {
      ...entry,
      timestamp: new Date(),
      id: Math.random().toString(36).substr(2, 9)
    };

    this.logQueue.push(enhancedEntry);

    // Process batch if queue is full
    if (this.logQueue.length >= this.batchSize) {
      await this.processLogQueue();
    }
  }

  // Batch processing
  private async processLogQueue(): Promise<void> {
    if (this.processingBatch || this.logQueue.length === 0) {
      return;
    }

    this.processingBatch = true;

    try {
      const batch = this.logQueue.splice(0, this.batchSize);
      
      // Process each log entry through the database service
      for (const entry of batch) {
        try {
          // Route to appropriate database logging method based on metadata
          if (entry.metadata?.ticker && entry.metadata?.operation) {
            await this.databaseService.logStablecoinDataFetch(
              entry.metadata.ticker,
              entry.metadata.operation,
              entry.metadata.success || true,
              {
                level: entry.level,
                message: entry.message,
                timestamp: entry.timestamp,
                ...entry.metadata
              }
            );
          } else if (entry.metadata?.cacheKey && entry.metadata?.action) {
            await this.databaseService.logCacheEvent(
              entry.metadata.cacheKey,
              entry.metadata.action,
              {
                level: entry.level,
                message: entry.message,
                timestamp: entry.timestamp,
                ...entry.metadata
              }
            );
          } else {
            // Generic logging - use stablecoin logging with 'system' as ticker
            await this.databaseService.logStablecoinDataFetch(
              'system',
              entry.level,
              entry.level !== 'error',
              {
                message: entry.message,
                timestamp: entry.timestamp,
                ...entry.metadata
              }
            );
          }
        } catch (error) {
          // Don't throw - logging should be non-blocking
          console.error('Failed to process log entry:', error);
        }
      }
    } catch (error) {
      // Don't throw - logging should be non-blocking
      console.error('Failed to process log batch:', error);
    } finally {
      this.processingBatch = false;
    }
  }

  // Immediate processing for critical events
  public async flush(): Promise<void> {
    if (this.logQueue.length > 0) {
      await this.processLogQueue();
    }
  }

  // Health monitoring
  public async isHealthy(): Promise<boolean> {
    try {
      // Check database health
      const dbHealthy = await this.databaseService.healthCheck();
      
      // Check queue is not overflowing
      const queueHealthy = this.logQueue.length < this.batchSize * 10;
      
      return dbHealthy && queueHealthy;
    } catch (error) {
      return false;
    }
  }

  // Queue status and metrics
  public getQueueStatus(): QueueStatus {
    return {
      queueLength: this.logQueue.length,
      queueSize: this.logQueue.length,
      batchSize: this.batchSize,
      batchInterval: this.batchInterval,
      uptime: Date.now() - this.startTime,
      enabled: this.enabled
    };
  }

  // Test interface compatibility methods
  public isEnabled(): boolean {
    return this.enabled;
  }

  public async healthCheck(): Promise<boolean> {
    return this.isHealthy();
  }

  // Test helper methods (for compatibility with tests)
  public getQueueLength(): number {
    return this.logQueue.length;
  }

  public getBatchSize(): number {
    return this.batchSize;
  }

  public getBatchInterval(): number {
    return this.batchInterval;
  }

  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  public clearQueue(): void {
    this.logQueue = [];
  }

  // Timer management
  private startBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    this.batchTimer = setInterval(() => {
      if (this.logQueue.length > 0) {
        this.processLogQueue().catch(error => {
          console.error('Batch timer processing failed:', error);
        });
      }
    }, this.batchInterval);
  }

  // Cleanup
  public destroy(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Process any remaining logs
    this.flush().catch(error => {
      console.error('Failed to flush logs during destroy:', error);
    });
  }

  // Reset for testing
  public static resetInstance(): void {
    if (EnhancedLoggingService.instance) {
      EnhancedLoggingService.instance.destroy();
      EnhancedLoggingService.instance = null as any;
    }
  }
}