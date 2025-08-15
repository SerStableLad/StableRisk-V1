# Service Health Monitor

The Service Health Monitor provides comprehensive system health monitoring for the StableRisk-AI platform's microservices architecture.

## Features

- **Singleton Pattern**: Global access with single instance
- **Automatic Monitoring**: Health checks every 60 seconds
- **Comprehensive Metrics**: Records system and service-level health metrics
- **Circuit Breaker Monitoring**: Tracks failure counts and states
- **Critical Alerting**: Automatic alerts when all services are down
- **Graceful Degradation**: Handles service unavailability

## Quick Start

```typescript
import { ServiceHealthMonitor } from './monitoring/service-health-monitor';

// Get the singleton instance
const monitor = ServiceHealthMonitor.getInstance();

// Start monitoring
monitor.startMonitoring();

// Get current system health
const health = monitor.getSystemHealth();
console.log(`System status: ${health.status}`);
console.log(`Health score: ${health.healthScore}`);
console.log(`Healthy services: ${health.services.healthy.join(', ')}`);

// Stop monitoring when done
monitor.stopMonitoring();
```

## System Health Status

The monitor returns health status in three levels:

- **healthy**: 50% or more services are healthy
- **degraded**: Less than 50% services are healthy
- **critical**: No services are healthy

## Integration

The Service Health Monitor integrates with:

- **ServiceRegistry**: Gets list of services to monitor
- **ServiceCommunicationClient**: Performs health checks and monitors circuit breakers
- **MetricsServiceClient**: Records health metrics for monitoring dashboard

## Metrics Recorded

- `system.health.overall_score`: Overall system health (0-1)
- `system.health.service_status`: Individual service health (0 or 1)
- `system.circuit_breaker.failures`: Circuit breaker failure counts
- `system.health.critical_alert`: Critical system alerts

## Architecture

The Service Health Monitor follows the project's established patterns:

- Singleton pattern for service instances
- Integration with the 3-tier API architecture
- Comprehensive error handling and fallback strategies
- TypeScript strict mode with proper interfaces
- Test-driven development with comprehensive coverage

## Testing

Run tests with:
```bash
npm test -- src/lib/monitoring/__tests__/
```

The test suite covers:
- Singleton pattern behavior
- Monitoring lifecycle
- Health check logic
- System health reporting
- Critical alerting
- Error handling and edge cases
- Performance and timing
- Integration testing