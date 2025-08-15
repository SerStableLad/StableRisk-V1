/**
 * Simplified Cache Service Client Tests
 * Basic functionality tests without MSW to ensure core functionality works
 */

import { CacheServiceClient } from '../cache-service-client';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('CacheServiceClient - Basic Tests', () => {
  let client: CacheServiceClient;

  beforeEach(() => {
    // Reset singleton
    (CacheServiceClient as any).instance = undefined;
    
    // Set test environment
    process.env.CACHE_SERVICE_URL = 'http://localhost:3002';
    process.env.CACHE_SERVICE_TIMEOUT = '2000';
    process.env.CACHE_FALLBACK_MAX_ENTRIES = '100';
    
    client = CacheServiceClient.getInstance();
    client.clearFallbackCache();
    
    // Reset mock
    mockFetch.mockClear();
  });

  afterEach(() => {
    client.shutdown();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CacheServiceClient.getInstance();
      const instance2 = CacheServiceClient.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should maintain configuration', () => {
      const config = client.getConfiguration();
      
      expect(config.baseUrl).toBe('http://localhost:3002');
      expect(config.timeout).toBe(2000);
      expect(config.maxFallbackEntries).toBe(100);
    });
  });

  describe('Configuration Validation', () => {
    it('should use default values when env vars not set', () => {
      delete process.env.CACHE_SERVICE_URL;
      delete process.env.CACHE_SERVICE_TIMEOUT;
      delete process.env.CACHE_FALLBACK_MAX_ENTRIES;
      
      (CacheServiceClient as any).instance = undefined;
      const defaultClient = CacheServiceClient.getInstance();
      const config = defaultClient.getConfiguration();
      
      expect(config.baseUrl).toBe('http://localhost:3002');
      expect(config.timeout).toBe(2000);
      expect(config.maxFallbackEntries).toBe(1000);
      
      defaultClient.shutdown();
    });

    it('should throw for invalid URL', () => {
      process.env.CACHE_SERVICE_URL = 'invalid-url';
      (CacheServiceClient as any).instance = undefined;
      
      expect(() => {
        CacheServiceClient.getInstance();
      }).toThrow('Cache service base URL is invalid');
    });

    it('should throw for invalid timeout', () => {
      process.env.CACHE_SERVICE_TIMEOUT = '0';
      (CacheServiceClient as any).instance = undefined;
      
      expect(() => {
        CacheServiceClient.getInstance();
      }).toThrow('Cache service timeout must be between 1 and 60000ms');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate set parameters', async () => {
      expect(await client.set('', { data: 'test' })).toBe(false);
      expect(await client.set(null as any, { data: 'test' })).toBe(false);
      expect(await client.set(undefined as any, { data: 'test' })).toBe(false);
    });

    it('should validate get parameters', async () => {
      expect(await client.get('')).toBeNull();
      expect(await client.get(null as any)).toBeNull();
      expect(await client.get(undefined as any)).toBeNull();
    });

    it('should validate mget parameters', async () => {
      expect(await client.mget([])).toEqual([]);
      expect(await client.mget(null as any)).toEqual([]);
      expect(await client.mget(undefined as any)).toEqual([]);
    });

    it('should validate delete parameters', async () => {
      expect(await client.delete('')).toBe(false);
      expect(await client.delete(null as any)).toBe(false);
      expect(await client.delete(undefined as any)).toBe(false);
    });

    it('should validate invalidateByTag parameters', async () => {
      expect(await client.invalidateByTag('')).toEqual([]);
      expect(await client.invalidateByTag(null as any)).toEqual([]);
      expect(await client.invalidateByTag(undefined as any)).toEqual([]);
    });
  });

  describe('Happy Path with Mock', () => {
    it('should successfully set cache entry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          key: 'test-key',
          message: 'Cache entry set successfully'
        })
      });

      const result = await client.set('test-key', { data: 'test-value' });
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/cache/set',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'test-key',
            value: { data: 'test-value' },
            options: {}
          })
        })
      );
    });

    it('should successfully get cache entry', async () => {
      const testValue = { data: 'test-value', timestamp: Date.now() };
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          key: 'test-key',
          value: testValue,
          found: true
        })
      });

      const result = await client.get('test-key');
      expect(result).toEqual(testValue);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3002/cache/get/test-key',
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
    });

    it('should handle 404 for non-existent key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          key: 'non-existent',
          found: false,
          message: 'Cache entry not found'
        })
      });

      const result = await client.get('non-existent');
      expect(result).toBeNull();
    });

    it('should successfully get multiple entries', async () => {
      const testData = [
        { key: 'key1', value: { data: 'value1' } },
        { key: 'key2', value: { data: 'value2' } },
        { key: 'key3', value: null }
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: testData
        })
      });

      const result = await client.mget(['key1', 'key2', 'key3']);
      expect(result).toEqual(testData);
    });
  });

  describe('Fallback Mechanisms', () => {
    it('should fall back on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.set('fallback-key', { data: 'fallback-value' });
      expect(result).toBe(true);

      // Should be in fallback cache
      const fallbackValue = (client as any).getFallback('fallback-key');
      expect(fallbackValue).toEqual({ data: 'fallback-value' });
    });

    it('should use fallback for get when service fails', async () => {
      // Set up fallback data
      (client as any).setFallback('fallback-key', { data: 'fallback-value' }, { ttl: 3600 });

      mockFetch.mockRejectedValueOnce(new Error('Service unavailable'));

      const result = await client.get('fallback-key');
      expect(result).toEqual({ data: 'fallback-value' });
    });

    it('should handle mget fallback', async () => {
      // Set up fallback data
      (client as any).setFallback('key1', { data: 'value1' }, { ttl: 3600 });
      (client as any).setFallback('key2', { data: 'value2' }, { ttl: 3600 });

      mockFetch.mockRejectedValueOnce(new Error('Service error'));

      const result = await client.mget(['key1', 'key2', 'key3']);
      expect(result).toEqual([
        { key: 'key1', value: { data: 'value1' } },
        { key: 'key2', value: { data: 'value2' } },
        { key: 'key3', value: null }
      ]);
    });

    it('should delete from fallback even when service fails', async () => {
      (client as any).setFallback('test-key', { data: 'test' }, { ttl: 3600 });
      expect((client as any).getFallback('test-key')).toBeTruthy();

      mockFetch.mockRejectedValueOnce(new Error('Service error'));

      const result = await client.delete('test-key');
      expect(result).toBe(false); // Service failed
      expect((client as any).getFallback('test-key')).toBeNull(); // But fallback was cleared
    });
  });

  describe('Fallback Cache Management', () => {
    it('should expire fallback cache entries', async () => {
      // Set entry with short TTL
      (client as any).setFallback('test-key', { data: 'test' }, { ttl: 1 });
      
      // Verify it's there
      expect((client as any).getFallback('test-key')).toEqual({ data: 'test' });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      expect((client as any).getFallback('test-key')).toBeNull();
    });

    it('should evict oldest entries when cache is full', async () => {
      // Set max to 3 for testing
      process.env.CACHE_FALLBACK_MAX_ENTRIES = '3';
      (CacheServiceClient as any).instance = undefined;
      const limitedClient = CacheServiceClient.getInstance();

      // Fill cache to capacity
      (limitedClient as any).setFallback('key1', 'value1', { ttl: 3600 });
      (limitedClient as any).setFallback('key2', 'value2', { ttl: 3600 });
      (limitedClient as any).setFallback('key3', 'value3', { ttl: 3600 });

      // Add one more - should evict oldest
      (limitedClient as any).setFallback('key4', 'value4', { ttl: 3600 });

      expect((limitedClient as any).getFallback('key1')).toBeNull(); // Evicted
      expect((limitedClient as any).getFallback('key2')).toBe('value2');
      expect((limitedClient as any).getFallback('key3')).toBe('value3');
      expect((limitedClient as any).getFallback('key4')).toBe('value4');

      limitedClient.shutdown();
    });

    it('should estimate memory usage', async () => {
      (client as any).setFallback('small-key', 'small-value', { ttl: 3600 });
      (client as any).setFallback('large-key', 'x'.repeat(1000), { ttl: 3600 });

      const memoryUsage = (client as any).estimateFallbackMemoryUsage();
      expect(memoryUsage).toBeGreaterThan(0);
      expect(memoryUsage).toBeGreaterThan(1000); // Should account for large value
    });
  });

  describe('Health Check', () => {
    it('should return true for healthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const result = await client.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false for unhealthy service', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503
      });

      const result = await client.healthCheck();
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('Stats', () => {
    it('should get stats with fallback info', async () => {
      const mockStats = {
        memory: { used: 1024000, max: 1073741824 },
        keyCount: 42
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockStats
      });

      const result = await client.getStats();
      expect(result).toMatchObject(mockStats);
      expect(result.fallbackCache).toBeDefined();
      expect(result.fallbackCache.entries).toBe(0);
    });

    it('should return error info when service fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Service error'));

      const result = await client.getStats();
      expect(result.error).toBe('Service error');
      expect(result.fallbackCache).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      const result = await client.get('test-key');
      expect(result).toBeNull();
    });

    it('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await client.set('test-key', { data: 'test' });
      expect(result).toBe(true); // Should fallback

      const fallbackValue = (client as any).getFallback('test-key');
      expect(fallbackValue).toEqual({ data: 'test' });
    });

    it('should not throw exceptions on errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // These should not throw, but set will succeed via fallback
      await expect(client.set('error-test', { data: 'test' })).resolves.toBe(true);
      
      // Get should return the fallback value since set stored it in fallback
      await expect(client.get('error-test')).resolves.toEqual({ data: 'test' });
      
      // Other operations should handle errors gracefully
      await expect(client.mget(['non-existent'])).resolves.toEqual([{ key: 'non-existent', value: null }]);
      await expect(client.delete('error-test')).resolves.toBe(false);
      await expect(client.invalidateByTag('test')).resolves.toEqual([]);
      await expect(client.getStats()).resolves.toMatchObject({ error: 'Network error' });
      await expect(client.healthCheck()).resolves.toBe(false);
    });
  });
});