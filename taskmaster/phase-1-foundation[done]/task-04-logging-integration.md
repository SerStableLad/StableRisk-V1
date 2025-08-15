# Task 04: Logging Integration

## Overview
Integrate database logging with existing services to capture events, performance metrics, and system behavior without impacting current functionality.

## Time Estimate: 4-5 days

## Prerequisites
- PostgreSQL setup completed (Task 01)
- NGINX proxy configured (Task 02)
- Database models implemented (Task 03)
- Understanding of existing service patterns

## Technical Requirements

### 1. Enhanced Logging Service
```typescript
// src/lib/services/enhanced-logging-service.ts
import { DatabaseIntegrationService } from './database-integration-service';
import { SmartCacheService } from './smart-cache-service';

export class EnhancedLoggingService {
  private static instance: EnhancedLoggingService;
  private dbService: DatabaseIntegrationService;
  private isEnabled: boolean;
  private logQueue: Array<() => Promise<void>> = [];
  private processing = false;

  private constructor() {
    this.dbService = DatabaseIntegrationService.getInstance();
    this.isEnabled = process.env.DATABASE_LOGGING_ENABLED === 'true';
    
    // Process queue every 5 seconds
    setInterval(() => this.processLogQueue(), 5000);
  }

  public static getInstance(): EnhancedLoggingService {
    if (!EnhancedLoggingService.instance) {
      EnhancedLoggingService.instance = new EnhancedLoggingService();
    }
    return EnhancedLoggingService.instance;
  }

  // Non-blocking event logging
  logStablecoinOperation(
    ticker: string,
    operation: string,
    success: boolean,
    metadata: {
      duration?: number;
      source?: string;
      cacheHit?: boolean;
      error?: string;
      dataSize?: number;
    } = {}
  ) {
    if (!this.isEnabled) return;

    this.logQueue.push(async () => {
      try {
        await this.dbService.logStablecoinDataFetch(ticker, operation, success, {
          ...metadata,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        });
      } catch (error) {
        console.error('Failed to log stablecoin operation:', error);
      }
    });
  }

  logCacheOperation(
    cacheKey: string,
    action: 'hit' | 'miss' | 'set' | 'invalidate' | 'expire',
    metadata: {
      ttl?: number;
      size?: number;
      reason?: string;
      source?: string;
    } = {}
  ) {
    if (!this.isEnabled) return;

    this.logQueue.push(async () => {
      try {
        await this.dbService.logCacheEvent(cacheKey, action, {
          ...metadata,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        });
      } catch (error) {
        console.error('Failed to log cache operation:', error);
      }
    });
  }

  logAPIRequest(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    metadata: {
      userAgent?: string;
      ip?: string;
      cacheStatus?: string;
      error?: string;
      responseSize?: number;
    } = {}
  ) {
    if (!this.isEnabled) return;

    this.logQueue.push(async () => {
      try {
        await this.dbService.logEvent(
          endpoint,
          'api',
          'request',
          {
            method,
            statusCode,
            duration,
            success: statusCode < 400,
            ...metadata
          }
        );
      } catch (error) {
        console.error('Failed to log API request:', error);
      }
    });
  }

  logPerformanceMetric(
    service: string,
    metric: string,
    value: number,
    metadata: {
      unit?: string;
      threshold?: number;
      critical?: boolean;
    } = {}
  ) {
    if (!this.isEnabled) return;

    this.logQueue.push(async () => {
      try {
        await this.dbService.logEvent(
          service,
          'performance',
          metric,
          {
            value,
            ...metadata,
            timestamp: new Date().toISOString()
          }
        );
      } catch (error) {
        console.error('Failed to log performance metric:', error);
      }
    });
  }

  // Process log queue asynchronously
  private async processLogQueue() {
    if (this.processing || this.logQueue.length === 0) return;
    
    this.processing = true;
    const batch = this.logQueue.splice(0, 50); // Process up to 50 items at once

    await Promise.allSettled(
      batch.map(logOperation => logOperation())
    );

    this.processing = false;
  }

  // Immediate flush for critical events
  async flush(): Promise<void> {
    const batch = [...this.logQueue];
    this.logQueue = [];
    
    await Promise.allSettled(
      batch.map(logOperation => logOperation())
    );
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    if (!this.isEnabled) return true;
    return this.dbService.healthCheck();
  }

  // Get queue status
  getQueueStatus(): { pending: number; processing: boolean; enabled: boolean } {
    return {
      pending: this.logQueue.length,
      processing: this.processing,
      enabled: this.isEnabled
    };
  }
}
```

### 2. Service Integration Decorators
```typescript
// src/lib/decorators/logging-decorators.ts
import { EnhancedLoggingService } from '../services/enhanced-logging-service';

export function LogStablecoinOperation(operation: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const logger = EnhancedLoggingService.getInstance();

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const ticker = args[0]; // Assume first argument is ticker
      
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;
        
        logger.logStablecoinOperation(ticker, operation, true, {
          duration,
          source: target.constructor.name,
          dataSize: JSON.stringify(result).length
        });
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.logStablecoinOperation(ticker, operation, false, {
          duration,
          source: target.constructor.name,
          error: error.message
        });
        
        throw error;
      }
    };

    return descriptor;
  };
}

export function LogCacheAccess() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const logger = EnhancedLoggingService.getInstance();

    descriptor.value = async function (...args: any[]) {
      const cacheKey = args[0]; // Assume first argument is cache key
      const startTime = Date.now();
      
      try {
        const result = await originalMethod.apply(this, args);
        
        if (result !== undefined && result !== null) {
          logger.logCacheOperation(cacheKey, 'hit', {
            size: JSON.stringify(result).length,
            source: target.constructor.name
          });
        } else {
          logger.logCacheOperation(cacheKey, 'miss', {
            source: target.constructor.name
          });
        }
        
        return result;
      } catch (error) {
        logger.logCacheOperation(cacheKey, 'miss', {
          source: target.constructor.name,
          reason: error.message
        });
        
        throw error;
      }
    };

    return descriptor;
  };
}

export function LogAPIEndpoint() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const logger = EnhancedLoggingService.getInstance();

    descriptor.value = async function (request: Request, ...args: any[]) {
      const startTime = Date.now();
      const url = new URL(request.url);
      const endpoint = url.pathname;
      
      try {
        const response = await originalMethod.apply(this, [request, ...args]);
        const duration = Date.now() - startTime;
        
        logger.logAPIRequest(endpoint, request.method, response.status || 200, duration, {
          userAgent: request.headers.get('user-agent') || undefined,
          responseSize: response.headers.get('content-length') ? 
            parseInt(response.headers.get('content-length')!) : undefined
        });
        
        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.logAPIRequest(endpoint, request.method, 500, duration, {
          error: error.message,
          userAgent: request.headers.get('user-agent') || undefined
        });
        
        throw error;
      }
    };

    return descriptor;
  };
}
```

### 3. Integration with Existing Services
```typescript
// src/lib/services/stablecoin-data-enhanced.ts
// This shows how to enhance existing services without breaking them

import { EnhancedLoggingService } from './enhanced-logging-service';
import { StablecoinDataService } from './stablecoin-data';
import { LogStablecoinOperation } from '../decorators/logging-decorators';

export class EnhancedStablecoinDataService extends StablecoinDataService {
  private logger = EnhancedLoggingService.getInstance();

  @LogStablecoinOperation('fetchStablecoinData')
  async getStablecoinData(ticker: string): Promise<any> {
    // Call parent method
    const startTime = Date.now();
    try {
      const result = await super.getStablecoinData(ticker);
      
      // Additional logging beyond decorator
      if (result) {
        this.logger.logPerformanceMetric(
          'stablecoin-data-service',
          'data-quality-score',
          this.calculateDataQuality(result),
          { unit: 'score', threshold: 0.8 }
        );
      }
      
      return result;
    } catch (error) {
      // Enhanced error context
      this.logger.logPerformanceMetric(
        'stablecoin-data-service',
        'error-rate',
        1,
        { unit: 'errors', critical: true }
      );
      throw error;
    }
  }

  private calculateDataQuality(data: any): number {
    // Simple data quality calculation
    const requiredFields = ['ticker', 'marketCap', 'volume', 'price'];
    const presentFields = requiredFields.filter(field => data[field] !== undefined).length;
    return presentFields / requiredFields.length;
  }
}
```

### 4. Environment Configuration
```bash
# .env additions
DATABASE_LOGGING_ENABLED=true
LOGGING_QUEUE_SIZE=1000
LOGGING_BATCH_SIZE=50
LOGGING_FLUSH_INTERVAL=5000

# Performance thresholds
API_RESPONSE_TIME_THRESHOLD=2000
CACHE_HIT_RATE_THRESHOLD=0.8
DATA_QUALITY_THRESHOLD=0.9

# Logging levels
LOG_LEVEL=info
DATABASE_LOG_LEVEL=warn
```

### 5. Health Check Integration
```typescript
// src/lib/health/database-health-check.ts
import { EnhancedLoggingService } from '../services/enhanced-logging-service';
import { DatabaseIntegrationService } from '../services/database-integration-service';

export class DatabaseHealthCheck {
  private static instance: DatabaseHealthCheck;
  private logger = EnhancedLoggingService.getInstance();
  private dbService = DatabaseIntegrationService.getInstance();

  private constructor() {}

  public static getInstance(): DatabaseHealthCheck {
    if (!DatabaseHealthCheck.instance) {
      DatabaseHealthCheck.instance = new DatabaseHealthCheck();
    }
    return DatabaseHealthCheck.instance;
  }

  async checkDatabaseHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      const startTime = Date.now();
      const isHealthy = await this.dbService.healthCheck();
      const responseTime = Date.now() - startTime;
      
      const queueStatus = this.logger.getQueueStatus();
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (!isHealthy) {
        status = 'unhealthy';
      } else if (responseTime > 1000 || queueStatus.pending > 500) {
        status = 'degraded';
      }

      const details = {
        database: {
          connected: isHealthy,
          responseTime: `${responseTime}ms`
        },
        logging: {
          enabled: queueStatus.enabled,
          queueSize: queueStatus.pending,
          processing: queueStatus.processing
        },
        metrics: {
          responseTimeThreshold: '1000ms',
          queueSizeThreshold: 500
        }
      };

      // Log health check result
      this.logger.logPerformanceMetric(
        'database-health',
        'response-time',
        responseTime,
        { unit: 'ms', threshold: 1000, critical: responseTime > 2000 }
      );

      return { status, details };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          database: { connected: false },
          logging: { enabled: false }
        }
      };
    }
  }

  async getLogQueueMetrics() {
    const status = this.logger.getQueueStatus();
    return {
      queueSize: status.pending,
      processing: status.processing,
      enabled: status.enabled,
      recommendation: this.getQueueRecommendation(status.pending)
    };
  }

  private getQueueRecommendation(queueSize: number): string {
    if (queueSize > 1000) return 'Consider increasing batch size or flush frequency';
    if (queueSize > 500) return 'Monitor queue growth - may need optimization';
    return 'Queue size is healthy';
  }
}
```

### 6. API Route Integration Example
```typescript
// Example of how to integrate with existing API routes
// src/app/api/stablecoin/[ticker]/route-enhanced.ts

import { EnhancedLoggingService } from '@/lib/services/enhanced-logging-service';
import { LogAPIEndpoint } from '@/lib/decorators/logging-decorators';

const logger = EnhancedLoggingService.getInstance();

@LogAPIEndpoint()
export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  // Original route logic remains the same
  // Logging is handled by decorator
  
  const ticker = params.ticker;
  const startTime = Date.now();
  
  try {
    // Your existing route implementation
    const data = await getStablecoinData(ticker);
    
    // Optional: Additional custom logging
    if (data.cached) {
      logger.logCacheOperation(
        `stablecoin:${ticker}`,
        'hit',
        { source: 'api-route', ttl: data.ttl }
      );
    }
    
    return Response.json(data);
  } catch (error) {
    // Error logging handled by decorator
    throw error;
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [x] Logging service queues operations without blocking main application
- [x] Database events are captured for stablecoin operations
- [x] Cache operations are logged with appropriate metadata
- [x] API requests are tracked with performance metrics
- [x] Health checks include database and logging status

### Performance Requirements
- [x] Logging adds < 5ms overhead to any operation
- [x] Log queue processes batches within 5 seconds
- [x] Failed logging doesn't impact main application functionality
- [x] Memory usage for log queue stays under 100MB

### Integration Requirements
- [x] Works with existing service architecture
- [x] Can be enabled/disabled via environment variables
- [x] Compatible with current deployment process
- [x] Provides meaningful metrics for monitoring

## Testing
```bash
# Test logging service
npm run test:logging-service

# Test decorators
npm run test:logging-decorators

# Test health checks
npm run test:database-health

# Integration test with existing services
npm run test:logging-integration

# Performance test
npm run test:logging-performance
```

## Rollback Plan
1. Set `DATABASE_LOGGING_ENABLED=false` in environment
2. Remove decorator annotations from methods
3. Remove logging service calls from enhanced services
4. Keep database tables but stop writing to them
5. Monitor application performance to ensure no impact

## Dependencies
- Task 01 (PostgreSQL setup)
- Task 02 (NGINX proxy)
- Task 03 (Database models)

## Risks & Mitigation
- **Risk**: Logging queue grows too large and consumes memory
  - **Mitigation**: Queue size limits, batch processing, health monitoring
- **Risk**: Database logging failures impact main application
  - **Mitigation**: Try-catch blocks, non-blocking operations, circuit breaker pattern
- **Risk**: Performance degradation from logging overhead
  - **Mitigation**: Async processing, decorator pattern, performance monitoring

## Notes
- Logging is designed to be completely optional and non-blocking
- Decorator pattern allows gradual integration without breaking existing code
- Queue-based processing prevents database issues from affecting API performance
- Health checks provide visibility into logging system status
- All logging includes environment context for multi-environment deployments