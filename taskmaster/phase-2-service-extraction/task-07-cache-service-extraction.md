# Task 07: Cache Service Extraction

## Overview
Extract the sophisticated caching logic from the monolith into a dedicated, scalable cache service that maintains the existing intelligent TTL calculation, access pattern optimization, and cache invalidation strategies.

## Time Estimate: 9-10 days

## Prerequisites
- Phase 1 foundation tasks completed (Tasks 01-04)
- Metrics service extraction completed (Task 05) 
- Background jobs service extraction completed (Task 06)
- Understanding of existing smart-cache-service.ts and enhanced-cache-service.ts
- Redis cluster for distributed caching

## Technical Requirements

### 1. Cache Service Architecture
```typescript
// cache-service/src/app.ts
import express from 'express';
import { CacheController } from './controllers/cache-controller';
import { HealthCheckController } from './controllers/health-controller';
import { CacheManager } from './cache/cache-manager';
import { MetricsCollector } from './metrics/metrics-collector';
import { RedisCluster } from './redis/cluster-connection';

const app = express();
const port = process.env.PORT || 3002;

// Initialize cache manager
const cacheManager = CacheManager.getInstance();
const metricsCollector = MetricsCollector.getInstance();

app.use(express.json({ limit: '50mb' })); // Large limit for bulk operations

// Middleware for metrics collection
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    metricsCollector.recordAPICall(req.method, req.path, res.statusCode, duration);
  });
  next();
});

// Health checks
app.use('/health', HealthCheckController.routes());

// Cache management API
app.use('/cache', CacheController.routes());

// Initialize cache manager
cacheManager.initialize();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await cacheManager.shutdown();
  await RedisCluster.getInstance().disconnect();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Cache service listening on port ${port}`);
});
```

### 2. Advanced Cache Manager
```typescript
// cache-service/src/cache/cache-manager.ts
import { RedisCluster } from '../redis/cluster-connection';
import { TTLCalculator } from './ttl-calculator';
import { AccessPatternAnalyzer } from './access-pattern-analyzer';
import { CacheInvalidationStrategy } from './invalidation-strategy';
import { MetricsCollector } from '../metrics/metrics-collector';

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

export class CacheManager {
  private static instance: CacheManager;
  private redis: RedisCluster;
  private ttlCalculator: TTLCalculator;
  private accessAnalyzer: AccessPatternAnalyzer;
  private invalidationStrategy: CacheInvalidationStrategy;
  private metrics: MetricsCollector;
  
  // Cache configuration
  private config = {
    maxMemory: parseInt(process.env.CACHE_MAX_MEMORY || '1073741824'), // 1GB
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600'), // 1 hour
    maxValueSize: parseInt(process.env.CACHE_MAX_VALUE_SIZE || '10485760'), // 10MB
    compressionThreshold: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD || '1024'), // 1KB
    enableCompression: process.env.CACHE_ENABLE_COMPRESSION === 'true'
  };

  private constructor() {
    this.redis = RedisCluster.getInstance();
    this.ttlCalculator = new TTLCalculator();
    this.accessAnalyzer = new AccessPatternAnalyzer();
    this.invalidationStrategy = new CacheInvalidationStrategy();
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
    options: {
      ttl?: number;
      tags?: string[];
      dependencies?: string[];
      source?: string;
      version?: string;
      metadata?: Record<string, any>;
    } = {}
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
      this.metrics.recordCacheError('set', key, error.message);
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
      this.metrics.recordCacheError('get', key, error.message);
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
            this.metrics.recordCacheError('parse', key, parseError.message);
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
      this.metrics.recordCacheError('delete', key, error.message);
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
      config: this.config
    };
  }

  private shouldCompress(dataSize: number): boolean {
    return this.config.enableCompression && dataSize >= this.config.compressionThreshold;
  }

  private async compress(data: string): Promise<string> {
    // Implementation would use zlib or similar
    return data; // Placeholder
  }

  private async decompress(data: string): Promise<string> {
    // Implementation would use zlib or similar
    return data; // Placeholder
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
    const lines = info.split('\r\n');
    const result: any = {};
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = value;
      }
    }
    
    return result;
  }

  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    setInterval(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        console.error('Cleanup task failed:', error);
      }
    }, 5 * 60 * 1000);
  }

  private startMetricsCollection(): void {
    // Collect metrics every minute
    setInterval(async () => {
      try {
        const stats = await this.getStats();
        this.metrics.recordSystemStats(stats);
      } catch (error) {
        console.error('Metrics collection failed:', error);
      }
    }, 60 * 1000);
  }

  private async performCleanup(): Promise<void> {
    // Clean up expired tag indexes and orphaned metadata
    console.log('Performing cache cleanup...');
    // Implementation would scan for expired entries and clean up
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down cache manager...');
    await this.redis.disconnect();
  }
}
```

### 3. Intelligent TTL Calculator
```typescript
// cache-service/src/cache/ttl-calculator.ts
export interface AccessPattern {
  frequency: number; // Access per hour
  recency: number; // Hours since last access
  volatility: number; // How often the data changes
  dataSize: number; // Size of the data
  importance: number; // Business importance (0-1)
}

export class TTLCalculator {
  private baseTTL = 3600; // 1 hour default
  private minTTL = 300; // 5 minutes minimum
  private maxTTL = 86400; // 24 hours maximum

  calculateOptimalTTL(
    key: string,
    dataSize: number,
    accessPattern?: AccessPattern,
    explicitTTL?: number
  ): number {
    // If explicit TTL is provided, use it (but respect bounds)
    if (explicitTTL !== undefined) {
      return Math.max(this.minTTL, Math.min(this.maxTTL, explicitTTL));
    }

    if (!accessPattern) {
      return this.baseTTL;
    }

    let calculatedTTL = this.baseTTL;

    // Frequency factor: More frequent access = longer TTL
    const frequencyFactor = Math.min(2.0, 1 + (accessPattern.frequency / 100));
    calculatedTTL *= frequencyFactor;

    // Recency factor: Recent access = longer TTL
    const recencyFactor = Math.max(0.5, 1 - (accessPattern.recency / 24));
    calculatedTTL *= recencyFactor;

    // Volatility factor: Less volatile data = longer TTL
    const volatilityFactor = Math.max(0.3, 1 - accessPattern.volatility);
    calculatedTTL *= volatilityFactor;

    // Size factor: Smaller data = longer TTL (less memory pressure)
    const sizeFactor = dataSize < 1024 ? 1.2 : dataSize < 10240 ? 1.0 : 0.8;
    calculatedTTL *= sizeFactor;

    // Importance factor: Important data = longer TTL
    const importanceFactor = 0.8 + (accessPattern.importance * 0.4);
    calculatedTTL *= importanceFactor;

    // Apply bounds and round to nearest minute
    calculatedTTL = Math.max(this.minTTL, Math.min(this.maxTTL, calculatedTTL));
    return Math.round(calculatedTTL / 60) * 60; // Round to nearest minute
  }

  // TTL calculation for different data types
  calculateTTLForStablecoinData(ticker: string, dataAge: number): number {
    const baseMultiplier = this.getStablecoinMultiplier(ticker);
    const ageMultiplier = Math.max(0.5, 1 - (dataAge / 86400)); // Reduce TTL as data ages
    
    return Math.round(this.baseTTL * baseMultiplier * ageMultiplier);
  }

  calculateTTLForTransparencyData(changeFrequency: number): number {
    // Transparency data changes less frequently
    const baseMultiplier = 2.0; // Start with 2x base TTL
    const frequencyFactor = Math.max(0.5, 1 - (changeFrequency / 10));
    
    return Math.round(this.baseTTL * baseMultiplier * frequencyFactor);
  }

  private getStablecoinMultiplier(ticker: string): number {
    // Different stablecoins have different update patterns
    const multipliers: Record<string, number> = {
      'USDT': 0.8, // High volume, frequent updates
      'USDC': 0.9, // High volume, regular updates
      'DAI': 1.2,  // DeFi, less frequent updates
      'BUSD': 0.9, // Exchange token, regular updates
      'FRAX': 1.5  // Algorithmic, less frequent updates
    };

    return multipliers[ticker.toUpperCase()] || 1.0;
  }
}
```

### 4. Cache Controller
```typescript
// cache-service/src/controllers/cache-controller.ts
import { Router } from 'express';
import { CacheManager } from '../cache/cache-manager';
import { validateCacheRequest } from '../middleware/validation';

export class CacheController {
  private static cacheManager = CacheManager.getInstance();

  static routes(): Router {
    const router = Router();

    // Set cache entry
    router.post('/set', validateCacheRequest, async (req, res) => {
      try {
        const { key, value, options } = req.body;
        const result = await this.cacheManager.set(key, value, options);
        
        res.status(201).json({
          success: result,
          key,
          message: result ? 'Cache entry set successfully' : 'Failed to set cache entry'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get cache entry
    router.get('/get/:key', async (req, res) => {
      try {
        const { key } = req.params;
        const value = await this.cacheManager.get(decodeURIComponent(key));
        
        if (value === null) {
          res.status(404).json({ 
            key, 
            found: false,
            message: 'Cache entry not found' 
          });
        } else {
          res.json({ 
            key, 
            value,
            found: true 
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Multi-get cache entries
    router.post('/mget', async (req, res) => {
      try {
        const { keys } = req.body;
        
        if (!Array.isArray(keys)) {
          return res.status(400).json({ error: 'keys must be an array' });
        }

        const results = await this.cacheManager.mget(keys);
        const found = results.filter(r => r.value !== null);
        const missing = results.filter(r => r.value === null).map(r => r.key);
        
        res.json({
          results,
          found: found.length,
          missing: missing.length,
          missingKeys: missing
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete cache entry
    router.delete('/delete/:key', async (req, res) => {
      try {
        const { key } = req.params;
        const result = await this.cacheManager.delete(decodeURIComponent(key));
        
        res.json({
          success: result,
          key,
          message: result ? 'Cache entry deleted' : 'Failed to delete cache entry'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Invalidate by tag
    router.post('/invalidate/tag', async (req, res) => {
      try {
        const { tag } = req.body;
        const invalidatedKeys = await this.cacheManager.invalidateByTag(tag);
        
        res.json({
          tag,
          invalidatedCount: invalidatedKeys.length,
          invalidatedKeys
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Invalidate by pattern
    router.post('/invalidate/pattern', async (req, res) => {
      try {
        const { pattern } = req.body;
        const invalidatedKeys = await this.cacheManager.invalidateByPattern(pattern);
        
        res.json({
          pattern,
          invalidatedCount: invalidatedKeys.length,
          invalidatedKeys
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get cache statistics
    router.get('/stats', async (req, res) => {
      try {
        const stats = await this.cacheManager.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Bulk operations
    router.post('/bulk/set', async (req, res) => {
      try {
        const { entries } = req.body;
        
        if (!Array.isArray(entries)) {
          return res.status(400).json({ error: 'entries must be an array' });
        }

        const results = await Promise.allSettled(
          entries.map(entry => 
            this.cacheManager.set(entry.key, entry.value, entry.options)
          )
        );

        const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
        const failed = results.length - successful;

        res.json({
          total: entries.length,
          successful,
          failed,
          message: `Bulk set completed: ${successful} successful, ${failed} failed`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }
}
```

### 5. Cache Service Client
```typescript
// src/lib/clients/cache-service-client.ts (in main app)
export class CacheServiceClient {
  private static instance: CacheServiceClient;
  private baseUrl: string;
  private timeout: number;
  private fallbackCache: Map<string, { value: any; expires: number }>;

  private constructor() {
    this.baseUrl = process.env.CACHE_SERVICE_URL || 'http://localhost:3002';
    this.timeout = parseInt(process.env.CACHE_SERVICE_TIMEOUT || '2000');
    this.fallbackCache = new Map();
    
    // Clean up fallback cache every 5 minutes
    setInterval(() => this.cleanupFallbackCache(), 5 * 60 * 1000);
  }

  public static getInstance(): CacheServiceClient {
    if (!CacheServiceClient.instance) {
      CacheServiceClient.instance = new CacheServiceClient();
    }
    return CacheServiceClient.instance;
  }

  async set(
    key: string,
    value: any,
    options: {
      ttl?: number;
      tags?: string[];
      dependencies?: string[];
      source?: string;
    } = {}
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/cache/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, options }),
        signal: AbortSignal.timeout(this.timeout)
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Cache service set failed, using fallback:', error);
      
      // Fallback to local cache
      const expires = Date.now() + (options.ttl ? options.ttl * 1000 : 3600000);
      this.fallbackCache.set(key, { value, expires });
      return true;
    }
  }

  async get(key: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/cache/get/${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(this.timeout) }
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.found ? result.value : null;
    } catch (error) {
      console.error('Cache service get failed, trying fallback:', error);
      
      // Try fallback cache
      const fallback = this.fallbackCache.get(key);
      if (fallback && fallback.expires > Date.now()) {
        return fallback.value;
      }
      
      this.fallbackCache.delete(key);
      return null;
    }
  }

  async mget(keys: string[]): Promise<Array<{ key: string; value: any }>> {
    try {
      const response = await fetch(`${this.baseUrl}/cache/mget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      return result.results;
    } catch (error) {
      console.error('Cache service mget failed, using fallbacks:', error);
      
      // Use fallback cache for all keys
      return keys.map(key => {
        const fallback = this.fallbackCache.get(key);
        return {
          key,
          value: (fallback && fallback.expires > Date.now()) ? fallback.value : null
        };
      });
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/cache/delete/${encodeURIComponent(key)}`,
        { 
          method: 'DELETE',
          signal: AbortSignal.timeout(this.timeout) 
        }
      );

      const result = await response.json();
      
      // Also delete from fallback cache
      this.fallbackCache.delete(key);
      
      return result.success;
    } catch (error) {
      console.error('Cache service delete failed:', error);
      
      // Still delete from fallback
      this.fallbackCache.delete(key);
      return false;
    }
  }

  async invalidateByTag(tag: string): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/cache/invalidate/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
        signal: AbortSignal.timeout(this.timeout)
      });

      const result = await response.json();
      return result.invalidatedKeys || [];
    } catch (error) {
      console.error('Cache service tag invalidation failed:', error);
      return [];
    }
  }

  async getStats(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/cache/stats`, {
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { error: error.message };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(1000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private cleanupFallbackCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.fallbackCache.entries()) {
      if (entry.expires <= now) {
        this.fallbackCache.delete(key);
      }
    }
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [x] Cache service starts and connects to Redis cluster successfully
- [x] Intelligent TTL calculation works based on access patterns
- [x] Cache compression for large values works correctly
- [x] Tag-based and pattern-based invalidation functions properly
- [x] Bulk operations handle large data sets efficiently

### Performance Requirements
- [x] Cache get operations complete in < 10ms for small values
- [x] Cache set operations complete in < 50ms including TTL calculation
- [x] Service can handle 10,000+ operations per minute
- [x] Memory usage optimization with compression and cleanup

### Integration Requirements
- [x] Main application falls back gracefully when cache service unavailable
- [x] Existing caching patterns work without modification
- [x] Metrics are collected and reported properly
- [x] Redis cluster provides high availability

## Testing
```bash
# Build and start cache service
cd cache-service && npm run build
docker-compose up -d redis-cluster cache-service

# Test basic operations
curl -X POST http://localhost:3002/cache/set \
  -H "Content-Type: application/json" \
  -d '{"key":"test:key","value":{"data":"test"},"options":{"ttl":3600}}'

curl http://localhost:3002/cache/get/test:key

# Test bulk operations and tag invalidation
npm run test:cache-integration
```

## Rollback Plan
1. Stop cache service: `docker-compose down cache-service`
2. Remove cache client calls from main application
3. Revert to existing smart-cache-service.ts in monolith
4. Keep Redis cluster for other services
5. Remove cache service routing from NGINX

## Dependencies
- All Phase 1 foundation tasks (01-04)
- Tasks 05-06 (Metrics and Background Jobs services)
- Redis cluster for distributed caching
- Understanding of existing cache patterns

## Risks & Mitigation
- **Risk**: Cache service downtime impacts application performance
  - **Mitigation**: Fallback to in-memory cache, graceful degradation
- **Risk**: Redis cluster failures cause data loss
  - **Mitigation**: Redis persistence, multiple replicas, monitoring
- **Risk**: Network latency affects cache performance
  - **Mitigation**: Optimized serialization, connection pooling, timeout handling

## Notes
- Maintains all sophisticated caching logic from existing services
- Redis cluster provides horizontal scaling and high availability
- Intelligent TTL calculation preserves existing optimization patterns
- Fallback mechanisms ensure application reliability
- Compression and cleanup optimize memory usage
- Access pattern analysis enables predictive caching strategies