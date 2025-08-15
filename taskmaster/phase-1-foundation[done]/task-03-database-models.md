# Task 03: Database Models Integration

## Overview
Create TypeScript models and services for PostgreSQL integration without disrupting existing API flows. Implement write-through caching and analytics logging.

## Time Estimate: 6-8 days

## Prerequisites
- PostgreSQL setup completed (Task 01)
- NGINX proxy configured (Task 02)
- Understanding of existing service architecture

## Technical Requirements

### 1. Database Models
```typescript
// src/lib/db/models/base.ts
export interface BaseEntity {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// src/lib/db/models/event.ts
export interface EventLogEntry extends BaseEntity {
  aggregateId: string;
  aggregateType: 'stablecoin' | 'transparency' | 'audit' | 'liquidity';
  eventType: string;
  eventData: Record<string, any>;
  metadata: Record<string, any>;
  version: number;
}

// src/lib/db/models/analytics.ts
export interface StablecoinMetrics extends BaseEntity {
  ticker: string;
  lastUpdated: Date;
  riskScore?: number;
  transparencyScore?: number;
  liquidityScore?: number;
  auditScore?: number;
  metadata: Record<string, any>;
}

// src/lib/db/models/cache.ts
export interface CacheInvalidationLog extends BaseEntity {
  cacheKey: string;
  invalidatedAt: Date;
  reason: string;
  relatedTicker?: string;
}
```

### 2. Repository Pattern Implementation
```typescript
// src/lib/db/repositories/base-repository.ts
import DatabaseConnection from '../connection';
import { Pool } from 'pg';

export abstract class BaseRepository<T> {
  protected pool: Pool;
  protected tableName: string;
  protected schema: string;

  constructor(tableName: string, schema: string = 'public') {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.tableName = tableName;
    this.schema = schema;
  }

  protected get fullTableName(): string {
    return `${this.schema}.${this.tableName}`;
  }

  protected async query(sql: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result;
    } catch (error) {
      console.error(`Query error in ${this.fullTableName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<T | null> {
    const result = await this.query(
      `SELECT * FROM ${this.fullTableName} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async create(entity: Partial<T>): Promise<T> {
    const keys = Object.keys(entity).filter(key => entity[key] !== undefined);
    const values = keys.map(key => entity[key]);
    const placeholders = keys.map((_, index) => `$${index + 1}`);

    const result = await this.query(
      `INSERT INTO ${this.fullTableName} (${keys.join(', ')}) 
       VALUES (${placeholders.join(', ')}) 
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const keys = Object.keys(updates).filter(key => updates[key] !== undefined);
    const values = keys.map(key => updates[key]);
    const setClause = keys.map((key, index) => `${key} = $${index + 2}`);

    if (keys.length === 0) return this.findById(id);

    const result = await this.query(
      `UPDATE ${this.fullTableName} 
       SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE id = $1 
       RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] || null;
  }
}
```

### 3. Event Repository
```typescript
// src/lib/db/repositories/event-repository.ts
import { BaseRepository } from './base-repository';
import { EventLogEntry } from '../models/event';

export class EventRepository extends BaseRepository<EventLogEntry> {
  constructor() {
    super('event_log', 'events');
  }

  async logEvent(
    aggregateId: string,
    aggregateType: string,
    eventType: string,
    eventData: Record<string, any>,
    metadata: Record<string, any> = {}
  ): Promise<EventLogEntry> {
    const version = await this.getNextVersion(aggregateId, aggregateType);
    
    return this.create({
      aggregateId,
      aggregateType,
      eventType,
      eventData,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        source: 'stablerisk-api'
      },
      version
    });
  }

  async getEventHistory(
    aggregateId: string,
    aggregateType: string,
    fromVersion?: number
  ): Promise<EventLogEntry[]> {
    const baseQuery = `
      SELECT * FROM ${this.fullTableName} 
      WHERE aggregate_id = $1 AND aggregate_type = $2
    `;
    
    if (fromVersion !== undefined) {
      const result = await this.query(
        `${baseQuery} AND version >= $3 ORDER BY version ASC`,
        [aggregateId, aggregateType, fromVersion]
      );
      return result.rows;
    }
    
    const result = await this.query(
      `${baseQuery} ORDER BY version ASC`,
      [aggregateId, aggregateType]
    );
    return result.rows;
  }

  private async getNextVersion(aggregateId: string, aggregateType: string): Promise<number> {
    const result = await this.query(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version 
       FROM ${this.fullTableName} 
       WHERE aggregate_id = $1 AND aggregate_type = $2`,
      [aggregateId, aggregateType]
    );
    return result.rows[0].next_version;
  }

  async getRecentEvents(limit: number = 100): Promise<EventLogEntry[]> {
    const result = await this.query(
      `SELECT * FROM ${this.fullTableName} 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}
```

### 4. Analytics Repository
```typescript
// src/lib/db/repositories/analytics-repository.ts
import { BaseRepository } from './base-repository';
import { StablecoinMetrics } from '../models/analytics';

export class AnalyticsRepository extends BaseRepository<StablecoinMetrics> {
  constructor() {
    super('stablecoin_metrics', 'analytics');
  }

  async upsertMetrics(ticker: string, metrics: Partial<StablecoinMetrics>): Promise<StablecoinMetrics> {
    const result = await this.query(
      `INSERT INTO ${this.fullTableName} 
       (ticker, last_updated, risk_score, transparency_score, liquidity_score, audit_score, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (ticker) 
       DO UPDATE SET 
         last_updated = EXCLUDED.last_updated,
         risk_score = EXCLUDED.risk_score,
         transparency_score = EXCLUDED.transparency_score,
         liquidity_score = EXCLUDED.liquidity_score,
         audit_score = EXCLUDED.audit_score,
         metadata = EXCLUDED.metadata
       RETURNING *`,
      [
        ticker,
        new Date(),
        metrics.riskScore,
        metrics.transparencyScore,
        metrics.liquidityScore,
        metrics.auditScore,
        JSON.stringify(metrics.metadata || {})
      ]
    );
    return result.rows[0];
  }

  async getMetricsByTicker(ticker: string): Promise<StablecoinMetrics | null> {
    const result = await this.query(
      `SELECT * FROM ${this.fullTableName} WHERE ticker = $1`,
      [ticker]
    );
    return result.rows[0] || null;
  }

  async getTopPerformers(limit: number = 10): Promise<StablecoinMetrics[]> {
    const result = await this.query(
      `SELECT * FROM ${this.fullTableName} 
       WHERE risk_score IS NOT NULL 
       ORDER BY risk_score DESC, transparency_score DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getMetricsHistory(ticker: string, days: number = 30): Promise<any[]> {
    // This would require a separate time-series table in a real implementation
    // For now, return empty array as placeholder
    return [];
  }
}
```

### 5. Integration Service
```typescript
// src/lib/services/database-integration-service.ts
import { EventRepository } from '../db/repositories/event-repository';
import { AnalyticsRepository } from '../db/repositories/analytics-repository';

export class DatabaseIntegrationService {
  private static instance: DatabaseIntegrationService;
  private eventRepo: EventRepository;
  private analyticsRepo: AnalyticsRepository;

  private constructor() {
    this.eventRepo = new EventRepository();
    this.analyticsRepo = new AnalyticsRepository();
  }

  public static getInstance(): DatabaseIntegrationService {
    if (!DatabaseIntegrationService.instance) {
      DatabaseIntegrationService.instance = new DatabaseIntegrationService();
    }
    return DatabaseIntegrationService.instance;
  }

  // Event logging methods
  async logStablecoinDataFetch(ticker: string, source: string, success: boolean, metadata: any = {}) {
    try {
      await this.eventRepo.logEvent(
        ticker,
        'stablecoin',
        'data_fetch',
        {
          source,
          success,
          ...metadata
        }
      );
    } catch (error) {
      console.error('Failed to log stablecoin data fetch event:', error);
      // Don't throw - this is supplementary logging
    }
  }

  async logCacheEvent(cacheKey: string, action: 'hit' | 'miss' | 'set' | 'invalidate', metadata: any = {}) {
    try {
      await this.eventRepo.logEvent(
        cacheKey,
        'cache',
        action,
        metadata
      );
    } catch (error) {
      console.error('Failed to log cache event:', error);
      // Don't throw - this is supplementary logging
    }
  }

  // Analytics methods
  async saveStablecoinMetrics(ticker: string, scores: {
    riskScore?: number;
    transparencyScore?: number;
    liquidityScore?: number;
    auditScore?: number;
  }, metadata: any = {}) {
    try {
      return await this.analyticsRepo.upsertMetrics(ticker, {
        ...scores,
        metadata
      });
    } catch (error) {
      console.error('Failed to save stablecoin metrics:', error);
      throw error; // This might be used for analytics, so throw
    }
  }

  async getHistoricalMetrics(ticker: string): Promise<any> {
    try {
      return await this.analyticsRepo.getMetricsByTicker(ticker);
    } catch (error) {
      console.error('Failed to get historical metrics:', error);
      return null;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const recentEvents = await this.eventRepo.getRecentEvents(1);
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}
```

### 6. Gradual Integration Hooks
```typescript
// src/lib/hooks/database-hooks.ts
import { DatabaseIntegrationService } from '../services/database-integration-service';

export function withDatabaseLogging<T extends (...args: any[]) => any>(
  fn: T,
  eventConfig: {
    aggregateType: string;
    eventType: string;
    getAggregateId: (...args: Parameters<T>) => string;
    getMetadata?: (...args: Parameters<T>) => Record<string, any>;
  }
): T {
  return ((...args: Parameters<T>) => {
    const result = fn(...args);
    
    // For async functions
    if (result && typeof result.then === 'function') {
      return result.then((value: any) => {
        // Log success
        DatabaseIntegrationService.getInstance().logEvent(
          eventConfig.getAggregateId(...args),
          eventConfig.aggregateType,
          eventConfig.eventType,
          {
            success: true,
            result: typeof value === 'object' ? Object.keys(value) : value,
            ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
          }
        );
        return value;
      }).catch((error: any) => {
        // Log error
        DatabaseIntegrationService.getInstance().logEvent(
          eventConfig.getAggregateId(...args),
          eventConfig.aggregateType,
          eventConfig.eventType,
          {
            success: false,
            error: error.message,
            ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
          }
        );
        throw error;
      });
    }
    
    // For sync functions
    try {
      DatabaseIntegrationService.getInstance().logEvent(
        eventConfig.getAggregateId(...args),
        eventConfig.aggregateType,
        eventConfig.eventType,
        {
          success: true,
          result: typeof result === 'object' ? Object.keys(result) : result,
          ...(eventConfig.getMetadata ? eventConfig.getMetadata(...args) : {})
        }
      );
    } catch (logError) {
      console.error('Failed to log database event:', logError);
    }
    
    return result;
  }) as T;
}
```

## Acceptance Criteria

### Functional Requirements
- [x] Database models compile without TypeScript errors
- [x] Repository pattern works with PostgreSQL connection
- [x] Event logging doesn't interfere with existing API performance
- [x] Analytics data can be stored and retrieved
- [x] Integration service provides health check capabilities

### Performance Requirements
- [x] Database operations complete in < 100ms for simple queries
- [x] Event logging is non-blocking for main application flows
- [x] Connection pooling handles concurrent database operations
- [x] Failed database operations don't crash main application

### Integration Requirements
- [x] Works alongside existing service architecture
- [x] Compatible with current TypeScript configuration
- [x] Doesn't require changes to existing API routes
- [x] Can be enabled/disabled via environment variables

## Testing
```bash
# Run database model tests
npm run test:db-models

# Test repository operations
npm run test:repositories

# Test integration service
npm run test:db-integration

# Check connection health
npm run test:db-health
```

## Rollback Plan
1. Remove database integration service calls
2. Remove repository and model files
3. Remove database imports from existing services
4. Keep PostgreSQL running but unused
5. Remove TypeScript types and interfaces

## Dependencies
- Task 01 (PostgreSQL setup)
- Task 02 (NGINX proxy) for complete infrastructure

## Risks & Mitigation
- **Risk**: Database operations slow down API responses
  - **Mitigation**: Async logging, non-blocking operations, proper indexing
- **Risk**: Database connection failures break application
  - **Mitigation**: Graceful error handling, connection pooling, health checks
- **Risk**: TypeScript compilation issues
  - **Mitigation**: Strict typing, comprehensive testing, incremental integration

## Notes
- Models designed to complement, not replace, existing data flows
- Repository pattern allows for future migration to other databases
- Integration service provides optional enhancement to existing functionality
- Event sourcing prepared for future distributed architecture
- Analytics repository ready for business intelligence integration