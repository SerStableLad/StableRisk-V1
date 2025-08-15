/**
 * Background Job Service - Comprehensive Test Suite
 * 
 * Tests cover:
 * - Unit tests for job queue management
 * - Job processing and retry logic  
 * - Priority handling and scheduling
 * - Performance requirements (100+ jobs/min)
 * - Error handling and edge cases
 * - Integration with cost control and monitoring
 */

import { backgroundJobService, BackgroundJob, JobExecutionContext } from '../background-job-service';
import { costControlService } from '../cost-control-service';
import { performanceMonitoringService } from '../performance-monitoring-service';
import { firecrawlMcpService } from '../firecrawl-mcp-service';

// Mock dependencies
jest.mock('../cost-control-service');
jest.mock('../performance-monitoring-service');  
jest.mock('../firecrawl-mcp-service');

// Mock timers for testing
jest.useFakeTimers();

describe('BackgroundJobService', () => {
  let service: any;

  beforeEach(() => {
    // Create fresh service instance for each test
    service = new (backgroundJobService.constructor as any)();
    service.stopProcessing();
    
    // Reset all mocks
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Setup default mock responses
    (costControlService.canProceedWithCost as jest.Mock).mockReturnValue({
      allowed: true,
      reason: null
    });
    
    (firecrawlMcpService.extractTransparencyData as jest.Mock).mockResolvedValue({
      confidence_score: 0.8,
      collateral_allocations: [
        { asset: 'USDC', percentage: 50 },
        { asset: 'USDT', percentage: 30 },
        { asset: 'Treasury Bills', percentage: 20 }
      ]
    });
  });

  afterEach(() => {
    service?.stopProcessing();
    jest.clearAllTimers();
  });

  describe('Job Creation and Management', () => {
    test('should create job with correct properties', () => {
      const jobId = service.addJob('test_job', 'USDC', { test: 'data' }, 'high');
      
      expect(jobId).toMatch(/test_job_USDC_\d+/);
      
      const job = service.getJob(jobId);
      expect(job).toBeDefined();
      expect(job.type).toBe('test_job');
      expect(job.ticker).toBe('USDC');
      expect(job.status).toBe('pending');
      expect(job.priority).toBe('high');
      expect(job.data).toEqual({ test: 'data' });
      expect(job.attempts).toBe(0);
      expect(job.maxAttempts).toBe(5); // Default max attempts
    });

    test('should create Firecrawl extraction job with correct configuration', () => {
      const jobId = service.addFirecrawlExtractionJob('PYUSD', {
        url: 'https://example.com/transparency',
        schema: { type: 'collateral' },
        urgent: true
      });
      
      const job = service.getJob(jobId);
      expect(job.type).toBe('firecrawl_collateral_extraction');
      expect(job.priority).toBe('high'); // Urgent = high priority
      expect(job.maxAttempts).toBe(3); // Firecrawl specific retry limit
      expect(job.data.url).toBe('https://example.com/transparency');
    });

    test('should handle non-urgent Firecrawl jobs with medium priority', () => {
      const jobId = service.addFirecrawlExtractionJob('USDT', {
        url: 'https://example.com/data',
        urgent: false
      });
      
      const job = service.getJob(jobId);
      expect(job.priority).toBe('medium');
    });

    test('should support scheduled jobs', () => {
      const futureTime = new Date(Date.now() + 60000); // 1 minute from now
      const jobId = service.addJob('scheduled_job', 'USDC', {}, 'medium', futureTime);
      
      const job = service.getJob(jobId);
      expect(job.scheduledAt).toEqual(futureTime);
    });
  });

  describe('Job Retrieval and Filtering', () => {
    beforeEach(() => {
      // Create test jobs with different statuses and types
      service.addJob('type_a', 'USDC', {}, 'high');
      service.addJob('type_b', 'USDT', {}, 'medium');
      service.addJob('type_a', 'PYUSD', {}, 'low');
    });

    test('should retrieve jobs by status', () => {
      const pendingJobs = service.getJobsByStatus('pending');
      expect(pendingJobs).toHaveLength(3);
      expect(pendingJobs.every(job => job.status === 'pending')).toBe(true);
    });

    test('should retrieve jobs by type', () => {
      const typeAJobs = service.getJobsByType('type_a');
      expect(typeAJobs).toHaveLength(2);
      expect(typeAJobs.every(job => job.type === 'type_a')).toBe(true);
    });

    test('should retrieve jobs by ticker', () => {
      const usdcJobs = service.getJobsForTicker('USDC');
      expect(usdcJobs).toHaveLength(1);
      expect(usdcJobs[0].ticker).toBe('USDC');
    });

    test('should check for active jobs of specific type', () => {
      expect(service.hasActiveJobOfType('USDC', 'type_a')).toBe(true);
      expect(service.hasActiveJobOfType('USDC', 'nonexistent')).toBe(false);
    });
  });

  describe('Priority Queue Management', () => {
    test('should process high priority jobs first', () => {
      const lowJobId = service.addJob('low_job', 'USDC', {}, 'low');
      const mediumJobId = service.addJob('medium_job', 'USDT', {}, 'medium'); 
      const highJobId = service.addJob('high_job', 'PYUSD', {}, 'high');
      
      // Mock job execution to track order
      const executionOrder: string[] = [];
      const originalExecuteJobByType = service.executeJobByType.bind(service);
      service.executeJobByType = jest.fn().mockImplementation((context) => {
        executionOrder.push(context.job.id);
        return Promise.resolve('mocked result');
      });
      
      service.restartProcessing();
      
      // Fast-forward timers to trigger job processing
      jest.advanceTimersByTime(5000);
      
      expect(executionOrder).toEqual([highJobId, mediumJobId, lowJobId]);
    });

    test('should respect FIFO order within same priority', () => {
      const firstMedium = service.addJob('first', 'USDC', {}, 'medium');
      // Small delay to ensure different timestamps
      jest.advanceTimersByTime(10);
      const secondMedium = service.addJob('second', 'USDT', {}, 'medium');
      
      const nextJob = service.getNextJobToProcess();
      expect(nextJob?.id).toBe(firstMedium);
    });

    test('should not process jobs scheduled for future', () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      service.addJob('future_job', 'USDC', {}, 'high', futureTime);
      
      const nextJob = service.getNextJobToProcess();
      expect(nextJob).toBeNull();
    });
  });

  describe('Job Execution and Processing', () => {
    test('should execute Firecrawl extraction job successfully', async () => {
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://centre.io/transparency',
        schema: { type: 'collateral' }
      });
      
      const job = service.getJob(jobId);
      const context: JobExecutionContext = {
        job,
        attempt: 1,
        isLastAttempt: false
      };
      
      await service.executeJob(job);
      
      expect(costControlService.canProceedWithCost).toHaveBeenCalledWith(
        0.05, 'firecrawl_mcp', 'collateral_extraction'
      );
      expect(firecrawlMcpService.extractTransparencyData).toHaveBeenCalledWith(
        'https://centre.io/transparency', 'USDC', { type: 'collateral' }
      );
      
      const updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('completed');
      expect(updatedJob.result).toBeDefined();
      expect(updatedJob.processingTimeMs).toBeGreaterThan(0);
    });

    test('should handle budget constraints', async () => {
      (costControlService.canProceedWithCost as jest.Mock).mockReturnValue({
        allowed: false,
        reason: 'Daily budget exceeded'
      });
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://example.com'
      });
      
      const job = service.getJob(jobId);
      await service.executeJob(job);
      
      const updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('retrying');
      expect(updatedJob.lastError).toContain('Budget constraint');
    });

    test('should handle Firecrawl service failures', async () => {
      (firecrawlMcpService.extractTransparencyData as jest.Mock)
        .mockRejectedValue(new Error('Network timeout'));
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://example.com'
      });
      
      const job = service.getJob(jobId);
      await service.executeJob(job);
      
      const updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('retrying');
      expect(updatedJob.lastError).toBe('Error: Network timeout');
    });

    test('should throw error for unknown job types', async () => {
      const jobId = service.addJob('unknown_type', 'USDC');
      const job = service.getJob(jobId);
      
      await expect(service.executeJob(job)).rejects.toThrow('Unknown job type: unknown_type');
    });
  });

  describe('Retry Logic and Exponential Backoff', () => {
    test('should retry failed jobs with exponential backoff', async () => {
      (firecrawlMcpService.extractTransparencyData as jest.Mock)
        .mockRejectedValue(new Error('Temporary failure'));
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://example.com'
      });
      
      const job = service.getJob(jobId);
      const initialTime = Date.now();
      
      // First execution - should fail and schedule retry
      await service.executeJob(job);
      
      let updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('retrying');
      expect(updatedJob.attempts).toBe(1);
      expect(updatedJob.scheduledAt.getTime()).toBeGreaterThan(initialTime + 1000); // At least 1s delay
      
      // Simulate time passing and retry
      jest.advanceTimersByTime(2000);
      await service.executeJob(updatedJob);
      
      updatedJob = service.getJob(jobId);
      expect(updatedJob.attempts).toBe(2);
      expect(updatedJob.scheduledAt.getTime()).toBeGreaterThan(initialTime + 2000); // At least 2s delay
    });

    test('should mark job as failed after max attempts', async () => {
      (firecrawlMcpService.extractTransparencyData as jest.Mock)
        .mockRejectedValue(new Error('Persistent failure'));
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://example.com'
      });
      
      const job = service.getJob(jobId);
      job.maxAttempts = 2; // Reduce for faster testing
      
      // Execute until failure
      await service.executeJob(job);
      await service.executeJob(service.getJob(jobId));
      
      const failedJob = service.getJob(jobId);
      expect(failedJob.status).toBe('failed');
      expect(failedJob.attempts).toBe(2);
      expect(failedJob.completedAt).toBeDefined();
    });

    test('should record metrics for failed jobs', async () => {
      (firecrawlMcpService.extractTransparencyData as jest.Mock)
        .mockRejectedValue(new Error('Test failure'));
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://example.com'
      });
      
      const job = service.getJob(jobId);
      job.maxAttempts = 1; // Fail immediately
      
      await service.executeJob(job);
      
      expect(performanceMonitoringService.recordExtractionMetric)
        .toHaveBeenCalledWith(expect.objectContaining({
          method: 'firecrawl',
          symbol: 'USDC',
          success: false,
          errors: expect.arrayContaining(['Error: Test failure'])
        }));
    });
  });

  describe('Job Cancellation and Cleanup', () => {
    test('should cancel pending jobs', () => {
      const jobId = service.addJob('test_job', 'USDC');
      
      const cancelled = service.cancelJob(jobId);
      expect(cancelled).toBe(true);
      
      const job = service.getJob(jobId);
      expect(job.status).toBe('cancelled');
      expect(job.completedAt).toBeDefined();
    });

    test('should not cancel running jobs', () => {
      const jobId = service.addJob('test_job', 'USDC');
      const job = service.getJob(jobId);
      job.status = 'running';
      
      const cancelled = service.cancelJob(jobId);
      expect(cancelled).toBe(false);
      expect(job.status).toBe('running');
    });

    test('should clean up old completed jobs', () => {
      // Create old jobs (simulate by modifying timestamps)
      const oldJobId = service.addJob('old_job', 'USDC');
      const recentJobId = service.addJob('recent_job', 'USDT');
      
      const oldJob = service.getJob(oldJobId);
      const recentJob = service.getJob(recentJobId);
      
      oldJob.status = 'completed';
      oldJob.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      
      recentJob.status = 'completed';
      recentJob.createdAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      
      const cleared = service.clearOldJobs(24); // Clear jobs older than 24 hours
      
      expect(cleared).toBe(1);
      expect(service.getJob(oldJobId)).toBeNull();
      expect(service.getJob(recentJobId)).toBeDefined();
    });

    test('should not clean up active jobs regardless of age', () => {
      const jobId = service.addJob('active_job', 'USDC');
      const job = service.getJob(jobId);
      
      job.status = 'running';
      job.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      
      const cleared = service.clearOldJobs(24);
      
      expect(cleared).toBe(0);
      expect(service.getJob(jobId)).toBeDefined();
    });
  });

  describe('Queue Statistics and Monitoring', () => {
    beforeEach(() => {
      // Create jobs with various statuses and priorities
      const job1 = service.addJob('type_a', 'USDC', {}, 'high');
      const job2 = service.addJob('type_b', 'USDT', {}, 'medium');
      const job3 = service.addFirecrawlExtractionJob('PYUSD', { url: 'test' });
      
      // Manually set some job statuses for testing
      service.getJob(job2).status = 'completed';
      service.getJob(job3).status = 'failed';
    });

    test('should provide comprehensive queue statistics', () => {
      const stats = service.getQueueStats();
      
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      
      expect(stats.by_priority.high).toBe(1);
      expect(stats.by_priority.medium).toBe(2);
      
      expect(stats.by_type.type_a).toBe(1);
      expect(stats.by_type.type_b).toBe(1);
      expect(stats.by_type.firecrawl_collateral_extraction).toBe(1);
    });

    test('should track recently completed jobs', () => {
      const jobId = service.addJob('recent_job', 'USDC');
      const job = service.getJob(jobId);
      
      job.status = 'completed';
      job.completedAt = new Date();
      
      expect(service.hasRecentlyCompletedJob('USDC', 'recent_job', 60)).toBe(true);
      expect(service.hasRecentlyCompletedJob('USDC', 'recent_job', 0)).toBe(false);
    });

    test('should find latest completed job', () => {
      const jobId1 = service.addJob('test_job', 'USDC');
      const jobId2 = service.addJob('test_job', 'USDC');
      
      const job1 = service.getJob(jobId1);
      const job2 = service.getJob(jobId2);
      
      job1.status = 'completed';
      job1.completedAt = new Date(Date.now() - 60000); // 1 minute ago
      
      job2.status = 'completed';
      job2.completedAt = new Date(); // Now
      
      const latest = service.getLatestCompletedJob('USDC', 'test_job');
      expect(latest?.id).toBe(jobId2);
    });
  });

  describe('Performance Requirements', () => {
    test('should handle job submission within 100ms', async () => {
      const startTime = Date.now();
      
      // Submit 10 jobs quickly
      const jobIds = [];
      for (let i = 0; i < 10; i++) {
        jobIds.push(service.addJob('perf_test', `TICKER_${i}`));
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(totalTime).toBeLessThan(100); // Should complete within 100ms
      expect(jobIds).toHaveLength(10);
      expect(jobIds.every(id => service.getJob(id))).toBe(true);
    });

    test('should process 100+ jobs per minute capacity', async () => {
      // Mock fast job execution
      const originalExecuteJobByType = service.executeJobByType;
      service.executeJobByType = jest.fn().mockImplementation(async () => {
        // Simulate 500ms processing time per job
        await new Promise(resolve => setTimeout(resolve, 500));
        return 'mocked result';
      });
      
      // Create 120 jobs (exceeding 100/min requirement)
      const jobIds = [];
      for (let i = 0; i < 120; i++) {
        jobIds.push(service.addJob('load_test', `TICKER_${i}`, {}, 'medium'));
      }
      
      service.restartProcessing();
      const startTime = Date.now();
      
      // Fast forward time to process jobs
      const processingInterval = 2000; // Service processes every 2 seconds
      const maxProcessingTime = 60000; // 1 minute
      
      while (service.getJobsByStatus('completed').length < 100 && 
             Date.now() - startTime < maxProcessingTime) {
        jest.advanceTimersByTime(processingInterval);
        await Promise.resolve(); // Allow promises to resolve
      }
      
      const completedJobs = service.getJobsByStatus('completed');
      const actualTime = Date.now() - startTime;
      const jobsPerMinute = (completedJobs.length / actualTime) * 60000;
      
      expect(jobsPerMinute).toBeGreaterThanOrEqual(100);
    }, 30000); // 30 second timeout

    test('should handle concurrent job processing', async () => {
      const concurrentJobs = 50;
      const jobIds = [];
      
      // Create jobs that simulate concurrent processing
      for (let i = 0; i < concurrentJobs; i++) {
        jobIds.push(service.addJob('concurrent_test', `TICKER_${i}`));
      }
      
      // Mock parallel execution
      service.executeJobByType = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms per job
        return 'concurrent result';
      });
      
      const startTime = Date.now();
      
      // Process multiple jobs simultaneously
      const processingPromises = jobIds.slice(0, 10).map(jobId => 
        service.executeJob(service.getJob(jobId))
      );
      
      await Promise.all(processingPromises);
      const endTime = Date.now();
      
      // Should complete faster than sequential processing
      expect(endTime - startTime).toBeLessThan(1000); // Less than 1 second for 10 jobs
      
      const completedJobs = service.getJobsByStatus('completed');
      expect(completedJobs).toHaveLength(10);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle service restart gracefully', () => {
      const jobId = service.addJob('restart_test', 'USDC');
      
      service.stopProcessing();
      expect(service.processing).toBe(false);
      
      service.restartProcessing();
      expect(service.processing).toBe(true);
      
      const job = service.getJob(jobId);
      expect(job).toBeDefined();
      expect(job.status).toBe('pending');
    });

    test('should handle empty job queue gracefully', () => {
      const nextJob = service.getNextJobToProcess();
      expect(nextJob).toBeNull();
      
      const stats = service.getQueueStats();
      expect(stats.total).toBe(0);
    });

    test('should handle invalid job IDs gracefully', () => {
      expect(service.getJob('nonexistent')).toBeNull();
      expect(service.cancelJob('nonexistent')).toBe(false);
    });

    test('should handle memory pressure with large job queues', () => {
      // Create a large number of jobs to test memory handling
      const jobIds = [];
      for (let i = 0; i < 1000; i++) {
        jobIds.push(service.addJob('memory_test', `TICKER_${i}`, { 
          largeData: 'x'.repeat(1000) // 1KB per job
        }));
      }
      
      const stats = service.getQueueStats();
      expect(stats.total).toBe(1000);
      
      // Should be able to retrieve and process jobs without issues
      const firstJob = service.getJob(jobIds[0]);
      const lastJob = service.getJob(jobIds[999]);
      
      expect(firstJob).toBeDefined();
      expect(lastJob).toBeDefined();
    });

    test('should handle processing loop errors gracefully', async () => {
      // Mock an error in job execution
      const originalExecuteJobByType = service.executeJobByType;
      service.executeJobByType = jest.fn().mockImplementation(() => {
        throw new Error('Processing loop error');
      });
      
      const jobId = service.addJob('error_test', 'USDC');
      
      // Should not crash the service
      await expect(service.executeJob(service.getJob(jobId))).rejects.toThrow();
      
      // Service should still be operational
      expect(service.getJob(jobId)).toBeDefined();
      const newJobId = service.addJob('recovery_test', 'USDT');
      expect(service.getJob(newJobId)).toBeDefined();
    });

    test('should handle system clock changes', () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      const jobId = service.addJob('time_test', 'USDC', {}, 'medium', futureTime);
      
      // Job should not be eligible for processing
      expect(service.getNextJobToProcess()).toBeNull();
      
      // Simulate clock change (fast-forward)
      jest.setSystemTime(new Date(Date.now() + 3700000)); // 1 hour + 5 minutes
      
      // Job should now be eligible
      const nextJob = service.getNextJobToProcess();
      expect(nextJob?.id).toBe(jobId);
    });
  });

  describe('Integration with External Services', () => {
    test('should record successful extraction metrics', async () => {
      const expectedResult = {
        confidence_score: 0.9,
        collateral_allocations: [
          { asset: 'USDC', percentage: 100 }
        ]
      };
      
      (firecrawlMcpService.extractTransparencyData as jest.Mock)
        .mockResolvedValue(expectedResult);
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://example.com'
      });
      
      const job = service.getJob(jobId);
      await service.executeJob(job);
      
      expect(performanceMonitoringService.recordExtractionMetric)
        .toHaveBeenCalledWith(expect.objectContaining({
          method: 'firecrawl',
          symbol: 'USDC',
          success: true,
          confidence_score: 0.9,
          extraction_data: expect.objectContaining({
            items_found: 1,
            quality_score: 0.9
          })
        }));
    });

    test('should handle cost control service integration', async () => {
      const costCheckResults = [
        { allowed: true, reason: null },
        { allowed: false, reason: 'Rate limit exceeded' },
        { allowed: false, reason: 'Daily budget reached' }
      ];
      
      // Test multiple cost control scenarios
      for (const [index, result] of costCheckResults.entries()) {
        (costControlService.canProceedWithCost as jest.Mock).mockReturnValue(result);
        
        const jobId = service.addFirecrawlExtractionJob('USDC', {
          url: `https://example.com/${index}`
        });
        
        const job = service.getJob(jobId);
        await service.executeJob(job);
        
        const updatedJob = service.getJob(jobId);
        
        if (result.allowed) {
          expect(updatedJob.status).toBe('completed');
        } else {
          expect(updatedJob.status).toBe('retrying');
          expect(updatedJob.lastError).toContain(result.reason);
        }
      }
    });
  });
});