# Task 05: Metrics Service Extraction

## Overview
Extract the metrics service from the monolith to create an independent, scalable service for collecting, aggregating, and serving performance metrics.

## Time Estimate: 7-8 days

## Prerequisites
- Phase 1 foundation tasks completed (Tasks 01-04)
- Understanding of current metrics-service.ts implementation
- Docker development environment ready

## Technical Requirements

### 1. Extracted Metrics Service
```typescript
// metrics-service/src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { MetricsController } from './controllers/metrics-controller';
import { DatabaseConnection } from './db/connection';
import { HealthCheckController } from './controllers/health-controller';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// Health check
app.use('/health', HealthCheckController.routes());

// Metrics endpoints
app.use('/metrics', MetricsController.routes());

// Error handling
app.use((error: any, req: any, res: any, next: any) => {
  console.error('Metrics service error:', error);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await DatabaseConnection.getInstance().close();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Metrics service listening on port ${port}`);
});
```

### 2. Metrics Controller
```typescript
// metrics-service/src/controllers/metrics-controller.ts
import { Router } from 'express';
import { MetricsService } from '../services/metrics-service';
import { validateMetricRequest } from '../middleware/validation';

export class MetricsController {
  private static metricsService = new MetricsService();

  static routes(): Router {
    const router = Router();

    // Record metric
    router.post('/record', validateMetricRequest, async (req, res) => {
      try {
        const { name, value, labels, timestamp } = req.body;
        await this.metricsService.recordMetric(name, value, labels, timestamp);
        res.status(201).json({ success: true });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    });

    // Get metrics by name
    router.get('/:name', async (req, res) => {
      try {
        const { name } = req.params;
        const { start, end, granularity } = req.query;
        
        const metrics = await this.metricsService.getMetrics(
          name,
          start as string,
          end as string,
          granularity as string
        );
        
        res.json({ metrics });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get aggregated metrics
    router.get('/aggregate/:name', async (req, res) => {
      try {
        const { name } = req.params;
        const { operation, start, end } = req.query;
        
        const result = await this.metricsService.getAggregatedMetrics(
          name,
          operation as string,
          start as string,
          end as string
        );
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get system metrics summary
    router.get('/system/summary', async (req, res) => {
      try {
        const summary = await this.metricsService.getSystemSummary();
        res.json(summary);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete old metrics (cleanup endpoint)
    router.delete('/cleanup', async (req, res) => {
      try {
        const { olderThan } = req.query;
        const deletedCount = await this.metricsService.cleanupOldMetrics(
          olderThan as string
        );
        res.json({ deletedCount });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }
}
```

### 3. Metrics Service Implementation
```typescript
// metrics-service/src/services/metrics-service.ts
import { DatabaseConnection } from '../db/connection';

export interface MetricRecord {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: Date;
}

export class MetricsService {
  private db = DatabaseConnection.getInstance();

  async recordMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    timestamp: Date = new Date()
  ): Promise<void> {
    const query = `
      INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
      VALUES ($1, $2, $3, $4)
    `;
    
    await this.db.query(query, [
      name,
      value,
      JSON.stringify(labels),
      timestamp
    ]);
  }

  async getMetrics(
    name: string,
    start?: string,
    end?: string,
    granularity: string = '1h'
  ): Promise<MetricRecord[]> {
    let query = `
      SELECT name, value, labels, recorded_at as timestamp
      FROM metrics.metric_data
      WHERE name = $1
    `;
    
    const params = [name];
    
    if (start) {
      params.push(start);
      query += ` AND recorded_at >= $${params.length}`;
    }
    
    if (end) {
      params.push(end);
      query += ` AND recorded_at <= $${params.length}`;
    }
    
    query += ` ORDER BY recorded_at DESC LIMIT 1000`;
    
    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => ({
      name: row.name,
      value: row.value,
      labels: row.labels,
      timestamp: row.timestamp
    }));
  }

  async getAggregatedMetrics(
    name: string,
    operation: string = 'avg',
    start?: string,
    end?: string
  ): Promise<any> {
    const operations = {
      'avg': 'AVG(value)',
      'sum': 'SUM(value)',
      'count': 'COUNT(*)',
      'min': 'MIN(value)',
      'max': 'MAX(value)'
    };

    if (!operations[operation]) {
      throw new Error(`Unsupported operation: ${operation}`);
    }

    let query = `
      SELECT ${operations[operation]} as result,
             COUNT(*) as count,
             MIN(recorded_at) as start_time,
             MAX(recorded_at) as end_time
      FROM metrics.metric_data
      WHERE name = $1
    `;
    
    const params = [name];
    
    if (start) {
      params.push(start);
      query += ` AND recorded_at >= $${params.length}`;
    }
    
    if (end) {
      params.push(end);
      query += ` AND recorded_at <= $${params.length}`;
    }
    
    const result = await this.db.query(query, params);
    return result.rows[0];
  }

  async getSystemSummary(): Promise<any> {
    const query = `
      SELECT 
        name,
        COUNT(*) as total_records,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        MAX(recorded_at) as last_recorded
      FROM metrics.metric_data
      WHERE recorded_at >= NOW() - INTERVAL '24 hours'
      GROUP BY name
      ORDER BY total_records DESC
      LIMIT 50
    `;
    
    const result = await this.db.query(query);
    return result.rows;
  }

  async cleanupOldMetrics(olderThan: string = '30 days'): Promise<number> {
    const query = `
      DELETE FROM metrics.metric_data
      WHERE recorded_at < NOW() - INTERVAL $1
    `;
    
    const result = await this.db.query(query, [olderThan]);
    return result.rowCount || 0;
  }

  // Batch insert for high throughput
  async recordMetricsBatch(metrics: MetricRecord[]): Promise<void> {
    if (metrics.length === 0) return;

    const values = metrics.map((metric, index) => {
      const baseIndex = index * 4;
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
    }).join(', ');

    const query = `
      INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
      VALUES ${values}
    `;

    const params = metrics.flatMap(metric => [
      metric.name,
      metric.value,
      JSON.stringify(metric.labels || {}),
      metric.timestamp || new Date()
    ]);

    await this.db.query(query, params);
  }
}
```

### 4. Database Schema for Metrics
```sql
-- metrics-service/sql/init.sql
CREATE SCHEMA IF NOT EXISTS metrics;

-- Metrics data table
CREATE TABLE metrics.metric_data (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    labels JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_metric_data_name ON metrics.metric_data(name);
CREATE INDEX idx_metric_data_recorded_at ON metrics.metric_data(recorded_at);
CREATE INDEX idx_metric_data_name_recorded_at ON metrics.metric_data(name, recorded_at);
CREATE INDEX idx_metric_data_labels ON metrics.metric_data USING GIN(labels);

-- Partitioning by time (optional, for high volume)
-- CREATE TABLE metrics.metric_data_y2024m01 PARTITION OF metrics.metric_data
-- FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 5. Docker Configuration
```dockerfile
# metrics-service/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start service
CMD ["npm", "start"]
```

### 6. Service Integration Client
```typescript
// src/lib/clients/metrics-service-client.ts (in main app)
export class MetricsServiceClient {
  private static instance: MetricsServiceClient;
  private baseUrl: string;
  private timeout: number;

  private constructor() {
    this.baseUrl = process.env.METRICS_SERVICE_URL || 'http://localhost:3001';
    this.timeout = parseInt(process.env.METRICS_SERVICE_TIMEOUT || '5000');
  }

  public static getInstance(): MetricsServiceClient {
    if (!MetricsServiceClient.instance) {
      MetricsServiceClient.instance = new MetricsServiceClient();
    }
    return MetricsServiceClient.instance;
  }

  async recordMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      await fetch(`${this.baseUrl}/metrics/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value, labels }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
    } catch (error) {
      console.error('Failed to record metric:', error);
      // Don't throw - metrics shouldn't break main application
    }
  }

  async getMetrics(
    name: string,
    start?: string,
    end?: string
  ): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (start) params.set('start', start);
      if (end) params.set('end', end);

      const response = await fetch(
        `${this.baseUrl}/metrics/${name}?${params.toString()}`,
        { 
          method: 'GET',
          signal: AbortSignal.timeout(this.timeout)
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data.metrics || [];
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      return [];
    }
  }

  async getSystemSummary(): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/metrics/system/summary`,
        { 
          method: 'GET',
          signal: AbortSignal.timeout(this.timeout)
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch system summary:', error);
      return { error: error.message };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}
```

### 7. Docker Compose Integration
```yaml
# docker-compose.yml additions
services:
  metrics-service:
    build: ./metrics-service
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=stablerisk
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - NODE_ENV=development
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
    volumes:
      - ./metrics-service/logs:/app/logs

  # Update nginx to include metrics service route
  nginx:
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - metrics-service
```

## Acceptance Criteria

### Functional Requirements
- [x] Metrics service starts independently and passes health checks
- [x] Can record metrics via REST API
- [x] Can retrieve metrics with filtering and aggregation
- [x] Database schema is created and indexed properly
- [x] Main application can connect to metrics service

### Performance Requirements
- [x] Metrics service responds to health checks in < 100ms
- [x] Can handle 1000+ metric records per minute
- [x] Batch operations complete within 5 seconds
- [x] Database queries return results in < 200ms

### Integration Requirements
- [x] Main application maintains existing functionality without metrics service
- [x] Graceful degradation when metrics service is unavailable
- [x] Metrics collection doesn't impact main application performance
- [x] Docker containers communicate properly

## Testing
```bash
# Build and start metrics service
cd metrics-service && npm run build && npm start

# Test with Docker Compose
docker-compose up -d metrics-service

# Test API endpoints
curl -X POST http://localhost:3001/metrics/record \
  -H "Content-Type: application/json" \
  -d '{"name":"test.metric","value":42.5,"labels":{"source":"test"}}'

curl http://localhost:3001/metrics/test.metric

# Test integration from main app
npm run test:metrics-integration

# Load testing
npm run test:metrics-load
```

## Rollback Plan
1. Stop metrics service container: `docker-compose down metrics-service`
2. Remove metrics service client calls from main application
3. Keep existing metrics-service.ts in main application as fallback
4. Remove metrics service configuration from docker-compose.yml
5. Remove NGINX routing for metrics service

## Dependencies
- All Phase 1 foundation tasks (01-04)
- PostgreSQL database with metrics schema
- Docker development environment

## Risks & Mitigation
- **Risk**: Metrics service downtime affects observability
  - **Mitigation**: Graceful degradation, local fallback logging
- **Risk**: High volume metrics overwhelm database
  - **Mitigation**: Batch operations, database indexing, cleanup jobs
- **Risk**: Network latency between services impacts performance
  - **Mitigation**: Async operations, timeout handling, circuit breaker

## Notes
- Metrics service is designed to be stateless and horizontally scalable
- Database schema supports high-volume time series data
- Client library provides graceful degradation when service unavailable
- Batch operations optimize database performance for high throughput
- Health checks ensure service reliability in container orchestration