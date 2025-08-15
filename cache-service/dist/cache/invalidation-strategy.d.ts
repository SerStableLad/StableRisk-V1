import { RedisCluster } from '../redis/cluster-connection';
export interface InvalidationResult {
    invalidatedKeys: string[];
    totalInvalidated: number;
    operationDuration: number;
    errors: string[];
}
export interface InvalidationPattern {
    pattern: string;
    reason: string;
    priority: 'low' | 'medium' | 'high';
}
export declare class CacheInvalidationStrategy {
    private redis;
    private batchSize;
    private maxScanCount;
    constructor(redis?: RedisCluster);
    initialize(): Promise<void>;
    /**
     * Invalidate all cache entries with a specific tag
     */
    invalidateByTag(tag: string): Promise<string[]>;
    /**
     * Invalidate cache entries matching a pattern
     */
    invalidateByPattern(pattern: string): Promise<string[]>;
    /**
     * Invalidate specific cache keys
     */
    invalidateKeys(keys: string[]): Promise<InvalidationResult>;
    /**
     * Invalidate all cache entries (nuclear option)
     */
    invalidateAll(): Promise<InvalidationResult>;
    /**
     * Get invalidation recommendations based on patterns
     */
    getInvalidationRecommendations(): Promise<InvalidationPattern[]>;
    /**
     * Schedule background invalidation
     */
    scheduleInvalidation(patterns: string[], delayMs?: number): Promise<string>;
    /**
     * Get invalidation statistics
     */
    getStats(): Promise<{
        totalTagKeys: number;
        averageTagSize: number;
        largestTags: Array<{
            tag: string;
            size: number;
        }>;
        totalCacheKeys: number;
    }>;
    /**
     * Private helper methods
     */
    private createBatches;
    /**
     * Set batch size for operations
     */
    setBatchSize(size: number): void;
    /**
     * Set maximum scan count
     */
    setMaxScanCount(count: number): void;
}
//# sourceMappingURL=invalidation-strategy.d.ts.map