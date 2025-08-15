/**
 * Metrics Aggregation Job Handler
 *
 * Handles time-series data aggregation and processing for performance metrics,
 * system statistics, and business intelligence reporting
 */
import { Job } from '../../types';
import { BaseHandler, HandlerConfig } from './base-handler';
export declare class MetricsAggregator extends BaseHandler {
    private readonly supportedMetrics;
    constructor(config?: HandlerConfig);
    protected executeJob(job: Job, logger: any): Promise<any>;
    private validateTimeRange;
    private performAggregation;
    private aggregateMetric;
    private fetchMetricData;
    private aggregateDataPoints;
    private calculateAggregatedMetric;
    private calculateDerivedMetrics;
    private generateSummaryStatistics;
    private assessDataQuality;
    private getDataPointInterval;
    private generateRealisticMetricValue;
    private getBucketKey;
    private parseBucketKey;
    private calculateBucketValue;
    private getAggregationType;
    private calculateConfidence;
    private normalizeMetricValue;
}
//# sourceMappingURL=metrics-aggregator.d.ts.map