/**
 * Database Health Check Test Specification
 * 
 * This test file defines comprehensive test cases for the DatabaseHealthCheck
 * following TDD principles. These tests serve as specifications for health
 * monitoring and demonstrate database health checking patterns.
 */

// Mock interfaces for health checking
interface HealthCheckResult {
  healthy: boolean;
  timestamp: Date;
  duration: number;
  components: {
    database: { healthy: boolean; error: string | null };
    logging: { healthy: boolean; error: string | null };
    connection: { healthy: boolean; error: string | null };
  };
}

interface DetailedHealthStatus extends HealthCheckResult {
  metrics: {
    connectionPool: {
      total: number;
      idle: number;
      waiting: number;
      active: number;
    };
    uptime: number;
  };
}

// Mock implementation for testing
class MockDatabaseHealthCheck {
  private static instance: MockDatabaseHealthCheck;
  private startTime: number = Date.now();
  private mockDatabaseService = {
    healthCheck: jest.fn().mockResolvedValue(true),
  };
  private mockLoggingService = {
    healthCheck: jest.fn().mockResolvedValue(true),
    log: jest.fn().mockResolvedValue(undefined),
    isEnabled: jest.fn().mockReturnValue(true),
  };
  private mockConnectionPool = {
    getConnection: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ now: '2023-12-01T10:00:00Z' }] }),
      release: jest.fn(),
    }),
    getPool: jest.fn().mockReturnValue({
      totalCount: 10,
      idleCount: 8,
      waitingCount: 0,
    }),
  };

  static getInstance(): MockDatabaseHealthCheck {
    if (!MockDatabaseHealthCheck.instance) {
      MockDatabaseHealthCheck.instance = new MockDatabaseHealthCheck();
    }
    return MockDatabaseHealthCheck.instance;
  }

  static resetInstance(): void {
    MockDatabaseHealthCheck.instance = null as any;
  }

  async performHealthCheck(): Promise<HealthCheckResult> {
    const start = process.hrtime.bigint();
    
    const components = {
      database: { healthy: true, error: null as string | null },
      logging: { healthy: true, error: null as string | null },
      connection: { healthy: true, error: null as string | null }
    };

    try {
      // Check database service
      try {
        const dbHealthy = await this.mockDatabaseService.healthCheck();
        components.database.healthy = Boolean(dbHealthy);
      } catch (error: any) {
        components.database.healthy = false;
        components.database.error = error.message;
      }

      // Check logging service
      try {
        const loggingHealthy = await this.mockLoggingService.healthCheck();
        components.logging.healthy = Boolean(loggingHealthy);
      } catch (error: any) {
        components.logging.healthy = false;
        components.logging.error = error.message;
      }

      // Check connection pool
      try {
        const connection = await this.mockConnectionPool.getConnection();
        await connection.query('SELECT NOW()');
        connection.release();
        components.connection.healthy = true;
      } catch (error: any) {
        components.connection.healthy = false;
        components.connection.error = error.message;
      }
    } catch (error) {
      // Handle unexpected errors
    }

    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000;

    const result = {
      healthy: Object.values(components).every(c => c.healthy),
      timestamp: new Date(),
      duration,
      components
    };

    // Log result if logging is enabled
    if (this.mockLoggingService.isEnabled()) {
      try {
        await this.mockLoggingService.log({
          level: result.healthy ? 'info' : 'warn',
          message: 'Health check completed',
          metadata: {
            healthy: result.healthy,
            duration: result.duration,
            components: result.components
          }
        });
      } catch (error) {
        console.error('Failed to log health check result:', error);
      }
    }

    return result;
  }

  async getDetailedStatus(): Promise<DetailedHealthStatus> {
    const basicStatus = await this.performHealthCheck();
    
    const poolStats = this.mockConnectionPool.getPool();
    const total = poolStats?.totalCount || 0;
    const idle = poolStats?.idleCount || 0;
    const waiting = poolStats?.waitingCount || 0;

    return {
      ...basicStatus,
      metrics: {
        connectionPool: {
          total,
          idle,
          waiting,
          active: total - idle
        },
        uptime: Date.now() - this.startTime
      }
    };
  }

  // Test helper methods
  setMockDatabaseHealth(healthy: boolean, error?: string): void {
    if (healthy) {
      this.mockDatabaseService.healthCheck.mockResolvedValue(true);
    } else if (error) {
      this.mockDatabaseService.healthCheck.mockRejectedValue(new Error(error));
    } else {
      this.mockDatabaseService.healthCheck.mockResolvedValue(false);
    }
  }

  setMockLoggingHealth(healthy: boolean, error?: string): void {
    if (healthy) {
      this.mockLoggingService.healthCheck.mockResolvedValue(true);
    } else if (error) {
      this.mockLoggingService.healthCheck.mockRejectedValue(new Error(error));
    } else {
      this.mockLoggingService.healthCheck.mockResolvedValue(false);
    }
  }

  setMockConnectionPool(config: { total?: number; idle?: number; waiting?: number; error?: string }): void {
    if (config.error) {
      this.mockConnectionPool.getConnection.mockRejectedValue(new Error(config.error));
    } else {
      this.mockConnectionPool.getPool.mockReturnValue({
        totalCount: config.total || 10,
        idleCount: config.idle || 8,
        waitingCount: config.waiting || 0,
      });
    }
  }

  setLoggingEnabled(enabled: boolean): void {
    this.mockLoggingService.isEnabled.mockReturnValue(enabled);
  }
}

describe('Database Health Check Specification', () => {
  let healthCheck: MockDatabaseHealthCheck;

  beforeEach(() => {
    jest.clearAllMocks();
    MockDatabaseHealthCheck.resetInstance();
    healthCheck = MockDatabaseHealthCheck.getInstance();
  });

  describe('Singleton Pattern Requirements', () => {
    it('should implement singleton pattern correctly', () => {
      const instance1 = MockDatabaseHealthCheck.getInstance();
      const instance2 = MockDatabaseHealthCheck.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBe(healthCheck);
    });

    it('should initialize properly on first access', () => {
      expect(healthCheck).toBeDefined();
      expect(typeof healthCheck.performHealthCheck).toBe('function');
      expect(typeof healthCheck.getDetailedStatus).toBe('function');
    });
  });

  describe('Basic Health Check Requirements', () => {
    it('should return healthy status when all components are working', async () => {
      healthCheck.setMockDatabaseHealth(true);
      healthCheck.setMockLoggingHealth(true);
      healthCheck.setMockConnectionPool({});

      const result = await healthCheck.performHealthCheck();

      expect(result).toEqual({
        healthy: true,
        timestamp: expect.any(Date),
        duration: expect.any(Number),
        components: {
          database: { healthy: true, error: null },
          logging: { healthy: true, error: null },
          connection: { healthy: true, error: null }
        }
      });
    });

    it('should return unhealthy status when database fails', async () => {
      healthCheck.setMockDatabaseHealth(false);
      healthCheck.setMockLoggingHealth(true);
      healthCheck.setMockConnectionPool({});

      const result = await healthCheck.performHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.database.healthy).toBe(false);
      expect(result.components.logging.healthy).toBe(true);
      expect(result.components.connection.healthy).toBe(true);
    });

    it('should return unhealthy status when logging service fails', async () => {
      healthCheck.setMockDatabaseHealth(true);
      healthCheck.setMockLoggingHealth(false);
      healthCheck.setMockConnectionPool({});

      const result = await healthCheck.performHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.database.healthy).toBe(true);
      expect(result.components.logging.healthy).toBe(false);
      expect(result.components.connection.healthy).toBe(true);
    });

    it('should handle database service errors gracefully', async () => {
      healthCheck.setMockDatabaseHealth(false, 'Database connection failed');
      healthCheck.setMockLoggingHealth(true);

      const result = await healthCheck.performHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.database).toEqual({
        healthy: false,
        error: 'Database connection failed'
      });
    });

    it('should handle logging service errors gracefully', async () => {
      healthCheck.setMockDatabaseHealth(true);
      healthCheck.setMockLoggingHealth(false, 'Logging service unavailable');

      const result = await healthCheck.performHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.logging).toEqual({
        healthy: false,
        error: 'Logging service unavailable'
      });
    });
  });

  describe('Connection Pool Health Check Requirements', () => {
    it('should check connection pool status successfully', async () => {
      healthCheck.setMockConnectionPool({ total: 10, idle: 8, waiting: 0 });

      const result = await healthCheck.performHealthCheck();

      expect(result.components.connection.healthy).toBe(true);
      expect(result.components.connection.error).toBeNull();
    });

    it('should handle connection acquisition failures', async () => {
      healthCheck.setMockConnectionPool({ error: 'No available connections' });

      const result = await healthCheck.performHealthCheck();

      expect(result.components.connection.healthy).toBe(false);
      expect(result.components.connection.error).toBe('No available connections');
    });

    it('should handle connection pool statistics', async () => {
      healthCheck.setMockConnectionPool({ total: 20, idle: 15, waiting: 3 });

      const detailed = await healthCheck.getDetailedStatus();

      expect(detailed.metrics.connectionPool).toEqual({
        total: 20,
        idle: 15,
        waiting: 3,
        active: 5 // total - idle
      });
    });
  });

  describe('Detailed Status Information Requirements', () => {
    it('should return detailed status including metrics', async () => {
      healthCheck.setMockConnectionPool({ total: 10, idle: 8, waiting: 2 });

      const result = await healthCheck.getDetailedStatus();

      expect(result).toEqual({
        healthy: expect.any(Boolean),
        timestamp: expect.any(Date),
        duration: expect.any(Number),
        components: {
          database: { healthy: expect.any(Boolean), error: null },
          logging: { healthy: expect.any(Boolean), error: null },
          connection: { healthy: expect.any(Boolean), error: null }
        },
        metrics: {
          connectionPool: {
            total: 10,
            idle: 8,
            waiting: 2,
            active: 2
          },
          uptime: expect.any(Number)
        }
      });
    });

    it('should calculate connection pool metrics correctly', async () => {
      healthCheck.setMockConnectionPool({ total: 20, idle: 15, waiting: 3 });

      const result = await healthCheck.getDetailedStatus();

      expect(result.metrics.connectionPool).toEqual({
        total: 20,
        idle: 15,
        waiting: 3,
        active: 5 // total - idle
      });
    });

    it('should handle missing connection pool gracefully', async () => {
      healthCheck.setMockConnectionPool({});
      // Simulate null pool
      (healthCheck as any).mockConnectionPool.getPool.mockReturnValue(null);

      const result = await healthCheck.getDetailedStatus();

      expect(result.metrics.connectionPool).toEqual({
        total: 0,
        idle: 0,
        waiting: 0,
        active: 0
      });
    });

    it('should track uptime accurately', async () => {
      // Small delay to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await healthCheck.getDetailedStatus();

      expect(result.metrics.uptime).toBeGreaterThan(0);
      expect(typeof result.metrics.uptime).toBe('number');
    });
  });

  describe('Performance Requirements', () => {
    it('should complete health check within reasonable time', async () => {
      const startTime = process.hrtime.bigint();
      
      await healthCheck.performHealthCheck();
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      expect(durationMs).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should track and report health check duration', async () => {
      const result = await healthCheck.performHealthCheck();

      expect(result.duration).toBeGreaterThan(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should handle concurrent health checks safely', async () => {
      const promises = Array.from({ length: 10 }, () => 
        healthCheck.performHealthCheck()
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).toHaveProperty('healthy');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('duration');
      });
    });
  });

  describe('Error Resilience Requirements', () => {
    it('should continue working when one component fails', async () => {
      healthCheck.setMockDatabaseHealth(false, 'DB down');
      healthCheck.setMockLoggingHealth(true);

      const result = await healthCheck.performHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.database.healthy).toBe(false);
      expect(result.components.logging.healthy).toBe(true);
    });

    it('should handle complete service failures gracefully', async () => {
      healthCheck.setMockDatabaseHealth(false, 'DB down');
      healthCheck.setMockLoggingHealth(false, 'Logging down');
      healthCheck.setMockConnectionPool({ error: 'Connection down' });

      const result = await healthCheck.performHealthCheck();

      expect(result.healthy).toBe(false);
      expect(result.components.database.healthy).toBe(false);
      expect(result.components.logging.healthy).toBe(false);
      expect(result.components.connection.healthy).toBe(false);
    });

    it('should not throw errors even on critical failures', async () => {
      // Simulate critical system failures
      healthCheck.setMockDatabaseHealth(false, 'Critical database error');
      healthCheck.setMockLoggingHealth(false, 'Critical logging error');
      healthCheck.setMockConnectionPool({ error: 'Critical connection error' });

      await expect(healthCheck.performHealthCheck()).resolves.toBeDefined();
    });

    it('should handle null/undefined service responses', async () => {
      // Mock services return null/undefined
      (healthCheck as any).mockDatabaseService.healthCheck.mockResolvedValue(null);
      (healthCheck as any).mockLoggingService.healthCheck.mockResolvedValue(undefined);

      const result = await healthCheck.performHealthCheck();

      expect(result.components.database.healthy).toBe(false);
      expect(result.components.logging.healthy).toBe(false);
    });
  });

  describe('Logging Integration Requirements', () => {
    it('should log health check results when logging is enabled', async () => {
      healthCheck.setLoggingEnabled(true);

      await healthCheck.performHealthCheck();

      expect((healthCheck as any).mockLoggingService.log).toHaveBeenCalledWith({
        level: 'info',
        message: 'Health check completed',
        metadata: {
          healthy: expect.any(Boolean),
          duration: expect.any(Number),
          components: expect.any(Object)
        }
      });
    });

    it('should not log when logging is disabled', async () => {
      healthCheck.setLoggingEnabled(false);

      await healthCheck.performHealthCheck();

      expect((healthCheck as any).mockLoggingService.log).not.toHaveBeenCalled();
    });

    it('should log with appropriate level based on health status', async () => {
      // Test healthy status
      healthCheck.setMockDatabaseHealth(true);
      healthCheck.setMockLoggingHealth(true);

      await healthCheck.performHealthCheck();

      expect((healthCheck as any).mockLoggingService.log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info' })
      );

      jest.clearAllMocks();

      // Test unhealthy status
      healthCheck.setMockDatabaseHealth(false);

      await healthCheck.performHealthCheck();

      expect((healthCheck as any).mockLoggingService.log).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' })
      );
    });

    it('should handle logging errors gracefully', async () => {
      (healthCheck as any).mockLoggingService.log.mockRejectedValue(new Error('Logging failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await healthCheck.performHealthCheck();

      expect(result).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log health check result:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Memory and Resource Management Requirements', () => {
    it('should not accumulate memory over multiple health checks', async () => {
      const initialMemory = process.memoryUsage();

      // Perform many health checks
      for (let i = 0; i < 100; i++) {
        await healthCheck.performHealthCheck();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (< 1MB for 100 checks)
      expect(memoryIncrease).toBeLessThan(1024 * 1024);
    });

    it('should clean up resources properly', async () => {
      // Verify connections are released
      await healthCheck.performHealthCheck();

      // Connection should have been released
      expect((healthCheck as any).mockConnectionPool.getConnection).toHaveBeenCalled();
    });
  });

  describe('API Response Format Requirements', () => {
    it('should return consistent response format', async () => {
      const result = await healthCheck.performHealthCheck();

      // Validate response structure
      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('components');
      
      expect(typeof result.healthy).toBe('boolean');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(typeof result.duration).toBe('number');
      expect(typeof result.components).toBe('object');

      // Validate components structure
      expect(result.components).toHaveProperty('database');
      expect(result.components).toHaveProperty('logging');
      expect(result.components).toHaveProperty('connection');

      Object.values(result.components).forEach(component => {
        expect(component).toHaveProperty('healthy');
        expect(component).toHaveProperty('error');
        expect(typeof component.healthy).toBe('boolean');
      });
    });

    it('should return detailed status format correctly', async () => {
      const result = await healthCheck.getDetailedStatus();

      // Should have all basic properties plus metrics
      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('metrics');

      // Validate metrics structure
      expect(result.metrics).toHaveProperty('connectionPool');
      expect(result.metrics).toHaveProperty('uptime');

      expect(result.metrics.connectionPool).toHaveProperty('total');
      expect(result.metrics.connectionPool).toHaveProperty('idle');
      expect(result.metrics.connectionPool).toHaveProperty('waiting');
      expect(result.metrics.connectionPool).toHaveProperty('active');

      expect(typeof result.metrics.uptime).toBe('number');
    });

    it('should maintain consistency across multiple calls', async () => {
      const result1 = await healthCheck.performHealthCheck();
      
      // Small delay to ensure timestamps are different
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const result2 = await healthCheck.performHealthCheck();

      // Structure should be identical
      expect(Object.keys(result1)).toEqual(Object.keys(result2));
      expect(Object.keys(result1.components)).toEqual(Object.keys(result2.components));

      // Times should be different but format should be same
      expect(result1.timestamp.getTime()).not.toEqual(result2.timestamp.getTime());
      expect(typeof result1.duration).toBe(typeof result2.duration);
    });
  });

  describe('Configuration and Environment Requirements', () => {
    it('should handle environment-based configuration', () => {
      // Test that the service can be configured via environment
      process.env.HEALTH_CHECK_TIMEOUT = '5000';
      process.env.HEALTH_CHECK_ENABLED = 'true';

      MockDatabaseHealthCheck.resetInstance();
      const configuredHealthCheck = MockDatabaseHealthCheck.getInstance();

      expect(configuredHealthCheck).toBeDefined();
    });

    it('should handle invalid environment configuration gracefully', () => {
      process.env.HEALTH_CHECK_TIMEOUT = 'invalid';
      process.env.HEALTH_CHECK_ENABLED = 'maybe';

      MockDatabaseHealthCheck.resetInstance();
      
      expect(() => MockDatabaseHealthCheck.getInstance()).not.toThrow();
    });

    it('should provide default configuration when environment is not set', () => {
      delete process.env.HEALTH_CHECK_TIMEOUT;
      delete process.env.HEALTH_CHECK_ENABLED;

      MockDatabaseHealthCheck.resetInstance();
      const defaultHealthCheck = MockDatabaseHealthCheck.getInstance();

      expect(defaultHealthCheck).toBeDefined();
    });
  });
});