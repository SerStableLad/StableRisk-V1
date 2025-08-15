# Phase 1 Rollback Plan: Foundation Infrastructure

## Overview
This document outlines the complete rollback procedure for Phase 1 foundation infrastructure, including PostgreSQL, NGINX proxy, database models, and logging integration.

## Rollback Scenarios

### Scenario A: Complete Phase 1 Rollback
**When to use**: Critical infrastructure issues, database corruption, or performance degradation affecting production.

### Scenario B: Selective Component Rollback  
**When to use**: Issues with specific components (database, NGINX, or logging) while keeping others functional.

### Scenario C: Emergency Rollback
**When to use**: Production outage or critical security issues requiring immediate reversion.

## Pre-Rollback Checklist

- [ ] **Backup Current State**: Create full backup of current system state
- [ ] **Document Issues**: Record specific problems that triggered rollback
- [ ] **Notify Stakeholders**: Inform team members and stakeholders of rollback
- [ ] **Check Dependencies**: Verify no Phase 2 or Phase 3 components depend on Phase 1 infrastructure
- [ ] **Prepare Monitoring**: Set up monitoring for rollback process
- [ ] **Test Communication**: Ensure team communication channels are working

## Rollback Procedures

### Task 04: Logging Integration Rollback
**Estimated Time**: 15-20 minutes

```bash
# 1. Stop logging service calls
echo "Rolling back logging integration..."

# 2. Set environment variable to disable database logging
export DATABASE_LOGGING_ENABLED=false

# 3. Remove decorator annotations (if applied)
# This requires code changes to remove @LogStablecoinOperation decorators
# and direct logging service calls

# 4. Restart application to pick up changes
npm run restart

# 5. Verify logging is disabled
curl http://localhost:3000/api/health/logging
```

**Code Changes Required**:
```typescript
// Remove these from services:
// - @LogStablecoinOperation decorators
// - Direct calls to EnhancedLoggingService
// - Event publishing middleware

// Example rollback:
// BEFORE (Phase 1):
// @LogStablecoinOperation('fetchData')
// async getData() { ... }

// AFTER (Rollback):
// async getData() { ... }
```

**Verification Steps**:
- [ ] Application starts without database logging dependencies
- [ ] No log entries appear in PostgreSQL event tables
- [ ] Performance metrics show no logging overhead
- [ ] Error handling works without logging service

### Task 03: Database Models Rollback
**Estimated Time**: 10-15 minutes

```bash
# 1. Remove database integration service calls
echo "Rolling back database models..."

# 2. Remove imports and service calls from codebase
# This requires removing TypeScript imports and service instantiations

# 3. Keep database running but unused
# Don't drop tables in case rollback is temporary

# 4. Restart application
npm run restart

# 5. Verify application works without database models
npm run test:basic-functionality
```

**Code Changes Required**:
```typescript
// Remove these from services:
// - DatabaseIntegrationService imports
// - Repository pattern implementations
// - Database model usage

// Example rollback:
// BEFORE (Phase 1):
// const dbService = DatabaseIntegrationService.getInstance();
// await dbService.saveMetrics(ticker, scores);

// AFTER (Rollback):
// // Remove database calls, use original patterns
```

**Files to Revert**:
- `src/lib/db/` directory (keep but don't import)
- Remove database integration calls from existing services
- Remove TypeScript types imports

**Verification Steps**:
- [ ] TypeScript compilation succeeds without database imports
- [ ] Application starts without database connection requirements
- [ ] Existing functionality works unchanged
- [ ] No database queries executed by application

### Task 02: NGINX Proxy Rollback
**Estimated Time**: 5-10 minutes

```bash
# 1. Stop NGINX container
echo "Rolling back NGINX proxy..."
docker-compose down nginx

# 2. Access Next.js application directly
echo "Application now accessible on http://localhost:3000"

# 3. Update any hardcoded URLs in application
# Change from http://localhost to http://localhost:3000

# 4. Remove NGINX configuration files (optional)
# rm -rf nginx/

# 5. Verify direct access works
curl http://localhost:3000/api/health
```

**Configuration Changes**:
```bash
# Update .env if needed
# BEFORE:
# APP_URL=http://localhost

# AFTER:
# APP_URL=http://localhost:3000
```

**Verification Steps**:
- [ ] Application accessible on port 3000
- [ ] All API endpoints work directly
- [ ] Static assets load correctly
- [ ] No proxy-related errors in logs

### Task 01: PostgreSQL Rollback  
**Estimated Time**: 10-15 minutes

```bash
# 1. Stop PostgreSQL container
echo "Rolling back PostgreSQL..."
docker-compose down postgres

# 2. Remove database environment variables
# Edit .env file to comment out or remove:
# DB_HOST=localhost
# DB_PORT=5432
# etc.

# 3. Remove database volumes (if permanent rollback)
# CAUTION: This destroys all data
# docker volume rm stablerisk_postgres_data

# 4. Remove database configuration from docker-compose.yml
# Comment out or remove postgres service definition

# 5. Verify application works without database
npm run dev
```

**Environment Variables to Remove**:
```bash
# Comment out or remove from .env:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=stablerisk
# DB_USER=stablerisk_user
# DB_PASSWORD=your_secure_password_here
# DATABASE_URL=postgresql://...
```

**Files to Remove/Revert**:
- `sql/` directory
- PostgreSQL service from `docker-compose.yml`
- Database connection files

**Verification Steps**:
- [ ] Application starts without PostgreSQL dependency
- [ ] No database connection attempts in logs
- [ ] All existing functionality works
- [ ] Docker resources cleaned up

## Complete Phase 1 Rollback Script

```bash
#!/bin/bash
# complete-phase-1-rollback.sh

set -e

echo "=== PHASE 1 COMPLETE ROLLBACK ==="
echo "WARNING: This will revert all Phase 1 infrastructure changes"
read -p "Are you sure you want to continue? (y/N): " confirm

if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
    echo "Rollback cancelled"
    exit 0
fi

echo "Starting Phase 1 rollback..."

# Step 1: Disable logging integration
echo "1. Disabling database logging..."
export DATABASE_LOGGING_ENABLED=false

# Step 2: Stop and remove services
echo "2. Stopping Docker services..."
docker-compose down nginx postgres

# Step 3: Remove environment variables
echo "3. Updating environment configuration..."
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
sed -i.bak '/^DB_/d; /^DATABASE_/d; /^NGINX_/d' .env

# Step 4: Clean up Docker resources
echo "4. Cleaning up Docker resources..."
docker volume ls | grep stablerisk && docker volume rm stablerisk_postgres_data || echo "No volumes to remove"

# Step 5: Restart application
echo "5. Restarting application..."
npm run restart

# Step 6: Verify rollback
echo "6. Verifying rollback..."
sleep 5
curl -f http://localhost:3000/api/health > /dev/null && echo "✓ Application healthy" || echo "✗ Application health check failed"

echo "=== PHASE 1 ROLLBACK COMPLETE ==="
echo "Application is now running without Phase 1 infrastructure"
echo "Backup of .env saved as .env.backup.$(date +%Y%m%d_%H%M%S)"
```

## Post-Rollback Verification

### Functional Verification
```bash
# 1. Basic health check
curl http://localhost:3000/api/health

# 2. API endpoints work
curl http://localhost:3000/api/stablecoin/USDT
curl http://localhost:3000/api/search?q=USD

# 3. Run test suite
npm test

# 4. Check performance
npm run test:performance
```

### Technical Verification  
- [ ] **No Database Dependencies**: Application starts without PostgreSQL
- [ ] **Direct Port Access**: Application accessible on port 3000
- [ ] **No Proxy Dependencies**: No NGINX-related errors
- [ ] **Clean Logs**: No database or proxy connection errors
- [ ] **Resource Cleanup**: Docker containers and volumes removed
- [ ] **Environment Clean**: No unused environment variables

### Performance Verification
- [ ] **Response Times**: API response times within normal ranges
- [ ] **Memory Usage**: No memory leaks from removed infrastructure
- [ ] **CPU Usage**: CPU usage patterns returned to baseline
- [ ] **Error Rates**: No increase in application errors

## Recovery Procedures

### If Rollback Fails
1. **Immediate Recovery**:
   ```bash
   # Restore from backup
   cp .env.backup.YYYYMMDD_HHMMSS .env
   
   # Restart containers
   docker-compose up -d
   
   # Check application health
   curl http://localhost:3000/api/health
   ```

2. **Code Recovery**:
   - Use git to revert any code changes
   - `git checkout HEAD~1` to previous working commit
   - Run tests to verify functionality

3. **Data Recovery**:
   - If PostgreSQL data was deleted, restore from backup
   - Re-run database migrations if needed

### Emergency Contacts
- **Infrastructure Team**: [Contact Info]
- **Database Admin**: [Contact Info]  
- **DevOps Lead**: [Contact Info]
- **Product Manager**: [Contact Info]

## Rollback Success Criteria

- [ ] **Application Accessible**: Main application loads without errors
- [ ] **APIs Functional**: All API endpoints respond correctly
- [ ] **Performance Normal**: Response times within acceptable ranges
- [ ] **No Dependencies**: No errors related to removed infrastructure
- [ ] **Tests Passing**: Critical test suites pass
- [ ] **Monitoring Clean**: No alerts or errors in monitoring systems
- [ ] **Resource Cleanup**: All Docker resources properly removed
- [ ] **Documentation Updated**: Rollback completion documented

## Lessons Learned Template

After completing rollback, document:

1. **Root Cause**: What caused the need for rollback?
2. **Impact Assessment**: What was affected during the issue?
3. **Rollback Effectiveness**: How well did the rollback process work?
4. **Improvement Areas**: What could be improved for future rollbacks?
5. **Prevention Measures**: How can similar issues be prevented?

## Next Steps After Rollback

1. **Investigate Issues**: Analyze what went wrong with Phase 1
2. **Update Plans**: Revise Phase 1 tasks based on lessons learned  
3. **Test Fixes**: Validate fixes in development environment
4. **Plan Re-implementation**: Schedule Phase 1 retry if appropriate
5. **Update Documentation**: Update rollback procedures based on experience