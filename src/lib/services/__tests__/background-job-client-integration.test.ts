/**
 * Background Job Service - Client Integration Tests
 * 
 * Tests client integration scenarios:
 * - Background jobs client for main app
 * - Job submission with timeout handling
 * - Status checking and monitoring
 * - Graceful degradation when service unavailable
 * - Connection pooling and retry logic
 * - Circuit breaker implementation
 * - Fallback mechanisms
 * - Real-world integration patterns
 */

import { backgroundJobService, BackgroundJob } from '../background-job-service';
import { performanceHelpers } from './test-setup';

// Background Jobs Client Implementation
interface ClientConfig {
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  circuitBreakerThreshold?: number;
  healthCheckInterval?: number;
}

interface JobSubmissionResult {
  success: boolean;
  jobId?: string;
  error?: string;
  submissionTime?: number;
}

interface JobStatus {
  id: string;
  status: BackgroundJob['status'];
  progress?: number;
  result?: any;
  error?: string;
  estimatedCompletion?: Date;
}

class BackgroundJobsClient {
  private config: Required<ClientConfig>;
  private circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private healthCheckTimer?: NodeJS.Timeout;
  private isServiceHealthy = true;
  
  constructor(config: ClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3001/api/jobs',
      timeout: config.timeout || 5000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      healthCheckInterval: config.healthCheckInterval || 30000
    };
    
    this.startHealthCheck();
  }
  
  /**
   * Submit a job with timeout and retry logic
   */
  async submitJob(
    type: string,
    ticker: string,
    data?: any,
    options?: {
      priority?: 'low' | 'medium' | 'high';
      scheduledAt?: Date;
      timeout?: number;
      skipRetry?: boolean;
    }
  ): Promise<JobSubmissionResult> {
    const startTime = Date.now();
    
    // Check circuit breaker
    if (this.circuitBreakerState === 'OPEN') {
      return {
        success: false,
        error: 'Service temporarily unavailable (circuit breaker open)',
        submissionTime: Date.now() - startTime
      };
    }
    
    const timeout = options?.timeout || this.config.timeout;
    const maxAttempts = options?.skipRetry ? 1 : this.config.retryAttempts;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const jobId = await this.performJobSubmission(type, ticker, data, options, timeout);
        
        // Reset circuit breaker on success
        this.onRequestSuccess();
        
        return {
          success: true,
          jobId,
          submissionTime: Date.now() - startTime
        };
        
      } catch (error) {
        this.onRequestFailure();
        
        if (attempt === maxAttempts) {
          return {
            success: false,
            error: String(error),
            submissionTime: Date.now() - startTime
          };
        }
        
        // Wait before retry
        await performanceHelpers.delay(this.config.retryDelay * attempt);
      }
    }
    
    return {
      success: false,
      error: 'Max retry attempts exceeded',
      submissionTime: Date.now() - startTime
    };
  }
  
  /**
   * Submit multiple jobs in batch
   */
  async submitBatchJobs(
    jobs: Array<{
      type: string;
      ticker: string;
      data?: any;
      priority?: 'low' | 'medium' | 'high';
    }>,
    options?: {
      timeout?: number;
      maxConcurrency?: number;
    }
  ): Promise<{
    success: boolean;
    results: JobSubmissionResult[];
    totalTime: number;
  }> {
    const startTime = Date.now();
    const maxConcurrency = options?.maxConcurrency || 5;
    
    // Process jobs in batches to avoid overwhelming the service
    const results: JobSubmissionResult[] = [];
    const jobChunks = this.chunkArray(jobs, maxConcurrency);
    
    for (const chunk of jobChunks) {
      const chunkPromises = chunk.map(job =>
        this.submitJob(job.type, job.ticker, job.data, {
          priority: job.priority,
          timeout: options?.timeout
        })
      );
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      chunkResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            error: String(result.reason)
          });
        }
      });
    }
    
    const successCount = results.filter(r => r.success).length;
    
    return {
      success: successCount > 0,
      results,
      totalTime: Date.now() - startTime
    };
  }
  
  /**
   * Get job status with timeout
   */
  async getJobStatus(
    jobId: string,
    options?: { timeout?: number }
  ): Promise<JobStatus | null> {
    try {
      const timeout = options?.timeout || this.config.timeout;
      const job = await this.performStatusCheck(jobId, timeout);
      
      this.onRequestSuccess();
      
      return {
        id: job.id,
        status: job.status,
        progress: this.calculateProgress(job),
        result: job.result,
        error: job.lastError,
        estimatedCompletion: this.estimateCompletion(job)
      };
      
    } catch (error) {
      this.onRequestFailure();
      return null;
    }
  }
  
  /**
   * Monitor job until completion
   */
  async monitorJob(
    jobId: string,
    options?: {
      timeout?: number;
      pollInterval?: number;
      onProgress?: (status: JobStatus) => void;
    }
  ): Promise<JobStatus | null> {
    const timeout = options?.timeout || 60000; // 1 minute default
    const pollInterval = options?.pollInterval || 1000; // 1 second default
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const status = await this.getJobStatus(jobId);
      
      if (!status) {
        await performanceHelpers.delay(pollInterval);
        continue;
      }
      
      if (options?.onProgress) {
        options.onProgress(status);
      }
      
      // Check if job is completed
      if (['completed', 'failed', 'cancelled'].includes(status.status)) {
        return status;
      }
      
      await performanceHelpers.delay(pollInterval);
    }
    
    // Timeout reached
    throw new Error(`Job monitoring timeout after ${timeout}ms`);
  }
  
  /**
   * Check service health
   */
  async checkHealth(options?: { timeout?: number }): Promise<{
    healthy: boolean;
    responseTime: number;
    details?: any;
  }> {
    const startTime = Date.now();
    
    try {
      const timeout = options?.timeout || 3000;
      const healthData = await this.performHealthCheck(timeout);
      
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: true,
        responseTime,
        details: healthData
      };
      
    } catch (error) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        details: { error: String(error) }
      };
    }
  }
  
  /**
   * Get graceful fallback when service is unavailable
   */
  async submitJobWithFallback(
    type: string,
    ticker: string,
    data?: any,
    fallbackFn?: () => Promise<any>
  ): Promise<{
    success: boolean;
    source: 'service' | 'fallback' | 'error';
    result?: any;
    error?: string;
  }> {
    // Try service first
    const serviceResult = await this.submitJob(type, ticker, data);
    
    if (serviceResult.success) {
      return {
        success: true,
        source: 'service',
        result: { jobId: serviceResult.jobId }
      };
    }
    
    // Service failed, try fallback
    if (fallbackFn) {
      try {
        const fallbackResult = await fallbackFn();
        return {
          success: true,
          source: 'fallback',
          result: fallbackResult
        };
      } catch (error) {
        return {
          success: false,
          source: 'error',
          error: `Both service and fallback failed: ${String(error)}`
        };
      }
    }
    
    return {
      success: false,
      source: 'error',
      error: serviceResult.error
    };
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
  
  // Private methods
  
  private async performJobSubmission(
    type: string,
    ticker: string,
    data?: any,
    options?: any,
    timeout?: number
  ): Promise<string> {
    // Simulate API call to background jobs service
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeout);
      
      // Use actual service for testing
      try {
        const jobId = backgroundJobService.addJob(type, ticker, data, options?.priority, options?.scheduledAt);
        clearTimeout(timer);
        resolve(jobId);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  
  private async performStatusCheck(jobId: string, timeout: number): Promise<BackgroundJob> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Status check timeout'));
      }, timeout);
      
      try {
        const job = backgroundJobService.getJob(jobId);
        clearTimeout(timer);
        
        if (!job) {
          reject(new Error('Job not found'));
        } else {
          resolve(job);
        }
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  
  private async performHealthCheck(timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Health check timeout'));
      }, timeout);
      
      try {
        const stats = backgroundJobService.getQueueStats();
        clearTimeout(timer);
        resolve({
          status: 'healthy',
          queueStats: stats,
          timestamp: new Date()
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  
  private calculateProgress(job: BackgroundJob): number {
    switch (job.status) {
      case 'pending': return 0;
      case 'running': return 50;
      case 'completed': return 100;
      case 'failed':
      case 'cancelled': return job.attempts > 0 ? 25 : 0;
      case 'retrying': return Math.min(90, (job.attempts / job.maxAttempts) * 100);
      default: return 0;
    }
  }
  
  private estimateCompletion(job: BackgroundJob): Date | undefined {
    if (job.status === 'completed') return job.completedAt || undefined;
    if (job.status === 'failed' || job.status === 'cancelled') return undefined;
    
    // Simple estimation based on average processing time
    const avgProcessingTime = 30000; // 30 seconds default
    return new Date(Date.now() + avgProcessingTime);
  }
  
  private onRequestSuccess(): void {
    this.failureCount = 0;
    
    if (this.circuitBreakerState === 'HALF_OPEN') {
      this.circuitBreakerState = 'CLOSED';
    }
  }
  
  private onRequestFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.config.circuitBreakerThreshold) {
      this.circuitBreakerState = 'OPEN';
      
      // Try half-open after a delay
      setTimeout(() => {
        if (this.circuitBreakerState === 'OPEN') {
          this.circuitBreakerState = 'HALF_OPEN';
        }
      }, 30000); // 30 seconds
    }
  }
  
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      const health = await this.checkHealth({ timeout: 3000 });
      this.isServiceHealthy = health.healthy;
    }, this.config.healthCheckInterval);
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

describe('Background Jobs Client Integration', () => {
  let client: BackgroundJobsClient;
  let service: any;

  beforeEach(() => {
    service = backgroundJobService;
    service.stopProcessing();
    
    client = new BackgroundJobsClient({
      timeout: 5000,
      retryAttempts: 3,
      retryDelay: 100
    });
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    client.dispose();
    service.stopProcessing();
  });

  describe('Basic Job Submission', () => {
    test('should submit job successfully', async () => {
      const result = await client.submitJob('test_job', 'USDC', { test: 'data' });
      
      expect(result.success).toBe(true);
      expect(result.jobId).toBeDefined();
      expect(result.submissionTime).toBeLessThan(1000);
      
      // Verify job was created in service
      const job = service.getJob(result.jobId);
      expect(job).toBeDefined();
      expect(job.type).toBe('test_job');
      expect(job.ticker).toBe('USDC');
    });

    test('should handle job submission with options', async () => {
      const futureTime = new Date(Date.now() + 3600000);
      
      const result = await client.submitJob(
        'scheduled_job',
        'USDT',
        { scheduled: true },
        {
          priority: 'high',
          scheduledAt: futureTime,
          timeout: 2000
        }
      );
      
      expect(result.success).toBe(true);
      
      const job = service.getJob(result.jobId!);
      expect(job.priority).toBe('high');
      expect(job.scheduledAt).toEqual(futureTime);
    });

    test('should handle submission timeout', async () => {
      // Mock slow service response
      const originalAddJob = service.addJob;
      service.addJob = jest.fn().mockImplementation(async () => {
        await performanceHelpers.delay(3000); // 3 second delay
        return originalAddJob.apply(service, arguments);
      });
      
      const result = await client.submitJob('timeout_test', 'USDC', {}, {
        timeout: 1000 // 1 second timeout
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      
      service.addJob = originalAddJob;
    });

    test('should retry on failure', async () => {
      let attemptCount = 0;
      const originalAddJob = service.addJob;
      
      service.addJob = jest.fn().mockImplementation((...args) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary service error');
        }
        return originalAddJob.apply(service, args);
      });
      
      const result = await client.submitJob('retry_test', 'USDC');
      
      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
      expect(service.addJob).toHaveBeenCalledTimes(3);
      
      service.addJob = originalAddJob;
    });
  });

  describe('Batch Job Submission', () => {
    test('should submit multiple jobs in batch', async () => {
      const jobs = [
        { type: 'batch_test_1', ticker: 'USDC' },
        { type: 'batch_test_2', ticker: 'USDT' },
        { type: 'batch_test_3', ticker: 'PYUSD' }
      ];
      
      const result = await client.submitBatchJobs(jobs);
      
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results.every(r => r.success)).toBe(true);
      expect(result.totalTime).toBeLessThan(2000);
      
      // Verify all jobs were created
      result.results.forEach((jobResult, index) => {
        const job = service.getJob(jobResult.jobId!);
        expect(job).toBeDefined();
        expect(job.type).toBe(jobs[index].type);
      });
    });

    test('should handle mixed success/failure in batch', async () => {
      let callCount = 0;
      const originalAddJob = service.addJob;
      
      service.addJob = jest.fn().mockImplementation((...args) => {
        callCount++;
        if (callCount === 2) { // Second job fails
          throw new Error('Service error for job 2');
        }
        return originalAddJob.apply(service, args);
      });
      
      const jobs = [
        { type: 'batch_mixed_1', ticker: 'USDC' },
        { type: 'batch_mixed_2', ticker: 'USDT' },
        { type: 'batch_mixed_3', ticker: 'PYUSD' }
      ];
      
      const result = await client.submitBatchJobs(jobs);
      
      expect(result.success).toBe(true); // At least one succeeded
      expect(result.results).toHaveLength(3);
      
      const successCount = result.results.filter(r => r.success).length;
      const failureCount = result.results.filter(r => !r.success).length;
      
      expect(successCount).toBe(2);
      expect(failureCount).toBe(1);
      
      service.addJob = originalAddJob;
    });

    test('should respect concurrency limits', async () => {
      const jobs = Array.from({ length: 20 }, (_, i) => ({
        type: 'concurrency_test',
        ticker: `TICKER_${i}`
      }));
      
      let maxConcurrent = 0;
      let currentConcurrent = 0;
      
      const originalAddJob = service.addJob;
      service.addJob = jest.fn().mockImplementation(async (...args) => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        
        await performanceHelpers.delay(100); // Simulate processing time
        
        currentConcurrent--;
        return originalAddJob.apply(service, args);
      });
      
      const result = await client.submitBatchJobs(jobs, {
        maxConcurrency: 5
      });
      
      expect(result.success).toBe(true);
      expect(maxConcurrent).toBeLessThanOrEqual(5);
      
      service.addJob = originalAddJob;
    });
  });

  describe('Job Status and Monitoring', () => {
    test('should get job status', async () => {
      const submitResult = await client.submitJob('status_test', 'USDC');
      expect(submitResult.success).toBe(true);
      
      const status = await client.getJobStatus(submitResult.jobId!);
      
      expect(status).toBeDefined();
      expect(status!.id).toBe(submitResult.jobId);
      expect(status!.status).toBe('pending');
      expect(status!.progress).toBe(0);
    });

    test('should monitor job until completion', async () => {
      const submitResult = await client.submitJob('monitor_test', 'USDC');
      const jobId = submitResult.jobId!;
      
      // Simulate job progression
      setTimeout(async () => {
        const job = service.getJob(jobId);
        job.status = 'running';
        job.startedAt = new Date();
      }, 100);
      
      setTimeout(async () => {
        const job = service.getJob(jobId);
        job.status = 'completed';
        job.completedAt = new Date();
        job.result = { success: true };
      }, 200);
      
      const progressUpdates: JobStatus[] = [];
      
      const finalStatus = await client.monitorJob(jobId, {
        timeout: 5000,
        pollInterval: 50,
        onProgress: (status) => {
          progressUpdates.push({ ...status });
        }
      });
      
      expect(finalStatus).toBeDefined();
      expect(finalStatus!.status).toBe('completed');
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Should have captured status progression
      const statuses = progressUpdates.map(p => p.status);
      expect(statuses).toContain('pending');
    });

    test('should handle monitoring timeout', async () => {
      const submitResult = await client.submitJob('timeout_monitor_test', 'USDC');
      
      // Job will never complete
      
      await expect(
        client.monitorJob(submitResult.jobId!, {
          timeout: 1000, // 1 second timeout
          pollInterval: 100
        })
      ).rejects.toThrow('Job monitoring timeout');
    });

    test('should handle status check failures', async () => {
      const status = await client.getJobStatus('nonexistent_job');
      expect(status).toBeNull();
    });
  });

  describe('Service Health and Circuit Breaker', () => {
    test('should check service health', async () => {
      const health = await client.checkHealth();
      
      expect(health.healthy).toBe(true);
      expect(health.responseTime).toBeLessThan(1000);
      expect(health.details).toBeDefined();
      expect(health.details.status).toBe('healthy');
    });

    test('should handle unhealthy service', async () => {
      // Mock service error
      const originalGetQueueStats = service.getQueueStats;
      service.getQueueStats = jest.fn().mockImplementation(() => {
        throw new Error('Service unavailable');
      });
      
      const health = await client.checkHealth();
      
      expect(health.healthy).toBe(false);
      expect(health.details.error).toContain('Service unavailable');
      
      service.getQueueStats = originalGetQueueStats;
    });

    test('should implement circuit breaker', async () => {
      const clientWithLowThreshold = new BackgroundJobsClient({
        circuitBreakerThreshold: 2,
        retryAttempts: 1
      });
      
      // Mock service to always fail
      const originalAddJob = service.addJob;
      service.addJob = jest.fn().mockImplementation(() => {
        throw new Error('Service always fails');
      });
      
      try {
        // First few requests should fail normally
        const result1 = await clientWithLowThreshold.submitJob('circuit_test_1', 'USDC');
        expect(result1.success).toBe(false);
        
        const result2 = await clientWithLowThreshold.submitJob('circuit_test_2', 'USDC');
        expect(result2.success).toBe(false);
        
        // Circuit should now be open
        const result3 = await clientWithLowThreshold.submitJob('circuit_test_3', 'USDC');
        expect(result3.success).toBe(false);
        expect(result3.error).toContain('circuit breaker open');
        
      } finally {
        clientWithLowThreshold.dispose();
        service.addJob = originalAddJob;
      }
    });
  });

  describe('Graceful Degradation', () => {
    test('should use fallback when service unavailable', async () => {
      // Mock service failure
      const originalAddJob = service.addJob;
      service.addJob = jest.fn().mockImplementation(() => {
        throw new Error('Service completely unavailable');
      });
      
      const fallbackResult = { processed: true, source: 'local' };
      
      const result = await client.submitJobWithFallback(
        'fallback_test',
        'USDC',
        { test: 'data' },
        async () => fallbackResult
      );
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('fallback');
      expect(result.result).toEqual(fallbackResult);
      
      service.addJob = originalAddJob;
    });

    test('should prefer service over fallback', async () => {
      const fallbackFn = jest.fn().mockResolvedValue({ fallback: true });
      
      const result = await client.submitJobWithFallback(
        'service_preferred_test',
        'USDC',
        {},
        fallbackFn
      );
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('service');
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    test('should handle both service and fallback failure', async () => {
      const originalAddJob = service.addJob;
      service.addJob = jest.fn().mockImplementation(() => {
        throw new Error('Service failed');
      });
      
      const result = await client.submitJobWithFallback(
        'both_fail_test',
        'USDC',
        {},
        async () => {
          throw new Error('Fallback also failed');
        }
      );
      
      expect(result.success).toBe(false);
      expect(result.source).toBe('error');
      expect(result.error).toContain('Both service and fallback failed');
      
      service.addJob = originalAddJob;
    });
  });

  describe('Real-World Integration Patterns', () => {
    test('should handle high-frequency client requests', async () => {
      const requestCount = 50;
      const concurrentRequests = 10;
      
      const requestPromises = [];
      
      for (let batch = 0; batch < requestCount / concurrentRequests; batch++) {
        const batchPromises = [];
        
        for (let i = 0; i < concurrentRequests; i++) {
          const requestIndex = batch * concurrentRequests + i;
          batchPromises.push(
            client.submitJob('high_freq_test', `TICKER_${requestIndex}`, {
              batchIndex: batch,
              requestIndex: requestIndex
            })
          );
        }
        
        requestPromises.push(Promise.all(batchPromises));
        
        // Small delay between batches
        if (batch < requestCount / concurrentRequests - 1) {
          await performanceHelpers.delay(10);
        }
      }
      
      const allResults = await Promise.all(requestPromises);
      const flatResults = allResults.flat();
      
      expect(flatResults).toHaveLength(requestCount);
      
      const successCount = flatResults.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(requestCount * 0.95); // At least 95% success
      
      // Verify reasonable response times
      const avgResponseTime = flatResults.reduce((sum, r) => sum + (r.submissionTime || 0), 0) / flatResults.length;
      expect(avgResponseTime).toBeLessThan(1000); // Under 1 second average
    });

    test('should handle client connection pooling simulation', async () => {
      const clientPool = Array.from({ length: 5 }, () => 
        new BackgroundJobsClient({
          timeout: 2000,
          retryAttempts: 2
        })
      );
      
      try {
        // Simulate multiple clients submitting jobs concurrently
        const clientPromises = clientPool.map(async (poolClient, clientIndex) => {
          const results = [];
          
          for (let i = 0; i < 10; i++) {
            const result = await poolClient.submitJob(
              'pool_test',
              `CLIENT_${clientIndex}_JOB_${i}`,
              { clientIndex, jobIndex: i }
            );
            results.push(result);
          }
          
          return results;
        });
        
        const allClientResults = await Promise.all(clientPromises);
        const flatResults = allClientResults.flat();
        
        expect(flatResults).toHaveLength(50); // 5 clients * 10 jobs each
        
        const successCount = flatResults.filter(r => r.success).length;
        expect(successCount).toBe(50); // All should succeed
        
        // Verify jobs from different clients were processed
        const uniqueClients = new Set(
          flatResults
            .filter(r => r.jobId)
            .map(r => service.getJob(r.jobId!)?.ticker.split('_')[1])
        );
        expect(uniqueClients.size).toBe(5);
        
      } finally {
        clientPool.forEach(poolClient => poolClient.dispose());
      }
    });

    test('should handle intermittent service failures', async () => {
      let requestCount = 0;
      const originalAddJob = service.addJob;
      
      // Mock intermittent failures (every 3rd request fails)
      service.addJob = jest.fn().mockImplementation((...args) => {
        requestCount++;
        if (requestCount % 3 === 0) {
          throw new Error('Intermittent service failure');
        }
        return originalAddJob.apply(service, args);
      });
      
      const results = [];
      
      // Submit jobs over time to test resilience
      for (let i = 0; i < 20; i++) {
        const result = await client.submitJob('intermittent_test', `TICKER_${i}`);
        results.push(result);
        
        await performanceHelpers.delay(50); // Small delay between requests
      }
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      // Most requests should succeed due to retry logic
      expect(successCount).toBeGreaterThan(15);
      expect(failureCount).toBeLessThan(5);
      
      service.addJob = originalAddJob;
    });

    test('should cleanup resources properly', async () => {
      const testClient = new BackgroundJobsClient({
        healthCheckInterval: 100 // Very frequent for testing
      });
      
      // Submit a job to verify client works
      const result = await testClient.submitJob('cleanup_test', 'USDC');
      expect(result.success).toBe(true);
      
      // Dispose should cleanup timers and resources
      expect(() => {
        testClient.dispose();
      }).not.toThrow();
      
      // Client should still be usable after disposal (but without health checks)
      const postDisposeResult = await testClient.submitJob('post_dispose_test', 'USDT');
      expect(postDisposeResult.success).toBe(true);
    });
  });
});