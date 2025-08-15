/**
 * Integration tests for Cache Service Client
 * 
 * Tests real HTTP communication patterns, service integration scenarios,
 * and end-to-end workflows.
 */

import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { CacheServiceClient } from '../cache-service-client';

const server = setupServer();

describe('CacheServiceClient Integration Tests', () => {
  let client: CacheServiceClient;
  const baseUrl = 'http://localhost:3002';

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
    process.env.CACHE_SERVICE_URL = baseUrl;
    process.env.CACHE_SERVICE_TIMEOUT = '5000';
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

  describe('End-to-End Cache Workflows', () => {
    it('should handle complete stablecoin data caching workflow', async () => {
      const stablecoinData = {
        ticker: 'USDT',
        price: 1.0001,
        marketCap: 83000000000,
        liquidity: {
          totalVolume24h: 45000000000,
          dexLiquidity: 2500000000
        },
        transparency: {
          auditScore: 0.85,
          reserveRatio: 1.02
        },
        timestamp: Date.now()
      };

      // Mock successful cache operations
      server.use(
        http.post(`${baseUrl}/cache/set`, async ({ request }) => {
          const body = await request.json() as any;
          expect(body.key).toContain('stablecoin:USDT');
          expect(body.options.tags).toContain('stablecoin');
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/stablecoin%3AUSDT%3Adata`, () => {
          return HttpResponse.json({
            key: 'stablecoin:USDT:data',
            value: stablecoinData,
            found: true
          });
        }),
        http.post(`${baseUrl}/cache/invalidate/tag`, async ({ request }) => {
          const body = await request.json() as any;
          expect(body.tag).toBe('stablecoin');
          return HttpResponse.json({
            tag: 'stablecoin',
            invalidatedCount: 5,
            invalidatedKeys: ['stablecoin:USDT:data', 'stablecoin:USDT:liquidity']
          });
        })
      );

      // 1. Cache stablecoin data
      const setResult = await client.set(
        'stablecoin:USDT:data',
        stablecoinData,
        {
          ttl: 3600,
          tags: ['stablecoin', 'USDT', 'price-data'],
          source: 'market-api'
        }
      );
      expect(setResult).toBe(true);

      // 2. Retrieve cached data
      const retrievedData = await client.get('stablecoin:USDT:data');
      expect(retrievedData).toEqual(stablecoinData);

      // 3. Invalidate by tag (simulate market update)
      const invalidatedKeys = await client.invalidateByTag('stablecoin');
      expect(invalidatedKeys).toHaveLength(2);
    });

    it('should handle batch operations for multiple stablecoins', async () => {
      const stablecoins = ['USDT', 'USDC', 'DAI', 'BUSD', 'FRAX'];
      const batchData = stablecoins.map(ticker => ({
        key: `stablecoin:${ticker}:price`,
        value: {
          ticker,
          price: 1.0 + (Math.random() - 0.5) * 0.01,
          timestamp: Date.now()
        },
        options: {
          ttl: 1800,
          tags: ['stablecoin', ticker, 'price'],
          source: 'price-aggregator'
        }
      }));

      server.use(
        // Bulk set operation
        http.post(`${baseUrl}/cache/bulk/set`, async ({ request }) => {
          const body = await request.json() as any;
          expect(body.entries).toHaveLength(5);
          return HttpResponse.json({
            total: 5,
            successful: 5,
            failed: 0
          });
        }),
        // Multi-get operation
        http.post(`${baseUrl}/cache/mget`, async ({ request }) => {
          const body = await request.json() as any;
          const results = body.keys.map((key: string) => {
            const ticker = key.split(':')[1];
            return {
              key,
              value: {
                ticker,
                price: 1.0,
                timestamp: Date.now()
              }
            };
          });
          return HttpResponse.json({ results });
        })
      );

      // Simulate bulk set (would need to be implemented in client)
      const setPromises = batchData.map(({ key, value, options }) =>
        client.set(key, value, options)
      );
      const setResults = await Promise.all(setPromises);
      expect(setResults.every(result => result === true)).toBe(true);

      // Retrieve all prices
      const keys = batchData.map(({ key }) => key);
      const retrievedData = await client.mget(keys);
      expect(retrievedData).toHaveLength(5);
      expect(retrievedData.every(item => item.value !== null)).toBe(true);
    });

    it('should gracefully handle service degradation during high load', async () => {
      let requestCount = 0;
      const maxSuccessfulRequests = 50;

      server.use(
        http.post(`${baseUrl}/cache/set`, async () => {
          requestCount++;
          
          // Simulate increasing latency and eventual failure under load
          const latency = Math.min(requestCount * 10, 1000);
          await delay(latency);
          
          if (requestCount > maxSuccessfulRequests) {
            return HttpResponse.error();
          }
          
          return HttpResponse.json({ success: true });
        })
      );

      // Generate high load
      const operations = Array.from({ length: 100 }, (_, i) =>
        client.set(`load-test-${i}`, { data: `value-${i}`, index: i })
      );

      const results = await Promise.all(operations);
      
      // All operations should succeed (some via fallback)
      expect(results.every(result => result === true)).toBe(true);
      
      // Verify fallback cache has entries for failed requests
      const fallbackSize = client.getConfiguration().fallbackCacheSize;
      expect(fallbackSize).toBeGreaterThan(0);
    });
  });

  describe('Service Discovery and Health Monitoring', () => {
    it('should monitor service health and adapt behavior', async () => {
      let isHealthy = true;
      
      server.use(
        http.get(`${baseUrl}/health`, () => {
          if (isHealthy) {
            return HttpResponse.json({ status: 'healthy' });
          } else {
            return HttpResponse.json({ status: 'unhealthy' }, { status: 503 });
          }
        }),
        http.post(`${baseUrl}/cache/set`, () => {
          if (isHealthy) {
            return HttpResponse.json({ success: true });
          } else {
            return HttpResponse.error();
          }
        })
      );

      // Initially healthy
      expect(await client.healthCheck()).toBe(true);
      expect(await client.set('health-test-1', { data: 'test1' })).toBe(true);

      // Simulate service becoming unhealthy
      isHealthy = false;
      expect(await client.healthCheck()).toBe(false);
      
      // Operations should still succeed via fallback
      expect(await client.set('health-test-2', { data: 'test2' })).toBe(true);

      // Service recovery
      isHealthy = true;
      expect(await client.healthCheck()).toBe(true);
      expect(await client.set('health-test-3', { data: 'test3' })).toBe(true);
    });

    it('should handle intermittent network connectivity', async () => {
      let networkUp = true;
      let requestCount = 0;

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          requestCount++;
          
          // Toggle network every 3 requests
          if (requestCount % 3 === 0) {
            networkUp = !networkUp;
          }
          
          if (!networkUp) {
            return HttpResponse.error();
          }
          
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/*`, () => {
          if (!networkUp) {
            return HttpResponse.error();
          }
          
          return HttpResponse.json({
            key: 'test-key',
            value: { data: 'service-value' },
            found: true
          });
        })
      );

      // Set fallback data
      client['setFallback']('intermittent-key', { data: 'fallback-value' }, { ttl: 3600 });

      const operations = [];
      
      // Perform operations during network toggling
      for (let i = 0; i < 10; i++) {
        operations.push(client.set(`key-${i}`, { data: `value-${i}` }));
        operations.push(client.get('intermittent-key'));
      }

      const results = await Promise.all(operations);
      
      // All operations should complete successfully
      expect(results.length).toBe(20);
      
      // Set operations should all succeed (via service or fallback)
      const setResults = results.filter((_, index) => index % 2 === 0);
      expect(setResults.every(result => result === true)).toBe(true);
      
      // Get operations should return either service or fallback data
      const getResults = results.filter((_, index) => index % 2 === 1);
      expect(getResults.every(result => 
        result && (result.data === 'service-value' || result.data === 'fallback-value')
      )).toBe(true);
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle progressive data loading pattern', async () => {
      // Simulate progressive loading where we first load basic data,
      // then enhance with additional details
      
      const basicData = {
        ticker: 'PYUSD',
        price: 1.0005,
        timestamp: Date.now()
      };

      const enhancedData = {
        ...basicData,
        liquidity: { totalVolume24h: 150000000 },
        transparency: { auditScore: 0.92 },
        collateral: {
          types: ['USD', 'Treasury Bills'],
          breakdown: { usd: 0.7, treasuries: 0.3 }
        }
      };

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/stablecoin%3APYUSD%3Abasic`, () => {
          return HttpResponse.json({
            key: 'stablecoin:PYUSD:basic',
            value: basicData,
            found: true
          });
        }),
        http.get(`${baseUrl}/cache/get/stablecoin%3APYUSD%3Aenhanced`, () => {
          return HttpResponse.json({
            key: 'stablecoin:PYUSD:enhanced',
            value: enhancedData,
            found: true
          });
        })
      );

      // 1. Cache basic data first (fast load)
      await client.set('stablecoin:PYUSD:basic', basicData, {
        ttl: 1800,
        tags: ['stablecoin', 'PYUSD', 'basic'],
        source: 'quick-api'
      });

      // 2. Retrieve basic data immediately
      const basic = await client.get('stablecoin:PYUSD:basic');
      expect(basic).toEqual(basicData);

      // 3. Cache enhanced data (slower to compute)
      await client.set('stablecoin:PYUSD:enhanced', enhancedData, {
        ttl: 3600,
        tags: ['stablecoin', 'PYUSD', 'enhanced'],
        source: 'comprehensive-api'
      });

      // 4. Retrieve enhanced data
      const enhanced = await client.get('stablecoin:PYUSD:enhanced');
      expect(enhanced).toEqual(enhancedData);
      expect(enhanced.collateral).toBeDefined();
    });

    it('should handle cache warming scenario', async () => {
      const popularStablecoins = ['USDT', 'USDC', 'DAI'];
      let cacheRequests = 0;

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          cacheRequests++;
          return HttpResponse.json({ success: true });
        }),
        http.post(`${baseUrl}/cache/mget`, async ({ request }) => {
          const body = await request.json() as any;
          const results = body.keys.map((key: string) => ({
            key,
            value: { 
              ticker: key.split(':')[1],
              warmed: true,
              timestamp: Date.now()
            }
          }));
          return HttpResponse.json({ results });
        })
      );

      // Cache warming - preload popular data
      const warmingPromises = popularStablecoins.map(ticker =>
        client.set(`stablecoin:${ticker}:warm`, {
          ticker,
          warmed: true,
          timestamp: Date.now()
        }, {
          ttl: 7200, // Longer TTL for warmed data
          tags: ['stablecoin', ticker, 'warmed']
        })
      );

      await Promise.all(warmingPromises);
      expect(cacheRequests).toBe(3);

      // Verify all data can be retrieved efficiently
      const warmKeys = popularStablecoins.map(ticker => `stablecoin:${ticker}:warm`);
      const warmedData = await client.mget(warmKeys);
      
      expect(warmedData).toHaveLength(3);
      expect(warmedData.every(item => 
        item.value && item.value.warmed === true
      )).toBe(true);
    });

    it('should handle cache invalidation cascades', async () => {
      let invalidationRequests: string[] = [];

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.json({ success: true });
        }),
        http.post(`${baseUrl}/cache/invalidate/tag`, async ({ request }) => {
          const body = await request.json() as any;
          invalidationRequests.push(body.tag);
          
          const mockInvalidated = {
            'stablecoin': ['usdt:price', 'usdt:liquidity', 'usdt:transparency'],
            'price-data': ['usdt:price', 'usdc:price', 'dai:price'],
            'USDT': ['usdt:price', 'usdt:liquidity', 'usdt:transparency', 'usdt:collateral']
          };
          
          return HttpResponse.json({
            tag: body.tag,
            invalidatedCount: mockInvalidated[body.tag as keyof typeof mockInvalidated]?.length || 0,
            invalidatedKeys: mockInvalidated[body.tag as keyof typeof mockInvalidated] || []
          });
        })
      );

      // Set up related cache entries
      await Promise.all([
        client.set('usdt:price', { price: 1.0001 }, { tags: ['stablecoin', 'price-data', 'USDT'] }),
        client.set('usdt:liquidity', { volume: 1000000 }, { tags: ['stablecoin', 'liquidity-data', 'USDT'] }),
        client.set('usdt:transparency', { score: 0.85 }, { tags: ['stablecoin', 'transparency-data', 'USDT'] }),
        client.set('usdc:price', { price: 0.9998 }, { tags: ['stablecoin', 'price-data', 'USDC'] })
      ]);

      // Invalidate by different tag types
      const priceInvalidated = await client.invalidateByTag('price-data');
      const usdtInvalidated = await client.invalidateByTag('USDT');
      const stablecoinInvalidated = await client.invalidateByTag('stablecoin');

      expect(invalidationRequests).toEqual(['price-data', 'USDT', 'stablecoin']);
      expect(priceInvalidated).toContain('usdt:price');
      expect(usdtInvalidated).toContain('usdt:liquidity');
      expect(stablecoinInvalidated).toContain('usdt:transparency');
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from complete service outage', async () => {
      // Initially working service
      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/*`, () => {
          return HttpResponse.json({
            key: 'test-key',
            value: { data: 'service-value' },
            found: true
          });
        })
      );

      // Normal operation
      await client.set('outage-test', { data: 'initial-value' });
      expect(await client.get('outage-test')).toEqual({ data: 'service-value' });

      // Simulate complete service outage
      server.resetHandlers();
      server.use(
        http.post(`${baseUrl}/cache/set`, () => HttpResponse.error()),
        http.get(`${baseUrl}/cache/get/*`, () => HttpResponse.error()),
        http.get(`${baseUrl}/health`, () => HttpResponse.error())
      );

      // During outage - should use fallback
      await client.set('outage-test-2', { data: 'fallback-value' });
      expect(await client.get('outage-test-2')).toEqual({ data: 'fallback-value' });
      expect(await client.healthCheck()).toBe(false);

      // Service recovery
      server.resetHandlers();
      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/recovery-test`, () => {
          return HttpResponse.json({
            key: 'recovery-test',
            value: { data: 'recovered-value' },
            found: true
          });
        }),
        http.get(`${baseUrl}/health`, () => {
          return HttpResponse.json({ status: 'healthy' });
        })
      );

      // After recovery - should use service again
      await client.set('recovery-test', { data: 'post-recovery' });
      expect(await client.get('recovery-test')).toEqual({ data: 'recovered-value' });
      expect(await client.healthCheck()).toBe(true);

      // Fallback data should still be accessible
      expect(await client.get('outage-test-2')).toEqual({ data: 'fallback-value' });
    });

    it('should handle partial service degradation gracefully', async () => {
      let setFailureRate = 0;
      let getFailureRate = 0;
      let requestCount = 0;

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          requestCount++;
          if (Math.random() < setFailureRate) {
            return HttpResponse.error();
          }
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/*`, () => {
          if (Math.random() < getFailureRate) {
            return HttpResponse.error();
          }
          return HttpResponse.json({
            key: 'degraded-test',
            value: { data: 'service-value' },
            found: true
          });
        })
      );

      // Test increasing failure rates
      const results = [];
      
      for (const rate of [0.2, 0.5, 0.8]) {
        setFailureRate = rate;
        getFailureRate = rate;
        
        // Set fallback data
        client['setFallback']('degraded-test', { data: 'fallback-value' }, { ttl: 3600 });
        
        // Perform operations
        const operationResults = await Promise.all([
          client.set('degraded-test', { data: 'test' }),
          client.set('degraded-test', { data: 'test' }),
          client.set('degraded-test', { data: 'test' }),
          client.get('degraded-test'),
          client.get('degraded-test'),
          client.get('degraded-test')
        ]);
        
        results.push({
          failureRate: rate,
          allSucceeded: operationResults.every(result => 
            result === true || (result && (result.data === 'service-value' || result.data === 'fallback-value'))
          )
        });
      }
      
      // All operations should succeed regardless of failure rate
      expect(results.every(r => r.allSucceeded)).toBe(true);
    });
  });

  describe('Performance Under Load', () => {
    it('should maintain performance during concurrent operations', async () => {
      const concurrentOperations = 100;
      let completedRequests = 0;

      server.use(
        http.post(`${baseUrl}/cache/set`, async () => {
          await delay(Math.random() * 50); // Simulate variable latency
          completedRequests++;
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/*`, async () => {
          await delay(Math.random() * 30);
          return HttpResponse.json({
            key: 'concurrent-test',
            value: { data: 'test-value', timestamp: Date.now() },
            found: true
          });
        })
      );

      const startTime = Date.now();
      
      // Mix of set and get operations
      const operations = [];
      for (let i = 0; i < concurrentOperations; i++) {
        if (i % 2 === 0) {
          operations.push(client.set(`concurrent-${i}`, { data: `value-${i}` }));
        } else {
          operations.push(client.get('concurrent-test'));
        }
      }

      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      // All operations should complete
      expect(results).toHaveLength(concurrentOperations);
      
      // Set operations should succeed
      const setResults = results.filter((_, index) => index % 2 === 0);
      expect(setResults.every(result => result === true)).toBe(true);
      
      // Get operations should return data
      const getResults = results.filter((_, index) => index % 2 === 1);
      expect(getResults.every(result => result && result.data === 'test-value')).toBe(true);
      
      // Should complete in reasonable time
      expect(duration).toBeLessThan(2000); // Should be much faster due to concurrency
    });

    it('should handle memory pressure during extended operations', async () => {
      const largeDataSize = 10000; // 10KB per entry
      const numberOfEntries = 100;

      server.use(
        http.post(`${baseUrl}/cache/set`, () => HttpResponse.error()), // Force fallback
        http.get(`${baseUrl}/cache/get/*`, () => HttpResponse.error())
      );

      const initialMemory = client['estimateFallbackMemoryUsage']();
      
      // Create large entries
      for (let i = 0; i < numberOfEntries; i++) {
        await client.set(`large-entry-${i}`, {
          data: 'x'.repeat(largeDataSize),
          index: i,
          metadata: { size: largeDataSize, created: Date.now() }
        });
      }

      const peakMemory = client['estimateFallbackMemoryUsage']();
      const fallbackSize = client.getConfiguration().fallbackCacheSize;

      expect(peakMemory).toBeGreaterThan(initialMemory);
      expect(fallbackSize).toBeGreaterThan(0);
      expect(fallbackSize).toBeLessThanOrEqual(client.getConfiguration().maxFallbackEntries);

      // Verify we can still retrieve data
      const retrievedData = await client.get('large-entry-50');
      expect(retrievedData).toBeDefined();
      expect(retrievedData.data).toBe('x'.repeat(largeDataSize));
    });
  });
});