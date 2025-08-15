"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheInvalidationStrategy = void 0;
const cluster_connection_1 = require("../redis/cluster-connection");
class CacheInvalidationStrategy {
    redis = null;
    batchSize = 100; // Process invalidations in batches
    maxScanCount = 1000; // Maximum keys to scan in one operation
    constructor(redis) {
        this.redis = redis || null;
    }
    async initialize() {
        if (!this.redis) {
            this.redis = cluster_connection_1.RedisCluster.getInstance();
        }
        console.log('Cache Invalidation Strategy initialized');
    }
    /**
     * Invalidate all cache entries with a specific tag
     */
    async invalidateByTag(tag) {
        if (!this.redis) {
            throw new Error('Redis connection not initialized');
        }
        const start = Date.now();
        const tagKey = `cache:tag:${tag}`;
        const invalidated = [];
        try {
            // Get all keys associated with this tag
            const members = await this.redis.smembers(tagKey);
            if (members.length === 0) {
                return [];
            }
            // Invalidate in batches for better performance
            const batches = this.createBatches(members, this.batchSize);
            for (const batch of batches) {
                const pipeline = this.redis.pipeline();
                for (const member of batch) {
                    const valueKey = `cache:value:${member}`;
                    const metaKey = `cache:meta:${member}`;
                    pipeline.del(valueKey);
                    pipeline.del(metaKey);
                    // Remove from other tag indexes
                    pipeline.srem(tagKey, member);
                }
                await pipeline.exec();
                invalidated.push(...batch);
            }
            // Clean up the tag key if empty
            const remainingMembers = await this.redis.smembers(tagKey);
            if (remainingMembers.length === 0) {
                await this.redis.del(tagKey);
            }
            const duration = Date.now() - start;
            console.log(`Tag invalidation completed: ${invalidated.length} keys in ${duration}ms`);
            return invalidated;
        }
        catch (error) {
            console.error(`Tag invalidation failed for tag "${tag}":`, error);
            throw error;
        }
    }
    /**
     * Invalidate cache entries matching a pattern
     */
    async invalidateByPattern(pattern) {
        if (!this.redis) {
            throw new Error('Redis connection not initialized');
        }
        const start = Date.now();
        const invalidated = [];
        try {
            let cursor = '0';
            do {
                // Use SCAN to find matching keys
                const [nextCursor, keys] = await this.redis.scan(parseInt(cursor), 'MATCH', pattern, 'COUNT', this.maxScanCount);
                cursor = nextCursor;
                if (keys.length > 0) {
                    // Filter to only cache value keys to avoid duplicate invalidation
                    const valueKeys = keys.filter(key => key.startsWith('cache:value:'));
                    if (valueKeys.length > 0) {
                        const batches = this.createBatches(valueKeys, this.batchSize);
                        for (const batch of batches) {
                            const pipeline = this.redis.pipeline();
                            for (const valueKey of batch) {
                                const cacheKey = valueKey.replace('cache:value:', '');
                                const metaKey = `cache:meta:${cacheKey}`;
                                // Get metadata to clean up tag references
                                pipeline.get(metaKey);
                                pipeline.del(valueKey);
                                pipeline.del(metaKey);
                            }
                            const results = await pipeline.exec();
                            // Clean up tag references
                            const tagCleanupPipeline = this.redis.pipeline();
                            for (let i = 0; i < batch.length; i++) {
                                const valueKey = batch[i];
                                const cacheKey = valueKey.replace('cache:value:', '');
                                const metadataResult = results[i * 3]; // Get result from metadata fetch
                                if (metadataResult && metadataResult[1]) {
                                    try {
                                        const metadata = JSON.parse(metadataResult[1]);
                                        if (metadata.tags) {
                                            for (const tag of metadata.tags) {
                                                tagCleanupPipeline.srem(`cache:tag:${tag}`, cacheKey);
                                            }
                                        }
                                    }
                                    catch (parseError) {
                                        console.warn(`Failed to parse metadata for ${cacheKey}:`, parseError);
                                    }
                                }
                                invalidated.push(cacheKey);
                            }
                            await tagCleanupPipeline.exec();
                        }
                    }
                }
            } while (cursor !== '0');
            const duration = Date.now() - start;
            console.log(`Pattern invalidation completed: ${invalidated.length} keys in ${duration}ms`);
            return invalidated;
        }
        catch (error) {
            console.error(`Pattern invalidation failed for pattern "${pattern}":`, error);
            throw error;
        }
    }
    /**
     * Invalidate specific cache keys
     */
    async invalidateKeys(keys) {
        if (!this.redis) {
            throw new Error('Redis connection not initialized');
        }
        const start = Date.now();
        const invalidated = [];
        const errors = [];
        try {
            const batches = this.createBatches(keys, this.batchSize);
            for (const batch of batches) {
                const pipeline = this.redis.pipeline();
                for (const key of batch) {
                    const valueKey = `cache:value:${key}`;
                    const metaKey = `cache:meta:${key}`;
                    // Get metadata first to clean up tags
                    pipeline.get(metaKey);
                    pipeline.del(valueKey);
                    pipeline.del(metaKey);
                }
                const results = await pipeline.exec();
                // Clean up tag references
                const tagCleanupPipeline = this.redis.pipeline();
                for (let i = 0; i < batch.length; i++) {
                    const key = batch[i];
                    const metadataResult = results[i * 3]; // Get result from metadata fetch
                    if (metadataResult && metadataResult[1]) {
                        try {
                            const metadata = JSON.parse(metadataResult[1]);
                            if (metadata.tags) {
                                for (const tag of metadata.tags) {
                                    tagCleanupPipeline.srem(`cache:tag:${tag}`, key);
                                }
                            }
                            invalidated.push(key);
                        }
                        catch (parseError) {
                            errors.push(`Failed to parse metadata for ${key}: ${parseError.message}`);
                        }
                    }
                    else {
                        // Key might not exist, but that's not an error for invalidation
                        invalidated.push(key);
                    }
                }
                await tagCleanupPipeline.exec();
            }
            const duration = Date.now() - start;
            return {
                invalidatedKeys: invalidated,
                totalInvalidated: invalidated.length,
                operationDuration: duration,
                errors
            };
        }
        catch (error) {
            console.error('Key invalidation failed:', error);
            throw error;
        }
    }
    /**
     * Invalidate all cache entries (nuclear option)
     */
    async invalidateAll() {
        if (!this.redis) {
            throw new Error('Redis connection not initialized');
        }
        const start = Date.now();
        try {
            // Use pattern invalidation to clear all cache entries
            const invalidated = await this.invalidateByPattern('cache:*');
            const duration = Date.now() - start;
            return {
                invalidatedKeys: invalidated,
                totalInvalidated: invalidated.length,
                operationDuration: duration,
                errors: []
            };
        }
        catch (error) {
            console.error('Full cache invalidation failed:', error);
            throw error;
        }
    }
    /**
     * Get invalidation recommendations based on patterns
     */
    async getInvalidationRecommendations() {
        if (!this.redis) {
            throw new Error('Redis connection not initialized');
        }
        const recommendations = [];
        try {
            // Analyze existing cache keys for common patterns
            let cursor = '0';
            const keyPatterns = new Map();
            do {
                const [nextCursor, keys] = await this.redis.scan(parseInt(cursor), 'MATCH', 'cache:value:*', 'COUNT', this.maxScanCount);
                cursor = nextCursor;
                for (const key of keys) {
                    const cacheKey = key.replace('cache:value:', '');
                    const parts = cacheKey.split(':');
                    if (parts.length > 1) {
                        const pattern = `${parts[0]}:*`;
                        keyPatterns.set(pattern, (keyPatterns.get(pattern) || 0) + 1);
                    }
                }
            } while (cursor !== '0');
            // Generate recommendations based on pattern frequency
            for (const [pattern, count] of keyPatterns.entries()) {
                if (count > 10) {
                    recommendations.push({
                        pattern,
                        reason: `High frequency pattern with ${count} keys - consider bulk invalidation`,
                        priority: count > 100 ? 'high' : count > 50 ? 'medium' : 'low'
                    });
                }
            }
            return recommendations;
        }
        catch (error) {
            console.error('Failed to get invalidation recommendations:', error);
            return [];
        }
    }
    /**
     * Schedule background invalidation
     */
    async scheduleInvalidation(patterns, delayMs = 0) {
        const jobId = `invalidation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setTimeout(async () => {
            try {
                for (const pattern of patterns) {
                    if (pattern.includes('tag:')) {
                        const tag = pattern.replace('tag:', '');
                        await this.invalidateByTag(tag);
                    }
                    else {
                        await this.invalidateByPattern(pattern);
                    }
                }
                console.log(`Scheduled invalidation job ${jobId} completed`);
            }
            catch (error) {
                console.error(`Scheduled invalidation job ${jobId} failed:`, error);
            }
        }, delayMs);
        return jobId;
    }
    /**
     * Get invalidation statistics
     */
    async getStats() {
        if (!this.redis) {
            throw new Error('Redis connection not initialized');
        }
        try {
            let cursor = '0';
            let totalTagKeys = 0;
            let totalCacheKeys = 0;
            const tagSizes = [];
            do {
                const [nextCursor, keys] = await this.redis.scan(parseInt(cursor), 'COUNT', this.maxScanCount);
                cursor = nextCursor;
                for (const key of keys) {
                    if (key.startsWith('cache:tag:')) {
                        totalTagKeys++;
                        const size = await this.redis.scard(key);
                        tagSizes.push({
                            tag: key.replace('cache:tag:', ''),
                            size
                        });
                    }
                    else if (key.startsWith('cache:value:')) {
                        totalCacheKeys++;
                    }
                }
            } while (cursor !== '0');
            // Sort tags by size and get top 10
            tagSizes.sort((a, b) => b.size - a.size);
            const largestTags = tagSizes.slice(0, 10);
            const averageTagSize = tagSizes.length > 0 ?
                tagSizes.reduce((sum, tag) => sum + tag.size, 0) / tagSizes.length : 0;
            return {
                totalTagKeys,
                averageTagSize,
                largestTags,
                totalCacheKeys
            };
        }
        catch (error) {
            console.error('Failed to get invalidation stats:', error);
            throw error;
        }
    }
    /**
     * Private helper methods
     */
    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
    /**
     * Set batch size for operations
     */
    setBatchSize(size) {
        if (size < 1 || size > 1000) {
            throw new Error('Batch size must be between 1 and 1000');
        }
        this.batchSize = size;
    }
    /**
     * Set maximum scan count
     */
    setMaxScanCount(count) {
        if (count < 100 || count > 10000) {
            throw new Error('Max scan count must be between 100 and 10000');
        }
        this.maxScanCount = count;
    }
}
exports.CacheInvalidationStrategy = CacheInvalidationStrategy;
//# sourceMappingURL=invalidation-strategy.js.map