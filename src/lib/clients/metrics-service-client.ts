/**
 * Metrics Service Client
 * 
 * A robust client for communicating with the metrics service.
 * Provides graceful degradation when the service is unavailable.
 */

export interface MetricRecord {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: Date;
}

export interface MetricQueryOptions {
  start?: string;
  end?: string;
  granularity?: string;
  limit?: number;
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

export interface HealthStats {
  isHealthy: boolean;
  totalMetrics: number;
  recentMetrics: number;
  oldestMetric: Date | null;
  newestMetric: Date | null;
  uniqueMetricNames: number;
}

export interface MetricsServiceConfig {
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enableFallback?: boolean;
}

export class MetricsServiceClient {
  private static instance: MetricsServiceClient;
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;
  private enableFallback: boolean;
  private isServiceHealthy: boolean = true;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 60000; // 1 minute

  private constructor(config: MetricsServiceConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.METRICS_SERVICE_URL || 'http://localhost:3001';
    this.timeout = config.timeout || parseInt(process.env.METRICS_SERVICE_TIMEOUT || '5000');
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.enableFallback = config.enableFallback !== false;
  }

  public static getInstance(config?: MetricsServiceConfig): MetricsServiceClient {
    if (!MetricsServiceClient.instance) {
      MetricsServiceClient.instance = new MetricsServiceClient(config);
    }
    return MetricsServiceClient.instance;
  }

  /**
   * Record a single metric
   */
  async recordMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): Promise<void> {
    if (!this.enableFallback || await this.checkServiceHealth()) {
      try {
        await this.makeRequest('POST', '/metrics/record', {
          name,
          value,
          labels,
          timestamp: new Date().toISOString()
        });
        return;
      } catch (error) {
        console.error('Failed to record metric:', error);
        if (!this.enableFallback) {
          throw error;
        }
      }
    }

    // Fallback: log to console if service is unavailable
    if (this.enableFallback) {
      console.log(`[METRIC FALLBACK] ${name}: ${value}`, labels);
    }
  }

  /**
   * Record multiple metrics in a batch
   */
  async recordMetricsBatch(metrics: MetricRecord[]): Promise<void> {
    if (!metrics || metrics.length === 0) {
      return;
    }

    if (!this.enableFallback || await this.checkServiceHealth()) {
      try {
        const metricsWithTimestamp = metrics.map(metric => ({
          ...metric,
          timestamp: metric.timestamp?.toISOString() || new Date().toISOString()
        }));

        await this.makeRequest('POST', '/metrics/batch', {
          metrics: metricsWithTimestamp
        });
        return;
      } catch (error) {
        console.error('Failed to record batch metrics:', error);
        if (!this.enableFallback) {
          throw error;
        }
      }
    }

    // Fallback: log each metric individually
    if (this.enableFallback) {
      metrics.forEach(metric => {
        console.log(`[METRIC BATCH FALLBACK] ${metric.name}: ${metric.value}`, metric.labels);
      });
    }
  }

  /**
   * Get metrics by name
   */
  async getMetrics(
    name: string,
    options: MetricQueryOptions = {}
  ): Promise<MetricRecord[]> {
    try {
      const params = new URLSearchParams();
      if (options.start) params.set('start', options.start);
      if (options.end) params.set('end', options.end);
      if (options.granularity) params.set('granularity', options.granularity);
      if (options.limit) params.set('limit', options.limit.toString());

      const response = await this.makeRequest('GET', `/metrics/${encodeURIComponent(name)}?${params.toString()}`);
      return response.metrics || [];
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      if (!this.enableFallback) {
        throw error;
      }
      return [];
    }
  }

  /**
   * Get aggregated metrics
   */
  async getAggregatedMetrics(
    name: string,
    operation: string = 'avg',
    start?: string,
    end?: string
  ): Promise<AggregatedMetricResult | null> {
    try {
      const params = new URLSearchParams();
      params.set('operation', operation);
      if (start) params.set('start', start);
      if (end) params.set('end', end);

      const response = await this.makeRequest('GET', `/metrics/aggregate/${encodeURIComponent(name)}?${params.toString()}`);
      return response.aggregation;
    } catch (error) {
      console.error('Failed to fetch aggregated metrics:', error);
      if (!this.enableFallback) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Get system summary
   */
  async getSystemSummary(): Promise<SystemSummaryRecord[]> {
    try {
      const response = await this.makeRequest('GET', '/metrics/system/summary');
      return response.summary || [];
    } catch (error) {
      console.error('Failed to fetch system summary:', error);
      if (!this.enableFallback) {
        throw error;
      }
      return [];
    }
  }

  /**
   * Get metrics by labels
   */
  async getMetricsByLabels(
    labels: Record<string, string>,
    options: MetricQueryOptions = {}
  ): Promise<MetricRecord[]> {
    try {
      const response = await this.makeRequest('POST', '/metrics/query/labels', {
        labels,
        ...options
      });
      return response.metrics || [];
    } catch (error) {
      console.error('Failed to query metrics by labels:', error);
      if (!this.enableFallback) {
        throw error;
      }
      return [];
    }
  }

  /**
   * Get available metric names
   */
  async getMetricNames(limit: number = 100): Promise<string[]> {
    try {
      const response = await this.makeRequest('GET', `/metrics/system/names?limit=${limit}`);
      return response.names || [];
    } catch (error) {
      console.error('Failed to fetch metric names:', error);
      if (!this.enableFallback) {
        throw error;
      }
      return [];
    }
  }

  /**
   * Cleanup old metrics
   */
  async cleanupOldMetrics(olderThan: string = '30 days'): Promise<number> {
    try {
      const response = await this.makeRequest('DELETE', `/metrics/cleanup?olderThan=${encodeURIComponent(olderThan)}`);
      return response.deletedCount || 0;
    } catch (error) {
      console.error('Failed to cleanup metrics:', error);
      if (!this.enableFallback) {
        throw error;
      }
      return 0;
    }
  }

  /**
   * Get health statistics
   */
  async getHealthStats(): Promise<HealthStats | null> {
    try {
      const response = await this.makeRequest('GET', '/metrics/system/stats');
      return response.stats;
    } catch (error) {
      console.error('Failed to fetch health stats:', error);
      if (!this.enableFallback) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Check if the metrics service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', '/health/live', undefined, 2000);
      this.isServiceHealthy = response.status === 'alive';
      this.lastHealthCheck = Date.now();
      return this.isServiceHealthy;
    } catch (error) {
      this.isServiceHealthy = false;
      this.lastHealthCheck = Date.now();
      return false;
    }
  }

  /**
   * Get detailed health information
   */
  async getDetailedHealth(): Promise<any> {
    try {
      return await this.makeRequest('GET', '/health/detailed');
    } catch (error) {
      console.error('Failed to fetch detailed health:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Internal method to check service health with caching
   */
  private async checkServiceHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastHealthCheck > this.healthCheckInterval) {
      return await this.healthCheck();
    }
    return this.isServiceHealthy;
  }

  /**
   * Internal method to make HTTP requests with retry logic
   */
  private async makeRequest(
    method: string,
    endpoint: string,
    data?: any,
    timeoutOverride?: number
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeout = timeoutOverride || this.timeout;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const config: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'StableRisk-MetricsClient/1.0.0'
          },
          signal: controller.signal
        };

        if (data) {
          config.body = JSON.stringify(data);
        }

        const response = await fetch(url, config);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Handle empty responses
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        } else {
          return {};
        }

      } catch (error: any) {
        console.warn(`Metrics service request attempt ${attempt}/${this.retryAttempts} failed:`, error.message);

        if (attempt === this.retryAttempts) {
          throw error;
        }

        // Exponential backoff for retries
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('All retry attempts failed');
  }

  /**
   * Update client configuration
   */
  updateConfig(config: Partial<MetricsServiceConfig>): void {
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.timeout) this.timeout = config.timeout;
    if (config.retryAttempts) this.retryAttempts = config.retryAttempts;
    if (config.retryDelay) this.retryDelay = config.retryDelay;
    if (config.enableFallback !== undefined) this.enableFallback = config.enableFallback;
  }

  /**
   * Get current client configuration
   */
  getConfig(): MetricsServiceConfig {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
      enableFallback: this.enableFallback
    };
  }

  /**
   * Get client status
   */
  getStatus(): {
    isHealthy: boolean;
    lastHealthCheck: Date;
    baseUrl: string;
  } {
    return {
      isHealthy: this.isServiceHealthy,
      lastHealthCheck: new Date(this.lastHealthCheck),
      baseUrl: this.baseUrl
    };
  }
}