import request from 'supertest';
import express from 'express';
import { CacheController } from '../../controllers/cache-controller';
import { CacheManager } from '../../cache/cache-manager';

/**
 * Performance tests for Cache Controller API endpoints
 * These tests focus on load, throughput, and response time validation
 */

describe('Cache Controller Performance Tests', () => {
  let app: express.Application;
  let cacheManager: CacheManager;

  beforeAll(async () => {
    // Setup Express app with production-like middleware
    app = express();
    app.use(express.json({ limit: '50mb' }));
    
    // Error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
      if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON in request body' });
      }
      next(err);
    });
    
    app.use('/cache', CacheController.routes());

    // Initialize cache manager
    cacheManager = CacheManager.getInstance();
    await cacheManager.initialize();
  });

  afterAll(async () => {
    await cacheManager.shutdown();
  });

  describe('Throughput Tests', () => {
    it('should handle high-frequency SET operations', async () => {
      const operationCount = 1000;
      const startTime = Date.now();
      
      const setPromises = Array.from({ length: operationCount }, (_, i) =>
        request(app)
          .post('/cache/set')
          .send({ 
            key: `perf:set:${i}`, 
            value: { index: i, data: `Performance test data ${i}` },
            options: { ttl: 3600 }
          })
      );

      const results = await Promise.all(setPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (operationCount / duration) * 1000; // operations per second

      console.log(`SET Throughput: ${throughput.toFixed(2)} ops/sec`);
      console.log(`SET Duration: ${duration}ms for ${operationCount} operations`);

      // Verify all operations completed successfully
      const successfulOps = results.filter(r => [200, 201].includes(r.status)).length;
      expect(successfulOps).toBe(operationCount);

      // Performance assertion: should handle at least 100 ops/sec
      expect(throughput).toBeGreaterThan(100);
    }, 30000); // 30 second timeout

    it('should handle high-frequency GET operations', async () => {
      const operationCount = 1000;
      
      // Pre-populate cache with test data
      const setupPromises = Array.from({ length: 100 }, (_, i) =>
        request(app)
          .post('/cache/set')
          .send({ 
            key: `perf:get:${i}`, 
            value: { index: i, data: `Get test data ${i}` } 
          })
      );
      
      await Promise.all(setupPromises);

      const startTime = Date.now();
      
      const getPromises = Array.from({ length: operationCount }, (_, i) => {
        const keyIndex = i % 100; // Cycle through available keys
        return request(app).get(`/cache/get/perf%3Aget%3A${keyIndex}`);
      });

      const results = await Promise.all(getPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (operationCount / duration) * 1000;

      console.log(`GET Throughput: ${throughput.toFixed(2)} ops/sec`);
      console.log(`GET Duration: ${duration}ms for ${operationCount} operations`);

      // Verify all operations completed
      const completedOps = results.filter(r => [200, 404].includes(r.status)).length;
      expect(completedOps).toBe(operationCount);

      // Performance assertion: should handle at least 200 ops/sec
      expect(throughput).toBeGreaterThan(200);
    }, 30000);

    it('should handle mixed operation workload', async () => {
      const totalOperations = 1000;
      const setRatio = 0.3; // 30% SET operations
      const getRatio = 0.6; // 60% GET operations
      const deleteRatio = 0.1; // 10% DELETE operations

      const setCount = Math.floor(totalOperations * setRatio);
      const getCount = Math.floor(totalOperations * getRatio);
      const deleteCount = totalOperations - setCount - getCount;

      const startTime = Date.now();

      const operations = [
        // SET operations
        ...Array.from({ length: setCount }, (_, i) =>
          request(app)
            .post('/cache/set')
            .send({ 
              key: `mixed:set:${i}`, 
              value: { index: i, type: 'set' } 
            })
        ),
        // GET operations
        ...Array.from({ length: getCount }, (_, i) =>
          request(app).get(`/cache/get/mixed%3Akey%3A${i % 50}`)
        ),
        // DELETE operations
        ...Array.from({ length: deleteCount }, (_, i) =>
          request(app).delete(`/cache/delete/mixed%3Adel%3A${i}`)
        )
      ];

      // Shuffle operations to simulate real-world mixed workload
      const shuffledOps = operations.sort(() => Math.random() - 0.5);
      
      const results = await Promise.all(shuffledOps);
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (totalOperations / duration) * 1000;

      console.log(`Mixed Workload Throughput: ${throughput.toFixed(2)} ops/sec`);
      console.log(`Mixed Workload Duration: ${duration}ms for ${totalOperations} operations`);

      // Verify all operations completed
      const completedOps = results.filter(r => r.status < 500).length;
      expect(completedOps).toBe(totalOperations);

      // Performance assertion: should handle at least 150 ops/sec for mixed workload
      expect(throughput).toBeGreaterThan(150);
    }, 45000);
  });

  describe('Latency Tests', () => {
    it('should maintain low latency for individual SET operations', async () => {
      const iterations = 100;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .post('/cache/set')
          .send({ 
            key: `latency:set:${i}`, 
            value: { index: i, timestamp: Date.now() } 
          });

        const endTime = Date.now();
        const latency = endTime - startTime;
        latencies.push(latency);

        expect(response.status).toBe(201);
      }

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);
      
      // Calculate 95th percentile
      const sortedLatencies = latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(iterations * 0.95);
      const p95Latency = sortedLatencies[p95Index];

      console.log(`SET Latency - Avg: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency}ms, Min: ${minLatency}ms, P95: ${p95Latency}ms`);

      // Performance assertions
      expect(avgLatency).toBeLessThan(50); // Average should be under 50ms
      expect(p95Latency).toBeLessThan(100); // 95th percentile should be under 100ms
    }, 15000);

    it('should maintain low latency for individual GET operations', async () => {
      // Pre-populate cache
      await request(app)
        .post('/cache/set')
        .send({ key: 'latency:get:test', value: 'test value for latency' });

      const iterations = 100;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/cache/get/latency%3Aget%3Atest');

        const endTime = Date.now();
        const latency = endTime - startTime;
        latencies.push(latency);

        expect([200, 404]).toContain(response.status);
      }

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);
      
      const sortedLatencies = latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(iterations * 0.95);
      const p95Latency = sortedLatencies[p95Index];

      console.log(`GET Latency - Avg: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency}ms, Min: ${minLatency}ms, P95: ${p95Latency}ms`);

      // Performance assertions for GET operations (should be faster than SET)
      expect(avgLatency).toBeLessThan(25); // Average should be under 25ms
      expect(p95Latency).toBeLessThan(50); // 95th percentile should be under 50ms
    }, 15000);
  });

  describe('Bulk Operation Performance', () => {
    it('should efficiently handle large bulk SET operations', async () => {
      const batchSizes = [100, 500, 1000, 2000];

      for (const batchSize of batchSizes) {
        const entries = Array.from({ length: batchSize }, (_, i) => ({
          key: `bulk:perf:${batchSize}:${i}`,
          value: { 
            index: i, 
            batchSize,
            data: `Bulk performance test data for batch ${batchSize}` 
          },
          options: { ttl: 3600 }
        }));

        const startTime = Date.now();
        
        const response = await request(app)
          .post('/cache/bulk/set')
          .send({ entries })
          .timeout(30000);

        const endTime = Date.now();
        const duration = endTime - startTime;
        const throughput = (batchSize / duration) * 1000;

        console.log(`Bulk SET (${batchSize} items): ${duration}ms, ${throughput.toFixed(2)} ops/sec`);

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(batchSize);

        // Performance assertion: bulk operations should be more efficient than individual operations
        expect(throughput).toBeGreaterThan(50);
      }
    }, 60000);

    it('should efficiently handle large MGET operations', async () => {
      const testSizes = [100, 500, 1000];

      // Pre-populate cache
      const setupEntries = Array.from({ length: 1000 }, (_, i) => ({
        key: `mget:perf:${i}`,
        value: { index: i, data: `MGET test data ${i}` }
      }));

      await request(app)
        .post('/cache/bulk/set')
        .send({ entries: setupEntries })
        .timeout(30000);

      for (const testSize of testSizes) {
        const keys = Array.from({ length: testSize }, (_, i) => `mget:perf:${i}`);

        const startTime = Date.now();
        
        const response = await request(app)
          .post('/cache/mget')
          .send({ keys })
          .timeout(30000);

        const endTime = Date.now();
        const duration = endTime - startTime;
        const throughput = (testSize / duration) * 1000;

        console.log(`MGET (${testSize} keys): ${duration}ms, ${throughput.toFixed(2)} ops/sec`);

        expect(response.status).toBe(200);
        expect(response.body.results).toHaveLength(testSize);

        // Performance assertion: MGET should be very efficient
        expect(throughput).toBeGreaterThan(100);
      }
    }, 60000);
  });

  describe('Concurrent Load Tests', () => {
    it('should handle concurrent connections under load', async () => {
      const concurrentUsers = 50;
      const operationsPerUser = 20;
      const totalOperations = concurrentUsers * operationsPerUser;

      const startTime = Date.now();

      // Create concurrent user sessions
      const userSessions = Array.from({ length: concurrentUsers }, (_, userIndex) => {
        // Each user performs multiple operations
        const userOperations = Array.from({ length: operationsPerUser }, (_, opIndex) => {
          const operationType = opIndex % 3; // Cycle through operation types
          const keyBase = `concurrent:user${userIndex}:op${opIndex}`;

          switch (operationType) {
            case 0: // SET operation
              return request(app)
                .post('/cache/set')
                .send({ 
                  key: keyBase, 
                  value: { user: userIndex, operation: opIndex } 
                });
            case 1: // GET operation
              return request(app)
                .get(`/cache/get/${encodeURIComponent(keyBase)}`);
            case 2: // DELETE operation
              return request(app)
                .delete(`/cache/delete/${encodeURIComponent(keyBase)}`);
            default:
              return request(app).get('/cache/stats');
          }
        });

        return Promise.all(userOperations);
      });

      // Execute all user sessions concurrently
      const results = await Promise.all(userSessions);
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (totalOperations / duration) * 1000;

      console.log(`Concurrent Load Test: ${concurrentUsers} users, ${operationsPerUser} ops each`);
      console.log(`Total: ${totalOperations} operations in ${duration}ms`);
      console.log(`Throughput: ${throughput.toFixed(2)} ops/sec`);

      // Verify all sessions completed
      expect(results).toHaveLength(concurrentUsers);
      
      // Count successful operations
      const allResponses = results.flat();
      const successfulOps = allResponses.filter(r => r.status < 500).length;
      const successRate = (successfulOps / totalOperations) * 100;

      console.log(`Success Rate: ${successRate.toFixed(2)}%`);

      // Performance assertions
      expect(successRate).toBeGreaterThan(95); // At least 95% success rate
      expect(throughput).toBeGreaterThan(100); // At least 100 ops/sec under concurrent load
    }, 90000);

    it('should maintain performance under memory pressure', async () => {
      // Create large payload to simulate memory pressure
      const largePayload = {
        data: 'x'.repeat(1024 * 50), // 50KB per entry
        metadata: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          content: `Large content block ${i}`.repeat(20)
        }))
      };

      const operationCount = 200;
      const startTime = Date.now();

      const operations = Array.from({ length: operationCount }, (_, i) =>
        request(app)
          .post('/cache/set')
          .send({ 
            key: `memory:pressure:${i}`, 
            value: { ...largePayload, index: i },
            options: { ttl: 1800 }
          })
      );

      const results = await Promise.all(operations);
      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (operationCount / duration) * 1000;

      console.log(`Memory Pressure Test: ${operationCount} large payloads`);
      console.log(`Duration: ${duration}ms, Throughput: ${throughput.toFixed(2)} ops/sec`);

      const successfulOps = results.filter(r => [200, 201].includes(r.status)).length;
      const successRate = (successfulOps / operationCount) * 100;

      console.log(`Success Rate: ${successRate.toFixed(2)}%`);

      // Performance assertions under memory pressure
      expect(successRate).toBeGreaterThan(90); // At least 90% success rate
      expect(throughput).toBeGreaterThan(20); // At least 20 ops/sec for large payloads
    }, 60000);
  });

  describe('Invalidation Performance', () => {
    it('should efficiently handle tag-based invalidation at scale', async () => {
      const taggedEntryCount = 1000;
      const tagName = 'performance-invalidation-test';

      // Setup: Create many entries with the same tag
      const setupEntries = Array.from({ length: taggedEntryCount }, (_, i) => ({
        key: `tagged:perf:${i}`,
        value: { index: i, tag: tagName },
        options: { tags: [tagName, `subcat:${i % 10}`] }
      }));

      await request(app)
        .post('/cache/bulk/set')
        .send({ entries: setupEntries })
        .timeout(30000);

      // Performance test: Invalidate by tag
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/cache/invalidate/tag')
        .send({ tag: tagName })
        .timeout(15000);

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Tag Invalidation: ${taggedEntryCount} entries in ${duration}ms`);

      expect(response.status).toBe(200);
      expect(response.body.tag).toBe(tagName);

      // Performance assertion: should complete invalidation quickly
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    }, 60000);

    it('should efficiently handle pattern-based invalidation', async () => {
      const patternEntryCount = 500;
      const pattern = 'pattern:perf:*';

      // Setup: Create entries matching the pattern
      const setupEntries = Array.from({ length: patternEntryCount }, (_, i) => ({
        key: `pattern:perf:${i}`,
        value: { index: i, pattern: 'performance test' }
      }));

      await request(app)
        .post('/cache/bulk/set')
        .send({ entries: setupEntries })
        .timeout(30000);

      // Performance test: Invalidate by pattern
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/cache/invalidate/pattern')
        .send({ pattern })
        .timeout(15000);

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`Pattern Invalidation: ${patternEntryCount} entries in ${duration}ms`);

      expect(response.status).toBe(200);
      expect(response.body.pattern).toBe(pattern);

      // Performance assertion: should complete pattern matching quickly
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    }, 45000);
  });

  describe('Stats Performance', () => {
    it('should return stats quickly even with large cache', async () => {
      // Populate cache with significant data
      const entries = Array.from({ length: 1000 }, (_, i) => ({
        key: `stats:perf:${i}`,
        value: { index: i, data: `Stats performance test ${i}` }
      }));

      await request(app)
        .post('/cache/bulk/set')
        .send({ entries })
        .timeout(30000);

      // Test stats endpoint performance
      const iterations = 10;
      const statsTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        const response = await request(app)
          .get('/cache/stats')
          .timeout(5000);

        const endTime = Date.now();
        const duration = endTime - startTime;
        statsTimes.push(duration);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('memory');
        expect(response.body).toHaveProperty('keyCount');
      }

      const avgStatsTime = statsTimes.reduce((sum, time) => sum + time, 0) / iterations;
      const maxStatsTime = Math.max(...statsTimes);

      console.log(`Stats Performance - Avg: ${avgStatsTime.toFixed(2)}ms, Max: ${maxStatsTime}ms`);

      // Performance assertion: stats should be fast
      expect(avgStatsTime).toBeLessThan(100); // Average under 100ms
      expect(maxStatsTime).toBeLessThan(500); // Max under 500ms
    }, 60000);
  });
});