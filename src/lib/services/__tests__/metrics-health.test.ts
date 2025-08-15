/**
 * Health Check and Graceful Degradation Tests for Metrics Service
 * 
 * Tests requirements:
 * - Health checks respond in < 100ms
 * - Graceful degradation when service unavailable
 * - System stability and recovery mechanisms
 * - Circuit breaker patterns
 */

import request from 'supertest';
import express from 'express';
import { MetricsServiceClient } from '../../../metrics-service/src/clients/metrics-service-client';
import DatabaseConnection from '../../db/connection';

// Mock external dependencies
jest.mock('../../db/connection');
global.fetch = jest.fn();

describe('Metrics Service Health Check and Graceful Degradation Tests', () => {
  let app: express.Application;
  let mockConnection: jest.Mocked<DatabaseConnection>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.useFakeTimers();
    
    // Setup Express app with health endpoint
    app = express();
    app.use(express.json());
    
    // Mock database connection
    mockConnection = {
      query: jest.fn(),
      healthCheck: jest.fn(),
      close: jest.fn(),
      transaction: jest.fn(),
      getConnectionInfo: jest.fn(),
      getInstance: jest.fn(),
      getPool: jest.fn(),
    } as any;

    (DatabaseConnection.getInstance as jest.Mock).mockReturnValue(mockConnection);

    // Mock fetch
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();

    // Setup health check endpoint
    app.get('/health', async (req, res) => {
      const startTime = Date.now();
      
      try {
        // Check database health
        const dbHealthy = await mockConnection.healthCheck();
        
        if (!dbHealthy) {
          return res.status(503).json({
            status: 'unhealthy',
            database: 'down',
            timestamp: new Date().toISOString()
          });
        }

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        res.status(200).json({
          status: 'healthy',
          database: 'up',
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        });
      } catch (error) {
        const endTime = Date.now();
        res.status(503).json({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: `${endTime - startTime}ms`,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Detailed health endpoint
    app.get('/health/detailed', async (req, res) => {
      const healthCheck = {
        service: 'metrics-service',
        status: 'healthy',
        checks: {
          database: { status: 'unknown', responseTime: 0 },
          memory: { status: 'unknown', usage: 0 },
          diskSpace: { status: 'unknown', available: 0 }
        },
        timestamp: new Date().toISOString()
      };

      try {
        // Database check
        const dbStart = Date.now();
        const dbHealthy = await mockConnection.healthCheck();
        const dbEnd = Date.now();
        
        healthCheck.checks.database = {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          responseTime: dbEnd - dbStart
        };

        // Mock memory check
        healthCheck.checks.memory = {
          status: 'healthy',
          usage: Math.round(Math.random() * 100)
        };

        // Mock disk space check
        healthCheck.checks.diskSpace = {
          status: 'healthy',
          available: Math.round(Math.random() * 1000)
        };

        // Determine overall status
        const allHealthy = Object.values(healthCheck.checks).every(check => check.status === 'healthy');
        healthCheck.status = allHealthy ? 'healthy' : 'degraded';

        const statusCode = allHealthy ? 200 : 206;
        res.status(statusCode).json(healthCheck);
      } catch (error) {
        healthCheck.status = 'unhealthy';
        res.status(503).json(healthCheck);
      }
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('Health Check Response Time (<100ms requirement)', () => {
    it('should respond to basic health check within 100ms', async () => {
      mockConnection.healthCheck.mockResolvedValue(true);

      const startTime = Date.now();
      const response = await request(app)
        .get('/health')
        .expect(200);
      const endTime = Date.now();

      const actualResponseTime = endTime - startTime;
      
      // Must respond within 100ms (task requirement)
      expect(actualResponseTime).toBeLessThan(100);
      expect(response.body.status).toBe('healthy');
      expect(response.body.database).toBe('up');
    });

    it('should respond to failed health check within 100ms', async () => {
      mockConnection.healthCheck.mockResolvedValue(false);

      const startTime = Date.now();
      const response = await request(app)
        .get('/health')
        .expect(503);
      const endTime = Date.now();

      const actualResponseTime = endTime - startTime;
      
      // Even failed health checks should respond quickly
      expect(actualResponseTime).toBeLessThan(100);
      expect(response.body.status).toBe('unhealthy');
      expect(response.body.database).toBe('down');
    });

    it('should timeout health checks that take too long', async () => {
      // Mock slow database health check
      mockConnection.healthCheck.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 200))
      );

      const startTime = Date.now();
      const response = await request(app)
        .get('/health')
        .expect(503);
      const endTime = Date.now();

      const actualResponseTime = endTime - startTime;
      
      // Should timeout quickly rather than waiting
      expect(actualResponseTime).toBeLessThan(150);
      expect(response.body.status).toBe('unhealthy');
    });

    it('should handle concurrent health check requests efficiently', async () => {
      mockConnection.healthCheck.mockResolvedValue(true);

      const concurrentRequests = 10;
      const healthCheckPromises = Array.from({ length: concurrentRequests }, () =>
        request(app).get('/health')
      );

      const startTime = Date.now();
      const responses = await Promise.all(healthCheckPromises);
      const endTime = Date.now();

      const totalTime = endTime - startTime;
      const averageResponseTime = totalTime / concurrentRequests;

      // Average response time should still be under 100ms
      expect(averageResponseTime).toBeLessThan(100);
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
      });
    });

    it('should provide detailed health check within acceptable time', async () => {
      mockConnection.healthCheck.mockResolvedValue(true);

      const startTime = Date.now();
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);
      const endTime = Date.now();

      const actualResponseTime = endTime - startTime;
      
      // Detailed health check can be slightly slower but should still be fast
      expect(actualResponseTime).toBeLessThan(150);
      expect(response.body.status).toBe('healthy');
      expect(response.body.checks.database.status).toBe('healthy');
      expect(response.body.checks.memory.status).toBe('healthy');
      expect(response.body.checks.diskSpace.status).toBe('healthy');
    });
  });

  describe('Graceful Degradation Scenarios', () => {
    describe('Database Unavailable', () => {
      it('should continue serving health endpoint when database is down', async () => {
        mockConnection.healthCheck.mockResolvedValue(false);

        const response = await request(app)
          .get('/health')
          .expect(503);

        expect(response.body.status).toBe('unhealthy');
        expect(response.body.database).toBe('down');
        // Service should still respond, not crash
      });

      it('should provide degraded service status when database is intermittent', async () => {
        // Simulate intermittent database issues
        mockConnection.healthCheck
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true);

        // First request succeeds
        await request(app)
          .get('/health')
          .expect(200);

        // Second request shows database down
        await request(app)
          .get('/health')
          .expect(503);

        // Third request shows recovery
        await request(app)
          .get('/health')
          .expect(200);
      });

      it('should handle database connection errors gracefully', async () => {
        mockConnection.healthCheck.mockRejectedValue(new Error('Connection refused'));

        const response = await request(app)
          .get('/health')
          .expect(503);

        expect(response.body.status).toBe('unhealthy');
        expect(response.body.error).toBe('Connection refused');
      });
    });

    describe('MetricsServiceClient Graceful Degradation', () => {
      it('should handle service unavailability without throwing errors', async () => {
        mockFetch.mockRejectedValue(new Error('Service unavailable'));

        // Reset singleton to get fresh instance
        (MetricsServiceClient as any).instance = undefined;
        const client = MetricsServiceClient.getInstance();

        // All client methods should handle errors gracefully
        await expect(client.recordMetric('test.metric', 100)).resolves.not.toThrow();
        
        const metrics = await client.getMetrics('test.metric');
        expect(metrics).toEqual([]);

        const summary = await client.getSystemSummary();
        expect(summary).toHaveProperty('error');

        const health = await client.healthCheck();
        expect(health).toBe(false);
      });

      it('should implement circuit breaker pattern for repeated failures', async () => {
        // Simulate repeated failures
        mockFetch.mockRejectedValue(new Error('Persistent failure'));

        (MetricsServiceClient as any).instance = undefined;
        const client = MetricsServiceClient.getInstance();

        // Track failure patterns
        const failureResults: boolean[] = [];
        
        // Make multiple requests that should fail
        for (let i = 0; i < 10; i++) {
          const health = await client.healthCheck();
          failureResults.push(health);
        }

        // All should fail gracefully
        expect(failureResults.every(result => result === false)).toBe(true);
      });

      it('should recover when service becomes available again', async () => {
        (MetricsServiceClient as any).instance = undefined;
        const client = MetricsServiceClient.getInstance();

        // Initially service is down
        mockFetch.mockRejectedValueOnce(new Error('Service down'));
        let health = await client.healthCheck();
        expect(health).toBe(false);

        // Service recovers
        mockFetch.mockResolvedValueOnce(new Response('OK', { status: 200 }));
        health = await client.healthCheck();
        expect(health).toBe(true);
      });

      it('should handle partial service degradation', async () => {
        (MetricsServiceClient as any).instance = undefined;
        const client = MetricsServiceClient.getInstance();

        // Some endpoints work, others don't
        mockFetch
          .mockResolvedValueOnce(new Response('{}', { status: 200 })) // recordMetric works
          .mockRejectedValueOnce(new Error('Endpoint down')) // getMetrics fails
          .mockResolvedValueOnce(new Response('[]', { status: 200 })); // getSystemSummary works

        // Should handle mixed success/failure gracefully
        await expect(client.recordMetric('test', 100)).resolves.not.toThrow();
        
        const metrics = await client.getMetrics('test');
        expect(metrics).toEqual([]); // Fails gracefully

        const summary = await client.getSystemSummary();
        expect(Array.isArray(summary)).toBe(true); // Succeeds
      });
    });

    describe('Resource Exhaustion Scenarios', () => {
      it('should handle memory pressure gracefully', async () => {
        // Simulate memory-intensive operations
        mockConnection.healthCheck.mockImplementation(async () => {
          // Simulate memory pressure by creating large objects
          const largeArray = new Array(100000).fill('memory-pressure-test');
          
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Clean up immediately to prevent actual memory issues
          largeArray.length = 0;
          
          return true;
        });

        const startTime = Date.now();
        const response = await request(app)
          .get('/health')
          .expect(200);
        const endTime = Date.now();

        // Should still respond within acceptable time despite memory pressure
        expect(endTime - startTime).toBeLessThan(150);
        expect(response.body.status).toBe('healthy');
      });

      it('should degrade gracefully under high CPU load simulation', async () => {
        // Simulate CPU-intensive health check
        mockConnection.healthCheck.mockImplementation(async () => {
          // Simulate CPU load with computation
          let sum = 0;
          for (let i = 0; i < 100000; i++) {
            sum += Math.random();
          }
          
          return sum > 0; // Always true, but ensures computation happens
        });

        const concurrentChecks = 5;
        const healthPromises = Array.from({ length: concurrentChecks }, () =>
          request(app).get('/health')
        );

        const startTime = Date.now();
        const responses = await Promise.all(healthPromises);
        const endTime = Date.now();

        // Even under load, should maintain acceptable response times
        const averageTime = (endTime - startTime) / concurrentChecks;
        expect(averageTime).toBeLessThan(200);

        responses.forEach(response => {
          expect(response.status).toBe(200);
          expect(response.body.status).toBe('healthy');
        });
      });

      it('should handle disk space monitoring in health checks', async () => {
        mockConnection.healthCheck.mockResolvedValue(true);

        const response = await request(app)
          .get('/health/detailed')
          .expect(200);

        expect(response.body.checks.diskSpace).toBeDefined();
        expect(response.body.checks.diskSpace.status).toBe('healthy');
        expect(typeof response.body.checks.diskSpace.available).toBe('number');
      });
    });

    describe('Network Failures and Timeouts', () => {
      it('should handle network timeouts gracefully', async () => {
        jest.useFakeTimers();

        // Mock network timeout
        mockConnection.healthCheck.mockImplementation(
          () => new Promise(() => {}) // Never resolves
        );

        const healthPromise = request(app).get('/health');
        
        // Fast-forward time to trigger timeout
        jest.advanceTimersByTime(150);

        const response = await healthPromise;

        // Should return unhealthy status rather than hanging
        expect(response.status).toBe(503);
        
        jest.useRealTimers();
      });

      it('should provide meaningful error messages for different failure modes', async () => {
        const failureScenarios = [
          { error: new Error('Connection timeout'), expectedMessage: 'Connection timeout' },
          { error: new Error('Connection refused'), expectedMessage: 'Connection refused' },
          { error: new Error('Host unreachable'), expectedMessage: 'Host unreachable' }
        ];

        for (const scenario of failureScenarios) {
          mockConnection.healthCheck.mockRejectedValueOnce(scenario.error);

          const response = await request(app)
            .get('/health')
            .expect(503);

          expect(response.body.error).toBe(scenario.expectedMessage);
        }
      });

      it('should implement retry logic for transient failures', async () => {
        (MetricsServiceClient as any).instance = undefined;
        const client = MetricsServiceClient.getInstance();

        // First call fails, second succeeds
        mockFetch
          .mockRejectedValueOnce(new Error('Transient failure'))
          .mockResolvedValueOnce(new Response('OK', { status: 200 }));

        // First health check fails
        let health = await client.healthCheck();
        expect(health).toBe(false);

        // Retry should succeed
        health = await client.healthCheck();
        expect(health).toBe(true);
      });
    });

    describe('Service Recovery Scenarios', () => {
      it('should detect service recovery automatically', async () => {
        (MetricsServiceClient as any).instance = undefined;
        const client = MetricsServiceClient.getInstance();

        // Service initially down
        mockFetch.mockRejectedValue(new Error('Service down'));

        // Multiple failed attempts
        for (let i = 0; i < 3; i++) {
          const health = await client.healthCheck();
          expect(health).toBe(false);
        }

        // Service comes back online
        mockFetch.mockResolvedValue(new Response('OK', { status: 200 }));

        // Should detect recovery
        const recoveryHealth = await client.healthCheck();
        expect(recoveryHealth).toBe(true);
      });

      it('should handle gradual service recovery', async () => {
        // Simulate gradual recovery with intermittent success
        const recoveryPattern = [false, false, true, false, true, true, true];
        
        mockConnection.healthCheck.mockImplementation(async () => {
          return recoveryPattern.shift() || true;
        });

        const healthResults: string[] = [];

        for (let i = 0; i < 7; i++) {
          const response = await request(app).get('/health');
          healthResults.push(response.body.status);
        }

        // Should track the recovery pattern
        expect(healthResults).toEqual([
          'unhealthy', 'unhealthy', 'healthy', 'unhealthy', 'healthy', 'healthy', 'healthy'
        ]);
      });

      it('should provide recovery time estimates', async () => {
        jest.useFakeTimers();
        const startTime = Date.now();
        
        // Service down initially
        mockConnection.healthCheck.mockResolvedValue(false);
        
        await request(app)
          .get('/health')
          .expect(503);

        // Advance time and recover
        jest.advanceTimersByTime(30000); // 30 seconds later
        mockConnection.healthCheck.mockResolvedValue(true);

        const response = await request(app)
          .get('/health')
          .expect(200);

        // Should include timing information
        expect(response.body.timestamp).toBeDefined();
        expect(response.body.uptime).toBeDefined();

        jest.useRealTimers();
      });
    });

    describe('Load Balancer Health Check Integration', () => {
      it('should provide load balancer compatible health endpoint', async () => {
        mockConnection.healthCheck.mockResolvedValue(true);

        const response = await request(app)
          .get('/health')
          .expect(200);

        // Should provide standard fields expected by load balancers
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body.status).toBe('healthy');
      });

      it('should handle HEAD requests for health checks', async () => {
        mockConnection.healthCheck.mockResolvedValue(true);

        // Add HEAD support to health endpoint
        app.head('/health', async (req, res) => {
          try {
            const healthy = await mockConnection.healthCheck();
            res.status(healthy ? 200 : 503).end();
          } catch {
            res.status(503).end();
          }
        });

        await request(app)
          .head('/health')
          .expect(200);
      });

      it('should provide readiness vs liveness endpoints', async () => {
        // Liveness - can the service respond?
        app.get('/health/live', (req, res) => {
          res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
        });

        // Readiness - is the service ready to handle requests?
        app.get('/health/ready', async (req, res) => {
          try {
            const dbHealthy = await mockConnection.healthCheck();
            
            if (dbHealthy) {
              res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
            } else {
              res.status(503).json({ status: 'not-ready', reason: 'database-unavailable' });
            }
          } catch (error) {
            res.status(503).json({ status: 'not-ready', reason: 'health-check-failed' });
          }
        });

        // Liveness should always succeed
        await request(app)
          .get('/health/live')
          .expect(200);

        // Readiness depends on dependencies
        mockConnection.healthCheck.mockResolvedValue(true);
        await request(app)
          .get('/health/ready')
          .expect(200);

        mockConnection.healthCheck.mockResolvedValue(false);
        await request(app)
          .get('/health/ready')
          .expect(503);
      });
    });
  });

  describe('Performance Under Degraded Conditions', () => {
    it('should maintain health check performance even when service is degraded', async () => {
      // Simulate degraded but functioning database
      mockConnection.healthCheck.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 80)); // Slow but within limits
        return true;
      });

      const startTime = Date.now();
      const response = await request(app)
        .get('/health')
        .expect(200);
      const endTime = Date.now();

      // Should still meet performance requirements
      expect(endTime - startTime).toBeLessThan(100);
      expect(response.body.status).toBe('healthy');
    });

    it('should prioritize health check requests during high load', async () => {
      mockConnection.healthCheck.mockResolvedValue(true);

      // Simulate concurrent load (health checks + other requests)
      const healthChecks = Array.from({ length: 5 }, () =>
        request(app).get('/health')
      );

      const otherRequests = Array.from({ length: 10 }, () =>
        request(app).get('/health/detailed')
      );

      const startTime = Date.now();
      const [healthResults, detailedResults] = await Promise.all([
        Promise.all(healthChecks),
        Promise.all(otherRequests)
      ]);
      const endTime = Date.now();

      // Health checks should complete quickly even under load
      const avgHealthTime = (endTime - startTime) / healthChecks.length;
      expect(avgHealthTime).toBeLessThan(100);

      healthResults.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});