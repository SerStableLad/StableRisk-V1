const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { CacheService } = require('../../src/lib/services/cache');
const { RateLimitService } = require('../../src/lib/services/rate-limit');

describe('Caching & Rate Limiting Tests', () => {
  describe('Cache Service', () => {
    let cacheService;

    beforeEach(() => {
      cacheService = new CacheService();
    });

    afterEach(() => {
      cacheService.clear();
    });

    describe('Basic Cache Operations', () => {
      it('should set and get cached data', async () => {
        const key = 'test-key';
        const data = { value: 'test-data' };
        await cacheService.set(key, data);
        const cached = await cacheService.get(key);
        expect(cached).toEqual(data);
      });

      it('should respect TTL', async () => {
        const key = 'ttl-test';
        const data = { value: 'test-data' };
        await cacheService.set(key, data, 1); // 1 second TTL
        await new Promise(resolve => setTimeout(resolve, 1100));
        const cached = await cacheService.get(key);
        expect(cached).toBeNull();
      });

      it('should handle complex data structures', async () => {
        const key = 'complex-data';
        const data = {
          array: [1, 2, 3],
          nested: { a: 1, b: 2 },
          date: new Date(),
          null: null,
          undefined: undefined
        };
        await cacheService.set(key, data);
        const cached = await cacheService.get(key);
        expect(cached).toEqual(data);
      });
    });

    describe('Cache Management', () => {
      it('should clear expired entries', async () => {
        const key1 = 'expire1';
        const key2 = 'expire2';
        await cacheService.set(key1, 'data1', 1);
        await cacheService.set(key2, 'data2', 60);
        await new Promise(resolve => setTimeout(resolve, 1100));
        await cacheService.clearExpired();
        expect(await cacheService.get(key1)).toBeNull();
        expect(await cacheService.get(key2)).toBeTruthy();
      });

      it('should handle cache size limits', async () => {
        const maxSize = cacheService.maxSize;
        for (let i = 0; i < maxSize + 10; i++) {
          await cacheService.set(`key${i}`, `data${i}`);
        }
        expect(cacheService.size).toBeLessThanOrEqual(maxSize);
      });

      it('should implement LRU eviction', async () => {
        await cacheService.set('lru1', 'data1');
        await cacheService.set('lru2', 'data2');
        await cacheService.get('lru1'); // Access lru1 to make it most recently used
        await cacheService.set('lru3', 'data3', null, true); // Force eviction
        expect(await cacheService.get('lru1')).toBeTruthy();
        expect(await cacheService.get('lru2')).toBeNull();
      });
    });

    describe('Performance', () => {
      it('should handle concurrent operations', async () => {
        const operations = Array(100).fill().map((_, i) => 
          cacheService.set(`concurrent${i}`, `data${i}`)
        );
        await Promise.all(operations);
        expect(cacheService.size).toBe(100);
      });

      it('should maintain performance under load', async () => {
        const start = Date.now();
        for (let i = 0; i < 1000; i++) {
          await cacheService.set(`perf${i}`, `data${i}`);
          await cacheService.get(`perf${i}`);
        }
        const duration = Date.now() - start;
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
      });
    });
  });

  describe('Rate Limit Service', () => {
    let rateLimitService;

    beforeEach(() => {
      rateLimitService = new RateLimitService();
    });

    afterEach(() => {
      rateLimitService.reset();
    });

    describe('Basic Rate Limiting', () => {
      it('should allow requests within limit', async () => {
        const ip = '127.0.0.1';
        for (let i = 0; i < 10; i++) {
          const allowed = await rateLimitService.checkLimit(ip);
          expect(allowed).toBe(true);
        }
      });

      it('should block requests over limit', async () => {
        const ip = '127.0.0.2';
        for (let i = 0; i < 10; i++) {
          await rateLimitService.checkLimit(ip);
        }
        const blocked = await rateLimitService.checkLimit(ip);
        expect(blocked).toBe(false);
      });

      it('should reset limits after window', async () => {
        const ip = '127.0.0.3';
        for (let i = 0; i < 10; i++) {
          await rateLimitService.checkLimit(ip);
        }
        await new Promise(resolve => setTimeout(resolve, 86400100)); // Wait 24 hours + 100ms
        const allowed = await rateLimitService.checkLimit(ip);
        expect(allowed).toBe(true);
      });
    });

    describe('IP Management', () => {
      it('should handle different IPs independently', async () => {
        const ip1 = '127.0.0.4';
        const ip2 = '127.0.0.5';
        
        for (let i = 0; i < 10; i++) {
          await rateLimitService.checkLimit(ip1);
        }
        
        const ip1Blocked = await rateLimitService.checkLimit(ip1);
        const ip2Allowed = await rateLimitService.checkLimit(ip2);
        
        expect(ip1Blocked).toBe(false);
        expect(ip2Allowed).toBe(true);
      });

      it('should validate IP addresses', async () => {
        const invalidIP = 'invalid-ip';
        await expect(rateLimitService.checkLimit(invalidIP))
          .rejects.toThrow('Invalid IP address');
      });

      it('should handle IPv6 addresses', async () => {
        const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
        const allowed = await rateLimitService.checkLimit(ipv6);
        expect(allowed).toBe(true);
      });
    });

    describe('Window Management', () => {
      it('should implement sliding window', async () => {
        const ip = '127.0.0.6';
        const now = Date.now();
        
        // Make requests at different times
        rateLimitService.now = () => now - 86400000 / 2; // 12 hours ago
        for (let i = 0; i < 5; i++) {
          await rateLimitService.checkLimit(ip);
        }
        
        rateLimitService.now = () => now; // Current time
        for (let i = 0; i < 5; i++) {
          const allowed = await rateLimitService.checkLimit(ip);
          expect(allowed).toBe(true);
        }
        
        const blocked = await rateLimitService.checkLimit(ip);
        expect(blocked).toBe(false);
      });

      it('should cleanup old windows', async () => {
        const ip = '127.0.0.7';
        await rateLimitService.checkLimit(ip);
        
        rateLimitService.now = () => Date.now() + 86400000 * 2; // 2 days later
        await rateLimitService.cleanup();
        
        expect(rateLimitService.getWindowCount(ip)).toBe(0);
      });
    });

    describe('Error Handling', () => {
      it('should handle storage errors', async () => {
        rateLimitService.storage.increment = jest.fn().mockRejectedValue(new Error('Storage error'));
        await expect(rateLimitService.checkLimit('127.0.0.8'))
          .rejects.toThrow('Storage error');
      });

      it('should handle concurrent requests', async () => {
        const ip = '127.0.0.9';
        const requests = Array(20).fill().map(() => rateLimitService.checkLimit(ip));
        const results = await Promise.all(requests);
        expect(results.filter(r => r === true)).toHaveLength(10);
      });
    });

    describe('Integration Tests', () => {
      it('should work with cache service', async () => {
        const cacheService = new CacheService();
        const rateLimitService = new RateLimitService(cacheService);
        
        const ip = '127.0.0.10';
        for (let i = 0; i < 10; i++) {
          await rateLimitService.checkLimit(ip);
        }
        
        const cached = await cacheService.get(`ratelimit:${ip}`);
        expect(cached).toBeDefined();
        expect(cached.count).toBe(10);
      });

      it('should handle system failures gracefully', async () => {
        rateLimitService.storage = null;
        const allowed = await rateLimitService.checkLimit('127.0.0.11');
        expect(allowed).toBe(false); // Fail closed
      });
    });
  });
}); 