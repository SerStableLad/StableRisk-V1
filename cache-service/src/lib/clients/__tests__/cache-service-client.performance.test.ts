/**
 * Performance tests for Cache Service Client
 * 
 * Tests performance characteristics, benchmarks, and stress scenarios
 * to ensure the client meets performance requirements.
 */

import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { CacheServiceClient } from '../cache-service-client';

const server = setupServer();

describe('CacheServiceClient Performance Tests', () => {
  let client: CacheServiceClient;
  const baseUrl = 'http://localhost:3002';

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
    process.env.CACHE_SERVICE_URL = baseUrl;
    process.env.CACHE_SERVICE_TIMEOUT = '5000';
    process.env.CACHE_FALLBACK_MAX_ENTRIES = '10000';
  });

  beforeEach(() => {
    CacheServiceClient['instance'] = undefined as any;
    client = CacheServiceClient.getInstance();
    client.clearFallbackCache();
    server.resetHandlers();
  });

  afterEach(() => {
    client.shutdown();
  });

  afterAll(() => {
    server.close();
  });

  describe('Operation Latency Benchmarks', () => {
    it('should meet get operation latency requirements', async () => {
      const testValue = { data: 'performance-test-value', timestamp: Date.now() };
      
      server.use(
        http.get(`${baseUrl}/cache/get/perf-test-get`, () => {
          return HttpResponse.json({
            key: 'perf-test-get',
            value: testValue,
            found: true
          });
        })
      );

      const iterations = 100;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = await client.get('perf-test-get');
        const latency = performance.now() - start;
        
        latencies.push(latency);
        expect(result).toEqual(testValue);
      }

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];
      const maxLatency = Math.max(...latencies);

      console.log(`Get operation performance:
        Average: ${avgLatency.toFixed(2)}ms
        P95: ${p95Latency.toFixed(2)}ms
        Max: ${maxLatency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(global.testConstants.PERFORMANCE_THRESHOLDS.GET_OPERATION_MS);
      expect(p95Latency).toBeLessThan(global.testConstants.PERFORMANCE_THRESHOLDS.GET_OPERATION_MS * 2);
    });

    it('should meet set operation latency requirements', async () => {
      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.json({ success: true });
        })
      );

      const iterations = 100;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const testValue = { 
          data: `performance-test-value-${i}`, 
          timestamp: Date.now(),
          index: i
        };

        const start = performance.now();
        const result = await client.set(`perf-test-set-${i}`, testValue);
        const latency = performance.now() - start;
        
        latencies.push(latency);
        expect(result).toBe(true);
      }

      const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

      console.log(`Set operation performance:
        Average: ${avgLatency.toFixed(2)}ms
        P95: ${p95Latency.toFixed(2)}ms`);

      expect(avgLatency).toBeLessThan(global.testConstants.PERFORMANCE_THRESHOLDS.SET_OPERATION_MS);
      expect(p95Latency).toBeLessThan(global.testConstants.PERFORMANCE_THRESHOLDS.SET_OPERATION_MS * 2);
    });

    it('should meet mget operation latency requirements for bulk operations', async () => {
      const batchSizes = [10, 50, 100, 500];
      
      server.use(
        http.post(`${baseUrl}/cache/mget`, async ({ request }) => {
          const body = await request.json() as any;
          const results = body.keys.map((key: string, index: number) => ({
            key,
            value: { 
              data: `batch-value-${index}`, 
              timestamp: Date.now(),
              batchIndex: index
            }
          }));
          return HttpResponse.json({ results });
        })
      );

      for (const batchSize of batchSizes) {
        const keys = Array.from({ length: batchSize }, (_, i) => `batch-key-${i}`);
        
        const start = performance.now();
        const results = await client.mget(keys);
        const latency = performance.now() - start;
        
        expect(results).toHaveLength(batchSize);
        expect(results.every(item => item.value !== null)).toBe(true);
        
        const latencyPerItem = latency / batchSize;
        console.log(`Batch size ${batchSize}: ${latency.toFixed(2)}ms total, ${latencyPerItem.toFixed(2)}ms per item`);
        
        // Bulk operations should be more efficient than individual operations
        if (batchSize >= 50) {
          expect(latencyPerItem).toBeLessThan(global.testConstants.PERFORMANCE_THRESHOLDS.GET_OPERATION_MS / 2);
        }
      }
    });

    it('should meet fallback cache performance requirements', async () => {
      // Force all operations to use fallback
      server.use(
        http.post(`${baseUrl}/cache/set`, () => HttpResponse.error()),
        http.get(`${baseUrl}/cache/get/*`, () => HttpResponse.error())
      );

      const iterations = 1000;
      const setLatencies: number[] = [];
      const getLatencies: number[] = [];

      // Test fallback set performance
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await client.set(`fallback-perf-${i}`, { 
          data: `value-${i}`, 
          index: i 
        });
        setLatencies.push(performance.now() - start);
      }

      // Test fallback get performance
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await client.get(`fallback-perf-${i}`);
        getLatencies.push(performance.now() - start);
      }

      const avgSetLatency = setLatencies.reduce((sum, lat) => sum + lat, 0) / setLatencies.length;
      const avgGetLatency = getLatencies.reduce((sum, lat) => sum + lat, 0) / getLatencies.length;

      console.log(`Fallback cache performance:
        Set average: ${avgSetLatency.toFixed(2)}ms
        Get average: ${avgGetLatency.toFixed(2)}ms`);

      // Fallback operations should be very fast
      expect(avgSetLatency).toBeLessThan(1); // Should be sub-millisecond
      expect(avgGetLatency).toBeLessThan(1); // Should be sub-millisecond
    });
  });

  describe('Throughput and Concurrency', () => {
    it('should handle high concurrent load efficiently', async () => {
      const concurrentRequests = 1000;
      const responseTimes: number[] = [];

      server.use(
        http.post(`${baseUrl}/cache/set`, async () => {
          await delay(Math.random() * 10); // Simulate some latency
          return HttpResponse.json({ success: true });
        })
      );

      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, async (_, i) => {
        const requestStart = performance.now();
        const result = await client.set(`concurrent-${i}`, { 
          data: `value-${i}`, 
          timestamp: Date.now() 
        });
        const requestTime = performance.now() - requestStart;
        responseTimes.push(requestTime);
        return result;
      });

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;
      
      expect(results.every(result => result === true)).toBe(true);
      
      const throughput = concurrentRequests / (totalTime / 1000); // ops/second
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      
      console.log(`Concurrent load performance:
        Total time: ${totalTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} ops/second
        Average response time: ${avgResponseTime.toFixed(2)}ms
        P95 response time: ${responseTimes.sort((a, b) => a - b)[Math.floor(concurrentRequests * 0.95)].toFixed(2)}ms`);

      expect(throughput).toBeGreaterThan(100); // Should handle >100 ops/second
      expect(avgResponseTime).toBeLessThan(100); // Average response should be reasonable
    });

    it('should maintain performance during mixed operation patterns', async () => {
      server.use(
        http.post(`${baseUrl}/cache/set`, async () => {
          await delay(5);
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/*`, async () => {
          await delay(3);
          return HttpResponse.json({
            key: 'mixed-test',
            value: { data: 'test-value' },
            found: true
          });
        }),
        http.post(`${baseUrl}/cache/mget`, async ({ request }) => {
          await delay(10);
          const body = await request.json() as any;
          const results = body.keys.map((key: string) => ({ key, value: { data: key } }));
          return HttpResponse.json({ results });
        }),
        http.delete(`${baseUrl}/cache/delete/*`, async () => {
          await delay(4);
          return HttpResponse.json({ success: true });
        })
      );

      const operationCounts = { set: 0, get: 0, mget: 0, delete: 0 };
      const totalOperations = 500;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < totalOperations; i++) {
        const operation = Math.floor(Math.random() * 4);
        
        switch (operation) {
          case 0: // set
            operationCounts.set++;
            promises.push(client.set(`mixed-${i}`, { data: `value-${i}` }));
            break;
          case 1: // get
            operationCounts.get++;
            promises.push(client.get('mixed-test'));
            break;
          case 2: // mget
            operationCounts.mget++;
            promises.push(client.mget([`mixed-${i}`, `mixed-${i+1}`]));
            break;
          case 3: // delete
            operationCounts.delete++;
            promises.push(client.delete(`mixed-${i}`));
            break;
        }
      }

      const startTime = performance.now();
      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      expect(results).toHaveLength(totalOperations);
      
      const throughput = totalOperations / (totalTime / 1000);
      
      console.log(`Mixed operations performance:
        Operations: ${JSON.stringify(operationCounts)}
        Total time: ${totalTime.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} ops/second`);

      expect(throughput).toBeGreaterThan(50); // Should handle reasonable mixed load
    });

    it('should scale fallback operations linearly', async () => {
      // Force fallback mode
      server.use(
        http.post(`${baseUrl}/cache/set`, () => HttpResponse.error()),
        http.get(`${baseUrl}/cache/get/*`, () => HttpResponse.error())
      );

      const testSizes = [100, 500, 1000, 2000];
      const results: Array<{ size: number; setTime: number; getTime: number }> = [];

      for (const size of testSizes) {
        // Test set operations
        const setStart = performance.now();
        const setPromises = Array.from({ length: size }, (_, i) =>
          client.set(`scale-test-${i}`, { data: `value-${i}`, index: i })
        );
        await Promise.all(setPromises);
        const setTime = performance.now() - setStart;

        // Test get operations
        const getStart = performance.now();
        const getPromises = Array.from({ length: size }, (_, i) =>
          client.get(`scale-test-${i}`)
        );
        await Promise.all(getPromises);
        const getTime = performance.now() - getStart;

        results.push({ size, setTime, getTime });
        
        console.log(`Scale test ${size} operations:
          Set time: ${setTime.toFixed(2)}ms (${(setTime/size).toFixed(2)}ms per op)
          Get time: ${getTime.toFixed(2)}ms (${(getTime/size).toFixed(2)}ms per op)`);
      }

      // Check that operations scale reasonably (not exponentially)
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const current = results[i];
        const sizeRatio = current.size / prev.size;
        const setTimeRatio = current.setTime / prev.setTime;
        const getTimeRatio = current.getTime / prev.getTime;

        // Time should scale roughly linearly with size (allow some overhead)
        expect(setTimeRatio).toBeLessThan(sizeRatio * 1.5);
        expect(getTimeRatio).toBeLessThan(sizeRatio * 1.5);
      }
    });
  });

  describe('Memory Usage and Efficiency', () => {
    it('should efficiently manage memory during large data operations', async () => {
      server.use(
        http.post(`${baseUrl}/cache/set`, () => HttpResponse.error()) // Force fallback
      );

      const dataSizes = [1024, 10240, 102400]; // 1KB, 10KB, 100KB
      const memoryMeasurements: Array<{ size: number; memory: number; entries: number }> = [];

      for (const dataSize of dataSizes) {
        client.clearFallbackCache();
        
        const largeValue = {
          data: 'x'.repeat(dataSize),
          metadata: { size: dataSize, timestamp: Date.now() }
        };

        // Add 50 entries of this size
        for (let i = 0; i < 50; i++) {
          await client.set(`large-data-${dataSize}-${i}`, largeValue);
        }

        const memory = client['estimateFallbackMemoryUsage']();
        const entries = client.getConfiguration().fallbackCacheSize;
        
        memoryMeasurements.push({ size: dataSize, memory, entries });
        
        console.log(`Memory usage for ${dataSize} byte entries:
          Total memory: ${(memory / 1024).toFixed(2)} KB
          Entries: ${entries}
          Memory per entry: ${(memory / entries / 1024).toFixed(2)} KB`);
      }

      // Verify memory scales appropriately with data size
      for (let i = 1; i < memoryMeasurements.length; i++) {
        const prev = memoryMeasurements[i - 1];
        const current = memoryMeasurements[i];
        const sizeRatio = current.size / prev.size;
        const memoryRatio = current.memory / prev.memory;
        
        // Memory should scale roughly with data size
        expect(memoryRatio).toBeGreaterThan(sizeRatio * 0.8);
        expect(memoryRatio).toBeLessThan(sizeRatio * 1.5);
      }
    });

    it('should handle memory cleanup efficiently under pressure', async () => {
      server.use(
        http.post(`${baseUrl}/cache/set`, () => HttpResponse.error())
      );

      const maxEntries = client.getConfiguration().maxFallbackEntries;
      const overfillRatio = 1.5; // Add 50% more than max
      const entriesToAdd = Math.floor(maxEntries * overfillRatio);

      console.log(`Testing memory cleanup with ${entriesToAdd} entries (max: ${maxEntries})`);

      const addStart = performance.now();
      
      // Add more entries than the limit
      for (let i = 0; i < entriesToAdd; i++) {
        await client.set(`cleanup-test-${i}`, {
          data: `value-${i}`,
          index: i,
          timestamp: Date.now()
        });
      }
      
      const addTime = performance.now() - addStart;
      const finalEntries = client.getConfiguration().fallbackCacheSize;
      const finalMemory = client['estimateFallbackMemoryUsage']();

      console.log(`Memory cleanup performance:
        Add time: ${addTime.toFixed(2)}ms
        Final entries: ${finalEntries}
        Final memory: ${(finalMemory / 1024).toFixed(2)} KB
        Cleanup efficiency: ${((entriesToAdd - finalEntries) / entriesToAdd * 100).toFixed(1)}%`);

      // Should not exceed max entries
      expect(finalEntries).toBeLessThanOrEqual(maxEntries);
      
      // Should maintain reasonable performance even with cleanup
      expect(addTime / entriesToAdd).toBeLessThan(1); // < 1ms per operation on average
      
      // Most recent entries should still be accessible
      const recentValue = await client.get(`cleanup-test-${entriesToAdd - 1}`);
      expect(recentValue).toBeDefined();
    });

    it('should optimize memory usage for different data patterns', async () => {
      server.use(
        http.post(`${baseUrl}/cache/set`, () => HttpResponse.error())
      );

      const patterns = [
        { name: 'small-frequent', size: 100, count: 1000 },
        { name: 'medium-normal', size: 1000, count: 500 },
        { name: 'large-infrequent', size: 10000, count: 100 }
      ];

      const patternResults: Array<{
        pattern: string;
        memory: number;
        entries: number;
        efficiency: number;
      }> = [];

      for (const pattern of patterns) {
        client.clearFallbackCache();
        
        for (let i = 0; i < pattern.count; i++) {
          await client.set(`${pattern.name}-${i}`, {
            data: 'x'.repeat(pattern.size),
            pattern: pattern.name,
            index: i
          });
        }

        const memory = client['estimateFallbackMemoryUsage']();
        const entries = client.getConfiguration().fallbackCacheSize;
        const efficiency = memory / entries; // bytes per entry
        
        patternResults.push({
          pattern: pattern.name,
          memory,
          entries,
          efficiency
        });

        console.log(`Pattern '${pattern.name}':
          Memory: ${(memory / 1024).toFixed(2)} KB
          Entries: ${entries}
          Efficiency: ${efficiency.toFixed(0)} bytes/entry`);
      }

      // Verify efficiency correlates with data size
      const smallPattern = patternResults.find(p => p.pattern === 'small-frequent')!;
      const largePattern = patternResults.find(p => p.pattern === 'large-infrequent')!;
      
      expect(largePattern.efficiency).toBeGreaterThan(smallPattern.efficiency * 5);
    });
  });

  describe('Stress Testing', () => {
    it('should handle extreme load without degrading', async () => {
      const extremeOperations = 10000;
      let successfulOperations = 0;
      let failedOperations = 0;

      server.use(
        http.post(`${baseUrl}/cache/set`, async () => {
          // Simulate occasional failures under extreme load
          if (Math.random() < 0.1) {
            return HttpResponse.error();
          }
          await delay(Math.random() * 5);
          return HttpResponse.json({ success: true });
        })
      );

      const startTime = performance.now();
      const batchSize = 100;
      
      // Process in batches to avoid overwhelming the system
      for (let batch = 0; batch < extremeOperations / batchSize; batch++) {
        const batchPromises = Array.from({ length: batchSize }, async (_, i) => {
          const index = batch * batchSize + i;
          try {
            const result = await client.set(`stress-${index}`, {
              data: `stress-value-${index}`,
              timestamp: Date.now(),
              batch,
              index: i
            });
            if (result) successfulOperations++;
            else failedOperations++;
          } catch (error) {
            failedOperations++;
          }
        });
        
        await Promise.all(batchPromises);
        
        // Brief pause between batches
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const totalTime = performance.now() - startTime;
      const throughput = extremeOperations / (totalTime / 1000);
      const successRate = successfulOperations / extremeOperations;

      console.log(`Stress test results:
        Total operations: ${extremeOperations}
        Successful: ${successfulOperations}
        Failed: ${failedOperations}
        Success rate: ${(successRate * 100).toFixed(2)}%
        Total time: ${(totalTime / 1000).toFixed(2)}s
        Throughput: ${throughput.toFixed(2)} ops/second`);

      expect(successRate).toBeGreaterThan(0.95); // >95% success rate
      expect(throughput).toBeGreaterThan(1000); // >1000 ops/second
    });

    it('should recover quickly from service overload', async () => {
      let serverOverloaded = false;
      let requestCount = 0;

      server.use(
        http.post(`${baseUrl}/cache/set`, async () => {
          requestCount++;
          
          // Simulate server overload after 100 requests
          if (requestCount > 100 && requestCount < 200) {
            serverOverloaded = true;
            return HttpResponse.error();
          }
          
          if (requestCount >= 200) {
            serverOverloaded = false;
          }
          
          return HttpResponse.json({ success: true });
        })
      );

      const recoveryTest = async (phase: string, operations: number) => {
        const results: boolean[] = [];
        const start = performance.now();
        
        for (let i = 0; i < operations; i++) {
          const result = await client.set(`recovery-${phase}-${i}`, {
            data: `value-${i}`,
            phase,
            overloaded: serverOverloaded
          });
          results.push(result);
        }
        
        return {
          phase,
          duration: performance.now() - start,
          successRate: results.filter(r => r).length / results.length,
          serverOverloaded
        };
      };

      // Phase 1: Normal operation
      const phase1 = await recoveryTest('normal', 50);
      
      // Phase 2: During overload
      const phase2 = await recoveryTest('overload', 150);
      
      // Phase 3: After recovery
      const phase3 = await recoveryTest('recovery', 50);

      console.log(`Recovery test results:
        Phase 1 (normal): ${(phase1.successRate * 100).toFixed(1)}% success
        Phase 2 (overload): ${(phase2.successRate * 100).toFixed(1)}% success
        Phase 3 (recovery): ${(phase3.successRate * 100).toFixed(1)}% success`);

      // All phases should have high success rates due to fallback
      expect(phase1.successRate).toBe(1.0); // Perfect during normal operation
      expect(phase2.successRate).toBe(1.0); // Should maintain via fallback
      expect(phase3.successRate).toBe(1.0); // Should recover quickly
    });

    it('should maintain stability during prolonged operation', async () => {
      const testDuration = 5000; // 5 seconds
      const operationInterval = 10; // Every 10ms
      const operations: Array<{ timestamp: number; success: boolean; latency: number }> = [];

      server.use(
        http.post(`${baseUrl}/cache/set`, async () => {
          await delay(Math.random() * 20);
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/*`, async () => {
          await delay(Math.random() * 15);
          return HttpResponse.json({
            key: 'stability-test',
            value: { data: 'stable-value', timestamp: Date.now() },
            found: true
          });
        })
      );

      const startTime = performance.now();
      let operationIndex = 0;

      while (performance.now() - startTime < testDuration) {
        const opStart = performance.now();
        
        try {
          let result: any;
          if (operationIndex % 2 === 0) {
            result = await client.set(`stability-${operationIndex}`, {
              data: `value-${operationIndex}`,
              timestamp: Date.now()
            });
          } else {
            result = await client.get('stability-test');
          }
          
          operations.push({
            timestamp: performance.now(),
            success: !!result,
            latency: performance.now() - opStart
          });
        } catch (error) {
          operations.push({
            timestamp: performance.now(),
            success: false,
            latency: performance.now() - opStart
          });
        }

        operationIndex++;
        await new Promise(resolve => setTimeout(resolve, operationInterval));
      }

      const totalTime = performance.now() - startTime;
      const successRate = operations.filter(op => op.success).length / operations.length;
      const avgLatency = operations.reduce((sum, op) => sum + op.latency, 0) / operations.length;
      const throughput = operations.length / (totalTime / 1000);

      console.log(`Stability test results:
        Duration: ${(totalTime / 1000).toFixed(2)}s
        Operations: ${operations.length}
        Success rate: ${(successRate * 100).toFixed(2)}%
        Average latency: ${avgLatency.toFixed(2)}ms
        Throughput: ${throughput.toFixed(2)} ops/second`);

      expect(successRate).toBeGreaterThan(0.98); // >98% success rate
      expect(avgLatency).toBeLessThan(50); // Average latency reasonable
      expect(operations.length).toBeGreaterThan(400); // Should complete many operations
    });
  });
});