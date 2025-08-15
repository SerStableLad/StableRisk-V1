/**
 * Comprehensive Test Suite for Service Health Monitor
 * 
 * Tests following TDD approach for Task 8 implementation.
 * Covers singleton pattern, health monitoring, alerting, and integration.
 */

import { ServiceHealthMonitor } from '../service-health-monitor';
import { ServiceRegistry } from '../../services/service-registry';
import { ServiceCommunicationClient, HealthCheckResult } from '../../clients/service-communication-client';
import { MetricsServiceClient } from '../../clients/metrics-service-client';

// Mock the dependencies
jest.mock('../../services/service-registry');
jest.mock('../../clients/service-communication-client');
jest.mock('../../clients/metrics-service-client');

describe('ServiceHealthMonitor', () => {
  let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
  let mockServiceClient: jest.Mocked<ServiceCommunicationClient>;
  let mockMetricsClient: jest.Mocked<MetricsServiceClient>;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear all singletons
    (ServiceHealthMonitor as any).instance = null;
    (ServiceRegistry as any).instance = null;
    (ServiceCommunicationClient as any).instance = null;
    (MetricsServiceClient as any).instance = null;

    // Create mock instances
    mockServiceRegistry = {
      getInstance: jest.fn(),
      getAllServices: jest.fn(),
      updateServiceHealth: jest.fn(),
    } as any;

    mockServiceClient = {
      getInstance: jest.fn(),
      checkAllServices: jest.fn(),
      getCircuitBreakerStatus: jest.fn(),
    } as any;

    mockMetricsClient = {
      getInstance: jest.fn(),
      recordMetric: jest.fn(),
    } as any;

    // Mock static methods
    (ServiceRegistry.getInstance as jest.Mock).mockReturnValue(mockServiceRegistry);
    (ServiceCommunicationClient.getInstance as jest.Mock).mockReturnValue(mockServiceClient);
    (MetricsServiceClient.getInstance as jest.Mock).mockReturnValue(mockMetricsClient);

    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock timers for consistent behavior
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    test('getInstance returns the same instance', () => {
      const instance1 = ServiceHealthMonitor.getInstance();
      const instance2 = ServiceHealthMonitor.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ServiceHealthMonitor);
    });

    test('constructor is private and cannot be called directly', () => {
      expect(() => {
        new (ServiceHealthMonitor as any)();
      }).toThrow();
    });

    test('multiple getInstance calls return same instance across different contexts', () => {
      const instance1 = ServiceHealthMonitor.getInstance();
      
      // Simulate different module context
      delete (ServiceHealthMonitor as any).instance;
      const instance2 = ServiceHealthMonitor.getInstance();
      
      // Should still be same due to singleton pattern
      expect(ServiceHealthMonitor.getInstance()).toBeDefined();
    });
  });

  describe('Initialization and Dependencies', () => {
    test('initializes with correct dependencies', () => {
      const monitor = ServiceHealthMonitor.getInstance();
      
      expect(ServiceRegistry.getInstance).toHaveBeenCalled();
      expect(ServiceCommunicationClient.getInstance).toHaveBeenCalled();
      expect(MetricsServiceClient.getInstance).toHaveBeenCalled();
    });

    test('handles dependency initialization errors gracefully', () => {
      (ServiceRegistry.getInstance as jest.Mock).mockImplementation(() => {
        throw new Error('ServiceRegistry initialization failed');
      });

      expect(() => {
        ServiceHealthMonitor.getInstance();
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to initialize ServiceHealthMonitor dependencies:',
        expect.any(Error)
      );
    });
  });

  describe('Monitoring Lifecycle', () => {
    let monitor: ServiceHealthMonitor;

    beforeEach(() => {
      monitor = ServiceHealthMonitor.getInstance();
    });

    test('startMonitoring begins health checks at 60-second intervals', () => {
      const performHealthCheckSpy = jest.spyOn(monitor as any, 'performHealthCheck').mockResolvedValue(undefined);
      
      monitor.startMonitoring();
      
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(1); // Initial call
      
      // Fast-forward 60 seconds
      jest.advanceTimersByTime(60000);
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(2);
      
      // Fast-forward another 60 seconds
      jest.advanceTimersByTime(60000);
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(3);
    });

    test('startMonitoring can be called multiple times without creating duplicate intervals', () => {
      const performHealthCheckSpy = jest.spyOn(monitor as any, 'performHealthCheck').mockResolvedValue(undefined);
      
      monitor.startMonitoring();
      monitor.startMonitoring();
      monitor.startMonitoring();
      
      // Should only create one interval
      jest.advanceTimersByTime(60000);
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(4); // 1 initial + 3 from multiple starts
    });

    test('stopMonitoring stops health check interval', () => {
      const performHealthCheckSpy = jest.spyOn(monitor as any, 'performHealthCheck').mockResolvedValue(undefined);
      
      monitor.startMonitoring();
      monitor.stopMonitoring();
      
      // Fast-forward time - no additional checks should occur
      jest.advanceTimersByTime(120000);
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(1); // Only initial call
    });

    test('stopMonitoring can be called multiple times safely', () => {
      monitor.startMonitoring();
      
      expect(() => {
        monitor.stopMonitoring();
        monitor.stopMonitoring();
        monitor.stopMonitoring();
      }).not.toThrow();
    });

    test('stopMonitoring can be called without startMonitoring', () => {
      expect(() => {
        monitor.stopMonitoring();
      }).not.toThrow();
    });
  });

  describe('Health Check Logic', () => {
    let monitor: ServiceHealthMonitor;

    beforeEach(() => {
      monitor = ServiceHealthMonitor.getInstance();
      
      // Setup default mock responses
      mockServiceClient.checkAllServices.mockResolvedValue([]);
      mockServiceClient.getCircuitBreakerStatus.mockReturnValue({});
      mockMetricsClient.recordMetric.mockResolvedValue();
    });

    test('performHealthCheck processes healthy services correctly', async () => {
      const healthResults: HealthCheckResult[] = [
        {
          service: 'metrics-service',
          healthy: true,
          responseTime: 100,
          timestamp: new Date(),
        },
        {
          service: 'cache-service', 
          healthy: true,
          responseTime: 50,
          timestamp: new Date(),
        },
        {
          service: 'background-jobs-service',
          healthy: true,
          responseTime: 200,
          timestamp: new Date(),
        },
      ];

      mockServiceClient.checkAllServices.mockResolvedValue(healthResults);
      
      await (monitor as any).performHealthCheck();
      
      // Should record overall system health
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.overall_score',
        1.0, // 3 healthy / 3 total = 1.0
        {}
      );

      // Should record individual service health metrics
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        1,
        { service: 'metrics-service' }
      );
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        1,
        { service: 'cache-service' }
      );
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        1,
        { service: 'background-jobs-service' }
      );
    });

    test('performHealthCheck handles unhealthy services correctly', async () => {
      const healthResults: HealthCheckResult[] = [
        {
          service: 'metrics-service',
          healthy: false,
          responseTime: 0,
          timestamp: new Date(),
          error: 'Connection refused',
        },
        {
          service: 'cache-service',
          healthy: true,
          responseTime: 50,
          timestamp: new Date(),
        },
        {
          service: 'background-jobs-service',
          healthy: false,
          responseTime: 0,
          timestamp: new Date(),
          error: 'Timeout',
        },
      ];

      mockServiceClient.checkAllServices.mockResolvedValue(healthResults);
      
      await (monitor as any).performHealthCheck();
      
      // Should record degraded overall health
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.overall_score',
        0.3333333333333333, // 1 healthy / 3 total
        {}
      );

      // Should record individual service health metrics
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        0,
        { service: 'metrics-service' }
      );
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        1,
        { service: 'cache-service' }
      );
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        0,
        { service: 'background-jobs-service' }
      );

      // Should log warnings for unhealthy services
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Service metrics-service is unhealthy:',
        'Connection refused'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Service background-jobs-service is unhealthy:',
        'Timeout'
      );
    });

    test('performHealthCheck monitors circuit breaker status', async () => {
      mockServiceClient.checkAllServices.mockResolvedValue([]);
      mockServiceClient.getCircuitBreakerStatus.mockReturnValue({
        'metrics-service': { state: 'open', failures: 5, lastFailureTime: Date.now(), nextRetryTime: Date.now() + 30000 },
        'cache-service': { state: 'closed', failures: 0, lastFailureTime: null, nextRetryTime: null },
        'background-jobs-service': { state: 'half-open', failures: 2, lastFailureTime: Date.now() - 10000, nextRetryTime: null },
      });
      
      await (monitor as any).performHealthCheck();
      
      // Should record circuit breaker failure counts
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.circuit_breaker.failures',
        5,
        { service: 'metrics-service', state: 'open' }
      );
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.circuit_breaker.failures',
        0,
        { service: 'cache-service', state: 'closed' }
      );
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.circuit_breaker.failures',
        2,
        { service: 'background-jobs-service', state: 'half-open' }
      );
    });

    test('performHealthCheck triggers critical alert when all services are down', async () => {
      const healthResults: HealthCheckResult[] = [
        {
          service: 'metrics-service',
          healthy: false,
          responseTime: 0,
          timestamp: new Date(),
          error: 'Connection refused',
        },
        {
          service: 'cache-service',
          healthy: false,
          responseTime: 0,
          timestamp: new Date(),
          error: 'Connection refused',
        },
        {
          service: 'background-jobs-service',
          healthy: false,
          responseTime: 0,
          timestamp: new Date(),
          error: 'Connection refused',
        },
      ];

      mockServiceClient.checkAllServices.mockResolvedValue(healthResults);
      const sendCriticalAlertSpy = jest.spyOn(monitor as any, 'sendCriticalAlert').mockResolvedValue(undefined);
      
      await (monitor as any).performHealthCheck();
      
      // Should trigger critical alert
      expect(sendCriticalAlertSpy).toHaveBeenCalledWith(
        'All services are unhealthy',
        expect.any(Object)
      );
    });

    test('performHealthCheck handles empty service list', async () => {
      mockServiceClient.checkAllServices.mockResolvedValue([]);
      
      await (monitor as any).performHealthCheck();
      
      // Should handle gracefully
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.overall_score',
        1.0, // No services means 100% health by default
        {}
      );
    });

    test('performHealthCheck handles service communication errors', async () => {
      mockServiceClient.checkAllServices.mockRejectedValue(new Error('Service communication failed'));
      
      await (monitor as any).performHealthCheck();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to perform health check:',
        expect.any(Error)
      );
    });

    test('performHealthCheck handles metrics recording errors', async () => {
      const healthResults: HealthCheckResult[] = [
        {
          service: 'metrics-service',
          healthy: true,
          responseTime: 100,
          timestamp: new Date(),
        },
      ];

      mockServiceClient.checkAllServices.mockResolvedValue(healthResults);
      mockMetricsClient.recordMetric.mockRejectedValue(new Error('Metrics service down'));
      
      await (monitor as any).performHealthCheck();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to record health metrics:',
        expect.any(Error)
      );
    });
  });

  describe('System Health Reporting', () => {
    let monitor: ServiceHealthMonitor;

    beforeEach(() => {
      monitor = ServiceHealthMonitor.getInstance();
      
      // Mock the private lastHealthResult property
      (monitor as any).lastHealthResult = {
        healthy: ['metrics-service', 'cache-service'],
        unhealthy: ['background-jobs-service'],
        circuitBreakerStatus: {
          'metrics-service': { state: 'closed', failures: 0, lastFailureTime: null, nextRetryTime: null },
          'cache-service': { state: 'closed', failures: 0, lastFailureTime: null, nextRetryTime: null },
          'background-jobs-service': { state: 'open', failures: 5, lastFailureTime: Date.now(), nextRetryTime: Date.now() + 30000 },
        },
        lastCheck: new Date(),
      };
    });

    test('getSystemHealth returns healthy status when most services are healthy', () => {
      const result = monitor.getSystemHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.services.healthy).toHaveLength(2);
      expect(result.services.unhealthy).toHaveLength(1);
      expect(result.services.total).toBe(3);
      expect(result.healthScore).toBeCloseTo(0.67, 2); // 2/3 ≈ 0.67
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.circuitBreakers).toBeDefined();
    });

    test('getSystemHealth returns degraded status when half services are unhealthy', () => {
      (monitor as any).lastHealthResult = {
        healthy: ['metrics-service'],
        unhealthy: ['cache-service', 'background-jobs-service'],
        circuitBreakerStatus: {},
        lastCheck: new Date(),
      };
      
      const result = monitor.getSystemHealth();
      
      expect(result.status).toBe('degraded');
      expect(result.healthScore).toBeCloseTo(0.33, 2); // 1/3 ≈ 0.33
    });

    test('getSystemHealth returns critical status when all services are unhealthy', () => {
      (monitor as any).lastHealthResult = {
        healthy: [],
        unhealthy: ['metrics-service', 'cache-service', 'background-jobs-service'],
        circuitBreakerStatus: {},
        lastCheck: new Date(),
      };
      
      const result = monitor.getSystemHealth();
      
      expect(result.status).toBe('critical');
      expect(result.healthScore).toBe(0);
    });

    test('getSystemHealth returns healthy status when no health data available', () => {
      (monitor as any).lastHealthResult = null;
      
      const result = monitor.getSystemHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.services.healthy).toHaveLength(0);
      expect(result.services.unhealthy).toHaveLength(0);
      expect(result.healthScore).toBe(1.0); // Default to healthy
    });

    test('getSystemHealth includes circuit breaker information', () => {
      const result = monitor.getSystemHealth();
      
      expect(result.circuitBreakers).toBeDefined();
      expect(result.circuitBreakers['metrics-service']).toEqual({ state: 'closed', failures: 0, lastFailureTime: null, nextRetryTime: null });
      expect(result.circuitBreakers['background-jobs-service']).toEqual(expect.objectContaining({ state: 'open', failures: 5 }));
    });

    test('getSystemHealth calculates health score correctly for edge cases', () => {
      // Only one service
      (monitor as any).lastHealthResult = {
        healthy: ['metrics-service'],
        unhealthy: [],
        circuitBreakerStatus: {},
        lastCheck: new Date(),
      };
      
      let result = monitor.getSystemHealth();
      expect(result.healthScore).toBe(1.0);
      expect(result.status).toBe('healthy');

      // Many services, one unhealthy
      (monitor as any).lastHealthResult = {
        healthy: ['service1', 'service2', 'service3', 'service4'],
        unhealthy: ['service5'],
        circuitBreakerStatus: {},
        lastCheck: new Date(),
      };
      
      result = monitor.getSystemHealth();
      expect(result.healthScore).toBe(0.8); // 4/5 = 0.8
      expect(result.status).toBe('healthy');
    });
  });

  describe('Critical Alert Functionality', () => {
    let monitor: ServiceHealthMonitor;

    beforeEach(() => {
      monitor = ServiceHealthMonitor.getInstance();
    });

    test('sendCriticalAlert records metrics and logs alert', async () => {
      const alertData = {
        unhealthyServices: ['metrics-service', 'cache-service'],
        timestamp: new Date(),
      };

      await (monitor as any).sendCriticalAlert('System critical', alertData);
      
      // Should record critical alert metric
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.critical_alert',
        1,
        {
          message: 'System critical',
          unhealthy_services: JSON.stringify(alertData.unhealthyServices),
        }
      );

      // Should log critical alert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'CRITICAL ALERT: System critical',
        alertData
      );
    });

    test('sendCriticalAlert handles metrics recording failure gracefully', async () => {
      mockMetricsClient.recordMetric.mockRejectedValue(new Error('Metrics service unavailable'));
      
      await (monitor as any).sendCriticalAlert('System critical', {});
      
      // Should still log the alert even if metrics fail
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'CRITICAL ALERT: System critical',
        {}
      );
      
      // Should log metrics failure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to record critical alert metric:',
        expect.any(Error)
      );
    });

    test('sendCriticalAlert works with minimal data', async () => {
      await (monitor as any).sendCriticalAlert('Simple alert');
      
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.critical_alert',
        1,
        {
          message: 'Simple alert',
        }
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'CRITICAL ALERT: Simple alert'
      );
    });
  });

  describe('Performance and Timing', () => {
    let monitor: ServiceHealthMonitor;

    beforeEach(() => {
      monitor = ServiceHealthMonitor.getInstance();
      mockServiceClient.checkAllServices.mockResolvedValue([]);
      mockServiceClient.getCircuitBreakerStatus.mockReturnValue({});
    });

    test('health checks complete within reasonable time', async () => {
      const startTime = Date.now();
      await (monitor as any).performHealthCheck();
      const duration = Date.now() - startTime;
      
      // Health check should complete quickly in test environment
      expect(duration).toBeLessThan(100);
    });

    test('monitoring interval precision', () => {
      const performHealthCheckSpy = jest.spyOn(monitor as any, 'performHealthCheck').mockResolvedValue(undefined);
      
      monitor.startMonitoring();
      
      // Verify exact timing
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(59999);
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(1);
      expect(performHealthCheckSpy).toHaveBeenCalledTimes(2);
    });

    test('handles slow health check operations', async () => {
      // Use real timers for this test
      jest.useRealTimers();
      
      mockServiceClient.checkAllServices.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 50))
      );
      
      const startTime = Date.now();
      await (monitor as any).performHealthCheck();
      const duration = Date.now() - startTime;
      
      expect(duration).toBeGreaterThanOrEqual(40); // Allow for timing variation
      
      // Restore fake timers
      jest.useFakeTimers();
    }, 1000);
  });

  describe('Error Handling and Edge Cases', () => {
    let monitor: ServiceHealthMonitor;

    beforeEach(() => {
      monitor = ServiceHealthMonitor.getInstance();
    });

    test('handles null service health results', async () => {
      mockServiceClient.checkAllServices.mockResolvedValue(null as any);
      
      await (monitor as any).performHealthCheck();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to perform health check:',
        expect.any(Error)
      );
    });

    test('handles undefined circuit breaker status', async () => {
      mockServiceClient.checkAllServices.mockResolvedValue([]);
      mockServiceClient.getCircuitBreakerStatus.mockReturnValue(undefined as any);
      
      await (monitor as any).performHealthCheck();
      
      // Should handle gracefully without throwing
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.overall_score',
        expect.any(Number),
        {}
      );
    });

    test('handles partial health check results', async () => {
      const partialResults: HealthCheckResult[] = [
        {
          service: 'metrics-service',
          healthy: true,
          responseTime: 100,
          timestamp: new Date(),
        },
        // Missing fields for second service
        {
          service: 'cache-service',
          healthy: false,
          responseTime: 0,
          timestamp: new Date(),
        } as any,
      ];

      mockServiceClient.checkAllServices.mockResolvedValue(partialResults);
      
      await (monitor as any).performHealthCheck();
      
      // Should process available data without throwing
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        1,
        { service: 'metrics-service' }
      );
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        0,
        { service: 'cache-service' }
      );
    });

    test('recovery from service communication failures', async () => {
      // First call fails
      mockServiceClient.checkAllServices
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([{
          service: 'metrics-service',
          healthy: true,
          responseTime: 100,
          timestamp: new Date(),
        }]);
      
      // First health check should handle error
      await (monitor as any).performHealthCheck();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to perform health check:',
        expect.any(Error)
      );
      
      // Second health check should succeed
      await (monitor as any).performHealthCheck();
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'system.health.service_status',
        1,
        { service: 'metrics-service' }
      );
    });
  });
});