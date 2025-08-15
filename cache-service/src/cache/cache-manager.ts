import { RedisCluster } from '../redis/cluster-connection';
import { TTLCalculator } from './ttl-calculator';
import { AccessPatternAnalyzer } from './access-pattern-analyzer';
import { CacheInvalidationStrategy } from './invalidation-strategy';
import { MetricsCollector } from '../metrics/metrics-collector';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface CacheEntry {
  key: string;
  value: any;
  ttl: number;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
  dataSize: number;
  tags: string[];
  metadata: {
    source?: string;
    version?: string;
    dependencies?: string[];
    [key: string]: any;
  };
}

export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  dependencies?: string[];
  source?: string;
  version?: string;
  metadata?: Record<string, any>;
}

export class CacheManager {
  private static instance: CacheManager;
  private redis: RedisCluster;
  private ttlCalculator: TTLCalculator;
  private accessAnalyzer: AccessPatternAnalyzer;
  private invalidationStrategy: CacheInvalidationStrategy;
  private metrics: MetricsCollector;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  
  // Cache configuration
  private config = {
    maxMemory: parseInt(process.env.CACHE_MAX_MEMORY || '1073741824'), // 1GB
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600'), // 1 hour
    maxValueSize: parseInt(process.env.CACHE_MAX_VALUE_SIZE || '10485760'), // 10MB
    compressionThreshold: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD || '1024'), // 1KB
    enableCompression: process.env.CACHE_ENABLE_COMPRESSION !== 'false' // Default true
  };

  private constructor() {
    this.redis = RedisCluster.getInstance();
    this.ttlCalculator = new TTLCalculator();
    this.accessAnalyzer = new AccessPatternAnalyzer();
    this.invalidationStrategy = new CacheInvalidationStrategy(this.redis);
    this.metrics = MetricsCollector.getInstance();
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  async initialize(): Promise<void> {
    await this.redis.connect();
    await this.accessAnalyzer.initialize();
    await this.invalidationStrategy.initialize();
    
    // Start background tasks
    this.startCleanupTask();
    this.startMetricsCollection();
    
    console.log('Cache manager initialized successfully');
  }

  async set(
    key: string,
    value: any,
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const serializedValue = JSON.stringify(value);
      const dataSize = Buffer.byteLength(serializedValue, 'utf8');
      
      // Validate size limits
      if (dataSize > this.config.maxValueSize) {
        throw new Error(`Value size ${dataSize} exceeds maximum ${this.config.maxValueSize}`);
      }

      // Calculate intelligent TTL
      const accessPattern = await this.accessAnalyzer.getPattern(key);
      const calculatedTTL = this.ttlCalculator.calculateOptimalTTL(
        key,
        dataSize,
        accessPattern,
        options.ttl
      );

      // Prepare cache entry
      const entry: CacheEntry = {
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
      pipeline.setex(
        this.getMetadataKey(key),
        calculatedTTL,
        JSON.stringify({
          ...entry,
          value: undefined // Don't duplicate value in metadata
        })
      );

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
    } catch (error) {
      console.error(`Cache set failed for key ${key}:`, error);
      this.metrics.recordCacheError('set', key, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async get(key: string): Promise<any> {
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
        this.redis.setex(
          this.getMetadataKey(key),
          metadata.ttl,
          JSON.stringify(metadata)
        ).catch(err => console.error('Failed to update metadata:', err));
      }

      const duration = Date.now() - start;
      this.metrics.recordCacheHit(key, metadata?.dataSize || 0, duration);
      
      return parsedValue;
    } catch (error) {
      console.error(`Cache get failed for key ${key}:`, error);
      this.metrics.recordCacheError('get', key, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async mget(keys: string[]): Promise<Array<{ key: string; value: any }>> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Batch get all values and metadata
      keys.forEach(key => {
        pipeline.get(this.getValueKey(key));
        pipeline.get(this.getMetadataKey(key));
      });

      const results = await pipeline.exec();
      const responses: Array<{ key: string; value: any }> = [];

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const valueResult = results[i * 2];
        const metadataResult = results[i * 2 + 1];

        if (valueResult && valueResult[1]) {
          try {
            const decompressedValue = await this.decompress(valueResult[1] as string);
            const parsedValue = JSON.parse(decompressedValue);
            
            responses.push({ key, value: parsedValue });
            
            // Update access patterns asynchronously
            const metadata = metadataResult && metadataResult[1] 
              ? JSON.parse(metadataResult[1] as string)
              : null;
              
            this.accessAnalyzer.recordRead(key, metadata?.dataSize || 0)
              .catch(err => console.error('Failed to record read pattern:', err));
              
            this.metrics.recordCacheHit(key, metadata?.dataSize || 0, 0);
          } catch (parseError) {
            console.error(`Failed to parse cached value for key ${key}:`, parseError);
            responses.push({ key, value: null });
            this.metrics.recordCacheError('parse', key, parseError instanceof Error ? parseError.message : String(parseError));
          }
        } else {
          responses.push({ key, value: null });
          this.metrics.recordCacheMiss(key);
        }
      }

      return responses;
    } catch (error) {
      console.error('Batch cache get failed:', error);
      return keys.map(key => ({ key, value: null }));
    }
  }

  async delete(key: string): Promise<boolean> {
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
    } catch (error) {
      console.error(`Cache delete failed for key ${key}:`, error);
      this.metrics.recordCacheError('delete', key, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async invalidateByTag(tag: string): Promise<string[]> {
    return this.invalidationStrategy.invalidateByTag(tag);
  }

  async invalidateByPattern(pattern: string): Promise<string[]> {
    return this.invalidationStrategy.invalidateByPattern(pattern);
  }

  async getStats(): Promise<any> {
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

  async shutdown(): Promise<void> {
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

  private shouldCompress(dataSize: number): boolean {
    return this.config.enableCompression && dataSize >= this.config.compressionThreshold;
  }

  private async compress(data: string): Promise<string> {
    try {
      const compressed = await gzip(Buffer.from(data, 'utf8'));
      return `gzip:${compressed.toString('base64')}`;
    } catch (error) {
      console.warn('Compression failed, storing uncompressed:', error);
      return data;
    }
  }

  private async decompress(data: string): Promise<string> {
    try {
      if (data.startsWith('gzip:')) {
        const compressedData = Buffer.from(data.substring(5), 'base64');
        const decompressed = await gunzip(compressedData);
        return decompressed.toString('utf8');
      }
      return data;
    } catch (error) {
      console.warn('Decompression failed, returning as-is:', error);
      return data;
    }
  }

  private getValueKey(key: string): string {
    return `cache:value:${key}`;
  }

  private getMetadataKey(key: string): string {
    return `cache:meta:${key}`;
  }

  private getTagKey(tag: string): string {
    return `cache:tag:${tag}`;
  }

  private parseRedisInfo(info: string): any {
    const lines = info.split('\n');
    const result: any = {};
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key.trim()] = value.trim();
      }
    }
    
    return result;
  }

  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        console.error('Cleanup task failed:', error);
      }
    }, 5 * 60 * 1000);
  }

  private startMetricsCollection(): void {
    // Collect metrics every minute
    this.metricsInterval = setInterval(async () => {
      try {
        const stats = await this.getStats();
        this.metrics.recordSystemStats(stats);
      } catch (error) {
        console.error('Metrics collection failed:', error);
      }
    }, 60 * 1000);
  }

  private async performCleanup(): Promise<void> {
    console.log('Performing cache cleanup...');
    
    try {
      // Get cleanup recommendations from access analyzer
      const recommendations = await this.accessAnalyzer.getOptimizationRecommendations();
      
      // Clean up expired tag indexes and orphaned metadata
      const invalidationStats = await this.invalidationStrategy.getStats();
      
      // Log cleanup results
      console.log(`Cleanup completed - eviction candidates: ${recommendations.evictionCandidates.length}, tag keys: ${invalidationStats.totalTagKeys}`);
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  // Additional utility methods
  async healthCheck(): Promise<{
    healthy: boolean;
    redis: boolean;
    metrics: boolean;
    uptime: number;
  }> {
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
    } catch (error) {
      return {
        healthy: false,
        redis: false,
        metrics: false,
        uptime: 0
      };
    }
  }

  // Configuration methods
  updateConfig(newConfig: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Cache configuration updated:', newConfig);
  }

  getConfig(): typeof this.config {
    return { ...this.config };
  }
}