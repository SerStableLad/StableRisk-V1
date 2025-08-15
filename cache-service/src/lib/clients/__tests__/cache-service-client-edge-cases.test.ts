/**
 * Additional Edge Case Tests for Cache Service Client
 * 
 * These tests focus on edge cases and specific scenarios that aren't covered
 * in the main test suite, ensuring complete robustness of the cache client.
 */

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { CacheServiceClient } from '../cache-service-client';

const server = setupServer();

describe('CacheServiceClient - Edge Cases', () => {
  let client: CacheServiceClient;
  const baseUrl = 'http://localhost:3002';

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
    process.env.CACHE_SERVICE_URL = baseUrl;
    process.env.CACHE_SERVICE_TIMEOUT = '2000';
    process.env.CACHE_FALLBACK_MAX_ENTRIES = '100';
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

  describe('Memory Management Edge Cases', () => {
    it('should handle circular references in values gracefully', async () => {
      const circularObj: any = { id: 'test' };
      circularObj.self = circularObj;

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.error();
        })
      );

      // Should not crash despite circular reference
      const result = await client.set('circular-key', circularObj);
      expect(result).toBe(true); // Falls back to local cache
      
      // Memory estimation should handle circular references
      const memoryUsage = client['estimateFallbackMemoryUsage']();
      expect(typeof memoryUsage).toBe('number');
      expect(memoryUsage).toBeGreaterThan(0);
    });

    it('should handle very large keys', async () => {
      const largeKey = 'x'.repeat(1000);
      
      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/${encodeURIComponent(largeKey)}`, () => {
          return HttpResponse.json({
            key: largeKey,
            value: { data: 'test' },
            found: true
          });
        })
      );

      const setResult = await client.set(largeKey, { data: 'test' });
      expect(setResult).toBe(true);

      const getResult = await client.get(largeKey);
      expect(getResult).toEqual({ data: 'test' });
    });

    it('should handle values with special characters and unicode', async () => {
      const unicodeValue = {
        text: '测试数据 🚀 émojis and spéciàl chäracters',
        symbols: '!@#$%^&*()[]{}|\\:";\'<>?,./',
        unicode: '\u{1F600}\u{1F601}\u{1F602}'
      };

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.error();
        })
      );

      const result = await client.set('unicode-key', unicodeValue);
      expect(result).toBe(true);

      const retrieved = client['getFallback']('unicode-key');
      expect(retrieved).toEqual(unicodeValue);
    });

    it('should handle undefined and null values correctly', async () => {
      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.error();
        })
      );

      // Test with null
      const nullResult = await client.set('null-key', null);
      expect(nullResult).toBe(true);
      expect(client['getFallback']('null-key')).toBeNull();

      // Test with undefined
      const undefinedResult = await client.set('undefined-key', undefined);
      expect(undefinedResult).toBe(true);
      expect(client['getFallback']('undefined-key')).toBeUndefined();

      // Test with nested null/undefined
      const complexResult = await client.set('complex-key', {
        nullValue: null,
        undefinedValue: undefined,
        definedValue: 'test'
      });
      expect(complexResult).toBe(true);
      
      const retrievedComplex = client['getFallback']('complex-key');
      expect(retrievedComplex.nullValue).toBeNull();
      expect(retrievedComplex.undefinedValue).toBeUndefined();
      expect(retrievedComplex.definedValue).toBe('test');
    });
  });

  describe('Network Edge Cases', () => {
    it('should handle response with no content-type header', async () => {
      server.use(
        http.get(`${baseUrl}/cache/get/no-content-type`, () => {
          return new Response('{"key":"no-content-type","value":{"data":"test"},"found":true}', {
            status: 200
            // No content-type header
          });
        })
      );

      const result = await client.get('no-content-type');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle response with wrong content-type', async () => {
      server.use(
        http.get(`${baseUrl}/cache/get/wrong-content-type`, () => {
          return new Response('{"key":"wrong-content-type","value":{"data":"test"},"found":true}', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' }
          });
        })
      );

      const result = await client.get('wrong-content-type');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle empty response body', async () => {
      server.use(
        http.get(`${baseUrl}/cache/get/empty-body`, () => {
          return new Response('', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );

      const result = await client.get('empty-body');
      expect(result).toBeNull();
    });

    it('should handle response with BOM (Byte Order Mark)', async () => {
      const jsonWithBOM = '\ufeff{"key":"bom-test","value":{"data":"test"},"found":true}';
      
      server.use(
        http.get(`${baseUrl}/cache/get/bom-test`, () => {
          return new Response(jsonWithBOM, {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );

      const result = await client.get('bom-test');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle network issues during request', async () => {
      let callCount = 0;
      
      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          callCount++;
          if (callCount === 1) {
            // First call fails
            return HttpResponse.error();
          }
          // Subsequent calls succeed
          return HttpResponse.json({ success: true });
        })
      );

      // First call should fail and use fallback
      const firstResult = await client.set('network-test', { data: 'test1' });
      expect(firstResult).toBe(true);
      
      // Should be in fallback cache
      expect(client['getFallback']('network-test')).toEqual({ data: 'test1' });

      // Second call should succeed via service
      const secondResult = await client.set('network-test-2', { data: 'test2' });
      expect(secondResult).toBe(true);
    });
  });

  describe('Concurrency Edge Cases', () => {
    it('should handle rapid successive calls to same key', async () => {
      server.use(
        http.post(`${baseUrl}/cache/set`, async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return HttpResponse.json({ success: true });
        })
      );

      // Make 10 rapid calls to set the same key
      const promises = Array.from({ length: 10 }, (_, i) =>
        client.set('rapid-key', { data: `value-${i}` })
      );

      const results = await Promise.all(promises);
      expect(results.every(result => result === true)).toBe(true);
    });

    it('should handle mixed operations on same key', async () => {
      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.json({ success: true });
        }),
        http.get(`${baseUrl}/cache/get/mixed-key`, () => {
          return HttpResponse.json({
            key: 'mixed-key',
            value: { data: 'test' },
            found: true
          });
        }),
        http.delete(`${baseUrl}/cache/delete/mixed-key`, () => {
          return HttpResponse.json({ success: true });
        })
      );

      // Perform mixed operations concurrently
      const operations = [
        client.set('mixed-key', { data: 'test' }),
        client.get('mixed-key'),
        client.delete('mixed-key'),
        client.get('mixed-key'),
        client.set('mixed-key', { data: 'test2' })
      ];

      const results = await Promise.all(operations);
      
      // Should not crash and return reasonable results
      expect(results).toHaveLength(5);
      expect(typeof results[0]).toBe('boolean'); // set result
      expect(typeof results[2]).toBe('boolean'); // delete result
      expect(typeof results[4]).toBe('boolean'); // set result
    });

    it('should handle fallback cache operations during concurrent access', async () => {
      // Set up some data in fallback
      client['setFallback']('concurrent-key', { data: 'initial' }, { ttl: 3600 });

      server.use(
        http.get(`${baseUrl}/cache/get/concurrent-key`, () => {
          return HttpResponse.error();
        })
      );

      // Multiple concurrent reads from fallback
      const reads = Array.from({ length: 20 }, () => 
        client.get('concurrent-key')
      );

      const results = await Promise.all(reads);
      expect(results.every(result => 
        result && result.data === 'initial'
      )).toBe(true);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle configuration changes during runtime', async () => {
      const originalTimeout = process.env.CACHE_SERVICE_TIMEOUT;
      
      // Change timeout during runtime
      process.env.CACHE_SERVICE_TIMEOUT = '5000';
      
      // Create new instance to pick up new config
      CacheServiceClient['instance'] = undefined as any;
      const newClient = CacheServiceClient.getInstance();
      
      expect(newClient.getConfiguration().timeout).toBe(5000);
      
      newClient.shutdown();
      
      // Restore original timeout
      if (originalTimeout) {
        process.env.CACHE_SERVICE_TIMEOUT = originalTimeout;
      } else {
        delete process.env.CACHE_SERVICE_TIMEOUT;
      }
    });

    it('should handle extreme timeout values', async () => {
      const originalTimeout = process.env.CACHE_SERVICE_TIMEOUT;
      
      // Test with maximum timeout
      process.env.CACHE_SERVICE_TIMEOUT = '60000';
      CacheServiceClient['instance'] = undefined as any;
      const maxTimeoutClient = CacheServiceClient.getInstance();
      expect(maxTimeoutClient.getConfiguration().timeout).toBe(60000);
      maxTimeoutClient.shutdown();
      
      // Test with minimum timeout  
      process.env.CACHE_SERVICE_TIMEOUT = '1';
      CacheServiceClient['instance'] = undefined as any;
      const minTimeoutClient = CacheServiceClient.getInstance();
      expect(minTimeoutClient.getConfiguration().timeout).toBe(1);
      minTimeoutClient.shutdown();
      
      // Restore original timeout
      if (originalTimeout) {
        process.env.CACHE_SERVICE_TIMEOUT = originalTimeout;
      } else {
        delete process.env.CACHE_SERVICE_TIMEOUT;
      }
    });

    it('should handle malformed environment variables gracefully', async () => {
      const originalValues = {
        timeout: process.env.CACHE_SERVICE_TIMEOUT,
        maxEntries: process.env.CACHE_FALLBACK_MAX_ENTRIES
      };
      
      // Test with non-numeric timeout
      process.env.CACHE_SERVICE_TIMEOUT = 'not-a-number';
      process.env.CACHE_FALLBACK_MAX_ENTRIES = 'also-not-a-number';
      
      CacheServiceClient['instance'] = undefined as any;
      const malformedClient = CacheServiceClient.getInstance();
      
      const config = malformedClient.getConfiguration();
      expect(typeof config.timeout).toBe('number');
      expect(typeof config.maxFallbackEntries).toBe('number');
      
      malformedClient.shutdown();
      
      // Restore original values
      if (originalValues.timeout) {
        process.env.CACHE_SERVICE_TIMEOUT = originalValues.timeout;
      } else {
        delete process.env.CACHE_SERVICE_TIMEOUT;
      }
      
      if (originalValues.maxEntries) {
        process.env.CACHE_FALLBACK_MAX_ENTRIES = originalValues.maxEntries;
      } else {
        delete process.env.CACHE_FALLBACK_MAX_ENTRIES;
      }
    });
  });

  describe('Cleanup Edge Cases', () => {
    it('should handle cleanup during active operations', async () => {
      jest.useFakeTimers();
      
      const cleanupClient = CacheServiceClient.getInstance();
      
      // Add some data
      cleanupClient['setFallback']('cleanup-test-1', 'value1', { ttl: 1 });
      cleanupClient['setFallback']('cleanup-test-2', 'value2', { ttl: 3600 });
      
      expect(cleanupClient.getConfiguration().fallbackCacheSize).toBe(2);
      
      // Advance time to expire first entry
      jest.advanceTimersByTime(1500);
      
      // Trigger cleanup while doing operations
      const getPromise = cleanupClient.get('cleanup-test-2');
      cleanupClient['cleanupFallbackCache']();
      
      const result = await getPromise;
      
      expect(cleanupClient.getConfiguration().fallbackCacheSize).toBe(1);
      expect(cleanupClient['getFallback']('cleanup-test-1')).toBeNull();
      expect(cleanupClient['getFallback']('cleanup-test-2')).toBe('value2');
      
      cleanupClient.shutdown();
      jest.useRealTimers();
    });

    it('should handle multiple shutdown calls', async () => {
      const shutdownClient = CacheServiceClient.getInstance();
      
      shutdownClient['setFallback']('shutdown-test', 'value', { ttl: 3600 });
      expect(shutdownClient.getConfiguration().fallbackCacheSize).toBe(1);
      
      // Multiple shutdown calls should not cause issues
      shutdownClient.shutdown();
      shutdownClient.shutdown();
      shutdownClient.shutdown();
      
      expect(shutdownClient.getConfiguration().fallbackCacheSize).toBe(0);
      expect(shutdownClient['fallbackCleanupInterval']).toBeNull();
    });

    it('should handle shutdown during interval operations', async () => {
      jest.useFakeTimers();
      
      const intervalClient = CacheServiceClient.getInstance();
      
      // Add data that will be cleaned up
      intervalClient['setFallback']('interval-test', 'value', { ttl: 1 });
      
      // Advance time to trigger cleanup
      jest.advanceTimersByTime(1500);
      
      // Schedule cleanup interval
      jest.advanceTimersByTime(5 * 60 * 1000);
      
      // Shutdown during interval
      intervalClient.shutdown();
      
      // Should not cause issues
      expect(intervalClient['fallbackCleanupInterval']).toBeNull();
      
      jest.useRealTimers();
    });
  });

  describe('Data Integrity Edge Cases', () => {
    it('should preserve data types in fallback cache', async () => {
      const testData = {
        string: 'test',
        number: 42,
        boolean: true,
        null_val: null,
        undefined_val: undefined,
        array: [1, 2, 3],
        nested: {
          deep: {
            value: 'nested'
          }
        },
        date: new Date('2023-01-01'),
        regex: /test/g
      };

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.error();
        })
      );

      const result = await client.set('data-types', testData);
      expect(result).toBe(true);

      const retrieved = client['getFallback']('data-types');
      
      // Note: Date and RegExp objects will be serialized as strings
      expect(retrieved.string).toBe('test');
      expect(retrieved.number).toBe(42);
      expect(retrieved.boolean).toBe(true);
      expect(retrieved.null_val).toBeNull();
      expect(retrieved.undefined_val).toBeUndefined();
      expect(retrieved.array).toEqual([1, 2, 3]);
      expect(retrieved.nested.deep.value).toBe('nested');
    });

    it('should handle cache corruption gracefully', async () => {
      // Manually corrupt the fallback cache with expired entry
      client['fallbackCache'].set('corrupted-key', {
        value: 'valid-value',
        expires: 0, // Expired timestamp
        createdAt: Date.now()
      });

      // Should handle expired/corrupted data gracefully
      const result = client['getFallback']('corrupted-key');
      expect(result).toBeNull(); // Should return null for expired data
      
      // The key should be cleaned up
      expect(client['fallbackCache'].has('corrupted-key')).toBe(false);
    });

    it('should handle very deep object nesting', async () => {
      // Create deeply nested object
      let deepObject: any = {};
      let current = deepObject;
      
      for (let i = 0; i < 100; i++) {
        current.next = { level: i };
        current = current.next;
      }
      current.final = 'deep value';

      server.use(
        http.post(`${baseUrl}/cache/set`, () => {
          return HttpResponse.error();
        })
      );

      const result = await client.set('deep-object', deepObject);
      expect(result).toBe(true);

      const retrieved = client['getFallback']('deep-object');
      
      // Navigate to the deep value
      let nav = retrieved;
      for (let i = 0; i < 100; i++) {
        nav = nav.next;
      }
      expect(nav.final).toBe('deep value');
    });
  });
});