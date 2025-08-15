export interface AccessPattern {
    frequency: number;
    recency: number;
    volatility: number;
    dataSize: number;
    importance: number;
}
export interface AccessStats {
    totalReads: number;
    totalWrites: number;
    lastRead: number;
    lastWrite: number;
    readTimes: number[];
    writeTimes: number[];
    averageDataSize: number;
}
export interface GlobalStats {
    totalKeys: number;
    averageFrequency: number;
    totalReads: number;
    totalWrites: number;
    hotKeys: string[];
    coldKeys: string[];
    avgAccessTime: number;
}
export declare class AccessPatternAnalyzer {
    private accessStats;
    private maxHistorySize;
    private cleanupInterval;
    initialize(): Promise<void>;
    /**
     * Record a read access for a key
     */
    recordRead(key: string, dataSize: number): Promise<void>;
    /**
     * Record a write access for a key
     */
    recordWrite(key: string, dataSize: number): Promise<void>;
    /**
     * Get access pattern for a key
     */
    getPattern(key: string): Promise<AccessPattern | undefined>;
    /**
     * Get global access statistics
     */
    getGlobalStats(): Promise<GlobalStats>;
    /**
     * Get access recommendations for optimization
     */
    getOptimizationRecommendations(): Promise<{
        preloadCandidates: string[];
        evictionCandidates: string[];
        ttlAdjustments: Array<{
            key: string;
            recommendedMultiplier: number;
            reason: string;
        }>;
    }>;
    /**
     * Clear access patterns for a key
     */
    clearPattern(key: string): Promise<void>;
    /**
     * Clear all access patterns
     */
    clearAllPatterns(): Promise<void>;
    /**
     * Shutdown the analyzer
     */
    shutdown(): Promise<void>;
    /**
     * Private helper methods
     */
    private getOrCreateStats;
    private countRecentAccesses;
    private startCleanup;
    private performCleanup;
}
//# sourceMappingURL=access-pattern-analyzer.d.ts.map