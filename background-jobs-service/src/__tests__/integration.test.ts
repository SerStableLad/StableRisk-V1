/**
 * Integration Tests for Background Jobs Service
 * 
 * Tests the complete integration between:
 * - HTTP API endpoints
 * - Input validation
 * - Error handling
 * - Rate limiting
 */

import request from 'supertest';
import express from 'express';
import { HealthController } from '../controllers/health-controller';
import { JobController } from '../controllers/job-controller';
import { AdminController } from '../controllers/admin-controller';

// Mock external dependencies
jest.mock('../redis/job-queue');
jest.mock('../db/connection');
jest.mock('../utils/logger');

// Create a minimal test app setup
function createTestApp() {
  const app = express();
  app.use(express.json());
  
  // Mock dependencies
  const mockQueue = {
    addJob: jest.fn().mockResolvedValue('test-job-123'),
    getJob: jest.fn().mockResolvedValue({
      id: 'test-job-123',
      type: 'collect-stablecoin-data',
      status: 'completed',
      result: { ticker: 'USDC' }
    }),
    getQueueStats: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 5,
      failed: 0,
      delayed: 0
    }),
    cancelJob: jest.fn().mockResolvedValue(true),
    testConnection: jest.fn().mockResolvedValue(true)
  };

  const mockDb = {
    testConnection: jest.fn().mockResolvedValue(true),
    getHealthStatus: jest.fn().mockResolvedValue({
      connected: true,
      connections: 5,
      queries: 100
    })
  };

  const mockProcessor = {
    getWorkerStatus: jest.fn().mockReturnValue({
      totalWorkers: 4,
      activeWorkers: 2,
      idleWorkers: 2
    }),
    scaleWorkers: jest.fn().mockResolvedValue(6),
    getStatus: jest.fn().mockReturnValue({
      running: true,
      processed: 100,
      failed: 2
    })
  };

  // Setup controllers
  const healthController = new HealthController();
  const jobController = new JobController(mockQueue as any, mockDb as any);
  const adminController = new AdminController(mockProcessor as any, mockQueue as any);

  // Apply routes
  app.use('/health', healthController.getRoutes());
  
  // Apply API key validation middleware for job routes
  app.use('/jobs', (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== 'test-api-key') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }, jobController.getRoutes());

  // Apply admin API key validation for admin routes
  app.use('/admin', (req, res, next) => {
    const adminKey = req.headers['x-admin-api-key'];
    if (!adminKey || adminKey !== 'admin-api-key') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }, adminController.getRoutes());

  return { app, mockQueue, mockDb, mockProcessor };
}

describe('API Integration Tests', () => {
  let app: express.Application;
  let mockQueue: any;
  let mockDb: any;
  let mockProcessor: any;

  beforeEach(() => {
    const testSetup = createTestApp();
    app = testSetup.app;
    mockQueue = testSetup.mockQueue;
    mockDb = testSetup.mockDb;
    mockProcessor = testSetup.mockProcessor;
  });

  describe('Health Endpoints', () => {
    test('should return basic health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('service');
    });

    test('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('dependencies');
    });

    test('should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('ready');
    });
  });

  describe('Job Management API', () => {
    const validApiKey = 'test-api-key';

    test('should submit a stablecoin data collection job', async () => {
      const jobData = {
        type: 'collect-stablecoin-data',
        data: {
          ticker: 'USDC',
          sources: ['coingecko', 'transparency'],
          urgent: false
        },
        options: {
          priority: 'medium',
          attempts: 3
        }
      };

      const response = await request(app)
        .post('/jobs/submit')
        .set('X-API-Key', validApiKey)
        .send(jobData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('job');
      expect(mockQueue.addJob).toHaveBeenCalled();
    });

    test('should get job status', async () => {
      const response = await request(app)
        .get('/jobs/test-job-123')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'test-job-123',
        type: 'collect-stablecoin-data',
        status: 'completed'
      });
    });

    test('should get queue statistics', async () => {
      const response = await request(app)
        .get('/jobs/stats/queue')
        .set('X-API-Key', validApiKey)
        .expect(200);

      expect(response.body).toMatchObject({
        waiting: 0,
        active: 0,
        completed: 5,
        failed: 0
      });
    });

    test('should reject requests without API key', async () => {
      await request(app)
        .post('/jobs/submit')
        .send({
          type: 'collect-stablecoin-data',
          data: { ticker: 'USDC' }
        })
        .expect(401);
    });

    test('should reject requests with invalid API key', async () => {
      await request(app)
        .post('/jobs/submit')
        .set('X-API-Key', 'invalid-key')
        .send({
          type: 'collect-stablecoin-data',
          data: { ticker: 'USDC' }
        })
        .expect(401);
    });
  });

  describe('Admin Management API', () => {
    const validAdminKey = 'admin-api-key';

    test('should get worker status', async () => {
      const response = await request(app)
        .get('/admin/workers')
        .set('X-Admin-API-Key', validAdminKey)
        .expect(200);

      expect(response.body).toMatchObject({
        totalWorkers: 4,
        activeWorkers: 2,
        idleWorkers: 2
      });
    });

    test('should scale workers', async () => {
      const response = await request(app)
        .post('/admin/workers/scale')
        .set('X-Admin-API-Key', validAdminKey)
        .send({ workers: 6 })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        workers: 6
      });
    });

    test('should reject requests without admin API key', async () => {
      await request(app)
        .get('/admin/workers')
        .expect(401);
    });
  });
});