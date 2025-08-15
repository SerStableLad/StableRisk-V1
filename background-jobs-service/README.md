# Background Jobs Service

A robust, scalable background job processing service built with TypeScript, Express.js, Redis, and PostgreSQL. This service provides a complete REST API for job management, monitoring, and administration.

## Features

### Core Job Processing
- **Multi-worker architecture** with configurable scaling
- **Priority-based job queuing** (high, medium, low)
- **Automatic retry mechanism** with configurable backoff strategies
- **Job timeout handling** with graceful cancellation
- **Comprehensive job lifecycle management**

### REST API
- **Job Management API** - Submit, monitor, and cancel jobs
- **Health Monitoring API** - Service health, readiness, and liveness checks
- **Admin Management API** - Worker scaling, queue control, system administration
- **Rate Limiting** - Configurable rate limits per endpoint
- **Request Validation** - Comprehensive input validation with Joi
- **Error Handling** - Structured error responses with correlation IDs

### Monitoring & Observability
- **Comprehensive Logging** - Structured logging with correlation tracking
- **Metrics Collection** - Job performance, system health, and API metrics
- **Health Checks** - Multiple levels of health monitoring
- **Performance Tracking** - Response times, processing rates, error rates

### Security & Reliability
- **API Key Authentication** - Separate keys for general API and admin operations
- **CORS Configuration** - Configurable cross-origin resource sharing
- **Security Headers** - Helmet.js security middleware
- **Graceful Shutdown** - Clean service termination with job completion
- **Data Persistence** - PostgreSQL for job results and system metrics

## Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Redis 6+
- PostgreSQL 13+

### Development Setup

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd background-jobs-service
   chmod +x scripts/dev.sh
   ```

2. **Initial setup**:
   ```bash
   ./scripts/dev.sh setup
   ```

3. **Start development server**:
   ```bash
   ./scripts/dev.sh dev
   ```

4. **Check service status**:
   ```bash
   ./scripts/dev.sh status
   ```

### Using Docker Compose

1. **Start all services**:
   ```bash
   docker-compose up -d
   ```

2. **View logs**:
   ```bash
   docker-compose logs -f bg-jobs-service
   ```

3. **Stop services**:
   ```bash
   docker-compose down
   ```

## API Documentation

### Base URL
- Development: `http://localhost:3001`
- Production: Configure via environment variables

### Authentication
- **API Key**: Include `X-API-Key` header for job management endpoints
- **Admin Key**: Include `X-Admin-API-Key` header for admin endpoints
- **Health Checks**: No authentication required

### Job Management API

#### Submit Single Job
```http
POST /jobs/submit
Content-Type: application/json
X-API-Key: your-api-key

{
  "type": "collect-stablecoin-data",
  "data": {
    "ticker": "USDC",
    "sources": ["coingecko", "coinmarketcap"]
  },
  "options": {
    "priority": "high",
    "attempts": 3,
    "delay": 0,
    "timeout": 300000
  }
}
```

**Response:**
```json
{
  "jobId": "job_abc123",
  "status": "pending",
  "message": "Job submitted successfully",
  "estimatedCompletion": "2023-12-01T10:30:00Z",
  "correlationId": "req_xyz789"
}
```

#### Submit Bulk Jobs
```http
POST /jobs/bulk
Content-Type: application/json
X-API-Key: your-api-key

{
  "jobs": [
    {
      "type": "collect-stablecoin-data",
      "data": { "ticker": "USDC" }
    },
    {
      "type": "analyze-transparency",
      "data": { "ticker": "USDT" }
    }
  ]
}
```

#### Get Job Status
```http
GET /jobs/{jobId}
X-API-Key: your-api-key
```

**Response:**
```json
{
  "id": "job_abc123",
  "type": "collect-stablecoin-data",
  "status": "completed",
  "result": {
    "ticker": "USDC",
    "price": 1.00,
    "marketCap": 24500000000
  },
  "createdAt": "2023-12-01T10:00:00Z",
  "completedAt": "2023-12-01T10:02:30Z",
  "processingTimeMs": 150000,
  "correlationId": "req_xyz789"
}
```

#### List Jobs
```http
GET /jobs?status=completed&limit=50&offset=0&sortBy=createdAt&sortOrder=desc
X-API-Key: your-api-key
```

#### Cancel Job
```http
DELETE /jobs/{jobId}
X-API-Key: your-api-key
```

#### Queue Statistics
```http
GET /jobs/stats/queue
X-API-Key: your-api-key
```

**Response:**
```json
{
  "pending": 45,
  "processing": 5,
  "completed": 1250,
  "failed": 23,
  "total": 1323,
  "processingRate": 42.5,
  "averageProcessingTime": 35000,
  "errorRate": 1.7,
  "correlationId": "req_xyz789"
}
```

### Health Monitoring API

#### Basic Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-12-01T10:00:00Z",
  "service": "background-jobs-service",
  "version": "1.0.0",
  "uptime": 3600.5,
  "responseTime": 12,
  "checks": {
    "redis": true,
    "database": true
  }
}
```

#### Detailed Health Check
```http
GET /health/detailed
```

#### Readiness Check
```http
GET /health/ready
```

#### Liveness Check
```http
GET /health/live
```

### Admin Management API

#### Get Worker Status
```http
GET /admin/workers
X-Admin-API-Key: your-admin-key
```

#### Scale Worker Pool
```http
POST /admin/workers/scale
Content-Type: application/json
X-Admin-API-Key: your-admin-key

{
  "targetWorkers": 8,
  "reason": "High load detected"
}
```

#### Pause Queue Processing
```http
POST /admin/queue/pause
Content-Type: application/json
X-Admin-API-Key: your-admin-key

{
  "reason": "Maintenance window"
}
```

#### Clear Failed Jobs
```http
POST /admin/queue/clear
Content-Type: application/json
X-Admin-API-Key: your-admin-key

{
  "statuses": ["failed"],
  "confirm": true
}
```

## Configuration

### Environment Variables

#### Service Configuration
```bash
NODE_ENV=development
PORT=3001

# Logging
LOG_LEVEL=debug
LOG_FORMAT=pretty
ENABLE_FILE_LOGGING=true
```

#### Redis Configuration
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=bg_jobs:
```

#### Database Configuration
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=background_jobs
DB_USER=bg_jobs_user
DB_PASSWORD=bg_jobs_password
DB_SSL=false
DB_POOL_SIZE=20
```

#### Worker Configuration
```bash
MAX_WORKERS=5
POLLING_INTERVAL=1000
STALE_JOB_TIMEOUT=300000
ENABLE_METRICS=true
```

#### Security Configuration
```bash
API_KEY=your-secure-api-key
ADMIN_API_KEY=your-secure-admin-key
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

#### Rate Limiting Configuration
```bash
RATE_LIMIT_GENERAL=1000    # requests per minute
RATE_LIMIT_JOBS=100        # job submissions per minute
RATE_LIMIT_BULK=10         # bulk submissions per minute
RATE_LIMIT_ADMIN=20        # admin operations per minute
```

## Job Types

### Built-in Job Handlers

#### 1. Stablecoin Data Collection
```javascript
{
  "type": "collect-stablecoin-data",
  "data": {
    "ticker": "USDC",
    "sources": ["coingecko", "coinmarketcap"],
    "urgent": false
  }
}
```

#### 2. Transparency Analysis
```javascript
{
  "type": "analyze-transparency",
  "data": {
    "ticker": "USDT",
    "url": "https://wallet.tether.to/transparency",
    "schema": { "customSchema": "..." }
  }
}
```

#### 3. Cache Invalidation
```javascript
{
  "type": "invalidate-cache",
  "data": {
    "pattern": "stablecoin:*",
    "keys": ["specific:key:1", "specific:key:2"]
  }
}
```

#### 4. Metrics Aggregation
```javascript
{
  "type": "aggregate-metrics",
  "data": {
    "startTime": "2023-12-01T00:00:00Z",
    "endTime": "2023-12-01T23:59:59Z",
    "aggregationLevel": "hour"
  }
}
```

## Error Handling

### Error Response Format
```json
{
  "error": "Validation Error",
  "message": "Request validation failed",
  "details": [
    {
      "field": "data.ticker",
      "message": "ticker is required",
      "value": null
    }
  ],
  "correlationId": "req_xyz789",
  "timestamp": "2023-12-01T10:00:00Z"
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Job submitted successfully
- `400` - Bad request / Validation error
- `401` - Unauthorized / Invalid API key
- `404` - Job not found
- `413` - Payload too large
- `415` - Unsupported media type
- `429` - Rate limit exceeded
- `500` - Internal server error
- `503` - Service unavailable

### Rate Limiting Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2023-12-01T10:01:00Z
X-RateLimit-Used: 5
```

## Monitoring & Metrics

### Application Metrics
- Job processing rates
- Error rates and patterns
- Response times (P50, P95, P99)
- Queue depths and wait times
- Worker utilization
- Memory and CPU usage

### Health Check Endpoints
- `/health` - Basic health (< 100ms response)
- `/health/detailed` - Comprehensive health with component status
- `/health/ready` - Kubernetes readiness probe
- `/health/live` - Kubernetes liveness probe
- `/health/redis` - Redis-specific health
- `/health/database` - Database-specific health

### Database Monitoring
The service includes comprehensive database views for monitoring:
- `job_summary` - Job statistics by type and status
- `hourly_job_metrics` - Time-series job metrics
- `system_health_summary` - Component health aggregation
- `api_performance_summary` - API endpoint performance

## Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build TypeScript
npm run start        # Start production server
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
```

### Development Scripts
```bash
./scripts/dev.sh setup     # Initial setup
./scripts/dev.sh services  # Start Redis & PostgreSQL
./scripts/dev.sh dev       # Start development server
./scripts/dev.sh status    # Check service status
./scripts/dev.sh logs      # View all logs
./scripts/dev.sh cleanup   # Clean up everything
```

### Docker Profiles
```bash
# Start core services only
docker-compose up -d

# Include management tools (Redis Commander, pgAdmin)
docker-compose --profile tools up -d

# Include load balancer
docker-compose --profile loadbalancer up -d
```

### Adding New Job Handlers

1. **Create handler class**:
```typescript
// src/processors/handlers/my-custom-handler.ts
import { BaseHandler } from './base-handler';
import { Job } from '../../types';

export class MyCustomHandler extends BaseHandler {
  async process(job: Job): Promise<any> {
    // Your processing logic here
    return { result: 'success' };
  }
}
```

2. **Register handler**:
```typescript
// src/app/server.ts
import { MyCustomHandler } from '../processors/handlers/my-custom-handler';

this.handlerRegistry.register(
  'my-custom-job',
  new MyCustomHandler({ timeoutMs: 60000 })
);
```

3. **Add job type definition**:
```typescript
// src/types/index.ts
export interface MyCustomJob {
  type: 'my-custom-job';
  data: {
    // Define your job data structure
  };
}
```

## Production Deployment

### Docker Production Build
```bash
docker build --target production -t bg-jobs-service:latest .
```

### Environment Considerations
- Use strong, unique API keys
- Enable SSL/TLS in production
- Configure proper CORS origins
- Set up monitoring and alerting
- Implement log aggregation
- Use secrets management
- Configure backup strategies

### Scaling Recommendations
- **Horizontal Scaling**: Use multiple service instances with load balancer
- **Vertical Scaling**: Increase worker count and resource limits
- **Database**: Use connection pooling and read replicas
- **Redis**: Use Redis Cluster for high availability
- **Monitoring**: Implement comprehensive observability stack

## Troubleshooting

### Common Issues

#### Service Won't Start
1. Check Docker is running: `docker info`
2. Verify ports are available: `netstat -tulpn | grep :3001`
3. Check environment variables: `env | grep -E "(REDIS|DB|PORT)"`

#### Jobs Not Processing
1. Check Redis connection: `docker-compose exec redis redis-cli ping`
2. Verify worker status: `curl -H "X-Admin-API-Key: your-key" http://localhost:3001/admin/workers`
3. Check queue status: `curl -H "X-API-Key: your-key" http://localhost:3001/jobs/stats/queue`

#### High Memory Usage
1. Check job retention settings
2. Review job payload sizes
3. Monitor Redis memory usage
4. Consider increasing cleanup frequency

### Logs and Debugging
```bash
# View service logs
./scripts/dev.sh logs bg-jobs-service

# Check specific component logs
curl http://localhost:3001/health/detailed

# Get recent API logs (admin endpoint)
curl -H "X-Admin-API-Key: your-key" http://localhost:3001/admin/logs/recent?limit=100
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## Support

For issues and questions:
1. Check this README
2. Review the API documentation
3. Check existing GitHub issues
4. Create a new issue with detailed information