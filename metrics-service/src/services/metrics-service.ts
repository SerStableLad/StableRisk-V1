import { DatabaseConnection } from '../db/connection';

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

export class MetricsService {
  private db = DatabaseConnection.getInstance();

  /**
   * Record a single metric
   */
  async recordMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {},
    timestamp: Date = new Date()
  ): Promise<void> {
    if (!name || name.trim().length === 0) {
      throw new Error('Metric name cannot be empty');
    }

    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error('Metric value must be a valid number');
    }

    const query = `
      INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
      VALUES ($1, $2, $3, $4)
    `;
    
    await this.db.query(query, [
      name.trim(),
      value,
      JSON.stringify(labels),
      timestamp
    ]);
  }

  /**
   * Record multiple metrics in a batch operation for high throughput
   */
  async recordMetricsBatch(metrics: MetricRecord[]): Promise<void> {
    if (!metrics || metrics.length === 0) {
      return;
    }

    // Validate all metrics first
    for (const metric of metrics) {
      if (!metric.name || metric.name.trim().length === 0) {
        throw new Error('All metrics must have a non-empty name');
      }
      if (typeof metric.value !== 'number' || isNaN(metric.value)) {
        throw new Error(`Invalid value for metric ${metric.name}: ${metric.value}`);
      }
    }

    // Use transaction for batch insert
    await this.db.transaction(async (client) => {
      // Prepare batch insert values
      const values = metrics.map((_, index) => {
        const baseIndex = index * 4;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
      }).join(', ');

      const query = `
        INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
        VALUES ${values}
      `;

      const params = metrics.flatMap(metric => [
        metric.name.trim(),
        metric.value,
        JSON.stringify(metric.labels || {}),
        metric.timestamp || new Date()
      ]);

      await client.query(query, params);
    });
  }

  /**
   * Get metrics by name with optional filtering
   */
  async getMetrics(
    name: string,
    options: MetricQueryOptions = {}
  ): Promise<MetricRecord[]> {
    if (!name || name.trim().length === 0) {
      throw new Error('Metric name cannot be empty');
    }

    let query = `
      SELECT name, value, labels, recorded_at as timestamp
      FROM metrics.metric_data
      WHERE name = $1
    `;
    
    const params: any[] = [name.trim()];
    
    if (options.start) {
      params.push(options.start);
      query += ` AND recorded_at >= $${params.length}`;
    }
    
    if (options.end) {
      params.push(options.end);
      query += ` AND recorded_at <= $${params.length}`;
    }
    
    query += ` ORDER BY recorded_at DESC`;
    
    const limit = options.limit || 1000;
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    
    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => ({
      name: row.name,
      value: parseFloat(row.value),
      labels: row.labels || {},
      timestamp: row.timestamp
    }));
  }

  /**
   * Get aggregated metrics with specified operation
   */
  async getAggregatedMetrics(
    name: string,
    operation: string = 'avg',
    start?: string | undefined,
    end?: string | undefined
  ): Promise<AggregatedMetricResult> {
    if (!name || name.trim().length === 0) {
      throw new Error('Metric name cannot be empty');
    }

    const supportedOperations: Record<string, string> = {
      'avg': 'AVG(value)',
      'sum': 'SUM(value)',
      'count': 'COUNT(*)',
      'min': 'MIN(value)',
      'max': 'MAX(value)',
      'stddev': 'STDDEV(value)'
    };

    const normalizedOperation = operation.toLowerCase();
    if (!supportedOperations[normalizedOperation]) {
      throw new Error(`Unsupported aggregation operation: ${operation}. Supported: ${Object.keys(supportedOperations).join(', ')}`);
    }

    let query = `
      SELECT 
        ${supportedOperations[normalizedOperation]!} as result,
        COUNT(*) as count,
        MIN(recorded_at) as start_time,
        MAX(recorded_at) as end_time
      FROM metrics.metric_data
      WHERE name = $1
    `;
    
    const params: any[] = [name.trim()];
    
    if (start) {
      params.push(start);
      query += ` AND recorded_at >= $${params.length}`;
    }
    
    if (end) {
      params.push(end);
      query += ` AND recorded_at <= $${params.length}`;
    }
    
    const result = await this.db.query(query, params);
    const row = result.rows[0];
    
    return {
      result: parseFloat(row.result) || 0,
      count: parseInt(row.count) || 0,
      start_time: row.start_time,
      end_time: row.end_time,
      operation: normalizedOperation
    };
  }

  /**
   * Get system-wide metrics summary for the last 24 hours
   */
  async getSystemSummary(): Promise<SystemSummaryRecord[]> {
    const query = `
      SELECT 
        name,
        COUNT(*) as total_records,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        MAX(recorded_at) as last_recorded
      FROM metrics.metric_data
      WHERE recorded_at >= NOW() - INTERVAL '24 hours'
      GROUP BY name
      ORDER BY total_records DESC
      LIMIT 50
    `;
    
    const result = await this.db.query(query);
    return result.rows.map((row: any) => ({
      name: row.name,
      total_records: parseInt(row.total_records),
      avg_value: parseFloat(row.avg_value),
      min_value: parseFloat(row.min_value),
      max_value: parseFloat(row.max_value),
      last_recorded: row.last_recorded
    }));
  }

  /**
   * Clean up old metrics data
   */
  async cleanupOldMetrics(olderThan: string = '30 days'): Promise<number> {
    // Validate the interval format
    const intervalRegex = /^\d+\s+(day|days|hour|hours|minute|minutes)$/i;
    if (!intervalRegex.test(olderThan)) {
      throw new Error('Invalid interval format. Use formats like "30 days", "24 hours", "60 minutes"');
    }

    const query = `
      DELETE FROM metrics.metric_data
      WHERE recorded_at < NOW() - INTERVAL $1
    `;
    
    const result = await this.db.query(query, [olderThan]);
    return result.rowCount || 0;
  }

  /**
   * Get metrics by label filters
   */
  async getMetricsByLabels(
    labelFilters: Record<string, string>,
    options: MetricQueryOptions = {}
  ): Promise<MetricRecord[]> {
    if (!labelFilters || Object.keys(labelFilters).length === 0) {
      throw new Error('Label filters cannot be empty');
    }

    let query = `
      SELECT name, value, labels, recorded_at as timestamp
      FROM metrics.metric_data
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    // Add label filters
    for (const [key, value] of Object.entries(labelFilters)) {
      params.push(JSON.stringify({ [key]: value }));
      query += ` AND labels @> $${params.length}`;
    }
    
    if (options.start) {
      params.push(options.start);
      query += ` AND recorded_at >= $${params.length}`;
    }
    
    if (options.end) {
      params.push(options.end);
      query += ` AND recorded_at <= $${params.length}`;
    }
    
    query += ` ORDER BY recorded_at DESC`;
    
    const limit = options.limit || 1000;
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    
    const result = await this.db.query(query, params);
    return result.rows.map((row: any) => ({
      name: row.name,
      value: parseFloat(row.value),
      labels: row.labels || {},
      timestamp: row.timestamp
    }));
  }

  /**
   * Get unique metric names
   */
  async getMetricNames(limit: number = 100): Promise<string[]> {
    const query = `
      SELECT DISTINCT name
      FROM metrics.metric_data
      ORDER BY name
      LIMIT $1
    `;
    
    const result = await this.db.query(query, [limit]);
    return result.rows.map(row => row.name);
  }

  /**
   * Get database health and metrics statistics
   */
  async getHealthStats(): Promise<{
    isHealthy: boolean;
    totalMetrics: number;
    recentMetrics: number;
    oldestMetric: Date | null;
    newestMetric: Date | null;
    uniqueMetricNames: number;
  }> {
    try {
      const healthCheck = await this.db.healthCheck();
      
      const statsQuery = `
        SELECT 
          COUNT(*) as total_metrics,
          COUNT(*) FILTER (WHERE recorded_at >= NOW() - INTERVAL '1 hour') as recent_metrics,
          MIN(recorded_at) as oldest_metric,
          MAX(recorded_at) as newest_metric,
          COUNT(DISTINCT name) as unique_metric_names
        FROM metrics.metric_data
      `;
      
      const result = await this.db.query(statsQuery);
      const row = result.rows[0];
      
      return {
        isHealthy: healthCheck,
        totalMetrics: parseInt(row.total_metrics) || 0,
        recentMetrics: parseInt(row.recent_metrics) || 0,
        oldestMetric: row.oldest_metric,
        newestMetric: row.newest_metric,
        uniqueMetricNames: parseInt(row.unique_metric_names) || 0
      };
    } catch (error) {
      console.error('Health stats error:', error);
      return {
        isHealthy: false,
        totalMetrics: 0,
        recentMetrics: 0,
        oldestMetric: null,
        newestMetric: null,
        uniqueMetricNames: 0
      };
    }
  }
}