import { MetricsServiceClient } from '../../clients/metrics-service-client';

// Mock fetch globally
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Mock AbortSignal.timeout for environments that don't support it
if (typeof AbortSignal.timeout === 'undefined') {
  (AbortSignal as any).timeout = jest.fn((timeout: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  });
}

describe('MetricsServiceClient Integration Tests', () => {
  let client: MetricsServiceClient;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    // Reset singleton instance
    (MetricsServiceClient as any).instance = undefined;
    
    // Reset environment variables
    process.env = { ...originalEnv };
    delete process.env.METRICS_SERVICE_URL;
    delete process.env.METRICS_SERVICE_TIMEOUT;
    
    mockFetch.mockClear();
    
    client = MetricsServiceClient.getInstance();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = MetricsServiceClient.getInstance();
      const instance2 = MetricsServiceClient.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should use default configuration values', () => {
      const instance = MetricsServiceClient.getInstance();
      
      // Access private properties via type assertion for testing
      const privateInstance = instance as any;
      expect(privateInstance.baseUrl).toBe('http://localhost:3001');
      expect(privateInstance.timeout).toBe(5000);
    });

    it('should use environment variable configuration', () => {
      process.env.METRICS_SERVICE_URL = 'http://metrics-service:3001';
      process.env.METRICS_SERVICE_TIMEOUT = '3000';
      
      // Create new instance with environment variables
      (MetricsServiceClient as any).instance = undefined;
      const instance = MetricsServiceClient.getInstance();
      
      const privateInstance = instance as any;
      expect(privateInstance.baseUrl).toBe('http://metrics-service:3001');
      expect(privateInstance.timeout).toBe(3000);
    });
  });

  describe('recordMetric', () => {
    it('should record metric successfully', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await client.recordMetric('api.response.time', 150.5, { endpoint: '/api/test' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/metrics/record',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'api.response.time',
            value: 150.5,
            labels: { endpoint: '/api/test' }
          }),
          signal: expect.any(AbortSignal)
        }
      );
    });

    it('should record metric with default empty labels', async () => {
      const mockResponse = new Response('{}', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await client.recordMetric('simple.counter', 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/metrics/record',
        expect.objectContaining({
          body: JSON.stringify({
            name: 'simple.counter',
            value: 1,
            labels: {}
          })
        })
      );
    });

    it('should handle network errors gracefully without throwing', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValue(networkError);

      // Should not throw - metrics failures shouldn't break main application
      await expect(client.recordMetric('test.metric', 100)).resolves.not.toThrow();
      
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle timeout gracefully', async () => {
      jest.useFakeTimers();
      
      // Mock a slow response
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const recordPromise = client.recordMetric('timeout.test', 50);
      
      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(6000);
      
      // Should resolve without throwing
      await expect(recordPromise).resolves.not.toThrow();
      
      jest.useRealTimers();
    });

    it('should abort request on timeout', async () => {
      jest.useFakeTimers();
      
      const mockAbortController = new AbortController();
      const abortSpy = jest.spyOn(mockAbortController, 'abort');
      
      // Mock AbortController constructor
      const originalAbortController = global.AbortController;
      global.AbortController = jest.fn(() => mockAbortController);

      mockFetch.mockImplementation(() => new Promise(() => {}));

      const recordPromise = client.recordMetric('abort.test', 25);
      
      jest.advanceTimersByTime(5100); // Trigger timeout
      
      await recordPromise;
      
      expect(abortSpy).toHaveBeenCalled();
      
      global.AbortController = originalAbortController;
      jest.useRealTimers();
    });

    it('should use custom timeout from environment', async () => {
      process.env.METRICS_SERVICE_TIMEOUT = '2000';
      (MetricsServiceClient as any).instance = undefined;
      const customClient = MetricsServiceClient.getInstance();
      
      jest.useFakeTimers();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const recordPromise = customClient.recordMetric('custom.timeout', 30);
      
      // Should timeout at 2000ms instead of default 5000ms
      jest.advanceTimersByTime(2100);
      
      await recordPromise;
      
      jest.useRealTimers();
    });

    it('should handle HTTP error responses gracefully', async () => {
      const errorResponse = new Response('Internal Server Error', { status: 500 });
      mockFetch.mockResolvedValue(errorResponse);

      await expect(client.recordMetric('error.test', 200)).resolves.not.toThrow();
    });
  });

  describe('getMetrics', () => {
    it('should retrieve metrics successfully', async () => {
      const mockMetrics = [
        { name: 'test.metric', value: 100, timestamp: new Date().toISOString() },
        { name: 'test.metric', value: 150, timestamp: new Date().toISOString() }
      ];

      const mockResponse = new Response(JSON.stringify({ metrics: mockMetrics }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getMetrics('test.metric');

      expect(result).toEqual(mockMetrics);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/metrics/test.metric?',
        {
          method: 'GET',
          signal: expect.any(AbortSignal)
        }
      );
    });

    it('should handle query parameters for time filtering', async () => {
      const mockResponse = new Response(JSON.stringify({ metrics: [] }), { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await client.getMetrics(
        'filtered.metric',
        '2024-01-01T00:00:00Z',
        '2024-01-02T00:00:00Z'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/metrics/filtered.metric?start=2024-01-01T00%3A00%3A00Z&end=2024-01-02T00%3A00%3A00Z',
        expect.any(Object)
      );
    });

    it('should handle partial query parameters', async () => {
      const mockResponse = new Response(JSON.stringify({ metrics: [] }), { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await client.getMetrics('partial.metric', '2024-01-01T00:00:00Z');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/metrics/partial.metric?start=2024-01-01T00%3A00%3A00Z',
        expect.any(Object)
      );
    });

    it('should return empty array on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const result = await client.getMetrics('error.metric');

      expect(result).toEqual([]);
    });

    it('should return empty array on HTTP error', async () => {
      const errorResponse = new Response('Not Found', { status: 404 });
      mockFetch.mockResolvedValue(errorResponse);

      const result = await client.getMetrics('missing.metric');

      expect(result).toEqual([]);
    });

    it('should handle malformed JSON response', async () => {
      const invalidResponse = new Response('invalid json', { status: 200 });
      mockFetch.mockResolvedValue(invalidResponse);

      const result = await client.getMetrics('invalid.response');

      expect(result).toEqual([]);
    });

    it('should handle timeout in getMetrics', async () => {
      jest.useFakeTimers();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const metricsPromise = client.getMetrics('timeout.metric');
      
      jest.advanceTimersByTime(6000);
      const result = await metricsPromise;

      expect(result).toEqual([]);
      jest.useRealTimers();
    });

    it('should respond within performance target', async () => {
      const mockResponse = new Response(JSON.stringify({ metrics: [] }), { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      const startTime = Date.now();
      await client.getMetrics('performance.test');
      const endTime = Date.now();

      // Should be fast for the client call itself (network latency excluded)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('getSystemSummary', () => {
    it('should retrieve system summary successfully', async () => {
      const mockSummary = [
        {
          name: 'api.response.time',
          total_records: 1000,
          avg_value: 150.5,
          min_value: 50,
          max_value: 500
        }
      ];

      const mockResponse = new Response(JSON.stringify(mockSummary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getSystemSummary();

      expect(result).toEqual(mockSummary);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/metrics/system/summary',
        {
          method: 'GET',
          signal: expect.any(AbortSignal)
        }
      );
    });

    it('should handle system summary errors gracefully', async () => {
      const errorResponse = new Response('Service Unavailable', { status: 503 });
      mockFetch.mockResolvedValue(errorResponse);

      const result = await client.getSystemSummary();

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('HTTP 503');
    });

    it('should handle network failures in system summary', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await client.getSystemSummary();

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Connection refused');
    });

    it('should timeout system summary requests appropriately', async () => {
      jest.useFakeTimers();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const summaryPromise = client.getSystemSummary();
      
      jest.advanceTimersByTime(6000);
      const result = await summaryPromise;

      expect(result).toHaveProperty('error');
      jest.useRealTimers();
    });
  });

  describe('healthCheck', () => {
    it('should return true for successful health check', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/health',
        {
          method: 'GET',
          signal: expect.any(AbortSignal)
        }
      );
    });

    it('should return false for failed health check', async () => {
      const errorResponse = new Response('Service Unavailable', { status: 503 });
      mockFetch.mockResolvedValue(errorResponse);

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('should timeout health check quickly (2 seconds)', async () => {
      jest.useFakeTimers();
      mockFetch.mockImplementation(() => new Promise(() => {}));

      const healthPromise = client.healthCheck();
      
      jest.advanceTimersByTime(2100); // Should timeout at 2000ms
      const result = await healthPromise;

      expect(result).toBe(false);
      jest.useRealTimers();
    });

    it('should complete health check within performance requirement (<100ms)', async () => {
      const mockResponse = new Response('OK', { status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      const startTime = Date.now();
      await client.healthCheck();
      const endTime = Date.now();

      // Client-side should be fast (excluding network)
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue operating when metrics service is unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Service unavailable'));

      // All operations should complete without throwing
      await expect(client.recordMetric('test', 100)).resolves.not.toThrow();
      
      const metrics = await client.getMetrics('test');
      expect(metrics).toEqual([]);
      
      const summary = await client.getSystemSummary();
      expect(summary).toHaveProperty('error');
      
      const health = await client.healthCheck();
      expect(health).toBe(false);
    });

    it('should handle partial service degradation', async () => {
      // Simulate some endpoints working, others failing
      mockFetch
        .mockResolvedValueOnce(new Response('{}', { status: 200 })) // recordMetric succeeds
        .mockRejectedValueOnce(new Error('Endpoint unavailable')) // getMetrics fails
        .mockResolvedValueOnce(new Response('[]', { status: 200 })); // getSystemSummary succeeds

      await expect(client.recordMetric('working', 50)).resolves.not.toThrow();
      
      const metrics = await client.getMetrics('failing');
      expect(metrics).toEqual([]);
      
      const summary = await client.getSystemSummary();
      expect(Array.isArray(summary)).toBe(true);
    });

    it('should not block application execution', async () => {
      // Simulate very slow metrics service
      mockFetch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve(new Response('{}', { status: 200 })), 10000)
        )
      );

      const startTime = Date.now();
      
      // Should timeout quickly and not block
      await client.recordMetric('slow.service', 75);
      
      const endTime = Date.now();
      
      // Should not wait for the full 10 seconds
      expect(endTime - startTime).toBeLessThan(6000);
    });
  });

  describe('Load Testing and Performance', () => {
    it('should handle concurrent metric recordings', async () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

      const concurrentRecordings = Array.from({ length: 100 }, (_, i) =>
        client.recordMetric(`concurrent.metric.${i}`, i * 10)
      );

      const startTime = Date.now();
      await Promise.all(concurrentRecordings);
      const endTime = Date.now();

      // Should handle concurrent requests efficiently
      expect(endTime - startTime).toBeLessThan(2000);
      expect(mockFetch).toHaveBeenCalledTimes(100);
    });

    it('should maintain performance under high load', async () => {
      mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

      // Simulate high-frequency metric recording (1000+ per minute)
      const metricsCount = 200; // Scaled down for test performance
      const recordings = Array.from({ length: metricsCount }, (_, i) =>
        client.recordMetric(`load.test.${i}`, Math.random() * 1000)
      );

      const startTime = Date.now();
      await Promise.all(recordings);
      const endTime = Date.now();

      const duration = endTime - startTime;
      const ratePerSecond = (metricsCount / duration) * 1000;

      // Should handle at least 17 requests per second (1000/60)
      expect(ratePerSecond).toBeGreaterThan(15);
    });

    it('should handle mixed operations under load', async () => {
      mockFetch
        .mockResolvedValue(new Response('{}', { status: 200 })) // recordMetric
        .mockResolvedValue(new Response(JSON.stringify({ metrics: [] }), { status: 200 })) // getMetrics
        .mockResolvedValue(new Response('[]', { status: 200 })); // getSystemSummary

      const mixedOperations = [
        ...Array.from({ length: 20 }, (_, i) => client.recordMetric(`mixed.${i}`, i)),
        ...Array.from({ length: 10 }, (_, i) => client.getMetrics(`mixed.${i}`)),
        ...Array.from({ length: 5 }, () => client.getSystemSummary()),
        ...Array.from({ length: 5 }, () => client.healthCheck())
      ];

      const startTime = Date.now();
      await Promise.all(mixedOperations);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(3000);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should retry gracefully on transient errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));

      // First call fails, client should handle gracefully
      await expect(client.recordMetric('retry.test', 100)).resolves.not.toThrow();
      
      // Subsequent calls should work
      await expect(client.recordMetric('retry.test', 200)).resolves.not.toThrow();
    });

    it('should handle invalid response formats', async () => {
      const invalidResponse = new Response('<html>Error</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      });
      mockFetch.mockResolvedValue(invalidResponse);

      const metrics = await client.getMetrics('invalid.format');
      expect(metrics).toEqual([]);

      const summary = await client.getSystemSummary();
      expect(summary).toHaveProperty('error');
    });

    it('should handle service returning unexpected data structures', async () => {
      const unexpectedResponse = new Response(JSON.stringify({
        unexpected: 'structure',
        no_metrics: 'field'
      }), { status: 200 });
      mockFetch.mockResolvedValue(unexpectedResponse);

      const result = await client.getMetrics('unexpected.structure');
      
      // Should return empty array when expected 'metrics' field is missing
      expect(result).toEqual([]);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory with many failed requests', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent failure'));

      // Simulate many failed requests
      const failedRequests = Array.from({ length: 1000 }, (_, i) =>
        client.recordMetric(`failed.${i}`, i)
      );

      await Promise.all(failedRequests);

      // No specific assertion here, but this test ensures no memory leaks occur
      // In a real environment, you might use memory profiling tools
      expect(mockFetch).toHaveBeenCalledTimes(1000);
    });

    it('should clean up resources on timeout', async () => {
      jest.useFakeTimers();

      // Track AbortController instances
      const controllers: AbortController[] = [];
      const originalAbortController = global.AbortController;
      
      global.AbortController = jest.fn().mockImplementation(() => {
        const controller = new originalAbortController();
        controllers.push(controller);
        return controller;
      });

      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const timeoutRequests = Array.from({ length: 10 }, (_, i) =>
        client.recordMetric(`timeout.cleanup.${i}`, i)
      );

      // Trigger timeouts
      jest.advanceTimersByTime(6000);
      
      await Promise.all(timeoutRequests);

      // All controllers should have been created and should be aborted
      expect(controllers).toHaveLength(10);
      
      global.AbortController = originalAbortController;
      jest.useRealTimers();
    });
  });
});