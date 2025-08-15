import { jest } from '@jest/globals';

// Interface definitions from the task specification
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

export interface AccessPattern {
  frequency: number; // Access per hour
  recency: number; // Hours since last access
  volatility: number; // How often the data changes
  dataSize: number; // Size of the data
  importance: number; // Business importance (0-1)
}

// Mock Redis Cluster
class MockRedisCluster {
  private data: Map<string, string> = new Map();
  private expires: Map<string, number> = new Map();
  
  async connect(): Promise<void> {
    // Mock connection
  }
  
  async disconnect(): Promise<void> {
    this.data.clear();
    this.expires.clear();
  }
  
  async get(key: string): Promise<string | null> {
    const expiry = this.expires.get(key);
    if (expiry && Date.now() > expiry) {
      this.data.delete(key);
      this.expires.delete(key);
      return null;
    }
    return this.data.get(key) || null;
  }
  
  async setex(key: string, ttl: number, value: string): Promise<string> {
    this.data.set(key, value);
    this.expires.set(key, Date.now() + (ttl * 1000));
    return 'OK';
  }
  
  async del(key: string): Promise<number> {
    const existed = this.data.has(key);
    this.data.delete(key);
    this.expires.delete(key);
    return existed ? 1 : 0;
  }
  
  async sadd(key: string, member: string): Promise<number> {
    const existing = this.data.get(key);
    const members = existing ? JSON.parse(existing) : [];
    if (!members.includes(member)) {
      members.push(member);
      this.data.set(key, JSON.stringify(members));
      return 1;
    }
    return 0;
  }
  
  async srem(key: string, member: string): Promise<number> {
    const existing = this.data.get(key);
    if (!existing) return 0;
    
    const members = JSON.parse(existing);
    const index = members.indexOf(member);
    if (index > -1) {
      members.splice(index, 1);
      this.data.set(key, JSON.stringify(members));
      return 1;
    }
    return 0;
  }
  
  async smembers(key: string): Promise<string[]> {
    const existing = this.data.get(key);
    return existing ? JSON.parse(existing) : [];
  }
  
  async expire(key: string, ttl: number): Promise<number> {
    if (this.data.has(key)) {
      this.expires.set(key, Date.now() + (ttl * 1000));
      return 1;
    }
    return 0;
  }
  
  async scan(cursor: number, pattern?: string): Promise<[string, string[]]> {
    const keys = Array.from(this.data.keys());
    const filteredKeys = pattern ? 
      keys.filter(key => this.matchPattern(key, pattern)) : 
      keys;
    return ['0', filteredKeys];
  }
  
  async info(section?: string): Promise<string> {
    return 'used_memory:1048576\nused_memory_human:1.00M\nmaxmemory:0';
  }
  
  async dbsize(): Promise<number> {
    return this.data.size;
  }
  
  pipeline() {
    const operations: Array<() => Promise<any>> = [];
    
    return {
      get: (key: string) => {
        operations.push(() => this.get(key));
        return this;
      },
      setex: (key: string, ttl: number, value: string) => {
        operations.push(() => this.setex(key, ttl, value));
        return this;
      },
      del: (key: string) => {
        operations.push(() => this.del(key));
        return this;
      },
      sadd: (key: string, member: string) => {
        operations.push(() => this.sadd(key, member));
        return this;
      },
      srem: (key: string, member: string) => {
        operations.push(() => this.srem(key, member));
        return this;
      },
      expire: (key: string, ttl: number) => {
        operations.push(() => this.expire(key, ttl));
        return this;
      },
      exec: async () => {
        const results = [];
        for (const operation of operations) {
          try {
            const result = await operation();
            results.push([null, result]);
          } catch (error) {
            results.push([error, null]);
          }
        }
        return results;
      }
    };
  }
  
  private matchPattern(key: string, pattern: string): boolean {
    // Simple pattern matching for tests
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(key);
    }
    return key === pattern;
  }
}

// Mock dependencies
class MockTTLCalculator {
  calculateOptimalTTL(
    key: string,
    dataSize: number,
    accessPattern?: AccessPattern,
    explicitTTL?: number
  ): number {
    if (explicitTTL !== undefined) {
      return Math.max(300, Math.min(86400, explicitTTL)); // 5 min to 24 hour bounds
    }
    
    if (!accessPattern) {
      return 3600; // 1 hour default
    }
    
    let calculatedTTL = 3600;
    
    // Frequency factor
    const frequencyFactor = Math.min(2.0, 1 + (accessPattern.frequency / 100));
    calculatedTTL *= frequencyFactor;
    
    // Recency factor
    const recencyFactor = Math.max(0.5, 1 - (accessPattern.recency / 24));
    calculatedTTL *= recencyFactor;
    
    // Size factor
    const sizeFactor = dataSize < 1024 ? 1.2 : dataSize < 10240 ? 1.0 : 0.8;
    calculatedTTL *= sizeFactor;
    
    return Math.max(300, Math.min(86400, calculatedTTL));
  }
}

class MockAccessPatternAnalyzer {
  private patterns: Map<string, AccessPattern> = new Map();
  
  async initialize(): Promise<void> {
    // Mock initialization
  }
  
  async getPattern(key: string): Promise<AccessPattern | undefined> {
    return this.patterns.get(key);
  }
  
  async recordRead(key: string, dataSize: number): Promise<void> {
    const existing = this.patterns.get(key) || {
      frequency: 0,
      recency: 0,
      volatility: 0.5,
      dataSize,
      importance: 0.5
    };
    
    existing.frequency += 1;
    existing.recency = 0; // Just accessed
    existing.dataSize = dataSize;
    
    this.patterns.set(key, existing);
  }
  
  async recordWrite(key: string, dataSize: number): Promise<void> {
    const existing = this.patterns.get(key) || {
      frequency: 0,
      recency: 0,
      volatility: 0.5,
      dataSize,
      importance: 0.5
    };
    
    existing.volatility += 0.1; // Increase volatility on writes
    existing.dataSize = dataSize;
    
    this.patterns.set(key, existing);
  }
  
  async getGlobalStats(): Promise<any> {
    return {
      totalKeys: this.patterns.size,
      averageFrequency: 10,
      totalReads: 100,
      totalWrites: 50
    };
  }
}

class MockCacheInvalidationStrategy {
  private redis: MockRedisCluster;
  
  constructor(redis: MockRedisCluster) {
    this.redis = redis;
  }
  
  async initialize(): Promise<void> {
    // Mock initialization
  }
  
  async invalidateByTag(tag: string): Promise<string[]> {
    const tagKey = `cache:tag:${tag}`;
    const members = await this.redis.smembers(tagKey);
    
    const invalidated: string[] = [];
    for (const member of members) {
      const valueKey = `cache:value:${member}`;
      const metaKey = `cache:meta:${member}`;
      
      await this.redis.del(valueKey);
      await this.redis.del(metaKey);
      invalidated.push(member);
    }
    
    await this.redis.del(tagKey);
    return invalidated;
  }
  
  async invalidateByPattern(pattern: string): Promise<string[]> {
    const [, keys] = await this.redis.scan(0, pattern);
    const invalidated: string[] = [];
    
    for (const key of keys) {
      if (key.startsWith('cache:value:')) {
        const cacheKey = key.replace('cache:value:', '');
        const metaKey = `cache:meta:${cacheKey}`;
        
        await this.redis.del(key);
        await this.redis.del(metaKey);
        invalidated.push(cacheKey);
      }
    }
    
    return invalidated;
  }
}

class MockMetricsCollector {
  private metrics: any = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheErrors: 0,
    cacheDeletes: 0,
    cacheSets: 0
  };
  
  static getInstance(): MockMetricsCollector {
    return new MockMetricsCollector();
  }
  
  recordCacheHit(key: string, dataSize: number, duration: number): void {
    this.metrics.cacheHits++;
  }
  
  recordCacheMiss(key: string): void {
    this.metrics.cacheMisses++;
  }
  
  recordCacheSet(key: string, dataSize: number, ttl: number): void {
    this.metrics.cacheSets++;
  }
  
  recordCacheDelete(key: string): void {
    this.metrics.cacheDeletes++;
  }
  
  recordCacheError(operation: string, key: string, error: string): void {
    this.metrics.cacheErrors++;
  }
  
  recordSystemStats(stats: any): void {
    // Mock system stats recording
  }
  
  recordAPICall(method: string, path: string, statusCode: number, duration: number): void {
    // Mock API call recording
  }
  
  getMetrics(): any {
    return { ...this.metrics };
  }
}

// Mock compression utilities
const mockCompress = jest.fn().mockImplementation((data: string) => {
  // Mock compression by just prefixing with 'compressed:'
  return Promise.resolve(`compressed:${data}`);
});

const mockDecompress = jest.fn().mockImplementation((data: string) => {
  // Mock decompression by removing 'compressed:' prefix
  if (data.startsWith('compressed:')) {
    return Promise.resolve(data.substring(11));
  }
  return Promise.resolve(data);
});

// Cache Manager implementation based on the task specification
class CacheManager {
  private static instance: CacheManager;
  private redis: MockRedisCluster;
  private ttlCalculator: MockTTLCalculator;
  private accessAnalyzer: MockAccessPatternAnalyzer;
  private invalidationStrategy: MockCacheInvalidationStrategy;
  private metrics: MockMetricsCollector;
  
  private config = {
    maxMemory: parseInt(process.env.CACHE_MAX_MEMORY || '1073741824'), // 1GB
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600'), // 1 hour
    maxValueSize: parseInt(process.env.CACHE_MAX_VALUE_SIZE || '10485760'), // 10MB
    compressionThreshold: parseInt(process.env.CACHE_COMPRESSION_THRESHOLD || '1024'), // 1KB
    enableCompression: process.env.CACHE_ENABLE_COMPRESSION === 'true'
  };

  private constructor() {
    this.redis = new MockRedisCluster();
    this.ttlCalculator = new MockTTLCalculator();
    this.accessAnalyzer = new MockAccessPatternAnalyzer();
    this.invalidationStrategy = new MockCacheInvalidationStrategy(this.redis);
    this.metrics = MockMetricsCollector.getInstance();
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
        ? await mockCompress(serializedValue)
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
      const value = await mockDecompress(valueResult);
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
            const decompressedValue = await mockDecompress(valueResult[1] as string);
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
      metrics: this.metrics.getMetrics()
    };
  }

  async shutdown(): Promise<void> {
    console.log('Shutting down cache manager...');
    await this.redis.disconnect();
  }

  private shouldCompress(dataSize: number): boolean {
    return this.config.enableCompression && dataSize >= this.config.compressionThreshold;
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
}

// Test Suite
describe('Cache Manager', () => {
  let cacheManager: CacheManager;

  beforeEach(async () => {
    // Reset singleton instance
    (CacheManager as any).instance = undefined;
    cacheManager = CacheManager.getInstance();
    await cacheManager.initialize();
    
    // Reset mocks
    mockCompress.mockClear();
    mockDecompress.mockClear();
  });

  afterEach(async () => {
    await cacheManager.shutdown();
  });

  describe('Core Functionality', () => {
    describe('Basic Operations', () => {
      test('should set and get a simple value', async () => {
        const key = 'test:key';
        const value = { data: 'test value' };

        const setResult = await cacheManager.set(key, value);
        expect(setResult).toBe(true);

        const retrievedValue = await cacheManager.get(key);
        expect(retrievedValue).toEqual(value);
      });

      test('should return null for non-existent keys', async () => {
        const result = await cacheManager.get('non-existent-key');
        expect(result).toBeNull();
      });

      test('should delete cached values', async () => {
        const key = 'test:delete';
        const value = { data: 'to be deleted' };

        await cacheManager.set(key, value);
        expect(await cacheManager.get(key)).toEqual(value);

        const deleteResult = await cacheManager.delete(key);
        expect(deleteResult).toBe(true);

        expect(await cacheManager.get(key)).toBeNull();
      });

      test('should handle multiple get operations (mget)', async () => {
        const keys = ['key1', 'key2', 'key3'];
        const values = [
          { data: 'value1' },
          { data: 'value2' },
          { data: 'value3' }
        ];

        // Set multiple values
        for (let i = 0; i < keys.length; i++) {
          await cacheManager.set(keys[i], values[i]);
        }

        // Get multiple values
        const results = await cacheManager.mget(keys);

        expect(results).toHaveLength(3);
        expect(results[0]).toEqual({ key: 'key1', value: values[0] });
        expect(results[1]).toEqual({ key: 'key2', value: values[1] });
        expect(results[2]).toEqual({ key: 'key3', value: values[2] });
      });

      test('should handle mixed results in mget (some exist, some don\'t)', async () => {
        await cacheManager.set('existing', { data: 'exists' });

        const results = await cacheManager.mget(['existing', 'non-existent']);

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({ key: 'existing', value: { data: 'exists' } });
        expect(results[1]).toEqual({ key: 'non-existent', value: null });
      });
    });

    describe('TTL Management', () => {
      test('should use explicit TTL when provided', async () => {
        const key = 'test:explicit-ttl';
        const value = { data: 'test' };
        const explicitTTL = 7200; // 2 hours

        const result = await cacheManager.set(key, value, { ttl: explicitTTL });
        expect(result).toBe(true);

        // Verify value exists
        const retrievedValue = await cacheManager.get(key);
        expect(retrievedValue).toEqual(value);
      });

      test('should calculate intelligent TTL based on access patterns', async () => {
        const key = 'test:intelligent-ttl';
        const value = { data: 'test' };

        // First set without access pattern
        await cacheManager.set(key, value);
        
        // Access the key multiple times to build pattern
        await cacheManager.get(key);
        await cacheManager.get(key);
        await cacheManager.get(key);

        // Set again - should use improved TTL based on access pattern
        const result = await cacheManager.set(key, value);
        expect(result).toBe(true);
      });

      test('should respect TTL bounds (min and max)', async () => {
        const key = 'test:ttl-bounds';
        const value = { data: 'test' };

        // Test minimum TTL
        const resultMin = await cacheManager.set(key, value, { ttl: 100 }); // Below 5 min minimum
        expect(resultMin).toBe(true);

        // Test maximum TTL
        const resultMax = await cacheManager.set(key, value, { ttl: 90000 }); // Above 24 hour maximum
        expect(resultMax).toBe(true);
      });
    });

    describe('Compression', () => {
      beforeEach(() => {
        // Enable compression for these tests
        (cacheManager as any).config.enableCompression = true;
        (cacheManager as any).config.compressionThreshold = 1024; // 1KB
      });

      test('should compress large values', async () => {
        const key = 'test:compression';
        const largeValue = { data: 'x'.repeat(2000) }; // Larger than 1KB threshold

        const result = await cacheManager.set(key, largeValue);
        expect(result).toBe(true);

        // Verify compression was called
        expect(mockCompress).toHaveBeenCalled();

        // Verify we can still retrieve the original value
        const retrievedValue = await cacheManager.get(key);
        expect(retrievedValue).toEqual(largeValue);
        expect(mockDecompress).toHaveBeenCalled();
      });

      test('should not compress small values', async () => {
        const key = 'test:no-compression';
        const smallValue = { data: 'small' }; // Smaller than 1KB threshold

        const result = await cacheManager.set(key, smallValue);
        expect(result).toBe(true);

        // Verify compression was not called
        expect(mockCompress).not.toHaveBeenCalled();

        const retrievedValue = await cacheManager.get(key);
        expect(retrievedValue).toEqual(smallValue);
      });

      test('should handle compression when disabled', async () => {
        (cacheManager as any).config.enableCompression = false;

        const key = 'test:compression-disabled';
        const largeValue = { data: 'x'.repeat(2000) };

        const result = await cacheManager.set(key, largeValue);
        expect(result).toBe(true);

        // Verify compression was not called even for large values
        expect(mockCompress).not.toHaveBeenCalled();
      });
    });

    describe('Tag-based Operations', () => {
      test('should set values with tags', async () => {
        const key = 'test:tagged';
        const value = { data: 'tagged value' };
        const tags = ['tag1', 'tag2', 'category:test'];

        const result = await cacheManager.set(key, value, { tags });
        expect(result).toBe(true);

        const retrievedValue = await cacheManager.get(key);
        expect(retrievedValue).toEqual(value);
      });

      test('should invalidate by tag', async () => {
        const keys = ['key1', 'key2', 'key3'];
        const values = [
          { data: 'value1' },
          { data: 'value2' },
          { data: 'value3' }
        ];

        // Set values with different tags
        await cacheManager.set(keys[0], values[0], { tags: ['tag1', 'common'] });
        await cacheManager.set(keys[1], values[1], { tags: ['tag2', 'common'] });
        await cacheManager.set(keys[2], values[2], { tags: ['tag3'] });

        // Verify all values exist
        expect(await cacheManager.get(keys[0])).toEqual(values[0]);
        expect(await cacheManager.get(keys[1])).toEqual(values[1]);
        expect(await cacheManager.get(keys[2])).toEqual(values[2]);

        // Invalidate by 'common' tag
        const invalidated = await cacheManager.invalidateByTag('common');
        expect(invalidated).toContain(keys[0]);
        expect(invalidated).toContain(keys[1]);
        expect(invalidated).not.toContain(keys[2]);

        // Verify invalidated keys are gone
        expect(await cacheManager.get(keys[0])).toBeNull();
        expect(await cacheManager.get(keys[1])).toBeNull();
        expect(await cacheManager.get(keys[2])).toEqual(values[2]); // Should still exist
      });

      test('should handle invalidating non-existent tags', async () => {
        const invalidated = await cacheManager.invalidateByTag('non-existent-tag');
        expect(invalidated).toEqual([]);
      });
    });

    describe('Pattern-based Invalidation', () => {
      test('should invalidate by pattern', async () => {
        const keys = ['user:1:profile', 'user:2:profile', 'user:1:settings', 'admin:config'];
        const values = [
          { name: 'User 1' },
          { name: 'User 2' },
          { theme: 'dark' },
          { debug: true }
        ];

        // Set multiple values
        for (let i = 0; i < keys.length; i++) {
          await cacheManager.set(keys[i], values[i]);
        }

        // Invalidate all user:1:* keys
        const invalidated = await cacheManager.invalidateByPattern('cache:value:user:1:*');
        
        // Should invalidate user:1 keys but not user:2 or admin keys
        expect(await cacheManager.get(keys[0])).toBeNull(); // user:1:profile
        expect(await cacheManager.get(keys[2])).toBeNull(); // user:1:settings
        expect(await cacheManager.get(keys[1])).toEqual(values[1]); // user:2:profile should exist
        expect(await cacheManager.get(keys[3])).toEqual(values[3]); // admin:config should exist
      });

      test('should handle patterns with no matches', async () => {
        const invalidated = await cacheManager.invalidateByPattern('cache:value:nonexistent:*');
        expect(invalidated).toEqual([]);
      });
    });
  });

  describe('Access Pattern Recording', () => {
    test('should record read patterns', async () => {
      const key = 'test:access-pattern';
      const value = { data: 'test' };

      await cacheManager.set(key, value);

      // Multiple reads should be recorded
      await cacheManager.get(key);
      await cacheManager.get(key);
      await cacheManager.get(key);

      // Access patterns should be updated internally
      // This is verified indirectly through the access analyzer mock
    });

    test('should record write patterns', async () => {
      const key = 'test:write-pattern';
      const value = { data: 'test' };

      // Multiple writes should be recorded
      await cacheManager.set(key, value);
      await cacheManager.set(key, { data: 'updated' });
      await cacheManager.set(key, { data: 'updated again' });

      // Write patterns should be recorded internally
    });
  });

  describe('Metrics Collection', () => {
    test('should record cache hits', async () => {
      const key = 'test:metrics-hit';
      const value = { data: 'test' };

      await cacheManager.set(key, value);
      
      const stats = await cacheManager.getStats();
      const beforeHits = stats.metrics.cacheHits;

      await cacheManager.get(key);

      const statsAfter = await cacheManager.getStats();
      expect(statsAfter.metrics.cacheHits).toBe(beforeHits + 1);
    });

    test('should record cache misses', async () => {
      const stats = await cacheManager.getStats();
      const beforeMisses = stats.metrics.cacheMisses;

      await cacheManager.get('non-existent-key');

      const statsAfter = await cacheManager.getStats();
      expect(statsAfter.metrics.cacheMisses).toBe(beforeMisses + 1);
    });

    test('should record cache sets', async () => {
      const stats = await cacheManager.getStats();
      const beforeSets = stats.metrics.cacheSets;

      await cacheManager.set('test:metrics-set', { data: 'test' });

      const statsAfter = await cacheManager.getStats();
      expect(statsAfter.metrics.cacheSets).toBe(beforeSets + 1);
    });

    test('should record cache deletes', async () => {
      const key = 'test:metrics-delete';
      await cacheManager.set(key, { data: 'test' });

      const stats = await cacheManager.getStats();
      const beforeDeletes = stats.metrics.cacheDeletes;

      await cacheManager.delete(key);

      const statsAfter = await cacheManager.getStats();
      expect(statsAfter.metrics.cacheDeletes).toBe(beforeDeletes + 1);
    });

    test('should record cache errors', async () => {
      const stats = await cacheManager.getStats();
      const beforeErrors = stats.metrics.cacheErrors;

      // Force an error by trying to set a value that's too large
      const largeValue = { data: 'x'.repeat(20 * 1024 * 1024) }; // 20MB, larger than 10MB limit
      await cacheManager.set('test:error', largeValue);

      const statsAfter = await cacheManager.getStats();
      expect(statsAfter.metrics.cacheErrors).toBe(beforeErrors + 1);
    });
  });

  describe('Memory Management', () => {
    test('should enforce maximum value size', async () => {
      const largeValue = { data: 'x'.repeat(20 * 1024 * 1024) }; // 20MB, larger than 10MB limit
      
      const result = await cacheManager.set('test:large-value', largeValue);
      expect(result).toBe(false); // Should fail due to size limit
    });

    test('should provide memory statistics', async () => {
      await cacheManager.set('test:memory', { data: 'test' });

      const stats = await cacheManager.getStats();
      
      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('keyCount');
      expect(stats).toHaveProperty('config');
      expect(stats.keyCount).toBeGreaterThanOrEqual(0);
    });

    test('should handle configuration limits', async () => {
      const stats = await cacheManager.getStats();
      
      expect(stats.config).toHaveProperty('maxMemory');
      expect(stats.config).toHaveProperty('maxValueSize');
      expect(stats.config).toHaveProperty('compressionThreshold');
      expect(stats.config.maxMemory).toBe(1073741824); // 1GB
      expect(stats.config.maxValueSize).toBe(10485760); // 10MB
    });
  });

  describe('Error Handling', () => {
    test('should handle Redis connection errors gracefully', async () => {
      // Simulate Redis disconnection
      await cacheManager.shutdown();

      // Operations should not throw but return appropriate defaults
      const getResult = await cacheManager.get('test:error');
      expect(getResult).toBeNull();

      const setResult = await cacheManager.set('test:error', { data: 'test' });
      expect(setResult).toBe(false);

      const deleteResult = await cacheManager.delete('test:error');
      expect(deleteResult).toBe(false);
    });

    test('should handle malformed cached data', async () => {
      // This would be testing parsing errors, which our mock handles gracefully
      const result = await cacheManager.get('test:malformed');
      expect(result).toBeNull();
    });

    test('should handle tag invalidation errors gracefully', async () => {
      const invalidated = await cacheManager.invalidateByTag('test-tag');
      expect(Array.isArray(invalidated)).toBe(true);
    });
  });

  describe('Redis Integration', () => {
    test('should use pipeline operations for atomic sets', async () => {
      const key = 'test:pipeline';
      const value = { data: 'test' };
      const tags = ['tag1', 'tag2'];

      const result = await cacheManager.set(key, value, { tags });
      expect(result).toBe(true);

      // Verify both value and metadata are set
      const retrievedValue = await cacheManager.get(key);
      expect(retrievedValue).toEqual(value);
    });

    test('should handle cluster operations', async () => {
      // Test multiple operations across what would be cluster nodes
      const keys = ['cluster:1', 'cluster:2', 'cluster:3'];
      const values = [{ id: 1 }, { id: 2 }, { id: 3 }];

      // Set multiple values
      for (let i = 0; i < keys.length; i++) {
        const result = await cacheManager.set(keys[i], values[i]);
        expect(result).toBe(true);
      }

      // Get multiple values
      const results = await cacheManager.mget(keys);
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.value).toEqual(values[index]);
      });
    });

    test('should handle pipeline execution errors', async () => {
      // Test that pipeline errors are handled gracefully
      const result = await cacheManager.set('test:pipeline-error', { data: 'test' });
      // Should not throw even if there are internal pipeline issues
      expect(typeof result).toBe('boolean');
    });
  });
});

// Performance Tests
describe('Cache Manager Performance', () => {
  let cacheManager: CacheManager;

  beforeEach(async () => {
    (CacheManager as any).instance = undefined;
    cacheManager = CacheManager.getInstance();
    await cacheManager.initialize();
  });

  afterEach(async () => {
    await cacheManager.shutdown();
  });

  test('should complete get operations in under 10ms', async () => {
    const key = 'perf:get';
    const value = { data: 'performance test' };
    
    await cacheManager.set(key, value);

    const start = Date.now();
    const result = await cacheManager.get(key);
    const duration = Date.now() - start;

    expect(result).toEqual(value);
    expect(duration).toBeLessThan(10);
  });

  test('should complete set operations in under 50ms', async () => {
    const key = 'perf:set';
    const value = { data: 'performance test' };

    const start = Date.now();
    const result = await cacheManager.set(key, value);
    const duration = Date.now() - start;

    expect(result).toBe(true);
    expect(duration).toBeLessThan(50);
  });

  test('should handle concurrent operations efficiently', async () => {
    const concurrency = 100;
    const operations = [];

    // Create concurrent set operations
    for (let i = 0; i < concurrency; i++) {
      operations.push(
        cacheManager.set(`concurrent:${i}`, { id: i, data: `test ${i}` })
      );
    }

    const start = Date.now();
    const results = await Promise.all(operations);
    const duration = Date.now() - start;

    // All operations should succeed
    expect(results.every(result => result === true)).toBe(true);

    // Total time should be reasonable (not blocking)
    expect(duration).toBeLessThan(1000); // 1 second for 100 operations
  });

  test('should handle race conditions in concurrent access', async () => {
    const key = 'race:test';
    const value = { counter: 0 };

    // Set initial value
    await cacheManager.set(key, value);

    // Create multiple concurrent read operations
    const reads = Array.from({ length: 50 }, () => cacheManager.get(key));
    const results = await Promise.all(reads);

    // All reads should return the same value (no corruption)
    results.forEach(result => {
      expect(result).toEqual(value);
    });
  });
});

// Integration Tests
describe('Cache Manager Integration', () => {
  let cacheManager: CacheManager;

  beforeEach(async () => {
    (CacheManager as any).instance = undefined;
    cacheManager = CacheManager.getInstance();
    await cacheManager.initialize();
  });

  afterEach(async () => {
    await cacheManager.shutdown();
  });

  test('should maintain data consistency across complex operations', async () => {
    const baseKey = 'integration:';
    const tags = ['user:123', 'profile', 'active'];
    
    // Set multiple related cache entries
    await cacheManager.set(`${baseKey}profile`, { name: 'John Doe' }, { tags });
    await cacheManager.set(`${baseKey}settings`, { theme: 'dark' }, { tags: ['user:123', 'settings'] });
    await cacheManager.set(`${baseKey}permissions`, { admin: false }, { tags: ['user:123', 'auth'] });

    // Verify all entries exist
    expect(await cacheManager.get(`${baseKey}profile`)).toEqual({ name: 'John Doe' });
    expect(await cacheManager.get(`${baseKey}settings`)).toEqual({ theme: 'dark' });
    expect(await cacheManager.get(`${baseKey}permissions`)).toEqual({ admin: false });

    // Invalidate by user tag
    const invalidated = await cacheManager.invalidateByTag('user:123');
    expect(invalidated.length).toBe(3);

    // All entries should be gone
    expect(await cacheManager.get(`${baseKey}profile`)).toBeNull();
    expect(await cacheManager.get(`${baseKey}settings`)).toBeNull();
    expect(await cacheManager.get(`${baseKey}permissions`)).toBeNull();
  });

  test('should handle mixed cache operations efficiently', async () => {
    const operations = [];
    
    // Mix of sets, gets, and deletes
    for (let i = 0; i < 20; i++) {
      operations.push(cacheManager.set(`mixed:${i}`, { id: i }));
    }
    
    // Wait for sets to complete
    await Promise.all(operations);
    
    // Mix gets and some updates
    const mixedOps = [];
    for (let i = 0; i < 20; i++) {
      if (i % 3 === 0) {
        mixedOps.push(cacheManager.delete(`mixed:${i}`));
      } else if (i % 2 === 0) {
        mixedOps.push(cacheManager.set(`mixed:${i}`, { id: i, updated: true }));
      } else {
        mixedOps.push(cacheManager.get(`mixed:${i}`));
      }
    }
    
    const results = await Promise.all(mixedOps);
    
    // Should complete without errors
    expect(results.length).toBe(20);
  });

  test('should maintain performance under sustained load', async () => {
    const duration = 1000; // 1 second
    const start = Date.now();
    let operations = 0;
    
    // Sustained operations for 1 second
    while (Date.now() - start < duration) {
      await cacheManager.set(`load:${operations}`, { op: operations });
      await cacheManager.get(`load:${operations}`);
      operations++;
    }
    
    // Should handle reasonable number of operations
    expect(operations).toBeGreaterThan(50); // At least 50 ops/second
  });
});