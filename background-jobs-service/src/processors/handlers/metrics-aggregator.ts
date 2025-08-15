/**
 * Metrics Aggregation Job Handler
 * 
 * Handles time-series data aggregation and processing for performance metrics,
 * system statistics, and business intelligence reporting
 */

import { Job } from '../../types';
import { BaseHandler, HandlerConfig } from './base-handler';

interface MetricsAggregationData {
  startTime: Date;
  endTime: Date;
  aggregationLevel: 'minute' | 'hour' | 'day';
  metrics?: string[];
  sources?: string[];
}

interface AggregatedMetric {
  name: string;
  value: number;
  aggregationType: 'sum' | 'average' | 'min' | 'max' | 'count';
  dataPoints: number;
  confidence: number;
}

interface TimeSeriesDataPoint {
  timestamp: Date;
  metric: string;
  value: number;
  source: string;
}

export class MetricsAggregator extends BaseHandler {
  private readonly supportedMetrics = [
    'api_response_time',
    'cache_hit_rate',
    'job_processing_rate',
    'error_rate',
    'system_load',
    'memory_usage',
    'disk_usage',
    'network_throughput',
    'user_engagement',
    'stablecoin_price_stability',
    'transparency_score_changes',
    'liquidity_metrics'
  ];

  constructor(config: HandlerConfig = {}) {
    super({
      timeoutMs: 300000, // 5 minutes for large aggregations
      retries: 2,
      enableMetrics: true,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 0.3, // More lenient for data processing
      ...config
    });
  }

  protected async executeJob(job: Job, logger: any): Promise<any> {
    this.validateJobData(job, ['startTime', 'endTime', 'aggregationLevel']);
    
    const { 
      startTime, 
      endTime, 
      aggregationLevel, 
      metrics = this.supportedMetrics,
      sources = ['api', 'database', 'cache', 'external']
    } = job.data as MetricsAggregationData;

    logger.info('Starting metrics aggregation', {
      operation: 'metrics_aggregation',
      metadata: {
        timeRange: `${startTime} to ${endTime}`,
        level: aggregationLevel,
        metricsCount: metrics.length,
        sourcesCount: sources.length
      }
    });

    const startTimestamp = new Date(startTime);
    const endTimestamp = new Date(endTime);
    
    // Validate time range
    this.validateTimeRange(startTimestamp, endTimestamp, aggregationLevel);

    const aggregationResults = await this.performAggregation(
      startTimestamp,
      endTimestamp,
      aggregationLevel,
      metrics,
      sources,
      logger
    );

    // Calculate derived metrics
    const derivedMetrics = this.calculateDerivedMetrics(aggregationResults, logger);

    // Generate summary statistics
    const summaryStats = this.generateSummaryStatistics(aggregationResults);

    const result = this.createResult({
      timeRange: {
        start: startTimestamp.toISOString(),
        end: endTimestamp.toISOString(),
        aggregationLevel
      },
      aggregatedMetrics: aggregationResults,
      derivedMetrics,
      summaryStats,
      dataQuality: this.assessDataQuality(aggregationResults)
    }, {
      totalMetrics: aggregationResults.length,
      processingTimeMs: Date.now() - Date.now(),
      dataPointsProcessed: aggregationResults.reduce((sum, m) => sum + m.dataPoints, 0)
    });

    logger.info('Metrics aggregation completed', {
      operation: 'metrics_aggregation_complete',
      metadata: {
        metricsProcessed: aggregationResults.length,
        derivedMetricsGenerated: derivedMetrics.length,
        averageConfidence: summaryStats.averageConfidence
      }
    });

    return result;
  }

  private validateTimeRange(
    startTime: Date, 
    endTime: Date, 
    aggregationLevel: string
  ): void {
    const diffMs = endTime.getTime() - startTime.getTime();
    
    if (diffMs <= 0) {
      throw new Error('End time must be after start time');
    }

    // Validate reasonable time ranges based on aggregation level
    const maxRanges = {
      minute: 24 * 60 * 60 * 1000, // 1 day for minute-level
      hour: 30 * 24 * 60 * 60 * 1000, // 30 days for hour-level
      day: 365 * 24 * 60 * 60 * 1000 // 1 year for day-level
    };

    const maxRange = maxRanges[aggregationLevel as keyof typeof maxRanges];
    if (diffMs > maxRange) {
      throw new Error(`Time range too large for ${aggregationLevel} aggregation. Max: ${maxRange / (24 * 60 * 60 * 1000)} days`);
    }
  }

  private async performAggregation(
    startTime: Date,
    endTime: Date,
    aggregationLevel: string,
    metrics: string[],
    sources: string[],
    logger: any
  ): Promise<AggregatedMetric[]> {
    logger.debug('Performing metrics aggregation', {
      metadata: {
        timeRange: `${startTime.toISOString()} - ${endTime.toISOString()}`,
        level: aggregationLevel,
        metricsToProcess: metrics
      }
    });

    // Process metrics in parallel with error collection
    const metricOperations = metrics.map(metric => 
      () => this.aggregateMetric(metric, startTime, endTime, aggregationLevel, sources, logger)
    );

    const parallelResults = await this.executeInParallel(metricOperations, metrics);

    if (parallelResults.errors.length > 0) {
      logger.warn('Some metrics failed to aggregate', {
        metadata: {
          failedCount: parallelResults.failureCount,
          successCount: parallelResults.successCount,
          errors: parallelResults.errors
        }
      });
    }

    return parallelResults.results.filter(result => result !== null);
  }

  private async aggregateMetric(
    metricName: string,
    startTime: Date,
    endTime: Date,
    aggregationLevel: string,
    sources: string[],
    logger: any
  ): Promise<AggregatedMetric> {
    logger.debug(`Aggregating metric: ${metricName}`);

    // Simulate data fetching from different sources
    const sourceDataPromises = sources.map(source =>
      this.fetchMetricData(metricName, source, startTime, endTime, logger)
    );

    const sourceResults = await Promise.allSettled(sourceDataPromises);
    const validDataPoints: TimeSeriesDataPoint[] = [];

    // Collect valid data points from all sources
    sourceResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        validDataPoints.push(...result.value);
      } else {
        logger.warn(`Failed to fetch ${metricName} data from ${sources[index]}`, {
          metadata: { metric: metricName, source: sources[index], error: result.reason.message }
        });
      }
    });

    if (validDataPoints.length === 0) {
      throw new Error(`No data available for metric: ${metricName}`);
    }

    // Aggregate data based on level
    const aggregatedData = this.aggregateDataPoints(validDataPoints, aggregationLevel);
    
    // Calculate final aggregated metric
    return this.calculateAggregatedMetric(metricName, aggregatedData);
  }

  private async fetchMetricData(
    metricName: string,
    source: string,
    startTime: Date,
    endTime: Date,
    logger: any
  ): Promise<TimeSeriesDataPoint[]> {
    // Simulate database/API call with realistic delays
    await this.delay(Math.random() * 1000 + 500); // 0.5-1.5s delay

    const dataPoints: TimeSeriesDataPoint[] = [];
    const intervalMs = this.getDataPointInterval(metricName);
    const currentTime = new Date(startTime);

    // Generate mock time-series data
    while (currentTime <= endTime) {
      const value = this.generateRealisticMetricValue(metricName, source, currentTime);
      
      dataPoints.push({
        timestamp: new Date(currentTime),
        metric: metricName,
        value,
        source
      });

      currentTime.setTime(currentTime.getTime() + intervalMs);
    }

    logger.trace(`Fetched ${dataPoints.length} data points for ${metricName} from ${source}`);

    // Simulate occasional source failures
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error(`Data source ${source} temporarily unavailable`);
    }

    return dataPoints;
  }

  private aggregateDataPoints(
    dataPoints: TimeSeriesDataPoint[],
    aggregationLevel: string
  ): TimeSeriesDataPoint[] {
    // Group data points by time bucket based on aggregation level
    const buckets = new Map<string, TimeSeriesDataPoint[]>();

    dataPoints.forEach(point => {
      const bucketKey = this.getBucketKey(point.timestamp, aggregationLevel);
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
      }
      buckets.get(bucketKey)!.push(point);
    });

    // Aggregate each bucket
    const aggregatedPoints: TimeSeriesDataPoint[] = [];
    
    for (const [bucketKey, points] of buckets) {
      if (points.length === 0) continue;

      const bucketTimestamp = this.parseBucketKey(bucketKey, aggregationLevel);
      const aggregatedValue = this.calculateBucketValue(points);

      aggregatedPoints.push({
        timestamp: bucketTimestamp,
        metric: points[0].metric,
        value: aggregatedValue,
        source: 'aggregated'
      });
    }

    return aggregatedPoints.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private calculateAggregatedMetric(
    metricName: string, 
    dataPoints: TimeSeriesDataPoint[]
  ): AggregatedMetric {
    const values = dataPoints.map(p => p.value);
    const aggregationType = this.getAggregationType(metricName);

    let aggregatedValue: number;
    
    switch (aggregationType) {
      case 'sum':
        aggregatedValue = values.reduce((sum, val) => sum + val, 0);
        break;
      case 'average':
        aggregatedValue = values.reduce((sum, val) => sum + val, 0) / values.length;
        break;
      case 'min':
        aggregatedValue = Math.min(...values);
        break;
      case 'max':
        aggregatedValue = Math.max(...values);
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      default:
        aggregatedValue = values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    // Calculate confidence based on data completeness and consistency
    const confidence = this.calculateConfidence(values);

    return {
      name: metricName,
      value: aggregatedValue,
      aggregationType,
      dataPoints: dataPoints.length,
      confidence
    };
  }

  private calculateDerivedMetrics(
    aggregatedMetrics: AggregatedMetric[],
    logger: any
  ): AggregatedMetric[] {
    logger.debug('Calculating derived metrics');

    const derivedMetrics: AggregatedMetric[] = [];
    const metricsMap = new Map(aggregatedMetrics.map(m => [m.name, m]));

    // System health score
    if (metricsMap.has('error_rate') && metricsMap.has('api_response_time')) {
      const errorRate = metricsMap.get('error_rate')!.value;
      const responseTime = metricsMap.get('api_response_time')!.value;
      
      const healthScore = Math.max(0, 100 - (errorRate * 10) - (responseTime / 100));
      
      derivedMetrics.push({
        name: 'system_health_score',
        value: healthScore,
        aggregationType: 'average',
        dataPoints: Math.min(
          metricsMap.get('error_rate')!.dataPoints,
          metricsMap.get('api_response_time')!.dataPoints
        ),
        confidence: Math.min(
          metricsMap.get('error_rate')!.confidence,
          metricsMap.get('api_response_time')!.confidence
        )
      });
    }

    // Cache efficiency score
    if (metricsMap.has('cache_hit_rate')) {
      const hitRate = metricsMap.get('cache_hit_rate')!.value;
      const efficiencyScore = hitRate * 100; // Convert to percentage
      
      derivedMetrics.push({
        name: 'cache_efficiency_score',
        value: efficiencyScore,
        aggregationType: 'average',
        dataPoints: metricsMap.get('cache_hit_rate')!.dataPoints,
        confidence: metricsMap.get('cache_hit_rate')!.confidence
      });
    }

    // Performance index (composite metric)
    const performanceMetrics = [
      'api_response_time',
      'job_processing_rate',
      'system_load'
    ].map(name => metricsMap.get(name)).filter(Boolean) as AggregatedMetric[];

    if (performanceMetrics.length >= 2) {
      const normalizedValues = performanceMetrics.map(m => this.normalizeMetricValue(m));
      const performanceIndex = normalizedValues.reduce((sum, val) => sum + val, 0) / normalizedValues.length;
      
      derivedMetrics.push({
        name: 'performance_index',
        value: performanceIndex,
        aggregationType: 'average',
        dataPoints: Math.min(...performanceMetrics.map(m => m.dataPoints)),
        confidence: Math.min(...performanceMetrics.map(m => m.confidence))
      });
    }

    logger.debug(`Generated ${derivedMetrics.length} derived metrics`);
    return derivedMetrics;
  }

  private generateSummaryStatistics(metrics: AggregatedMetric[]): {
    totalMetrics: number;
    averageConfidence: number;
    highConfidenceMetrics: number;
    dataPointsTotal: number;
    aggregationTypes: Record<string, number>;
  } {
    return {
      totalMetrics: metrics.length,
      averageConfidence: metrics.reduce((sum, m) => sum + m.confidence, 0) / metrics.length,
      highConfidenceMetrics: metrics.filter(m => m.confidence > 0.8).length,
      dataPointsTotal: metrics.reduce((sum, m) => sum + m.dataPoints, 0),
      aggregationTypes: metrics.reduce((counts, m) => {
        counts[m.aggregationType] = (counts[m.aggregationType] || 0) + 1;
        return counts;
      }, {} as Record<string, number>)
    };
  }

  private assessDataQuality(metrics: AggregatedMetric[]): {
    overallScore: number;
    completeness: number;
    timeliness: number;
    consistency: number;
  } {
    const avgConfidence = metrics.reduce((sum, m) => sum + m.confidence, 0) / metrics.length;
    const completeness = metrics.filter(m => m.dataPoints > 0).length / metrics.length;
    const consistency = metrics.filter(m => m.confidence > 0.7).length / metrics.length;
    
    return {
      overallScore: (avgConfidence + completeness + consistency) / 3,
      completeness,
      timeliness: 0.9 + Math.random() * 0.1, // Simulate timeliness assessment
      consistency
    };
  }

  // Helper methods
  private getDataPointInterval(metricName: string): number {
    const intervals: Record<string, number> = {
      'api_response_time': 60000, // 1 minute
      'cache_hit_rate': 300000, // 5 minutes
      'job_processing_rate': 60000, // 1 minute
      'error_rate': 60000, // 1 minute
      'system_load': 300000, // 5 minutes
      'memory_usage': 300000, // 5 minutes
      default: 300000 // 5 minutes default
    };

    return intervals[metricName] || intervals.default;
  }

  private generateRealisticMetricValue(
    metricName: string,
    source: string,
    timestamp: Date
  ): number {
    const baseValues: Record<string, number> = {
      'api_response_time': 250,
      'cache_hit_rate': 0.85,
      'job_processing_rate': 15,
      'error_rate': 0.02,
      'system_load': 0.6,
      'memory_usage': 0.75,
      'disk_usage': 0.45,
      'network_throughput': 1000000,
      'user_engagement': 0.75,
      'stablecoin_price_stability': 0.999,
      'transparency_score_changes': 85,
      'liquidity_metrics': 50000000
    };

    const baseValue = baseValues[metricName] || 1;
    const variability = 0.1 + Math.random() * 0.2; // 10-30% variability
    const sourceMultiplier = source === 'external' ? 1.1 : 1.0; // External sources slightly higher
    
    return baseValue * (1 + (Math.random() - 0.5) * variability) * sourceMultiplier;
  }

  private getBucketKey(timestamp: Date, aggregationLevel: string): string {
    switch (aggregationLevel) {
      case 'minute':
        return `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}-${timestamp.getHours()}-${timestamp.getMinutes()}`;
      case 'hour':
        return `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}-${timestamp.getHours()}`;
      case 'day':
        return `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
      default:
        return timestamp.toISOString();
    }
  }

  private parseBucketKey(bucketKey: string, aggregationLevel: string): Date {
    const parts = bucketKey.split('-').map(Number);
    
    switch (aggregationLevel) {
      case 'minute':
        return new Date(parts[0], parts[1], parts[2], parts[3], parts[4]);
      case 'hour':
        return new Date(parts[0], parts[1], parts[2], parts[3]);
      case 'day':
        return new Date(parts[0], parts[1], parts[2]);
      default:
        return new Date(bucketKey);
    }
  }

  private calculateBucketValue(points: TimeSeriesDataPoint[]): number {
    return points.reduce((sum, point) => sum + point.value, 0) / points.length;
  }

  private getAggregationType(metricName: string): 'sum' | 'average' | 'min' | 'max' | 'count' {
    const types: Record<string, 'sum' | 'average' | 'min' | 'max' | 'count'> = {
      'api_response_time': 'average',
      'cache_hit_rate': 'average',
      'job_processing_rate': 'sum',
      'error_rate': 'average',
      'system_load': 'average',
      'memory_usage': 'average',
      'disk_usage': 'average',
      'network_throughput': 'sum',
      'user_engagement': 'average',
      'stablecoin_price_stability': 'average',
      'transparency_score_changes': 'average',
      'liquidity_metrics': 'sum'
    };

    return types[metricName] || 'average';
  }

  private calculateConfidence(values: number[]): number {
    if (values.length === 0) return 0;
    
    // Calculate coefficient of variation (CV) as confidence indicator
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / Math.abs(mean);
    
    // Convert CV to confidence (lower CV = higher confidence)
    const confidence = Math.max(0, Math.min(1, 1 - cv));
    
    // Adjust confidence based on sample size
    const sampleSizeFactor = Math.min(1, values.length / 100); // More samples = higher confidence
    
    return confidence * 0.7 + sampleSizeFactor * 0.3;
  }

  private normalizeMetricValue(metric: AggregatedMetric): number {
    // Normalize different metrics to 0-100 scale for composite calculations
    const normalizationFactors: Record<string, { min: number; max: number }> = {
      'api_response_time': { min: 0, max: 1000 }, // 0-1000ms
      'job_processing_rate': { min: 0, max: 100 }, // 0-100 jobs/min
      'system_load': { min: 0, max: 1 }, // 0-1 load
      'memory_usage': { min: 0, max: 1 }, // 0-100%
      'error_rate': { min: 0, max: 0.1 } // 0-10%
    };

    const factor = normalizationFactors[metric.name];
    if (!factor) return 50; // Default middle value

    // For metrics where lower is better (response time, error rate), invert
    const lowerIsBetter = ['api_response_time', 'error_rate'].includes(metric.name);
    
    let normalized = ((metric.value - factor.min) / (factor.max - factor.min)) * 100;
    
    if (lowerIsBetter) {
      normalized = 100 - normalized;
    }

    return Math.max(0, Math.min(100, normalized));
  }
}