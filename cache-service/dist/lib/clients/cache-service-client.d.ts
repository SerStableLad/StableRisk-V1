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
export declare class CacheServiceClient {
    private static instance;
    private baseUrl;
    private timeout;
    private fallbackCache;
    private maxFallbackEntries;
    private fallbackCleanupInterval;
    private constructor();
    static getInstance(): CacheServiceClient;
    /**
     * Set a cache entry
     */
    set(key: string, value: any, options?: CacheSetOptions): Promise<boolean>;
    /**
     * Get a cache entry
     */
    get(key: string): Promise<any>;
    /**
     * Multi-get cache entries
     */
    mget(keys: string[]): Promise<CacheMultiGetResult[]>;
    /**
     * Delete a cache entry
     */
    delete(key: string): Promise<boolean>;
    /**
     * Invalidate cache entries by tag
     */
    invalidateByTag(tag: string): Promise<string[]>;
    /**
     * Get cache statistics
     */
    getStats(): Promise<CacheStats>;
    /**
     * Health check for cache service
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get configuration (for testing)
     */
    getConfiguration(): {
        baseUrl: string;
        timeout: number;
        maxFallbackEntries: number;
        fallbackCacheSize: number;
    };
    /**
     * Clear fallback cache (for testing)
     */
    clearFallbackCache(): void;
    /**
     * Shutdown client and cleanup resources
     */
    shutdown(): void;
    private validateConfiguration;
    private makeRequest;
    private setFallback;
    private getFallback;
    private mgetFallback;
    private evictOldestFallbackEntry;
    private estimateFallbackMemoryUsage;
    private startFallbackCleanup;
    private cleanupFallbackCache;
}
export declare const cacheServiceClient: CacheServiceClient;
//# sourceMappingURL=cache-service-client.d.ts.map