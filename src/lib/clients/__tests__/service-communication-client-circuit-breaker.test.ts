/**
 * Service Communication Client - Circuit Breaker Integration Tests
 * 
 * Focused tests for circuit breaker functionality including:
 * - Circuit breaker state transitions
 * - Failure threshold management
 * - Half-open state recovery
 * - Service-specific circuit breaker configuration
 * - Circuit breaker bypass scenarios
 * - Metrics recording for circuit breaker events
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

describe('ServiceCommunicationClient - Circuit Breaker Integration', () => {
  let client: ServiceCommunicationClient;
  let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
  let mockMetricsClient: jest.Mocked<MetricsServiceClient>;

  const mockServices: ServiceInfo[] = [
    {
      name: 'test-service-low-threshold',
      url: 'http://localhost:3001',
      health: 'healthy',
      version: '1.0.0',
      lastCheck: new Date(),
      metadata: {
        timeout: 5000,
        retries: 2,
        circuitBreakerThreshold: 2, // Low threshold for testing
        priority: 1
      }
    },
    {
      name: 'test-service-high-threshold',
      url: 'http://localhost:3002',
      health: 'healthy',
      version: '1.0.0',
      lastCheck: new Date(),
      metadata: {
        timeout: 3000,
        retries: 3,
        circuitBreakerThreshold: 5, // Higher threshold
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

  describe('Circuit Breaker State Management', () => {
    it('should start with all circuit breakers in closed state', () => {
      const status = client.getCircuitBreakerStatus();
      
      expect(status['test-service-low-threshold']).toEqual({
        state: 'closed',
        failures: 0,
        lastFailureTime: null,
        nextRetryTime: null
      });
      
      expect(status['test-service-high-threshold']).toEqual({
        state: 'closed',
        failures: 0,
        lastFailureTime: null,
        nextRetryTime: null
      });
    });

    it('should transition to open state after reaching failure threshold', async () => {
      const serviceName = 'test-service-low-threshold';
      
      // Cause failures to reach threshold (2)
      mockFetch.mockRejectedValue(new Error('Service unavailable'));
      
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected to fail
        }
      }

      const status = client.getCircuitBreakerStatus();
      expect(status[serviceName].state).toBe('open');
      expect(status[serviceName].failures).toBe(2);
      expect(status[serviceName].lastFailureTime).toBeInstanceOf(Date);
      expect(status[serviceName].nextRetryTime).toBeInstanceOf(Date);
    });

    it('should respect different thresholds for different services', async () => {
      mockFetch.mockRejectedValue(new Error('Service error'));
      
      // Low threshold service should open after 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await client.get('test-service-low-threshold', `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }
      
      // High threshold service should still be closed after 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await client.get('test-service-high-threshold', `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      const status = client.getCircuitBreakerStatus();
      expect(status['test-service-low-threshold'].state).toBe('open');
      expect(status['test-service-high-threshold'].state).toBe('closed');
    });

    it('should block requests when circuit breaker is open', async () => {
      const serviceName = 'test-service-low-threshold';
      
      // Open the circuit breaker
      mockFetch.mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      // Clear fetch mock to verify no requests are made
      mockFetch.mockClear();

      // This request should be blocked by circuit breaker
      await expect(client.get(serviceName, '/api/blocked'))
        .rejects.toThrow('Circuit breaker is open');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should record circuit breaker state change metrics', async () => {
      const serviceName = 'test-service-low-threshold';
      
      mockFetch.mockRejectedValue(new Error('Service error'));
      
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
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
          to_state: 'open',
          failure_count: 2,
          threshold: 2
        })
      );
    });
  });

  describe('Half-Open State and Recovery', () => {
    it('should transition to half-open state after reset timeout', async () => {
      jest.useFakeTimers();
      
      const serviceName = 'test-service-low-threshold';
      
      // Open circuit breaker
      mockFetch.mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      expect(client.getCircuitBreakerStatus()[serviceName].state).toBe('open');

      // Fast forward past the reset timeout (default 30 seconds)
      jest.advanceTimersByTime(31000);

      // Circuit breaker should now be in half-open state internally
      // Next request should be allowed through
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ recovered: true })
      } as Response);

      const result = await client.get(serviceName, '/api/recovery');

      expect(result).toEqual({ recovered: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(client.getCircuitBreakerStatus()[serviceName].state).toBe('closed');

      jest.useRealTimers();
    });

    it('should record recovery metrics when circuit breaker closes', async () => {
      jest.useFakeTimers();
      
      const serviceName = 'test-service-low-threshold';
      
      // Open circuit breaker
      mockFetch.mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      jest.advanceTimersByTime(31000);

      // Clear previous metrics calls
      mockMetricsClient.recordMetric.mockClear();

      // Successful recovery request
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      await client.get(serviceName, '/api/recovery');

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.circuit_breaker.state_change',
        1,
        expect.objectContaining({
          service: serviceName,
          from_state: 'open',
          to_state: 'closed'
        })
      );

      jest.useRealTimers();
    });

    it('should reopen circuit breaker if recovery request fails', async () => {
      jest.useFakeTimers();
      
      const serviceName = 'test-service-low-threshold';
      
      // Open circuit breaker
      mockFetch.mockRejectedValue(new Error('Initial failure'));
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      jest.advanceTimersByTime(31000);

      // Recovery attempt fails
      mockFetch.mockClear();
      mockFetch.mockRejectedValueOnce(new Error('Still failing'));

      try {
        await client.get(serviceName, '/api/failed-recovery', { retries: 0 });
      } catch (error) {
        // Expected
      }

      // Circuit breaker should be open again
      const status = client.getCircuitBreakerStatus();
      expect(status[serviceName].state).toBe('open');

      jest.useRealTimers();
    });
  });

  describe('Circuit Breaker Configuration and Bypass', () => {
    it('should allow bypassing circuit breaker when disabled in options', async () => {
      const serviceName = 'test-service-low-threshold';
      
      // Open circuit breaker
      mockFetch.mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      expect(client.getCircuitBreakerStatus()[serviceName].state).toBe('open');

      // Request with circuit breaker disabled should go through
      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ bypassed: true })
      } as Response);

      const result = await client.get(serviceName, '/api/bypass', {
        circuitBreaker: false
      });

      expect(result).toEqual({ bypassed: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Circuit breaker state should not change
      expect(client.getCircuitBreakerStatus()[serviceName].state).toBe('open');
    });

    it('should reset failure count on successful requests', async () => {
      const serviceName = 'test-service-low-threshold';
      
      // Cause one failure (below threshold)
      mockFetch.mockRejectedValueOnce(new Error('Single failure'));
      
      try {
        await client.get(serviceName, '/api/single-fail', { retries: 0 });
      } catch (error) {
        // Expected
      }

      expect(client.getCircuitBreakerStatus()[serviceName].failures).toBe(1);

      // Successful request should reset failure count
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ success: true })
      } as Response);

      await client.get(serviceName, '/api/success');

      expect(client.getCircuitBreakerStatus()[serviceName].failures).toBe(0);
      expect(client.getCircuitBreakerStatus()[serviceName].state).toBe('closed');
    });

    it('should handle concurrent requests with circuit breaker properly', async () => {
      const serviceName = 'test-service-low-threshold';
      
      // Open circuit breaker
      mockFetch.mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      mockFetch.mockClear();

      // Multiple concurrent requests should all be rejected
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        client.get(serviceName, `/api/concurrent-${i}`)
          .catch(error => error.message)
      );

      const results = await Promise.all(concurrentRequests);

      // All should be blocked by circuit breaker
      results.forEach(result => {
        expect(result).toBe('Circuit breaker is open');
      });

      // No actual network requests should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker Metrics and Monitoring', () => {
    it('should record detailed failure metrics', async () => {
      const serviceName = 'test-service-low-threshold';
      
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
      
      try {
        await client.get(serviceName, '/api/metric-test', { retries: 0 });
      } catch (error) {
        // Expected
      }

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.circuit_breaker.failure',
        1,
        expect.objectContaining({
          service: serviceName,
          failure_count: 1,
          threshold: 2,
          error_type: 'Error'
        })
      );
    });

    it('should record blocked request metrics', async () => {
      const serviceName = 'test-service-low-threshold';
      
      // Open circuit breaker
      mockFetch.mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      // Clear previous metrics
      mockMetricsClient.recordMetric.mockClear();

      // Blocked request
      try {
        await client.get(serviceName, '/api/blocked');
      } catch (error) {
        // Expected
      }

      expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
        'service_communication.circuit_breaker.blocked',
        1,
        expect.objectContaining({
          service: serviceName,
          state: 'open'
        })
      );
    });

    it('should provide comprehensive circuit breaker status', () => {
      const status = client.getCircuitBreakerStatus();
      
      // Should include all registered services
      expect(Object.keys(status)).toEqual([
        'test-service-low-threshold',
        'test-service-high-threshold'
      ]);

      // Each status should have complete information
      Object.values(status).forEach(serviceStatus => {
        expect(serviceStatus).toHaveProperty('state');
        expect(serviceStatus).toHaveProperty('failures');
        expect(serviceStatus).toHaveProperty('lastFailureTime');
        expect(serviceStatus).toHaveProperty('nextRetryTime');
      });
    });

    it('should track circuit breaker health over time', async () => {
      const serviceName = 'test-service-low-threshold';
      
      // Simulate multiple failure and recovery cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // Cause failures to open circuit breaker
        mockFetch.mockRejectedValue(new Error(`Cycle ${cycle} failure`));
        for (let i = 0; i < 2; i++) {
          try {
            await client.get(serviceName, `/api/cycle-${cycle}-fail-${i}`, { retries: 0 });
          } catch (error) {
            // Expected
          }
        }

        jest.useFakeTimers();
        jest.advanceTimersByTime(31000);

        // Recovery
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ cycle, recovered: true })
        } as Response);

        await client.get(serviceName, `/api/cycle-${cycle}-recovery`);

        jest.useRealTimers();
      }

      // Should have recorded multiple state changes
      const stateChangeCall
= mockMetricsClient.recordMetric.mock.calls
        .filter(call => call[0] === 'service_communication.circuit_breaker.state_change');

      expect(stateChangeCall.length).toBeGreaterThanOrEqual(6); // 3 open + 3 close
    });
  });

  describe('Error Scenarios and Edge Cases', () => {
    it('should handle circuit breaker with zero threshold gracefully', async () => {
      // Mock a service with zero threshold (should never open)
      const zeroThresholdService: ServiceInfo = {
        name: 'zero-threshold-service',
        url: 'http://localhost:3004',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: new Date(),
        metadata: {
          timeout: 5000,
          retries: 2,
          circuitBreakerThreshold: 0,
          priority: 1
        }
      };

      mockServiceRegistry.getService.mockImplementation((name: string) => {
        if (name === 'zero-threshold-service') return zeroThresholdService;
        return mockServices.find(s => s.name === name) || null;
      });

      // Reinitialize client to pick up new service
      (ServiceCommunicationClient as any).instance = null;
      client = ServiceCommunicationClient.getInstance();

      mockFetch.mockRejectedValue(new Error('Service error'));

      // Multiple failures should not open circuit breaker
      for (let i = 0; i < 10; i++) {
        try {
          await client.get('zero-threshold-service', `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      const status = client.getCircuitBreakerStatus();
      expect(status['zero-threshold-service'].state).toBe('closed');
    });

    it('should handle service removal from registry', async () => {
      const serviceName = 'test-service-low-threshold';
      
      // Service exists initially
      expect(client.getCircuitBreakerStatus()[serviceName]).toBeDefined();

      // Remove service from registry
      mockServiceRegistry.getService.mockImplementation((name: string) => {
        if (name === serviceName) return null;
        return mockServices.find(s => s.name === name) || null;
      });

      // Request should fail with service not found
      await expect(client.get(serviceName, '/api/removed'))
        .rejects.toThrow('Service not found');

      // Circuit breaker status should still exist (not cleaned up)
      expect(client.getCircuitBreakerStatus()[serviceName]).toBeDefined();
    });

    it('should handle very rapid successive failures', async () => {
      const serviceName = 'test-service-low-threshold';
      
      mockFetch.mockRejectedValue(new Error('Rapid failure'));

      // Submit many requests rapidly
      const rapidRequests = Array.from({ length: 10 }, (_, i) =>
        client.get(serviceName, `/api/rapid-${i}`, { retries: 0 })
          .catch(error => ({ index: i, error: error.message }))
      );

      const results = await Promise.all(rapidRequests);

      // Circuit breaker should open after threshold
      const status = client.getCircuitBreakerStatus();
      expect(status[serviceName].state).toBe('open');

      // Some requests should be blocked by circuit breaker
      const blockedRequests = results.filter(result => 
        result.error === 'Circuit breaker is open'
      );
      expect(blockedRequests.length).toBeGreaterThan(0);
    });

    it('should handle circuit breaker timeout calculation correctly', async () => {
      jest.useFakeTimers();
      const serviceName = 'test-service-low-threshold';
      
      // Open circuit breaker
      mockFetch.mockRejectedValue(new Error('Service down'));
      for (let i = 0; i < 2; i++) {
        try {
          await client.get(serviceName, `/api/fail-${i}`, { retries: 0 });
        } catch (error) {
          // Expected
        }
      }

      const status = client.getCircuitBreakerStatus();
      const nextRetryTime = status[serviceName].nextRetryTime;
      
      expect(nextRetryTime).toBeInstanceOf(Date);
      expect(nextRetryTime!.getTime()).toBeGreaterThan(Date.now());

      // Verify timeout is approximately 30 seconds
      const timeoutDuration = nextRetryTime!.getTime() - Date.now();
      expect(timeoutDuration).toBeCloseTo(30000, -2); // Within 100ms

      jest.useRealTimers();
    });
  });
});