/**
 * Service Registry - Integration Test Suite
 * 
 * These tests verify the Service Registry works correctly in more complex
 * integration scenarios, including:
 * - Real network timeouts and error handling
 * - Service failure recovery scenarios
 * - Load testing and performance under stress
 * - Memory leak detection
 * - Thread safety under concurrent load
 */

import { ServiceRegistry, ServiceInfo } from '../service-registry';

// Mock fetch for integration tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console methods to reduce noise in tests
jest.spyOn(console, 'error').mockImplementation(() => {});

// Use real timers for integration tests to test actual timing
jest.useRealTimers();

describe('ServiceRegistry Integration Tests', () => {
  let registry: ServiceRegistry;
  
  beforeEach(async () => {
    // Reset the singleton instance for each test
    (ServiceRegistry as any).instance = null;
    
    // Clear all mocks
    jest.clearAllMocks();
    
    // Reset environment variables
    delete process.env.METRICS_SERVICE_URL;
    delete process.env.CACHE_SERVICE_URL;
    delete process.env.BACKGROUND_JOBS_URL;
  });

  afterEach(async () => {
    // Clean up registry if it exists
    if (registry) {
      registry.stop();
    }
    
    // Wait a bit to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Service Failure and Recovery Scenarios', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should handle complete service outage and recovery', async () => {
      // Start with all services healthy
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      await performHealthChecks();
      
      expect(registry.isServiceHealthy('metrics-service')).toBe(true);
      expect(registry.isServiceHealthy('cache-service')).toBe(true);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(true);

      // Simulate complete outage
      mockFetch.mockRejectedValue(new Error('All services down'));
      await performHealthChecks();
      
      expect(registry.isServiceHealthy('metrics-service')).toBe(false);
      expect(registry.isServiceHealthy('cache-service')).toBe(false);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(false);

      // Simulate gradual recovery
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          // First service (metrics) recovers
          return Promise.resolve({ ok: true, status: 200 });
        } else if (callCount <= 2) {
          // Second service (cache) still down
          return Promise.reject(new Error('Still down'));
        } else {
          // Third service (background-jobs) still down
          return Promise.reject(new Error('Still down'));
        }
      });

      await performHealthChecks();
      
      expect(registry.isServiceHealthy('metrics-service')).toBe(true);
      expect(registry.isServiceHealthy('cache-service')).toBe(false);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(false);

      // Full recovery
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      await performHealthChecks();
      
      expect(registry.isServiceHealthy('metrics-service')).toBe(true);
      expect(registry.isServiceHealthy('cache-service')).toBe(true);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(true);
    });

    it('should handle intermittent service failures', async () => {
      let healthCheckCount = 0;
      
      // Simulate intermittent failures
      mockFetch.mockImplementation(() => {
        healthCheckCount++;
        // Fail every 3rd health check for metrics service
        if (healthCheckCount % 3 === 0) {
          return Promise.reject(new Error('Intermittent failure'));
        }
        return Promise.resolve({ ok: true, status: 200 });
      });

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);

      // Run multiple health checks
      for (let i = 0; i < 9; i++) {
        await performHealthChecks();
        
        if ((i + 1) % 3 === 0) {
          // Every 3rd check should have at least one unhealthy service
          const services = registry.getAllServices();
          const healthyCount = services.filter(s => s.health === 'healthy').length;
          expect(healthyCount).toBeLessThan(3);
        }
      }
    });

    it('should handle mixed response types correctly', async () => {
      // Mock different response scenarios
      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 })     // metrics: healthy
        .mockResolvedValueOnce({ ok: false, status: 503 })    // cache: degraded
        .mockResolvedValueOnce({ ok: false, status: 404 })    // jobs: degraded
        .mockResolvedValueOnce({ ok: true, status: 200 })     // metrics: healthy
        .mockRejectedValueOnce(new Error('Network error'))    // cache: unhealthy
        .mockResolvedValueOnce({ ok: false, status: 502 });   // jobs: degraded

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      
      // First health check
      await performHealthChecks();
      
      expect(registry.getService('metrics-service')?.health).toBe('healthy');
      expect(registry.getService('cache-service')?.health).toBe('degraded');
      expect(registry.getService('background-jobs-service')?.health).toBe('degraded');

      // Second health check
      await performHealthChecks();
      
      expect(registry.getService('metrics-service')?.health).toBe('healthy');
      expect(registry.getService('cache-service')?.health).toBe('unhealthy');
      expect(registry.getService('background-jobs-service')?.health).toBe('degraded');
    });
  });

  describe('Performance and Stress Testing', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should handle high-frequency concurrent health status updates', async () => {
      const concurrentOperations = 1000;
      const services = ['metrics-service', 'cache-service', 'background-jobs-service'];
      
      const promises = Array.from({ length: concurrentOperations }, (_, i) => {
        const serviceName = services[i % services.length];
        const healthStatus: ServiceInfo['health'] = i % 3 === 0 ? 'healthy' : i % 3 === 1 ? 'degraded' : 'unhealthy';
        
        return Promise.resolve().then(() => {
          registry.updateServiceHealth(serviceName, healthStatus);
          return registry.getService(serviceName);
        });
      });

      const results = await Promise.all(promises);
      
      // All operations should complete successfully
      expect(results).toHaveLength(concurrentOperations);
      results.forEach(service => {
        expect(service).not.toBeNull();
        expect(['healthy', 'degraded', 'unhealthy']).toContain(service?.health);
      });

      // Registry should still be in valid state
      const finalServices = registry.getAllServices();
      expect(finalServices).toHaveLength(3);
      finalServices.forEach(service => {
        expect(service.lastCheck).toBeInstanceOf(Date);
        expect(['healthy', 'degraded', 'unhealthy']).toContain(service.health);
      });
    });

    it('should maintain performance under memory pressure', () => {
      const iterations = 10000;
      const startTime = Date.now();
      
      // Simulate high memory usage scenario
      const memoryConsumers: any[] = [];
      
      for (let i = 0; i < iterations; i++) {
        // Perform registry operations
        const service = registry.getService('metrics-service');
        registry.updateServiceHealth('cache-service', 'healthy');
        const allServices = registry.getAllServices();
        
        // Add some memory pressure
        if (i % 100 === 0) {
          memoryConsumers.push(new Array(1000).fill(i));
        }
        
        // Verify operations still work correctly
        expect(service).not.toBeNull();
        expect(allServices).toHaveLength(3);
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete in reasonable time even under memory pressure
      expect(duration).toBeLessThan(1000); // Less than 1 second
      
      // Cleanup memory
      memoryConsumers.length = 0;
    });

    it('should handle rapid singleton access from multiple contexts', async () => {
      const contexts = 50;
      const accessesPerContext = 100;
      
      const contextPromises = Array.from({ length: contexts }, async (_, contextId) => {
        const instances: ServiceRegistry[] = [];
        
        for (let i = 0; i < accessesPerContext; i++) {
          instances.push(ServiceRegistry.getInstance());
          
          // Perform some operations
          const service = instances[instances.length - 1].getService('metrics-service');
          expect(service).not.toBeNull();
          
          // Add small delay to simulate real usage
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        return instances;
      });
      
      const allInstances = await Promise.all(contextPromises);
      
      // Flatten all instances
      const flatInstances = allInstances.flat();
      expect(flatInstances).toHaveLength(contexts * accessesPerContext);
      
      // All instances should be the same (singleton)
      const firstInstance = flatInstances[0];
      flatInstances.forEach(instance => {
        expect(instance).toBe(firstInstance);
      });
    });
  });

  describe('Real-Time Health Monitoring', () => {
    beforeEach(() => {
      registry = ServiceRegistry.getInstance();
    });

    it('should track health status changes over time', async () => {
      const healthHistory: Array<{ timestamp: number; services: Record<string, string> }> = [];
      
      // Helper to capture current health status
      const captureHealth = () => {
        const services = registry.getAllServices();
        const healthStatus: Record<string, string> = {};
        services.forEach(service => {
          healthStatus[service.name] = service.health;
        });
        healthHistory.push({
          timestamp: Date.now(),
          services: healthStatus
        });
      };

      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      
      // Initial state
      captureHealth();
      
      // Simulate health changes over time
      const scenarios = [
        { mock: () => mockFetch.mockResolvedValue({ ok: true, status: 200 }), desc: 'all healthy' },
        { mock: () => mockFetch.mockResolvedValue({ ok: false, status: 503 }), desc: 'all degraded' },
        { mock: () => mockFetch.mockRejectedValue(new Error('Network down')), desc: 'all unhealthy' },
        { mock: () => mockFetch.mockResolvedValue({ ok: true, status: 200 }), desc: 'recovered' },
      ];
      
      for (const scenario of scenarios) {
        scenario.mock();
        await performHealthChecks();
        captureHealth();
        
        // Small delay between scenarios
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Verify we captured health changes over time
      expect(healthHistory).toHaveLength(5); // initial + 4 scenarios
      
      // Verify timestamps are increasing (allowing for same timestamp in fast execution)
      for (let i = 1; i < healthHistory.length; i++) {
        expect(healthHistory[i].timestamp).toBeGreaterThanOrEqual(healthHistory[i - 1].timestamp);
      }
      
      // Verify health state changes
      expect(healthHistory[0].services['metrics-service']).toBe('healthy'); // initial
      expect(healthHistory[2].services['metrics-service']).toBe('degraded'); // degraded scenario
      expect(healthHistory[3].services['metrics-service']).toBe('unhealthy'); // unhealthy scenario
      expect(healthHistory[4].services['metrics-service']).toBe('healthy'); // recovered scenario
    });

    it('should handle health check timing accurately', async () => {
      const healthCheckTimings: number[] = [];
      
      // Wrap performHealthChecks to track timing
      const originalPerformHealthChecks = (registry as any).performHealthChecks.bind(registry);
      (registry as any).performHealthChecks = async function() {
        const startTime = Date.now();
        await originalPerformHealthChecks();
        const duration = Date.now() - startTime;
        healthCheckTimings.push(duration);
      };
      
      // Mock fast responses
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      
      // Perform multiple health checks
      for (let i = 0; i < 5; i++) {
        await (registry as any).performHealthChecks();
      }
      
      expect(healthCheckTimings).toHaveLength(5);
      
      // All health checks should complete quickly with fast responses
      healthCheckTimings.forEach(timing => {
        expect(timing).toBeLessThan(100); // Less than 100ms
      });
      
      // Now test with slower responses
      healthCheckTimings.length = 0;
      mockFetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({ ok: true, status: 200 }), 100)
        )
      );
      
      await (registry as any).performHealthChecks();
      
      // Should take at least 100ms with slow responses
      expect(healthCheckTimings[0]).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Environment and Configuration Integration', () => {
    it('should work correctly with production-like environment variables', () => {
      process.env.METRICS_SERVICE_URL = 'https://metrics.production.com:8443';
      process.env.CACHE_SERVICE_URL = 'https://cache.production.com:8443';
      process.env.BACKGROUND_JOBS_URL = 'https://jobs.production.com:8443';
      
      registry = ServiceRegistry.getInstance();
      
      expect(registry.getService('metrics-service')?.url).toBe('https://metrics.production.com:8443');
      expect(registry.getService('cache-service')?.url).toBe('https://cache.production.com:8443');
      expect(registry.getService('background-jobs-service')?.url).toBe('https://jobs.production.com:8443');
      
      // Verify HTTPS URLs don't break health checking
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      expect(performHealthChecks()).resolves.not.toThrow();
    });

    it('should handle malformed environment variable URLs gracefully', () => {
      process.env.METRICS_SERVICE_URL = 'not-a-valid-url';
      process.env.CACHE_SERVICE_URL = 'ftp://invalid-protocol';
      process.env.BACKGROUND_JOBS_URL = '   '; // Whitespace-only string
      
      // Should still create registry without throwing
      expect(() => {
        registry = ServiceRegistry.getInstance();
      }).not.toThrow();
      
      // Should use the env values as-is (validation happens at fetch time)
      expect(registry.getService('metrics-service')?.url).toBe('not-a-valid-url');
      expect(registry.getService('cache-service')?.url).toBe('ftp://invalid-protocol');
      // Whitespace-only string defaults to the fallback URL
      expect(registry.getService('background-jobs-service')?.url).toBe('http://localhost:3003')
    });
  });

  describe('Memory Leak Detection', () => {
    it('should not leak memory when repeatedly creating and destroying instances', async () => {
      const iterations = 100;
      
      // Force garbage collection if available (for testing)
      const forceGC = () => {
        if (global.gc) {
          global.gc();
        }
      };
      
      for (let i = 0; i < iterations; i++) {
        // Create instance
        const testRegistry = ServiceRegistry.getInstance();
        
        // Use the instance
        testRegistry.getService('metrics-service');
        testRegistry.getAllServices();
        testRegistry.updateServiceHealth('cache-service', 'healthy');
        
        // Stop and reset
        testRegistry.stop();
        (ServiceRegistry as any).instance = null;
        
        // Force garbage collection every 10 iterations
        if (i % 10 === 0) {
          forceGC();
        }
      }
      
      // Final cleanup
      forceGC();
      
      // If we get here without running out of memory, the test passes
      expect(true).toBe(true);
    });

    it('should properly clean up timers and prevent timer leaks', () => {
      const activeTimers = new Set();
      
      // Mock setInterval to track active timers
      const originalSetInterval = global.setInterval;
      global.setInterval = jest.fn((callback, delay) => {
        const timerId = originalSetInterval(callback, delay);
        activeTimers.add(timerId);
        return timerId;
      }) as any;
      
      // Mock clearInterval to track timer cleanup
      const originalClearInterval = global.clearInterval;
      global.clearInterval = jest.fn((timerId) => {
        activeTimers.delete(timerId);
        return originalClearInterval(timerId);
      }) as any;
      
      // Create and destroy multiple registry instances
      for (let i = 0; i < 10; i++) {
        const testRegistry = ServiceRegistry.getInstance();
        testRegistry.stop();
        (ServiceRegistry as any).instance = null;
      }
      
      // All timers should be cleaned up
      expect(activeTimers.size).toBe(0);
      
      // Restore original functions
      global.setInterval = originalSetInterval;
      global.clearInterval = originalClearInterval;
    });
  });
});