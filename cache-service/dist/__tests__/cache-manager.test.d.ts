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
    frequency: number;
    recency: number;
    volatility: number;
    dataSize: number;
    importance: number;
}
//# sourceMappingURL=cache-manager.test.d.ts.map