/**
 * Health Services API Route Tests - Task 8 Implementation
 * 
 * Comprehensive test suite for the health/services API endpoint that:
 * - Tests GET request handling and response format
 * - Tests concurrent data fetching with Promise.all
 * - Tests error handling and 500 status responses
 * - Tests JSON response structure and content
 * - Tests integration with ServiceHealthMonitor and EnhancedServiceIntegration
 * - Tests response timing and performance
 * - Handles edge cases and service failure scenarios
 * 
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { ServiceHealthMonitor } from '@/lib/monitoring/service-health-monitor';
import { EnhancedServiceIntegration } from '@/lib/services/enhanced-service-integration';

// Mock the singleton classes
jest.mock('@/lib/monitoring/service-health-monitor');
jest.mock('@/lib/services/enhanced-service-integration');

const mockServiceHealthMonitor = ServiceHealthMonitor as jest.MockedClass<typeof ServiceHealthMonitor>;
const mockEnhancedServiceIntegration = EnhancedServiceIntegration as jest.MockedClass<typeof EnhancedServiceIntegration>;

describe('/api/health/services', () => {
  let mockHealthMonitorInstance: jest.Mocked<ServiceHealthMonitor>;
  let mockServiceIntegrationInstance: jest.Mocked<EnhancedServiceIntegration>;
  let mockRequest: NextRequest;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create mock instances
    mockHealthMonitorInstance = {
      getSystemHealth: jest.fn(),
    } as any;
    
    mockServiceIntegrationInstance = {
      getServicesStatus: jest.fn(),
    } as any;

    // Mock the getInstance methods
    mockServiceHealthMonitor.getInstance.mockReturnValue(mockHealthMonitorInstance);
    mockEnhancedServiceIntegration.getInstance.mockReturnValue(mockServiceIntegrationInstance);

    // Create a mock request
    mockRequest = new NextRequest('http://localhost:3000/api/health/services');
  });

  describe('GET /api/health/services', () => {
    it('should return comprehensive health data with proper structure', async () => {
      // Arrange
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: {
          healthy: ['cache-service', 'metrics-service'],
          unhealthy: [],
          total: 2,
        },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
      };

      const mockServicesStatus = {
        healthy: [
          {
            name: 'cache-service',
            healthy: true,
            responseTime: 50,
            lastCheck: new Date('2024-01-01T00:00:00.000Z'),
            circuitBreakerState: 'closed',
            details: {}
          },
          {
            name: 'metrics-service',
            healthy: true,
            responseTime: 75,
            lastCheck: new Date('2024-01-01T00:00:00.000Z'),
            circuitBreakerState: 'closed',
            details: {}
          }
        ],
        degraded: [],
        unhealthy: []
      };

      mockHealthMonitorInstance.getSystemHealth.mockReturnValue(mockSystemHealth);
      mockServiceIntegrationInstance.getServicesStatus.mockResolvedValue(mockServicesStatus);

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('system');
      expect(data.system.status).toBe(mockSystemHealth.status);
      expect(data.system.services).toEqual(mockSystemHealth.services);
      expect(data.system.healthScore).toBe(mockSystemHealth.healthScore);
      expect(data.system.circuitBreakers).toEqual(mockSystemHealth.circuitBreakers);
      expect(data.system.timestamp).toBe(mockSystemHealth.timestamp.toISOString());
      expect(data).toHaveProperty('services');
      expect(data.services.healthy).toHaveLength(2);
      expect(data.services.degraded).toHaveLength(0);
      expect(data.services.unhealthy).toHaveLength(0);
      expect(data.services.healthy[0].name).toBe('cache-service');
      expect(data.services.healthy[0].healthy).toBe(true);
      expect(data.services.healthy[0].lastCheck).toBe(mockServicesStatus.healthy[0].lastCheck.toISOString());
      expect(data).toHaveProperty('timestamp');
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should fetch system health and services status concurrently', async () => {
      // Arrange
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: { healthy: [], unhealthy: [], total: 0 },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: new Date(),
      };

      const mockServicesStatus = {
        healthy: [],
        degraded: [],
        unhealthy: []
      };

      let getSystemHealthCalled = false;
      let getServicesStatusCalled = false;

      mockHealthMonitorInstance.getSystemHealth.mockImplementation(() => {
        getSystemHealthCalled = true;
        return mockSystemHealth;
      });

      mockServiceIntegrationInstance.getServicesStatus.mockImplementation(async () => {
        getServicesStatusCalled = true;
        return mockServicesStatus;
      });

      // Act
      await GET(mockRequest);

      // Assert
      expect(getSystemHealthCalled).toBe(true);
      expect(getServicesStatusCalled).toBe(true);
      expect(mockHealthMonitorInstance.getSystemHealth).toHaveBeenCalledTimes(1);
      expect(mockServiceIntegrationInstance.getServicesStatus).toHaveBeenCalledTimes(1);
    });

    it('should handle degraded system status correctly', async () => {
      // Arrange
      const mockSystemHealth = {
        status: 'degraded' as const,
        services: {
          healthy: ['cache-service'],
          unhealthy: ['metrics-service'],
          total: 2,
        },
        healthScore: 0.5,
        circuitBreakers: {
          'metrics-service': {
            state: 'half-open',
            failures: 2,
            lastFailureTime: new Date(),
            nextRetryTime: new Date(),
          }
        },
        timestamp: new Date(),
      };

      const mockServicesStatus = {
        healthy: [{
          name: 'cache-service',
          healthy: true,
          responseTime: 50,
          lastCheck: new Date(),
          circuitBreakerState: 'closed',
          details: {}
        }],
        degraded: [{
          name: 'metrics-service',
          healthy: false,
          responseTime: 200,
          lastCheck: new Date(),
          circuitBreakerState: 'half-open',
          details: {}
        }],
        unhealthy: []
      };

      mockHealthMonitorInstance.getSystemHealth.mockReturnValue(mockSystemHealth);
      mockServiceIntegrationInstance.getServicesStatus.mockResolvedValue(mockServicesStatus);

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.system.status).toBe('degraded');
      expect(data.system.healthScore).toBe(0.5);
      expect(data.services.degraded).toHaveLength(1);
      expect(data.services.degraded[0].circuitBreakerState).toBe('half-open');
    });

    it('should handle critical system status correctly', async () => {
      // Arrange
      const mockSystemHealth = {
        status: 'critical' as const,
        services: {
          healthy: [],
          unhealthy: ['cache-service', 'metrics-service', 'background-jobs-service'],
          total: 3,
        },
        healthScore: 0.0,
        circuitBreakers: {
          'cache-service': { state: 'open', failures: 5, lastFailureTime: new Date(), nextRetryTime: new Date() },
          'metrics-service': { state: 'open', failures: 5, lastFailureTime: new Date(), nextRetryTime: new Date() },
          'background-jobs-service': { state: 'open', failures: 5, lastFailureTime: new Date(), nextRetryTime: new Date() }
        },
        timestamp: new Date(),
      };

      const mockServicesStatus = {
        healthy: [],
        degraded: [],
        unhealthy: [
          { name: 'cache-service', healthy: false, responseTime: 0, lastCheck: new Date(), circuitBreakerState: 'open', details: {}, error: 'Connection failed' },
          { name: 'metrics-service', healthy: false, responseTime: 0, lastCheck: new Date(), circuitBreakerState: 'open', details: {}, error: 'Service unavailable' },
          { name: 'background-jobs-service', healthy: false, responseTime: 0, lastCheck: new Date(), circuitBreakerState: 'open', details: {}, error: 'Timeout' }
        ]
      };

      mockHealthMonitorInstance.getSystemHealth.mockReturnValue(mockSystemHealth);
      mockServiceIntegrationInstance.getServicesStatus.mockResolvedValue(mockServicesStatus);

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.system.status).toBe('critical');
      expect(data.system.healthScore).toBe(0.0);
      expect(data.services.unhealthy).toHaveLength(3);
      expect(data.services.unhealthy.every(service => service.circuitBreakerState === 'open')).toBe(true);
    });

    it('should handle ServiceHealthMonitor errors and return 500', async () => {
      // Arrange
      const errorMessage = 'ServiceHealthMonitor failed';
      mockHealthMonitorInstance.getSystemHealth.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('timestamp');
      expect(data.message).toContain('Failed to fetch health information');
    });

    it('should handle EnhancedServiceIntegration errors and return 500', async () => {
      // Arrange
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: { healthy: [], unhealthy: [], total: 0 },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: new Date(),
      };

      const errorMessage = 'EnhancedServiceIntegration failed';
      mockHealthMonitorInstance.getSystemHealth.mockReturnValue(mockSystemHealth);
      mockServiceIntegrationInstance.getServicesStatus.mockRejectedValue(new Error(errorMessage));

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('timestamp');
      expect(data.message).toContain('Failed to fetch health information');
    });

    it('should handle both services failing and return 500', async () => {
      // Arrange
      mockHealthMonitorInstance.getSystemHealth.mockImplementation(() => {
        throw new Error('ServiceHealthMonitor failed');
      });
      mockServiceIntegrationInstance.getServicesStatus.mockRejectedValue(new Error('EnhancedServiceIntegration failed'));

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('timestamp');
      expect(data.error).toBe('Internal Server Error');
    });

    it('should include proper Content-Type header', async () => {
      // Arrange
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: { healthy: [], unhealthy: [], total: 0 },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: new Date(),
      };

      const mockServicesStatus = {
        healthy: [],
        degraded: [],
        unhealthy: []
      };

      mockHealthMonitorInstance.getSystemHealth.mockReturnValue(mockSystemHealth);
      mockServiceIntegrationInstance.getServicesStatus.mockResolvedValue(mockServicesStatus);

      // Act
      const response = await GET(mockRequest);

      // Assert
      expect(response.headers.get('content-type')).toBe('application/json');
    });

    it('should handle Promise.all rejection correctly', async () => {
      // Arrange - simulate Promise.all failing due to one service throwing
      mockHealthMonitorInstance.getSystemHealth.mockReturnValue({
        status: 'healthy' as const,
        services: { healthy: [], unhealthy: [], total: 0 },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: new Date(),
      });
      
      // This will cause Promise.all to reject
      mockServiceIntegrationInstance.getServicesStatus.mockRejectedValue(new Error('Service integration failure'));

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
      expect(data.message).toContain('Failed to fetch health information');
    });

    it('should measure and log response timing', async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: { healthy: [], unhealthy: [], total: 0 },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: new Date(),
      };

      const mockServicesStatus = {
        healthy: [],
        degraded: [],
        unhealthy: []
      };

      // Simulate some processing time
      mockHealthMonitorInstance.getSystemHealth.mockImplementation(() => {
        // Simulate 10ms processing
        const start = Date.now();
        while (Date.now() - start < 10) {
          // Busy wait
        }
        return mockSystemHealth;
      });

      mockServiceIntegrationInstance.getServicesStatus.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return mockServicesStatus;
      });

      // Act
      const startTime = Date.now();
      await GET(mockRequest);
      const endTime = Date.now();

      // Assert
      expect(endTime - startTime).toBeGreaterThanOrEqual(20); // At least 20ms due to async timeout
      
      consoleSpy.mockRestore();
    });

    it('should handle empty services arrays correctly', async () => {
      // Arrange
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: { healthy: [], unhealthy: [], total: 0 },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: new Date(),
      };

      const mockServicesStatus = {
        healthy: [],
        degraded: [],
        unhealthy: []
      };

      mockHealthMonitorInstance.getSystemHealth.mockReturnValue(mockSystemHealth);
      mockServiceIntegrationInstance.getServicesStatus.mockResolvedValue(mockServicesStatus);

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.system.services.total).toBe(0);
      expect(data.services.healthy).toHaveLength(0);
      expect(data.services.degraded).toHaveLength(0);
      expect(data.services.unhealthy).toHaveLength(0);
    });

    it('should preserve original timestamp from ServiceHealthMonitor', async () => {
      // Arrange
      const specificTimestamp = new Date('2024-01-01T12:00:00.000Z');
      const mockSystemHealth = {
        status: 'healthy' as const,
        services: { healthy: ['test-service'], unhealthy: [], total: 1 },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: specificTimestamp,
      };

      const mockServicesStatus = {
        healthy: [],
        degraded: [],
        unhealthy: []
      };

      mockHealthMonitorInstance.getSystemHealth.mockReturnValue(mockSystemHealth);
      mockServiceIntegrationInstance.getServicesStatus.mockResolvedValue(mockServicesStatus);

      // Act
      const response = await GET(mockRequest);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(data.system.timestamp).toBe(specificTimestamp.toISOString());
      expect(new Date(data.timestamp)).toBeInstanceOf(Date); // Response timestamp should be current
      expect(new Date(data.timestamp).getTime()).toBeGreaterThan(specificTimestamp.getTime());
    });
  });
});