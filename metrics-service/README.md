# Metrics Service

A scalable, independent metrics collection and aggregation service for StableRisk AI.

## Overview

The metrics service provides:
- **High-performance metrics collection** with batch operations support
- **Real-time aggregation** with various statistical operations
- **Label-based querying** for dimensional metrics
- **Graceful degradation** when service is unavailable
- **Health monitoring** with detailed diagnostics
- **Docker containerization** for easy deployment

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### Production with Docker

```bash
# Build and start the service
docker-compose up -d metrics-service

# Check service health
curl http://localhost:3001/health
```

## API Endpoints

### Health Endpoints
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health information
- `GET /health/database` - Database connectivity check
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/info` - Service version and info

### Metrics Endpoints
- `POST /metrics/record` - Record a single metric
- `POST /metrics/batch` - Record multiple metrics (batch)
- `GET /metrics/:name` - Get metrics by name
- `GET /metrics/aggregate/:name` - Get aggregated metrics
- `POST /metrics/query/labels` - Query metrics by labels
- `GET /metrics/system/summary` - Get system metrics summary
- `GET /metrics/system/names` - Get available metric names
- `GET /metrics/system/stats` - Get health statistics
- `DELETE /metrics/cleanup` - Cleanup old metrics

### Documentation
- `GET /docs` - API documentation

## Usage Examples

### Recording Metrics

```bash
# Record a single metric
curl -X POST http://localhost:3001/metrics/record \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api.request.duration",
    "value": 150.5,
    "labels": {
      "endpoint": "/health",
      "method": "GET",
      "status": "200"
    }
  }'

# Record multiple metrics (batch)
curl -X POST http://localhost:3001/metrics/batch \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": [
      {
        "name": "api.request.count",
        "value": 1,
        "labels": {"endpoint": "/metrics"}
      },
      {
        "name": "database.query.duration",
        "value": 25.3,
        "labels": {"table": "metrics"}
      }
    ]
  }'
```

### Querying Metrics

```bash
# Get metrics by name
curl "http://localhost:3001/metrics/api.request.duration?start=2024-01-01T00:00:00Z&limit=100"

# Get aggregated metrics
curl "http://localhost:3001/metrics/aggregate/api.request.duration?operation=avg&start=2024-01-01T00:00:00Z"

# Query metrics by labels
curl -X POST http://localhost:3001/metrics/query/labels \
  -H "Content-Type: application/json" \
  -d '{
    "labels": {"endpoint": "/health"},
    "start": "2024-01-01T00:00:00Z",
    "limit": 100
  }'

# Get system summary
curl http://localhost:3001/metrics/system/summary
```

## Client Library

Use the provided client library for easy integration:

```typescript
import { MetricsServiceClient } from '../lib/clients/metrics-service-client';

const metricsClient = MetricsServiceClient.getInstance({
  baseUrl: 'http://localhost:3001',
  timeout: 5000,
  enableFallback: true
});

// Record a metric
await metricsClient.recordMetric('api.request.duration', 150.5, {
  endpoint: '/health',
  method: 'GET'
});

// Get metrics
const metrics = await metricsClient.getMetrics('api.request.duration', {
  start: '2024-01-01T00:00:00Z',
  limit: 100
});
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `NODE_ENV` | `development` | Environment |
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | `stablerisk` | Database name |
| `DB_USER` | `stablerisk_user` | Database user |
| `DB_PASSWORD` | | Database password |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS origins |
| `REQUEST_TIMEOUT` | `30000` | Request timeout (ms) |

## Database Schema

The service uses a PostgreSQL database with the following schema:

```sql
-- Metrics data table
CREATE TABLE metrics.metric_data (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    labels JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_metric_data_name ON metrics.metric_data(name);
CREATE INDEX idx_metric_data_recorded_at ON metrics.metric_data(recorded_at);
CREATE INDEX idx_metric_data_name_recorded_at ON metrics.metric_data(name, recorded_at);
CREATE INDEX idx_metric_data_labels ON metrics.metric_data USING GIN(labels);
```

## Performance

The service is designed for high-throughput operations:

- **Batch operations** support up to 1000 metrics per request
- **Database indexing** optimized for time-series queries
- **Connection pooling** for database efficiency
- **Graceful degradation** when service is unavailable
- **Request timeout** handling to prevent hanging connections

## Monitoring

Health checks and monitoring endpoints:

- Service health: `GET /health`
- Database connectivity: `GET /health/database`
- System statistics: `GET /metrics/system/stats`
- Performance metrics: `GET /health/detailed`

## Development

### Scripts

```bash
npm run dev          # Start development server
npm run build        # Build TypeScript
npm run start        # Start production server
npm run test         # Run tests
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
npm run db:migrate   # Run database migrations
npm run db:seed      # Seed sample data
```

### Project Structure

```
metrics-service/
├── src/
│   ├── controllers/     # API controllers
│   ├── services/        # Business logic
│   ├── db/             # Database connection
│   ├── middleware/     # Express middleware
│   └── app.ts          # Main application
├── sql/                # Database schemas
├── scripts/            # Utility scripts
├── logs/               # Log files (Docker volume)
├── Dockerfile          # Container definition
└── package.json        # Dependencies and scripts
```

## Deployment

### Docker Compose

The service is configured for Docker Compose deployment:

```yaml
services:
  metrics-service:
    build: ./metrics-service
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - DB_HOST=postgres
      - DB_NAME=stablerisk
      # ... other environment variables
```

### Health Checks

Container health checks are configured:

```bash
# Health check command
curl -f http://localhost:3001/health/live || exit 1
```

## Error Handling

The service implements comprehensive error handling:

- **Validation errors** for malformed requests
- **Database errors** with proper HTTP status codes
- **Timeout handling** for long-running operations
- **Graceful shutdown** on SIGTERM/SIGINT signals
- **Circuit breaker** pattern in client library

## Security

Security measures implemented:

- **Helmet.js** for security headers
- **CORS** configuration for cross-origin requests
- **Input validation** for all API endpoints
- **Non-root user** in Docker container
- **Environment variable** configuration for secrets

## Contributing

1. Follow TypeScript strict mode
2. Add tests for new functionality
3. Update documentation for API changes
4. Use conventional commit messages
5. Ensure Docker builds successfully

## License

MIT License - see LICENSE file for details.