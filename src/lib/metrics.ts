/**
 * Basic metrics service for tracking API performance and usage
 */

interface PerformanceMetric {
  startTime: number;
  endTime?: number;
  duration?: number;
  success?: boolean;
  tier?: number;
}

class MetricsService {
  private metrics: {
    apiRequests: number;
    apiErrors: number;
    rateLimitExceeded: number;
    cacheHits: number;
    cacheMisses: number;
    performanceMetrics: PerformanceMetric[];
  } = {
    apiRequests: 0,
    apiErrors: 0,
    rateLimitExceeded: 0,
    cacheHits: 0,
    cacheMisses: 0,
    performanceMetrics: []
  };

  recordApiRequest(ticker: string, isStreaming: boolean): void {
    this.metrics.apiRequests++;
    console.log(`📊 API Request: ${ticker} (streaming: ${isStreaming})`);
  }

  recordApiError(errorType: string, tier?: number): void {
    this.metrics.apiErrors++;
    console.log(`❌ API Error: ${errorType}${tier ? ` (tier ${tier})` : ''}`);
  }

  recordRateLimitExceeded(): void {
    this.metrics.rateLimitExceeded++;
    console.log(`🚫 Rate limit exceeded`);
  }

  updateCacheMetrics(hits: number, misses: number): void {
    this.metrics.cacheHits = hits;
    this.metrics.cacheMisses = misses;
  }

  startPerformanceTimer(tier?: number): PerformanceMetric {
    const metric: PerformanceMetric = {
      startTime: performance.now(),
      tier
    };
    this.metrics.performanceMetrics.push(metric);
    return metric;
  }

  endPerformanceTimer(metric: PerformanceMetric, success: boolean, partial?: boolean): void {
    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;
    
    console.log(`⏱️ Performance: ${metric.duration?.toFixed(2)}ms${metric.tier ? ` (tier ${metric.tier})` : ''} - ${success ? 'Success' : 'Failed'}${partial ? ' (partial)' : ''}`);
  }

  recordPartialResponse(tier: number): void {
    console.log(`⚠️ Partial response for tier ${tier}`);
  }

  getMetrics() {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      apiRequests: 0,
      apiErrors: 0,
      rateLimitExceeded: 0,
      cacheHits: 0,
      cacheMisses: 0,
      performanceMetrics: []
    };
  }
}

export const metricsService = new MetricsService();

/**
 * Utility function to measure execution time of async operations
 */
export async function measureExecutionTime<T>(
  operation: () => Promise<T>,
  context?: { name?: string; tier?: number }
): Promise<T> {
  const startTime = performance.now();
  
  try {
    const result = await operation();
    const duration = performance.now() - startTime;
    
    console.log(`⏱️ ${context?.name || 'Operation'}: ${duration.toFixed(2)}ms${context?.tier ? ` (tier ${context.tier})` : ''}`);
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.log(`❌ ${context?.name || 'Operation'} failed: ${duration.toFixed(2)}ms${context?.tier ? ` (tier ${context.tier})` : ''}`);
    throw error;
  }
} 