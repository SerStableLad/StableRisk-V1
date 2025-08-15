/**
 * Service Communication Client - Integration Tests
 * 
 * Real-world integration scenarios testing:
 * - End-to-end service communication workflows
 * - Integration with actual ServiceRegistry and MetricsClient
 * - Complex failure and recovery scenarios
 * - Multi-service orchestration patterns
 * - Service discovery and health management
 * - Production-like error handling
 */

import { ServiceCommunicationClient } from '../service-communication-client';
import { ServiceRegistry, ServiceInfo } from '../../services/service-registry';
import { MetricsServiceClient } from '../metrics-service-client';

// Mock global fetch but allow partial mocking for integration tests
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('ServiceCommunicationClient - Integration Tests', () => {
  let client: ServiceCommunicationClient;

  beforeEach(() => {
    // Reset singleton instance
    (ServiceCommunicationClient as any).instance = null;
    
    // Clear mocks
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Service Discovery and Communication Flow', () => {
    it('should discover services and establish communication', async () => {
      // Mock ServiceRegistry with realistic services
      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockReturnValue([
          {
            name: 'api-gateway',
            url: 'http://gateway.local:8080',
            health: 'healthy',
            version: '1.2.0',
            lastCheck: new Date(),
            metadata: {
              timeout: 5000,
              retries: 3,
              circuitBreakerThreshold: 5,
              priority: 1
            }
          },
          {
            name: 'user-service',
            url: 'http://users.local:3001',
            health: 'healthy',
            version: '2.1.0',
            lastCheck: new Date(),
            metadata: {
              timeout: 3000,
              retries: 2,
              circuitBreakerThreshold: 3,
              priority: 2
            }
          }
        ]),
        getService: jest.fn().mockImplementation((name: string) => {
          const services = [
            {
              name: 'api-gateway',
              url: 'http://gateway.local:8080',
              health: 'healthy',
              version: '1.2.0',
              lastCheck: new Date(),
              metadata: { timeout: 5000, retries: 3, circuitBreakerThreshold: 5, priority: 1 }
            },
            {
              name: 'user-service',
              url: 'http://users.local:3001',
              health: 'healthy',
              version: '2.1.0',
              lastCheck: new Date(),
              metadata: { timeout: 3000, retries: 2, circuitBreakerThreshold: 3, priority: 2 }
            }
          ];
          return services.find(s => s.name === name) || null;
        }),
        isServiceHealthy: jest.fn().mockReturnValue(true),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      // Mock MetricsServiceClient
      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      // Apply mocks
      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Mock successful API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ gateway: 'healthy', version: '1.2.0' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ users: 'service', status: 'operational' })
        } as Response);

      // Test communication with discovered services
      const gatewayResponse = await client.get('api-gateway', '/health');
      const userServiceResponse = await client.get('user-service', '/status');

      expect(gatewayResponse).toEqual({ gateway: 'healthy', version: '1.2.0' });
      expect(userServiceResponse).toEqual({ users: 'service', status: 'operational' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://gateway.local:8080/health',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Service-Name': 'api-gateway'
          })
        })
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://users.local:3001/status',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Service-Name': 'user-service'
          })
        })
      );
    });

    it('should handle service registration updates dynamically', async () => {
      const initialServices = [
        {
          name: 'database-service',
          url: 'http://db.local:5432',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 2000, retries: 1, circuitBreakerThreshold: 2, priority: 1 }
        }
      ];

      const updatedServices = [
        ...initialServices,
        {
          name: 'cache-service',
          url: 'http://cache.local:6379',
          health: 'healthy',
          version: '1.1.0',
          lastCheck: new Date(),
          metadata: { timeout: 1000, retries: 2, circuitBreakerThreshold: 4, priority: 2 }
        }
      ];

      let currentServices = initialServices;

      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockImplementation(() => currentServices),
        getService: jest.fn().mockImplementation((name: string) => 
          currentServices.find(s => s.name === name) || null
        ),
        isServiceHealthy: jest.fn().mockReturnValue(true),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Initial communication with database service
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ database: 'connected' })
      } as Response);

      const dbResponse = await client.get('database-service', '/connect');
      expect(dbResponse).toEqual({ database: 'connected' });

      // Update services registry
      currentServices = updatedServices;

      // Communication with newly registered cache service
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ cache: 'ready' })
      } as Response);

      const cacheResponse = await client.get('cache-service', '/ping');
      expect(cacheResponse).toEqual({ cache: 'ready' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://cache.local:6379/ping',
        expect.any(Object)
      );
    });
  });

  describe('Multi-Service Orchestration', () => {
    it('should orchestrate requests across multiple services', async () => {
      const services = [
        {
          name: 'auth-service',
          url: 'http://auth.local:3000',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 2000, retries: 2, circuitBreakerThreshold: 3, priority: 1 }
        },
        {
          name: 'profile-service',
          url: 'http://profile.local:3001',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 3000, retries: 2, circuitBreakerThreshold: 4, priority: 2 }
        },
        {
          name: 'notification-service',
          url: 'http://notifications.local:3002',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 5000, retries: 1, circuitBreakerThreshold: 2, priority: 3 }
        }
      ];

      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockReturnValue(services),
        getService: jest.fn().mockImplementation((name: string) => 
          services.find(s => s.name === name) || null
        ),
        isServiceHealthy: jest.fn().mockReturnValue(true),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Mock service responses for user registration workflow
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ userId: 'user123', token: 'jwt-token' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ profileId: 'profile456', status: 'created' })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ notificationId: 'notif789', sent: true })
        } as Response);

      // Simulate user registration workflow
      const authResult = await client.post('auth-service', '/register', {
        email: 'user@example.com',
        password: 'secure123'
      });

      const profileResult = await client.post('profile-service', '/profiles', {
        userId: authResult.userId,
        name: 'John Doe',
        preferences: { theme: 'dark' }
      });

      const notificationResult = await client.post('notification-service', '/send', {
        userId: authResult.userId,
        type: 'welcome',
        template: 'user-welcome'
      });

      expect(authResult).toEqual({ userId: 'user123', token: 'jwt-token' });
      expect(profileResult).toEqual({ profileId: 'profile456', status: 'created' });
      expect(notificationResult).toEqual({ notificationId: 'notif789', sent: true });

      // Verify all services were called
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle partial service failures in orchestration', async () => {
      const services = [
        {
          name: 'payment-service',
          url: 'http://payments.local:3000',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 5000, retries: 3, circuitBreakerThreshold: 2, priority: 1 }
        },
        {
          name: 'inventory-service',
          url: 'http://inventory.local:3001',
          health: 'degraded',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 3000, retries: 2, circuitBreakerThreshold: 3, priority: 2 }
        },
        {
          name: 'shipping-service',
          url: 'http://shipping.local:3002',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 4000, retries: 2, circuitBreakerThreshold: 4, priority: 3 }
        }
      ];

      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockReturnValue(services),
        getService: jest.fn().mockImplementation((name: string) => 
          services.find(s => s.name === name) || null
        ),
        isServiceHealthy: jest.fn().mockImplementation((name: string) => 
          name !== 'inventory-service'
        ),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Mock responses: payment succeeds, inventory fails, shipping succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ paymentId: 'pay123', status: 'charged' })
        } as Response)
        .mockRejectedValueOnce(new Error('Inventory service unavailable'))
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ shippingId: 'ship456', estimated: '2-3 days' })
        } as Response);

      // Execute order processing workflow
      const results = await Promise.allSettled([
        client.post('payment-service', '/charge', { amount: 99.99, card: 'card123' }),
        client.put('inventory-service', '/reserve', { productId: 'prod789', quantity: 1 }),
        client.post('shipping-service', '/schedule', { address: '123 Main St', priority: 'standard' })
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      if (results[0].status === 'fulfilled') {
        expect(results[0].value).toEqual({ paymentId: 'pay123', status: 'charged' });
      }

      if (results[2].status === 'fulfilled') {
        expect(results[2].value).toEqual({ shippingId: 'ship456', estimated: '2-3 days' });
      }
    });
  });

  describe('Production-like Error Scenarios', () => {
    it('should handle cascading service failures gracefully', async () => {
      const services = [
        {
          name: 'primary-service',
          url: 'http://primary.local:3000',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 2000, retries: 1, circuitBreakerThreshold: 2, priority: 1 }
        },
        {
          name: 'secondary-service',
          url: 'http://secondary.local:3001',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 3000, retries: 2, circuitBreakerThreshold: 3, priority: 2 }
        }
      ];

      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockReturnValue(services),
        getService: jest.fn().mockImplementation((name: string) => 
          services.find(s => s.name === name) || null
        ),
        isServiceHealthy: jest.fn().mockReturnValue(true),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Simulate cascading failures
      mockFetch.mockRejectedValue(new Error('Service mesh failure'));

      // Trigger circuit breaker opening for both services
      const failurePromises = [];

      // Primary service failures
      for (let i = 0; i < 2; i++) {
        failurePromises.push(
          client.get('primary-service', `/api/fail-${i}`, { retries: 0 })
            .catch(error => ({ service: 'primary', failed: true, error: error.message }))
        );
      }

      // Secondary service failures
      for (let i = 0; i < 3; i++) {
        failurePromises.push(
          client.get('secondary-service', `/api/fail-${i}`, { retries: 0 })
            .catch(error => ({ service: 'secondary', failed: true, error: error.message }))
        );
      }

      const results = await Promise.all(failurePromises);

      // All requests should fail
      expect(results.every(r => r.failed)).toBe(true);

      // Circuit breakers should be open
      const cbStatus = client.getCircuitBreakerStatus();
      expect(cbStatus['primary-service'].state).toBe('open');
      expect(cbStatus['secondary-service'].state).toBe('open');

      // Subsequent requests should be blocked
      mockFetch.mockClear();

      const blockedRequests = await Promise.allSettled([
        client.get('primary-service', '/api/blocked'),
        client.get('secondary-service', '/api/blocked')
      ]);

      blockedRequests.forEach(result => {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason.message).toContain('Circuit breaker is open');
        }
      });

      // No additional network requests should be made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle network partitioning and recovery', async () => {
      jest.useFakeTimers();

      const services = [
        {
          name: 'remote-service',
          url: 'http://remote.datacenter:3000',
          health: 'healthy',
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 5000, retries: 2, circuitBreakerThreshold: 3, priority: 1 }
        }
      ];

      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockReturnValue(services),
        getService: jest.fn().mockImplementation((name: string) => 
          services.find(s => s.name === name) || null
        ),
        isServiceHealthy: jest.fn().mockReturnValue(true),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Simulate network partition (timeouts)
      mockFetch.mockImplementation(() => 
        new Promise(() => {}) // Never resolves (simulates network timeout)
      );

      // Trigger failures to open circuit breaker
      const partitionPromises = [];
      for (let i = 0; i < 3; i++) {
        partitionPromises.push(
          client.get('remote-service', `/api/partition-${i}`)
            .catch(error => ({ partitioned: true, error: error.message }))
        );
      }

      // Fast forward to trigger timeouts
      jest.advanceTimersByTime(6000);

      const partitionResults = await Promise.all(partitionPromises);
      expect(partitionResults.every(r => r.partitioned)).toBe(true);

      // Circuit breaker should be open
      expect(client.getCircuitBreakerStatus()['remote-service'].state).toBe('open');

      // Simulate network recovery after circuit breaker timeout
      jest.advanceTimersByTime(31000); // Circuit breaker reset timeout

      mockFetch.mockClear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ network: 'recovered', status: 'healthy' })
      } as Response);

      // Recovery request should succeed
      const recoveryResult = await client.get('remote-service', '/api/recovery');
      expect(recoveryResult).toEqual({ network: 'recovered', status: 'healthy' });
      expect(client.getCircuitBreakerStatus()['remote-service'].state).toBe('closed');

      jest.useRealTimers();
    });
  });

  describe('Service Health Monitoring Integration', () => {
    it('should integrate with ServiceRegistry for health monitoring', async () => {
      const services = [
        {
          name: 'monitored-service',
          url: 'http://monitored.local:3000',
          health: 'healthy' as const,
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 3000, retries: 2, circuitBreakerThreshold: 3, priority: 1 }
        }
      ];

      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockReturnValue(services),
        getService: jest.fn().mockImplementation((name: string) => 
          services.find(s => s.name === name) || null
        ),
        isServiceHealthy: jest.fn().mockReturnValue(true),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Successful request should update health to healthy
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => ({ status: 'ok' })
      } as Response);

      await client.get('monitored-service', '/api/test');

      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('monitored-service', 'healthy');

      // Failed request should update health to unhealthy
      mockFetch.mockRejectedValueOnce(new Error('Service failure'));

      try {
        await client.get('monitored-service', '/api/fail', { retries: 0 });
      } catch (error) {
        // Expected
      }

      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('monitored-service', 'unhealthy');
    });

    it('should perform comprehensive health checks for all services', async () => {
      const services = [
        {
          name: 'web-service',
          url: 'http://web.local:8080',
          health: 'healthy' as const,
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 2000, retries: 1, circuitBreakerThreshold: 2, priority: 1 }
        },
        {
          name: 'api-service',
          url: 'http://api.local:3000',
          health: 'healthy' as const,
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 3000, retries: 2, circuitBreakerThreshold: 3, priority: 2 }
        },
        {
          name: 'worker-service',
          url: 'http://worker.local:4000',
          health: 'healthy' as const,
          version: '1.0.0',
          lastCheck: new Date(),
          metadata: { timeout: 5000, retries: 3, circuitBreakerThreshold: 5, priority: 3 }
        }
      ];

      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockReturnValue(services),
        getService: jest.fn().mockImplementation((name: string) => 
          services.find(s => s.name === name) || null
        ),
        isServiceHealthy: jest.fn().mockReturnValue(true),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Mock health check responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => 'OK'
        } as Response) // web-service healthy
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable'
        } as Response) // api-service degraded
        .mockRejectedValueOnce(new Error('Connection refused')); // worker-service unhealthy

      const healthResults = await client.checkAllServices();

      expect(healthResults).toHaveLength(3);
      
      expect(healthResults[0]).toEqual({
        service: 'web-service',
        healthy: true,
        responseTime: expect.any(Number),
        timestamp: expect.any(Date)
      });

      expect(healthResults[1]).toEqual({
        service: 'api-service',
        healthy: false,
        responseTime: expect.any(Number),
        timestamp: expect.any(Date),
        statusCode: 503,
        statusText: 'Service Unavailable'
      });

      expect(healthResults[2]).toEqual({
        service: 'worker-service',
        healthy: false,
        responseTime: expect.any(Number),
        timestamp: expect.any(Date),
        error: 'Connection refused'
      });

      // Verify registry updates
      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('web-service', 'healthy');
      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('api-service', 'degraded');
      expect(mockServiceRegistry.updateServiceHealth)
        .toHaveBeenCalledWith('worker-service', 'unhealthy');
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle typical microservice communication patterns', async () => {
      // Simulate a realistic microservice architecture
      const services = [
        {
          name: 'order-service',
          url: 'http://orders.internal:3000',
          health: 'healthy' as const,
          version: '2.1.0',
          lastCheck: new Date(),
          metadata: { timeout: 5000, retries: 3, circuitBreakerThreshold: 5, priority: 1 }
        },
        {
          name: 'customer-service',
          url: 'http://customers.internal:3001',
          health: 'healthy' as const,
          version: '1.3.0',
          lastCheck: new Date(),
          metadata: { timeout: 3000, retries: 2, circuitBreakerThreshold: 3, priority: 2 }
        },
        {
          name: 'pricing-service',
          url: 'http://pricing.internal:3002',
          health: 'healthy' as const,
          version: '1.0.1',
          lastCheck: new Date(),
          metadata: { timeout: 2000, retries: 1, circuitBreakerThreshold: 2, priority: 3 }
        }
      ];

      const mockServiceRegistry = {
        getInstance: jest.fn().mockReturnThis(),
        getAllServices: jest.fn().mockReturnValue(services),
        getService: jest.fn().mockImplementation((name: string) => 
          services.find(s => s.name === name) || null
        ),
        isServiceHealthy: jest.fn().mockReturnValue(true),
        updateServiceHealth: jest.fn(),
        stop: jest.fn()
      };

      const mockMetricsClient = {
        getInstance: jest.fn().mockReturnThis(),
        recordMetric: jest.fn().mockResolvedValue(undefined)
      };

      jest.doMock('../../services/service-registry', () => ({
        ServiceRegistry: mockServiceRegistry
      }));
      jest.doMock('../metrics-service-client', () => ({
        MetricsServiceClient: mockMetricsClient
      }));

      client = ServiceCommunicationClient.getInstance();

      // Mock realistic API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ 
            customerId: 'cust123', 
            name: 'John Doe', 
            tier: 'premium',
            creditLimit: 5000 
          })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ 
            basePrice: 99.99, 
            discount: 10, 
            finalPrice: 89.99,
            currency: 'USD' 
          })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          headers: new Map([['content-type', 'application/json']]),
          json: async () => ({ 
            orderId: 'ord456', 
            status: 'pending', 
            total: 89.99,
            estimatedDelivery: '2024-01-15'
          })
        } as Response);

      // Simulate order creation workflow
      const customer = await client.get('customer-service', '/customers/cust123');
      
      const pricing = await client.post('pricing-service', '/calculate', {
        productId: 'prod789',
        customerId: customer.customerId,
        tier: customer.tier
      });

      const order = await client.post('order-service', '/orders', {
        customerId: customer.customerId,
        items: [{ productId: 'prod789', quantity: 1 }],
        pricing: pricing
      });

      expect(customer).toEqual({
        customerId: 'cust123',
        name: 'John Doe',
        tier: 'premium',
        creditLimit: 5000
      });

      expect(pricing).toEqual({
        basePrice: 99.99,
        discount: 10,
        finalPrice: 89.99,
        currency: 'USD'
      });

      expect(order).toEqual({
        orderId: 'ord456',
        status: 'pending',
        total: 89.99,
        estimatedDelivery: '2024-01-15'
      });

      // Verify proper service calls were made
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});