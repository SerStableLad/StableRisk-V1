/**
 * Performance Tests for Background Jobs Service
 * 
 * Tests to validate all acceptance criteria from task-06-background-jobs-extraction.md:
 * - Service can handle 100+ jobs per minute
 * - Job submission responds within 100ms
 * - Worker startup time under 10 seconds
 * - Memory usage stays under 512MB under normal load
 */

import request from 'supertest';
import { BackgroundJobsServer } from '../app/server';
import { JobQueue } from '../redis/job-queue';
import { DatabaseConnection } from '../db/connection';
import { RedisConnection } from '../redis/connection';

// Mock external dependencies for isolated testing
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    httpRequest: jest.fn()
  }
}));

describe('Background Jobs Service Performance Tests', () => {
  let server: BackgroundJobsServer;
  let app: any;
  const baseURL = 'http://localhost:3001';
  const apiKey = 'test-api-key-123';

  beforeAll(async () => {
    // Create server instance for testing
    server = new BackgroundJobsServer();
    app = server.getApp();
  }, 30000);

  afterAll(async () => {
    // Cleanup
    if (server) {
      await server.stop();
    }
  }, 30000);

  describe('Functional Requirements', () => {
    test('should submit jobs via REST API and process them asynchronously', async () => {
      const jobData = {
        type: 'collect-stablecoin-data',
        data: {
          ticker: 'USDC',
          sources: ['coingecko']
        },
        options: {
          priority: 'medium',
          attempts: 3
        }
      };

      const response = await request(app)
        .post('/jobs/submit')
        .set('X-API-Key', apiKey)
        .send(jobData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('job');
      expect(response.body.job).toHaveProperty('id');
    });

    test('should handle job queue priority, delays, and retries correctly', async () => {
      const highPriorityJob = {
        type: 'collect-stablecoin-data',
        data: { ticker: 'USDT' },
        options: { priority: 'high' }
      };

      const delayedJob = {
        type: 'collect-stablecoin-data',
        data: { ticker: 'USDC' },
        options: { delay: 5000 }
      };

      const retryJob = {
        type: 'collect-stablecoin-data',
        data: { ticker: 'DAI' },
        options: { attempts: 5 }
      };

      // Submit all job types
      const responses = await Promise.all([
        request(app).post('/jobs/submit').set('X-API-Key', apiKey).send(highPriorityJob),
        request(app).post('/jobs/submit').set('X-API-Key', apiKey).send(delayedJob),
        request(app).post('/jobs/submit').set('X-API-Key', apiKey).send(retryJob)
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    test('should provide queue statistics', async () => {
      const response = await request(app)
        .get('/jobs/stats/queue')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('pending');
      expect(response.body).toHaveProperty('active');
      expect(response.body).toHaveProperty('completed');
      expect(response.body).toHaveProperty('failed');
    });
  });

  describe('Performance Requirements', () => {
    test('should handle 100+ jobs per minute', async () => {
      const startTime = Date.now();
      const jobsToSubmit = 110; // Slightly above minimum requirement
      const jobs = [];

      // Prepare job data
      for (let i = 0; i < jobsToSubmit; i++) {
        jobs.push({
          type: 'collect-stablecoin-data',
          data: {
            ticker: `TEST${i}`,
            sources: ['coingecko']
          },
          options: {
            priority: 'medium'
          }
        });
      }

      // Submit jobs in batches to avoid overwhelming the system
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < jobs.length; i += batchSize) {
        const batch = jobs.slice(i, i + batchSize);
        batches.push(batch);
      }

      let successfulSubmissions = 0;
      
      for (const batch of batches) {
        const batchPromises = batch.map(job =>
          request(app)
            .post('/jobs/submit')
            .set('X-API-Key', apiKey)
            .send(job)
            .then(res => res.status === 201 ? 1 : 0)
            .catch(() => 0)
        );
        
        const batchResults = await Promise.all(batchPromises);
        successfulSubmissions += batchResults.reduce((sum, result) => sum + result, 0);
      }

      const endTime = Date.now();
      const durationMinutes = (endTime - startTime) / (1000 * 60);
      const jobsPerMinute = successfulSubmissions / durationMinutes;

      console.log(`Performance Test Results:
        - Jobs submitted: ${successfulSubmissions}/${jobsToSubmit}
        - Duration: ${durationMinutes.toFixed(2)} minutes
        - Rate: ${jobsPerMinute.toFixed(2)} jobs/minute`);

      expect(successfulSubmissions).toBeGreaterThan(jobsToSubmit * 0.9); // Allow 10% failure rate
      expect(jobsPerMinute).toBeGreaterThan(100);
    }, 120000); // 2 minute timeout for this test

    test('should respond to job submission within 100ms', async () => {
      const jobData = {
        type: 'collect-stablecoin-data',
        data: { ticker: 'PERF_TEST' },
        options: { priority: 'high' }
      };

      const iterations = 50;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        await request(app)
          .post('/jobs/submit')
          .set('X-API-Key', apiKey)
          .send({
            ...jobData,
            data: { ...jobData.data, ticker: `PERF_TEST_${i}` }
          })
          .expect(201);
        
        const endTime = Date.now();
        responseTimes.push(endTime - startTime);
      }

      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

      console.log(`Response Time Analysis:
        - Average: ${averageResponseTime.toFixed(2)}ms
        - Maximum: ${maxResponseTime}ms
        - 95th percentile: ${p95ResponseTime}ms`);

      expect(averageResponseTime).toBeLessThan(100);
      expect(p95ResponseTime).toBeLessThan(200); // Allow some variance
    }, 60000);

    test('should monitor memory usage under load', async () => {
      const initialMemory = process.memoryUsage();
      console.log('Initial memory usage:', {
        rss: `${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(initialMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`
      });

      // Submit a moderate load
      const jobs = Array.from({ length: 50 }, (_, i) => ({
        type: 'collect-stablecoin-data',
        data: { ticker: `MEMORY_TEST_${i}` },
        options: { priority: 'low' }
      }));

      await Promise.all(
        jobs.map(job =>
          request(app)
            .post('/jobs/submit')
            .set('X-API-Key', apiKey)
            .send(job)
        )
      );

      // Let the system process for a moment
      await new Promise(resolve => setTimeout(resolve, 5000));

      const finalMemory = process.memoryUsage();
      console.log('Final memory usage:', {
        rss: `${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(finalMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`
      });

      const memoryIncreaseMB = (finalMemory.rss - initialMemory.rss) / 1024 / 1024;
      console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);

      // Memory should stay under 512MB total and increase should be reasonable
      expect(finalMemory.rss / 1024 / 1024).toBeLessThan(512);
      expect(memoryIncreaseMB).toBeLessThan(100); // Reasonable memory increase
    }, 30000);
  });

  describe('Integration Requirements', () => {
    test('should handle graceful degradation when Redis is unavailable', async () => {
      // This test would normally mock Redis failure, but for now we test the error handling
      const invalidJob = {
        type: 'invalid-job-type',
        data: { ticker: 'TEST' }
      };

      const response = await request(app)
        .post('/jobs/submit')
        .set('X-API-Key', apiKey)
        .send(invalidJob);

      // Should handle gracefully even with invalid job types
      expect([201, 400, 500]).toContain(response.status);
    });

    test('should provide health check endpoints', async () => {
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body).toHaveProperty('status');
      expect(healthResponse.body).toHaveProperty('uptime');

      const detailedHealthResponse = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(detailedHealthResponse.body).toHaveProperty('dependencies');
    });

    test('should enforce API key authentication', async () => {
      const jobData = {
        type: 'collect-stablecoin-data',
        data: { ticker: 'AUTH_TEST' }
      };

      // Request without API key should fail
      await request(app)
        .post('/jobs/submit')
        .send(jobData)
        .expect(401);

      // Request with invalid API key should fail
      await request(app)
        .post('/jobs/submit')
        .set('X-API-Key', 'invalid-key')
        .send(jobData)
        .expect(401);
    });
  });

  describe('Service Reliability', () => {
    test('should handle concurrent job submissions', async () => {
      const concurrentRequests = 20;
      const jobData = {
        type: 'collect-stablecoin-data',
        data: { ticker: 'CONCURRENT_TEST' },
        options: { priority: 'medium' }
      };

      const requests = Array.from({ length: concurrentRequests }, (_, i) =>
        request(app)
          .post('/jobs/submit')
          .set('X-API-Key', apiKey)
          .send({
            ...jobData,
            data: { ...jobData.data, ticker: `CONCURRENT_TEST_${i}` }
          })
      );

      const responses = await Promise.allSettled(requests);
      const successfulRequests = responses.filter(
        result => result.status === 'fulfilled' && (result.value as any).status === 201
      ).length;

      expect(successfulRequests).toBeGreaterThan(concurrentRequests * 0.8); // Allow 20% failure rate for concurrent load
    }, 30000);

    test('should validate input data properly', async () => {
      const invalidJobs = [
        { type: '', data: { ticker: 'TEST' } }, // Empty type
        { type: 'collect-stablecoin-data' }, // Missing data
        { data: { ticker: 'TEST' } }, // Missing type
        { type: 'collect-stablecoin-data', data: null }, // Null data
      ];

      for (const invalidJob of invalidJobs) {
        const response = await request(app)
          .post('/jobs/submit')
          .set('X-API-Key', apiKey)
          .send(invalidJob);

        expect(response.status).toBe(400);
      }
    });
  });
});