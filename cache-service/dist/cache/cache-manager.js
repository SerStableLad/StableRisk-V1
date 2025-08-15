"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const cluster_connection_1 = require("../redis/cluster-connection");
const ttl_calculator_1 = require("./ttl-calculator");
const access_pattern_analyzer_1 = require("./access-pattern-analyzer");
const invalidation_strategy_1 = require("./invalidation-strategy");
const metrics_collector_1 = require("../metrics/metrics-collector");
const zlib = __importStar(require("zlib"));
const util_1 = require("util");
const gzip = (0, util_1.promisify)(zlib.gzip);
const gunzip = (0, util_1.promisify)(zlib.gunzip);
class CacheManager {
    static instance;
    redis;
    ttlCalculator;
    accessAnalyzer;
    invalidationStrategy;
    metrics;
    cleanupInterval = null;
    metricsInterval = null;
    // Cache configuration
    config = {
        maxMemory: parseInt(process.env.CACHE_MAX_MEMORY || '1073741824'), // 1GB
        defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600'), // 1 hour
        maxValueSize: parseInt(process.env.CACHE_MAX_VALUE_SIZE || '10485760'), // 10MB
        compressionThreshold: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD || '1024'), // 1KB
        enableCompression: process.env.CACHE_ENABLE_COMPRESSION !== 'false' // Default true
    };
    constructor() {
        this.redis = cluster_connection_1.RedisCluster.getInstance();
        this.ttlCalculator = new ttl_calculator_1.TTLCalculator();
        this.accessAnalyzer = new access_pattern_analyzer_1.AccessPatternAnalyzer();
        this.invalidationStrategy = new invalidation_strategy_1.CacheInvalidationStrategy(this.redis);
        this.metrics = metrics_collector_1.MetricsCollector.getInstance();
    }
    static getInstance() {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager();
        }
        return CacheManager.instance;
    }
    async initialize() {
        await this.redis.connect();
        await this.accessAnalyzer.initialize();
        await this.invalidationStrategy.initialize();
        // Start background tasks
        this.startCleanupTask();
        this.startMetricsCollection();
        console.log('Cache manager initialized successfully');
    }
    async set(key, value, options = {}) {
        try {
            const serializedValue = JSON.stringify(value);
            const dataSize = Buffer.byteLength(serializedValue, 'utf8');
            // Validate size limits
            if (dataSize > this.config.maxValueSize) {
                throw new Error(`Value size ${dataSize} exceeds maximum ${this.config.maxValueSize}`);
            }
            // Calculate intelligent TTL
            const accessPattern = await this.accessAnalyzer.getPattern(key);
            const calculatedTTL = this.ttlCalculator.calculateOptimalTTL(key, dataSize, accessPattern, options.ttl);
            // Prepare cache entry
            const entry = {
                key,
                value: serializedValue,
                ttl: calculatedTTL,
                createdAt: new Date(),
                lastAccessedAt: new Date(),
                accessCount: 0,
                dataSize,
                tags: options.tags || [],
                metadata: {
                    source: options.source,
                    version: options.version,
                    dependencies: options.dependencies,
                    ...options.metadata
                }
            };
            // Store compressed value if needed
            const valueToStore = this.shouldCompress(dataSize)
                ? await this.compress(serializedValue)
                : serializedValue;
            // Store in Redis with pipeline for atomic operations
            const pipeline = this.redis.pipeline();
            // Store main value
            pipeline.setex(this.getValueKey(key), calculatedTTL, valueToStore);
            // Store metadata
            pipeline.setex(this.getMetadataKey(key), calculatedTTL, JSON.stringify({
                ...entry,
                value: undefined // Don't duplicate value in metadata
            }));
            // Update tag indexes
            for (const tag of entry.tags) {
                pipeline.sadd(this.getTagKey(tag), key);
                pipeline.expire(this.getTagKey(tag), calculatedTTL * 2); // Tags live longer
            }
            // Update access patterns
            await this.accessAnalyzer.recordWrite(key, dataSize);
            await pipeline.exec();
            // Record metrics
            this.metrics.recordCacheSet(key, dataSize, calculatedTTL);
            return true;
        }
        catch (error) {
            console.error(`Cache set failed for key ${key}:`, error);
            this.metrics.recordCacheError('set', key, error instanceof Error ? error.message : String(error));
            return false;
        }
    }
    async get(key) {
        try {
            const start = Date.now();
            // Get value and metadata in parallel
            const [valueResult, metadataResult] = await Promise.all([
                this.redis.get(this.getValueKey(key)),
                this.redis.get(this.getMetadataKey(key))
            ]);
            if (!valueResult) {
                this.metrics.recordCacheMiss(key);
                return null;
            }
            // Decompress if needed
            const value = await this.decompress(valueResult);
            const parsedValue = JSON.parse(value);
            // Update access patterns
            const metadata = metadataResult ? JSON.parse(metadataResult) : null;
            await this.accessAnalyzer.recordRead(key, metadata?.dataSize || 0);
            // Update last accessed time
            if (metadata) {
                metadata.lastAccessedAt = new Date();
                metadata.accessCount++;
                // Update metadata in Redis (fire and forget)
                this.redis.setex(this.getMetadataKey(key), metadata.ttl, JSON.stringify(metadata)).catch(err => console.error('Failed to update metadata:', err));
            }
            const duration = Date.now() - start;
            this.metrics.recordCacheHit(key, metadata?.dataSize || 0, duration);
            return parsedValue;
        }
        catch (error) {
            console.error(`Cache get failed for key ${key}:`, error);
            this.metrics.recordCacheError('get', key, error instanceof Error ? error.message : String(error));
            return null;
        }
    }
    async mget(keys) {
        try {
            const pipeline = this.redis.pipeline();
            // Batch get all values and metadata
            keys.forEach(key => {
                pipeline.get(this.getValueKey(key));
                pipeline.get(this.getMetadataKey(key));
            });
            const results = await pipeline.exec();
            const responses = [];
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const valueResult = results[i * 2];
                const metadataResult = results[i * 2 + 1];
                if (valueResult && valueResult[1]) {
                    try {
                        const decompressedValue = await this.decompress(valueResult[1]);
                        const parsedValue = JSON.parse(decompressedValue);
                        responses.push({ key, value: parsedValue });
                        // Update access patterns asynchronously
                        const metadata = metadataResult && metadataResult[1]
                            ? JSON.parse(metadataResult[1])
                            : null;
                        this.accessAnalyzer.recordRead(key, metadata?.dataSize || 0)
                            .catch(err => console.error('Failed to record read pattern:', err));
                        this.metrics.recordCacheHit(key, metadata?.dataSize || 0, 0);
                    }
                    catch (parseError) {
                        console.error(`Failed to parse cached value for key ${key}:`, parseError);
                        responses.push({ key, value: null });
                        this.metrics.recordCacheError('parse', key, parseError instanceof Error ? parseError.message : String(parseError));
                    }
                }
                else {
                    responses.push({ key, value: null });
                    this.metrics.recordCacheMiss(key);
                }
            }
            return responses;
        }
        catch (error) {
            console.error('Batch cache get failed:', error);
            return keys.map(key => ({ key, value: null }));
        }
    }
    async delete(key) {
        try {
            const pipeline = this.redis.pipeline();
            // Get metadata first to clean up tags
            const metadata = await this.redis.get(this.getMetadataKey(key));
            if (metadata) {
                const parsedMetadata = JSON.parse(metadata);
                // Remove from tag indexes
                for (const tag of parsedMetadata.tags || []) {
                    pipeline.srem(this.getTagKey(tag), key);
                }
            }
            // Delete main keys
            pipeline.del(this.getValueKey(key));
            pipeline.del(this.getMetadataKey(key));
            await pipeline.exec();
            this.metrics.recordCacheDelete(key);
            return true;
        }
        catch (error) {
            console.error(`Cache delete failed for key ${key}:`, error);
            this.metrics.recordCacheError('delete', key, error instanceof Error ? error.message : String(error));
            return false;
        }
    }
    async invalidateByTag(tag) {
        return this.invalidationStrategy.invalidateByTag(tag);
    }
    async invalidateByPattern(pattern) {
        return this.invalidationStrategy.invalidateByPattern(pattern);
    }
    async getStats() {
        const info = await this.redis.info('memory');
        const keyCount = await this.redis.dbsize();
        const accessPatterns = await this.accessAnalyzer.getGlobalStats();
        return {
            memory: this.parseRedisInfo(info),
            keyCount,
            accessPatterns,
            config: this.config,
            metrics: this.metrics.getCacheMetrics(),
            performance: this.metrics.getPerformanceMetrics(),
            system: this.metrics.getSystemMetrics()
        };
    }
    async shutdown() {
        console.log('Shutting down cache manager...');
        // Stop background tasks
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        // Shutdown components
        await this.accessAnalyzer.shutdown();
        await this.redis.disconnect();
    }
    shouldCompress(dataSize) {
        return this.config.enableCompression && dataSize >= this.config.compressionThreshold;
    }
    async compress(data) {
        try {
            const compressed = await gzip(Buffer.from(data, 'utf8'));
            return `gzip:${compressed.toString('base64')}`;
        }
        catch (error) {
            console.warn('Compression failed, storing uncompressed:', error);
            return data;
        }
    }
    async decompress(data) {
        try {
            if (data.startsWith('gzip:')) {
                const compressedData = Buffer.from(data.substring(5), 'base64');
                const decompressed = await gunzip(compressedData);
                return decompressed.toString('utf8');
            }
            return data;
        }
        catch (error) {
            console.warn('Decompression failed, returning as-is:', error);
            return data;
        }
    }
    getValueKey(key) {
        return `cache:value:${key}`;
    }
    getMetadataKey(key) {
        return `cache:meta:${key}`;
    }
    getTagKey(tag) {
        return `cache:tag:${tag}`;
    }
    parseRedisInfo(info) {
        const lines = info.split('\n');
        const result = {};
        for (const line of lines) {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                result[key.trim()] = value.trim();
            }
        }
        return result;
    }
    startCleanupTask() {
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.performCleanup();
            }
            catch (error) {
                console.error('Cleanup task failed:', error);
            }
        }, 5 * 60 * 1000);
    }
    startMetricsCollection() {
        // Collect metrics every minute
        this.metricsInterval = setInterval(async () => {
            try {
                const stats = await this.getStats();
                this.metrics.recordSystemStats(stats);
            }
            catch (error) {
                console.error('Metrics collection failed:', error);
            }
        }, 60 * 1000);
    }
    async performCleanup() {
        console.log('Performing cache cleanup...');
        try {
            // Get cleanup recommendations from access analyzer
            const recommendations = await this.accessAnalyzer.getOptimizationRecommendations();
            // Clean up expired tag indexes and orphaned metadata
            const invalidationStats = await this.invalidationStrategy.getStats();
            // Log cleanup results
            console.log(`Cleanup completed - eviction candidates: ${recommendations.evictionCandidates.length}, tag keys: ${invalidationStats.totalTagKeys}`);
        }
        catch (error) {
            console.error('Cleanup failed:', error);
        }
    }
    // Additional utility methods
    async healthCheck() {
        try {
            const redisHealthy = await this.redis.isHealthy();
            const metricsHealthy = this.metrics.getHealthStatus().healthy;
            const uptime = (Date.now() - this.metrics.getSystemMetrics().uptime) / 1000;
            return {
                healthy: redisHealthy && metricsHealthy,
                redis: redisHealthy,
                metrics: metricsHealthy,
                uptime
            };
        }
        catch (error) {
            return {
                healthy: false,
                redis: false,
                metrics: false,
                uptime: 0
            };
        }
    }
    // Configuration methods
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('Cache configuration updated:', newConfig);
    }
    getConfig() {
        return { ...this.config };
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cache-manager.js.map