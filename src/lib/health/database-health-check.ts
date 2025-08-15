import { EnhancedLoggingService } from '../services/enhanced-logging-service';
import { DatabaseIntegrationService } from '../services/database-integration-service';

// Health check result interfaces
interface ComponentHealth {
  healthy: boolean;
  error: string | null;
}

interface HealthComponents {
  database: ComponentHealth;
  logging: ComponentHealth;
  connection: ComponentHealth;
}

interface HealthCheckResult {
  healthy: boolean;
  timestamp: Date;
  duration: number;
  components: HealthComponents;
}

interface ConnectionPoolMetrics {
  total: number;
  idle: number;
  waiting: number;
  active: number;
}

interface DetailedHealthMetrics {
  connectionPool: ConnectionPoolMetrics;
  uptime: number;
}

interface DetailedHealthStatus extends HealthCheckResult {
  metrics: DetailedHealthMetrics;
}

interface QueueMetrics {
  queueLength: number;
  queueSize: number;
  batchSize: number;
  batchInterval: number;
  uptime: number;
  enabled: boolean;
  recommendation: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    suggestedActions?: string[];
  };
}

interface DatabaseHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  details: {
    database: ComponentHealth;
    logging: ComponentHealth;
    connection: ComponentHealth;
    queueMetrics: QueueMetrics;
  };
}

/**
 * DatabaseHealthCheck Service
 * 
 * Singleton service that monitors the health of database operations,
 * logging services, and connection pools. Integrates with EnhancedLoggingService
 * and DatabaseIntegrationService to provide comprehensive health monitoring.
 */
export class DatabaseHealthCheck {
  private static instance: DatabaseHealthCheck;
  private startTime: number = Date.now();
  private loggingService: EnhancedLoggingService;
  private databaseService: DatabaseIntegrationService;

  private constructor() {
    this.loggingService = EnhancedLoggingService.getInstance();
    this.databaseService = DatabaseIntegrationService.getInstance();
  }

  public static getInstance(): DatabaseHealthCheck {
    if (!DatabaseHealthCheck.instance) {
      DatabaseHealthCheck.instance = new DatabaseHealthCheck();
    }
    return DatabaseHealthCheck.instance;
  }

  public static resetInstance(): void {
    DatabaseHealthCheck.instance = null as any;
  }

  /**
   * Performs a comprehensive health check of all database-related components
   */
  public async performHealthCheck(): Promise<HealthCheckResult> {
    const start = process.hrtime.bigint();
    
    const components: HealthComponents = {
      database: { healthy: true, error: null },
      logging: { healthy: true, error: null },
      connection: { healthy: true, error: null }
    };

    try {
      // Check database service health
      try {
        const dbHealthy = await this.databaseService.healthCheck();
        components.database.healthy = Boolean(dbHealthy);
      } catch (error: any) {
        components.database.healthy = false;
        components.database.error = error.message;
      }

      // Check logging service health
      try {
        const loggingHealthy = await this.loggingService.healthCheck();
        components.logging.healthy = Boolean(loggingHealthy);
      } catch (error: any) {
        components.logging.healthy = false;
        components.logging.error = error.message;
      }

      // Check connection pool (simulate connection test)
      try {
        // Use database service as proxy for connection health
        const connectionHealthy = await this.databaseService.healthCheck();
        components.connection.healthy = Boolean(connectionHealthy);
      } catch (error: any) {
        components.connection.healthy = false;
        components.connection.error = error.message;
      }
    } catch (error) {
      // Handle unexpected errors gracefully
      console.error('Unexpected error during health check:', error);
    }

    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000;

    const result: HealthCheckResult = {
      healthy: Object.values(components).every(c => c.healthy),
      timestamp: new Date(),
      duration,
      components
    };

    // Log health check result if logging is enabled
    if (this.loggingService.isEnabled()) {
      try {
        await this.loggingService.log({
          level: result.healthy ? 'info' : 'warn',
          message: 'Health check completed',
          metadata: {
            healthy: result.healthy,
            duration: result.duration,
            components: result.components
          }
        });
      } catch (error) {
        console.error('Failed to log health check result:', error);
      }
    }

    return result;
  }

  /**
   * Returns detailed health status including connection pool metrics
   */
  public async getDetailedStatus(): Promise<DetailedHealthStatus> {
    const basicStatus = await this.performHealthCheck();
    
    // Mock connection pool stats (in real implementation, would get from actual pool)
    const poolStats = this.getMockConnectionPoolStats();
    const total = poolStats?.totalCount || 0;
    const idle = poolStats?.idleCount || 0;
    const waiting = poolStats?.waitingCount || 0;

    return {
      ...basicStatus,
      metrics: {
        connectionPool: {
          total,
          idle,
          waiting,
          active: total - idle
        },
        uptime: Date.now() - this.startTime
      }
    };
  }

  /**
   * Checks database health and returns structured status information
   */
  public async checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
    const start = Date.now();
    const healthResult = await this.performHealthCheck();
    const responseTime = Date.now() - start;
    
    const queueMetrics = this.getLogQueueMetrics();
    
    // Determine overall status based on response time and component health
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (!healthResult.healthy) {
      status = 'unhealthy';
    } else if (responseTime > 1000 || queueMetrics.recommendation.status !== 'healthy') {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      responseTime,
      details: {
        database: healthResult.components.database,
        logging: healthResult.components.logging,
        connection: healthResult.components.connection,
        queueMetrics
      }
    };
  }

  /**
   * Returns log queue metrics with recommendations
   */
  public getLogQueueMetrics(): QueueMetrics {
    const queueStatus = this.loggingService.getQueueStatus();
    const recommendation = this.getQueueRecommendation(queueStatus.queueLength);

    return {
      ...queueStatus,
      recommendation
    };
  }

  /**
   * Analyzes queue size and provides recommendations
   */
  private getQueueRecommendation(queueSize: number): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    message: string;
    suggestedActions?: string[];
  } {
    const batchSize = this.loggingService.getBatchSize();
    
    if (queueSize === 0) {
      return {
        status: 'healthy',
        message: 'Queue is empty - optimal performance'
      };
    }
    
    if (queueSize < batchSize * 2) {
      return {
        status: 'healthy',
        message: 'Queue size is within normal range'
      };
    }
    
    if (queueSize < batchSize * 5) {
      return {
        status: 'degraded',
        message: 'Queue is building up - consider monitoring',
        suggestedActions: [
          'Monitor queue processing rate',
          'Check database connection performance'
        ]
      };
    }
    
    return {
      status: 'unhealthy',
      message: 'Queue is overloaded - immediate attention required',
      suggestedActions: [
        'Flush queue immediately',
        'Check database connectivity',
        'Consider increasing batch size',
        'Investigate logging bottlenecks'
      ]
    };
  }

  /**
   * Mock connection pool statistics (in real implementation, would integrate with actual pool)
   */
  private getMockConnectionPoolStats() {
    return {
      totalCount: 10,
      idleCount: 8,
      waitingCount: 0
    };
  }

  /**
   * Returns service uptime in milliseconds
   */
  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Simple health check that returns boolean
   */
  public async isHealthy(): Promise<boolean> {
    try {
      const result = await this.performHealthCheck();
      return result.healthy;
    } catch (error) {
      return false;
    }
  }
}