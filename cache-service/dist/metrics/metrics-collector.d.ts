export interface CacheMetrics {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    hitRate: number;
    missRate: number;
    totalOperations: number;
    averageResponseTime: number;
}
export interface PerformanceMetrics {
    operationsPerSecond: number;
    averageOperationTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    concurrentOperations: number;
}
export interface SystemMetrics {
    memoryUsage: number;
    memoryUtilization: number;
    keyCount: number;
    dataSize: number;
    connectionCount: number;
    uptime: number;
}
export interface APIMetrics {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    requestsPerSecond: number;
    statusCodes: Record<number, number>;
    endpoints: Record<string, {
        count: number;
        avgTime: number;
        errors: number;
    }>;
}
export interface MetricsSnapshot {
    timestamp: number;
    cache: CacheMetrics;
    performance: PerformanceMetrics;
    system: SystemMetrics;
    api: APIMetrics;
}
export declare class MetricsCollector {
    private static instance;
    private startTime;
    private metrics;
    private constructor();
    static getInstance(): MetricsCollector;
    recordCacheHit(key: string, dataSize: number, responseTime: number): void;
    recordCacheMiss(key: string): void;
    recordCacheSet(key: string, dataSize: number, ttl: number): void;
    recordCacheDelete(key: string): void;
    recordCacheError(operation: string, key: string, error: string): void;
    recordAPICall(method: string, path: string, statusCode: number, responseTime: number): void;
    recordApiError(errorType: string, error: any): void;
    recordSystemStats(stats: any): void;
    recordOperationTime(operationType: string, duration: number): void;
    incrementConcurrentOperations(): void;
    decrementConcurrentOperations(): void;
    getCacheMetrics(): CacheMetrics;
    getPerformanceMetrics(): PerformanceMetrics;
    getSystemMetrics(): SystemMetrics;
    getAPIMetrics(): APIMetrics;
    getFullMetrics(): MetricsSnapshot;
    getHealthStatus(): {
        healthy: boolean;
        uptime: number;
        errorRate: number;
        responseTime: number;
        memoryUsage: number;
    };
    reset(): void;
    exportMetrics(): string;
    private calculateAverage;
    private calculatePercentile;
    private trimResponseTimes;
    private startCleanup;
    getTopEndpoints(limit?: number): Array<{
        endpoint: string;
        count: number;
        avgTime: number;
        errorRate: number;
    }>;
    getErrorSummary(): {
        totalErrors: number;
        errorRate: number;
        cacheErrors: number;
        apiErrors: number;
        recentErrors: number;
    };
}
//# sourceMappingURL=metrics-collector.d.ts.map