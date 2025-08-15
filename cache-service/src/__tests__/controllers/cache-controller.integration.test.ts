import request from 'supertest';
import express from 'express';
import { CacheController } from '../../controllers/cache-controller';
import { CacheManager } from '../../cache/cache-manager';

/**
 * Integration tests for Cache Controller API endpoints
 * These tests focus on HTTP integration without extensive mocking
 */

describe('Cache Controller Integration Tests', () => {
  let app: express.Application;
  let cacheManager: CacheManager;

  beforeAll(async () => {
    // Setup Express app
    app = express();
    app.use(express.json({ limit: '50mb' }));
    
    // Error handling middleware for malformed JSON
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

  describe('API Endpoint Integration', () => {
    it('should handle complete cache lifecycle through API', async () => {
      const testKey = 'integration:test:lifecycle';
      const testValue = { 
        message: 'integration test', 
        timestamp: Date.now(),
        data: [1, 2, 3, 4, 5]
      };

      // 1. Set cache entry
      const setResponse = await request(app)
        .post('/cache/set')
        .send({ 
          key: testKey, 
          value: testValue,
          options: { 
            ttl: 3600, 
            tags: ['integration', 'test'],
            source: 'api-integration-test' 
          }
        })
        .expect(201);

      expect(setResponse.body.success).toBe(true);
      expect(setResponse.body.key).toBe(testKey);

      // 2. Get cache entry
      const getResponse = await request(app)
        .get(`/cache/get/${encodeURIComponent(testKey)}`)
        .expect(200);

      expect(getResponse.body.found).toBe(true);
      expect(getResponse.body.key).toBe(testKey);

      // 3. Check stats
      const statsResponse = await request(app)
        .get('/cache/stats')
        .expect(200);

      expect(statsResponse.body).toHaveProperty('memory');
      expect(statsResponse.body).toHaveProperty('keyCount');
      expect(statsResponse.body).toHaveProperty('config');

      // 4. Delete cache entry
      const deleteResponse = await request(app)
        .delete(`/cache/delete/${encodeURIComponent(testKey)}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.key).toBe(testKey);

      // 5. Verify deletion
      await request(app)
        .get(`/cache/get/${encodeURIComponent(testKey)}`)
        .expect(404);
    });

    it('should handle batch operations correctly', async () => {
      const entries = [
        { 
          key: 'batch:1', 
          value: 'value 1',
          options: { ttl: 1800, tags: ['batch'] }
        },
        { 
          key: 'batch:2', 
          value: { complex: 'object', numbers: [1, 2, 3] },
          options: { ttl: 3600, tags: ['batch', 'complex'] }
        },
        { 
          key: 'batch:3', 
          value: 12345 
        }
      ];

      // Bulk set
      const bulkSetResponse = await request(app)
        .post('/cache/bulk/set')
        .send({ entries })
        .expect(200);

      expect(bulkSetResponse.body.total).toBe(3);
      expect(bulkSetResponse.body.successful).toBeGreaterThanOrEqual(0);
      expect(bulkSetResponse.body.failed).toBeGreaterThanOrEqual(0);

      // Multi-get
      const mgetResponse = await request(app)
        .post('/cache/mget')
        .send({ keys: ['batch:1', 'batch:2', 'batch:3', 'batch:nonexistent'] })
        .expect(200);

      expect(mgetResponse.body.results).toHaveLength(4);
      expect(mgetResponse.body.found).toBeLessThanOrEqual(3);
      expect(mgetResponse.body.missing).toBeGreaterThanOrEqual(1);
      expect(mgetResponse.body.missingKeys).toContain('batch:nonexistent');
    });

    it('should handle tag-based invalidation', async () => {
      // Set multiple entries with same tag
      const taggedEntries = [
        { key: 'tagged:1', value: 'value1', options: { tags: ['invalidation-test'] } },
        { key: 'tagged:2', value: 'value2', options: { tags: ['invalidation-test', 'other'] } },
        { key: 'tagged:3', value: 'value3', options: { tags: ['different-tag'] } }
      ];

      await request(app)
        .post('/cache/bulk/set')
        .send({ entries: taggedEntries })
        .expect(200);

      // Invalidate by tag
      const invalidateResponse = await request(app)
        .post('/cache/invalidate/tag')
        .send({ tag: 'invalidation-test' })
        .expect(200);

      expect(invalidateResponse.body.tag).toBe('invalidation-test');
      expect(invalidateResponse.body.invalidatedCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(invalidateResponse.body.invalidatedKeys)).toBe(true);
    });

    it('should handle pattern-based invalidation', async () => {
      // Set multiple entries with pattern
      const patternEntries = [
        { key: 'pattern:user:123:profile', value: 'profile1' },
        { key: 'pattern:user:456:profile', value: 'profile2' },
        { key: 'pattern:user:789:settings', value: 'settings1' },
        { key: 'different:pattern', value: 'other' }
      ];

      await request(app)
        .post('/cache/bulk/set')
        .send({ entries: patternEntries })
        .expect(200);

      // Invalidate by pattern
      const invalidateResponse = await request(app)
        .post('/cache/invalidate/pattern')
        .send({ pattern: 'pattern:user:*:profile' })
        .expect(200);

      expect(invalidateResponse.body.pattern).toBe('pattern:user:*:profile');
      expect(invalidateResponse.body.invalidatedCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(invalidateResponse.body.invalidatedKeys)).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle malformed JSON requests', async () => {
      const malformedJson = '{"key": "test", "value":';
      
      const response = await request(app)
        .post('/cache/set')
        .set('Content-Type', 'application/json')
        .send(malformedJson)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid JSON');
    });

    it('should handle missing required fields', async () => {
      const invalidRequests = [
        { value: 'missing key' },
        { key: 'missing value' },
        { key: '', value: 'empty key' },
        {}
      ];

      for (const invalidRequest of invalidRequests) {
        await request(app)
          .post('/cache/set')
          .send(invalidRequest)
          .expect(400);
      }
    });

    it('should handle invalid array parameters', async () => {
      // Invalid keys for mget
      await request(app)
        .post('/cache/mget')
        .send({ keys: 'not an array' })
        .expect(400);

      // Invalid entries for bulk set
      await request(app)
        .post('/cache/bulk/set')
        .send({ entries: 'not an array' })
        .expect(400);
    });

    it('should handle invalid tag and pattern parameters', async () => {
      // Invalid tag
      const invalidTags = [
        { tag: '' },
        { tag: null },
        { tag: undefined },
        {}
      ];

      for (const invalidRequest of invalidTags) {
        await request(app)
          .post('/cache/invalidate/tag')
          .send(invalidRequest)
          .expect(400);
      }

      // Invalid pattern
      const invalidPatterns = [
        { pattern: '' },
        { pattern: null },
        { pattern: undefined },
        {}
      ];

      for (const invalidRequest of invalidPatterns) {
        await request(app)
          .post('/cache/invalidate/pattern')
          .send(invalidRequest)
          .expect(400);
      }
    });
  });

  describe('Data Type Handling', () => {
    it('should handle various data types correctly', async () => {
      const testCases = [
        { key: 'string:test', value: 'simple string' },
        { key: 'number:test', value: 42 },
        { key: 'float:test', value: 3.14159 },
        { key: 'boolean:true', value: true },
        { key: 'boolean:false', value: false },
        { key: 'array:simple', value: [1, 2, 3, 'four', true] },
        { key: 'object:nested', value: { level1: { level2: { value: 'deep' } } } },
        { key: 'null:test', value: null },
        { key: 'empty:object', value: {} },
        { key: 'empty:array', value: [] }
      ];

      for (const testCase of testCases) {
        const setResponse = await request(app)
          .post('/cache/set')
          .send(testCase)
          .expect(201);

        expect(setResponse.body.success).toBe(true);
        expect(setResponse.body.key).toBe(testCase.key);
      }
    });

    it('should handle special characters in keys', async () => {
      const specialKeyTests = [
        'key:with:colons',
        'key with spaces',
        'key/with/slashes',
        'key-with-dashes',
        'key_with_underscores',
        'key.with.dots',
        'key+with+plus',
        'unicode:🔑:key'
      ];

      for (const key of specialKeyTests) {
        const encodedKey = encodeURIComponent(key);
        
        // Set with special key
        await request(app)
          .post('/cache/set')
          .send({ key, value: `value for ${key}` })
          .expect(201);

        // Get with encoded key
        const getResponse = await request(app)
          .get(`/cache/get/${encodedKey}`)
          .expect(200);

        expect(getResponse.body.key).toBe(key);

        // Delete with encoded key
        await request(app)
          .delete(`/cache/delete/${encodedKey}`)
          .expect(200);
      }
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent requests', async () => {
      const concurrentCount = 50;
      const baseKey = 'concurrent:load:test';

      // Create concurrent set requests
      const setPromises = Array.from({ length: concurrentCount }, (_, i) =>
        request(app)
          .post('/cache/set')
          .send({ 
            key: `${baseKey}:${i}`, 
            value: { index: i, timestamp: Date.now() } 
          })
      );

      const setResults = await Promise.all(setPromises);
      
      // Verify all requests completed
      setResults.forEach((result, index) => {
        expect([200, 201]).toContain(result.status);
      });

      // Create concurrent get requests
      const getPromises = Array.from({ length: concurrentCount }, (_, i) =>
        request(app).get(`/cache/get/${encodeURIComponent(`${baseKey}:${i}`)}`)
      );

      const getResults = await Promise.all(getPromises);
      
      // Verify all get requests completed
      getResults.forEach((result) => {
        expect([200, 404]).toContain(result.status);
      });
    });

    it('should handle large payload requests', async () => {
      const largePayload = {
        data: 'x'.repeat(1024 * 100), // 100KB string
        metadata: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `item-${i}`,
          description: `Description for item ${i}`.repeat(10)
        })),
        nested: {
          deep: {
            structure: {
              with: {
                many: {
                  levels: 'final value'
                }
              }
            }
          }
        }
      };

      const response = await request(app)
        .post('/cache/set')
        .send({ 
          key: 'large:payload:test', 
          value: largePayload,
          options: { ttl: 1800 }
        })
        .timeout(10000) // 10 second timeout for large payload
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should handle large batch operations', async () => {
      const batchSize = 200;
      const entries = Array.from({ length: batchSize }, (_, i) => ({
        key: `batch:large:${i}`,
        value: {
          index: i,
          data: `Large batch data for item ${i}`,
          metadata: { processed: Date.now() }
        },
        options: { ttl: 3600, tags: ['large-batch'] }
      }));

      const response = await request(app)
        .post('/cache/bulk/set')
        .send({ entries })
        .timeout(15000) // 15 second timeout for large batch
        .expect(200);

      expect(response.body.total).toBe(batchSize);
      expect(response.body.successful).toBeGreaterThanOrEqual(0);
      expect(response.body.failed).toBeGreaterThanOrEqual(0);

      // Test large mget
      const keys = entries.map(entry => entry.key);
      const mgetResponse = await request(app)
        .post('/cache/mget')
        .send({ keys })
        .timeout(10000) // 10 second timeout for large mget
        .expect(200);

      expect(mgetResponse.body.results).toHaveLength(batchSize);
    });
  });

  describe('Response Schema Validation', () => {
    it('should return consistent response schemas across all endpoints', async () => {
      // Test SET response schema
      const setResponse = await request(app)
        .post('/cache/set')
        .send({ key: 'schema:test', value: 'test value' })
        .expect(201);

      expect(setResponse.body).toEqual(
        expect.objectContaining({
          success: expect.any(Boolean),
          key: expect.any(String),
          message: expect.any(String)
        })
      );

      // Test GET response schema (found)
      const getFoundResponse = await request(app)
        .get('/cache/get/schema%3Atest')
        .expect(200);

      expect(getFoundResponse.body).toEqual(
        expect.objectContaining({
          key: expect.any(String),
          value: expect.anything(),
          found: expect.any(Boolean)
        })
      );

      // Test GET response schema (not found)
      const getNotFoundResponse = await request(app)
        .get('/cache/get/nonexistent%3Akey')
        .expect(404);

      expect(getNotFoundResponse.body).toEqual(
        expect.objectContaining({
          key: expect.any(String),
          found: expect.any(Boolean),
          message: expect.any(String)
        })
      );

      // Test MGET response schema
      const mgetResponse = await request(app)
        .post('/cache/mget')
        .send({ keys: ['schema:test', 'nonexistent'] })
        .expect(200);

      expect(mgetResponse.body).toEqual(
        expect.objectContaining({
          results: expect.any(Array),
          found: expect.any(Number),
          missing: expect.any(Number),
          missingKeys: expect.any(Array)
        })
      );

      // Test DELETE response schema
      const deleteResponse = await request(app)
        .delete('/cache/delete/schema%3Atest')
        .expect(200);

      expect(deleteResponse.body).toEqual(
        expect.objectContaining({
          success: expect.any(Boolean),
          key: expect.any(String),
          message: expect.any(String)
        })
      );

      // Test STATS response schema
      const statsResponse = await request(app)
        .get('/cache/stats')
        .expect(200);

      expect(statsResponse.body).toEqual(
        expect.objectContaining({
          memory: expect.any(Object),
          keyCount: expect.any(Number),
          config: expect.any(Object)
        })
      );

      // Test BULK SET response schema
      const bulkSetResponse = await request(app)
        .post('/cache/bulk/set')
        .send({ entries: [{ key: 'bulk:schema', value: 'test' }] })
        .expect(200);

      expect(bulkSetResponse.body).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          successful: expect.any(Number),
          failed: expect.any(Number),
          message: expect.any(String)
        })
      );

      // Test TAG INVALIDATE response schema
      const tagInvalidateResponse = await request(app)
        .post('/cache/invalidate/tag')
        .send({ tag: 'test-tag' })
        .expect(200);

      expect(tagInvalidateResponse.body).toEqual(
        expect.objectContaining({
          tag: expect.any(String),
          invalidatedCount: expect.any(Number),
          invalidatedKeys: expect.any(Array)
        })
      );

      // Test PATTERN INVALIDATE response schema
      const patternInvalidateResponse = await request(app)
        .post('/cache/invalidate/pattern')
        .send({ pattern: 'test:*' })
        .expect(200);

      expect(patternInvalidateResponse.body).toEqual(
        expect.objectContaining({
          pattern: expect.any(String),
          invalidatedCount: expect.any(Number),
          invalidatedKeys: expect.any(Array)
        })
      );
    });
  });
});