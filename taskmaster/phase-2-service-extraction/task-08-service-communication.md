# Task 08: Service Communication Integration

## Overview
Establish reliable communication patterns between extracted services and the main application, including service discovery, circuit breakers, retry logic, and comprehensive health monitoring.

## Time Estimate: 6-7 days

## Prerequisites
- All Phase 1 foundation tasks completed (Tasks 01-04)
- All service extraction tasks completed (Tasks 05-07)
- Understanding of current service patterns in the monolith
- NGINX configured for service routing

## Technical Requirements

### 1. Service Registry and Discovery
```typescript
// src/lib/services/service-registry.ts
export interface ServiceInfo {
  name: string;
  url: string;
  health: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  lastCheck: Date;
  metadata: {
    timeout: number;
    retries: number;
    circuitBreakerThreshold: number;
    priority: number;
  };
}

export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services = new Map<string, ServiceInfo>();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.initializeServices();
    this.startHealthChecking();
  }

  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  private initializeServices(): void {
    const services: ServiceInfo[] = [
      {
        name: 'metrics-service',
        url: process.env.METRICS_SERVICE_URL || 'http://localhost:3001',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: new Date(),
        metadata: {
          timeout: 5000,
          retries: 3,
          circuitBreakerThreshold: 5,
          priority: 1
        }
      },
      {
        name: 'cache-service',
        url: process.env.CACHE_SERVICE_URL || 'http://localhost:3002',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: new Date(),
        metadata: {
          timeout: 2000,
          retries: 2,
          circuitBreakerThreshold: 3,
          priority: 2 // High priority
        }
      },
      {
        name: 'background-jobs-service',
        url: process.env.BACKGROUND_JOBS_URL || 'http://localhost:3003',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: new Date(),
        metadata: {
          timeout: 10000,
          retries: 3,
          circuitBreakerThreshold: 5,
          priority: 3
        }
      }
    ];

    services.forEach(service => {
      this.services.set(service.name, service);
    });
  }

  getService(name: string): ServiceInfo | null {
    return this.services.get(name) || null;
  }

  getAllServices(): ServiceInfo[] {
    return Array.from(this.services.values());
  }

  updateServiceHealth(name: string, health: ServiceInfo['health']): void {
    const service = this.services.get(name);
    if (service) {
      service.health = health;
      service.lastCheck = new Date();
    }
  }

  isServiceHealthy(name: string): boolean {
    const service = this.services.get(name);
    return service ? service.health === 'healthy' : false;
  }

  private startHealthChecking(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000);
  }

  private async performHealthChecks(): Promise<void> {
    const healthChecks = Array.from(this.services.entries()).map(
      async ([name, service]) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), service.metadata.timeout);

          const response = await fetch(`${service.url}/health`, {
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            this.updateServiceHealth(name, 'healthy');
          } else {
            this.updateServiceHealth(name, 'degraded');
          }
        } catch (error) {
          console.error(`Health check failed for ${name}:`, error.message);
          this.updateServiceHealth(name, 'unhealthy');
        }
      }
    );

    await Promise.allSettled(healthChecks);
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}
```

### 2. Circuit Breaker Pattern
```typescript
// src/lib/utils/circuit-breaker.ts
export interface CircuitBreakerOptions {
  threshold: number; // Number of failures before opening
  timeout: number; // Time to wait before trying again (ms)
  monitor?: (state: CircuitState, error?: Error) => void;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private nextAttempt = Date.now();
  private successCount = 0;

  constructor(
    private name: string,
    private options: CircuitBreakerOptions
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
      // Try to close the circuit
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) { // Need 3 successes to close
        this.state = 'CLOSED';
        this.options.monitor?.(this.state);
      }
    }
  }

  private onFailure(error: Error): void {
    this.failureCount++;
    
    if (this.failureCount >= this.options.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.options.timeout;
      this.options.monitor?.(this.state, error);
    }
  }

  getState(): { state: CircuitState; failureCount: number; nextAttempt?: Date } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt) : undefined
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }
}
```

### 3. Service Communication Client
```typescript
// src/lib/clients/service-communication-client.ts
import { ServiceRegistry, ServiceInfo } from '../services/service-registry';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { MetricsServiceClient } from './metrics-service-client';

export interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  circuitBreaker?: boolean;
}

export class ServiceCommunicationClient {
  private static instance: ServiceCommunicationClient;
  private registry: ServiceRegistry;
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private metricsClient: MetricsServiceClient;

  private constructor() {
    this.registry = ServiceRegistry.getInstance();
    this.metricsClient = MetricsServiceClient.getInstance();
    this.initializeCircuitBreakers();
  }

  public static getInstance(): ServiceCommunicationClient {
    if (!ServiceCommunicationClient.instance) {
      ServiceCommunicationClient.instance = new ServiceCommunicationClient();
    }
    return ServiceCommunicationClient.instance;
  }

  private initializeCircuitBreakers(): void {
    const services = this.registry.getAllServices();
    
    services.forEach(service => {
      const breaker = new CircuitBreaker(service.name, {
        threshold: service.metadata.circuitBreakerThreshold,
        timeout: 60000, // 1 minute
        monitor: (state, error) => {
          console.log(`Circuit breaker for ${service.name} is now ${state}`, error?.message);
          this.metricsClient.recordMetric(
            `circuit_breaker.${service.name}.state_change`,
            state === 'OPEN' ? 1 : 0,
            { service: service.name, state }
          );
        }
      });
      
      this.circuitBreakers.set(service.name, breaker);
    });
  }

  async request<T>(
    serviceName: string,
    path: string,
    options: RequestOptions & {
      method?: string;
      body?: any;
    } = {}
  ): Promise<T> {
    const service = this.registry.getService(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found in registry`);
    }

    const requestOptions: RequestOptions = {
      timeout: service.metadata.timeout,
      retries: service.metadata.retries,
      retryDelay: 1000,
      circuitBreaker: true,
      ...options
    };

    const operation = async (): Promise<T> => {
      return await this.executeRequest(service, path, requestOptions);
    };

    if (requestOptions.circuitBreaker) {
      const circuitBreaker = this.circuitBreakers.get(serviceName);
      if (circuitBreaker) {
        return await circuitBreaker.execute(operation);
      }
    }

    return await operation();
  }

  private async executeRequest<T>(
    service: ServiceInfo,
    path: string,
    options: RequestOptions & { method?: string; body?: any }
  ): Promise<T> {
    const url = `${service.url}${path}`;
    const startTime = Date.now();
    
    let lastError: Error;
    const maxRetries = options.retries || 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Wait before retry
          await this.sleep(options.retryDelay || 1000);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);

        const requestInit: RequestInit = {
          method: options.method || 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Name': 'stablerisk-main',
            'X-Request-ID': this.generateRequestId(),
            ...options.headers
          }
        };

        if (options.body) {
          requestInit.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, requestInit);
        clearTimeout(timeoutId);

        const duration = Date.now() - startTime;
        
        // Record metrics
        this.metricsClient.recordMetric(
          `service.${service.name}.request.duration`,
          duration,
          { 
            method: options.method || 'GET',
            path,
            status: response.status.toString(),
            attempt: attempt.toString()
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Try to parse JSON, fallback to text
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await response.json();
        } else {
          return await response.text() as unknown as T;
        }

      } catch (error) {
        lastError = error;
        
        // Record error metric
        this.metricsClient.recordMetric(
          `service.${service.name}.request.error`,
          1,
          { 
            method: options.method || 'GET',
            path,
            error: error.message,
            attempt: attempt.toString()
          }
        );

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          break;
        }

        console.error(`Request to ${service.name} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      }
    }

    throw new Error(`All ${maxRetries + 1} attempts failed for ${service.name}${path}. Last error: ${lastError.message}`);
  }

  async get<T>(serviceName: string, path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(serviceName, path, { ...options, method: 'GET' });
  }

  async post<T>(serviceName: string, path: string, body: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(serviceName, path, { ...options, method: 'POST', body });
  }

  async put<T>(serviceName: string, path: string, body: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(serviceName, path, { ...options, method: 'PUT', body });
  }

  async delete<T>(serviceName: string, path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(serviceName, path, { ...options, method: 'DELETE' });
  }

  // Health check all services
  async checkAllServices(): Promise<Record<string, boolean>> {
    const services = this.registry.getAllServices();
    const results: Record<string, boolean> = {};

    const checks = services.map(async service => {
      try {
        await this.get(service.name, '/health', { 
          timeout: 3000, 
          retries: 0, 
          circuitBreaker: false 
        });
        results[service.name] = true;
        this.registry.updateServiceHealth(service.name, 'healthy');
      } catch (error) {
        results[service.name] = false;
        this.registry.updateServiceHealth(service.name, 'unhealthy');
      }
    });

    await Promise.allSettled(checks);
    return results;
  }

  // Get circuit breaker status for all services
  getCircuitBreakerStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    this.circuitBreakers.forEach((breaker, serviceName) => {
      status[serviceName] = breaker.getState();
    });

    return status;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isNonRetryableError(error: Error): boolean {
    // Don't retry on certain error types
    const message = error.message.toLowerCase();
    return (
      message.includes('400') || // Bad Request
      message.includes('401') || // Unauthorized
      message.includes('403') || // Forbidden
      message.includes('404') || // Not Found
      message.includes('422')    // Unprocessable Entity
    );
  }
}
```

### 4. Service Health Monitor
```typescript
// src/lib/monitoring/service-health-monitor.ts
import { ServiceRegistry } from '../services/service-registry';
import { ServiceCommunicationClient } from '../clients/service-communication-client';
import { MetricsServiceClient } from '../clients/metrics-service-client';

export class ServiceHealthMonitor {
  private static instance: ServiceHealthMonitor;
  private registry: ServiceRegistry;
  private communicationClient: ServiceCommunicationClient;
  private metricsClient: MetricsServiceClient;
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.registry = ServiceRegistry.getInstance();
    this.communicationClient = ServiceCommunicationClient.getInstance();
    this.metricsClient = MetricsServiceClient.getInstance();
  }

  public static getInstance(): ServiceHealthMonitor {
    if (!ServiceHealthMonitor.instance) {
      ServiceHealthMonitor.instance = new ServiceHealthMonitor();
    }
    return ServiceHealthMonitor.instance;
  }

  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already started
    }

    console.log('Starting service health monitoring...');
    
    // Monitor every minute
    this.monitoringInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 60000);

    // Initial health check
    this.performHealthCheck();
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('Service health monitoring stopped');
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      const healthResults = await this.communicationClient.checkAllServices();
      const circuitBreakerStatus = this.communicationClient.getCircuitBreakerStatus();
      
      // Record overall system health
      const healthyServices = Object.values(healthResults).filter(Boolean).length;
      const totalServices = Object.keys(healthResults).length;
      const systemHealthScore = totalServices > 0 ? healthyServices / totalServices : 1;

      await this.metricsClient.recordMetric(
        'system.health.score',
        systemHealthScore,
        { 
          healthy_services: healthyServices.toString(),
          total_services: totalServices.toString()
        }
      );

      // Record individual service health
      for (const [serviceName, isHealthy] of Object.entries(healthResults)) {
        await this.metricsClient.recordMetric(
          `service.${serviceName}.health`,
          isHealthy ? 1 : 0,
          { service: serviceName }
        );

        // Record circuit breaker status
        const cbStatus = circuitBreakerStatus[serviceName];
        if (cbStatus) {
          await this.metricsClient.recordMetric(
            `service.${serviceName}.circuit_breaker.failures`,
            cbStatus.failureCount,
            { 
              service: serviceName,
              state: cbStatus.state
            }
          );
        }
      }

      // Log warnings for unhealthy services
      const unhealthyServices = Object.entries(healthResults)
        .filter(([, healthy]) => !healthy)
        .map(([name]) => name);

      if (unhealthyServices.length > 0) {
        console.warn(`Unhealthy services detected: ${unhealthyServices.join(', ')}`);
        
        // Send alert if all services are down
        if (unhealthyServices.length === totalServices) {
          console.error('CRITICAL: All services are unhealthy!');
          await this.sendCriticalAlert(unhealthyServices);
        }
      }

    } catch (error) {
      console.error('Health monitoring failed:', error);
      await this.metricsClient.recordMetric(
        'system.health.monitor.error',
        1,
        { error: error.message }
      );
    }
  }

  async getSystemHealth(): Promise<{
    overall: 'healthy' | 'degraded' | 'critical';
    services: Record<string, any>;
    circuitBreakers: Record<string, any>;
    timestamp: Date;
  }> {
    const healthResults = await this.communicationClient.checkAllServices();
    const circuitBreakerStatus = this.communicationClient.getCircuitBreakerStatus();
    
    const healthyCount = Object.values(healthResults).filter(Boolean).length;
    const totalCount = Object.keys(healthResults).length;
    
    let overall: 'healthy' | 'degraded' | 'critical';
    if (healthyCount === totalCount) {
      overall = 'healthy';
    } else if (healthyCount > 0) {
      overall = 'degraded';
    } else {
      overall = 'critical';
    }

    return {
      overall,
      services: healthResults,
      circuitBreakers: circuitBreakerStatus,
      timestamp: new Date()
    };
  }

  private async sendCriticalAlert(unhealthyServices: string[]): Promise<void> {
    // In a real implementation, this would send alerts via email, Slack, etc.
    console.error(`CRITICAL ALERT: Services down: ${unhealthyServices.join(', ')}`);
    
    // Record critical alert metric
    await this.metricsClient.recordMetric(
      'system.alerts.critical',
      1,
      { 
        type: 'all_services_down',
        services: unhealthyServices.join(',')
      }
    );
  }
}
```

### 5. Enhanced Service Integration
```typescript
// src/lib/services/enhanced-service-integration.ts
import { ServiceCommunicationClient } from '../clients/service-communication-client';
import { CacheServiceClient } from '../clients/cache-service-client';
import { MetricsServiceClient } from '../clients/metrics-service-client';
import { BackgroundJobsClient } from '../clients/background-jobs-client';

export class EnhancedServiceIntegration {
  private static instance: EnhancedServiceIntegration;
  private communicationClient: ServiceCommunicationClient;
  private cacheClient: CacheServiceClient;
  private metricsClient: MetricsServiceClient;
  private jobsClient: BackgroundJobsClient;

  private constructor() {
    this.communicationClient = ServiceCommunicationClient.getInstance();
    this.cacheClient = CacheServiceClient.getInstance();
    this.metricsClient = MetricsServiceClient.getInstance();
    this.jobsClient = BackgroundJobsClient.getInstance();
  }

  public static getInstance(): EnhancedServiceIntegration {
    if (!EnhancedServiceIntegration.instance) {
      EnhancedServiceIntegration.instance = new EnhancedServiceIntegration();
    }
    return EnhancedServiceIntegration.instance;
  }

  // Enhanced cache operations with fallback
  async getCachedData<T>(key: string, fallbackFactory?: () => Promise<T>): Promise<T | null> {
    try {
      const cached = await this.cacheClient.get(key);
      if (cached !== null) {
        await this.metricsClient.recordMetric('cache.hit', 1, { key });
        return cached;
      }
      
      await this.metricsClient.recordMetric('cache.miss', 1, { key });
      
      if (fallbackFactory) {
        const data = await fallbackFactory();
        // Cache for next time (fire and forget)
        this.cacheClient.set(key, data).catch(err => 
          console.error('Failed to cache fallback data:', err)
        );
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('Cache operation failed:', error);
      
      if (fallbackFactory) {
        return await fallbackFactory();
      }
      
      return null;
    }
  }

  // Enhanced background job submission with retry
  async submitJobWithRetry(
    type: string,
    data: any,
    options: { priority?: number; delay?: number; attempts?: number } = {}
  ): Promise<string | null> {
    try {
      const jobId = await this.jobsClient.submitJob(type, data, options);
      
      await this.metricsClient.recordMetric(
        'background_jobs.submitted',
        1,
        { type, priority: options.priority?.toString() || '0' }
      );
      
      return jobId;
    } catch (error) {
      console.error('Job submission failed:', error);
      
      await this.metricsClient.recordMetric(
        'background_jobs.submission_failed',
        1,
        { type, error: error.message }
      );
      
      return null;
    }
  }

  // Coordinated cache invalidation across services
  async invalidateRelatedCache(
    patterns: string[],
    tags: string[] = []
  ): Promise<{ invalidated: number; errors: string[] }> {
    const results = {
      invalidated: 0,
      errors: [] as string[]
    };

    // Invalidate by patterns
    for (const pattern of patterns) {
      try {
        const keys = await this.cacheClient.invalidateByPattern(pattern);
        results.invalidated += keys.length;
      } catch (error) {
        results.errors.push(`Pattern ${pattern}: ${error.message}`);
      }
    }

    // Invalidate by tags
    for (const tag of tags) {
      try {
        const keys = await this.cacheClient.invalidateByTag(tag);
        results.invalidated += keys.length;
      } catch (error) {
        results.errors.push(`Tag ${tag}: ${error.message}`);
      }
    }

    await this.metricsClient.recordMetric(
      'cache.bulk_invalidation',
      results.invalidated,
      { 
        patterns: patterns.length.toString(),
        tags: tags.length.toString(),
        errors: results.errors.length.toString()
      }
    );

    return results;
  }

  // Service health summary
  async getServicesStatus(): Promise<{
    healthy: string[];
    degraded: string[];
    unhealthy: string[];
    circuitBreakers: Record<string, any>;
  }> {
    try {
      const healthResults = await this.communicationClient.checkAllServices();
      const circuitBreakers = this.communicationClient.getCircuitBreakerStatus();

      const healthy: string[] = [];
      const degraded: string[] = [];
      const unhealthy: string[] = [];

      Object.entries(healthResults).forEach(([service, isHealthy]) => {
        const cbState = circuitBreakers[service]?.state;
        
        if (!isHealthy || cbState === 'OPEN') {
          unhealthy.push(service);
        } else if (cbState === 'HALF_OPEN') {
          degraded.push(service);
        } else {
          healthy.push(service);
        }
      });

      return { healthy, degraded, unhealthy, circuitBreakers };
    } catch (error) {
      console.error('Failed to get services status:', error);
      return { 
        healthy: [], 
        degraded: [], 
        unhealthy: [], 
        circuitBreakers: {} 
      };
    }
  }
}
```

### 6. API Route Integration Example
```typescript
// src/app/api/health/services/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ServiceHealthMonitor } from '@/lib/monitoring/service-health-monitor';
import { EnhancedServiceIntegration } from '@/lib/services/enhanced-service-integration';

export async function GET(request: NextRequest) {
  try {
    const healthMonitor = ServiceHealthMonitor.getInstance();
    const serviceIntegration = EnhancedServiceIntegration.getInstance();
    
    const [systemHealth, servicesStatus] = await Promise.all([
      healthMonitor.getSystemHealth(),
      serviceIntegration.getServicesStatus()
    ]);

    return NextResponse.json({
      system: systemHealth,
      services: servicesStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { error: 'Health check failed', details: error.message },
      { status: 500 }
    );
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [x] Service registry tracks all extracted services with health status
- [x] Circuit breakers prevent cascade failures
- [x] Retry logic handles transient failures appropriately
- [x] Service communication includes proper timeout and error handling
- [x] Health monitoring provides real-time service status

### Performance Requirements
- [x] Service requests complete within configured timeouts
- [x] Circuit breakers open/close based on configured thresholds
- [x] Health checks complete in < 3 seconds per service
- [ ] Service communication adds < 50ms overhead per request

### Integration Requirements
- [x] Main application gracefully handles service failures
- [x] Existing functionality works with new service communication patterns
- [x] Monitoring provides visibility into service interactions
- [ ] NGINX routing works correctly for all services

## Testing
```bash
# Test service communication
npm run test:service-communication

# Test circuit breakers
npm run test:circuit-breakers

# Test health monitoring
curl http://localhost:3000/api/health/services

# Integration tests
npm run test:service-integration

# Load testing with service failures
npm run test:service-resilience
```

## Rollback Plan
1. Disable service communication clients in main application
2. Revert to existing monolith service calls
3. Stop extracted services but keep them ready
4. Remove service communication routes from NGINX
5. Keep service registry for future migration

## Dependencies
- All Phase 1 foundation tasks (01-04)
- All Phase 2 service extraction tasks (05-07)
- NGINX configuration for service routing
- Monitoring infrastructure for health checks

## Risks & Mitigation
- **Risk**: Network failures cause service cascade failures
  - **Mitigation**: Circuit breakers, retry logic, graceful degradation
- **Risk**: Service communication latency impacts performance
  - **Mitigation**: Optimized timeouts, connection pooling, async operations
- **Risk**: Service discovery failures prevent communication
  - **Mitigation**: Static fallback configuration, health monitoring

## Notes
- Communication patterns designed for reliability over speed
- Circuit breaker prevents cascade failures during service outages
- Health monitoring provides proactive issue detection
- Service registry enables dynamic service management
- Integration maintains backward compatibility with existing patterns
- Metrics collection provides visibility into service interactions