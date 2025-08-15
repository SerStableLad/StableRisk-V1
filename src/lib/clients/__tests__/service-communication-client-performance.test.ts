/**
 * Service Communication Client - Performance and Load Tests
 * 
 * Performance-focused tests covering:
 * - High-volume concurrent requests
 * - Memory usage and cleanup
 * - Request throughput and latency
 * - Resource management under load
 * - Timeout behavior under stress
 * - Circuit breaker performance impact
 * - Metrics overhead assessment
 */

import { ServiceCommunicationClient } from '../service-communication-client';
import { ServiceRegistry, ServiceInfo } from '../../services/service-registry';
import { MetricsServiceClient } from '../metrics-service-client';

// Mock dependencies
jest.mock('../../services/service-registry');
jest.mock('../metrics-service-client');

// Mock global fetch
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('ServiceCommunicationClient - Performance and Load Tests', () => {
  let client: ServiceCommunicationClient;
  let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
  let mockMetricsClient: jest.Mocked<MetricsServiceClient>;

  const mockServices: ServiceInfo[] = [
    {
      name: 'high-performance-service',
      url: 'http://localhost:3001',
      health: 'healthy',
      version: '1.0.0',
      lastCheck: new Date(),
      metadata: {
        timeout: 1000, // Fast timeout for performance tests
        retries: 1,
        circuitBreakerThreshold: 10,
        priority: 1
      }
    },
    {
      name: 'load-test-service',
      url: 'http://localhost:3002',
      health: 'healthy',
      version: '1.0.0',
      lastCheck: new Date(),
      metadata: {
        timeout: 5000,
        retries: 2,
        circuitBreakerThreshold: 20,
        priority: 2
      }
    }
  ];

  beforeEach(() => {
    // Reset singleton instance
    (ServiceCommunicationClient as any).instance = null;
    
    // Reset mocks
    jest.clearAllMocks();
    mockFetch.mockClear();
    
    // Mock ServiceRegistry
    mockServiceRegistry = {
      getInstance: jest.fn().mockReturnThis(),
      getAllServices: jest.fn().mockReturnValue(mockServices),
      getService: jest.fn().mockImplementation((name: string) => 
        mockServices.find(s => s.name === name) || null
      ),
      isServiceHealthy: jest.fn().mockReturnValue(true),
      updateServiceHealth: jest.fn(),
      stop: jest.fn()
    } as any;
    
    (ServiceRegistry.getInstance as jest.Mock).mockReturnValue(mockServiceRegistry);
    
    // Mock MetricsServiceClient
    mockMetricsClient = {
      getInstance: jest.fn().mockReturnThis(),
      recordMetric: jest.fn().mockResolvedValue(undefined)
    } as any;
    
    (MetricsServiceClient.getInstance as jest.Mock).mockReturnValue(mockMetricsClient);
    
    client = ServiceCommunicationClient.getInstance();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 100 concurrent requests efficiently', async () => {
      const requestCount = 100;
      const responses = Array.from({ length: requestCount }, (_, i) => ({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ requestId: i, data: `response-${i}` })
      } as Response));

      mockFetch.mockImplementation(() => 
        Promise.resolve(responses[Math.floor(Math.random() * responses.length)])
      );

      const startTime = Date.now();
      
      const requests = Array.from({ length: requestCount }, (_, i) =>
        client.get('high-performance-service', `/api/concurrent/${i}`)
      );

      const results = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(requestCount);
      expect(mockFetch).toHaveBeenCalledTimes(requestCount);
      
      // Should complete within reasonable time (< 2 seconds for 100 requests)
      expect(duration).toBeLessThan(2000);
      
      // Calculate throughput
      const requestsPerSecond = (requestCount / duration) * 1000;
      expect(requestsPerSecond).toBeGreaterThan(50); // At least 50 RPS
    });

    it('should handle 1000 concurrent requests without memory issues', async () => {
      const requestCount = 1000;
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      const startTime = Date.now();
      
      // Process in batches to avoid overwhelming the system
      const batchSize = 100;
      const batches = Math.ceil(requestCount / batchSize);
      const allResults: any[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const batchRequests = Array.from({ length: batchSize }, (_, i) => {
          const requestId = batch * batchSize + i;
          return client.get('load-test-service', `/api/batch/${requestId}`);
        });

        const batchResults = await Promise.all(batchRequests);
        allResults.push(...batchResults);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(allResults).toHaveLength(requestCount);
      expect(mockFetch).toHaveBeenCalledTimes(requestCount);
      
      // Should complete within reasonable time (< 10 seconds for 1000 requests)
      expect(duration).toBeLessThan(10000);
    });

    it('should maintain performance with mixed HTTP methods', async () => {
      const requestsPerMethod = 25;
      const totalRequests = requestsPerMethod * 4; // GET, POST, PUT, DELETE

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ mixed: true })
      } as Response);

      const startTime = Date.now();

      const requests = [
        ...Array.from({ length: requestsPerMethod }, (_, i) =>
          client.get('high-performance-service', `/api/get/${i}`)
        ),
        ...Array.from({ length: requestsPerMethod }, (_, i) =>
          client.post('high-performance-service', `/api/post/${i}`, { data: i })
        ),
        ...Array.from({ length: requestsPerMethod }, (_, i) =>
          client.put('high-performance-service', `/api/put/${i}`, { update: i })
        ),
        ...Array.from({ length: requestsPerMethod }, (_, i) =>
          client.delete('high-performance-service', `/api/delete/${i}`)
        )
      ];

      const results = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(totalRequests);
      expect(duration).toBeLessThan(3000); // Should complete quickly
    });
  });

  describe('Memory Management and Resource Cleanup', () => {
    it('should not leak memory with failed requests', async () => {
      const failureCount = 500;
      
      mockFetch.mockRejectedValue(new Error('Persistent failure'));

      const requests = Array.from({ length: failureCount }, (_, i) =>
        client.get('high-performance-service', `/api/fail/${i}`, { retries: 0 })
          .catch(error => ({ failed: true, index: i }))
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(failureCount);
      expect(results.every(r => r.failed)).toBe(true);
      
      // Verify all requests were attempted
      expect(mockFetch).toHaveBeenCalledTimes(failureCount);
    });

    it('should clean up AbortControllers properly', async () => {
      const requestCount = 100;
      const abortControllers: AbortController[] = [];
      
      // Track AbortController creation
      const originalAbortController = global.AbortController;
      global.AbortController = jest.fn().mockImplementation(() => {
        const controller = new originalAbortController();
        abortControllers.push(controller);
        return controller;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      const requests = Array.from({ length: requestCount }, (_, i) =>
        client.get('high-performance-service', `/api/abort-test/${i}`)
      );

      await Promise.all(requests);

      expect(abortControllers).toHaveLength(requestCount);
      
      // All controllers should be created for cleanup
      abortControllers.forEach(controller => {
        expect(controller).toBeInstanceOf(originalAbortController);
      });

      global.AbortController = originalAbortController;
    });

    it('should handle timeout cleanup efficiently', async () => {
      jest.useFakeTimers();
      
      const timeoutCount = 50;
      const timeoutIds: NodeJS.Timeout[] = [];
      
      // Mock setTimeout to track timeout IDs
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = jest.fn().mockImplementation((callback, delay) => {
        const id = originalSetTimeout(callback, delay);
        timeoutIds.push(id);
        return id;
      });

      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      mockFetch.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              headers: new Map([['content-type', 'application/json']]),
              json: async () => ({ timeout: 'handled' })
            } as Response);
          }, 100);
        })
      );

      const requests = Array.from({ length: timeoutCount }, (_, i) =>
        client.get('high-performance-service', `/api/timeout-test/${i}`)
      );

      // Fast forward to complete requests
      jest.advanceTimersByTime(200);

      await Promise.all(requests);

      // Should have created timeouts for each request
      expect(timeoutIds).toHaveLength(timeoutCount);
      
      // Should have cleaned up timeouts
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(timeoutCount);

      global.setTimeout = originalSetTimeout;
      jest.useRealTimers();
    });
  });

  describe('Throughput and Latency Performance', () => {
    it('should maintain low latency for individual requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ latency: 'test' })
      } as Response);

      const latencies: number[] = [];
      const requestCount = 20;

      for (let i = 0; i < requestCount; i++) {
        const startTime = Date.now();
        await client.get('high-performance-service', `/api/latency-test/${i}`);
        const endTime = Date.now();
        latencies.push(endTime - startTime);
      }

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      // Average latency should be very low (client-side only)
      expect(avgLatency).toBeLessThan(50); // < 50ms average
      expect(maxLatency).toBeLessThan(100); // < 100ms max
    });

    it('should sustain high throughput over time', async () => {
      const duration = 5000; // 5 seconds
      const batchSize = 50;
      let totalRequests = 0;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ throughput: 'test' })
      } as Response);

      const startTime = Date.now();
      
      while (Date.now() - startTime < duration) {
        const batchRequests = Array.from({ length: batchSize }, (_, i) =>
          client.get('high-performance-service', `/api/throughput/${totalRequests + i}`)
        );

        await Promise.all(batchRequests);
        totalRequests += batchSize;
      }

      const actualDuration = Date.now() - startTime;
      const requestsPerSecond = (totalRequests / actualDuration) * 1000;

      expect(totalRequests).toBeGreaterThan(100); // At least 100 requests in 5 seconds
      expect(requestsPerSecond).toBeGreaterThan(20); // At least 20 RPS sustained
    });

    it('should handle burst traffic efficiently', async () => {
      const burstSize = 200;
      const burstCount = 3;
      const delayBetweenBursts = 1000;

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ burst: 'handled' })
      } as Response);

      const burstTimes: number[] = [];

      for (let burst = 0; burst < burstCount; burst++) {
        const burstStartTime = Date.now();
        
        const burstRequests = Array.from({ length: burstSize }, (_, i) =>
          client.get('load-test-service', `/api/burst/${burst}-${i}`)
        );

        await Promise.all(burstRequests);
        
        const burstEndTime = Date.now();
        burstTimes.push(burstEndTime - burstStartTime);

        if (burst < burstCount - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBursts));
        }
      }

      // Each burst should complete reasonably quickly
      burstTimes.forEach(time => {
        expect(time).toBeLessThan(3000); // < 3 seconds per burst
      });

      expect(mockFetch).toHaveBeenCalledTimes(burstSize * burstCount);
    });
  });

  describe('Circuit Breaker Performance Impact', () => {
    it('should have minimal performance overhead when circuit breaker is closed', async () => {
      const requestCount = 100;
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      // Test with circuit breaker enabled
      const startTimeWithCB = Date.now();
      const requestsWithCB = Array.from({ length: requestCount }, (_, i) =>
        client.get('high-performance-service', `/api/cb-enabled/${i}`, {
          circuitBreaker: true
        })
      );
      await Promise.all(requestsWithCB);
      const endTimeWithCB = Date.now();
      const durationWithCB = endTimeWithCB - startTimeWithCB;

      mockFetch.mockClear();

      // Test with circuit breaker disabled
      const startTimeWithoutCB = Date.now();
      const requestsWithoutCB = Array.from({ length: requestCount }, (_, i) =>
        client.get('high-performance-service', `/api/cb-disabled/${i}`, {
          circuitBreaker: false
        })
      );
      await Promise.all(requestsWithoutCB);
      const endTimeWithoutCB = Date.now();
      const durationWithoutCB = endTimeWithoutCB - startTimeWithoutCB;

      // Circuit breaker overhead should be minimal (< 20% difference)
      const overhead = (durationWithCB - durationWithoutCB) / durationWithoutCB;
      expect(overhead).toBeLessThan(0.2);
    });

    it('should block requests efficiently when circuit breaker is open', async () => {
      const serviceName = 'high-performance-service';
      
      // Open circuit breaker
      mockFetch.mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 10; i++) {
        try {
          await client.get(serviceName, `/api/fail/${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      mockFetch.mockClear();

      // Test blocked request performance
      const blockedRequestCount = 1000;
      const startTime = Date.now();

      const blockedRequests = Array.from({ length: blockedRequestCount }, (_, i) =>
        client.get(serviceName, `/api/blocked/${i}`)
          .catch(error => ({ blocked: true, index: i }))
      );

      const results = await Promise.all(blockedRequests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should be blocked
      expect(results.every(r => r.blocked)).toBe(true);
      
      // No network requests should be made
      expect(mockFetch).not.toHaveBeenCalled();
      
      // Blocking should be very fast (< 100ms for 1000 requests)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Metrics Recording Performance', () => {
    it('should handle metrics recording overhead efficiently', async () => {
      const requestCount = 200;
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      // Test with metrics enabled (default)
      const startTimeWithMetrics = Date.now();
      const requestsWithMetrics = Array.from({ length: requestCount }, (_, i) =>
        client.get('high-performance-service', `/api/metrics-enabled/${i}`)
      );
      await Promise.all(requestsWithMetrics);
      const endTimeWithMetrics = Date.now();
      const durationWithMetrics = endTimeWithMetrics - startTimeWithMetrics;

      // Verify metrics were recorded
      expect(mockMetricsClient.recordMetric).toHaveBeenCalled();
      
      // Reset for comparison
      mockFetch.mockClear();
      mockMetricsClient.recordMetric.mockClear();

      // Mock metrics client to reject (simulating disabled metrics)
      mockMetricsClient.recordMetric.mockRejectedValue(new Error('Metrics disabled'));

      const startTimeWithoutMetrics = Date.now();
      const requestsWithoutMetrics = Array.from({ length: requestCount }, (_, i) =>
        client.get('high-performance-service', `/api/metrics-disabled/${i}`)
      );
      await Promise.all(requestsWithoutMetrics);
      const endTimeWithoutMetrics = Date.now();
      const durationWithoutMetrics = endTimeWithoutMetrics - startTimeWithoutMetrics;

      // Metrics overhead should be minimal
      const overhead = (durationWithMetrics - durationWithoutMetrics) / durationWithoutMetrics;
      expect(Math.abs(overhead)).toBeLessThan(0.3); // Less than 30% difference
    });

    it('should not block requests when metrics recording fails', async () => {
      mockMetricsClient.recordMetric.mockRejectedValue(new Error('Metrics service down'));
      
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ metrics: 'failed' })
      } as Response);

      const requestCount = 50;
      const startTime = Date.now();

      const requests = Array.from({ length: requestCount }, (_, i) =>
        client.get('high-performance-service', `/api/metrics-fail/${i}`)
      );

      const results = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // All requests should succeed despite metrics failures
      expect(results).toHaveLength(requestCount);
      results.forEach(result => {
        expect(result).toEqual({ metrics: 'failed' });
      });

      // Should complete quickly
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Stress Testing and Edge Cases', () => {
    it('should handle rapid service health changes', async () => {
      const requestCount = 100;
      let healthToggle = true;

      mockFetch.mockImplementation(() => {
        // Alternate between success and failure
        healthToggle = !healthToggle;
        if (healthToggle) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/json']]),
            json: async () => ({ health: 'good' })
          } as Response);
        } else {
          return Promise.reject(new Error('Health toggle failure'));
        }
      });

      const requests = Array.from({ length: requestCount }, (_, i) =>
        client.get('high-performance-service', `/api/health-toggle/${i}`, { retries: 0 })
          .then(result => ({ success: true, result }))
          .catch(error => ({ success: false, error: error.message }))
      );

      const results = await Promise.all(requests);

      // Should have mix of success and failure
      const successes = results.filter(r => r.success);
      const failures = results.filter(r => !r.success);

      expect(successes.length).toBeGreaterThan(0);
      expect(failures.length).toBeGreaterThan(0);
      expect(successes.length + failures.length).toBe(requestCount);
    });

    it('should maintain performance with many timeouts', async () => {
      jest.useFakeTimers();
      
      const timeoutCount = 100;
      
      mockFetch.mockImplementation(() =>
        new Promise(() => {}) // Never resolves (will timeout)
      );

      const startTime = Date.now();
      
      const timeoutRequests = Array.from({ length: timeoutCount }, (_, i) =>
        client.get('high-performance-service', `/api/timeout/${i}`)
          .catch(error => ({ timeout: true, index: i }))
      );

      // Advance timers to trigger all timeouts
      jest.advanceTimersByTime(2000);

      const results = await Promise.all(timeoutRequests);
      const endTime = Date.now();

      // All requests should timeout
      expect(results.every(r => r.timeout)).toBe(true);
      
      // Should handle timeouts efficiently
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000); // Should be fast with fake timers

      jest.useRealTimers();
    });

    it('should handle extreme request payload sizes', async () => {
      const largePayload = {
        data: 'x'.repeat(1000000), // 1MB string
        array: new Array(1000).fill({ large: 'object' }),
        nested: {
          deep: {
            structure: new Array(100).fill('data')
          }
        }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ received: 'large payload' })
      } as Response);

      const startTime = Date.now();
      const result = await client.post('load-test-service', '/api/large-payload', largePayload);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result).toEqual({ received: 'large payload' });
      expect(duration).toBeLessThan(1000); // Should handle large payloads quickly
    });
  });
});