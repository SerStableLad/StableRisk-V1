import { MetricsService, ApiStats, HealthMetrics } from '../metrics-service';

describe('MetricsService', () => {
  let metricsService: MetricsService;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    metricsService = new MetricsService();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('recordApiCall', () => {
    it('should record successful API calls with correct data', async () => {
      const service = 'coingecko';
      const endpoint = '/api/v3/coins';
      const duration = 150;

      await metricsService.recordApiCall(service, endpoint, duration, true);

      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalErrors).toBe(0);
      expect(stats.endpoints[`${service}/${endpoint}`]).toBeDefined();
      expect(stats.endpoints[`${service}/${endpoint}`].calls).toBe(1);
      expect(stats.endpoints[`${service}/${endpoint}`].avgDuration).toBe(duration);
    });

    it('should record failed API calls correctly', async () => {
      const service = 'coingecko';
      const endpoint = '/api/v3/coins';
      const duration = 200;

      await metricsService.recordApiCall(service, endpoint, duration, false);

      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalErrors).toBe(1);
      expect(stats.endpoints[`${service}/${endpoint}`].errors).toBe(1);
      expect(stats.requestCounts.successRate).toBe(0);
    });

    it('should log API calls with appropriate emoji indicators', async () => {
      await metricsService.recordApiCall('test-service', '/test', 100, true);
      expect(consoleSpy).toHaveBeenCalledWith('API Call: test-service/test took 100ms ✅');

      await metricsService.recordApiCall('test-service', '/test', 100, false);
      expect(consoleSpy).toHaveBeenCalledWith('API Call: test-service/test took 100ms ❌');
    });

    it('should handle multiple API calls and calculate accurate averages', async () => {
      await metricsService.recordApiCall('service1', '/endpoint1', 100, true);
      await metricsService.recordApiCall('service1', '/endpoint1', 200, true);
      await metricsService.recordApiCall('service1', '/endpoint2', 300, true);

      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(3);
      expect(stats.endpoints['service1/endpoint1'].calls).toBe(2);
      expect(stats.endpoints['service1/endpoint1'].avgDuration).toBe(150);
      expect(stats.endpoints['service1/endpoint2'].avgDuration).toBe(300);
    });
  });

  describe('recordApiDuration', () => {
    it('should record API duration using unknown service', async () => {
      await metricsService.recordApiDuration('/test-endpoint', 250);

      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.endpoints['unknown/test-endpoint']).toBeDefined();
      expect(stats.endpoints['unknown/test-endpoint'].avgDuration).toBe(250);
    });
  });

  describe('recordApiError', () => {
    it('should record API errors correctly', async () => {
      const error = new Error('API timeout');
      await metricsService.recordApiError('failing-service', error);

      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.totalErrors).toBe(1);
      expect(stats.endpoints['failing-service/error']).toBeDefined();
      expect(stats.requestCounts.successRate).toBe(0);
    });

    it('should log errors to console', async () => {
      const errorSpy = jest.spyOn(console, 'error');
      const error = new Error('Test error');
      
      await metricsService.recordApiError('test-service', error);
      
      expect(errorSpy).toHaveBeenCalledWith('API Error: test-service', error);
    });
  });

  describe('cache metrics', () => {
    it('should record cache hits and calculate hit ratio', async () => {
      await metricsService.recordCacheHit('test-key-1');
      await metricsService.recordCacheHit('test-key-2');
      await metricsService.recordCacheMiss('test-key-3');

      const cacheStats = metricsService.getCacheStats();
      expect(cacheStats.hits).toBe(2);
      expect(cacheStats.misses).toBe(1);

      const healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.cacheHitRatio).toBeCloseTo(66.67, 1);
    });

    it('should handle zero cache operations', async () => {
      const cacheStats = metricsService.getCacheStats();
      expect(cacheStats.hits).toBe(0);
      expect(cacheStats.misses).toBe(0);

      const healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.cacheHitRatio).toBe(0);
    });

    it('should log cache operations', async () => {
      await metricsService.recordCacheHit('test-key');
      await metricsService.recordCacheMiss('miss-key');

      expect(consoleSpy).toHaveBeenCalledWith('Cache Hit: test-key');
      expect(consoleSpy).toHaveBeenCalledWith('Cache Miss: miss-key');
    });
  });

  describe('cost metrics', () => {
    it('should record cost metrics with timestamp', async () => {
      const operation = 'firecrawl-scrape';
      const cost = 0.025;

      await metricsService.recordCostMetric(operation, cost);

      const costMetrics = metricsService.getCostMetrics();
      expect(costMetrics).toHaveLength(1);
      expect(costMetrics[0].operation).toBe(operation);
      expect(costMetrics[0].cost).toBe(cost);
      expect(costMetrics[0].timestamp).toBeInstanceOf(Date);
    });

    it('should filter cost metrics by time range', async () => {
      await metricsService.recordCostMetric('operation1', 0.01);
      
      // Mock a cost from 48 hours ago
      const oldCost = { operation: 'old-operation', cost: 0.05, timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000) };
      (metricsService as any).costMetrics.push(oldCost);

      const recent = metricsService.getCostMetrics(24);
      const extended = metricsService.getCostMetrics(72);

      expect(recent).toHaveLength(1);
      expect(extended).toHaveLength(2);
    });

    it('should log cost metrics with proper formatting', async () => {
      await metricsService.recordCostMetric('test-operation', 0.1234);
      expect(consoleSpy).toHaveBeenCalledWith('Cost Metric: test-operation cost $0.1234');
    });
  });

  describe('generic metrics recording', () => {
    it('should record metrics with metadata', async () => {
      const service = 'extraction';
      const event = 'document-processed';
      const metadata = { documentType: 'pdf', pages: 10 };

      await metricsService.recordMetric(service, event, metadata);

      const history = metricsService.getMetricHistory(service, event);
      expect(history).toHaveLength(1);
      expect(history[0].metadata).toEqual(metadata);
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('should record metrics without metadata', async () => {
      await metricsService.recordMetric('service', 'event');

      const history = metricsService.getMetricHistory('service', 'event');
      expect(history).toHaveLength(1);
      expect(history[0].metadata).toBeUndefined();
    });

    it('should filter metric history by time range', async () => {
      await metricsService.recordMetric('service', 'event');
      
      // Mock an old metric
      const oldMetric = { timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), metadata: {} };
      (metricsService as any).metrics.set('service:event', [oldMetric]);
      await metricsService.recordMetric('service', 'event');

      const recent = metricsService.getMetricHistory('service', 'event', 24);
      const extended = metricsService.getMetricHistory('service', 'event', 72);

      expect(recent).toHaveLength(1);
      expect(extended).toHaveLength(2);
    });
  });

  describe('getApiStats', () => {
    beforeEach(() => {
      // Reset Date.now to ensure consistent testing
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return stats for last 24 hours only', async () => {
      // Record a call now
      await metricsService.recordApiCall('service1', '/endpoint1', 100, true);
      
      // Advance time by 25 hours
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);
      
      // Record another call
      await metricsService.recordApiCall('service1', '/endpoint2', 200, true);

      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(1); // Only the recent call
      expect(stats.endpoints['service1/endpoint2']).toBeDefined();
      expect(stats.endpoints['service1/endpoint1']).toBeUndefined();
    });

    it('should calculate success rate correctly', async () => {
      await metricsService.recordApiCall('service', '/endpoint', 100, true);
      await metricsService.recordApiCall('service', '/endpoint', 150, true);
      await metricsService.recordApiCall('service', '/endpoint', 200, false);

      const stats = metricsService.getApiStats();
      expect(stats.requestCounts.totalRequests).toBe(3);
      expect(stats.requestCounts.successfulRequests).toBe(2);
      expect(stats.requestCounts.failedRequests).toBe(1);
      expect(stats.requestCounts.successRate).toBeCloseTo(66.67, 1);
    });

    it('should handle empty metrics gracefully', () => {
      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.avgOverallDuration).toBe(0);
      expect(stats.requestCounts.successRate).toBe(100);
    });
  });

  describe('getHealthMetrics', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-01T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should calculate uptime correctly', async () => {
      // Advance time by 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);
      
      const healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.uptime).toBe(300); // 5 minutes in seconds
    });

    it('should determine tier performance targets', async () => {
      // Test tier 1 (< 1s)
      await metricsService.recordApiCall('service', '/fast', 500, true);
      let healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.tierPerformance.tier1WithinTarget).toBe(true);
      expect(healthMetrics.tierPerformance.tier2WithinTarget).toBe(true);
      expect(healthMetrics.tierPerformance.tier3WithinTarget).toBe(true);

      // Reset and test tier 2 (< 3s)
      metricsService.resetMetrics();
      await metricsService.recordApiCall('service', '/medium', 2000, true);
      healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.tierPerformance.tier1WithinTarget).toBe(false);
      expect(healthMetrics.tierPerformance.tier2WithinTarget).toBe(true);
      expect(healthMetrics.tierPerformance.tier3WithinTarget).toBe(true);

      // Reset and test tier 3 (< 10s)
      metricsService.resetMetrics();
      await metricsService.recordApiCall('service', '/slow', 5000, true);
      healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.tierPerformance.tier1WithinTarget).toBe(false);
      expect(healthMetrics.tierPerformance.tier2WithinTarget).toBe(false);
      expect(healthMetrics.tierPerformance.tier3WithinTarget).toBe(true);
    });

    it('should reflect cache performance in health metrics', async () => {
      await metricsService.recordCacheHit('key1');
      await metricsService.recordCacheHit('key2');
      await metricsService.recordCacheMiss('key3');

      const healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.cacheHitRatio).toBeCloseTo(66.67, 1);
    });
  });

  describe('resetMetrics', () => {
    it('should clear all metrics and reset timestamps', async () => {
      // Add some data
      await metricsService.recordApiCall('service', '/endpoint', 100, true);
      await metricsService.recordCacheHit('key');
      await metricsService.recordCostMetric('operation', 0.01);
      await metricsService.recordMetric('service', 'event', { data: 'test' });

      // Reset
      metricsService.resetMetrics();

      // Verify all data is cleared
      const stats = metricsService.getApiStats();
      const cacheStats = metricsService.getCacheStats();
      const costMetrics = metricsService.getCostMetrics();
      const metricHistory = metricsService.getMetricHistory('service', 'event');

      expect(stats.totalCalls).toBe(0);
      expect(cacheStats.hits).toBe(0);
      expect(cacheStats.misses).toBe(0);
      expect(costMetrics).toHaveLength(0);
      expect(metricHistory).toHaveLength(0);

      expect(consoleSpy).toHaveBeenCalledWith('📊 Metrics reset');
    });
  });

  describe('performance validation', () => {
    it('should handle high volume metrics recording efficiently', async () => {
      const startTime = Date.now();
      
      // Record 1000 metrics quickly
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(metricsService.recordApiCall(`service${i % 10}`, `/endpoint${i % 5}`, Math.random() * 1000, true));
      }
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (< 1 second for 1000 records)
      expect(duration).toBeLessThan(1000);
      
      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(1000);
    });

    it('should provide fast access to metrics data', () => {
      // Add some test data
      for (let i = 0; i < 100; i++) {
        (metricsService as any).apiCalls.push({
          service: `service${i % 5}`,
          endpoint: `/endpoint${i % 3}`,
          duration: Math.random() * 1000,
          timestamp: new Date(),
          success: true
        });
      }

      const startTime = Date.now();
      const stats = metricsService.getApiStats();
      const healthMetrics = metricsService.getHealthMetrics();
      const endTime = Date.now();

      // Metrics retrieval should be fast (< 50ms)
      expect(endTime - startTime).toBeLessThan(50);
      expect(stats.totalCalls).toBe(100);
      expect(healthMetrics).toBeDefined();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle undefined/null service names gracefully', async () => {
      await expect(metricsService.recordApiCall('', '/endpoint', 100, true)).resolves.not.toThrow();
      await expect(metricsService.recordMetric('', 'event')).resolves.not.toThrow();
    });

    it('should handle negative durations', async () => {
      await metricsService.recordApiCall('service', '/endpoint', -100, true);
      const stats = metricsService.getApiStats();
      expect(stats.endpoints['service/endpoint'].avgDuration).toBe(-100);
    });

    it('should handle very large cost values', async () => {
      const largeCost = 999999.99;
      await metricsService.recordCostMetric('expensive-operation', largeCost);
      
      const costMetrics = metricsService.getCostMetrics();
      expect(costMetrics[0].cost).toBe(largeCost);
    });

    it('should handle special characters in metric names', async () => {
      const specialService = 'service-with-special@chars#123';
      const specialEvent = 'event/with\\slashes';
      
      await metricsService.recordMetric(specialService, specialEvent, { test: true });
      
      const history = metricsService.getMetricHistory(specialService, specialEvent);
      expect(history).toHaveLength(1);
    });
  });
});