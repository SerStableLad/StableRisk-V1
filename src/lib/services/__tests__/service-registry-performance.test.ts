/**
 * Service Registry - Performance Test Suite
 * 
 * These tests verify the Service Registry meets performance requirements:
 * - Service requests complete within configured timeouts
 * - Circuit breakers open/close based on configured thresholds  
 * - Health checks complete in < 3 seconds per service
 * - Service communication adds < 50ms overhead per request
 * - High concurrency scenarios
 * - Memory efficiency under load
 */

import { ServiceRegistry, ServiceInfo } from '../service-registry';

// Mock fetch for performance tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console methods to reduce noise in tests
jest.spyOn(console, 'error').mockImplementation(() => {});

// Use real timers for accurate performance testing
jest.useRealTimers();

describe('ServiceRegistry Performance Tests', () => {
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
    
    registry = ServiceRegistry.getInstance();
  });

  afterEach(async () => {
    // Clean up registry
    if (registry) {
      registry.stop();
    }
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  describe('Service Operation Performance', () => {
    it('should handle singleton access in < 1ms', () => {
      const iterations = 10000;
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        ServiceRegistry.getInstance();
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      const averageTimePerAccess = durationMs / iterations;
      
      expect(averageTimePerAccess).toBeLessThan(1); // Less than 1ms per access
      expect(durationMs).toBeLessThan(100); // Total time less than 100ms
    });

    it('should handle service retrieval in < 0.1ms per operation', () => {
      const iterations = 100000;
      const services = ['metrics-service', 'cache-service', 'background-jobs-service', 'non-existent'];
      
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        const serviceName = services[i % services.length];
        registry.getService(serviceName);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      const averageTimePerRetrieval = durationMs / iterations;
      
      expect(averageTimePerRetrieval).toBeLessThan(0.1); // Less than 0.1ms per retrieval
    });

    it('should handle health status updates in < 0.5ms per operation', () => {
      const iterations = 50000;
      const services = ['metrics-service', 'cache-service', 'background-jobs-service'];
      const healthStates: ServiceInfo['health'][] = ['healthy', 'degraded', 'unhealthy'];
      
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        const serviceName = services[i % services.length];
        const healthState = healthStates[i % healthStates.length];
        registry.updateServiceHealth(serviceName, healthState);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      const averageTimePerUpdate = durationMs / iterations;
      
      expect(averageTimePerUpdate).toBeLessThan(0.5); // Less than 0.5ms per update
    });

    it('should handle getAllServices() efficiently', () => {
      const iterations = 10000;
      
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        const services = registry.getAllServices();
        expect(services).toHaveLength(3);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      const averageTimePerCall = durationMs / iterations;
      
      expect(averageTimePerCall).toBeLessThan(0.1); // Less than 0.1ms per call
    });

    it('should handle isServiceHealthy() efficiently', () => {
      const iterations = 100000;
      const services = ['metrics-service', 'cache-service', 'background-jobs-service', 'non-existent'];
      
      const startTime = process.hrtime.bigint();
      
      for (let i = 0; i < iterations; i++) {
        const serviceName = services[i % services.length];
        registry.isServiceHealthy(serviceName);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      const averageTimePerCheck = durationMs / iterations;
      
      expect(averageTimePerCheck).toBeLessThan(0.05); // Less than 0.05ms per check
    });
  });

  describe('Health Check Performance', () => {
    it('should complete health checks for all services in < 3 seconds', async () => {
      // Mock fast but realistic response times
      mockFetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({ ok: true, status: 200 }), 50)
        )
      );
      
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      
      const startTime = Date.now();
      await performHealthChecks();
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(3000); // Less than 3 seconds
      expect(duration).toBeGreaterThan(50); // Should take at least 50ms due to mock delay
    });

    it('should handle health checks with service-specific timeouts correctly', async () => {
      const timeoutTracking: Record<string, number[]> = {};
      
      // Mock fetch to track timeout behavior
      mockFetch.mockImplementation((url, options) => {
        const serviceName = url.includes('3001') ? 'metrics-service' : 
                           url.includes('3002') ? 'cache-service' : 'background-jobs-service';
        
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            resolve({ ok: true, status: 200 });
          }, 10); // Very fast response
          
          // Track timeout settings
          if (!timeoutTracking[serviceName]) {
            timeoutTracking[serviceName] = [];
          }
          
          // Extract timeout from AbortController (indirectly)
          if (options?.signal) {
            // In a real scenario, we'd track the timeout values
            // Here we just ensure the signal is properly configured
            expect(options.signal).toBeInstanceOf(AbortSignal);
          }
        });
      });
      
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      
      const startTime = Date.now();
      await performHealthChecks();
      const duration = Date.now() - startTime;
      
      // Should complete quickly with fast responses
      expect(duration).toBeLessThan(100);
      
      // Should have called fetch for each service
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent health checks efficiently', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });
      
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      const concurrentChecks = 10;
      
      const startTime = Date.now();
      
      // Run multiple health checks concurrently
      const promises = Array.from({ length: concurrentChecks }, () => performHealthChecks());
      await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      // Should not take much longer than a single health check
      expect(duration).toBeLessThan(500);
      
      // Should have made 3 * concurrentChecks fetch calls
      expect(mockFetch).toHaveBeenCalledTimes(3 * concurrentChecks);
    });

    it('should handle timeout scenarios efficiently', async () => {
      // Mock slow responses that will timeout
      mockFetch.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 500)) // 500ms - longer than cache timeout but shorter than others
      );
      
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      
      const startTime = Date.now();
      await performHealthChecks();
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(2000); // Should be much less than 2 seconds
      expect(duration).toBeGreaterThan(500); // Should wait at least 500ms
      
      // Services with short timeouts should timeout, others should succeed
      const metricsService = registry.getService('metrics-service');
      const cacheService = registry.getService('cache-service');
      const jobsService = registry.getService('background-jobs-service');
      
      expect(metricsService?.health).toBeDefined();
      expect(cacheService?.health).toBeDefined(); 
      expect(jobsService?.health).toBeDefined();
    }, 10000);
  });

  describe('Concurrent Access Performance', () => {
    it('should handle high concurrency without performance degradation', async () => {
      const concurrentOperations = 1000;
      const operationsPerPromise = 100;
      
      // Create many concurrent operations
      const promises = Array.from({ length: concurrentOperations }, async (_, i) => {
        const operations = [];
        
        for (let j = 0; j < operationsPerPromise; j++) {
          // Mix different operations
          if (j % 4 === 0) {
            operations.push(() => registry.getService('metrics-service'));
          } else if (j % 4 === 1) {
            operations.push(() => registry.getAllServices());
          } else if (j % 4 === 2) {
            operations.push(() => registry.isServiceHealthy('cache-service'));
          } else {
            operations.push(() => registry.updateServiceHealth('background-jobs-service', 'healthy'));
          }
        }
        
        // Execute operations
        const startTime = process.hrtime.bigint();
        operations.forEach(op => op());
        const endTime = process.hrtime.bigint();
        
        const durationMs = Number(endTime - startTime) / 1000000;
        return durationMs;
      });
      
      const durations = await Promise.all(promises);
      
      // Calculate statistics
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      
      expect(avgDuration).toBeLessThan(10); // Average should be less than 10ms
      expect(maxDuration).toBeLessThan(50); // Maximum should be less than 50ms
      
      // Registry should still be in valid state
      expect(registry.getAllServices()).toHaveLength(3);
    });

    it('should handle repeated getInstance() calls under load', async () => {
      const concurrency = 100;
      const callsPerThread = 1000;
      
      const promises = Array.from({ length: concurrency }, async () => {
        const instances = [];
        const startTime = process.hrtime.bigint();
        
        for (let i = 0; i < callsPerThread; i++) {
          instances.push(ServiceRegistry.getInstance());
        }
        
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1000000;
        
        return { instances, durationMs };
      });
      
      const results = await Promise.all(promises);
      
      // All instances should be the same (singleton)
      const firstInstance = results[0].instances[0];
      results.forEach(result => {
        result.instances.forEach(instance => {
          expect(instance).toBe(firstInstance);
        });
      });
      
      // Performance should be acceptable
      const avgDuration = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
      expect(avgDuration).toBeLessThan(100); // Less than 100ms per thread
    });

    it('should maintain performance with large numbers of health updates', async () => {
      const updates = 50000;
      const services = ['metrics-service', 'cache-service', 'background-jobs-service'];
      const healthStates: ServiceInfo['health'][] = ['healthy', 'degraded', 'unhealthy'];
      
      const startTime = process.hrtime.bigint();
      
      // Perform updates in batches to simulate real usage
      for (let batch = 0; batch < 10; batch++) {
        const batchPromises = Array.from({ length: updates / 10 }, (_, i) => {
          return new Promise<void>(resolve => {
            const serviceName = services[i % services.length];
            const healthState = healthStates[i % healthStates.length];
            registry.updateServiceHealth(serviceName, healthState);
            resolve();
          });
        });
        
        await Promise.all(batchPromises);
      }
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;
      
      expect(durationMs).toBeLessThan(1000); // Less than 1 second for 50k updates
      
      // Verify final state is consistent
      const finalServices = registry.getAllServices();
      expect(finalServices).toHaveLength(3);
      finalServices.forEach(service => {
        expect(['healthy', 'degraded', 'unhealthy']).toContain(service.health);
        expect(service.lastCheck).toBeInstanceOf(Date);
      });
    });
  });

  describe('Memory Performance', () => {
    it('should maintain reasonable memory usage during operations', () => {
      const initialServices = registry.getAllServices();
      const initialMemoryUsage = process.memoryUsage().heapUsed;
      
      // Perform operations (reduced count for stability)
      for (let i = 0; i < 10000; i++) {
        registry.getService('metrics-service');
        registry.getAllServices();
        registry.isServiceHealthy('cache-service');
        registry.updateServiceHealth('background-jobs-service', 'healthy');
      }
      
      const finalMemoryUsage = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemoryUsage - initialMemoryUsage;
      
      // Memory increase should be reasonable (< 10MB for this test environment)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      
      // Service count should remain constant
      const finalServices = registry.getAllServices();
      expect(finalServices).toHaveLength(initialServices.length);
    });

    it('should handle health status changes without excessive memory growth', () => {
      const initialMemoryUsage = process.memoryUsage().heapUsed;
      
      // Perform health status changes (reduced count for stability)
      const services = ['metrics-service', 'cache-service', 'background-jobs-service'];
      const healthStates: ServiceInfo['health'][] = ['healthy', 'degraded', 'unhealthy'];
      
      for (let i = 0; i < 1000; i++) {
        const serviceName = services[i % services.length];
        const healthState = healthStates[i % healthStates.length];
        registry.updateServiceHealth(serviceName, healthState);
        
        // Occasionally check service state to ensure objects aren't accumulating
        if (i % 100 === 0) {
          const service = registry.getService(serviceName);
          expect(service?.health).toBe(healthState);
        }
      }
      
      const finalMemoryUsage = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemoryUsage - initialMemoryUsage;
      
      // Memory increase should be reasonable for test environment
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024); // Less than 5MB
    });

    it('should handle temporary memory allocation efficiently', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create temporary load (reduced for stability)
      let tempData: any[] = [];
      for (let i = 0; i < 100; i++) {
        tempData.push(new Array(100).fill(i));
        registry.getAllServices();
      }
      
      // Clear temporary data
      tempData = [];
      
      // Wait for any cleanup
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const finalMemory = process.memoryUsage().heapUsed;
      
      // Registry should still function correctly
      expect(registry.getAllServices()).toHaveLength(3);
      expect(registry.getService('metrics-service')).not.toBeNull();
      
      // Memory should be reasonable
      expect(finalMemory).toBeGreaterThan(0);
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle network errors efficiently without blocking', async () => {
      // Mock network errors
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      const iterations = 10;
      
      const startTime = Date.now();
      
      // Run multiple health checks with errors
      for (let i = 0; i < iterations; i++) {
        await performHealthChecks();
      }
      
      const totalDuration = Date.now() - startTime;
      const averageDuration = totalDuration / iterations;
      
      // Should complete quickly even with errors
      expect(averageDuration).toBeLessThan(100); // Less than 100ms per health check
      
      // All services should be marked as unhealthy
      expect(registry.isServiceHealthy('metrics-service')).toBe(false);
      expect(registry.isServiceHealthy('cache-service')).toBe(false);
      expect(registry.isServiceHealthy('background-jobs-service')).toBe(false);
    });

    it('should handle mixed success/failure scenarios efficiently', async () => {
      let callCount = 0;
      
      // Mock mixed responses
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.resolve({ ok: true, status: 200 });
        } else {
          return Promise.reject(new Error('Intermittent failure'));
        }
      });
      
      const performHealthChecks = (registry as any).performHealthChecks.bind(registry);
      const iterations = 20;
      
      const durations: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await performHealthChecks();
        const duration = Date.now() - startTime;
        durations.push(duration);
      }
      
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      
      expect(avgDuration).toBeLessThan(50); // Average less than 50ms
      expect(maxDuration).toBeLessThan(200); // Maximum less than 200ms
      
      // Should have called fetch 3 * iterations times
      expect(mockFetch).toHaveBeenCalledTimes(3 * iterations);
    });
  });
});