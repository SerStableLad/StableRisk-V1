/**
 * Service Communication Client - Comprehensive Test Suite
 * 
 * Tests for the Service Communication Client covering all Task 8 requirements:
 * - Singleton pattern and initialization
 * - Service discovery and circuit breaker setup
 * - HTTP method operations (GET, POST, PUT, DELETE)
 * - Retry logic and error handling
 * - Circuit breaker integration
 * - Timeout and AbortController functionality
 * - Metrics recording
 * - Health checking functionality
 * - Request/response handling for different content types
 * - Edge cases and error scenarios
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

// Mock AbortController for timeout tests
const mockAbortController = {
  abort: jest.fn(),
  signal: { aborted: false } as AbortSignal
};

// Mock setTimeout and clearTimeout for timeout handling
const mockSetTimeout = jest.fn((callback: Function, delay: number) => {
  return setTimeout(callback, delay);
});
const mockClearTimeout = jest.fn();
global.setTimeout = mockSetTimeout;
global.clearTimeout = mockClearTimeout;

describe('ServiceCommunicationClient', () => {
  let client: ServiceCommunicationClient;
  let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
  let mockMetricsClient: jest.Mocked<MetricsServiceClient>;

  const mockServices: ServiceInfo[] = [
    {
      name: 'metrics-service',
      url: 'http://localhost:3001',
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
      url: 'http://localhost:3002',
      health: 'healthy',
      version: '1.0.0',
      lastCheck: new Date(),
      metadata: {
        timeout: 2000,
        retries: 2,
        circuitBreakerThreshold: 3,
        priority: 2
      }
    },
    {
      name: 'background-jobs-service',
      url: 'http://localhost:3003',
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

  beforeEach(() => {
    // Reset singleton instance
    (ServiceCommunicationClient as any).instance = null;
    
    // Reset mocks
    jest.clearAllMocks();
    mockFetch.mockClear();
    mockSetTimeout.mockClear();
    mockClearTimeout.mockClear();
    
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
    
    // Mock AbortController
    global.AbortController = jest.fn(() => mockAbortController) as any;
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Singleton Pattern and Initialization', () => {
    it('should implement singleton pattern correctly', () => {
      const instance1 = ServiceCommunicationClient.getInstance();
      const instance2 = ServiceCommunicationClient.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ServiceCommunicationClient);
    });

    it('should initialize with ServiceRegistry integration', () => {
      client = ServiceCommunicationClient.getInstance();
      
      expect(ServiceRegistry.getInstance).toHaveBeenCalled();
      expect(mockServiceRegistry.getAllServices).toHaveBeenCalled();
    });

    it('should initialize with MetricsServiceClient integration', () => {
      client = ServiceCommunicationClient.getInstance();
      
      expect(MetricsServiceClient.getInstance).toHaveBeenCalled();
    });

    it('should set up circuit breakers for each service from registry', () => {
      client = ServiceCommunicationClient.getInstance();
      
      const circuitBreakerStatus = client.getCircuitBreakerStatus();
      
      expect(circuitBreakerStatus).toHaveProperty('metrics-service');
      expect(circuitBreakerStatus).toHaveProperty('cache-service');
      expect(circuitBreakerStatus).toHaveProperty('background-jobs-service');
      
      // Each circuit breaker should start in closed state
      Object.values(circuitBreakerStatus).forEach(status => {
        expect(status).toEqual({
          state: 'closed',
          failures: 0,
          lastFailureTime: null,
          nextRetryTime: null
        });
      });
    });

    it('should initialize circuit breakers with service-specific thresholds', () => {
      client = ServiceCommunicationClient.getInstance();
      
      // Access private circuit breakers for testing
      const circuitBreakers = (client as any).circuitBreakers;
      
      expect(circuitBreakers.get('metrics-service').threshold).toBe(5);
      expect(circuitBreakers.get('cache-service').threshold).toBe(3);
      expect(circuitBreakers.get('background-jobs-service').threshold).toBe(5);
    });
  });

  describe('HTTP Method Operations', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    describe('GET Method', () => {
      it('should perform GET request successfully', async () => {
        const mockResponse = { data: 'test response' };
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => mockResponse
        } as Response);

        const result = await client.get('metrics-service', '/api/data');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/data',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Accept': 'application/json',
              'User-Agent': expect.stringContaining('StableRisk-ServiceClient'),
              'X-Request-ID': expect.any(String),
              'X-Service-Name': 'metrics-service'
            }),
            signal: expect.any(Object)
          })
        );

        expect(result).toEqual(mockResponse);
      });

      it('should handle GET request with query parameters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({})
        } as Response);

        await client.get('cache-service', '/api/search?q=test&limit=10');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3002/api/search?q=test&limit=10',
          expect.any(Object)
        );
      });
    });

    describe('POST Method', () => {
      it('should perform POST request with JSON body', async () => {
        const requestData = { key: 'value', timestamp: new Date() };
        const mockResponse = { id: '123', status: 'created' };
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => mockResponse
        } as Response);

        const result = await client.post('background-jobs-service', '/api/jobs', requestData);

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3003/api/jobs',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }),
            body: JSON.stringify(requestData),
            signal: expect.any(Object)
          })
        );

        expect(result).toEqual(mockResponse);
      });

      it('should handle POST request with custom headers', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({})
        } as Response);

        await client.post('metrics-service', '/api/custom', {}, {
          headers: { 'X-Custom-Header': 'custom-value' }
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom-Header': 'custom-value'
            })
          })
        );
      });
    });

    describe('PUT Method', () => {
      it('should perform PUT request for updates', async () => {
        const updateData = { name: 'updated', version: '2.0' };
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => updateData
        } as Response);

        const result = await client.put('cache-service', '/api/config/123', updateData);

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3002/api/config/123',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify(updateData)
          })
        );

        expect(result).toEqual(updateData);
      });
    });

    describe('DELETE Method', () => {
      it('should perform DELETE request', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 204,
          headers: new Map(),
          text: async () => ''
        } as Response);

        const result = await client.delete('background-jobs-service', '/api/jobs/123');

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3003/api/jobs/123',
          expect.objectContaining({
            method: 'DELETE'
          })
        );

        expect(result).toBe('');
      });

      it('should handle DELETE with query parameters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ deleted: 5 })
        } as Response);

        await client.delete('cache-service', '/api/cache', {
          headers: { 'X-Force-Delete': 'true' }
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3002/api/cache',
          expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({
              'X-Force-Delete': 'true'
            })
          })
        );
      });
    });

    describe('Generic request() Method', () => {
      it('should support request method with custom options', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ success: true })
        } as Response);

        const result = await client.request('metrics-service', '/api/custom', {
          method: 'PATCH',
          body: { update: 'data' },
          timeout: 3000,
          retries: 2,
          retryDelay: 500,
          circuitBreaker: true,
          headers: { 'X-Patch-Version': '1.0' }
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/custom',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ update: 'data' }),
            headers: expect.objectContaining({
              'X-Patch-Version': '1.0'
            })
          })
        );

        expect(result).toEqual({ success: true });
      });
    });
  });

  describe('Retry Logic and Error Handling', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    it('should retry failed requests according to service configuration', async () => {
      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ success: true })
        } as Response);

      const result = await client.get('metrics-service', '/api/retry-test');

      expect(mockFetch).toHaveBeenCalledTimes(3); // Service has retries: 3
      expect(result).toEqual({ success: true });
    });

    it('should respect custom retry configuration in request options', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ retry: 'success' })
        } as Response);

      const result = await client.request('cache-service', '/api/test', {
        retries: 1, // Override service default of 2
        retryDelay: 100
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ retry: 'success' });
    });

    it('should handle non-retryable 4xx errors correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map()
      } as Response);

      await expect(client.get('metrics-service', '/api/missing'))
        .rejects.toThrow('HTTP 404: Not Found');

      // Should not retry 4xx errors
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry 5xx server errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable'
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ recovered: true })
        } as Response);

      const result = await client.get('metrics-service', '/api/server-error');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ recovered: true });
    });

    it('should implement exponential backoff for retries', async () => {
      jest.useFakeTimers();

      mockFetch
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ success: true })
        } as Response);

      const requestPromise = client.request('metrics-service', '/api/backoff', {
        retries: 3,
        retryDelay: 100
      });

      // Fast forward through retry delays
      jest.advanceTimersByTime(500);

      const result = await requestPromise;

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });
  });

  describe('Circuit Breaker Integration', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    it('should open circuit breaker after threshold failures', async () => {
      const serviceName = 'cache-service'; // threshold: 3
      
      // Cause 3 failures to open circuit breaker
      for (let i = 0; i < 3; i++) {
        mockFetch.mockRejectedValueOnce(new Error(`Network error ${i + 1}`));
        
        try {
          await client.get(serviceName, `/api/test-${i}`);
        } catch (error) {
          // Expected to fail
        }
      }

      const status = client.getCircuitBreakerStatus();
      expect(status[serviceName].state).toBe('open');
      expect(status[serviceName].failures).toBe(3);

      // Next request should fail immediately without calling fetch
      mockFetch.mockClear();
      
      await expect(client.get(serviceName, '/api/blocked'))
        .rejects.toThrow('Circuit breaker is open');
      
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should transition to half-open state after reset timeout', async () => {
      jest.useFakeTimers();
      
      const serviceName = 'cache-service';
      
      // Open circuit breaker
      for (let i = 0; i < 3; i++) {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        try {
          await client.get(serviceName, `/api/fail-${i}`);
        } catch (error) {
          // Expected
        }
      }

      expect(client.getCircuitBreakerStatus()[serviceName].state).toBe('open');

      // Fast forward past reset timeout (30 seconds default)
      jest.advanceTimersByTime(31000);

      // Next request should transition to half-open
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ recovered: true })
      } as Response);

      const result = await client.get(serviceName, '/api/recovery');

      expect(result).toEqual({ recovered: true });
      expect(client.getCircuitBreakerStatus()[serviceName].state).toBe('closed');

      jest.useRealTimers();
    });

    it('should disable circuit breaker when circuitBreaker option is false', async () => {
      mockFetch.mockRejectedValue(new Error('Persistent error'));

      // Make many requests with circuit breaker disabled
      for (let i = 0; i < 5; i++) {
        try {
          await client.request('cache-service', `/api/test-${i}`, {
            circuitBreaker: false,
            retries: 0
          });
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit breaker should remain closed
      const status = client.getCircuitBreakerStatus();
      expect(status['cache-service'].state).toBe('closed');
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('should record circuit breaker state changes in metrics', async () => {
      const serviceName = 'cache-service';
      
      // Cause circuit breaker to open
      for (let i = 0; i < 3; i++) {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        try {
          await client.get(serviceName, `/api/fail-${i}`);
        } catch (error) {
          // Expected
        }
      }

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.circuit_breaker.state_change',
        1,
        expect.objectContaining({
          service: serviceName,
          from_state: 'closed',
          to_state: 'open'
        })
      );
    });
  });

  describe('Timeout and AbortController Functionality', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    it('should respect service-specific timeout settings', async () => {
      const abortSpy = jest.spyOn(mockAbortController, 'abort');
      
      mockFetch.mockImplementationOnce(() => 
        new Promise(() => {}) // Never resolves
      );

      const timeoutPromise = client.get('cache-service', '/api/slow');

      // Simulate timeout for cache-service (2000ms)
      const timeoutCall = mockSetTimeout.mock.calls.find(call => call[1] === 2000);
      expect(timeoutCall).toBeDefined();
      
      if (timeoutCall) {
        timeoutCall[0](); // Execute timeout callback
      }

      await expect(timeoutPromise).rejects.toThrow('Request timeout');
      expect(abortSpy).toHaveBeenCalled();
    });

    it('should respect custom timeout in request options', async () => {
      const abortSpy = jest.spyOn(mockAbortController, 'abort');
      
      mockFetch.mockImplementationOnce(() => 
        new Promise(() => {}) // Never resolves
      );

      const timeoutPromise = client.request('metrics-service', '/api/custom-timeout', {
        timeout: 1000 // Custom timeout
      });

      // Check that custom timeout was used
      const timeoutCall = mockSetTimeout.mock.calls.find(call => call[1] === 1000);
      expect(timeoutCall).toBeDefined();
      
      if (timeoutCall) {
        timeoutCall[0](); // Execute timeout callback
      }

      await expect(timeoutPromise).rejects.toThrow('Request timeout');
      expect(abortSpy).toHaveBeenCalled();
    });

    it('should clean up timeout when request completes successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      await client.get('metrics-service', '/api/quick');

      // Should have called clearTimeout to clean up
      expect(mockClearTimeout).toHaveBeenCalled();
    });

    it('should handle AbortError correctly', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(client.get('metrics-service', '/api/aborted'))
        .rejects.toThrow('Request timeout');
    });

    it('should create unique AbortController for each request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({})
      } as Response);

      await Promise.all([
        client.get('metrics-service', '/api/1'),
        client.get('cache-service', '/api/2'),
        client.get('background-jobs-service', '/api/3')
      ]);

      expect(global.AbortController).toHaveBeenCalledTimes(3);
    });
  });

  describe('Metrics Recording', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    it('should record request duration metrics', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      await client.get('metrics-service', '/api/timed');

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.request.duration',
        expect.any(Number),
        expect.objectContaining({
          service: 'metrics-service',
          method: 'GET',
          path: '/api/timed',
          status: '200'
        })
      );
    });

    it('should record error metrics for failed requests', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      try {
        await client.get('cache-service', '/api/error', { retries: 0 });
      } catch (error) {
        // Expected to fail
      }

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.request.error',
        1,
        expect.objectContaining({
          service: 'cache-service',
          method: 'GET',
          path: '/api/error',
          error_type: 'NetworkError'
        })
      );
    });

    it('should record retry attempt metrics', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('First attempt'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ success: true })
        } as Response);

      await client.get('metrics-service', '/api/retry');

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.request.retry',
        1,
        expect.objectContaining({
          service: 'metrics-service',
          attempt: 2
        })
      );
    });

    it('should record circuit breaker metrics', async () => {
      // Open circuit breaker
      for (let i = 0; i < 3; i++) {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));
        try {
          await client.get('cache-service', `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.circuit_breaker.state_change',
        1,
        expect.objectContaining({
          service: 'cache-service',
          from_state: 'closed',
          to_state: 'open'
        })
      );
    });

    it('should handle metrics recording failures gracefully', async () => {
      mockMetricsClient.recordMetric.mockRejectedValueOnce(new Error('Metrics service down'));
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      // Request should still succeed even if metrics fail
      const result = await client.get('metrics-service', '/api/metrics-fail');
      expect(result).toEqual({ success: true });
    });
  });

  describe('Health Checking Functionality', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    it('should check health of all registered services', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map(),
        text: async () => 'OK'
      } as Response);

      const healthResults = await client.checkAllServices();

      expect(healthResults).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/health',
        expect.objectContaining({ method: 'GET' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/health',
        expect.objectContaining({ method: 'GET' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/health',
        expect.objectContaining({ method: 'GET' })
      );

      healthResults.forEach(result => {
        expect(result).toEqual({
          service: expect.any(String),
          healthy: true,
          responseTime: expect.any(Number),
          timestamp: expect.any(Date)
        });
      });
    });

    it('should handle mixed health check results', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'OK'
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable'
        } as Response)
        .mockRejectedValueOnce(new Error('Connection refused'));

      const healthResults = await client.checkAllServices();

      expect(healthResults).toHaveLength(3);
      expect(healthResults[0].healthy).toBe(true);
      expect(healthResults[1].healthy).toBe(false);
      expect(healthResults[2].healthy).toBe(false);
      expect(healthResults[2].error).toBe('Connection refused');
    });

    it('should respect health check timeouts', async () => {
      jest.useFakeTimers();
      
      mockFetch.mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );

      const healthPromise = client.checkAllServices();

      // Advance timers to trigger health check timeouts
      jest.advanceTimersByTime(5000);

      const results = await healthPromise;

      results.forEach(result => {
        expect(result.healthy).toBe(false);
        expect(result.error).toContain('timeout');
      });

      jest.useRealTimers();
    });

    it('should update ServiceRegistry with health check results', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'OK'
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 503
        } as Response)
        .mockRejectedValueOnce(new Error('Network error'));

      await client.checkAllServices();

      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('metrics-service', 'healthy');
      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('cache-service', 'degraded');
      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('background-jobs-service', 'unhealthy');
    });
  });

  describe('Request/Response Handling for Different Content Types', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    it('should handle JSON response correctly', async () => {
      const jsonData = { message: 'Hello', data: [1, 2, 3] };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json; charset=utf-8']]),
        json: async () => jsonData
      } as Response);

      const result = await client.get('metrics-service', '/api/json');
      expect(result).toEqual(jsonData);
    });

    it('should handle text response correctly', async () => {
      const textData = 'Plain text response';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/plain']]),
        text: async () => textData
      } as Response);

      const result = await client.get('cache-service', '/api/text');
      expect(result).toBe(textData);
    });

    it('should handle HTML response as text', async () => {
      const htmlData = '<html><body>Error Page</body></html>';
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        text: async () => htmlData
      } as Response);

      const result = await client.get('background-jobs-service', '/api/status');
      expect(result).toBe(htmlData);
    });

    it('should handle response with no content-type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map(),
        text: async () => 'No content type'
      } as Response);

      const result = await client.get('metrics-service', '/api/no-content-type');
      expect(result).toBe('No content type');
    });

    it('should handle empty responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Map(),
        text: async () => ''
      } as Response);

      const result = await client.delete('cache-service', '/api/item/123');
      expect(result).toBe('');
    });

    it('should handle malformed JSON gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => {
          throw new Error('Invalid JSON');
        },
        text: async () => 'malformed json content'
      } as Response);

      const result = await client.get('metrics-service', '/api/bad-json');
      expect(result).toBe('malformed json content');
    });

    it('should generate unique request IDs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({})
      } as Response);

      await Promise.all([
        client.get('metrics-service', '/api/1'),
        client.get('metrics-service', '/api/2'),
        client.get('metrics-service', '/api/3')
      ]);

      const requestIds = mockFetch.mock.calls.map(call => 
        call[1]?.headers?.['X-Request-ID']
      );

      // All request IDs should be unique
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(3);
      
      // Each ID should be a valid UUID format
      requestIds.forEach(id => {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });
    });

    it('should include proper service headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({})
      } as Response);

      await client.get('background-jobs-service', '/api/test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Service-Name': 'background-jobs-service',
            'User-Agent': expect.stringContaining('StableRisk-ServiceClient'),
            'Accept': 'application/json'
          })
        })
      );
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    it('should handle requests to non-existent services', async () => {
      await expect(client.get('non-existent-service', '/api/test'))
        .rejects.toThrow('Service not found: non-existent-service');
    });

    it('should handle empty service names', async () => {
      await expect(client.get('', '/api/test'))
        .rejects.toThrow('Service name is required');
    });

    it('should handle null/undefined service names', async () => {
      await expect(client.get(null as any, '/api/test'))
        .rejects.toThrow('Service name is required');
      
      await expect(client.get(undefined as any, '/api/test'))
        .rejects.toThrow('Service name is required');
    });

    it('should handle empty paths', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({})
      } as Response);

      await client.get('metrics-service', '');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001',
        expect.any(Object)
      );
    });

    it('should handle malformed service URLs in registry', async () => {
      const badService: ServiceInfo = {
        name: 'bad-service',
        url: 'invalid-url',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: new Date(),
        metadata: {
          timeout: 5000,
          retries: 3,
          circuitBreakerThreshold: 5,
          priority: 1
        }
      };

      mockServiceRegistry.getService.mockImplementation((name: string) => {
        if (name === 'bad-service') return badService;
        return mockServices.find(s => s.name === name) || null;
      });

      mockFetch.mockRejectedValueOnce(new TypeError('Invalid URL'));

      await expect(client.get('bad-service', '/api/test'))
        .rejects.toThrow('Invalid URL');
    });

    it('should handle very large request bodies', async () => {
      const largeData = {
        data: 'x'.repeat(1000000), // 1MB string
        array: new Array(10000).fill({ nested: 'object' })
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      const result = await client.post('background-jobs-service', '/api/large', largeData);

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(largeData)
        })
      );
    });

    it('should handle concurrent requests to the same service', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ concurrent: true })
      } as Response);

      const requests = Array.from({ length: 10 }, (_, i) =>
        client.get('metrics-service', `/api/concurrent/${i}`)
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(10);
      expect(mockFetch).toHaveBeenCalledTimes(10);
      results.forEach(result => {
        expect(result).toEqual({ concurrent: true });
      });
    });

    it('should handle requests with circular JSON objects', async () => {
      const circularObject: any = { name: 'circular' };
      circularObject.self = circularObject;

      await expect(client.post('metrics-service', '/api/circular', circularObject))
        .rejects.toThrow('Converting circular structure to JSON');
    });

    it('should handle network disconnection scenarios', async () => {
      const networkError = new Error('Network request failed');
      networkError.name = 'TypeError';
      mockFetch.mockRejectedValue(networkError);

      await expect(client.get('cache-service', '/api/network-test', { retries: 0 }))
        .rejects.toThrow('Network request failed');

      // Should trigger circuit breaker opening
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.request.error',
        1,
        expect.objectContaining({
          error_type: 'TypeError'
        })
      );
    });

    it('should handle service registry being unavailable', async () => {
      mockServiceRegistry.getService.mockReturnValue(null);

      await expect(client.get('metrics-service', '/api/test'))
        .rejects.toThrow('Service not found: metrics-service');
    });

    it('should provide detailed error information', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ error: 'Invalid input', details: 'Missing required field' })
      } as Response);

      try {
        await client.post('metrics-service', '/api/validation', { invalid: 'data' });
      } catch (error: any) {
        expect(error.message).toContain('HTTP 400: Bad Request');
        expect(error.response).toEqual({
          error: 'Invalid input',
          details: 'Missing required field'
        });
      }
    });

    it('should handle zero retry configuration', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Immediate failure'));

      await expect(client.request('metrics-service', '/api/no-retry', {
        retries: 0
      })).rejects.toThrow('Immediate failure');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle negative timeout values', async () => {
      await expect(client.request('metrics-service', '/api/negative', {
        timeout: -1000
      })).rejects.toThrow('Timeout must be a positive number');
    });
  });

  describe('Integration with ServiceRegistry and MetricsClient', () => {
    beforeEach(() => {
      client = ServiceCommunicationClient.getInstance();
    });

    it('should update service health based on request success/failure', async () => {
      // Successful request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      await client.get('metrics-service', '/api/success');

      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('metrics-service', 'healthy');

      // Failed request
      mockFetch.mockRejectedValueOnce(new Error('Service down'));

      try {
        await client.get('cache-service', '/api/failure', { retries: 0 });
      } catch (error) {
        // Expected
      }

      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('cache-service', 'unhealthy');
    });

    it('should record comprehensive metrics for all operations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ data: 'test' })
      } as Response);

      await client.post('background-jobs-service', '/api/metrics-test', { test: 'data' });

      // Should record multiple metrics
      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.request.duration',
        expect.any(Number),
        expect.any(Object)
      );

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.request.count',
        1,
        expect.objectContaining({
          service: 'background-jobs-service',
          method: 'POST'
        })
      );
    });

    it('should handle ServiceRegistry service updates during operation', async () => {
      // Update service URL in registry
      const updatedService = {
        ...mockServices[0],
        url: 'http://new-host:3001'
      };

      mockServiceRegistry.getService.mockImplementation((name: string) => {
        if (name === 'metrics-service') return updatedService;
        return mockServices.find(s => s.name === name) || null;
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({})
      } as Response);

      await client.get('metrics-service', '/api/updated');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://new-host:3001/api/updated',
        expect.any(Object)
      );
    });
  });
});