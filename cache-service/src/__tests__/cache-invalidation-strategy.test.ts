import { jest } from '@jest/globals';

// Mock Redis for testing invalidation strategies
class MockRedisCluster {
  private data: Map<string, string> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  
  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }
  
  async sadd(key: string, member: string): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    const hadMember = set.has(member);
    set.add(member);
    return hadMember ? 0 : 1;
  }
  
  async srem(key: string, member: string): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    
    const hadMember = set.has(member);
    set.delete(member);
    return hadMember ? 1 : 0;
  }
  
  async del(key: string): Promise<number> {
    const hadData = this.data.has(key);
    const hadSet = this.sets.has(key);
    
    this.data.delete(key);
    this.sets.delete(key);
    
    return (hadData || hadSet) ? 1 : 0;
  }
  
  async scan(cursor: number, pattern?: string, count?: number): Promise<[string, string[]]> {
    const allKeys = Array.from(this.data.keys());
    let filteredKeys = allKeys;
    
    if (pattern) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
      filteredKeys = allKeys.filter(key => regex.test(key));
    }
    
    // Simple pagination simulation
    const limit = count || 10;
    const start = cursor;
    const end = start + limit;
    const keys = filteredKeys.slice(start, end);
    const nextCursor = end >= filteredKeys.length ? '0' : end.toString();
    
    return [nextCursor, keys];
  }
  
  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }
  
  async set(key: string, value: string): Promise<string> {
    this.data.set(key, value);
    return 'OK';
  }
  
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return Array.from(this.data.keys()).filter(key => regex.test(key));
  }
  
  pipeline() {
    const operations: Array<() => Promise<any>> = [];
    
    return {
      del: (key: string) => {
        operations.push(() => this.del(key));
        return this;
      },
      srem: (key: string, member: string) => {
        operations.push(() => this.srem(key, member));
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
  
  // Test helpers
  setData(key: string, value: string): void {
    this.data.set(key, value);
  }
  
  addToSet(key: string, member: string): void {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    this.sets.get(key)!.add(member);
  }
  
  clear(): void {
    this.data.clear();
    this.sets.clear();
  }
}

// Mock metrics collector
class MockMetricsCollector {
  private metrics = {
    invalidationsByTag: 0,
    invalidationsByPattern: 0,
    keysInvalidated: 0,
    invalidationDuration: []
  };
  
  recordTagInvalidation(tag: string, count: number, duration: number): void {
    this.metrics.invalidationsByTag++;
    this.metrics.keysInvalidated += count;
    this.metrics.invalidationDuration.push(duration);
  }
  
  recordPatternInvalidation(pattern: string, count: number, duration: number): void {
    this.metrics.invalidationsByPattern++;
    this.metrics.keysInvalidated += count;
    this.metrics.invalidationDuration.push(duration);
  }
  
  getMetrics() {
    return { ...this.metrics };
  }
  
  reset(): void {
    this.metrics = {
      invalidationsByTag: 0,
      invalidationsByPattern: 0,
      keysInvalidated: 0,
      invalidationDuration: []
    };
  }
}

export class CacheInvalidationStrategy {
  private redis: MockRedisCluster;
  private metrics: MockMetricsCollector;

  constructor(redis?: MockRedisCluster, metrics?: MockMetricsCollector) {
    this.redis = redis || new MockRedisCluster();
    this.metrics = metrics || new MockMetricsCollector();
  }

  async initialize(): Promise<void> {
    // Initialize invalidation strategy
    console.log('Cache invalidation strategy initialized');
  }

  async invalidateByTag(tag: string): Promise<string[]> {
    const start = Date.now();
    const tagKey = `cache:tag:${tag}`;
    
    try {
      // Get all keys associated with this tag
      const members = await this.redis.smembers(tagKey);
      const invalidatedKeys: string[] = [];

      if (members.length === 0) {
        return invalidatedKeys;
      }

      // Use pipeline for efficient bulk operations
      const pipeline = this.redis.pipeline();

      for (const member of members) {
        const valueKey = `cache:value:${member}`;
        const metaKey = `cache:meta:${member}`;
        
        // Delete value and metadata
        pipeline.del(valueKey);
        pipeline.del(metaKey);
        
        // Remove from tag set
        pipeline.srem(tagKey, member);
        
        invalidatedKeys.push(member);
      }

      // Execute all operations
      await pipeline.exec();

      // Clean up empty tag set
      const remainingMembers = await this.redis.smembers(tagKey);
      if (remainingMembers.length === 0) {
        await this.redis.del(tagKey);
      }

      const duration = Date.now() - start;
      this.metrics.recordTagInvalidation(tag, invalidatedKeys.length, duration);

      return invalidatedKeys;
    } catch (error) {
      console.error(`Tag invalidation failed for tag ${tag}:`, error);
      return [];
    }
  }

  async invalidateByPattern(pattern: string): Promise<string[]> {
    const start = Date.now();
    const invalidatedKeys: string[] = [];
    
    try {
      let cursor = '0';
      
      do {
        // Scan for keys matching the pattern
        const [nextCursor, keys] = await this.redis.scan(
          parseInt(cursor),
          pattern,
          100 // Batch size
        );
        
        cursor = nextCursor;
        
        if (keys.length === 0) {
          continue;
        }

        const pipeline = this.redis.pipeline();
        
        for (const key of keys) {
          // Check if this is a cache value key
          if (key.startsWith('cache:value:')) {
            const cacheKey = key.replace('cache:value:', '');
            const metaKey = `cache:meta:${cacheKey}`;
            
            // Delete value and metadata
            pipeline.del(key);
            pipeline.del(metaKey);
            
            invalidatedKeys.push(cacheKey);
          } else if (key.startsWith('cache:meta:')) {
            // Handle metadata keys that might be matched separately
            const cacheKey = key.replace('cache:meta:', '');
            const valueKey = `cache:value:${cacheKey}`;
            
            pipeline.del(valueKey);
            pipeline.del(key);
            
            if (!invalidatedKeys.includes(cacheKey)) {
              invalidatedKeys.push(cacheKey);
            }
          } else {
            // Direct key deletion for other patterns
            pipeline.del(key);
            invalidatedKeys.push(key);
          }
        }
        
        await pipeline.exec();
        
      } while (cursor !== '0');

      // Clean up tag references for invalidated keys
      await this.cleanupTagReferences(invalidatedKeys);

      const duration = Date.now() - start;
      this.metrics.recordPatternInvalidation(pattern, invalidatedKeys.length, duration);

      return invalidatedKeys;
    } catch (error) {
      console.error(`Pattern invalidation failed for pattern ${pattern}:`, error);
      return [];
    }
  }

  async invalidateByDependency(dependency: string): Promise<string[]> {
    // Find all cache entries that depend on the given dependency
    const dependentKeys = await this.findDependentKeys(dependency);
    const invalidatedKeys: string[] = [];

    for (const key of dependentKeys) {
      const success = await this.invalidateSingleKey(key);
      if (success) {
        invalidatedKeys.push(key);
      }
    }

    return invalidatedKeys;
  }

  async invalidateByTTL(maxAge: number): Promise<string[]> {
    const cutoffTime = Date.now() - maxAge;
    const invalidatedKeys: string[] = [];
    
    // Scan all metadata keys to find expired entries
    let cursor = '0';
    
    do {
      const [nextCursor, keys] = await this.redis.scan(
        parseInt(cursor),
        'cache:meta:*',
        100
      );
      
      cursor = nextCursor;
      
      for (const metaKey of keys) {
        const metadata = await this.redis.get(metaKey);
        if (!metadata) continue;
        
        try {
          const meta = JSON.parse(metadata);
          const createdAt = new Date(meta.createdAt).getTime();
          
          if (createdAt < cutoffTime) {
            const cacheKey = metaKey.replace('cache:meta:', '');
            const success = await this.invalidateSingleKey(cacheKey);
            if (success) {
              invalidatedKeys.push(cacheKey);
            }
          }
        } catch (error) {
          console.error(`Failed to parse metadata for ${metaKey}:`, error);
        }
      }
      
    } while (cursor !== '0');

    return invalidatedKeys;
  }

  async invalidateSelective(selector: {
    tags?: string[];
    patterns?: string[];
    dependencies?: string[];
    maxAge?: number;
    minAccessCount?: number;
    maxAccessCount?: number;
  }): Promise<{
    invalidatedKeys: string[];
    summary: {
      byTags: number;
      byPatterns: number;
      byDependencies: number;
      byAge: number;
      byAccessCount: number;
    };
  }> {
    const allInvalidatedKeys = new Set<string>();
    const summary = {
      byTags: 0,
      byPatterns: 0,
      byDependencies: 0,
      byAge: 0,
      byAccessCount: 0
    };

    // Invalidate by tags
    if (selector.tags) {
      for (const tag of selector.tags) {
        const keys = await this.invalidateByTag(tag);
        keys.forEach(key => allInvalidatedKeys.add(key));
        summary.byTags += keys.length;
      }
    }

    // Invalidate by patterns
    if (selector.patterns) {
      for (const pattern of selector.patterns) {
        const keys = await this.invalidateByPattern(pattern);
        keys.forEach(key => allInvalidatedKeys.add(key));
        summary.byPatterns += keys.length;
      }
    }

    // Invalidate by dependencies
    if (selector.dependencies) {
      for (const dependency of selector.dependencies) {
        const keys = await this.invalidateByDependency(dependency);
        keys.forEach(key => allInvalidatedKeys.add(key));
        summary.byDependencies += keys.length;
      }
    }

    // Invalidate by age
    if (selector.maxAge) {
      const keys = await this.invalidateByTTL(selector.maxAge);
      keys.forEach(key => allInvalidatedKeys.add(key));
      summary.byAge += keys.length;
    }

    // Invalidate by access count
    if (selector.minAccessCount !== undefined || selector.maxAccessCount !== undefined) {
      const keys = await this.invalidateByAccessCount(
        selector.minAccessCount,
        selector.maxAccessCount
      );
      keys.forEach(key => allInvalidatedKeys.add(key));
      summary.byAccessCount += keys.length;
    }

    return {
      invalidatedKeys: Array.from(allInvalidatedKeys),
      summary
    };
  }

  async scheduleInvalidation(
    delay: number,
    operation: () => Promise<string[]>
  ): Promise<string> {
    const taskId = `invalidation_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    // In a real implementation, this would use a job queue
    setTimeout(async () => {
      try {
        await operation();
        console.log(`Scheduled invalidation ${taskId} completed`);
      } catch (error) {
        console.error(`Scheduled invalidation ${taskId} failed:`, error);
      }
    }, delay);
    
    return taskId;
  }

  async getInvalidationStats(): Promise<{
    totalInvalidations: number;
    tagInvalidations: number;
    patternInvalidations: number;
    keysInvalidated: number;
    averageDuration: number;
  }> {
    const metrics = this.metrics.getMetrics();
    const totalInvalidations = metrics.invalidationsByTag + metrics.invalidationsByPattern;
    const averageDuration = metrics.invalidationDuration.length > 0
      ? metrics.invalidationDuration.reduce((sum, d) => sum + d, 0) / metrics.invalidationDuration.length
      : 0;

    return {
      totalInvalidations,
      tagInvalidations: metrics.invalidationsByTag,
      patternInvalidations: metrics.invalidationsByPattern,
      keysInvalidated: metrics.keysInvalidated,
      averageDuration
    };
  }

  private async findDependentKeys(dependency: string): Promise<string[]> {
    const dependentKeys: string[] = [];
    let cursor = '0';
    
    do {
      const [nextCursor, keys] = await this.redis.scan(
        parseInt(cursor),
        'cache:meta:*',
        100
      );
      
      cursor = nextCursor;
      
      for (const metaKey of keys) {
        const metadata = await this.redis.get(metaKey);
        if (!metadata) continue;
        
        try {
          const meta = JSON.parse(metadata);
          if (meta.metadata?.dependencies?.includes(dependency)) {
            const cacheKey = metaKey.replace('cache:meta:', '');
            dependentKeys.push(cacheKey);
          }
        } catch (error) {
          console.error(`Failed to parse metadata for ${metaKey}:`, error);
        }
      }
      
    } while (cursor !== '0');

    return dependentKeys;
  }

  private async invalidateSingleKey(key: string): Promise<boolean> {
    try {
      const valueKey = `cache:value:${key}`;
      const metaKey = `cache:meta:${key}`;
      
      // Get metadata to clean up tags
      const metadata = await this.redis.get(metaKey);
      if (metadata) {
        try {
          const meta = JSON.parse(metadata);
          if (meta.tags) {
            for (const tag of meta.tags) {
              await this.redis.srem(`cache:tag:${tag}`, key);
            }
          }
        } catch (error) {
          console.error(`Failed to clean up tags for ${key}:`, error);
        }
      }
      
      // Delete value and metadata
      await this.redis.del(valueKey);
      await this.redis.del(metaKey);
      
      return true;
    } catch (error) {
      console.error(`Failed to invalidate key ${key}:`, error);
      return false;
    }
  }

  private async cleanupTagReferences(invalidatedKeys: string[]): Promise<void> {
    // For each invalidated key, remove it from all tag sets
    for (const key of invalidatedKeys) {
      // In a real implementation, we would need to track which tags
      // each key belongs to, or scan all tag sets
      // For this mock, we'll skip the cleanup
    }
  }

  private async invalidateByAccessCount(
    minCount?: number,
    maxCount?: number
  ): Promise<string[]> {
    const invalidatedKeys: string[] = [];
    let cursor = '0';
    
    do {
      const [nextCursor, keys] = await this.redis.scan(
        parseInt(cursor),
        'cache:meta:*',
        100
      );
      
      cursor = nextCursor;
      
      for (const metaKey of keys) {
        const metadata = await this.redis.get(metaKey);
        if (!metadata) continue;
        
        try {
          const meta = JSON.parse(metadata);
          const accessCount = meta.accessCount || 0;
          
          let shouldInvalidate = false;
          
          if (minCount !== undefined && accessCount < minCount) {
            shouldInvalidate = true;
          }
          
          if (maxCount !== undefined && accessCount > maxCount) {
            shouldInvalidate = true;
          }
          
          if (shouldInvalidate) {
            const cacheKey = metaKey.replace('cache:meta:', '');
            const success = await this.invalidateSingleKey(cacheKey);
            if (success) {
              invalidatedKeys.push(cacheKey);
            }
          }
        } catch (error) {
          console.error(`Failed to parse metadata for ${metaKey}:`, error);
        }
      }
      
    } while (cursor !== '0');

    return invalidatedKeys;
  }
}

describe('Cache Invalidation Strategy', () => {
  let strategy: CacheInvalidationStrategy;
  let mockRedis: MockRedisCluster;
  let mockMetrics: MockMetricsCollector;

  beforeEach(async () => {
    mockRedis = new MockRedisCluster();
    mockMetrics = new MockMetricsCollector();
    strategy = new CacheInvalidationStrategy(mockRedis, mockMetrics);
    await strategy.initialize();
  });

  afterEach(() => {
    mockRedis.clear();
    mockMetrics.reset();
  });

  describe('Tag-based Invalidation', () => {
    test('should invalidate all keys associated with a tag', async () => {
      // Set up test data
      const tag = 'user:123';
      const tagKey = `cache:tag:${tag}`;
      
      // Add keys to tag set
      await mockRedis.sadd(tagKey, 'profile');
      await mockRedis.sadd(tagKey, 'settings');
      await mockRedis.sadd(tagKey, 'preferences');
      
      // Set up cache values and metadata
      mockRedis.setData('cache:value:profile', JSON.stringify({ name: 'John' }));
      mockRedis.setData('cache:meta:profile', JSON.stringify({ tags: [tag] }));
      mockRedis.setData('cache:value:settings', JSON.stringify({ theme: 'dark' }));
      mockRedis.setData('cache:meta:settings', JSON.stringify({ tags: [tag] }));
      mockRedis.setData('cache:value:preferences', JSON.stringify({ lang: 'en' }));
      mockRedis.setData('cache:meta:preferences', JSON.stringify({ tags: [tag] }));

      const invalidatedKeys = await strategy.invalidateByTag(tag);

      expect(invalidatedKeys).toHaveLength(3);
      expect(invalidatedKeys).toContain('profile');
      expect(invalidatedKeys).toContain('settings');
      expect(invalidatedKeys).toContain('preferences');

      // Verify keys are deleted
      expect(await mockRedis.get('cache:value:profile')).toBeNull();
      expect(await mockRedis.get('cache:value:settings')).toBeNull();
      expect(await mockRedis.get('cache:value:preferences')).toBeNull();
    });

    test('should handle non-existent tags gracefully', async () => {
      const invalidatedKeys = await strategy.invalidateByTag('non-existent-tag');
      expect(invalidatedKeys).toHaveLength(0);
    });

    test('should clean up empty tag sets', async () => {
      const tag = 'temp:tag';
      const tagKey = `cache:tag:${tag}`;
      
      await mockRedis.sadd(tagKey, 'temp-key');
      mockRedis.setData('cache:value:temp-key', JSON.stringify({ data: 'temp' }));
      mockRedis.setData('cache:meta:temp-key', JSON.stringify({ tags: [tag] }));

      await strategy.invalidateByTag(tag);

      // Tag set should be cleaned up
      const members = await mockRedis.smembers(tagKey);
      expect(members).toHaveLength(0);
    });

    test('should record invalidation metrics', async () => {
      const tag = 'metrics:tag';
      const tagKey = `cache:tag:${tag}`;
      
      await mockRedis.sadd(tagKey, 'key1');
      await mockRedis.sadd(tagKey, 'key2');
      mockRedis.setData('cache:value:key1', '{}');
      mockRedis.setData('cache:meta:key1', JSON.stringify({ tags: [tag] }));
      mockRedis.setData('cache:value:key2', '{}');
      mockRedis.setData('cache:meta:key2', JSON.stringify({ tags: [tag] }));

      await strategy.invalidateByTag(tag);

      const stats = await strategy.getInvalidationStats();
      expect(stats.tagInvalidations).toBe(1);
      expect(stats.keysInvalidated).toBe(2);
    });
  });

  describe('Pattern-based Invalidation', () => {
    test('should invalidate keys matching a pattern', async () => {
      // Set up test data
      mockRedis.setData('cache:value:user:1:profile', JSON.stringify({ name: 'John' }));
      mockRedis.setData('cache:meta:user:1:profile', JSON.stringify({}));
      mockRedis.setData('cache:value:user:1:settings', JSON.stringify({ theme: 'dark' }));
      mockRedis.setData('cache:meta:user:1:settings', JSON.stringify({}));
      mockRedis.setData('cache:value:user:2:profile', JSON.stringify({ name: 'Jane' }));
      mockRedis.setData('cache:meta:user:2:profile', JSON.stringify({}));
      mockRedis.setData('cache:value:admin:config', JSON.stringify({ debug: true }));
      mockRedis.setData('cache:meta:admin:config', JSON.stringify({}));

      const invalidatedKeys = await strategy.invalidateByPattern('cache:value:user:1:*');

      expect(invalidatedKeys).toContain('user:1:profile');
      expect(invalidatedKeys).toContain('user:1:settings');
      expect(invalidatedKeys).not.toContain('user:2:profile');
      expect(invalidatedKeys).not.toContain('admin:config');

      // Verify correct keys are deleted
      expect(await mockRedis.get('cache:value:user:1:profile')).toBeNull();
      expect(await mockRedis.get('cache:value:user:1:settings')).toBeNull();
      expect(await mockRedis.get('cache:value:user:2:profile')).not.toBeNull();
      expect(await mockRedis.get('cache:value:admin:config')).not.toBeNull();
    });

    test('should handle patterns with no matches', async () => {
      const invalidatedKeys = await strategy.invalidateByPattern('cache:value:nonexistent:*');
      expect(invalidatedKeys).toHaveLength(0);
    });

    test('should handle complex patterns', async () => {
      mockRedis.setData('cache:value:user:123:data', '{}');
      mockRedis.setData('cache:value:user:456:data', '{}');
      mockRedis.setData('cache:value:admin:123:data', '{}');

      const invalidatedKeys = await strategy.invalidateByPattern('cache:value:user:*:data');

      expect(invalidatedKeys).toContain('user:123:data');
      expect(invalidatedKeys).toContain('user:456:data');
      expect(invalidatedKeys).not.toContain('admin:123:data');
    });

    test('should record pattern invalidation metrics', async () => {
      mockRedis.setData('cache:value:pattern:test1', '{}');
      mockRedis.setData('cache:value:pattern:test2', '{}');

      await strategy.invalidateByPattern('cache:value:pattern:*');

      const stats = await strategy.getInvalidationStats();
      expect(stats.patternInvalidations).toBe(1);
    });
  });

  describe('Dependency-based Invalidation', () => {
    test('should invalidate keys that depend on a specific dependency', async () => {
      // Set up metadata with dependencies
      mockRedis.setData('cache:value:dependent1', '{}');
      mockRedis.setData('cache:meta:dependent1', JSON.stringify({
        metadata: { dependencies: ['api:users', 'api:profiles'] }
      }));
      
      mockRedis.setData('cache:value:dependent2', '{}');
      mockRedis.setData('cache:meta:dependent2', JSON.stringify({
        metadata: { dependencies: ['api:users'] }
      }));
      
      mockRedis.setData('cache:value:independent', '{}');
      mockRedis.setData('cache:meta:independent', JSON.stringify({
        metadata: { dependencies: ['api:config'] }
      }));

      const invalidatedKeys = await strategy.invalidateByDependency('api:users');

      expect(invalidatedKeys).toContain('dependent1');
      expect(invalidatedKeys).toContain('dependent2');
      expect(invalidatedKeys).not.toContain('independent');
    });

    test('should handle dependencies that dont exist', async () => {
      const invalidatedKeys = await strategy.invalidateByDependency('non-existent-dep');
      expect(invalidatedKeys).toHaveLength(0);
    });
  });

  describe('TTL-based Invalidation', () => {
    test('should invalidate keys older than specified age', async () => {
      const now = Date.now();
      const oldTime = new Date(now - 2 * 60 * 60 * 1000); // 2 hours ago
      const recentTime = new Date(now - 30 * 60 * 1000); // 30 minutes ago

      mockRedis.setData('cache:value:old', '{}');
      mockRedis.setData('cache:meta:old', JSON.stringify({
        createdAt: oldTime.toISOString()
      }));
      
      mockRedis.setData('cache:value:recent', '{}');
      mockRedis.setData('cache:meta:recent', JSON.stringify({
        createdAt: recentTime.toISOString()
      }));

      // Invalidate entries older than 1 hour
      const maxAge = 60 * 60 * 1000; // 1 hour
      const invalidatedKeys = await strategy.invalidateByTTL(maxAge);

      expect(invalidatedKeys).toContain('old');
      expect(invalidatedKeys).not.toContain('recent');
    });

    test('should handle malformed metadata gracefully', async () => {
      mockRedis.setData('cache:meta:malformed', 'invalid json');
      
      const invalidatedKeys = await strategy.invalidateByTTL(60 * 60 * 1000);
      expect(invalidatedKeys).toHaveLength(0);
    });
  });

  describe('Selective Invalidation', () => {
    test('should perform selective invalidation based on multiple criteria', async () => {
      // Set up various test data
      const tag = 'user:123';
      await mockRedis.sadd(`cache:tag:${tag}`, 'tagged-key');
      mockRedis.setData('cache:value:tagged-key', '{}');
      mockRedis.setData('cache:meta:tagged-key', JSON.stringify({ tags: [tag] }));
      
      mockRedis.setData('cache:value:pattern:match', '{}');
      mockRedis.setData('cache:meta:pattern:match', '{}');
      
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
      mockRedis.setData('cache:value:old-key', '{}');
      mockRedis.setData('cache:meta:old-key', JSON.stringify({
        createdAt: oldTime.toISOString()
      }));

      const result = await strategy.invalidateSelective({
        tags: ['user:123'],
        patterns: ['cache:value:pattern:*'],
        maxAge: 60 * 60 * 1000 // 1 hour
      });

      expect(result.invalidatedKeys).toContain('tagged-key');
      expect(result.invalidatedKeys).toContain('pattern:match');
      expect(result.invalidatedKeys).toContain('old-key');
      expect(result.summary.byTags).toBe(1);
      expect(result.summary.byPatterns).toBe(1);
      expect(result.summary.byAge).toBe(1);
    });

    test('should handle access count criteria', async () => {
      mockRedis.setData('cache:value:low-access', '{}');
      mockRedis.setData('cache:meta:low-access', JSON.stringify({
        accessCount: 2
      }));
      
      mockRedis.setData('cache:value:high-access', '{}');
      mockRedis.setData('cache:meta:high-access', JSON.stringify({
        accessCount: 100
      }));

      const result = await strategy.invalidateSelective({
        minAccessCount: 5,
        maxAccessCount: 50
      });

      expect(result.invalidatedKeys).toContain('low-access');
      expect(result.invalidatedKeys).not.toContain('high-access');
    });
  });

  describe('Scheduled Invalidation', () => {
    test('should schedule invalidation for future execution', async () => {
      const delay = 100; // 100ms
      const operation = jest.fn().mockResolvedValue(['key1', 'key2']);

      const taskId = await strategy.scheduleInvalidation(delay, operation);

      expect(taskId).toMatch(/^invalidation_\d+_[a-z0-9]+$/);
      expect(operation).not.toHaveBeenCalled();

      // Wait for scheduled execution
      await new Promise(resolve => setTimeout(resolve, delay + 50));
      
      expect(operation).toHaveBeenCalled();
    });

    test('should handle scheduled invalidation errors', async () => {
      const delay = 50;
      const operation = jest.fn().mockRejectedValue(new Error('Scheduled error'));

      const taskId = await strategy.scheduleInvalidation(delay, operation);
      expect(taskId).toBeDefined();

      // Wait for scheduled execution
      await new Promise(resolve => setTimeout(resolve, delay + 50));
      
      expect(operation).toHaveBeenCalled();
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should provide comprehensive invalidation statistics', async () => {
      // Perform various invalidations
      await strategy.invalidateByTag('test-tag');
      await strategy.invalidateByPattern('test-pattern:*');
      
      const stats = await strategy.getInvalidationStats();
      
      expect(stats).toHaveProperty('totalInvalidations');
      expect(stats).toHaveProperty('tagInvalidations');
      expect(stats).toHaveProperty('patternInvalidations');
      expect(stats).toHaveProperty('keysInvalidated');
      expect(stats).toHaveProperty('averageDuration');
      
      expect(stats.totalInvalidations).toBe(2);
      expect(stats.tagInvalidations).toBe(1);
      expect(stats.patternInvalidations).toBe(1);
    });

    test('should calculate average duration correctly', async () => {
      const tag1 = 'tag1';
      await mockRedis.sadd(`cache:tag:${tag1}`, 'key1');
      mockRedis.setData('cache:value:key1', '{}');
      mockRedis.setData('cache:meta:key1', JSON.stringify({ tags: [tag1] }));

      const tag2 = 'tag2';
      await mockRedis.sadd(`cache:tag:${tag2}`, 'key2');
      mockRedis.setData('cache:value:key2', '{}');
      mockRedis.setData('cache:meta:key2', JSON.stringify({ tags: [tag2] }));

      await strategy.invalidateByTag(tag1);
      await strategy.invalidateByTag(tag2);

      const stats = await strategy.getInvalidationStats();
      expect(stats.averageDuration).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle Redis connection errors gracefully', async () => {
      // Mock Redis to throw errors
      const errorRedis = new MockRedisCluster();
      errorRedis.smembers = jest.fn().mockRejectedValue(new Error('Redis error'));
      
      const errorStrategy = new CacheInvalidationStrategy(errorRedis, mockMetrics);
      
      const result = await errorStrategy.invalidateByTag('test-tag');
      expect(result).toHaveLength(0);
    });

    test('should handle malformed tag data', async () => {
      // Set up malformed tag data
      mockRedis.addToSet('cache:tag:malformed', 'key-with-no-data');
      
      const result = await strategy.invalidateByTag('malformed');
      expect(result).toHaveLength(1); // Should still attempt invalidation
    });

    test('should handle empty patterns and tags', async () => {
      const tagResult = await strategy.invalidateByTag('');
      const patternResult = await strategy.invalidateByPattern('');
      
      expect(tagResult).toHaveLength(0);
      expect(patternResult).toHaveLength(0);
    });

    test('should handle concurrent invalidations', async () => {
      const tag = 'concurrent-tag';
      await mockRedis.sadd(`cache:tag:${tag}`, 'key1');
      await mockRedis.sadd(`cache:tag:${tag}`, 'key2');
      mockRedis.setData('cache:value:key1', '{}');
      mockRedis.setData('cache:meta:key1', JSON.stringify({ tags: [tag] }));
      mockRedis.setData('cache:value:key2', '{}');
      mockRedis.setData('cache:meta:key2', JSON.stringify({ tags: [tag] }));

      // Run concurrent invalidations
      const promises = [
        strategy.invalidateByTag(tag),
        strategy.invalidateByPattern('cache:value:key*')
      ];

      const results = await Promise.all(promises);
      
      // Both should complete without errors
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
    });
  });
});