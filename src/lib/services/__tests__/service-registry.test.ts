/**
 * Service Registry - Comprehensive Test Suite
 * 
 * Tests cover:
 * - Singleton pattern implementation
 * - Service initialization with default and custom configurations
 * - Service retrieval and health status management
 * - Health checking functionality with mocked fetch calls
 * - Error handling for failed health checks and edge cases
 * - Proper cleanup and shutdown functionality
 * - Thread safety and concurrent access
 */

import { ServiceRegistry, ServiceInfo } from '../service-registry';

// Mock fetch globally for all tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console methods to reduce noise in tests
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

// Use fake timers for testing intervals
jest.useFakeTimers();

// Mock setInterval and clearInterval
const mockSetInterval = jest.spyOn(global, 'setInterval');
const mockClearInterval = jest.spyOn(global, 'clearInterval');

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;
  
  beforeEach(() => {
    // Reset the singleton instance for each test
    (ServiceRegistry as any).instance = null;
    
    // Clear all mocks
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Reset environment variables
    delete process.env.METRICS_SERVICE_URL;
    delete process.env.CACHE_SERVICE_URL;
    delete process.env.BACKGROUND_JOBS_URL;
  });

  afterEach(() => {
    // Clean up registry if it exists
    if (registry) {
      registry.stop();
    }
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when getInstance() is called multiple times', () => {
      const instance1 = ServiceRegistry.getInstance();
      const instance2 = ServiceRegistry.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ServiceRegistry);
    });

    it('should create a new instance after reset', () => {
      const instance1 = ServiceRegistry.getInstance();
      
      // Reset singleton instance
      (ServiceRegistry as any).instance = null;
      
      const instance2 = ServiceRegistry.getInstance();
      
      expect(instance1).not.toBe(instance2);
      expect(instance2).toBeInstanceOf(ServiceRegistry);
    });

    it('should maintain singleton instance across concurrent access', () => {
      const instances: ServiceRegistry[] = [];
      const promises = Array.from({ length: 10 }, () => 
        Promise.resolve().then(() => {
          instances.push(ServiceRegistry.getInstance());
        })
      );

      return Promise.all(promises).then(() => {
        // All instances should be the same
        const firstInstance = instances[0];
        instances.forEach(instance => {
          expect(instance).toBe(firstInstance);
        });
      });
    });
  });

  describe('Service Initialization', () => {
    it('should initialize services with default configuration', () => {
      registry = ServiceRegistry.getInstance();
      
      const services = registry.getAllServices();
      expect(services).toHaveLength(3);
      
      // Check metrics-service defaults
      const metricsService = registry.getService('metrics-service');
      expect(metricsService).toEqual({
        name: 'metrics-service',
        url: 'http://localhost:3001',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: expect.any(Date),
        metadata: {
          timeout: 5000,
          retries: 3,
          circuitBreakerThreshold: 5,
          priority: 1
        }
      });
      
      // Check cache-service defaults
      const cacheService = registry.getService('cache-service');
      expect(cacheService).toEqual({
        name: 'cache-service',
        url: 'http://localhost:3002',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: expect.any(Date),
        metadata: {
          timeout: 2000,
          retries: 2,
          circuitBreakerThreshold: 3,
          priority: 2
        }
      });
      
      // Check background-jobs-service defaults
      const jobsService = registry.getService('background-jobs-service');
      expect(jobsService).toEqual({
        name: 'background-jobs-service',
        url: 'http://localhost:3003',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: expect.any(Date),
        metadata: {
          timeout: 10000,
          retries: 3,
          circuitBreakerThreshold: 5,
          priority: 3
        }
      });
    });

    it('should initialize services with custom environment URLs', () => {
      process.env.METRICS_SERVICE_URL = 'http://metrics.example.com:4001';
      process.env.CACHE_SERVICE_URL = 'http://cache.example.com:4002';
      process.env.BACKGROUND_JOBS_URL = 'http://jobs.example.com:4003';
      
      registry = ServiceRegistry.getInstance();
      
      expect(registry.getService('metrics-service')?.url).toBe('http://metrics.example.com:4001');
      expect(registry.getService('cache-service')?.url).toBe('http://cache.example.com:4002');
      expect(registry.getService('background-jobs-service')?.url).toBe('http://jobs.example.com:4003');
    });

    it('should initialize health check interval on startup', () => {
      registry = ServiceRegistry.getInstance();
      
      // Verify that setInterval was called for health checking
      expect(mockSetInterval).toHaveBeenCalledWith(
        expect.any(Function),
        30000 // 30 seconds
      );
    });

    it('should set initial health status to healthy for all services', () => {
      registry = ServiceRegistry.getInstance();
      
      const services = registry.getAllServices();
      services.forEach(service => {
        expect(service.health).toBe('healthy');
        expect(service.lastCheck).toBeInstanceOf(Date);
      });
    });
  });

  describe('Service Retrieval Methods', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should return service by name', () => {
      const service = registry.getService('metrics-service');
      
      expect(service).not.toBeNull();
      expect(service?.name).toBe('metrics-service');
      expect(service?.url).toBe('http://localhost:3001');
    });

    it('should return null for non-existent service', () => {
      const service = registry.getService('non-existent-service');
      
      expect(service).toBeNull();
    });

    it('should return all services', () => {
      const services = registry.getAllServices();
      
      expect(services).toHaveLength(3);
      expect(services.map(s => s.name)).toEqual(
        expect.arrayContaining(['metrics-service', 'cache-service', 'background-jobs-service'])
      );
    });

    it('should handle empty service name gracefully', () => {
      const service = registry.getService('');
      
      expect(service).toBeNull();
    });

    it('should handle null/undefined service name gracefully', () => {
      const service1 = registry.getService(null as any);
      const service2 = registry.getService(undefined as any);
      
      expect(service1).toBeNull();
      expect(service2).toBeNull();
    });
  });

  describe('Health Status Management', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should update service health status', () => {
      const serviceName = 'metrics-service';
      const initialService = registry.getService(serviceName);
      const initialLastCheck = initialService?.lastCheck;
      
      // Wait a bit to ensure timestamp difference
      jest.advanceTimersByTime(100);
      
      registry.updateServiceHealth(serviceName, 'degraded');
      
      const updatedService = registry.getService(serviceName);
      expect(updatedService?.health).toBe('degraded');
      expect(updatedService?.lastCheck.getTime()).toBeGreaterThan(initialLastCheck?.getTime() || 0);
    });

    it('should handle health update for non-existent service', () => {
      // Should not throw error
      expect(() => {
        registry.updateServiceHealth('non-existent-service', 'unhealthy');
      }).not.toThrow();
    });

    it('should check if service is healthy', () => {
      const serviceName = 'cache-service';
      
      // Initially should be healthy
      expect(registry.isServiceHealthy(serviceName)).toBe(true);
      
      // Update to degraded
      registry.updateServiceHealth(serviceName, 'degraded');
      expect(registry.isServiceHealthy(serviceName)).toBe(false);
      
      // Update to unhealthy
      registry.updateServiceHealth(serviceName, 'unhealthy');
      expect(registry.isServiceHealthy(serviceName)).toBe(false);
      
      // Update back to healthy
      registry.updateServiceHealth(serviceName, 'healthy');
      expect(registry.isServiceHealthy(serviceName)).toBe(true);
    });

    it('should return false for non-existent service health check', () => {
      expect(registry.isServiceHealthy('non-existent-service')).toBe(false);
    });

    it('should update lastCheck timestamp on health updates', () => {
      const serviceName = 'background-jobs-service';
      const initialService = registry.getService(serviceName);
      const initialTimestamp = initialService?.lastCheck.getTime();
      
      jest.advanceTimersByTime(1000);
      registry.updateServiceHealth(serviceName, 'healthy');
      
      const updatedService = registry.getService(serviceName);
      const updatedTimestamp = updatedService?.lastCheck.getTime();
      
      expect(updatedTimestamp).toBeGreaterThan(initialTimestamp || 0);
    });
  });

  describe('Health Checking Functionality', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
      mockFetch.mockClear();
    });

    it('should perform health checks for all services successfully', async () => {
      // Mock successful health check responses
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200
      });

      // Trigger health check manually
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      // Verify fetch was called for each service
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/health', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3002/health', expect.any(Object));
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:3003/health', expect.any(Object));

      // All services should remain healthy
      expect(registry.isServiceHealthy('metrics-service')).toBe(true);
      expect(registry.isServiceHealthy('cache-service')).toBe(true);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(true);
    });

    it('should handle degraded service responses', async () => {
      // Mock degraded responses (HTTP error codes but not network failure)
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503
      });

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      // All services should be marked as degraded
      expect(registry.getService('metrics-service')?.health).toBe('degraded');
      expect(registry.getService('cache-service')?.health).toBe('degraded');
      expect(registry.getService('background-jobs-service')?.health).toBe('degraded');
    });

    it('should handle network failures as unhealthy', async () => {
      // Mock network failures
      mockFetch.mockRejectedValue(new Error('Network error'));

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      // All services should be marked as unhealthy
      expect(registry.getService('metrics-service')?.health).toBe('unhealthy');
      expect(registry.getService('cache-service')?.health).toBe('unhealthy');
      expect(registry.getService('background-jobs-service')?.health).toBe('unhealthy');

      // Verify error was logged
      expect(console.error).toHaveBeenCalledTimes(3);
    });

    it('should respect service-specific timeouts', async () => {
      // Mock AbortController to track timeout behavior
      const mockAbort = jest.fn();
      const mockAbortController = {
        abort: mockAbort,
        signal: { aborted: false } as AbortSignal
      };
      
      global.AbortController = jest.fn(() => mockAbortController) as any;
      
      // Mock setTimeout to capture timeout handlers
      const mockSetTimeout = jest.spyOn(global, 'setTimeout');
      
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      // Should have created AbortControllers for each service
      expect(global.AbortController).toHaveBeenCalledTimes(3);
      
      // Should have set timeouts for each service
      expect(mockSetTimeout).toHaveBeenCalledTimes(3);
      
      // Verify different timeout values were used
      const timeoutCalls = mockSetTimeout.mock.calls;
      const timeoutValues = timeoutCalls.map(call => call[1]);
      expect(timeoutValues).toContain(5000); // metrics-service
      expect(timeoutValues).toContain(2000); // cache-service
      expect(timeoutValues).toContain(10000); // background-jobs-service
      
      // Cleanup
      mockSetTimeout.mockRestore();
    });

    it('should perform health checks at 30-second intervals', () => {
      registry = ServiceRegistry.getInstance();

      // Fast forward 30 seconds
      jest.advanceTimersByTime(30000);

      // setInterval should have been called to schedule health checks
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
    });

    it('should handle mixed health check results', async () => {
      // Mock different responses for different services
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 }) // metrics-service: healthy
        .mockResolvedValueOnce({ ok: false, status: 503 }) // cache-service: degraded
        .mockRejectedValueOnce(new Error('Connection refused')); // background-jobs: unhealthy

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      expect(registry.getService('metrics-service')?.health).toBe('healthy');
      expect(registry.getService('cache-service')?.health).toBe('degraded');
      expect(registry.getService('background-jobs-service')?.health).toBe('unhealthy');
    });

    it('should use AbortController for request timeouts', async () => {
      const abortController = {
        abort: jest.fn(),
        signal: {} as AbortSignal
      };
      
      // Mock AbortController constructor
      const originalAbortController = global.AbortController;
      global.AbortController = jest.fn(() => abortController) as any;
      
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      // Verify AbortController was created for each service
      expect(global.AbortController).toHaveBeenCalledTimes(3);

      // Restore original AbortController
      global.AbortController = originalAbortController;
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should handle fetch timeout errors gracefully', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'AbortError';
      mockFetch.mockRejectedValue(timeoutError);

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      
      await expect(performHealthChecks()).resolves.not.toThrow();

      // Services should be marked as unhealthy after the health check
      registry.getAllServices().forEach(service => {
        expect(service.health).toBe('unhealthy');
      });
    });

    it('should handle malformed health check URLs', async () => {
      // Modify a service URL to be malformed
      const services = (registry as any).services;
      const metricsService = services.get('metrics-service');
      metricsService.url = 'invalid-url';

      mockFetch.mockRejectedValue(new TypeError('Invalid URL'));

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      expect(registry.getService('metrics-service')?.health).toBe('unhealthy');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Health check failed for metrics-service:'),
        expect.stringContaining('Invalid URL')
      );
    });

    it('should continue health checks even if some services fail', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Service 1 failed'))
        .mockResolvedValueOnce({ ok: true, status: 200 })
        .mockRejectedValueOnce(new Error('Service 3 failed'));

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      // Should have attempted all three health checks
      expect(mockFetch).toHaveBeenCalledTimes(3);
      
      // Services should have appropriate health status
      expect(registry.getService('metrics-service')?.health).toBe('unhealthy');
      expect(registry.getService('cache-service')?.health).toBe('healthy');
      expect(registry.getService('background-jobs-service')?.health).toBe('unhealthy');
    });

    it('should handle concurrent health status updates', async () => {
      const serviceName = 'metrics-service';
      
      // Simulate concurrent updates
      const updates = Array.from({ length: 10 }, (_, i) => 
        registry.updateServiceHealth(serviceName, i % 2 === 0 ? 'healthy' : 'degraded')
      );

      // All updates should complete without error
      expect(() => updates).not.toThrow();

      // Service should have a valid health status
      const finalService = registry.getService(serviceName);
      expect(['healthy', 'degraded']).toContain(finalService?.health);
    });

    it('should handle very long service names and URLs', () => {
      const longName = 'a'.repeat(1000);
      const longUrl = 'http://localhost:3001/' + 'b'.repeat(2000);

      registry.updateServiceHealth(longName, 'healthy');
      
      // Should not throw error and should handle gracefully
      expect(registry.getService(longName)).toBeNull();
    });

    it('should handle special characters in service names', () => {
      const specialNames = [
        'service-with-dashes',
        'service_with_underscores',
        'service.with.dots',
        'service@with@symbols',
        'service with spaces',
        'service/with/slashes'
      ];

      specialNames.forEach(name => {
        expect(() => {
          registry.updateServiceHealth(name, 'healthy');
          registry.getService(name);
          registry.isServiceHealthy(name);
        }).not.toThrow();
      });
    });
  });

  describe('Cleanup and Shutdown', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should stop health checking when stop() is called', () => {
      registry.stop();

      expect(mockClearInterval).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple stop() calls gracefully', () => {
      registry.stop();
      const firstCallCount = mockClearInterval.mock.calls.length;
      
      registry.stop();
      registry.stop();

      // clearInterval should only be called for the first stop() call
      expect(mockClearInterval).toHaveBeenCalledTimes(firstCallCount);
    });

    it('should set healthCheckInterval to null after stopping', () => {
      registry.stop();
      
      const healthCheckInterval = (registry as any).healthCheckInterval;
      expect(healthCheckInterval).toBeNull();
    });

    it('should not throw error when stopping before initialization', () => {
      // Create registry but stop it immediately
      const freshRegistry = ServiceRegistry.getInstance();
      
      expect(() => {
        freshRegistry.stop();
      }).not.toThrow();
    });

    it('should allow restart after stop', () => {
      const initialCallCount = mockSetInterval.mock.calls.length;
      
      // Stop the registry
      registry.stop();
      
      // Create new instance (simulating restart)
      (ServiceRegistry as any).instance = null;
      const newRegistry = ServiceRegistry.getInstance();
      
      // Should have called setInterval again for the new instance
      expect(mockSetInterval.mock.calls.length).toBeGreaterThan(initialCallCount);
      
      // Clean up
      newRegistry.stop();
    });

    it('should handle cleanup during active health checks', async () => {
      // Mock a fetch that resolves quickly
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      
      // Start health check
      const healthCheckPromise = performHealthChecks();
      
      // Stop registry immediately (before health check completes)
      registry.stop();

      // Health check should complete without error even after stop
      await expect(healthCheckPromise).resolves.not.toThrow();
      
      // Verify registry was stopped (interval cleared)
      expect(mockClearInterval).toHaveBeenCalled();
    });
  });

  describe('Performance and Concurrency', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should handle high-frequency service lookups efficiently', () => {
      const startTime = Date.now();
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        registry.getService('metrics-service');
        registry.getAllServices();
        registry.isServiceHealthy('cache-service');
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 10k operations in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent health status updates safely', () => {
      const serviceName = 'metrics-service';
      const promises: Promise<void>[] = [];

      // Create many concurrent health updates
      for (let i = 0; i < 100; i++) {
        const promise = Promise.resolve().then(() => {
          registry.updateServiceHealth(serviceName, i % 2 === 0 ? 'healthy' : 'degraded');
        });
        promises.push(promise);
      }

      return Promise.all(promises).then(() => {
        // Registry should remain in valid state
        const service = registry.getService(serviceName);
        expect(service).not.toBeNull();
        expect(['healthy', 'degraded']).toContain(service?.health);
      });
    });

    it('should maintain performance under memory pressure', () => {
      // Simulate memory pressure by creating many service lookups
      const results: (ServiceInfo | null)[] = [];

      for (let i = 0; i < 1000; i++) {
        results.push(registry.getService('metrics-service'));
        results.push(registry.getService('cache-service'));
        results.push(registry.getService('background-jobs-service'));
      }

      // All results should be consistent
      const metricsResults = results.filter((_, index) => index % 3 === 0);
      const cacheResults = results.filter((_, index) => index % 3 === 1);
      const jobsResults = results.filter((_, index) => index % 3 === 2);

      // All results of same type should be identical (referentially equal)
      expect(metricsResults.every(result => result === metricsResults[0])).toBe(true);
      expect(cacheResults.every(result => result === cacheResults[0])).toBe(true);
      expect(jobsResults.every(result => result === jobsResults[0])).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should simulate realistic service lifecycle', async () => {
      // Initially all services should be healthy
      expect(registry.isServiceHealthy('metrics-service')).toBe(true);
      expect(registry.isServiceHealthy('cache-service')).toBe(true);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(true);

      // Simulate metrics service going down
      mockFetch.mockImplementation((url) => {
        if (url.includes('localhost:3001')) {
          return Promise.reject(new Error('Connection refused'));
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();

      expect(registry.isServiceHealthy('metrics-service')).toBe(false);
      expect(registry.isServiceHealthy('cache-service')).toBe(true);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(true);

      // Simulate cache service becoming degraded
      mockFetch.mockImplementation((url) => {
        if (url.includes('localhost:3001')) {
          return Promise.reject(new Error('Connection refused'));
        }
        if (url.includes('localhost:3002')) {
          return Promise.resolve({ ok: false, status: 503 });
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      await performHealthChecks();

      expect(registry.isServiceHealthy('metrics-service')).toBe(false);
      expect(registry.isServiceHealthy('cache-service')).toBe(false);
      expect(registry.getService('cache-service')?.health).toBe('degraded');
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(true);

      // Simulate recovery
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      await performHealthChecks();

      expect(registry.isServiceHealthy('metrics-service')).toBe(true);
      expect(registry.isServiceHealthy('cache-service')).toBe(true);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(true);
    });

    it('should handle service registry usage in Next.js API routes', () => {
      // Simulate usage in API route context
      const getServicesForAPI = () => {
        const healthyServices = registry.getAllServices()
          .filter(service => registry.isServiceHealthy(service.name));
        
        return healthyServices.map(service => ({
          name: service.name,
          url: service.url,
          status: service.health,
          lastCheck: service.lastCheck.toISOString()
        }));
      };

      const apiResponse = getServicesForAPI();

      expect(apiResponse).toHaveLength(3);
      expect(apiResponse[0]).toEqual({
        name: expect.any(String),
        url: expect.stringContaining('http://localhost:'),
        status: 'healthy',
        lastCheck: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      });
    });

    it('should handle environment variable changes gracefully', () => {
      // Test that URL changes would require registry reset
      const originalUrl = registry.getService('metrics-service')?.url;
      expect(originalUrl).toBe('http://localhost:3001');

      // Note: In real implementation, env var changes would require app restart
      // This test documents the expected behavior
      process.env.METRICS_SERVICE_URL = 'http://new-metrics:4001';
      
      // Current registry should still have old URL until restart
      expect(registry.getService('metrics-service')?.url).toBe('http://localhost:3001');
    });
  });
});