import request from 'supertest';
import express from 'express';
import { CacheController } from '../../controllers/cache-controller';
import { CacheManager } from '../../cache/cache-manager';

// Mock the CacheManager
jest.mock('../../cache/cache-manager');

describe('Cache Controller API Endpoints', () => {
  let app: express.Application;
  let mockCacheManager: jest.Mocked<CacheManager>;

  beforeAll(() => {
    // Setup Express app with cache controller routes
    app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/cache', CacheController.routes());

    // Setup mock cache manager instance
    mockCacheManager = {
      set: jest.fn(),
      get: jest.fn(),
      mget: jest.fn(),
      delete: jest.fn(),
      invalidateByTag: jest.fn(),
      invalidateByPattern: jest.fn(),
      getStats: jest.fn(),
    } as unknown as jest.Mocked<CacheManager>;

    // Mock the getInstance method
    const MockedCacheManagerClass = CacheManager as jest.MockedClass<typeof CacheManager>;
    MockedCacheManagerClass.getInstance = jest.fn().mockReturnValue(mockCacheManager);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /cache/set', () => {
    const validSetRequest = {
      key: 'test:key',
      value: { data: 'test value', number: 123 },
      options: {
        ttl: 3600,
        tags: ['test', 'example'],
        source: 'api-test',
        metadata: { version: '1.0' }
      }
    };

    it('should successfully set cache entry with all options', async () => {
      mockCacheManager.set.mockResolvedValue(true);

      const response = await request(app)
        .post('/cache/set')
        .send(validSetRequest)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        key: 'test:key',
        message: 'Cache entry set successfully'
      });

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'test:key',
        { data: 'test value', number: 123 },
        {
          ttl: 3600,
          tags: ['test', 'example'],
          source: 'api-test',
          metadata: { version: '1.0' }
        }
      );
    });

    it('should successfully set cache entry with minimal options', async () => {
      mockCacheManager.set.mockResolvedValue(true);

      const minimalRequest = {
        key: 'simple:key',
        value: 'simple string value'
      };

      const response = await request(app)
        .post('/cache/set')
        .send(minimalRequest)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        key: 'simple:key',
        message: 'Cache entry set successfully'
      });

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'simple:key',
        'simple string value',
        {}
      );
    });

    it('should handle different data types', async () => {
      mockCacheManager.set.mockResolvedValue(true);

      const testCases = [
        { key: 'string:test', value: 'string value' },
        { key: 'number:test', value: 42 },
        { key: 'boolean:test', value: true },
        { key: 'array:test', value: [1, 2, 3, 'four'] },
        { key: 'object:test', value: { nested: { deep: 'value' } } },
        { key: 'null:test', value: null }
      ];

      for (const testCase of testCases) {
        await request(app)
          .post('/cache/set')
          .send(testCase)
          .expect(201);

        expect(mockCacheManager.set).toHaveBeenCalledWith(
          testCase.key,
          testCase.value,
          {}
        );
      }
    });

    it('should return error when cache manager fails', async () => {
      mockCacheManager.set.mockResolvedValue(false);

      const response = await request(app)
        .post('/cache/set')
        .send(validSetRequest)
        .expect(201);

      expect(response.body).toEqual({
        success: false,
        key: 'test:key',
        message: 'Failed to set cache entry'
      });
    });

    it('should handle cache manager exceptions', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app)
        .post('/cache/set')
        .send(validSetRequest)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Redis connection failed'
      });
    });

    it('should validate required fields', async () => {
      const invalidRequests = [
        {},
        { key: 'test' },
        { value: 'test' },
        { key: '', value: 'test' }
      ];

      for (const invalidRequest of invalidRequests) {
        await request(app)
          .post('/cache/set')
          .send(invalidRequest)
          .expect(400);
      }
    });

    it('should handle large payloads', async () => {
      mockCacheManager.set.mockResolvedValue(true);

      const largeValue = {
        data: 'x'.repeat(1024 * 1024), // 1MB string
        metadata: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }))
      };

      const response = await request(app)
        .post('/cache/set')
        .send({
          key: 'large:payload',
          value: largeValue
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should handle special characters in keys and values', async () => {
      mockCacheManager.set.mockResolvedValue(true);

      const specialCases = [
        { key: 'key:with:colons', value: 'value' },
        { key: 'key with spaces', value: 'value' },
        { key: 'key/with/slashes', value: 'value' },
        { key: 'key-with-dashes', value: 'value' },
        { key: 'key_with_underscores', value: 'value' },
        { key: 'unicode:🔑', value: { emoji: '🎯', text: 'unicode content' } }
      ];

      for (const testCase of specialCases) {
        await request(app)
          .post('/cache/set')
          .send(testCase)
          .expect(201);
      }
    });
  });

  describe('GET /cache/get/:key', () => {
    it('should successfully retrieve existing cache entry', async () => {
      const cachedValue = { data: 'cached value', timestamp: Date.now() };
      mockCacheManager.get.mockResolvedValue(cachedValue);

      const response = await request(app)
        .get('/cache/get/test:key')
        .expect(200);

      expect(response.body).toEqual({
        key: 'test:key',
        value: cachedValue,
        found: true
      });

      expect(mockCacheManager.get).toHaveBeenCalledWith('test:key');
    });

    it('should return 404 for non-existent cache entry', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const response = await request(app)
        .get('/cache/get/nonexistent:key')
        .expect(404);

      expect(response.body).toEqual({
        key: 'nonexistent:key',
        found: false,
        message: 'Cache entry not found'
      });
    });

    it('should handle URL-encoded keys', async () => {
      const cachedValue = 'value for encoded key';
      mockCacheManager.get.mockResolvedValue(cachedValue);

      const encodedKey = encodeURIComponent('key with spaces');
      const response = await request(app)
        .get(`/cache/get/${encodedKey}`)
        .expect(200);

      expect(response.body).toEqual({
        key: 'key with spaces',
        value: cachedValue,
        found: true
      });

      expect(mockCacheManager.get).toHaveBeenCalledWith('key with spaces');
    });

    it('should handle special characters in keys', async () => {
      const specialKeys = [
        'key:with:colons',
        'key/with/slashes',
        'key-with-dashes',
        'key_with_underscores',
        'unicode:🔑'
      ];

      mockCacheManager.get.mockResolvedValue('test value');

      for (const key of specialKeys) {
        const encodedKey = encodeURIComponent(key);
        await request(app)
          .get(`/cache/get/${encodedKey}`)
          .expect(200);

        expect(mockCacheManager.get).toHaveBeenCalledWith(key);
      }
    });

    it('should handle cache manager exceptions', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Cache read failed'));

      const response = await request(app)
        .get('/cache/get/error:key')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Cache read failed'
      });
    });

    it('should handle different value types', async () => {
      const testValues = [
        'string value',
        42,
        true,
        [1, 2, 3],
        { nested: { object: 'value' } },
        null
      ];

      for (const value of testValues) {
        mockCacheManager.get.mockResolvedValue(value);

        const response = await request(app)
          .get('/cache/get/test:key')
          .expect(200);

        expect(response.body.value).toEqual(value);
        expect(response.body.found).toBe(true);
      }
    });
  });

  describe('POST /cache/mget', () => {
    it('should successfully retrieve multiple cache entries', async () => {
      const mockResults = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: { data: 'value2' } },
        { key: 'key3', value: null }
      ];

      mockCacheManager.mget.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/cache/mget')
        .send({ keys: ['key1', 'key2', 'key3'] })
        .expect(200);

      expect(response.body).toEqual({
        results: mockResults,
        found: 2,
        missing: 1,
        missingKeys: ['key3']
      });

      expect(mockCacheManager.mget).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
    });

    it('should handle empty key array', async () => {
      mockCacheManager.mget.mockResolvedValue([]);

      const response = await request(app)
        .post('/cache/mget')
        .send({ keys: [] })
        .expect(200);

      expect(response.body).toEqual({
        results: [],
        found: 0,
        missing: 0,
        missingKeys: []
      });
    });

    it('should handle all missing keys', async () => {
      const mockResults = [
        { key: 'missing1', value: null },
        { key: 'missing2', value: null }
      ];

      mockCacheManager.mget.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/cache/mget')
        .send({ keys: ['missing1', 'missing2'] })
        .expect(200);

      expect(response.body).toEqual({
        results: mockResults,
        found: 0,
        missing: 2,
        missingKeys: ['missing1', 'missing2']
      });
    });

    it('should handle large batch requests', async () => {
      const keys = Array.from({ length: 1000 }, (_, i) => `key:${i}`);
      const mockResults = keys.map(key => ({
        key,
        value: key.includes('500') ? null : `value for ${key}`
      }));

      mockCacheManager.mget.mockResolvedValue(mockResults);

      const response = await request(app)
        .post('/cache/mget')
        .send({ keys })
        .expect(200);

      expect(response.body.results).toHaveLength(1000);
      expect(response.body.found).toBe(999);
      expect(response.body.missing).toBe(1);
    });

    it('should validate keys parameter', async () => {
      const invalidRequests = [
        {},
        { keys: 'not an array' },
        { keys: null },
        { keys: undefined }
      ];

      for (const invalidRequest of invalidRequests) {
        const response = await request(app)
          .post('/cache/mget')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toEqual({
          error: 'keys must be an array'
        });
      }
    });

    it('should handle cache manager exceptions', async () => {
      mockCacheManager.mget.mockRejectedValue(new Error('Batch read failed'));

      const response = await request(app)
        .post('/cache/mget')
        .send({ keys: ['key1', 'key2'] })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Batch read failed'
      });
    });
  });

  describe('DELETE /cache/delete/:key', () => {
    it('should successfully delete existing cache entry', async () => {
      mockCacheManager.delete.mockResolvedValue(true);

      const response = await request(app)
        .delete('/cache/delete/test:key')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        key: 'test:key',
        message: 'Cache entry deleted'
      });

      expect(mockCacheManager.delete).toHaveBeenCalledWith('test:key');
    });

    it('should handle deletion of non-existent key', async () => {
      mockCacheManager.delete.mockResolvedValue(false);

      const response = await request(app)
        .delete('/cache/delete/nonexistent:key')
        .expect(200);

      expect(response.body).toEqual({
        success: false,
        key: 'nonexistent:key',
        message: 'Failed to delete cache entry'
      });
    });

    it('should handle URL-encoded keys', async () => {
      mockCacheManager.delete.mockResolvedValue(true);

      const encodedKey = encodeURIComponent('key with spaces');
      const response = await request(app)
        .delete(`/cache/delete/${encodedKey}`)
        .expect(200);

      expect(response.body.key).toBe('key with spaces');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('key with spaces');
    });

    it('should handle special characters in keys', async () => {
      const specialKeys = [
        'key:with:colons',
        'key/with/slashes',
        'key-with-dashes',
        'unicode:🔑'
      ];

      mockCacheManager.delete.mockResolvedValue(true);

      for (const key of specialKeys) {
        const encodedKey = encodeURIComponent(key);
        await request(app)
          .delete(`/cache/delete/${encodedKey}`)
          .expect(200);

        expect(mockCacheManager.delete).toHaveBeenCalledWith(key);
      }
    });

    it('should handle cache manager exceptions', async () => {
      mockCacheManager.delete.mockRejectedValue(new Error('Delete operation failed'));

      const response = await request(app)
        .delete('/cache/delete/error:key')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Delete operation failed'
      });
    });
  });

  describe('POST /cache/invalidate/tag', () => {
    it('should successfully invalidate cache entries by tag', async () => {
      const invalidatedKeys = ['key1', 'key2', 'key3'];
      mockCacheManager.invalidateByTag.mockResolvedValue(invalidatedKeys);

      const response = await request(app)
        .post('/cache/invalidate/tag')
        .send({ tag: 'user-data' })
        .expect(200);

      expect(response.body).toEqual({
        tag: 'user-data',
        invalidatedCount: 3,
        invalidatedKeys
      });

      expect(mockCacheManager.invalidateByTag).toHaveBeenCalledWith('user-data');
    });

    it('should handle invalidation with no matching entries', async () => {
      mockCacheManager.invalidateByTag.mockResolvedValue([]);

      const response = await request(app)
        .post('/cache/invalidate/tag')
        .send({ tag: 'nonexistent-tag' })
        .expect(200);

      expect(response.body).toEqual({
        tag: 'nonexistent-tag',
        invalidatedCount: 0,
        invalidatedKeys: []
      });
    });

    it('should handle special characters in tags', async () => {
      const specialTags = [
        'tag:with:colons',
        'tag-with-dashes',
        'tag_with_underscores',
        'unicode:🏷️'
      ];

      mockCacheManager.invalidateByTag.mockResolvedValue(['test:key']);

      for (const tag of specialTags) {
        await request(app)
          .post('/cache/invalidate/tag')
          .send({ tag })
          .expect(200);

        expect(mockCacheManager.invalidateByTag).toHaveBeenCalledWith(tag);
      }
    });

    it('should validate tag parameter', async () => {
      const invalidRequests = [
        {},
        { tag: '' },
        { tag: null },
        { tag: undefined }
      ];

      for (const invalidRequest of invalidRequests) {
        await request(app)
          .post('/cache/invalidate/tag')
          .send(invalidRequest)
          .expect(400);
      }
    });

    it('should handle cache manager exceptions', async () => {
      mockCacheManager.invalidateByTag.mockRejectedValue(new Error('Tag invalidation failed'));

      const response = await request(app)
        .post('/cache/invalidate/tag')
        .send({ tag: 'error-tag' })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Tag invalidation failed'
      });
    });
  });

  describe('POST /cache/invalidate/pattern', () => {
    it('should successfully invalidate cache entries by pattern', async () => {
      const invalidatedKeys = ['user:123:profile', 'user:456:profile', 'user:789:profile'];
      mockCacheManager.invalidateByPattern.mockResolvedValue(invalidatedKeys);

      const response = await request(app)
        .post('/cache/invalidate/pattern')
        .send({ pattern: 'user:*:profile' })
        .expect(200);

      expect(response.body).toEqual({
        pattern: 'user:*:profile',
        invalidatedCount: 3,
        invalidatedKeys
      });

      expect(mockCacheManager.invalidateByPattern).toHaveBeenCalledWith('user:*:profile');
    });

    it('should handle wildcard patterns', async () => {
      const patterns = [
        'prefix:*',
        '*:suffix',
        'prefix:*:suffix',
        'test:*:*:data',
        '*'
      ];

      mockCacheManager.invalidateByPattern.mockResolvedValue(['matched:key']);

      for (const pattern of patterns) {
        await request(app)
          .post('/cache/invalidate/pattern')
          .send({ pattern })
          .expect(200);

        expect(mockCacheManager.invalidateByPattern).toHaveBeenCalledWith(pattern);
      }
    });

    it('should handle regex patterns', async () => {
      const regexPatterns = [
        'user:\\d+:profile',
        'session:[a-f0-9]{32}',
        'temp:(\\w+):\\d{4}-\\d{2}-\\d{2}'
      ];

      mockCacheManager.invalidateByPattern.mockResolvedValue(['regex:match']);

      for (const pattern of regexPatterns) {
        await request(app)
          .post('/cache/invalidate/pattern')
          .send({ pattern })
          .expect(200);

        expect(mockCacheManager.invalidateByPattern).toHaveBeenCalledWith(pattern);
      }
    });

    it('should handle patterns with no matches', async () => {
      mockCacheManager.invalidateByPattern.mockResolvedValue([]);

      const response = await request(app)
        .post('/cache/invalidate/pattern')
        .send({ pattern: 'nonexistent:*' })
        .expect(200);

      expect(response.body).toEqual({
        pattern: 'nonexistent:*',
        invalidatedCount: 0,
        invalidatedKeys: []
      });
    });

    it('should validate pattern parameter', async () => {
      const invalidRequests = [
        {},
        { pattern: '' },
        { pattern: null },
        { pattern: undefined }
      ];

      for (const invalidRequest of invalidRequests) {
        await request(app)
          .post('/cache/invalidate/pattern')
          .send(invalidRequest)
          .expect(400);
      }
    });

    it('should handle cache manager exceptions', async () => {
      mockCacheManager.invalidateByPattern.mockRejectedValue(new Error('Pattern invalidation failed'));

      const response = await request(app)
        .post('/cache/invalidate/pattern')
        .send({ pattern: 'error:*' })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Pattern invalidation failed'
      });
    });
  });

  describe('GET /cache/stats', () => {
    it('should successfully retrieve cache statistics', async () => {
      const mockStats = {
        memory: {
          used_memory: '1048576',
          used_memory_human: '1.00M',
          used_memory_peak: '2097152',
          maxmemory: '1073741824'
        },
        keyCount: 15420,
        accessPatterns: {
          totalReads: 50000,
          totalWrites: 12000,
          hitRate: 0.85,
          averageAccessTime: 2.5
        },
        config: {
          maxMemory: 1073741824,
          defaultTTL: 3600,
          maxValueSize: 10485760,
          compressionThreshold: 1024
        }
      };

      mockCacheManager.getStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/cache/stats')
        .expect(200);

      expect(response.body).toEqual(mockStats);
      expect(mockCacheManager.getStats).toHaveBeenCalled();
    });

    it('should handle stats retrieval errors', async () => {
      mockCacheManager.getStats.mockRejectedValue(new Error('Stats retrieval failed'));

      const response = await request(app)
        .get('/cache/stats')
        .expect(500);

      expect(response.body).toEqual({
        error: 'Stats retrieval failed'
      });
    });

    it('should handle partial stats data', async () => {
      const partialStats = {
        keyCount: 100,
        memory: { used_memory: '512000' }
      };

      mockCacheManager.getStats.mockResolvedValue(partialStats);

      const response = await request(app)
        .get('/cache/stats')
        .expect(200);

      expect(response.body).toEqual(partialStats);
    });
  });

  describe('POST /cache/bulk/set', () => {
    it('should successfully perform bulk set operations', async () => {
      const entries = [
        { key: 'bulk:1', value: 'value1', options: { ttl: 3600 } },
        { key: 'bulk:2', value: { data: 'value2' }, options: { tags: ['bulk'] } },
        { key: 'bulk:3', value: [1, 2, 3] }
      ];

      mockCacheManager.set
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/cache/bulk/set')
        .send({ entries })
        .expect(200);

      expect(response.body).toEqual({
        total: 3,
        successful: 3,
        failed: 0,
        message: 'Bulk set completed: 3 successful, 0 failed'
      });

      expect(mockCacheManager.set).toHaveBeenCalledTimes(3);
      expect(mockCacheManager.set).toHaveBeenNthCalledWith(1, 'bulk:1', 'value1', { ttl: 3600 });
      expect(mockCacheManager.set).toHaveBeenNthCalledWith(2, 'bulk:2', { data: 'value2' }, { tags: ['bulk'] });
      expect(mockCacheManager.set).toHaveBeenNthCalledWith(3, 'bulk:3', [1, 2, 3], undefined);
    });

    it('should handle partial failures in bulk operations', async () => {
      const entries = [
        { key: 'bulk:1', value: 'value1' },
        { key: 'bulk:2', value: 'value2' },
        { key: 'bulk:3', value: 'value3' }
      ];

      mockCacheManager.set
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Cache error'))
        .mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/cache/bulk/set')
        .send({ entries })
        .expect(200);

      expect(response.body).toEqual({
        total: 3,
        successful: 1,
        failed: 2,
        message: 'Bulk set completed: 1 successful, 2 failed'
      });
    });

    it('should handle large bulk operations', async () => {
      const entries = Array.from({ length: 1000 }, (_, i) => ({
        key: `bulk:large:${i}`,
        value: `value ${i}`,
        options: { ttl: 3600 }
      }));

      mockCacheManager.set.mockResolvedValue(true);

      const response = await request(app)
        .post('/cache/bulk/set')
        .send({ entries })
        .expect(200);

      expect(response.body).toEqual({
        total: 1000,
        successful: 1000,
        failed: 0,
        message: 'Bulk set completed: 1000 successful, 0 failed'
      });

      expect(mockCacheManager.set).toHaveBeenCalledTimes(1000);
    });

    it('should validate entries parameter', async () => {
      const invalidRequests = [
        {},
        { entries: 'not an array' },
        { entries: null },
        { entries: undefined }
      ];

      for (const invalidRequest of invalidRequests) {
        const response = await request(app)
          .post('/cache/bulk/set')
          .send(invalidRequest)
          .expect(400);

        expect(response.body).toEqual({
          error: 'entries must be an array'
        });
      }
    });

    it('should handle empty entries array', async () => {
      const response = await request(app)
        .post('/cache/bulk/set')
        .send({ entries: [] })
        .expect(200);

      expect(response.body).toEqual({
        total: 0,
        successful: 0,
        failed: 0,
        message: 'Bulk set completed: 0 successful, 0 failed'
      });

      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should handle bulk operation with mixed data types', async () => {
      const entries = [
        { key: 'string', value: 'text' },
        { key: 'number', value: 42 },
        { key: 'boolean', value: true },
        { key: 'array', value: [1, 2, 3] },
        { key: 'object', value: { nested: 'value' } },
        { key: 'null', value: null }
      ];

      mockCacheManager.set.mockResolvedValue(true);

      const response = await request(app)
        .post('/cache/bulk/set')
        .send({ entries })
        .expect(200);

      expect(response.body.successful).toBe(6);
      expect(response.body.failed).toBe(0);
    });

    it('should handle cache manager exceptions in bulk operations', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Bulk operation failed'));

      const response = await request(app)
        .post('/cache/bulk/set')
        .send({
          entries: [
            { key: 'error:key', value: 'value' }
          ]
        })
        .expect(500);

      expect(response.body).toEqual({
        error: 'Bulk operation failed'
      });
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent GET requests', async () => {
      mockCacheManager.get.mockImplementation((key) => 
        Promise.resolve(`value for ${key}`)
      );

      const concurrentRequests = Array.from({ length: 100 }, (_, i) =>
        request(app).get(`/cache/get/concurrent:${i}`)
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.value).toBe(`value for concurrent:${index}`);
      });

      expect(mockCacheManager.get).toHaveBeenCalledTimes(100);
    });

    it('should handle concurrent SET requests', async () => {
      mockCacheManager.set.mockResolvedValue(true);

      const concurrentRequests = Array.from({ length: 50 }, (_, i) =>
        request(app)
          .post('/cache/set')
          .send({ key: `concurrent:set:${i}`, value: `value ${i}` })
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      expect(mockCacheManager.set).toHaveBeenCalledTimes(50);
    });

    it('should handle mixed concurrent operations', async () => {
      mockCacheManager.get.mockResolvedValue('test value');
      mockCacheManager.set.mockResolvedValue(true);
      mockCacheManager.delete.mockResolvedValue(true);

      const mixedRequests = [
        ...Array.from({ length: 20 }, (_, i) => 
          request(app).get(`/cache/get/mixed:${i}`)
        ),
        ...Array.from({ length: 20 }, (_, i) =>
          request(app)
            .post('/cache/set')
            .send({ key: `mixed:set:${i}`, value: `value ${i}` })
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          request(app).delete(`/cache/delete/mixed:del:${i}`)
        )
      ];

      const responses = await Promise.all(mixedRequests);

      // Check that all requests completed successfully
      responses.forEach((response) => {
        expect([200, 201]).toContain(response.status);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/cache/set')
        .set('Content-Type', 'application/json')
        .send('{"key": "test", "value":')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle extremely large keys', async () => {
      const largeKey = 'x'.repeat(10000);
      mockCacheManager.set.mockResolvedValue(true);

      const response = await request(app)
        .post('/cache/set')
        .send({ key: largeKey, value: 'test value' })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should handle deeply nested objects', async () => {
      const deepObject = { level1: { level2: { level3: { level4: { level5: 'deep value' } } } } };
      mockCacheManager.set.mockResolvedValue(true);

      const response = await request(app)
        .post('/cache/set')
        .send({ key: 'deep:object', value: deepObject })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should handle circular references gracefully', async () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      // This should fail at JSON.stringify level
      const response = await request(app)
        .post('/cache/set')
        .send({ key: 'circular', value: circularObj })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle requests without content-type header', async () => {
      const response = await request(app)
        .post('/cache/set')
        .send('key=test&value=value')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle timeout scenarios', async () => {
      // Simulate slow cache operations
      mockCacheManager.get.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('delayed value'), 100))
      );

      const response = await request(app)
        .get('/cache/get/slow:key')
        .timeout(50)
        .expect(200);

      expect(response.body.value).toBe('delayed value');
    });
  });

  describe('Response Schema Validation', () => {
    it('should return consistent response schemas for SET operations', async () => {
      mockCacheManager.set.mockResolvedValue(true);

      const response = await request(app)
        .post('/cache/set')
        .send({ key: 'schema:test', value: 'test' })
        .expect(201);

      // Validate response schema
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('key');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.success).toBe('boolean');
      expect(typeof response.body.key).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });

    it('should return consistent response schemas for GET operations', async () => {
      mockCacheManager.get.mockResolvedValue('test value');

      const response = await request(app)
        .get('/cache/get/schema:test')
        .expect(200);

      // Validate response schema
      expect(response.body).toHaveProperty('key');
      expect(response.body).toHaveProperty('value');
      expect(response.body).toHaveProperty('found');
      expect(typeof response.body.key).toBe('string');
      expect(typeof response.body.found).toBe('boolean');
    });

    it('should return consistent response schemas for MGET operations', async () => {
      mockCacheManager.mget.mockResolvedValue([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: null }
      ]);

      const response = await request(app)
        .post('/cache/mget')
        .send({ keys: ['key1', 'key2'] })
        .expect(200);

      // Validate response schema
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('found');
      expect(response.body).toHaveProperty('missing');
      expect(response.body).toHaveProperty('missingKeys');
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(Array.isArray(response.body.missingKeys)).toBe(true);
      expect(typeof response.body.found).toBe('number');
      expect(typeof response.body.missing).toBe('number');
    });

    it('should return consistent error response schemas', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Test error'));

      const response = await request(app)
        .post('/cache/set')
        .send({ key: 'error:test', value: 'test' })
        .expect(500);

      // Validate error response schema
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });
  });
});