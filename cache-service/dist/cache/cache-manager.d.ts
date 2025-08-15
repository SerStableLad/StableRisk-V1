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
export declare class CacheManager {
    private static instance;
    private redis;
    private ttlCalculator;
    private accessAnalyzer;
    private invalidationStrategy;
    private metrics;
    private cleanupInterval;
    private metricsInterval;
    private config;
    private constructor();
    static getInstance(): CacheManager;
    initialize(): Promise<void>;
    set(key: string, value: any, options?: CacheOptions): Promise<boolean>;
    get(key: string): Promise<any>;
    mget(keys: string[]): Promise<Array<{
        key: string;
        value: any;
    }>>;
    delete(key: string): Promise<boolean>;
    invalidateByTag(tag: string): Promise<string[]>;
    invalidateByPattern(pattern: string): Promise<string[]>;
    getStats(): Promise<any>;
    shutdown(): Promise<void>;
    private shouldCompress;
    private compress;
    private decompress;
    private getValueKey;
    private getMetadataKey;
    private getTagKey;
    private parseRedisInfo;
    private startCleanupTask;
    private startMetricsCollection;
    private performCleanup;
    healthCheck(): Promise<{
        healthy: boolean;
        redis: boolean;
        metrics: boolean;
        uptime: number;
    }>;
    updateConfig(newConfig: Partial<typeof this.config>): void;
    getConfig(): typeof this.config;
}
//# sourceMappingURL=cache-manager.d.ts.map