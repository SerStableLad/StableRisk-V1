export interface MetricRecord {
    name: string;
    value: number;
    labels?: Record<string, string> | undefined;
    timestamp?: Date | undefined;
}
export interface MetricQueryOptions {
    start?: string | undefined;
    end?: string | undefined;
    granularity?: string | undefined;
    limit?: number | undefined;
}
export interface AggregatedMetricResult {
    result: number;
    count: number;
    start_time: Date;
    end_time: Date;
    operation: string;
}
export interface SystemSummaryRecord {
    name: string;
    total_records: number;
    avg_value: number;
    min_value: number;
    max_value: number;
    last_recorded: Date;
}
export declare class MetricsService {
    private db;
    /**
     * Record a single metric
     */
    recordMetric(name: string, value: number, labels?: Record<string, string>, timestamp?: Date): Promise<void>;
    /**
     * Record multiple metrics in a batch operation for high throughput
     */
    recordMetricsBatch(metrics: MetricRecord[]): Promise<void>;
    /**
     * Get metrics by name with optional filtering
     */
    getMetrics(name: string, options?: MetricQueryOptions): Promise<MetricRecord[]>;
    /**
     * Get aggregated metrics with specified operation
     */
    getAggregatedMetrics(name: string, operation?: string, start?: string | undefined, end?: string | undefined): Promise<AggregatedMetricResult>;
    /**
     * Get system-wide metrics summary for the last 24 hours
     */
    getSystemSummary(): Promise<SystemSummaryRecord[]>;
    /**
     * Clean up old metrics data
     */
    cleanupOldMetrics(olderThan?: string): Promise<number>;
    /**
     * Get metrics by label filters
     */
    getMetricsByLabels(labelFilters: Record<string, string>, options?: MetricQueryOptions): Promise<MetricRecord[]>;
    /**
     * Get unique metric names
     */
    getMetricNames(limit?: number): Promise<string[]>;
    /**
     * Get database health and metrics statistics
     */
    getHealthStats(): Promise<{
        isHealthy: boolean;
        totalMetrics: number;
        recentMetrics: number;
        oldestMetric: Date | null;
        newestMetric: Date | null;
        uniqueMetricNames: number;
    }>;
}
//# sourceMappingURL=metrics-service.d.ts.map