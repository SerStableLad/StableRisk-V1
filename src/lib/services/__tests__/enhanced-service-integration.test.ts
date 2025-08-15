/**
 * Enhanced Service Integration Tests - Task 8
 * 
 * Comprehensive test suite for the Enhanced Service Integration service
 * following TDD approach with coverage for all requirements.
 */

import { EnhancedServiceIntegration } from '../enhanced-service-integration';
import { ServiceCommunicationClient } from '../../clients/service-communication-client';
import { CacheServiceClient } from '../../clients/cache-service-client';
import { MetricsServiceClient } from '../../clients/metrics-service-client';
import { BackgroundJobsClient } from '../../clients/background-jobs-client';
import { JobPriority } from '../../../../background-jobs-service/src/types';

// Mock the service clients
jest.mock('../../clients/service-communication-client');
jest.mock('../../clients/cache-service-client');
jest.mock('../../clients/metrics-service-client');
jest.mock('../../clients/background-jobs-client');

describe('EnhancedServiceIntegration', () => {
  let enhancedIntegration: EnhancedServiceIntegration;
  let mockServiceComm: jest.Mocked<ServiceCommunicationClient>;
  let mockCacheClient: jest.Mocked<CacheServiceClient>;
  let mockMetricsClient: jest.Mocked<MetricsServiceClient>;
  let mockJobsClient: jest.Mocked<BackgroundJobsClient>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset singleton instance
    EnhancedServiceIntegration.resetInstance();

    // Mock the singleton getInstance methods
    mockServiceComm = {
      checkAllServices: jest.fn(),
      getCircuitBreakerStatus: jest.fn(),
    } as any;

    mockCacheClient = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      getStatus: jest.fn(),
    } as any;

    mockMetricsClient = {
      recordMetric: jest.fn(),
      getStatus: jest.fn(),
    } as any;

    mockJobsClient = {
      submitJob: jest.fn(),
      getStatus: jest.fn(),
    } as any;

    (ServiceCommunicationClient.getInstance as jest.Mock).mockReturnValue(mockServiceComm);
    (CacheServiceClient.getInstance as jest.Mock).mockReturnValue(mockCacheClient);
    (MetricsServiceClient.getInstance as jest.Mock).mockReturnValue(mockMetricsClient);
    (BackgroundJobsClient.getInstance as jest.Mock).mockReturnValue(mockJobsClient);

    // Get fresh instance for each test
    enhancedIntegration = EnhancedServiceIntegration.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should implement singleton pattern correctly', () => {
      const instance1 = EnhancedServiceIntegration.getInstance();
      const instance2 = EnhancedServiceIntegration.getInstance();
      
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(EnhancedServiceIntegration);
    });

    it('should initialize service clients on construction', () => {
      expect(ServiceCommunicationClient.getInstance).toHaveBeenCalled();
      expect(CacheServiceClient.getInstance).toHaveBeenCalled();
      expect(MetricsServiceClient.getInstance).toHaveBeenCalled();
      expect(BackgroundJobsClient.getInstance).toHaveBeenCalled();
    });
  });

  describe('Enhanced Cache Operations', () => {
    describe('getCachedData', () => {
      it('should return cached data when available', async () => {
        const cachedValue = { data: 'test-data' };
        mockCacheClient.get.mockResolvedValue(cachedValue);

        const result = await enhancedIntegration.getCachedData('test-key');

        expect(result).toBe(cachedValue);
        expect(mockCacheClient.get).toHaveBeenCalledWith('test-key');
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.cache.hit',
          1,
          { key: 'test-key' }
        );
      });

      it('should use fallback factory when cache miss occurs', async () => {
        const factoryResult = { data: 'factory-data' };
        const fallbackFactory = jest.fn().mockResolvedValue(factoryResult);
        
        mockCacheClient.get.mockResolvedValue(null);
        mockCacheClient.set.mockResolvedValue(undefined);

        const result = await enhancedIntegration.getCachedData(
          'test-key',
          fallbackFactory,
          3600
        );

        expect(result).toBe(factoryResult);
        expect(fallbackFactory).toHaveBeenCalled();
        expect(mockCacheClient.set).toHaveBeenCalledWith('test-key', factoryResult, 3600);
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.cache.miss',
          1,
          { key: 'test-key' }
        );
      });

      it('should handle cache service failure gracefully', async () => {
        const factoryResult = { data: 'factory-data' };
        const fallbackFactory = jest.fn().mockResolvedValue(factoryResult);
        const cacheError = new Error('Cache service unavailable');
        
        mockCacheClient.get.mockRejectedValue(cacheError);

        const result = await enhancedIntegration.getCachedData(
          'test-key',
          fallbackFactory
        );

        expect(result).toBe(factoryResult);
        expect(fallbackFactory).toHaveBeenCalled();
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.cache.error',
          1,
          { key: 'test-key', error: 'Cache service unavailable' }
        );
      });

      it('should return null when no fallback factory provided and cache misses', async () => {
        mockCacheClient.get.mockResolvedValue(null);

        const result = await enhancedIntegration.getCachedData('test-key');

        expect(result).toBeNull();
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.cache.miss',
          1,
          { key: 'test-key' }
        );
      });

      it('should handle fallback factory errors', async () => {
        const factoryError = new Error('Factory failed');
        const fallbackFactory = jest.fn().mockRejectedValue(factoryError);
        
        mockCacheClient.get.mockResolvedValue(null);

        await expect(
          enhancedIntegration.getCachedData('test-key', fallbackFactory)
        ).rejects.toThrow('Factory failed');

        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.cache.factory_error',
          1,
          { key: 'test-key', error: 'Factory failed' }
        );
      });
    });
  });

  describe('Background Job Management', () => {
    describe('submitJobWithRetry', () => {
      it('should submit job successfully on first attempt', async () => {
        const jobId = 'job-123';
        mockJobsClient.submitJob.mockResolvedValue(jobId);

        const result = await enhancedIntegration.submitJobWithRetry(
          'test-job',
          { data: 'test' },
          { priority: JobPriority.HIGH, delay: 1000, maxAttempts: 3 }
        );

        expect(result).toBe(jobId);
        expect(mockJobsClient.submitJob).toHaveBeenCalledWith(
          'test-job',
          { data: 'test' },
          { priority: JobPriority.HIGH, delay: 1000 }
        );
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.job.submit_success',
          1,
          { type: 'test-job', attempts: '1' }
        );
      });

      it('should retry job submission on failure', async () => {
        const jobId = 'job-123';
        mockJobsClient.submitJob
          .mockRejectedValueOnce(new Error('Service unavailable'))
          .mockRejectedValueOnce(new Error('Service unavailable'))
          .mockResolvedValue(jobId);

        const result = await enhancedIntegration.submitJobWithRetry(
          'test-job',
          { data: 'test' },
          { maxAttempts: 3 }
        );

        expect(result).toBe(jobId);
        expect(mockJobsClient.submitJob).toHaveBeenCalledTimes(3);
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.job.submit_success',
          1,
          { type: 'test-job', attempts: '3' }
        );
      });

      it('should return null after exhausting all retry attempts', async () => {
        mockJobsClient.submitJob.mockRejectedValue(new Error('Service unavailable'));

        const result = await enhancedIntegration.submitJobWithRetry(
          'test-job',
          { data: 'test' },
          { maxAttempts: 2 }
        );

        expect(result).toBeNull();
        expect(mockJobsClient.submitJob).toHaveBeenCalledTimes(2);
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.job.submit_failure',
          1,
          { type: 'test-job', attempts: '2', error: 'Service unavailable' }
        );
      });

      it('should use default options when not provided', async () => {
        const jobId = 'job-123';
        mockJobsClient.submitJob.mockResolvedValue(jobId);

        const result = await enhancedIntegration.submitJobWithRetry(
          'test-job',
          { data: 'test' }
        );

        expect(result).toBe(jobId);
        expect(mockJobsClient.submitJob).toHaveBeenCalledWith(
          'test-job',
          { data: 'test' },
          { priority: JobPriority.MEDIUM }
        );
      });
    });
  });

  describe('Cache Invalidation', () => {
    describe('invalidateRelatedCache', () => {
      it('should invalidate cache using patterns successfully', async () => {
        mockCacheClient.delete.mockResolvedValue(undefined);

        const result = await enhancedIntegration.invalidateRelatedCache({
          patterns: ['user:*', 'session:*']
        });

        expect(result.success).toBe(true);
        expect(result.operations).toHaveLength(2);
        expect(result.errors).toHaveLength(0);
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.cache.bulk_invalidation',
          1,
          { operations: '2', success: '2', errors: '0' }
        );
      });

      it('should invalidate cache using specific tags', async () => {
        mockCacheClient.delete.mockResolvedValue(undefined);

        const result = await enhancedIntegration.invalidateRelatedCache({
          tags: ['user-data', 'session-data']
        });

        expect(result.success).toBe(true);
        expect(result.operations).toHaveLength(2);
        expect(result.errors).toHaveLength(0);
      });

      it('should handle mixed success and failure scenarios', async () => {
        mockCacheClient.delete
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Delete failed'));

        const result = await enhancedIntegration.invalidateRelatedCache({
          patterns: ['pattern1:*', 'pattern2:*']
        });

        expect(result.success).toBe(false);
        expect(result.operations).toHaveLength(2);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toEqual({
          operation: 'pattern2:*',
          error: 'Delete failed'
        });
        expect(mockMetricsClient.recordMetric).toHaveBeenCalledWith(
          'enhanced_service_integration.cache.bulk_invalidation',
          1,
          { operations: '2', success: '1', errors: '1' }
        );
      });

      it('should handle empty patterns and tags gracefully', async () => {
        const result = await enhancedIntegration.invalidateRelatedCache({});

        expect(result.success).toBe(true);
        expect(result.operations).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
      });

      it('should combine patterns and tags', async () => {
        mockCacheClient.delete.mockResolvedValue(undefined);

        const result = await enhancedIntegration.invalidateRelatedCache({
          patterns: ['user:*'],
          tags: ['session-data']
        });

        expect(result.success).toBe(true);
        expect(result.operations).toHaveLength(2);
        expect(mockCacheClient.delete).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Service Status Monitoring', () => {
    describe('getServicesStatus', () => {
      it('should categorize services correctly based on health and circuit breaker status', async () => {
        // Mock service health checks
        mockServiceComm.checkAllServices.mockResolvedValue([
          {
            service: 'cache-service',
            healthy: true,
            responseTime: 100,
            timestamp: new Date()
          },
          {
            service: 'metrics-service',
            healthy: false,
            responseTime: 5000,
            timestamp: new Date(),
            error: 'Timeout'
          },
          {
            service: 'background-jobs-service',
            healthy: true,
            responseTime: 200,
            timestamp: new Date()
          }
        ]);

        // Mock circuit breaker status
        mockServiceComm.getCircuitBreakerStatus.mockReturnValue({
          'cache-service': { state: 'closed', failures: 0, lastFailureTime: null, nextRetryTime: null },
          'metrics-service': { state: 'open', failures: 5, lastFailureTime: Date.now(), nextRetryTime: Date.now() + 30000 },
          'background-jobs-service': { state: 'half-open', failures: 2, lastFailureTime: Date.now() - 10000, nextRetryTime: null }
        });

        // Mock individual service status
        mockCacheClient.getStatus.mockReturnValue({
          isHealthy: true,
          lastHealthCheck: new Date(),
          baseUrl: 'http://localhost:3002',
          localCacheSize: 0
        });

        mockMetricsClient.getStatus.mockReturnValue({
          isHealthy: false,
          lastHealthCheck: new Date(),
          baseUrl: 'http://localhost:3001'
        });

        mockJobsClient.getStatus.mockReturnValue({
          isHealthy: true,
          lastHealthCheck: new Date(),
          baseUrl: 'http://localhost:3003',
          circuitBreakerState: { state: 'half-open', failures: 2 },
          enableFallback: true
        });

        const result = await enhancedIntegration.getServicesStatus();

        expect(result.healthy).toHaveLength(1);
        expect(result.healthy[0]).toEqual(
          expect.objectContaining({
            name: 'cache-service',
            healthy: true,
            circuitBreakerState: 'closed'
          })
        );

        expect(result.degraded).toHaveLength(1);
        expect(result.degraded[0]).toEqual(
          expect.objectContaining({
            name: 'background-jobs-service',
            healthy: true,
            circuitBreakerState: 'half-open'
          })
        );

        expect(result.unhealthy).toHaveLength(1);
        expect(result.unhealthy[0]).toEqual(
          expect.objectContaining({
            name: 'metrics-service',
            healthy: false,
            circuitBreakerState: 'open'
          })
        );
      });

      it('should handle service communication failures gracefully', async () => {
        mockServiceComm.checkAllServices.mockRejectedValue(new Error('Communication failed'));
        mockServiceComm.getCircuitBreakerStatus.mockReturnValue({});

        // Mock individual service status as fallback
        mockCacheClient.getStatus.mockReturnValue({
          isHealthy: true,
          lastHealthCheck: new Date(),
          baseUrl: 'http://localhost:3002',
          localCacheSize: 0
        });

        mockMetricsClient.getStatus.mockReturnValue({
          isHealthy: true,
          lastHealthCheck: new Date(),
          baseUrl: 'http://localhost:3001'
        });

        mockJobsClient.getStatus.mockReturnValue({
          isHealthy: true,
          lastHealthCheck: new Date(),
          baseUrl: 'http://localhost:3003',
          circuitBreakerState: { state: 'closed', failures: 0 },
          enableFallback: true
        });

        const result = await enhancedIntegration.getServicesStatus();

        expect(result.healthy).toHaveLength(3);
        expect(result.degraded).toHaveLength(0);
        expect(result.unhealthy).toHaveLength(0);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle metrics recording failures gracefully', async () => {
      mockMetricsClient.recordMetric.mockRejectedValue(new Error('Metrics service down'));
      mockCacheClient.get.mockResolvedValue({ data: 'test' });

      // Should not throw even if metrics recording fails
      const result = await enhancedIntegration.getCachedData('test-key');
      
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle concurrent cache operations', async () => {
      const factoryResult = { data: 'factory-data' };
      const fallbackFactory = jest.fn().mockResolvedValue(factoryResult);
      
      mockCacheClient.get.mockResolvedValue(null);
      mockCacheClient.set.mockResolvedValue(undefined);

      // Simulate concurrent requests for the same key
      const promises = Array(5).fill(null).map(() =>
        enhancedIntegration.getCachedData('test-key', fallbackFactory, 3600)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBe(factoryResult);
      });
    });

    it('should handle cache invalidation with empty cache', async () => {
      mockCacheClient.delete.mockResolvedValue(undefined);

      const result = await enhancedIntegration.invalidateRelatedCache({
        patterns: ['nonexistent:*']
      });

      expect(result.success).toBe(true);
      expect(result.operations).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Performance and Coordination', () => {
    it('should coordinate operations efficiently across multiple services', async () => {
      const startTime = Date.now();

      // Mock all operations to be fast
      mockCacheClient.get.mockResolvedValue(null);
      const fallbackFactory = jest.fn().mockResolvedValue({ data: 'test' });
      mockCacheClient.set.mockResolvedValue(undefined);
      mockJobsClient.submitJob.mockResolvedValue('job-123');
      mockMetricsClient.recordMetric.mockResolvedValue(undefined);

      // Perform multiple operations
      await Promise.all([
        enhancedIntegration.getCachedData('key1', fallbackFactory),
        enhancedIntegration.getCachedData('key2', fallbackFactory),
        enhancedIntegration.submitJobWithRetry('job1', { data: 'test1' }),
        enhancedIntegration.submitJobWithRetry('job2', { data: 'test2' })
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Operations should complete quickly (within reasonable time)
      expect(duration).toBeLessThan(1000); // 1 second
      expect(fallbackFactory).toHaveBeenCalledTimes(2);
      expect(mockJobsClient.submitJob).toHaveBeenCalledTimes(2);
    });

    it('should handle fire-and-forget operations', async () => {
      mockJobsClient.submitJob.mockResolvedValue('job-123');

      // Submit job without waiting for result
      const promise = enhancedIntegration.submitJobWithRetry('fire-and-forget', { data: 'test' });
      
      // Should not block - this is a fire-and-forget operation
      expect(promise).toBeInstanceOf(Promise);
      
      const result = await promise;
      expect(result).toBe('job-123');
    });
  });
});