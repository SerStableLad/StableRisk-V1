# Task 09: Event Publishing System

## Overview
Implement event-driven architecture by adding event publishing to the main application, enabling loose coupling between services and supporting future distributed patterns.

## Time Estimate: 5-6 days

## Prerequisites
- All Phase 1 and Phase 2 tasks completed (Tasks 01-08)
- Understanding of existing data flows and business events
- Redis or message queue system for event transport
- Event schemas defined for main business entities

## Technical Requirements

### 1. Event Publishing Service
```typescript
// src/lib/events/event-publisher.ts
export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  data: Record<string, any>;
  metadata: {
    timestamp: Date;
    version: string;
    source: string;
    correlationId?: string;
    causationId?: string;
    userId?: string;
    [key: string]: any;
  };
}

export interface EventPublisherOptions {
  transport: 'redis' | 'memory' | 'database';
  batchSize?: number;
  flushInterval?: number;
  retryAttempts?: number;
  enableMetrics?: boolean;
}

export class EventPublisher {
  private static instance: EventPublisher;
  private eventQueue: DomainEvent[] = [];
  private isProcessing = false;
  private flushInterval: NodeJS.Timeout | null = null;
  private transports: Map<string, EventTransport> = new Map();

  private constructor(private options: EventPublisherOptions) {
    this.initializeTransports();
    this.startBatchProcessing();
  }

  public static getInstance(options?: EventPublisherOptions): EventPublisher {
    if (!EventPublisher.instance) {
      EventPublisher.instance = new EventPublisher(options || {
        transport: 'redis',
        batchSize: 50,
        flushInterval: 5000,
        retryAttempts: 3,
        enableMetrics: true
      });
    }
    return EventPublisher.instance;
  }

  async publish(event: Omit<DomainEvent, 'id' | 'metadata'> & { 
    metadata?: Partial<DomainEvent['metadata']> 
  }): Promise<void> {
    const domainEvent: DomainEvent = {
      id: this.generateEventId(),
      ...event,
      metadata: {
        timestamp: new Date(),
        version: '1.0',
        source: 'stablerisk-main',
        correlationId: this.generateCorrelationId(),
        ...event.metadata
      }
    };

    // Add to queue for batch processing
    this.eventQueue.push(domainEvent);

    // Record metrics
    if (this.options.enableMetrics) {
      await this.recordMetric('events.published', 1, {
        type: event.type,
        aggregateType: event.aggregateType
      });
    }

    // Immediate flush if queue is getting large
    if (this.eventQueue.length >= (this.options.batchSize || 50)) {
      setImmediate(() => this.processBatch());
    }
  }

  async publishMany(events: Array<Omit<DomainEvent, 'id' | 'metadata'> & { 
    metadata?: Partial<DomainEvent['metadata']> 
  }>): Promise<void> {
    const domainEvents = events.map(event => ({
      id: this.generateEventId(),
      ...event,
      metadata: {
        timestamp: new Date(),
        version: '1.0',
        source: 'stablerisk-main',
        correlationId: this.generateCorrelationId(),
        ...event.metadata
      }
    }));

    this.eventQueue.push(...domainEvents);

    if (this.options.enableMetrics) {
      await this.recordMetric('events.batch_published', domainEvents.length, {
        batch_size: domainEvents.length.toString()
      });
    }
  }

  // Business event publishers
  async publishStablecoinDataUpdated(
    ticker: string,
    data: any,
    source: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.publish({
      type: 'StablecoinDataUpdated',
      aggregateId: ticker,
      aggregateType: 'stablecoin',
      data: {
        ticker,
        data,
        source,
        updatedAt: new Date().toISOString()
      },
      metadata: {
        ...metadata,
        dataSource: source,
        dataSize: JSON.stringify(data).length
      }
    });
  }

  async publishTransparencyAnalysisCompleted(
    ticker: string,
    analysis: any,
    score: number,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.publish({
      type: 'TransparencyAnalysisCompleted',
      aggregateId: ticker,
      aggregateType: 'transparency',
      data: {
        ticker,
        analysis,
        score,
        completedAt: new Date().toISOString()
      },
      metadata: {
        ...metadata,
        analysisScore: score,
        analysisComplexity: Object.keys(analysis).length
      }
    });
  }

  async publishCacheOperationPerformed(
    key: string,
    operation: 'set' | 'get' | 'delete' | 'invalidate',
    success: boolean,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.publish({
      type: 'CacheOperationPerformed',
      aggregateId: key,
      aggregateType: 'cache',
      data: {
        key,
        operation,
        success,
        timestamp: new Date().toISOString()
      },
      metadata: {
        ...metadata,
        cacheOperation: operation,
        operationSuccess: success
      }
    });
  }

  async publishAPIRequestProcessed(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.publish({
      type: 'APIRequestProcessed',
      aggregateId: `${method}:${endpoint}`,
      aggregateType: 'api',
      data: {
        endpoint,
        method,
        statusCode,
        duration,
        processedAt: new Date().toISOString()
      },
      metadata: {
        ...metadata,
        httpMethod: method,
        responseStatus: statusCode,
        requestDuration: duration
      }
    });
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const batchSize = this.options.batchSize || 50;
    const batch = this.eventQueue.splice(0, batchSize);

    try {
      const transport = this.transports.get(this.options.transport);
      if (!transport) {
        throw new Error(`Transport ${this.options.transport} not available`);
      }

      await transport.publishBatch(batch);

      if (this.options.enableMetrics) {
        await this.recordMetric('events.batch_processed', batch.length, {
          transport: this.options.transport,
          batch_size: batch.length.toString()
        });
      }

      console.log(`Published batch of ${batch.length} events via ${this.options.transport}`);
    } catch (error) {
      console.error('Failed to publish event batch:', error);
      
      // Re-queue events for retry
      this.eventQueue.unshift(...batch);

      if (this.options.enableMetrics) {
        await this.recordMetric('events.batch_failed', batch.length, {
          transport: this.options.transport,
          error: error.message
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private initializeTransports(): void {
    // Redis transport
    this.transports.set('redis', new RedisEventTransport());
    
    // Database transport
    this.transports.set('database', new DatabaseEventTransport());
    
    // Memory transport (for testing)
    this.transports.set('memory', new MemoryEventTransport());
  }

  private startBatchProcessing(): void {
    const interval = this.options.flushInterval || 5000;
    this.flushInterval = setInterval(() => {
      this.processBatch();
    }, interval);
  }

  async flush(): Promise<void> {
    while (this.eventQueue.length > 0 && !this.isProcessing) {
      await this.processBatch();
      // Small delay to prevent overwhelming the transport
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async getQueueStatus(): Promise<{
    pending: number;
    processing: boolean;
    transport: string;
  }> {
    return {
      pending: this.eventQueue.length,
      processing: this.isProcessing,
      transport: this.options.transport
    };
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    
    console.log('Flushing remaining events before shutdown...');
    await this.flush();
    
    // Close transports
    for (const transport of this.transports.values()) {
      await transport.close();
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async recordMetric(name: string, value: number, labels: Record<string, string>): Promise<void> {
    try {
      // Use metrics service client if available
      const { MetricsServiceClient } = await import('../clients/metrics-service-client');
      const metricsClient = MetricsServiceClient.getInstance();
      await metricsClient.recordMetric(name, value, labels);
    } catch (error) {
      // Metrics service not available, log locally
      console.log(`Metric: ${name}=${value}`, labels);
    }
  }
}
```

### 2. Event Transport Implementations
```typescript
// src/lib/events/transports/redis-event-transport.ts
import { Redis } from 'ioredis';
import { DomainEvent } from '../event-publisher';

export class RedisEventTransport implements EventTransport {
  private redis: Redis;
  private streamName = 'stablerisk:events';

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });
  }

  async publishBatch(events: DomainEvent[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const event of events) {
      // Add to Redis Stream
      pipeline.xadd(
        this.streamName,
        '*', // Auto-generate ID
        'id', event.id,
        'type', event.type,
        'aggregateId', event.aggregateId,
        'aggregateType', event.aggregateType,
        'data', JSON.stringify(event.data),
        'metadata', JSON.stringify(event.metadata)
      );

      // Also publish to channels for real-time subscribers
      pipeline.publish(
        `events:${event.aggregateType}`,
        JSON.stringify(event)
      );
      
      pipeline.publish(
        `events:${event.type}`,
        JSON.stringify(event)
      );
    }

    await pipeline.exec();
  }

  async close(): Promise<void> {
    await this.redis.disconnect();
  }
}

// src/lib/events/transports/database-event-transport.ts
export class DatabaseEventTransport implements EventTransport {
  private db = DatabaseConnection.getInstance();

  async publishBatch(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    const values = events.map((event, index) => {
      const baseIndex = index * 6;
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`;
    }).join(', ');

    const query = `
      INSERT INTO events.event_log 
      (id, aggregate_id, aggregate_type, event_type, event_data, metadata)
      VALUES ${values}
    `;

    const params = events.flatMap(event => [
      event.id,
      event.aggregateId,
      event.aggregateType,
      event.type,
      JSON.stringify(event.data),
      JSON.stringify(event.metadata)
    ]);

    await this.db.query(query, params);
  }

  async close(): Promise<void> {
    // Database connection managed elsewhere
  }
}

// src/lib/events/transports/memory-event-transport.ts
export class MemoryEventTransport implements EventTransport {
  private events: DomainEvent[] = [];
  private subscribers: Array<(event: DomainEvent) => void> = [];

  async publishBatch(events: DomainEvent[]): Promise<void> {
    this.events.push(...events);
    
    // Notify subscribers
    for (const event of events) {
      this.subscribers.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('Event subscriber error:', error);
        }
      });
    }

    // Keep only last 1000 events in memory
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  subscribe(callback: (event: DomainEvent) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  getEvents(): DomainEvent[] {
    return [...this.events];
  }

  async close(): Promise<void> {
    this.events = [];
    this.subscribers = [];
  }
}

export interface EventTransport {
  publishBatch(events: DomainEvent[]): Promise<void>;
  close(): Promise<void>;
}
```

### 3. Event Publishing Middleware
```typescript
// src/lib/middleware/event-publishing-middleware.ts
import { EventPublisher } from '../events/event-publisher';

export function withEventPublishing<T extends (...args: any[]) => any>(
  fn: T,
  eventConfig: {
    eventType: string;
    getAggregateId: (...args: Parameters<T>) => string;
    getAggregateType: (...args: Parameters<T>) => string;
    getData?: (...args: Parameters<T>) => Record<string, any>;
    getMetadata?: (...args: Parameters<T>) => Record<string, any>;
  }
): T {
  const publisher = EventPublisher.getInstance();

  return ((...args: Parameters<T>) => {
    const result = fn(...args);
    
    // For async functions
    if (result && typeof result.then === 'function') {
      return result.then(async (value: any) => {
        try {
          await publisher.publish({
            type: eventConfig.eventType,
            aggregateId: eventConfig.getAggregateId(...args),
            aggregateType: eventConfig.getAggregateType(...args),
            data: {
              result: typeof value === 'object' ? Object.keys(value) : value,
              ...(eventConfig.getData ? eventConfig.getData(...args) : {})
            },
            metadata: {
              success: true,
              executionTime: Date.now(),
              ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
            }
          });
        } catch (eventError) {
          console.error('Failed to publish success event:', eventError);
        }
        return value;
      }).catch(async (error: any) => {
        try {
          await publisher.publish({
            type: eventConfig.eventType,
            aggregateId: eventConfig.getAggregateId(...args),
            aggregateType: eventConfig.getAggregateType(...args),
            data: {
              error: error.message,
              ...(eventConfig.getData ? eventConfig.getData(...args) : {})
            },
            metadata: {
              success: false,
              errorType: error.constructor.name,
              ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
            }
          });
        } catch (eventError) {
          console.error('Failed to publish error event:', eventError);
        }
        throw error;
      });
    }
    
    // For sync functions
    try {
      publisher.publish({
        type: eventConfig.eventType,
        aggregateId: eventConfig.getAggregateId(...args),
        aggregateType: eventConfig.getAggregateType(...args),
        data: {
          result: typeof result === 'object' ? Object.keys(result) : result,
          ...(eventConfig.getData ? eventConfig.getData(...args) : {})
        },
        metadata: {
          success: true,
          ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
        }
      });
    } catch (eventError) {
      console.error('Failed to publish sync event:', eventError);
    }
    
    return result;
  }) as T;
}

// Decorator version
export function PublishEvent(eventConfig: {
  eventType: string;
  aggregateType: string;
  getAggregateId?: string; // Property name to use as aggregate ID
}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const publisher = EventPublisher.getInstance();

    descriptor.value = async function (...args: any[]) {
      const aggregateId = eventConfig.getAggregateId 
        ? this[eventConfig.getAggregateId] || args[0]
        : args[0];

      try {
        const result = await originalMethod.apply(this, args);
        
        await publisher.publish({
          type: eventConfig.eventType,
          aggregateId: aggregateId?.toString() || 'unknown',
          aggregateType: eventConfig.aggregateType,
          data: {
            method: propertyKey,
            arguments: args.map(arg => typeof arg === 'object' ? Object.keys(arg) : arg),
            result: typeof result === 'object' ? Object.keys(result) : result
          },
          metadata: {
            success: true,
            className: target.constructor.name,
            methodName: propertyKey
          }
        });

        return result;
      } catch (error) {
        await publisher.publish({
          type: eventConfig.eventType,
          aggregateId: aggregateId?.toString() || 'unknown',
          aggregateType: eventConfig.aggregateType,
          data: {
            method: propertyKey,
            arguments: args.map(arg => typeof arg === 'object' ? Object.keys(arg) : arg),
            error: error.message
          },
          metadata: {
            success: false,
            className: target.constructor.name,
            methodName: propertyKey,
            errorType: error.constructor.name
          }
        });

        throw error;
      }
    };

    return descriptor;
  };
}
```

### 4. Integration with Existing Services
```typescript
// src/lib/services/enhanced-stablecoin-data-service.ts
import { StablecoinDataService } from './stablecoin-data';
import { EventPublisher } from '../events/event-publisher';
import { PublishEvent } from '../middleware/event-publishing-middleware';

export class EnhancedStablecoinDataService extends StablecoinDataService {
  private eventPublisher = EventPublisher.getInstance();

  @PublishEvent({
    eventType: 'StablecoinDataRequested',
    aggregateType: 'stablecoin'
  })
  async getStablecoinData(ticker: string): Promise<any> {
    const data = await super.getStablecoinData(ticker);
    
    // Publish specific business event
    await this.eventPublisher.publishStablecoinDataUpdated(
      ticker,
      data,
      'api-request',
      {
        cacheHit: data._fromCache || false,
        dataFreshness: data._lastUpdated ? Date.now() - new Date(data._lastUpdated).getTime() : 0
      }
    );

    return data;
  }

  @PublishEvent({
    eventType: 'StablecoinDataRefreshed',
    aggregateType: 'stablecoin'
  })
  async refreshStablecoinData(ticker: string): Promise<any> {
    const data = await this.fetchFreshData(ticker);
    
    await this.eventPublisher.publishStablecoinDataUpdated(
      ticker,
      data,
      'refresh-request',
      {
        refreshTrigger: 'manual',
        dataSize: JSON.stringify(data).length
      }
    );

    return data;
  }
}
```

### 5. Event Publishing Health Check
```typescript
// src/lib/health/event-publishing-health.ts
import { EventPublisher } from '../events/event-publisher';

export class EventPublishingHealthCheck {
  private publisher = EventPublisher.getInstance();

  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      const queueStatus = await this.publisher.getQueueStatus();
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (queueStatus.pending > 1000) {
        status = 'degraded';
      } else if (queueStatus.pending > 5000) {
        status = 'unhealthy';
      }

      // Test publishing
      const testEventId = `health-check-${Date.now()}`;
      await this.publisher.publish({
        type: 'HealthCheckEvent',
        aggregateId: testEventId,
        aggregateType: 'system',
        data: { test: true },
        metadata: { source: 'health-check' }
      });

      return {
        status,
        details: {
          queue: queueStatus,
          testEvent: testEventId,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [ ] Event publisher successfully publishes events to configured transport
- [ ] Batch processing optimizes throughput without blocking main application
- [ ] Business events are published for key operations (data updates, API requests)
- [ ] Event middleware works with existing service methods
- [ ] Health checks validate event publishing system status

### Performance Requirements
- [ ] Event publishing adds < 5ms overhead to business operations
- [ ] Batch processing handles 1000+ events per minute
- [ ] Event queue processing doesn't block main thread
- [ ] Memory usage for queued events stays under 50MB

### Integration Requirements
- [ ] Works with existing service architecture without breaking changes
- [ ] Events include proper correlation and causation tracking
- [ ] Failed event publishing doesn't impact main business logic
- [ ] Multiple transport options available for different environments

## Testing
```bash
# Test event publishing
npm run test:event-publishing

# Test event transports
npm run test:event-transports

# Test integration with services
npm run test:event-integration

# Performance test
npm run test:event-performance

# Health check
curl http://localhost:3000/api/health/events
```

## Rollback Plan
1. Remove event publishing calls from services
2. Disable event publishing middleware/decorators
3. Keep event publisher service but stop processing
4. Remove event transport connections
5. Keep database event log table for future use

## Dependencies
- All Phase 1 and Phase 2 tasks (01-08)
- Redis or alternative message transport
- Database event log table from Task 01
- Understanding of existing business processes

## Risks & Mitigation
- **Risk**: Event publishing failures impact main business logic
  - **Mitigation**: Async processing, error isolation, graceful degradation
- **Risk**: Event queue grows too large and consumes memory
  - **Mitigation**: Batch processing, queue size limits, monitoring
- **Risk**: Transport failures cause event loss
  - **Mitigation**: Multiple transport options, retry logic, persistent queuing

## Notes
- Event publishing designed to be completely non-blocking
- Multiple transport options support different deployment scenarios
- Event schema includes correlation tracking for distributed tracing
- Batch processing optimizes performance while maintaining reliability
- Health checks provide visibility into event publishing system status
- Integration preserves existing business logic while adding event capabilities