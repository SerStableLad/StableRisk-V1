/**
 * In-memory cache implementation for development
 * Can be replaced with Redis or other caching solutions in production
 */

interface CacheItem<T> {
  value: T;
  expiry: number;
}

// Tier-specific cache configuration
export const CACHE_TTL = {
  tier1: 24 * 60 * 60, // 24 hours in seconds
  tier2: 12 * 60 * 60, // 12 hours in seconds
  tier3: 6 * 60 * 60,  // 6 hours in seconds
  default: 24 * 60 * 60 // 24 hours in seconds
};

class CacheService {
  private cache: Map<string, CacheItem<any>> = new Map();
  private metrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  };

  constructor() {
    // Set up automatic cleanup interval
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 3600000); // Run cleanup every hour
    }
  }

  /**
   * Store a value in the cache with TTL in seconds
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiry = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { value, expiry });
    this.metrics.sets++;
    console.log(`Cache: Set ${key} (expires in ${ttlSeconds}s)`);
  }

  /**
   * Set cache with tier-specific TTL
   */
  async setForTier<T>(key: string, value: T, tier: 1 | 2 | 3): Promise<void> {
    const ttl = CACHE_TTL[`tier${tier}`];
    await this.set(key, value, ttl);
  }

  /**
   * Get a value from the cache
   */
  async get<T>(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    
    if (!item) {
      this.metrics.misses++;
      console.log(`Cache: Miss for ${key}`);
      return null;
    }

    if (Date.now() > item.expiry) {
      this.metrics.misses++;
      console.log(`Cache: Expired for ${key}`);
      this.cache.delete(key);
      return null;
    }

    this.metrics.hits++;
    console.log(`Cache: Hit for ${key}`);
    return item.value as T;
  }

  /**
   * Remove an item from the cache
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.metrics.deletes++;
    }
    return deleted;
  }

  /**
   * Clear all items in the cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    console.log('Cache: Cleared all items');
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cache: Cleaned up ${cleaned} expired items`);
    }
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<{
    size: number;
    activeItems: number;
    expiredItems: number;
    hitRatio: number;
    metrics: {
      hits: number;
      misses: number;
      sets: number;
      deletes: number;
    };
  }> {
    let activeItems = 0;
    let expiredItems = 0;
    
    const now = Date.now();
    
    for (const item of this.cache.values()) {
      if (now > item.expiry) {
        expiredItems++;
      } else {
        activeItems++;
      }
    }
    
    const totalAccesses = this.metrics.hits + this.metrics.misses;
    const hitRatio = totalAccesses > 0 ? this.metrics.hits / totalAccesses : 0;
    
    return {
      size: this.cache.size,
      activeItems,
      expiredItems,
      hitRatio,
      metrics: { ...this.metrics }
    };
  }
}

export const cacheService = new CacheService();

// For backward compatibility with existing code
const cache = {
  get: <T>(key: string): T | null => {
    console.warn('Legacy cache.get() called - please migrate to cacheService');
    const item = cacheService.get<T>(key);
    // Convert promise to sync return
    return item instanceof Promise ? null : item;
  },
  set: <T>(key: string, value: T, ttlMs: number): void => {
    console.warn('Legacy cache.set() called - please migrate to cacheService');
    cacheService.set(key, value, ttlMs / 1000);
  },
  cleanup: (): void => {
    console.warn('Legacy cache.cleanup() called - please migrate to cacheService');
    cacheService.cleanup();
  }
};

export const cacheKeys = {
  stablecoinAssessment: (ticker: string) => `stablecoin:${ticker.toLowerCase()}`,
  stablecoinTier: (ticker: string, tier: 1 | 2 | 3) => `stablecoin:${ticker.toLowerCase()}:tier${tier}`,
  stablecoinFull: (ticker: string) => `stablecoin:${ticker.toLowerCase()}:full`
};

export { cache }; 