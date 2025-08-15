# Task 10: Event Consumption System

## Overview
Implement event consumption capabilities across extracted services, enabling them to react to business events and maintain data consistency in the distributed architecture.

## Time Estimate: 6-7 days

## Prerequisites
- All Phase 1 and Phase 2 tasks completed (Tasks 01-08)
- Event publishing system implemented (Task 09)
- Understanding of service communication patterns
- Redis streams or message queue for event transport

## Technical Requirements

### 1. Event Consumer Framework
```typescript
// src/lib/events/event-consumer.ts
import { DomainEvent } from './event-publisher';

export interface EventHandler<T = any> {
  eventType: string;
  handle(event: DomainEvent<T>): Promise<void>;
  onError?(event: DomainEvent<T>, error: Error): Promise<void>;
}

export interface EventConsumerOptions {
  consumerGroup: string;
  consumerName: string;
  transport: 'redis' | 'memory' | 'database';
  batchSize?: number;
  pollInterval?: number;
  maxRetries?: number;
  enableMetrics?: boolean;
}

export class EventConsumer {
  private handlers = new Map<string, EventHandler[]>();
  private isRunning = false;
  private transport: EventConsumerTransport;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(private options: EventConsumerOptions) {
    this.transport = this.createTransport();
  }

  // Register event handlers
  registerHandler<T>(handler: EventHandler<T>): void {
    if (!this.handlers.has(handler.eventType)) {
      this.handlers.set(handler.eventType, []);
    }
    this.handlers.get(handler.eventType)!.push(handler);
    console.log(`Registered handler for ${handler.eventType}`);
  }

  // Register multiple handlers at once
  registerHandlers(handlers: EventHandler[]): void {
    handlers.forEach(handler => this.registerHandler(handler));
  }

  // Start consuming events
  async start(): Promise<void> {
    if (this.isRunning) return;

    console.log(`Starting event consumer: ${this.options.consumerGroup}:${this.options.consumerName}`);
    this.isRunning = true;

    await this.transport.initialize();

    // Start polling for events
    this.pollInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.processEvents();
      }
    }, this.options.pollInterval || 1000);

    // Initial processing
    setImmediate(() => this.processEvents());
  }

  // Stop consuming events
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log(`Stopping event consumer: ${this.options.consumerGroup}:${this.options.consumerName}`);
    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    await this.transport.close();
  }

  private async processEvents(): Promise<void> {
    try {
      const events = await this.transport.fetchEvents(this.options.batchSize || 10);
      
      if (events.length === 0) return;

      console.log(`Processing ${events.length} events`);

      // Process events in parallel
      const processPromises = events.map(async (event) => {
        try {
          await this.processEvent(event);
          await this.transport.acknowledgeEvent(event);
          
          if (this.options.enableMetrics) {
            await this.recordMetric('events.processed', 1, {
              type: event.type,
              consumer: this.options.consumerName
            });
          }
        } catch (error) {
          console.error(`Failed to process event ${event.id}:`, error);
          await this.handleEventError(event, error);
        }
      });

      await Promise.allSettled(processPromises);
    } catch (error) {
      console.error('Event processing batch failed:', error);
      
      if (this.options.enableMetrics) {
        await this.recordMetric('events.batch_error', 1, {
          consumer: this.options.consumerName,
          error: error.message
        });
      }
    }
  }

  private async processEvent(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    
    if (handlers.length === 0) {
      console.log(`No handlers registered for event type: ${event.type}`);
      return;
    }

    // Execute all handlers for this event type
    const handlerPromises = handlers.map(async (handler) => {
      try {
        await handler.handle(event);
      } catch (error) {
        console.error(`Handler failed for event ${event.id} (${event.type}):`, error);
        
        if (handler.onError) {
          await handler.onError(event, error);
        }
        
        throw error;
      }
    });

    await Promise.all(handlerPromises);
  }

  private async handleEventError(event: DomainEvent, error: Error): Promise<void> {
    const maxRetries = this.options.maxRetries || 3;
    const currentAttempt = (event.metadata.attemptCount as number) || 1;

    if (currentAttempt < maxRetries) {
      // Retry the event
      event.metadata.attemptCount = currentAttempt + 1;
      event.metadata.lastError = error.message;
      event.metadata.retryAt = new Date(Date.now() + (currentAttempt * 5000)); // Exponential backoff
      
      await this.transport.retryEvent(event);
      
      if (this.options.enableMetrics) {
        await this.recordMetric('events.retried', 1, {
          type: event.type,
          attempt: currentAttempt.toString()
        });
      }
    } else {
      // Move to dead letter queue
      console.error(`Event ${event.id} failed after ${maxRetries} attempts, moving to dead letter queue`);
      await this.transport.moveToDeadLetter(event, error);
      
      if (this.options.enableMetrics) {
        await this.recordMetric('events.dead_letter', 1, {
          type: event.type,
          error: error.message
        });
      }
    }
  }

  private createTransport(): EventConsumerTransport {
    switch (this.options.transport) {
      case 'redis':
        return new RedisEventConsumerTransport(this.options);
      case 'memory':
        return new MemoryEventConsumerTransport(this.options);
      case 'database':
        return new DatabaseEventConsumerTransport(this.options);
      default:
        throw new Error(`Unsupported transport: ${this.options.transport}`);
    }
  }

  async getStatus(): Promise<{
    running: boolean;
    consumerGroup: string;
    consumerName: string;
    handlersCount: number;
    transport: string;
  }> {
    return {
      running: this.isRunning,
      consumerGroup: this.options.consumerGroup,
      consumerName: this.options.consumerName,
      handlersCount: Array.from(this.handlers.values()).reduce((total, handlers) => total + handlers.length, 0),
      transport: this.options.transport
    };
  }

  private async recordMetric(name: string, value: number, labels: Record<string, string>): Promise<void> {
    try {
      const { MetricsServiceClient } = await import('../clients/metrics-service-client');
      const metricsClient = MetricsServiceClient.getInstance();
      await metricsClient.recordMetric(name, value, labels);
    } catch (error) {
      console.log(`Metric: ${name}=${value}`, labels);
    }
  }
}

export interface EventConsumerTransport {
  initialize(): Promise<void>;
  fetchEvents(batchSize: number): Promise<DomainEvent[]>;
  acknowledgeEvent(event: DomainEvent): Promise<void>;
  retryEvent(event: DomainEvent): Promise<void>;
  moveToDeadLetter(event: DomainEvent, error: Error): Promise<void>;
  close(): Promise<void>;
}
```

### 2. Redis Event Consumer Transport
```typescript
// src/lib/events/transports/redis-event-consumer-transport.ts
import { Redis } from 'ioredis';
import { DomainEvent } from '../event-publisher';
import { EventConsumerTransport, EventConsumerOptions } from '../event-consumer';

export class RedisEventConsumerTransport implements EventConsumerTransport {
  private redis: Redis;
  private streamName = 'stablerisk:events';
  private consumerGroup: string;
  private consumerName: string;

  constructor(private options: EventConsumerOptions) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    });
    
    this.consumerGroup = options.consumerGroup;
    this.consumerName = options.consumerName;
  }

  async initialize(): Promise<void> {
    try {
      // Create consumer group if it doesn't exist
      await this.redis.xgroup(
        'CREATE',
        this.streamName,
        this.consumerGroup,
        '0',
        'MKSTREAM'
      );
    } catch (error) {
      // Consumer group might already exist, that's fine
      if (!error.message.includes('BUSYGROUP')) {
        console.error('Failed to create consumer group:', error);
      }
    }
  }

  async fetchEvents(batchSize: number): Promise<DomainEvent[]> {
    try {
      // Read new events
      const result = await this.redis.xreadgroup(
        'GROUP',
        this.consumerGroup,
        this.consumerName,
        'COUNT',
        batchSize,
        'BLOCK',
        1000, // 1 second timeout
        'STREAMS',
        this.streamName,
        '>'
      );

      if (!result || result.length === 0) {
        return [];
      }

      const events: DomainEvent[] = [];
      const streamData = result[0][1]; // First stream's data

      for (const [id, fields] of streamData) {
        try {
          const event: DomainEvent = {
            id: this.getFieldValue(fields, 'id'),
            type: this.getFieldValue(fields, 'type'),
            aggregateId: this.getFieldValue(fields, 'aggregateId'),
            aggregateType: this.getFieldValue(fields, 'aggregateType'),
            data: JSON.parse(this.getFieldValue(fields, 'data')),
            metadata: {
              ...JSON.parse(this.getFieldValue(fields, 'metadata')),
              streamId: id, // Add Redis stream ID for acknowledgment
              consumedAt: new Date(),
              consumerGroup: this.consumerGroup,
              consumerName: this.consumerName
            }
          };

          events.push(event);
        } catch (parseError) {
          console.error(`Failed to parse event from Redis stream ID ${id}:`, parseError);
        }
      }

      return events;
    } catch (error) {
      console.error('Failed to fetch events from Redis:', error);
      return [];
    }
  }

  async acknowledgeEvent(event: DomainEvent): Promise<void> {
    if (!event.metadata.streamId) {
      console.warn('Event missing streamId, cannot acknowledge');
      return;
    }

    try {
      await this.redis.xack(
        this.streamName,
        this.consumerGroup,
        event.metadata.streamId as string
      );
    } catch (error) {
      console.error(`Failed to acknowledge event ${event.id}:`, error);
    }
  }

  async retryEvent(event: DomainEvent): Promise<void> {
    // In Redis streams, we can add the event back to the stream for retry
    try {
      await this.redis.xadd(
        `${this.streamName}:retry`,
        '*',
        'originalId', event.id,
        'type', event.type,
        'aggregateId', event.aggregateId,
        'aggregateType', event.aggregateType,
        'data', JSON.stringify(event.data),
        'metadata', JSON.stringify(event.metadata),
        'retryAt', event.metadata.retryAt?.toISOString() || new Date().toISOString()
      );
    } catch (error) {
      console.error(`Failed to retry event ${event.id}:`, error);
    }
  }

  async moveToDeadLetter(event: DomainEvent, error: Error): Promise<void> {
    try {
      await this.redis.xadd(
        `${this.streamName}:dead-letter`,
        '*',
        'originalId', event.id,
        'type', event.type,
        'aggregateId', event.aggregateId,
        'aggregateType', event.aggregateType,
        'data', JSON.stringify(event.data),
        'metadata', JSON.stringify({
          ...event.metadata,
          deadLetterAt: new Date().toISOString(),
          finalError: error.message
        })
      );

      // Also acknowledge the original event to remove it from pending
      await this.acknowledgeEvent(event);
    } catch (dlqError) {
      console.error(`Failed to move event ${event.id} to dead letter queue:`, dlqError);
    }
  }

  async close(): Promise<void> {
    await this.redis.disconnect();
  }

  private getFieldValue(fields: string[], fieldName: string): string {
    const index = fields.indexOf(fieldName);
    return index !== -1 && index + 1 < fields.length ? fields[index + 1] : '';
  }
}
```

### 3. Event Handlers for Services
```typescript
// cache-service/src/events/cache-event-handlers.ts
import { EventHandler } from '../../../src/lib/events/event-consumer';
import { DomainEvent } from '../../../src/lib/events/event-publisher';
import { CacheManager } from '../cache/cache-manager';

export class StablecoinDataUpdatedHandler implements EventHandler {
  eventType = 'StablecoinDataUpdated';

  constructor(private cacheManager: CacheManager) {}

  async handle(event: DomainEvent): Promise<void> {
    const { ticker, data, source } = event.data;
    
    console.log(`Caching updated stablecoin data for ${ticker} from ${source}`);
    
    // Cache the updated data with appropriate TTL based on source
    const ttl = this.getTTLForSource(source);
    
    await this.cacheManager.set(
      `stablecoin:${ticker}:data`,
      data,
      {
        ttl,
        tags: [`stablecoin:${ticker}`, 'stablecoin-data'],
        source,
        metadata: {
          eventId: event.id,
          updatedViaEvent: true
        }
      }
    );

    // Also invalidate related cache entries
    await this.cacheManager.invalidateByTag(`stablecoin:${ticker}:related`);
  }

  async onError(event: DomainEvent, error: Error): Promise<void> {
    console.error(`Failed to handle StablecoinDataUpdated event for ${event.aggregateId}:`, error);
    
    // Could implement fallback logic or alerting here
  }

  private getTTLForSource(source: string): number {
    const ttlMap: Record<string, number> = {
      'api-request': 300,    // 5 minutes
      'refresh-request': 600, // 10 minutes
      'scheduled-update': 1800, // 30 minutes
    };
    
    return ttlMap[source] || 300;
  }
}

export class CacheInvalidationHandler implements EventHandler {
  eventType = 'TransparencyAnalysisCompleted';

  constructor(private cacheManager: CacheManager) {}

  async handle(event: DomainEvent): Promise<void> {
    const { ticker } = event.data;
    
    console.log(`Invalidating transparency cache for ${ticker}`);
    
    // Invalidate transparency-related cache entries
    await this.cacheManager.invalidateByPattern(`transparency:${ticker}:*`);
    await this.cacheManager.invalidateByTag(`transparency:${ticker}`);
  }

  async onError(event: DomainEvent, error: Error): Promise<void> {
    console.error(`Failed to invalidate transparency cache for ${event.aggregateId}:`, error);
  }
}
```

### 4. Metrics Service Event Handlers
```typescript
// metrics-service/src/events/metrics-event-handlers.ts
import { EventHandler } from '../../../src/lib/events/event-consumer';
import { DomainEvent } from '../../../src/lib/events/event-publisher';
import { MetricsService } from '../services/metrics-service';

export class APIMetricsHandler implements EventHandler {
  eventType = 'APIRequestProcessed';

  constructor(private metricsService: MetricsService) {}

  async handle(event: DomainEvent): Promise<void> {
    const { endpoint, method, statusCode, duration } = event.data;
    
    // Record API metrics
    await Promise.all([
      this.metricsService.recordMetric('api.requests.total', 1, {
        endpoint,
        method,
        status: statusCode.toString()
      }),
      
      this.metricsService.recordMetric('api.requests.duration', duration, {
        endpoint,
        method,
        status: statusCode.toString()
      }),
      
      // Record error metrics for failed requests
      statusCode >= 400 && this.metricsService.recordMetric('api.requests.errors', 1, {
        endpoint,
        method,
        status: statusCode.toString()
      })
    ]);
  }

  async onError(event: DomainEvent, error: Error): Promise<void> {
    console.error(`Failed to record API metrics for ${event.aggregateId}:`, error);
  }
}

export class StablecoinMetricsHandler implements EventHandler {
  eventType = 'StablecoinDataUpdated';

  constructor(private metricsService: MetricsService) {}

  async handle(event: DomainEvent): Promise<void> {
    const { ticker, data, source } = event.data;
    const dataSize = event.metadata.dataSize;
    
    // Record stablecoin data metrics
    await Promise.all([
      this.metricsService.recordMetric('stablecoin.data.updates', 1, {
        ticker,
        source
      }),
      
      dataSize && this.metricsService.recordMetric('stablecoin.data.size', dataSize, {
        ticker,
        source
      }),
      
      // Record specific metrics from the data if available
      data.marketCap && this.metricsService.recordMetric('stablecoin.market_cap', data.marketCap, {
        ticker
      }),
      
      data.volume24h && this.metricsService.recordMetric('stablecoin.volume_24h', data.volume24h, {
        ticker
      })
    ]);
  }

  async onError(event: DomainEvent, error: Error): Promise<void> {
    console.error(`Failed to record stablecoin metrics for ${event.aggregateId}:`, error);
  }
}
```

### 5. Background Jobs Event Handlers
```typescript
// background-jobs-service/src/events/job-event-handlers.ts
import { EventHandler } from '../../../src/lib/events/event-consumer';
import { DomainEvent } from '../../../src/lib/events/event-publisher';
import { JobQueue } from '../redis/job-queue';

export class StablecoinAnalysisJobHandler implements EventHandler {
  eventType = 'StablecoinDataUpdated';

  constructor(private jobQueue: JobQueue) {}

  async handle(event: DomainEvent): Promise<void> {
    const { ticker, source } = event.data;
    
    // Only trigger analysis for certain sources
    if (source === 'scheduled-update' || source === 'refresh-request') {
      // Schedule background analysis jobs
      await Promise.all([
        this.jobQueue.addJob('analyze-transparency', { ticker }, {
          priority: 5,
          delay: 5000 // Wait 5 seconds for data to settle
        }),
        
        this.jobQueue.addJob('update-risk-scores', { ticker }, {
          priority: 3,
          delay: 10000 // Wait 10 seconds
        }),
        
        this.jobQueue.addJob('generate-reports', { ticker }, {
          priority: 1,
          delay: 60000 // Wait 1 minute
        })
      ]);

      console.log(`Scheduled analysis jobs for ${ticker} due to ${source}`);
    }
  }

  async onError(event: DomainEvent, error: Error): Promise<void> {
    console.error(`Failed to schedule analysis jobs for ${event.aggregateId}:`, error);
  }
}

export class CacheWarmupJobHandler implements EventHandler {
  eventType = 'TransparencyAnalysisCompleted';

  constructor(private jobQueue: JobQueue) {}

  async handle(event: DomainEvent): Promise<void> {
    const { ticker } = event.data;
    
    // Schedule cache warmup job for related data
    await this.jobQueue.addJob('warmup-cache', {
      ticker,
      cacheKeys: [
        `transparency:${ticker}:analysis`,
        `transparency:${ticker}:score`,
        `stablecoin:${ticker}:summary`
      ]
    }, {
      priority: 2,
      delay: 2000 // Wait 2 seconds
    });

    console.log(`Scheduled cache warmup for ${ticker} transparency data`);
  }

  async onError(event: DomainEvent, error: Error): Promise<void> {
    console.error(`Failed to schedule cache warmup for ${event.aggregateId}:`, error);
  }
}
```

### 6. Event Consumer Initialization
```typescript
// src/lib/events/event-consumer-manager.ts
import { EventConsumer, EventConsumerOptions } from './event-consumer';
import { EventHandler } from './event-consumer';

export class EventConsumerManager {
  private consumers = new Map<string, EventConsumer>();

  async initializeConsumers(): Promise<void> {
    // Initialize different consumer groups for different services
    await this.initializeMainAppConsumers();
    await this.initializeCacheServiceConsumers();
    await this.initializeMetricsServiceConsumers();
    await this.initializeJobsServiceConsumers();
  }

  private async initializeMainAppConsumers(): Promise<void> {
    const consumer = new EventConsumer({
      consumerGroup: 'main-app',
      consumerName: `main-${process.pid}`,
      transport: 'redis',
      batchSize: 10,
      pollInterval: 2000,
      maxRetries: 3,
      enableMetrics: true
    });

    // Register handlers for main app
    const handlers: EventHandler[] = [
      // Add main app specific handlers here
    ];

    consumer.registerHandlers(handlers);
    await consumer.start();
    
    this.consumers.set('main-app', consumer);
  }

  private async initializeCacheServiceConsumers(): Promise<void> {
    if (process.env.SERVICE_NAME !== 'cache-service') return;

    const consumer = new EventConsumer({
      consumerGroup: 'cache-service',
      consumerName: `cache-${process.pid}`,
      transport: 'redis',
      batchSize: 20,
      pollInterval: 1000,
      maxRetries: 2,
      enableMetrics: true
    });

    // Import cache service handlers
    const { StablecoinDataUpdatedHandler, CacheInvalidationHandler } = await import('../../../cache-service/src/events/cache-event-handlers');
    const { CacheManager } = await import('../../../cache-service/src/cache/cache-manager');
    
    const cacheManager = CacheManager.getInstance();
    
    const handlers: EventHandler[] = [
      new StablecoinDataUpdatedHandler(cacheManager),
      new CacheInvalidationHandler(cacheManager)
    ];

    consumer.registerHandlers(handlers);
    await consumer.start();
    
    this.consumers.set('cache-service', consumer);
  }

  private async initializeMetricsServiceConsumers(): Promise<void> {
    if (process.env.SERVICE_NAME !== 'metrics-service') return;

    const consumer = new EventConsumer({
      consumerGroup: 'metrics-service',
      consumerName: `metrics-${process.pid}`,
      transport: 'redis',
      batchSize: 50,
      pollInterval: 1000,
      maxRetries: 2,
      enableMetrics: false // Avoid circular metrics
    });

    // Import metrics service handlers
    const { APIMetricsHandler, StablecoinMetricsHandler } = await import('../../../metrics-service/src/events/metrics-event-handlers');
    const { MetricsService } = await import('../../../metrics-service/src/services/metrics-service');
    
    const metricsService = new MetricsService();
    
    const handlers: EventHandler[] = [
      new APIMetricsHandler(metricsService),
      new StablecoinMetricsHandler(metricsService)
    ];

    consumer.registerHandlers(handlers);
    await consumer.start();
    
    this.consumers.set('metrics-service', consumer);
  }

  private async initializeJobsServiceConsumers(): Promise<void> {
    if (process.env.SERVICE_NAME !== 'background-jobs-service') return;

    const consumer = new EventConsumer({
      consumerGroup: 'background-jobs',
      consumerName: `jobs-${process.pid}`,
      transport: 'redis',
      batchSize: 15,
      pollInterval: 2000,
      maxRetries: 3,
      enableMetrics: true
    });

    // Import background jobs handlers
    const { StablecoinAnalysisJobHandler, CacheWarmupJobHandler } = await import('../../../background-jobs-service/src/events/job-event-handlers');
    const { JobQueue } = await import('../../../background-jobs-service/src/redis/job-queue');
    
    const jobQueue = new JobQueue();
    
    const handlers: EventHandler[] = [
      new StablecoinAnalysisJobHandler(jobQueue),
      new CacheWarmupJobHandler(jobQueue)
    ];

    consumer.registerHandlers(handlers);
    await consumer.start();
    
    this.consumers.set('background-jobs', consumer);
  }

  async stopAllConsumers(): Promise<void> {
    console.log('Stopping all event consumers...');
    
    const stopPromises = Array.from(this.consumers.values()).map(
      consumer => consumer.stop()
    );

    await Promise.all(stopPromises);
    this.consumers.clear();
  }

  getConsumerStatus(): Array<{ name: string; status: any }> {
    const statuses: Array<{ name: string; status: any }> = [];
    
    for (const [name, consumer] of this.consumers.entries()) {
      statuses.push({
        name,
        status: consumer.getStatus()
      });
    }
    
    return statuses;
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [ ] Event consumers successfully receive and process events from Redis streams
- [ ] Consumer groups provide load balancing and fault tolerance
- [ ] Event handlers execute business logic based on consumed events
- [ ] Failed events are retried with exponential backoff
- [ ] Dead letter queue captures events that fail repeatedly

### Performance Requirements
- [ ] Event consumption adds minimal latency to business processes
- [ ] Consumers can process 100+ events per minute per instance
- [ ] Failed event processing doesn't block other events
- [ ] Consumer groups scale horizontally for high throughput

### Integration Requirements
- [ ] Each service consumes only relevant events based on business logic
- [ ] Event processing maintains data consistency across services
- [ ] Consumer health monitoring provides visibility into processing status
- [ ] Graceful degradation when event transport unavailable

## Testing
```bash
# Test event consumers
npm run test:event-consumers

# Test event handlers
npm run test:event-handlers

# Test consumer transport
npm run test:consumer-transport

# Integration test - publish events and verify consumption
npm run test:event-flow-integration

# Performance test
npm run test:event-consumption-performance
```

## Rollback Plan
1. Stop all event consumers via EventConsumerManager
2. Remove event handler registrations from services
3. Keep event streams for debugging but stop processing
4. Services continue operating without event-driven reactions
5. Remove consumer group configurations from Redis

## Dependencies
- Task 09 (Event Publishing System)
- All Phase 1 and Phase 2 tasks (01-08)
- Redis streams for event transport
- Service-specific business logic for event handlers

## Risks & Mitigation
- **Risk**: Event processing failures cause data inconsistency
  - **Mitigation**: Retry logic, dead letter queues, idempotent handlers
- **Risk**: Consumer lag causes delayed reactions to business events
  - **Mitigation**: Multiple consumers per group, performance monitoring
- **Risk**: Event transport failures stop event consumption
  - **Mitigation**: Connection retry logic, fallback mechanisms, health checks

## Notes
- Consumer groups provide automatic load balancing and failure handling
- Each service consumes only events relevant to its business responsibilities
- Event handlers designed to be idempotent to handle retries safely
- Dead letter queues capture events that fail repeatedly for manual investigation
- Consumer manager provides centralized control over all event consumption
- Performance optimizations include batching and parallel processing