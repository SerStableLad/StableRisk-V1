export interface AccessPattern {
    frequency: number;
    recency: number;
    volatility: number;
    dataSize: number;
    importance: number;
}
export interface AccessRecord {
    timestamp: number;
    operation: 'read' | 'write';
    dataSize: number;
    key: string;
}
export interface GlobalStats {
    totalKeys: number;
    totalReads: number;
    totalWrites: number;
    averageFrequency: number;
    averageDataSize: number;
    hotKeys: string[];
    coldKeys: string[];
    peakHours: number[];
}
declare class MockRedis {
    private data;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<string>;
    zadd(key: string, score: number, member: string): Promise<number>;
    zrange(key: string, start: number, stop: number): Promise<string[]>;
    zrevrange(key: string, start: number, stop: number): Promise<string[]>;
    zscore(key: string, member: string): Promise<number | null>;
    incr(key: string): Promise<number>;
    expire(key: string, ttl: number): Promise<number>;
    clear(): void;
}
export declare class AccessPatternAnalyzer {
    private redis;
    private patterns;
    private accessHistory;
    private globalStats;
    constructor(redis?: MockRedis);
    initialize(): Promise<void>;
    getPattern(key: string): Promise<AccessPattern | undefined>;
    recordRead(key: string, dataSize: number): Promise<void>;
    recordWrite(key: string, dataSize: number): Promise<void>;
    private updatePattern;
    getGlobalStats(): Promise<GlobalStats>;
    private updateGlobalStats;
    private updateHotColdKeys;
    private updatePeakHours;
    getTopAccessedKeys(limit?: number): Promise<Array<{
        key: string;
        frequency: number;
    }>>;
    getAccessHistory(key: string, limit?: number): Promise<AccessRecord[]>;
    getPredictedNextAccess(key: string): Promise<{
        estimatedTime: Date | null;
        confidence: number;
        reasoning: string;
    }>;
    analyzeAccessTrends(key: string): Promise<{
        trend: 'increasing' | 'decreasing' | 'stable';
        trendStrength: number;
        seasonality: boolean;
        peakHours: number[];
    }>;
    getOptimizationRecommendations(): Promise<{
        preloadCandidates: string[];
        evictionCandidates: string[];
        ttlAdjustments: Array<{
            key: string;
            recommendedMultiplier: number;
            reason: string;
        }>;
    }>;
    reset(): Promise<void>;
}
export {};
//# sourceMappingURL=access-pattern-analyzer.test.d.ts.map