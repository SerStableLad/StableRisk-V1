# Task 01: PostgreSQL Setup

## Overview
Set up PostgreSQL as a secondary data store for events, analytics, and gradual migration support without disrupting existing API flows.

## Time Estimate: 5-7 days

## Prerequisites
- Docker and Docker Compose installed
- Current Next.js application running
- Understanding of existing data flows

## Technical Requirements

### 1. Database Infrastructure
```yaml
# docker-compose.yml addition
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: stablerisk
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./sql/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d stablerisk"]
      interval: 30s
      timeout: 10s
      retries: 5

volumes:
  postgres_data:
```

### 2. Initial Schema
```sql
-- sql/init/01_events_schema.sql
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS cache_metadata;

-- Event sourcing table
CREATE TABLE events.event_log (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version INTEGER NOT NULL
);

-- Analytics aggregates
CREATE TABLE analytics.stablecoin_metrics (
    ticker VARCHAR(10) PRIMARY KEY,
    last_updated TIMESTAMP WITH TIME ZONE,
    risk_score DECIMAL(5,2),
    transparency_score DECIMAL(5,2),
    liquidity_score DECIMAL(5,2),
    audit_score DECIMAL(5,2),
    metadata JSONB
);

-- Cache invalidation tracking
CREATE TABLE cache_metadata.invalidation_log (
    id BIGSERIAL PRIMARY KEY,
    cache_key VARCHAR(500) NOT NULL,
    invalidated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason VARCHAR(255),
    related_ticker VARCHAR(10)
);

-- Indexes for performance
CREATE INDEX idx_event_log_aggregate ON events.event_log(aggregate_id, aggregate_type);
CREATE INDEX idx_event_log_created_at ON events.event_log(created_at);
CREATE INDEX idx_metrics_last_updated ON analytics.stablecoin_metrics(last_updated);
CREATE INDEX idx_invalidation_ticker ON cache_metadata.invalidation_log(related_ticker);
```

### 3. Environment Variables
```bash
# .env additions
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stablerisk
DB_USER=stablerisk_user
DB_PASSWORD=your_secure_password_here
DB_SSL=false
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# Connection pooling
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_QUERY_TIMEOUT=10000
```

### 4. Connection Service
```typescript
// src/lib/db/connection.ts
import { Pool } from 'pg';

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool;

  private constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true',
      min: parseInt(process.env.DB_POOL_MIN || '5'),
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_QUERY_TIMEOUT || '10000'),
    });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export default DatabaseConnection;
```

## Acceptance Criteria

### Functional Requirements
- [x] PostgreSQL container starts and passes health checks
- [x] Database schemas are created successfully
- [x] Connection service can establish connections with connection pooling
- [x] All environment variables are documented and configured
- [x] Database migrations run successfully

### Performance Requirements
- [x] Database responds to health checks within 1 second
- [x] Connection pool maintains 5-20 active connections
- [x] Query timeout set to 10 seconds maximum

### Integration Requirements
- [x] Does not interfere with existing Next.js application
- [x] Can run alongside current development setup
- [x] Logging includes database connection status

## Testing
```bash
# Start services
docker-compose up -d postgres

# Test connection
npm run test:db-connection

# Run migrations
npm run db:migrate

# Verify schema
npm run db:verify-schema
```

## Rollback Plan
1. Stop PostgreSQL container: `docker-compose down postgres`
2. Remove database volumes if needed: `docker volume rm stablerisk_postgres_data`
3. Remove environment variables from .env
4. Remove database connection files

## Dependencies
- None (independent setup)

## Risks & Mitigation
- **Risk**: Database connection issues
  - **Mitigation**: Comprehensive health checks and connection pooling
- **Risk**: Schema migration failures
  - **Mitigation**: Idempotent SQL scripts with proper error handling
- **Risk**: Performance impact on existing application
  - **Mitigation**: Database runs in separate container with resource limits

## Notes
- This setup is additive - existing application continues to work without changes
- Database is initially used for logging and analytics only
- Connection pooling configured for future load
- All tables use JSONB for flexible schema evolution