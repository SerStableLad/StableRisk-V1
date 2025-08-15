# Phase 2 Rollback Plan: Service Extraction

## Overview
This document outlines the complete rollback procedure for Phase 2 service extraction, including metrics service, background jobs service, cache service, and service communication integration.

## Rollback Scenarios

### Scenario A: Complete Phase 2 Rollback
**When to use**: Distributed architecture causing performance issues, service instability, or data consistency problems.

### Scenario B: Individual Service Rollback
**When to use**: Single service failure while maintaining others (metrics, cache, or background jobs).

### Scenario C: Emergency Service Isolation
**When to use**: Critical service failure requiring immediate isolation to prevent cascade failures.

## Pre-Rollback Checklist

- [ ] **Identify Service Dependencies**: Map which services depend on others
- [ ] **Check Circuit Breaker Status**: Verify circuit breakers are not masking issues
- [ ] **Backup Service Data**: Export metrics, job queues, and cached data if needed
- [ ] **Notify Stakeholders**: Alert team of service rollback
- [ ] **Prepare Fallback Systems**: Ensure monolith services are ready to resume full load
- [ ] **Monitor Resource Usage**: Check CPU, memory, and disk before rollback

## Rollback Procedures

### Task 08: Service Communication Rollback
**Estimated Time**: 10-15 minutes

```bash
# 1. Disable service communication clients
echo "Rolling back service communication integration..."

# 2. Update application to bypass service calls
export ENABLE_SERVICE_COMMUNICATION=false

# 3. Stop service health monitoring
# This removes the health monitoring loop

# 4. Revert to direct monolith service calls
# Code changes required to remove ServiceCommunicationClient usage

# 5. Restart application
npm run restart

# 6. Verify direct service usage
npm run test:monolith-services
```

**Code Changes Required**:
```typescript
// Remove service communication client usage
// BEFORE (Phase 2):
const serviceClient = ServiceCommunicationClient.getInstance();
const result = await serviceClient.get('metrics-service', '/metrics/summary');

// AFTER (Rollback):
// Use original monolith service
const metricsService = new MetricsService();
const result = await metricsService.getSummary();
```

**Configuration Changes**:
```bash
# Remove from .env:
# METRICS_SERVICE_URL=http://localhost:3001
# CACHE_SERVICE_URL=http://localhost:3002
# BACKGROUND_JOBS_URL=http://localhost:3003

# Add fallback configuration:
ENABLE_SERVICE_COMMUNICATION=false
USE_MONOLITH_SERVICES=true
```

**Verification Steps**:
- [ ] Application starts without service communication dependencies
- [ ] No HTTP calls to extracted services
- [ ] Circuit breaker monitoring disabled
- [ ] Health checks return to monolith-only status

### Task 07: Cache Service Rollback
**Estimated Time**: 15-20 minutes

```bash
# 1. Stop cache service
echo "Rolling back cache service..."
docker-compose down cache-service

# 2. Revert to original cache implementation
# Code changes needed to remove CacheServiceClient

# 3. Clear any cache configuration
unset CACHE_SERVICE_URL
unset CACHE_SERVICE_TIMEOUT

# 4. Restart Redis cluster for other services (optional)
# Or remove Redis if no other services need it

# 5. Test cache functionality with original implementation
npm run test:cache-fallback
```

**Code Changes Required**:
```typescript
// Revert cache client usage
// BEFORE (Phase 2):
const cacheClient = CacheServiceClient.getInstance();
await cacheClient.set(key, data, { ttl: 3600 });

// AFTER (Rollback):
// Use original cache service
const smartCache = SmartCacheService.getInstance();
await smartCache.set(key, data, 3600);
```

**Data Migration**:
```bash
# Export important cached data before rollback (if needed)
curl http://localhost:3002/cache/stats > cache-export.json

# Important cached data should be preserved in fallback cache
# No action needed if using hybrid fallback approach
```

**Files to Revert**:
- Remove cache service client imports
- Restore original `smart-cache-service.ts` usage
- Remove cache service Docker configuration

**Verification Steps**:
- [ ] Cache operations work with original implementation
- [ ] TTL calculation maintains intelligent behavior
- [ ] No HTTP calls to cache service
- [ ] Cache hit rates remain stable
- [ ] Memory usage returns to monolith baseline

### Task 06: Background Jobs Service Rollback
**Estimated Time**: 20-25 minutes

```bash
# 1. Stop background jobs service
echo "Rolling back background jobs service..."
docker-compose down background-jobs-service

# 2. Export pending jobs (critical)
# Connect to Redis and export job queue data
redis-cli --scan --pattern "stablerisk:jobs:*" | xargs redis-cli mget > pending-jobs.json

# 3. Revert to original background job processing
# Code changes to remove BackgroundJobsClient usage

# 4. Process exported jobs manually or via original system
# This may require custom migration script

# 5. Verify original background processing works
npm run test:background-jobs-original
```

**Critical Data Preservation**:
```bash
# Export all job queues before rollback
echo "Exporting job queues..."

# Pending jobs
redis-cli lrange "stablerisk:jobs:pending" 0 -1 > jobs-pending.json

# Processing jobs  
redis-cli zrange "stablerisk:jobs:processing" 0 -1 > jobs-processing.json

# Failed jobs
redis-cli zrange "stablerisk:jobs:failed" 0 -1 > jobs-failed.json

echo "Job data exported for manual processing"
```

**Code Changes Required**:
```typescript
// Remove background jobs client
// BEFORE (Phase 2):
const jobsClient = BackgroundJobsClient.getInstance();
await jobsClient.submitJob('collect-data', { ticker: 'USDT' });

// AFTER (Rollback):
// Use original background job service
const backgroundJobs = BackgroundJobService.getInstance();
await backgroundJobs.scheduleJob('collect-data', { ticker: 'USDT' });
```

**Manual Job Processing Script**:
```typescript
// scripts/process-exported-jobs.ts
import fs from 'fs';
import { BackgroundJobService } from '../src/lib/services/background-job-service';

async function processExportedJobs() {
  const pendingJobs = JSON.parse(fs.readFileSync('jobs-pending.json', 'utf8'));
  const backgroundService = BackgroundJobService.getInstance();
  
  for (const job of pendingJobs) {
    try {
      await backgroundService.processJob(JSON.parse(job));
    } catch (error) {
      console.error('Failed to process exported job:', error);
    }
  }
}

processExportedJobs();
```

**Verification Steps**:
- [ ] Original background job system processes tasks
- [ ] No jobs lost during migration
- [ ] Job scheduling works as before
- [ ] Performance matches original implementation

### Task 05: Metrics Service Rollback
**Estimated Time**: 10-15 minutes

```bash
# 1. Stop metrics service
echo "Rolling back metrics service..."
docker-compose down metrics-service

# 2. Export metrics data (if needed for analysis)
curl http://localhost:3001/metrics/system/summary > metrics-export.json

# 3. Revert to original metrics collection
# Code changes to remove MetricsServiceClient usage

# 4. Clear metrics service configuration
unset METRICS_SERVICE_URL
unset METRICS_SERVICE_TIMEOUT

# 5. Verify original metrics collection
npm run test:metrics-original
```

**Code Changes Required**:
```typescript
// Remove metrics service client
// BEFORE (Phase 2):
const metricsClient = MetricsServiceClient.getInstance();
await metricsClient.recordMetric('api.requests', 1, { endpoint: '/api/stablecoin' });

// AFTER (Rollback):
// Use original metrics service
const metrics = MetricsService.getInstance();
metrics.recordMetric('api.requests', 1, { endpoint: '/api/stablecoin' });
```

**Data Preservation**:
```bash
# Export important metrics before rollback
curl http://localhost:3001/metrics/stablecoin.data.updates > stablecoin-metrics.json
curl http://localhost:3001/metrics/api.requests.total > api-metrics.json

# These can be imported into monitoring systems if needed
```

**Verification Steps**:
- [ ] Original metrics collection resumes
- [ ] No HTTP calls to metrics service
- [ ] Metrics data continues to be recorded locally
- [ ] Monitoring dashboards update correctly

## Complete Phase 2 Rollback Script

```bash
#!/bin/bash
# complete-phase-2-rollback.sh

set -e

echo "=== PHASE 2 COMPLETE ROLLBACK ==="
echo "WARNING: This will revert all extracted services to monolith"
read -p "Are you sure you want to continue? (y/N): " confirm

if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
    echo "Rollback cancelled"
    exit 0
fi

echo "Starting Phase 2 rollback..."

# Step 1: Export critical data
echo "1. Exporting service data..."
mkdir -p rollback-exports/$(date +%Y%m%d_%H%M%S)
cd rollback-exports/$(date +%Y%m%d_%H%M%S)

# Export metrics (if service is running)
curl -f http://localhost:3001/metrics/system/summary > metrics-export.json 2>/dev/null || echo "Metrics service not available"

# Export job queues (if Redis is available)
redis-cli lrange "stablerisk:jobs:pending" 0 -1 > jobs-pending.json 2>/dev/null || echo "Redis not available"
redis-cli zrange "stablerisk:jobs:processing" 0 -1 > jobs-processing.json 2>/dev/null || echo "Redis not available"

# Export cache stats
curl -f http://localhost:3002/cache/stats > cache-stats.json 2>/dev/null || echo "Cache service not available"

cd ../..

# Step 2: Stop all extracted services
echo "2. Stopping extracted services..."
docker-compose down metrics-service cache-service background-jobs-service redis-cluster

# Step 3: Update environment configuration
echo "3. Updating environment configuration..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
cat >> .env << EOF

# Phase 2 Rollback Configuration
ENABLE_SERVICE_COMMUNICATION=false
USE_MONOLITH_SERVICES=true
METRICS_SERVICE_DISABLED=true
CACHE_SERVICE_DISABLED=true
BACKGROUND_JOBS_SERVICE_DISABLED=true
EOF

# Step 4: Restart application with monolith services
echo "4. Restarting application..."
npm run restart

# Step 5: Verify rollback
echo "5. Verifying rollback..."
sleep 10

# Test basic functionality
curl -f http://localhost:3000/api/health > /dev/null && echo "✓ Application healthy" || echo "✗ Application health check failed"

# Test API endpoints
curl -f http://localhost:3000/api/stablecoin/USDT > /dev/null && echo "✓ API endpoints working" || echo "✗ API endpoints failed"

# Step 6: Process exported jobs (if any)
echo "6. Processing exported jobs..."
if [ -f "rollback-exports/$(date +%Y%m%d)/jobs-pending.json" ]; then
    npm run process-exported-jobs
    echo "✓ Exported jobs processed"
fi

echo "=== PHASE 2 ROLLBACK COMPLETE ==="
echo "All services reverted to monolith implementation"
echo "Data exports saved in rollback-exports/$(date +%Y%m%d_%H%M%S)/"
```

## Service-Specific Rollback Scripts

### Quick Cache Service Rollback
```bash
#!/bin/bash
# rollback-cache-service.sh

echo "Rolling back cache service only..."

# Stop cache service
docker-compose down cache-service

# Update environment
export CACHE_SERVICE_DISABLED=true

# Restart application
npm run restart

# Verify
curl http://localhost:3000/api/stablecoin/USDT
echo "Cache service rollback complete"
```

### Quick Background Jobs Rollback
```bash
#!/bin/bash
# rollback-background-jobs.sh

echo "Rolling back background jobs service..."

# Export pending jobs
redis-cli lrange "stablerisk:jobs:pending" 0 -1 > jobs-backup.json

# Stop service
docker-compose down background-jobs-service

# Update environment
export BACKGROUND_JOBS_SERVICE_DISABLED=true

# Restart application
npm run restart

echo "Background jobs service rollback complete"
echo "Process jobs manually with: npm run process-exported-jobs"
```

## Post-Rollback Verification

### Functional Verification
```bash
# 1. Core API functionality
curl http://localhost:3000/api/stablecoin/USDT
curl http://localhost:3000/api/stablecoin/USDC
curl http://localhost:3000/api/search?q=stable

# 2. Background processing
# Verify jobs are still processed by monolith

# 3. Cache performance
# Run performance test to verify cache hit rates

# 4. Metrics collection
# Check that metrics are still being recorded

# 5. Full test suite
npm test
```

### Performance Verification
```bash
# Compare performance before and after rollback
npm run test:performance-baseline

# Key metrics to check:
# - API response times
# - Cache hit rates  
# - Memory usage
# - CPU utilization
# - Database query performance
```

### Data Integrity Verification
- [ ] **No Data Loss**: All critical data preserved during rollback
- [ ] **Cache Consistency**: Cache data remains valid
- [ ] **Job Completion**: Background jobs complete successfully
- [ ] **Metrics Continuity**: Metrics collection continues uninterrupted

## Recovery Procedures

### If Individual Service Rollback Fails
```bash
# 1. Restart the specific service
docker-compose up -d [service-name]

# 2. Check service health
curl http://localhost:[port]/health

# 3. Re-enable service in application
export [SERVICE]_DISABLED=false
npm run restart

# 4. Verify integration
npm run test:service-integration
```

### If Complete Rollback Fails
```bash
# 1. Restore environment backup
cp .env.backup.[timestamp] .env

# 2. Restart all services
docker-compose up -d

# 3. Import backed up data
# Process each exported data file

# 4. Verify system health
npm run test:full-integration
```

## Resource Cleanup

### Docker Resources
```bash
# Remove unused containers
docker container prune -f

# Remove unused networks
docker network prune -f

# Remove unused volumes (CAUTION: May delete data)
docker volume prune -f

# Check remaining resources
docker system df
```

### Application Resources
```bash
# Clear any service-specific cache
rm -rf .cache/services/

# Remove service client files (if desired)
# rm -rf src/lib/clients/*-service-client.ts

# Clean up temporary files
rm -rf tmp/services/
```

## Rollback Success Criteria

- [ ] **All APIs Functional**: Core API endpoints respond correctly
- [ ] **Cache Performance**: Cache hit rates within normal ranges
- [ ] **Background Jobs**: Job processing continues without interruption
- [ ] **Metrics Collection**: Metrics recorded by monolith services
- [ ] **No Service Calls**: No HTTP calls to extracted services
- [ ] **Performance Baseline**: Response times match or improve pre-extraction
- [ ] **Error Rates**: No increase in application errors
- [ ] **Resource Usage**: Memory and CPU usage optimized
- [ ] **Data Preservation**: No data loss during rollback process

## Monitoring After Rollback

### Key Metrics to Watch
- **Response Times**: API endpoint performance
- **Error Rates**: Application and service error frequency
- **Resource Usage**: CPU, memory, and disk utilization
- **Cache Performance**: Hit rates and invalidation patterns
- **Job Processing**: Background task completion rates

### Alert Thresholds
- Response time increase > 50%
- Error rate increase > 10%
- Memory usage increase > 25%
- Cache hit rate decrease > 20%
- Job completion rate decrease > 15%

## Lessons Learned Documentation

After rollback completion:

1. **Issue Analysis**
   - What triggered the need for rollback?
   - Which services had issues?
   - Were issues related to integration or individual services?

2. **Rollback Effectiveness**
   - How quickly was rollback completed?
   - Was any data lost?
   - Did performance return to baseline?

3. **Process Improvements**
   - What could be automated?
   - Which steps were unclear or difficult?
   - How can future rollbacks be faster?

4. **Prevention Measures**
   - What monitoring could have detected issues earlier?
   - What testing would have caught the problems?
   - How can service extraction be improved?