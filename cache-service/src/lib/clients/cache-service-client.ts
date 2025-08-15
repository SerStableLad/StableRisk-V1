/**
 * Cache Service Client
 * 
 * HTTP client for communicating with the cache service with fallback mechanisms.
 * Provides graceful degradation to local memory cache when service is unavailable.
 */

export interface CacheSetOptions {
  ttl?: number;
  tags?: string[];
  dependencies?: string[];
  source?: string;
  version?: string;
  metadata?: Record<string, any>;
}

export interface CacheGetResult {
  key: string;
  value: any;
  found: boolean;
}

export interface CacheMultiGetResult {
  key: string;
  value: any;
}

export interface CacheStats {
  memory?: any;
  keyCount?: number;
  accessPatterns?: any;
  config?: any;
  error?: string;
  fallbackCache?: {
    entries: number;
    maxEntries: number;
    memoryUsage: number;
  };
}

interface FallbackCacheEntry {
  value: any;
  expires: number;
  createdAt: number;
}

export class CacheServiceClient {
  private static instance: CacheServiceClient;
  private baseUrl: string;
  private timeout: number;
  private fallbackCache: Map<string, FallbackCacheEntry>;
  private maxFallbackEntries: number;
  private fallbackCleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.baseUrl = process.env.CACHE_SERVICE_URL || 'http://localhost:3002';
    this.timeout = parseInt(process.env.CACHE_SERVICE_TIMEOUT || '2000', 10);
    this.maxFallbackEntries = parseInt(process.env.CACHE_FALLBACK_MAX_ENTRIES || '1000', 10);
    this.fallbackCache = new Map();
    
    // Validate configuration
    this.validateConfiguration();
    
    // Start fallback cache cleanup
    this.startFallbackCleanup();
  }

  public static getInstance(): CacheServiceClient {
    if (!CacheServiceClient.instance) {
      CacheServiceClient.instance = new CacheServiceClient();
    }
    return CacheServiceClient.instance;
  }

  /**
   * Set a cache entry
   */
  async set(
    key: string,
    value: any,
    options: CacheSetOptions = {}
  ): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      console.error('Cache set: Invalid key provided');
      return false;
    }

    try {
      const response = await this.makeRequest('/cache/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, options }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { success?: boolean };
      return result.success || false;
    } catch (error) {
      console.error('Cache service set failed, using fallback:', error);
      return this.setFallback(key, value, options);
    }
  }

  /**
   * Get a cache entry
   */
  async get(key: string): Promise<any> {
    if (!key || typeof key !== 'string') {
      console.error('Cache get: Invalid key provided');
      return null;
    }

    try {
      const response = await this.makeRequest(
        `/cache/get/${encodeURIComponent(key)}`
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { found?: boolean; value?: any };
      return result.found ? result.value : null;
    } catch (error) {
      console.error('Cache service get failed, trying fallback:', error);
      return this.getFallback(key);
    }
  }

  /**
   * Multi-get cache entries
   */
  async mget(keys: string[]): Promise<CacheMultiGetResult[]> {
    if (!Array.isArray(keys) || keys.length === 0) {
      console.error('Cache mget: Invalid keys provided');
      return [];
    }

    // Validate keys
    const validKeys = keys.filter(key => key && typeof key === 'string');
    if (validKeys.length !== keys.length) {
      console.warn('Cache mget: Some invalid keys were filtered out');
    }

    try {
      const response = await this.makeRequest('/cache/mget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: validKeys }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { results?: CacheMultiGetResult[] };
      return result.results || [];
    } catch (error) {
      console.error('Cache service mget failed, using fallbacks:', error);
      return this.mgetFallback(validKeys);
    }
  }

  /**
   * Delete a cache entry
   */
  async delete(key: string): Promise<boolean> {
    if (!key || typeof key !== 'string') {
      console.error('Cache delete: Invalid key provided');
      return false;
    }

    try {
      const response = await this.makeRequest(
        `/cache/delete/${encodeURIComponent(key)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { success?: boolean };
      
      // Always delete from fallback cache regardless of service response
      this.fallbackCache.delete(key);
      
      return result.success || false;
    } catch (error) {
      console.error('Cache service delete failed:', error);
      
      // Still delete from fallback
      this.fallbackCache.delete(key);
      return false;
    }
  }

  /**
   * Invalidate cache entries by tag
   */
  async invalidateByTag(tag: string): Promise<string[]> {
    if (!tag || typeof tag !== 'string') {
      console.error('Cache invalidateByTag: Invalid tag provided');
      return [];
    }

    try {
      const response = await this.makeRequest('/cache/invalidate/tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json() as { invalidatedKeys?: string[] };
      return result.invalidatedKeys || [];
    } catch (error) {
      console.error('Cache service tag invalidation failed:', error);
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const response = await this.makeRequest('/cache/stats');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const stats = await response.json() as any;
      
      // Add fallback cache stats
      return {
        ...stats,
        fallbackCache: {
          entries: this.fallbackCache.size,
          maxEntries: this.maxFallbackEntries,
          memoryUsage: this.estimateFallbackMemoryUsage(),
        },
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        fallbackCache: {
          entries: this.fallbackCache.size,
          maxEntries: this.maxFallbackEntries,
          memoryUsage: this.estimateFallbackMemoryUsage(),
        },
      };
    }
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/health', {}, 1000); // Shorter timeout for health checks
      return response.ok;
    } catch (error) {
      console.error('Cache service health check failed:', error);
      return false;
    }
  }

  /**
   * Get configuration (for testing)
   */
  getConfiguration() {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      maxFallbackEntries: this.maxFallbackEntries,
      fallbackCacheSize: this.fallbackCache.size,
    };
  }

  /**
   * Clear fallback cache (for testing)
   */
  clearFallbackCache(): void {
    this.fallbackCache.clear();
  }

  /**
   * Shutdown client and cleanup resources
   */
  shutdown(): void {
    if (this.fallbackCleanupInterval) {
      clearInterval(this.fallbackCleanupInterval);
      this.fallbackCleanupInterval = null;
    }
    this.fallbackCache.clear();
  }

  // Private methods

  private validateConfiguration(): void {
    if (!this.baseUrl) {
      throw new Error('Cache service base URL is required');
    }

    try {
      new URL(this.baseUrl);
    } catch {
      throw new Error('Cache service base URL is invalid');
    }

    if (this.timeout <= 0 || this.timeout > 60000) {
      throw new Error('Cache service timeout must be between 1 and 60000ms');
    }

    if (this.maxFallbackEntries <= 0) {
      throw new Error('Max fallback entries must be greater than 0');
    }
  }

  private async makeRequest(
    path: string,
    options: RequestInit = {},
    customTimeout?: number
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const timeout = customTimeout || this.timeout;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      
      throw error;
    }
  }

  private setFallback(key: string, value: any, options: CacheSetOptions): boolean {
    try {
      // Check size limits
      if (this.fallbackCache.size >= this.maxFallbackEntries) {
        this.evictOldestFallbackEntry();
      }

      const ttl = options.ttl || 3600; // Default 1 hour
      const expires = Date.now() + (ttl * 1000);
      
      this.fallbackCache.set(key, {
        value,
        expires,
        createdAt: Date.now(),
      });
      
      return true;
    } catch (error) {
      console.error('Fallback cache set failed:', error);
      return false;
    }
  }

  private getFallback(key: string): any {
    const entry = this.fallbackCache.get(key);
    
    if (!entry) {
      return null;
    }

    if (entry.expires <= Date.now()) {
      this.fallbackCache.delete(key);
      return null;
    }

    return entry.value;
  }

  private mgetFallback(keys: string[]): CacheMultiGetResult[] {
    return keys.map(key => ({
      key,
      value: this.getFallback(key),
    }));
  }

  private evictOldestFallbackEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    this.fallbackCache.forEach((entry, key) => {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    });

    if (oldestKey) {
      this.fallbackCache.delete(oldestKey);
    }
  }

  private estimateFallbackMemoryUsage(): number {
    let totalSize = 0;
    
    this.fallbackCache.forEach((entry, key) => {
      try {
        // Rough estimation: key size + JSON stringified value size + overhead
        totalSize += key.length * 2; // UTF-16 characters
        totalSize += JSON.stringify(entry.value).length * 2;
        totalSize += 64; // Estimated overhead per entry
      } catch (error) {
        // Handle circular references or other JSON errors
        totalSize += key.length * 2 + 1000; // Fallback estimate
      }
    });
    
    return totalSize;
  }

  private startFallbackCleanup(): void {
    // Clean up expired entries every 5 minutes
    this.fallbackCleanupInterval = setInterval(() => {
      this.cleanupFallbackCache();
    }, 5 * 60 * 1000);
  }

  private cleanupFallbackCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.fallbackCache.forEach((entry, key) => {
      if (entry.expires <= now) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.fallbackCache.delete(key);
    });

    if (keysToDelete.length > 0) {
      console.debug(`Cleaned up ${keysToDelete.length} expired fallback cache entries`);
    }
  }
}

// Export singleton instance
export const cacheServiceClient = CacheServiceClient.getInstance();