"use strict";
/**
 * Comprehensive test suite for Cache Service Client
 *
 * Tests all cache operations with fallback mechanisms, error handling,
 * performance characteristics, and edge cases.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const msw_1 = require("msw");
const node_1 = require("msw/node");
const cache_service_client_1 = require("../cache-service-client");
// Test server setup with MSW
const server = (0, node_1.setupServer)();
describe('CacheServiceClient', () => {
    let client;
    const baseUrl = 'http://localhost:3002';
    beforeAll(() => {
        // Start MSW server
        server.listen({
            onUnhandledRequest: 'error',
        });
        // Set test environment variables
        process.env.CACHE_SERVICE_URL = baseUrl;
        process.env.CACHE_SERVICE_TIMEOUT = '2000';
        process.env.CACHE_FALLBACK_MAX_ENTRIES = '100';
    });
    beforeEach(() => {
        // Reset client instance for each test
        cache_service_client_1.CacheServiceClient['instance'] = undefined;
        client = cache_service_client_1.CacheServiceClient.getInstance();
        client.clearFallbackCache();
        // Reset MSW handlers
        server.resetHandlers();
    });
    afterEach(() => {
        // Clear any timeouts/intervals
        client.shutdown();
    });
    afterAll(() => {
        server.close();
    });
    describe('Singleton Pattern', () => {
        it('should return the same instance when called multiple times', () => {
            const instance1 = cache_service_client_1.CacheServiceClient.getInstance();
            const instance2 = cache_service_client_1.CacheServiceClient.getInstance();
            expect(instance1).toBe(instance2);
            expect(instance1).toBe(client);
        });
        it('should maintain configuration across instances', () => {
            const config1 = client.getConfiguration();
            const instance2 = cache_service_client_1.CacheServiceClient.getInstance();
            const config2 = instance2.getConfiguration();
            expect(config1).toEqual(config2);
        });
    });
    describe('Configuration Validation', () => {
        it('should validate configuration on initialization', () => {
            const config = client.getConfiguration();
            expect(config.baseUrl).toBe(baseUrl);
            expect(config.timeout).toBe(2000);
            expect(config.maxFallbackEntries).toBe(100);
            expect(config.fallbackCacheSize).toBe(0);
        });
        it('should use default configuration when env vars are not set', () => {
            // Save original env vars
            const originalUrl = process.env.CACHE_SERVICE_URL;
            const originalTimeout = process.env.CACHE_SERVICE_TIMEOUT;
            const originalMaxEntries = process.env.CACHE_FALLBACK_MAX_ENTRIES;
            // Clear environment variables
            delete process.env.CACHE_SERVICE_URL;
            delete process.env.CACHE_SERVICE_TIMEOUT;
            delete process.env.CACHE_FALLBACK_MAX_ENTRIES;
            cache_service_client_1.CacheServiceClient['instance'] = undefined;
            const defaultClient = cache_service_client_1.CacheServiceClient.getInstance();
            const config = defaultClient.getConfiguration();
            expect(config.baseUrl).toBe('http://localhost:3002');
            expect(config.timeout).toBe(2000);
            expect(config.maxFallbackEntries).toBe(1000);
            defaultClient.shutdown();
            // Restore original env vars
            if (originalUrl)
                process.env.CACHE_SERVICE_URL = originalUrl;
            if (originalTimeout)
                process.env.CACHE_SERVICE_TIMEOUT = originalTimeout;
            if (originalMaxEntries)
                process.env.CACHE_FALLBACK_MAX_ENTRIES = originalMaxEntries;
        });
        it('should throw error for invalid base URL', () => {
            const originalUrl = process.env.CACHE_SERVICE_URL;
            process.env.CACHE_SERVICE_URL = 'invalid-url';
            cache_service_client_1.CacheServiceClient['instance'] = undefined;
            expect(() => {
                cache_service_client_1.CacheServiceClient.getInstance();
            }).toThrow('Cache service base URL is invalid');
            // Restore original URL
            if (originalUrl) {
                process.env.CACHE_SERVICE_URL = originalUrl;
            }
            else {
                delete process.env.CACHE_SERVICE_URL;
            }
        });
        it('should throw error for invalid timeout', () => {
            const originalTimeout = process.env.CACHE_SERVICE_TIMEOUT;
            process.env.CACHE_SERVICE_TIMEOUT = '0';
            cache_service_client_1.CacheServiceClient['instance'] = undefined;
            expect(() => {
                cache_service_client_1.CacheServiceClient.getInstance();
            }).toThrow('Cache service timeout must be between 1 and 60000ms');
            // Restore original timeout
            if (originalTimeout) {
                process.env.CACHE_SERVICE_TIMEOUT = originalTimeout;
            }
            else {
                delete process.env.CACHE_SERVICE_TIMEOUT;
            }
        });
    });
    describe('Happy Path - Cache Operations', () => {
        describe('set operation', () => {
            it('should successfully set cache entry', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    return msw_1.HttpResponse.json({
                        success: true,
                        key: 'test-key',
                        message: 'Cache entry set successfully'
                    }, { status: 201 });
                }));
                const result = await client.set('test-key', { data: 'test-value' });
                expect(result).toBe(true);
            });
            it('should handle set with options', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, async ({ request }) => {
                    const body = await request.json();
                    expect(body.options.ttl).toBe(1800);
                    expect(body.options.tags).toEqual(['tag1', 'tag2']);
                    return msw_1.HttpResponse.json({
                        success: true,
                        key: 'test-key-with-options'
                    }, { status: 201 });
                }));
                const result = await client.set('test-key-with-options', { data: 'test-value' }, {
                    ttl: 1800,
                    tags: ['tag1', 'tag2'],
                    source: 'test-source'
                });
                expect(result).toBe(true);
            });
            it('should return false when cache service returns failure', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    return msw_1.HttpResponse.json({
                        success: false,
                        message: 'Failed to set cache entry'
                    }, { status: 200 }); // Changed to 200 status with success: false
                }));
                const result = await client.set('test-key', { data: 'test-value' });
                expect(result).toBe(false);
            });
            it('should validate key parameter', async () => {
                const result1 = await client.set('', { data: 'test' });
                const result2 = await client.set(null, { data: 'test' });
                const result3 = await client.set(undefined, { data: 'test' });
                expect(result1).toBe(false);
                expect(result2).toBe(false);
                expect(result3).toBe(false);
            });
        });
        describe('get operation', () => {
            it('should successfully get cache entry', async () => {
                const testValue = { data: 'test-value', timestamp: Date.now() };
                server.use(msw_1.http.get(`${baseUrl}/cache/get/test-key`, () => {
                    return msw_1.HttpResponse.json({
                        key: 'test-key',
                        value: testValue,
                        found: true
                    });
                }));
                const result = await client.get('test-key');
                expect(result).toEqual(testValue);
            });
            it('should return null for non-existent key', async () => {
                server.use(msw_1.http.get(`${baseUrl}/cache/get/non-existent`, () => {
                    return msw_1.HttpResponse.json({
                        key: 'non-existent',
                        found: false,
                        message: 'Cache entry not found'
                    }, { status: 404 });
                }));
                const result = await client.get('non-existent');
                expect(result).toBeNull();
            });
            it('should handle URL encoding for special characters', async () => {
                const specialKey = 'test:key/with/special@chars#';
                const encodedKey = encodeURIComponent(specialKey);
                server.use(msw_1.http.get(`${baseUrl}/cache/get/${encodedKey}`, () => {
                    return msw_1.HttpResponse.json({
                        key: specialKey,
                        value: { data: 'special-value' },
                        found: true
                    });
                }));
                const result = await client.get(specialKey);
                expect(result).toEqual({ data: 'special-value' });
            });
            it('should validate key parameter', async () => {
                const result1 = await client.get('');
                const result2 = await client.get(null);
                const result3 = await client.get(undefined);
                expect(result1).toBeNull();
                expect(result2).toBeNull();
                expect(result3).toBeNull();
            });
        });
        describe('mget operation', () => {
            it('should successfully get multiple cache entries', async () => {
                const testData = [
                    { key: 'key1', value: { data: 'value1' } },
                    { key: 'key2', value: { data: 'value2' } },
                    { key: 'key3', value: null }
                ];
                server.use(msw_1.http.post(`${baseUrl}/cache/mget`, async ({ request }) => {
                    const body = await request.json();
                    expect(body.keys).toEqual(['key1', 'key2', 'key3']);
                    return msw_1.HttpResponse.json({
                        results: testData,
                        found: 2,
                        missing: 1,
                        missingKeys: ['key3']
                    });
                }));
                const result = await client.mget(['key1', 'key2', 'key3']);
                expect(result).toEqual(testData);
            });
            it('should handle empty keys array', async () => {
                const result = await client.mget([]);
                expect(result).toEqual([]);
            });
            it('should filter out invalid keys', async () => {
                const keys = ['valid-key', '', null, undefined, 'another-valid-key'];
                server.use(msw_1.http.post(`${baseUrl}/cache/mget`, async ({ request }) => {
                    const body = await request.json();
                    expect(body.keys).toEqual(['valid-key', 'another-valid-key']);
                    return msw_1.HttpResponse.json({
                        results: [
                            { key: 'valid-key', value: { data: 'value1' } },
                            { key: 'another-valid-key', value: { data: 'value2' } }
                        ]
                    });
                }));
                const result = await client.mget(keys);
                expect(result).toHaveLength(2);
            });
            it('should validate keys parameter', async () => {
                const result1 = await client.mget(null);
                const result2 = await client.mget(undefined);
                const result3 = await client.mget('not-an-array');
                expect(result1).toEqual([]);
                expect(result2).toEqual([]);
                expect(result3).toEqual([]);
            });
        });
        describe('delete operation', () => {
            it('should successfully delete cache entry', async () => {
                server.use(msw_1.http.delete(`${baseUrl}/cache/delete/test-key`, () => {
                    return msw_1.HttpResponse.json({
                        success: true,
                        key: 'test-key',
                        message: 'Cache entry deleted'
                    });
                }));
                const result = await client.delete('test-key');
                expect(result).toBe(true);
            });
            it('should handle deletion of non-existent key', async () => {
                server.use(msw_1.http.delete(`${baseUrl}/cache/delete/non-existent`, () => {
                    return msw_1.HttpResponse.json({
                        success: false,
                        key: 'non-existent',
                        message: 'Failed to delete cache entry'
                    });
                }));
                const result = await client.delete('non-existent');
                expect(result).toBe(false);
            });
            it('should validate key parameter', async () => {
                const result1 = await client.delete('');
                const result2 = await client.delete(null);
                const result3 = await client.delete(undefined);
                expect(result1).toBe(false);
                expect(result2).toBe(false);
                expect(result3).toBe(false);
            });
        });
        describe('invalidateByTag operation', () => {
            it('should successfully invalidate entries by tag', async () => {
                const invalidatedKeys = ['key1', 'key2', 'key3'];
                server.use(msw_1.http.post(`${baseUrl}/cache/invalidate/tag`, async ({ request }) => {
                    const body = await request.json();
                    expect(body.tag).toBe('test-tag');
                    return msw_1.HttpResponse.json({
                        tag: 'test-tag',
                        invalidatedCount: invalidatedKeys.length,
                        invalidatedKeys
                    });
                }));
                const result = await client.invalidateByTag('test-tag');
                expect(result).toEqual(invalidatedKeys);
            });
            it('should handle tag with no matching entries', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/invalidate/tag`, () => {
                    return msw_1.HttpResponse.json({
                        tag: 'non-existent-tag',
                        invalidatedCount: 0,
                        invalidatedKeys: []
                    });
                }));
                const result = await client.invalidateByTag('non-existent-tag');
                expect(result).toEqual([]);
            });
            it('should validate tag parameter', async () => {
                const result1 = await client.invalidateByTag('');
                const result2 = await client.invalidateByTag(null);
                const result3 = await client.invalidateByTag(undefined);
                expect(result1).toEqual([]);
                expect(result2).toEqual([]);
                expect(result3).toEqual([]);
            });
        });
        describe('getStats operation', () => {
            it('should successfully get cache statistics', async () => {
                const mockStats = {
                    memory: { used: 1024000, max: 1073741824 },
                    keyCount: 42,
                    accessPatterns: { totalRequests: 1000, hitRate: 0.85 },
                    config: { defaultTTL: 3600, maxValueSize: 10485760 }
                };
                server.use(msw_1.http.get(`${baseUrl}/cache/stats`, () => {
                    return msw_1.HttpResponse.json(mockStats);
                }));
                const result = await client.getStats();
                expect(result).toMatchObject(mockStats);
                expect(result.fallbackCache).toBeDefined();
                expect(result.fallbackCache.entries).toBe(0);
            });
            it('should include fallback cache stats', async () => {
                // Add something to fallback cache first
                client['setFallback']('test-key', { data: 'test' }, { ttl: 3600 });
                server.use(msw_1.http.get(`${baseUrl}/cache/stats`, () => {
                    return msw_1.HttpResponse.json({ keyCount: 10 });
                }));
                const result = await client.getStats();
                expect(result.fallbackCache.entries).toBe(1);
                expect(result.fallbackCache.maxEntries).toBe(100);
                expect(result.fallbackCache.memoryUsage).toBeGreaterThan(0);
            });
        });
        describe('healthCheck operation', () => {
            it('should return true when service is healthy', async () => {
                server.use(msw_1.http.get(`${baseUrl}/health`, () => {
                    return msw_1.HttpResponse.json({ status: 'healthy' });
                }));
                const result = await client.healthCheck();
                expect(result).toBe(true);
            });
            it('should return false when service is unhealthy', async () => {
                server.use(msw_1.http.get(`${baseUrl}/health`, () => {
                    return msw_1.HttpResponse.json({ status: 'unhealthy' }, { status: 503 });
                }));
                const result = await client.healthCheck();
                expect(result).toBe(false);
            });
        });
    });
    describe('Fallback Mechanisms', () => {
        describe('Network Failure Fallback', () => {
            it('should fall back to local cache when network is unavailable', async () => {
                // Mock network error
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    return msw_1.HttpResponse.error();
                }), msw_1.http.get(`${baseUrl}/cache/get/test-key`, () => {
                    return msw_1.HttpResponse.error();
                }));
                // Set should fall back to local cache
                const setResult = await client.set('test-key', { data: 'fallback-value' });
                expect(setResult).toBe(true);
                // Get should return from fallback cache
                const getResult = await client.get('test-key');
                expect(getResult).toEqual({ data: 'fallback-value' });
            });
            it('should handle mget fallback to local cache', async () => {
                // Set up some data in fallback cache
                client['setFallback']('key1', { data: 'value1' }, { ttl: 3600 });
                client['setFallback']('key2', { data: 'value2' }, { ttl: 3600 });
                server.use(msw_1.http.post(`${baseUrl}/cache/mget`, () => {
                    return msw_1.HttpResponse.error();
                }));
                const result = await client.mget(['key1', 'key2', 'key3']);
                expect(result).toEqual([
                    { key: 'key1', value: { data: 'value1' } },
                    { key: 'key2', value: { data: 'value2' } },
                    { key: 'key3', value: null }
                ]);
            });
            it('should delete from fallback cache even when service fails', async () => {
                // Set up data in fallback cache
                client['setFallback']('test-key', { data: 'test' }, { ttl: 3600 });
                expect(client['getFallback']('test-key')).toBeTruthy();
                server.use(msw_1.http.delete(`${baseUrl}/cache/delete/test-key`, () => {
                    return msw_1.HttpResponse.error();
                }));
                const result = await client.delete('test-key');
                expect(result).toBe(false); // Service failed
                expect(client['getFallback']('test-key')).toBeNull(); // But fallback was cleared
            });
        });
        describe('Timeout Handling', () => {
            it('should timeout and fall back after configured timeout', async () => {
                // Save original timeout
                const originalTimeout = process.env.CACHE_SERVICE_TIMEOUT;
                // Set short timeout for this test
                process.env.CACHE_SERVICE_TIMEOUT = '100';
                cache_service_client_1.CacheServiceClient['instance'] = undefined;
                const timeoutClient = cache_service_client_1.CacheServiceClient.getInstance();
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, async () => {
                    // Delay longer than timeout
                    await new Promise(resolve => setTimeout(resolve, 200));
                    return msw_1.HttpResponse.json({ success: true });
                }));
                const start = Date.now();
                const result = await timeoutClient.set('test-key', { data: 'test' });
                const duration = Date.now() - start;
                expect(result).toBe(true); // Fallback succeeded
                expect(duration).toBeLessThan(150); // Timed out quickly
                // Verify fallback cache was used
                const fallbackValue = timeoutClient['getFallback']('test-key');
                expect(fallbackValue).toEqual({ data: 'test' });
                timeoutClient.shutdown();
                // Restore original timeout
                if (originalTimeout) {
                    process.env.CACHE_SERVICE_TIMEOUT = originalTimeout;
                }
                else {
                    delete process.env.CACHE_SERVICE_TIMEOUT;
                }
            });
            it('should use shorter timeout for health checks', async () => {
                server.use(msw_1.http.get(`${baseUrl}/health`, async () => {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    return msw_1.HttpResponse.json({ status: 'healthy' });
                }));
                const start = Date.now();
                const result = await client.healthCheck();
                const duration = Date.now() - start;
                expect(result).toBe(false);
                expect(duration).toBeLessThan(1200); // Should timeout before 1500ms
            });
        });
        describe('HTTP Error Handling', () => {
            it('should handle 500 errors and fall back', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    return msw_1.HttpResponse.json({ error: 'Internal server error' }, { status: 500 });
                }));
                const result = await client.set('test-key', { data: 'test' });
                expect(result).toBe(true); // Fallback succeeded
                const fallbackValue = client['getFallback']('test-key');
                expect(fallbackValue).toEqual({ data: 'test' });
            });
            it('should handle 404 errors correctly for get operations', async () => {
                server.use(msw_1.http.get(`${baseUrl}/cache/get/non-existent`, () => {
                    return msw_1.HttpResponse.json({ message: 'Not found' }, { status: 404 });
                }));
                const result = await client.get('non-existent');
                expect(result).toBeNull();
            });
            it('should handle malformed JSON responses', async () => {
                server.use(msw_1.http.get(`${baseUrl}/cache/get/test-key`, () => {
                    return new Response('invalid json', {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }));
                const result = await client.get('test-key');
                expect(result).toBeNull();
            });
        });
        describe('Fallback Cache Management', () => {
            it('should expire fallback cache entries', async () => {
                // Set entry with short TTL
                client['setFallback']('test-key', { data: 'test' }, { ttl: 1 });
                // Verify it's there
                expect(client['getFallback']('test-key')).toEqual({ data: 'test' });
                // Wait for expiration
                await new Promise(resolve => setTimeout(resolve, 1100));
                // Should be expired
                expect(client['getFallback']('test-key')).toBeNull();
            });
            it('should evict oldest entries when cache is full', async () => {
                // Save original max entries
                const originalMaxEntries = process.env.CACHE_FALLBACK_MAX_ENTRIES;
                // Set max to 3 for testing
                process.env.CACHE_FALLBACK_MAX_ENTRIES = '3';
                cache_service_client_1.CacheServiceClient['instance'] = undefined;
                const limitedClient = cache_service_client_1.CacheServiceClient.getInstance();
                // Fill cache to capacity
                limitedClient['setFallback']('key1', 'value1', { ttl: 3600 });
                limitedClient['setFallback']('key2', 'value2', { ttl: 3600 });
                limitedClient['setFallback']('key3', 'value3', { ttl: 3600 });
                // Add one more - should evict oldest
                limitedClient['setFallback']('key4', 'value4', { ttl: 3600 });
                expect(limitedClient['getFallback']('key1')).toBeNull(); // Evicted
                expect(limitedClient['getFallback']('key2')).toBe('value2');
                expect(limitedClient['getFallback']('key3')).toBe('value3');
                expect(limitedClient['getFallback']('key4')).toBe('value4');
                limitedClient.shutdown();
                // Restore original max entries
                if (originalMaxEntries) {
                    process.env.CACHE_FALLBACK_MAX_ENTRIES = originalMaxEntries;
                }
                else {
                    delete process.env.CACHE_FALLBACK_MAX_ENTRIES;
                }
            });
            it('should clean up expired entries automatically', async () => {
                jest.useFakeTimers();
                // Set entries with different TTLs
                client['setFallback']('short-ttl', 'value1', { ttl: 1 });
                client['setFallback']('long-ttl', 'value2', { ttl: 3600 });
                expect(client.getConfiguration().fallbackCacheSize).toBe(2);
                // Fast-forward time past first entry's TTL
                jest.advanceTimersByTime(2000);
                // Trigger cleanup
                client['cleanupFallbackCache']();
                expect(client['getFallback']('short-ttl')).toBeNull();
                expect(client['getFallback']('long-ttl')).toBe('value2');
                expect(client.getConfiguration().fallbackCacheSize).toBe(1);
                jest.useRealTimers();
            });
            it('should estimate memory usage of fallback cache', async () => {
                client['setFallback']('small-key', 'small-value', { ttl: 3600 });
                client['setFallback']('large-key', 'x'.repeat(1000), { ttl: 3600 });
                const memoryUsage = client['estimateFallbackMemoryUsage']();
                expect(memoryUsage).toBeGreaterThan(0);
                expect(memoryUsage).toBeGreaterThan(1000); // Should account for large value
            });
        });
        describe('Service Recovery', () => {
            it('should prefer service over fallback when service recovers', async () => {
                // First, simulate service failure
                server.use(msw_1.http.get(`${baseUrl}/cache/get/test-key`, () => {
                    return msw_1.HttpResponse.error();
                }));
                // Set fallback data
                client['setFallback']('test-key', { data: 'fallback-value' }, { ttl: 3600 });
                // Verify fallback is used
                expect(await client.get('test-key')).toEqual({ data: 'fallback-value' });
                // Now simulate service recovery
                server.resetHandlers();
                server.use(msw_1.http.get(`${baseUrl}/cache/get/test-key`, () => {
                    return msw_1.HttpResponse.json({
                        key: 'test-key',
                        value: { data: 'service-value' },
                        found: true
                    });
                }));
                // Should now use service instead of fallback
                const result = await client.get('test-key');
                expect(result).toEqual({ data: 'service-value' });
            });
        });
    });
    describe('Edge Cases and Error Handling', () => {
        describe('Large Payload Handling', () => {
            it('should handle large values in fallback cache', async () => {
                const largeValue = { data: 'x'.repeat(1024 * 1024) }; // 1MB string
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    return msw_1.HttpResponse.error();
                }));
                const result = await client.set('large-key', largeValue);
                expect(result).toBe(true);
                const retrievedValue = client['getFallback']('large-key');
                expect(retrievedValue).toEqual(largeValue);
            });
            it('should handle large arrays in mget operations', async () => {
                const largeKeyArray = Array.from({ length: 1000 }, (_, i) => `key-${i}`);
                server.use(msw_1.http.post(`${baseUrl}/cache/mget`, () => {
                    return msw_1.HttpResponse.error();
                }));
                const result = await client.mget(largeKeyArray);
                expect(result).toHaveLength(1000);
                expect(result.every(item => item.value === null)).toBe(true);
            });
        });
        describe('Concurrent Operations', () => {
            it('should handle concurrent set operations', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, async () => {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return msw_1.HttpResponse.json({ success: true });
                }));
                const promises = Array.from({ length: 10 }, (_, i) => client.set(`concurrent-key-${i}`, { data: `value-${i}` }));
                const results = await Promise.all(promises);
                expect(results.every(result => result === true)).toBe(true);
            });
            it('should handle concurrent get operations during fallback', async () => {
                // Set up fallback data
                client['setFallback']('shared-key', { data: 'shared-value' }, { ttl: 3600 });
                server.use(msw_1.http.get(`${baseUrl}/cache/get/*`, () => {
                    return msw_1.HttpResponse.error();
                }));
                const promises = Array.from({ length: 10 }, () => client.get('shared-key'));
                const results = await Promise.all(promises);
                expect(results.every(result => result && result.data === 'shared-value')).toBe(true);
            });
            it('should handle concurrent operations with mixed success/failure', async () => {
                let requestCount = 0;
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    requestCount++;
                    // Fail every other request
                    if (requestCount % 2 === 0) {
                        return msw_1.HttpResponse.error();
                    }
                    return msw_1.HttpResponse.json({ success: true });
                }));
                const promises = Array.from({ length: 10 }, (_, i) => client.set(`mixed-key-${i}`, { data: `value-${i}` }));
                const results = await Promise.all(promises);
                expect(results.every(result => result === true)).toBe(true); // All should succeed (some via fallback)
            });
        });
        describe('Memory Pressure', () => {
            it('should handle fallback cache under memory pressure', async () => {
                // Fill fallback cache with many entries
                const maxEntries = client.getConfiguration().maxFallbackEntries;
                for (let i = 0; i < maxEntries + 10; i++) {
                    client['setFallback'](`key-${i}`, { data: `value-${i}` }, { ttl: 3600 });
                }
                // Should not exceed max entries
                expect(client.getConfiguration().fallbackCacheSize).toBeLessThanOrEqual(maxEntries);
                // Newest entries should still be there
                expect(client['getFallback'](`key-${maxEntries + 9}`)).toBeTruthy();
            });
            it('should handle JSON parsing errors gracefully', async () => {
                // Manually insert invalid JSON into fallback cache
                client['fallbackCache'].set('corrupt-key', {
                    value: { circular: {} },
                    expires: Date.now() + 3600000,
                    createdAt: Date.now()
                });
                // Create circular reference that would cause JSON.stringify to fail
                client['fallbackCache'].get('corrupt-key').value.circular.self =
                    client['fallbackCache'].get('corrupt-key').value.circular;
                // This shouldn't crash
                const memoryUsage = client['estimateFallbackMemoryUsage']();
                expect(typeof memoryUsage).toBe('number');
            });
        });
        describe('Service Partial Availability', () => {
            it('should handle service being available for some operations but not others', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    return msw_1.HttpResponse.json({ success: true });
                }), msw_1.http.get(`${baseUrl}/cache/get/*`, () => {
                    return msw_1.HttpResponse.error();
                }), msw_1.http.post(`${baseUrl}/cache/mget`, () => {
                    return msw_1.HttpResponse.json({ results: [] });
                }));
                // Set should work
                expect(await client.set('test-key', { data: 'test' })).toBe(true);
                // Get should fall back
                expect(await client.get('test-key')).toBeNull();
                // mget should work
                expect(await client.mget(['test-key'])).toEqual([]);
            });
            it('should handle intermittent service availability', async () => {
                let requestCount = 0;
                server.use(msw_1.http.get(`${baseUrl}/cache/get/intermittent-key`, () => {
                    requestCount++;
                    // Succeed every 3rd request
                    if (requestCount % 3 === 0) {
                        return msw_1.HttpResponse.json({
                            key: 'intermittent-key',
                            value: { data: 'service-value' },
                            found: true
                        });
                    }
                    return msw_1.HttpResponse.error();
                }));
                // Set fallback data
                client['setFallback']('intermittent-key', { data: 'fallback-value' }, { ttl: 3600 });
                const results = [];
                // Make multiple requests
                for (let i = 0; i < 5; i++) {
                    const result = await client.get('intermittent-key');
                    results.push(result);
                }
                // Should have mix of service and fallback responses
                const serviceResponses = results.filter(r => r && r.data === 'service-value');
                const fallbackResponses = results.filter(r => r && r.data === 'fallback-value');
                expect(serviceResponses.length).toBeGreaterThan(0);
                expect(fallbackResponses.length).toBeGreaterThan(0);
            });
        });
    });
    describe('Performance Testing', () => {
        describe('Operation Timing', () => {
            it('should complete get operations within performance threshold', async () => {
                server.use(msw_1.http.get(`${baseUrl}/cache/get/perf-test`, () => {
                    return msw_1.HttpResponse.json({
                        key: 'perf-test',
                        value: { data: 'test-value' },
                        found: true
                    });
                }));
                const { result, duration } = await global.testUtils.measureTime(() => client.get('perf-test'));
                expect(result).toEqual({ data: 'test-value' });
                expect(duration).toBeWithinPerformanceThreshold('GET_OPERATION_MS');
            });
            it('should complete set operations within performance threshold', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    return msw_1.HttpResponse.json({ success: true });
                }));
                const { result, duration } = await global.testUtils.measureTime(() => client.set('perf-test', { data: 'test-value' }));
                expect(result).toBe(true);
                expect(duration).toBeWithinPerformanceThreshold('SET_OPERATION_MS');
            });
            it('should complete mget operations within performance threshold', async () => {
                const keys = Array.from({ length: 100 }, (_, i) => `perf-key-${i}`);
                const results = keys.map(key => ({ key, value: { data: `value-${key}` } }));
                server.use(msw_1.http.post(`${baseUrl}/cache/mget`, () => {
                    return msw_1.HttpResponse.json({ results });
                }));
                const { result, duration } = await global.testUtils.measureTime(() => client.mget(keys));
                expect(result).toHaveLength(100);
                expect(duration).toBeWithinPerformanceThreshold('MGET_OPERATION_MS');
            });
            it('should complete delete operations within performance threshold', async () => {
                server.use(msw_1.http.delete(`${baseUrl}/cache/delete/perf-test`, () => {
                    return msw_1.HttpResponse.json({ success: true });
                }));
                const { result, duration } = await global.testUtils.measureTime(() => client.delete('perf-test'));
                expect(result).toBe(true);
                expect(duration).toBeWithinPerformanceThreshold('DELETE_OPERATION_MS');
            });
        });
        describe('Fallback Performance', () => {
            it('should have fast fallback cache access', async () => {
                // Set up fallback data
                client['setFallback']('fallback-perf-test', { data: 'test-value' }, { ttl: 3600 });
                server.use(msw_1.http.get(`${baseUrl}/cache/get/fallback-perf-test`, () => {
                    return msw_1.HttpResponse.error();
                }));
                const { result, duration } = await global.testUtils.measureTime(() => client.get('fallback-perf-test'));
                expect(result).toEqual({ data: 'test-value' });
                expect(duration).toBeLessThan(5); // Fallback should be very fast
            });
            it('should handle high-frequency fallback operations', async () => {
                server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                    return msw_1.HttpResponse.error();
                }), msw_1.http.get(`${baseUrl}/cache/get/*`, () => {
                    return msw_1.HttpResponse.error();
                }));
                const operations = global.testUtils.generateConcurrentOps(100, (i) => client.set(`high-freq-${i}`, { data: `value-${i}` }));
                const start = Date.now();
                const results = await Promise.all(operations);
                const duration = Date.now() - start;
                expect(results.every(result => result === true)).toBe(true);
                expect(duration).toBeLessThan(2000); // More reasonable expectation for 100 ops
            });
        });
        describe('Memory Usage', () => {
            it('should efficiently manage fallback cache memory', async () => {
                const initialMemory = client['estimateFallbackMemoryUsage']();
                // Add many entries
                for (let i = 0; i < 50; i++) {
                    client['setFallback'](`memory-test-${i}`, {
                        data: 'x'.repeat(1000),
                        index: i
                    }, { ttl: 3600 });
                }
                const memoryAfterInserts = client['estimateFallbackMemoryUsage']();
                expect(memoryAfterInserts).toBeGreaterThan(initialMemory);
                // Clear cache
                client.clearFallbackCache();
                const memoryAfterClear = client['estimateFallbackMemoryUsage']();
                expect(memoryAfterClear).toBe(0);
            });
            it('should handle memory estimation with complex objects', async () => {
                const complexObject = {
                    nested: {
                        array: [1, 2, 3, { deep: 'value' }],
                        boolean: true,
                        null_value: null,
                        undefined_value: undefined
                    },
                    string: 'test string',
                    number: 42.5
                };
                client['setFallback']('complex-object', complexObject, { ttl: 3600 });
                const memoryUsage = client['estimateFallbackMemoryUsage']();
                expect(memoryUsage).toBeGreaterThan(0);
                expect(typeof memoryUsage).toBe('number');
            });
        });
    });
    describe('Error Logging and Monitoring', () => {
        it('should log errors without throwing exceptions', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            server.use(msw_1.http.post(`${baseUrl}/cache/set`, () => {
                return msw_1.HttpResponse.error();
            }));
            // This should not throw
            await expect(client.set('error-test', { data: 'test' })).resolves.toBe(true);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cache service set failed, using fallback:'), expect.any(Error));
            consoleSpy.mockRestore();
        });
        it('should maintain service resilience under error conditions', async () => {
            // Simulate various error conditions
            const errorConditions = [
                () => msw_1.HttpResponse.error(),
                () => new Response('', { status: 500 }),
                () => new Response('invalid json', { status: 200 }),
                () => new Response('', { status: 404 })
            ];
            let conditionIndex = 0;
            server.use(msw_1.http.get(`${baseUrl}/cache/get/resilience-test`, () => {
                const condition = errorConditions[conditionIndex % errorConditions.length];
                conditionIndex++;
                return condition();
            }));
            // Set fallback data
            client['setFallback']('resilience-test', { data: 'fallback' }, { ttl: 3600 });
            // Multiple requests should all handle errors gracefully
            for (let i = 0; i < errorConditions.length; i++) {
                const result = await client.get('resilience-test');
                // Should either get fallback or null, but never throw
                expect([null, { data: 'fallback' }]).toContainEqual(result);
            }
        });
    });
    describe('Cleanup and Resource Management', () => {
        it('should properly cleanup resources on shutdown', async () => {
            // Start with a fresh instance that has cleanup interval
            cache_service_client_1.CacheServiceClient['instance'] = undefined;
            const cleanupClient = cache_service_client_1.CacheServiceClient.getInstance();
            // Add some data
            cleanupClient['setFallback']('cleanup-test', { data: 'test' }, { ttl: 3600 });
            expect(cleanupClient.getConfiguration().fallbackCacheSize).toBe(1);
            // Shutdown should clear everything
            cleanupClient.shutdown();
            expect(cleanupClient.getConfiguration().fallbackCacheSize).toBe(0);
            expect(cleanupClient['fallbackCleanupInterval']).toBeNull();
        });
        it('should handle automatic cleanup interval', async () => {
            jest.useFakeTimers();
            // Create client with cleanup interval
            cache_service_client_1.CacheServiceClient['instance'] = undefined;
            const intervalClient = cache_service_client_1.CacheServiceClient.getInstance();
            // Add expired and non-expired entries
            intervalClient['setFallback']('expired-key', 'value1', { ttl: 1 });
            intervalClient['setFallback']('valid-key', 'value2', { ttl: 3600 });
            expect(intervalClient.getConfiguration().fallbackCacheSize).toBe(2);
            // Fast-forward past expiration
            jest.advanceTimersByTime(2000);
            // Fast-forward to trigger cleanup (5 minutes)
            jest.advanceTimersByTime(5 * 60 * 1000);
            expect(intervalClient.getConfiguration().fallbackCacheSize).toBe(1);
            expect(intervalClient['getFallback']('expired-key')).toBeNull();
            expect(intervalClient['getFallback']('valid-key')).toBe('value2');
            intervalClient.shutdown();
            jest.useRealTimers();
        });
    });
});
//# sourceMappingURL=cache-service-client.test.js.map