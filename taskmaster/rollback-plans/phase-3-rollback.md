# Phase 3 Rollback Plan: Event Integration

## Overview
This document outlines the complete rollback procedure for Phase 3 event integration, including event publishing, event consumption, and API compatibility layer removal.

## Rollback Scenarios

### Scenario A: Complete Event System Rollback
**When to use**: Event-driven architecture causing data consistency issues, performance degradation, or message delivery problems.

### Scenario B: Event Component Rollback
**When to use**: Issues with specific event components (publishing, consumption, or compatibility layer) while maintaining others.

### Scenario C: Emergency Event Isolation
**When to use**: Critical event system failure causing cascade issues across services.

## Pre-Rollback Checklist

- [ ] **Check Event Queues**: Verify no critical events are in processing
- [ ] **Document Event State**: Record current event publishing/consumption status
- [ ] **Backup Event Data**: Export event logs and processing state if needed
- [ ] **Notify Services**: Alert all services that consume events
- [ ] **Check API Compatibility**: Ensure rollback won't break client applications
- [ ] **Verify Fallback Systems**: Confirm direct service calls work without events

## Rollback Procedures

### Task 11: API Compatibility Layer Rollback
**Estimated Time**: 10-15 minutes

```bash
# 1. Set migration percentage to 0% (force fallback)
echo "Rolling back API compatibility layer..."
curl -X POST http://localhost:3000/api/admin/migration \
  -H "Content-Type: application/json" \
  -d '{"action": "update-migration", "percentage": 0}'

# 2. Disable compatibility layer
export ENABLE_API_COMPATIBILITY_LAYER=false

# 3. Remove compatibility layer from API routes
# Code changes required to bypass APICompatibilityLayer

# 4. Restart application
npm run restart

# 5. Verify direct service usage
npm run test:api-direct-calls
```

**Code Changes Required**:
```typescript
// Remove compatibility layer usage from API routes
// BEFORE (Phase 3):
const compatibilityLayer = APICompatibilityLayer.getInstance();
const data = await compatibilityLayer.getCachedData(key, fallbackFactory);

// AFTER (Rollback):
// Direct service usage
const data = await fallbackFactory();
```

**Configuration Changes**:
```bash
# Update .env:
ENABLE_API_COMPATIBILITY_LAYER=false
ENABLE_GRADUAL_MIGRATION=false
MIGRATION_PERCENTAGE=0

# Remove compatibility settings:
# COMPATIBILITY_TIMEOUT=2000
# FALLBACK_CACHE_SIZE=100
```

**Verification Steps**:
- [ ] API endpoints work without compatibility layer
- [ ] No HTTP calls through compatibility abstraction
- [ ] Direct service calls function correctly
- [ ] Client applications receive expected responses
- [ ] Performance returns to baseline

### Task 10: Event Consumption Rollback
**Estimated Time**: 15-20 minutes

```bash
# 1. Stop all event consumers
echo "Rolling back event consumption system..."

# 2. Gracefully shutdown event consumer manager
# This should be done in application shutdown

# 3. Remove event handlers from services
# Code changes to remove EventHandler implementations

# 4. Clear consumer groups from Redis
redis-cli XGROUP DESTROY stablerisk:events main-app
redis-cli XGROUP DESTROY stablerisk:events cache-service
redis-cli XGROUP DESTROY stablerisk:events metrics-service
redis-cli XGROUP DESTROY stablerisk:events background-jobs

# 5. Remove event consumption configuration
unset EVENT_CONSUMER_ENABLED

# 6. Restart services without event consumption
docker-compose restart cache-service metrics-service background-jobs-service
npm run restart
```

**Code Changes Required**:
```typescript
// Remove event consumption from services
// BEFORE (Phase 3):
export class StablecoinDataUpdatedHandler implements EventHandler {
  async handle(event: DomainEvent): Promise<void> {
    // Handle event logic
  }
}

// AFTER (Rollback):
// Remove handler implementations
// Services operate independently without event reactions
```

**Service-Specific Changes**:
```bash
# Cache Service: Remove event-based cache operations
# Metrics Service: Remove event-based metric recording  
# Background Jobs: Remove event-triggered job scheduling
# Main App: Remove any event consumption logic
```

**Data Preservation**:
```bash
# Export event streams before cleanup (if needed for analysis)
redis-cli XRANGE stablerisk:events - + > events-export.json
redis-cli XRANGE stablerisk:events:dead-letter - + > dead-letter-events.json

echo "Event data exported for analysis"
```

**Verification Steps**:
- [ ] No event consumers running
- [ ] Services operate independently
- [ ] No Redis stream consumption
- [ ] Business logic works without event reactions
- [ ] Data consistency maintained without events

### Task 09: Event Publishing Rollback
**Estimated Time**: 10-15 minutes

```bash
# 1. Stop event publishing
echo "Rolling back event publishing system..."
export EVENT_PUBLISHING_ENABLED=false

# 2. Flush remaining events in queue
# Allow EventPublisher to process any pending events

# 3. Remove event publishing from services
# Code changes to remove EventPublisher usage

# 4. Shutdown event publisher
# Graceful shutdown to prevent data loss

# 5. Clean up event transport connections
# Close Redis connections, database connections

# 6. Restart application without event publishing
npm run restart
```

**Code Changes Required**:
```typescript
// Remove event publishing from services
// BEFORE (Phase 3):
await eventPublisher.publishStablecoinDataUpdated(
  ticker, data, source, metadata
);

// AFTER (Rollback):
// Remove event publishing calls
// Business logic continues without events
```

**Middleware Removal**:
```typescript
// Remove event publishing decorators
// BEFORE (Phase 3):
@PublishEvent({
  eventType: 'StablecoinDataRequested',
  aggregateType: 'stablecoin'
})
async getStablecoinData(ticker: string): Promise<any> {
  // Service logic
}

// AFTER (Rollback):
async getStablecoinData(ticker: string): Promise<any> {
  // Service logic without events
}
```

**Queue Cleanup**:
```bash
# Ensure all events are processed before shutdown
curl http://localhost:3000/api/events/flush

# Verify queue is empty
curl http://localhost:3000/api/events/status

# Remove event streams (optional, for cleanup)
# redis-cli DEL stablerisk:events
```

**Verification Steps**:
- [ ] No events being published
- [ ] Event publisher shutdown gracefully
- [ ] Services work without event publishing
- [ ] No Redis stream writes
- [ ] Application performance stable

## Complete Phase 3 Rollback Script

```bash
#!/bin/bash
# complete-phase-3-rollback.sh

set -e

echo "=== PHASE 3 COMPLETE ROLLBACK ==="
echo "WARNING: This will disable all event-driven architecture"
read -p "Are you sure you want to continue? (y/N): " confirm

if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
    echo "Rollback cancelled"
    exit 0
fi

echo "Starting Phase 3 rollback..."

# Step 1: Force migration percentage to 0% (immediate fallback)
echo "1. Forcing compatibility layer to fallback mode..."
curl -X POST http://localhost:3000/api/admin/migration \
  -H "Content-Type: application/json" \
  -d '{"action": "update-migration", "percentage": 0}' || echo "Migration API not available"

# Step 2: Export event data for analysis
echo "2. Exporting event data..."
mkdir -p rollback-exports/phase3/$(date +%Y%m%d_%H%M%S)
cd rollback-exports/phase3/$(date +%Y%m%d_%H%M%S)

# Export event streams
redis-cli XRANGE stablerisk:events - + > events-export.json 2>/dev/null || echo "No events to export"
redis-cli XRANGE stablerisk:events:dead-letter - + > dead-letter-export.json 2>/dev/null || echo "No dead letter events"

# Export event consumer status
curl -f http://localhost:3000/api/events/consumers/status > consumers-status.json 2>/dev/null || echo "Consumer API not available"

cd ../../..

# Step 3: Stop event processing gracefully
echo "3. Stopping event processing..."

# Flush remaining events
curl -X POST http://localhost:3000/api/events/flush 2>/dev/null || echo "Event flush API not available"

# Stop event consumers
curl -X POST http://localhost:3000/api/events/consumers/stop 2>/dev/null || echo "Consumer stop API not available"

# Step 4: Update environment configuration
echo "4. Updating environment configuration..."
cp .env .env.backup.phase3.$(date +%Y%m%d_%H%M%S)

cat >> .env << EOF

# Phase 3 Rollback Configuration
EVENT_PUBLISHING_ENABLED=false
EVENT_CONSUMPTION_ENABLED=false
ENABLE_API_COMPATIBILITY_LAYER=false
ENABLE_GRADUAL_MIGRATION=false
MIGRATION_PERCENTAGE=0

# Disable event components
EVENT_TRANSPORT=disabled
EVENT_CONSUMER_ENABLED=false
EVENT_PUBLISHER_ENABLED=false
EOF

# Step 5: Clean up Redis consumer groups
echo "5. Cleaning up event infrastructure..."
redis-cli XGROUP DESTROY stablerisk:events main-app 2>/dev/null || echo "Consumer group main-app not found"
redis-cli XGROUP DESTROY stablerisk:events cache-service 2>/dev/null || echo "Consumer group cache-service not found"  
redis-cli XGROUP DESTROY stablerisk:events metrics-service 2>/dev/null || echo "Consumer group metrics-service not found"
redis-cli XGROUP DESTROY stablerisk:events background-jobs 2>/dev/null || echo "Consumer group background-jobs not found"

# Step 6: Restart all services
echo "6. Restarting services without event integration..."

# Restart extracted services first
docker-compose restart cache-service metrics-service background-jobs-service 2>/dev/null || echo "Some services not available"

# Restart main application
npm run restart

# Step 7: Verify rollback
echo "7. Verifying Phase 3 rollback..."
sleep 10

# Test API functionality
curl -f http://localhost:3000/api/health > /dev/null && echo "✓ Application healthy" || echo "✗ Application health check failed"

# Test direct API calls (no compatibility layer)
curl -f http://localhost:3000/api/stablecoin/USDT > /dev/null && echo "✓ Direct API calls working" || echo "✗ API calls failed"

# Verify no event processing
curl -f http://localhost:3000/api/events/status > /dev/null 2>&1 && echo "⚠ Event APIs still active" || echo "✓ Event processing disabled"

echo "=== PHASE 3 ROLLBACK COMPLETE ==="
echo "Event-driven architecture disabled"
echo "Services now operate in direct-call mode"
echo "Event data exported to rollback-exports/phase3/$(date +%Y%m%d_%H%M%S)/"
```

## Component-Specific Rollback Scripts

### Quick API Compatibility Rollback
```bash
#!/bin/bash
# rollback-api-compatibility.sh

echo "Rolling back API compatibility layer..."

# Force fallback mode
curl -X POST http://localhost:3000/api/admin/migration \
  -d '{"action": "update-migration", "percentage": 0}'

# Disable in environment
export ENABLE_API_COMPATIBILITY_LAYER=false

# Restart
npm run restart

echo "API compatibility layer disabled"
```

### Quick Event System Rollback  
```bash
#!/bin/bash
# rollback-event-system.sh

echo "Disabling event system..."

# Stop publishing
export EVENT_PUBLISHING_ENABLED=false

# Stop consumption
export EVENT_CONSUMPTION_ENABLED=false

# Flush remaining events
curl -X POST http://localhost:3000/api/events/flush

# Restart application
npm run restart

echo "Event system disabled"
```

## Post-Rollback Verification

### Functional Verification
```bash
# 1. Core API functionality without events
curl http://localhost:3000/api/stablecoin/USDT
curl http://localhost:3000/api/stablecoin/USDC  
curl http://localhost:3000/api/search?q=stable

# 2. Service independence verification
# Each service should work without event coordination

# 3. Data consistency without events
# Run data consistency checks

# 4. Performance without event overhead
npm run test:performance-no-events

# 5. Full test suite
npm test
```

### Event System Verification
```bash
# Verify event system is completely disabled
# 1. No event publishers active
ps aux | grep -i event || echo "✓ No event processes"

# 2. No Redis stream writes
redis-cli MONITOR | grep -i xadd || echo "✓ No stream writes"

# 3. No event API endpoints active
curl http://localhost:3000/api/events/status
# Should return 404 or disabled status

# 4. No event consumers running
docker ps | grep -i event || echo "✓ No event containers"
```

### Business Logic Verification
- [ ] **Data Updates**: Stablecoin data updates work without events
- [ ] **Cache Operations**: Cache invalidation works without events
- [ ] **Background Jobs**: Jobs scheduled without event triggers
- [ ] **API Responses**: All endpoints return expected data
- [ ] **Service Coordination**: Services coordinate without events

## Data Recovery Procedures

### Event Data Recovery
```bash
# If events need to be reprocessed after rollback
echo "Processing exported events manually..."

# Parse exported events
jq -r '.[]' rollback-exports/phase3/*/events-export.json | while read event; do
  # Process event based on type
  echo "Processing event: $event"
  # Custom logic based on event type
done
```

### State Synchronization
```bash
# Ensure service state is consistent after event rollback
echo "Synchronizing service states..."

# 1. Cache consistency check
npm run test:cache-consistency

# 2. Metrics alignment  
npm run test:metrics-alignment

# 3. Job queue state
npm run test:job-queue-state

# 4. Database consistency
npm run test:database-consistency
```

## Recovery Procedures

### If Rollback Fails
```bash
# 1. Restore environment backup
cp .env.backup.phase3.[timestamp] .env

# 2. Re-enable event system
export EVENT_PUBLISHING_ENABLED=true
export EVENT_CONSUMPTION_ENABLED=true

# 3. Restart event consumers
npm run start-event-consumers

# 4. Verify event flow
npm run test:event-flow

# 5. Check for data consistency
npm run test:event-consistency
```

### If Services Become Inconsistent
```bash
# 1. Stop all services
docker-compose down

# 2. Reset Redis streams
redis-cli FLUSHDB

# 3. Restart services in clean state
docker-compose up -d

# 4. Run data synchronization
npm run sync-service-data

# 5. Verify consistency
npm run test:service-consistency
```

## Performance Impact Assessment

### Expected Performance Changes After Rollback
- **Response Times**: Should improve (no event publishing overhead)
- **Memory Usage**: Should decrease (no event queues)
- **CPU Usage**: Should decrease (no event processing)
- **Network Traffic**: Should decrease (no inter-service events)
- **Database Load**: May increase (direct queries instead of cached events)

### Monitoring After Rollback
```bash
# Monitor key performance metrics
npm run monitor:performance

# Key metrics to watch:
# - API response times
# - Database query performance  
# - Cache hit rates
# - Service-to-service call patterns
# - Error rates
```

## Rollback Success Criteria

- [ ] **No Event Processing**: Event publishing and consumption stopped
- [ ] **API Functionality**: All API endpoints work without events
- [ ] **Service Independence**: Services operate without event coordination
- [ ] **Data Consistency**: No data inconsistencies from missing events
- [ ] **Performance Stable**: Response times and resource usage stable
- [ ] **Client Compatibility**: Client applications continue working
- [ ] **No Event Errors**: No errors related to event processing
- [ ] **Clean State**: Event queues and streams properly cleaned up

## Monitoring After Rollback

### Critical Metrics
- **API Performance**: Response times for all endpoints
- **Service Health**: Individual service status and performance
- **Data Consistency**: Cross-service data synchronization
- **Error Rates**: Application error frequency
- **Resource Usage**: CPU, memory, and network utilization

### Alert Configuration
```bash
# Set up alerts for post-rollback monitoring
# 1. API response time > baseline + 20%
# 2. Service error rate > 5%
# 3. Data inconsistency detected
# 4. Cache miss rate > 30%
# 5. Database query time > baseline + 50%
```

## Long-term Considerations

### Architecture Decisions
- **Service Communication**: Direct HTTP calls vs event-driven
- **Data Consistency**: Strong consistency vs eventual consistency
- **Caching Strategy**: Local cache vs distributed cache
- **Job Scheduling**: Direct scheduling vs event-triggered

### Future Planning
- **Re-implementation**: Plan for event system improvements
- **Monitoring**: Enhanced observability for next attempt
- **Testing**: Better integration testing for event flows
- **Rollback**: Improved rollback procedures based on lessons learned

## Documentation Requirements

After rollback completion:

1. **Impact Analysis**
   - What business processes were affected?
   - How did services perform without events?
   - Were there any data consistency issues?

2. **Technical Assessment**  
   - Which event-driven patterns were most problematic?
   - How effective were the rollback procedures?
   - What monitoring gaps were identified?

3. **Improvement Recommendations**
   - How can event-driven architecture be improved?
   - What testing would prevent similar issues?
   - How can rollback procedures be enhanced?

4. **Decision Documentation**
   - Should event-driven architecture be retried?
   - What changes would be needed for success?
   - How long should the rollback state be maintained?