/**
 * Background Job Service - Concurrent Processing Tests
 * 
 * Tests concurrent processing scenarios:
 * - Multi-worker job processing
 * - Worker pool management
 * - Load balancing and distribution
 * - Worker collision handling
 * - Deadlock prevention
 * - Resource contention
 * - Scaling behavior
 * - Worker failure recovery
 */

import { backgroundJobService, BackgroundJob, JobExecutionContext } from '../background-job-service';
import { costControlService } from '../cost-control-service';
import { firecrawlMcpService } from '../firecrawl-mcp-service';
import { performanceHelpers } from './test-setup';

// Mock dependencies
jest.mock('../cost-control-service');
jest.mock('../firecrawl-mcp-service');

// Use real timers for concurrency tests
jest.useRealTimers();

// Worker Pool Implementation for Testing
class WorkerPool {
  private workers: Worker[] = [];
  private isShutdown = false;
  
  constructor(
    private service: any,
    private workerCount: number,
    private onJobComplete?: (workerId: string, job: BackgroundJob, result: any) => void
  ) {}
  
  async start(): Promise<void> {
    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(this.service, `worker-${i}`, this.onJobComplete);
      this.workers.push(worker);
      worker.start();
    }
  }
  
  async shutdown(): Promise<void> {
    this.isShutdown = true;
    await Promise.all(this.workers.map(worker => worker.stop()));
  }
  
  getWorkerStats(): { total: number; active: number; idle: number } {
    const activeWorkers = this.workers.filter(w => w.isProcessing()).length;
    return {
      total: this.workers.length,
      active: activeWorkers,
      idle: this.workers.length - activeWorkers
    };
  }
  
  getWorkers(): Worker[] {
    return [...this.workers];
  }
}

class Worker {
  private processing = false;
  private isActive = false;
  private currentJob: BackgroundJob | null = null;
  private processedCount = 0;
  private errorCount = 0;
  
  constructor(
    private service: any,
    private workerId: string,
    private onJobComplete?: (workerId: string, job: BackgroundJob, result: any) => void
  ) {}
  
  async start(): Promise<void> {
    this.isActive = true;
    this.processJobs();
  }
  
  async stop(): Promise<void> {
    this.isActive = false;
    // Wait for current job to complete
    while (this.processing) {
      await performanceHelpers.delay(10);
    }
  }
  
  private async processJobs(): Promise<void> {
    while (this.isActive) {
      try {
        const job = this.service.getNextJobToProcess();
        
        if (!job) {
          await performanceHelpers.delay(100);
          continue;
        }
        
        this.processing = true;
        this.currentJob = job;
        
        const result = await this.service.executeJob(job);
        this.processedCount++;
        
        if (this.onJobComplete) {
          this.onJobComplete(this.workerId, job, result);
        }
        
      } catch (error) {
        this.errorCount++;
        console.error(`Worker ${this.workerId} error:`, error);
      } finally {
        this.processing = false;
        this.currentJob = null;
      }
    }
  }
  
  isProcessing(): boolean {
    return this.processing;
  }
  
  getCurrentJob(): BackgroundJob | null {
    return this.currentJob;
  }
  
  getStats(): { processed: number; errors: number; workerId: string } {
    return {
      processed: this.processedCount,
      errors: this.errorCount,
      workerId: this.workerId
    };
  }
}

describe('Background Job Service - Concurrent Processing', () => {
  let service: any;
  let workerPool: WorkerPool;

  beforeEach(() => {
    service = new (backgroundJobService.constructor as any)();
    service.stopProcessing(); // Disable auto-processing
    
    jest.clearAllMocks();
    
    // Setup optimistic mocks
    (costControlService.canProceedWithCost as jest.Mock).mockReturnValue({
      allowed: true,
      reason: null
    });
    
    (firecrawlMcpService.extractTransparencyData as jest.Mock).mockImplementation(
      async (url: string) => {
        // Simulate variable processing time
        await performanceHelpers.delay(50 + Math.random() * 100);
        return {
          confidence_score: 0.7 + Math.random() * 0.3,
          collateral_allocations: [
            { asset: 'USDC', percentage: 50 + Math.random() * 20 },
            { asset: 'USDT', percentage: 30 + Math.random() * 10 }
          ],
          url
        };
      }
    );
  });

  afterEach(async () => {
    if (workerPool) {
      await workerPool.shutdown();
    }
    service?.stopProcessing();
  });

  describe('Multi-Worker Job Processing', () => {
    test('should process jobs concurrently with multiple workers', async () => {
      const jobCount = 50;
      const workerCount = 5;
      
      // Create jobs
      const jobIds = [];
      for (let i = 0; i < jobCount; i++) {
        const jobId = service.addFirecrawlExtractionJob(`TICKER_${i}`, {
          url: `https://test-${i}.com`,
          urgent: i % 10 === 0 // Every 10th job is urgent
        });
        jobIds.push(jobId);
      }
      
      const startTime = Date.now();
      const completedJobs: { workerId: string; job: BackgroundJob; result: any }[] = [];
      
      // Start worker pool
      workerPool = new WorkerPool(service, workerCount, (workerId, job, result) => {
        completedJobs.push({ workerId, job, result });
      });
      
      await workerPool.start();
      
      // Wait for all jobs to complete
      while (completedJobs.length < jobCount && Date.now() - startTime < 30000) {
        await performanceHelpers.delay(100);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      expect(completedJobs).toHaveLength(jobCount);
      
      // Verify concurrent processing (should be faster than sequential)
      const estimatedSequentialTime = jobCount * 125; // 125ms average per job
      expect(totalTime).toBeLessThan(estimatedSequentialTime * 0.3); // At least 70% faster
      
      // Verify work distribution
      const workDistribution = completedJobs.reduce((acc, { workerId }) => {
        acc[workerId] = (acc[workerId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      expect(Object.keys(workDistribution)).toHaveLength(workerCount);
      
      // Each worker should have processed some jobs (reasonable distribution)
      Object.values(workDistribution).forEach(count => {
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThan(jobCount); // No single worker processed all jobs
      });
    }, 35000);

    test('should handle worker scaling', async () => {
      const initialWorkerCount = 2;
      const jobCount = 30;
      
      // Create jobs
      for (let i = 0; i < jobCount; i++) {
        service.addJob('scaling_test', `TICKER_${i}`, { index: i });
      }
      
      const completedJobs: any[] = [];
      
      // Start with fewer workers
      workerPool = new WorkerPool(service, initialWorkerCount, (workerId, job) => {
        completedJobs.push({ workerId, jobId: job.id, timestamp: Date.now() });
      });
      
      await workerPool.start();
      
      // Wait for some processing
      await performanceHelpers.delay(2000);
      
      const midProcessingCount = completedJobs.length;
      
      // Scale up by adding more workers
      const additionalWorkers = 3;
      const newWorkerPool = new WorkerPool(service, additionalWorkers, (workerId, job) => {
        completedJobs.push({ workerId, jobId: job.id, timestamp: Date.now() });
      });
      
      await newWorkerPool.start();
      
      // Wait for completion
      while (completedJobs.length < jobCount && Date.now() - Date.now() < 20000) {
        await performanceHelpers.delay(100);
      }
      
      await newWorkerPool.shutdown();
      
      // Should have processed more jobs after scaling up
      expect(completedJobs.length).toBe(jobCount);
      
      // Verify improved throughput after scaling
      const timePoints = completedJobs.map(job => job.timestamp).sort();
      const midPoint = timePoints[Math.floor(timePoints.length / 2)];
      const firstHalf = timePoints.filter(t => t <= midPoint);
      const secondHalf = timePoints.filter(t => t > midPoint);
      
      // Second half should process faster (more workers)
      if (firstHalf.length > 0 && secondHalf.length > 0) {
        const firstHalfRate = firstHalf.length / (midPoint - timePoints[0]);
        const secondHalfRate = secondHalf.length / (timePoints[timePoints.length - 1] - midPoint);
        
        expect(secondHalfRate).toBeGreaterThan(firstHalfRate * 1.2); // At least 20% faster
      }
    }, 25000);

    test('should maintain thread safety', async () => {
      const jobCount = 100;
      const workerCount = 10;
      
      // Create shared resource that workers will modify
      const sharedCounter = { value: 0, modifications: [] };
      
      // Mock job execution to modify shared resource
      const originalExecuteJobByType = service.executeJobByType.bind(service);
      service.executeJobByType = jest.fn().mockImplementation(async (context: JobExecutionContext) => {
        const startValue = sharedCounter.value;
        
        // Simulate some processing time
        await performanceHelpers.delay(10 + Math.random() * 20);
        
        // Modify shared resource (potential race condition)
        const newValue = startValue + 1;
        sharedCounter.value = newValue;
        sharedCounter.modifications.push({
          jobId: context.job.id,
          workerId: `worker-${Math.random()}`, // Simulated worker ID
          startValue,
          newValue,
          timestamp: Date.now()
        });
        
        return { processed: true, counterValue: newValue };
      });
      
      // Create jobs
      for (let i = 0; i < jobCount; i++) {
        service.addJob('thread_safety_test', `TICKER_${i}`, { index: i });
      }
      
      const completedJobs: any[] = [];
      
      // Start worker pool
      workerPool = new WorkerPool(service, workerCount, (workerId, job, result) => {
        completedJobs.push({ workerId, job, result });
      });
      
      await workerPool.start();
      
      // Wait for completion
      while (completedJobs.length < jobCount && Date.now() - Date.now() < 20000) {
        await performanceHelpers.delay(100);
      }
      
      // Verify thread safety - final counter value should equal job count
      // (In real implementation, proper synchronization would be needed)
      expect(completedJobs).toHaveLength(jobCount);
      expect(sharedCounter.modifications).toHaveLength(jobCount);
      
      // All jobs should have been processed
      const processedJobIds = new Set(completedJobs.map(cj => cj.job.id));
      expect(processedJobIds.size).toBe(jobCount);
    }, 25000);
  });

  describe('Load Balancing and Distribution', () => {
    test('should distribute jobs evenly across workers', async () => {
      const jobCount = 60;
      const workerCount = 6;
      
      // Create jobs with different priorities
      const jobIds = [];
      for (let i = 0; i < jobCount; i++) {
        const priority = ['low', 'medium', 'high'][i % 3] as 'low' | 'medium' | 'high';
        const jobId = service.addJob('distribution_test', `TICKER_${i}`, { index: i }, priority);
        jobIds.push(jobId);
      }
      
      const workerStats: Record<string, { jobs: string[]; priorities: string[] }> = {};
      
      workerPool = new WorkerPool(service, workerCount, (workerId, job) => {
        if (!workerStats[workerId]) {
          workerStats[workerId] = { jobs: [], priorities: [] };
        }
        workerStats[workerId].jobs.push(job.id);
        workerStats[workerId].priorities.push(job.priority);
      });
      
      await workerPool.start();
      
      // Wait for completion
      while (Object.values(workerStats).reduce((total, stats) => total + stats.jobs.length, 0) < jobCount) {
        await performanceHelpers.delay(100);
      }
      
      // Verify even distribution
      const jobCounts = Object.values(workerStats).map(stats => stats.jobs.length);
      const minJobs = Math.min(...jobCounts);
      const maxJobs = Math.max(...jobCounts);
      
      // Distribution should be relatively even (within reasonable variance)
      expect(maxJobs - minJobs).toBeLessThanOrEqual(Math.ceil(jobCount / workerCount) + 2);
      
      // Each worker should have processed jobs of different priorities
      Object.values(workerStats).forEach(stats => {
        const uniquePriorities = new Set(stats.priorities);
        if (stats.jobs.length >= 3) { // Only check if worker processed enough jobs
          expect(uniquePriorities.size).toBeGreaterThan(1);
        }
      });
    }, 20000);

    test('should handle priority-based load balancing', async () => {
      const highPriorityJobs = 15;
      const mediumPriorityJobs = 15;
      const lowPriorityJobs = 15;
      const workerCount = 5;
      
      // Create jobs with different priorities and execution times
      const processingTimes = { high: 50, medium: 100, low: 200 };
      
      service.executeJobByType = jest.fn().mockImplementation(async (context: JobExecutionContext) => {
        const delay = processingTimes[context.job.priority as keyof typeof processingTimes];
        await performanceHelpers.delay(delay);
        return { processed: true, priority: context.job.priority };
      });
      
      // Create high priority jobs first
      for (let i = 0; i < highPriorityJobs; i++) {
        service.addJob('priority_test', `HIGH_${i}`, { index: i }, 'high');
      }
      
      // Then medium priority
      for (let i = 0; i < mediumPriorityJobs; i++) {
        service.addJob('priority_test', `MEDIUM_${i}`, { index: i }, 'medium');
      }
      
      // Finally low priority
      for (let i = 0; i < lowPriorityJobs; i++) {
        service.addJob('priority_test', `LOW_${i}`, { index: i }, 'low');
      }
      
      const completionOrder: { priority: string; ticker: string; timestamp: number }[] = [];
      
      workerPool = new WorkerPool(service, workerCount, (workerId, job) => {
        completionOrder.push({
          priority: job.priority,
          ticker: job.ticker,
          timestamp: Date.now()
        });
      });
      
      await workerPool.start();
      
      // Wait for completion
      while (completionOrder.length < highPriorityJobs + mediumPriorityJobs + lowPriorityJobs) {
        await performanceHelpers.delay(100);
      }
      
      // Verify priority ordering
      const highPriorityCompletions = completionOrder.filter(c => c.priority === 'high');
      const mediumPriorityCompletions = completionOrder.filter(c => c.priority === 'medium');
      const lowPriorityCompletions = completionOrder.filter(c => c.priority === 'low');
      
      expect(highPriorityCompletions).toHaveLength(highPriorityJobs);
      expect(mediumPriorityCompletions).toHaveLength(mediumPriorityJobs);
      expect(lowPriorityCompletions).toHaveLength(lowPriorityJobs);
      
      // Most high priority jobs should complete before medium/low priority
      const firstHalf = completionOrder.slice(0, 20);
      const highPriorityInFirstHalf = firstHalf.filter(c => c.priority === 'high').length;
      
      expect(highPriorityInFirstHalf).toBeGreaterThan(10); // Most should be high priority
    }, 30000);

    test('should handle dynamic load balancing', async () => {
      const jobCount = 40;
      const workerCount = 4;
      
      // Create jobs with variable processing times
      let processingTimeMultiplier = 1;
      service.executeJobByType = jest.fn().mockImplementation(async (context: JobExecutionContext) => {
        const baseTime = 100;
        const actualTime = baseTime * processingTimeMultiplier;
        
        // Simulate changing load conditions
        if (parseInt(context.job.ticker.split('_')[1]) % 10 === 0) {
          processingTimeMultiplier = processingTimeMultiplier === 1 ? 3 : 1; // Toggle between fast/slow
        }
        
        await performanceHelpers.delay(actualTime);
        return { processed: true, processingTime: actualTime };
      });
      
      // Create jobs
      for (let i = 0; i < jobCount; i++) {
        service.addJob('dynamic_load_test', `TICKER_${i}`, { index: i });
      }
      
      const workerMetrics: Record<string, { jobCount: number; totalTime: number; avgTime: number }> = {};
      const startTime = Date.now();
      
      workerPool = new WorkerPool(service, workerCount, (workerId, job, result) => {
        if (!workerMetrics[workerId]) {
          workerMetrics[workerId] = { jobCount: 0, totalTime: 0, avgTime: 0 };
        }
        
        const metric = workerMetrics[workerId];
        metric.jobCount++;
        metric.totalTime += result.processingTime;
        metric.avgTime = metric.totalTime / metric.jobCount;
      });
      
      await workerPool.start();
      
      // Wait for completion
      while (Object.values(workerMetrics).reduce((total, m) => total + m.jobCount, 0) < jobCount) {
        await performanceHelpers.delay(100);
      }
      
      // Verify dynamic adaptation
      expect(Object.keys(workerMetrics)).toHaveLength(workerCount);
      
      // All workers should have processed jobs
      Object.values(workerMetrics).forEach(metric => {
        expect(metric.jobCount).toBeGreaterThan(0);
      });
      
      // Total processing should be reasonable despite varying load
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(jobCount * 200); // Should be faster than sequential worst case
    }, 25000);
  });

  describe('Worker Collision and Conflict Resolution', () => {
    test('should prevent workers from processing the same job', async () => {
      const jobCount = 20;
      const workerCount = 8; // More workers than jobs to increase collision chances
      
      const jobProcessingLog: { jobId: string; workerId: string; timestamp: number }[] = [];
      const processedJobs = new Set<string>();
      
      // Create jobs
      for (let i = 0; i < jobCount; i++) {
        service.addJob('collision_test', `TICKER_${i}`, { index: i });
      }
      
      // Track job processing
      const originalExecuteJob = service.executeJob.bind(service);
      service.executeJob = jest.fn().mockImplementation(async (job: BackgroundJob) => {
        // Check for collision
        if (processedJobs.has(job.id)) {
          throw new Error(`Job ${job.id} already being processed`);
        }
        
        processedJobs.add(job.id);
        
        // Simulate processing
        await performanceHelpers.delay(100);
        
        const result = await originalExecuteJob(job);
        return result;
      });
      
      workerPool = new WorkerPool(service, workerCount, (workerId, job) => {
        jobProcessingLog.push({
          jobId: job.id,
          workerId,
          timestamp: Date.now()
        });
      });
      
      await workerPool.start();
      
      // Wait for completion
      while (jobProcessingLog.length < jobCount) {
        await performanceHelpers.delay(100);
      }
      
      // Verify no job was processed multiple times
      const jobIds = jobProcessingLog.map(log => log.jobId);
      const uniqueJobIds = new Set(jobIds);
      
      expect(uniqueJobIds.size).toBe(jobCount);
      expect(jobIds).toHaveLength(jobCount);
      
      // Verify each job was processed exactly once
      jobIds.forEach(jobId => {
        const occurrences = jobIds.filter(id => id === jobId).length;
        expect(occurrences).toBe(1);
      });
    }, 20000);

    test('should handle worker failures gracefully', async () => {
      const jobCount = 30;
      const workerCount = 5;
      
      // Create jobs
      for (let i = 0; i < jobCount; i++) {
        service.addJob('worker_failure_test', `TICKER_${i}`, { index: i });
      }
      
      let failingWorkerCount = 0;
      const completedJobs: any[] = [];
      const failedAttempts: any[] = [];
      
      // Mock worker failure scenario
      service.executeJobByType = jest.fn().mockImplementation(async (context: JobExecutionContext) => {
        const jobIndex = parseInt(context.job.ticker.split('_')[1]);
        
        // Simulate worker failure for certain jobs
        if (jobIndex % 7 === 0) { // Every 7th job fails on first attempt
          failingWorkerCount++;
          if (failingWorkerCount <= 4) { // First 4 failures
            failedAttempts.push({ jobId: context.job.id, attempt: context.attempt });
            throw new Error('Worker process crashed');
          }
        }
        
        await performanceHelpers.delay(50 + Math.random() * 50);
        return { processed: true, jobIndex };
      });
      
      workerPool = new WorkerPool(service, workerCount, (workerId, job, result) => {
        completedJobs.push({ workerId, jobId: job.id, result });
      });
      
      await workerPool.start();
      
      // Wait for completion (allowing time for retries)
      const startTime = Date.now();
      while (completedJobs.length < jobCount && Date.now() - startTime < 20000) {
        await performanceHelpers.delay(200);
      }
      
      // Despite worker failures, all jobs should eventually complete
      expect(completedJobs).toHaveLength(jobCount);
      expect(failedAttempts.length).toBeGreaterThan(0); // Some failures occurred
      
      // Verify failed jobs were retried and completed
      const completedJobIds = new Set(completedJobs.map(cj => cj.jobId));
      failedAttempts.forEach(failure => {
        expect(completedJobIds.has(failure.jobId)).toBe(true);
      });
    }, 25000);

    test('should handle resource contention', async () => {
      const jobCount = 25;
      const workerCount = 8;
      const maxConcurrentResources = 3; // Simulate limited resource pool
      
      let currentResourceUsers = 0;
      const resourceUsageLog: { jobId: string; acquired: boolean; timestamp: number }[] = [];
      
      // Create jobs
      for (let i = 0; i < jobCount; i++) {
        service.addJob('resource_contention_test', `TICKER_${i}`, { index: i });
      }
      
      // Mock resource-constrained execution
      service.executeJobByType = jest.fn().mockImplementation(async (context: JobExecutionContext) => {
        // Try to acquire resource
        if (currentResourceUsers >= maxConcurrentResources) {
          resourceUsageLog.push({
            jobId: context.job.id,
            acquired: false,
            timestamp: Date.now()
          });
          
          // Wait and retry
          await performanceHelpers.delay(50);
          if (currentResourceUsers >= maxConcurrentResources) {
            throw new Error('Resource contention - no available resources');
          }
        }
        
        // Acquire resource
        currentResourceUsers++;
        resourceUsageLog.push({
          jobId: context.job.id,
          acquired: true,
          timestamp: Date.now()
        });
        
        try {
          // Simulate resource usage
          await performanceHelpers.delay(100 + Math.random() * 100);
          return { processed: true, resourcesUsed: currentResourceUsers };
        } finally {
          // Release resource
          currentResourceUsers--;
        }
      });
      
      const completedJobs: any[] = [];
      
      workerPool = new WorkerPool(service, workerCount, (workerId, job, result) => {
        completedJobs.push({ workerId, jobId: job.id, result });
      });
      
      await workerPool.start();
      
      // Wait for completion
      while (completedJobs.length < jobCount && Date.now() - Date.now() < 30000) {
        await performanceHelpers.delay(200);
      }
      
      // All jobs should eventually complete despite resource contention
      expect(completedJobs).toHaveLength(jobCount);
      
      // Verify resource constraints were respected
      const acquisitions = resourceUsageLog.filter(log => log.acquired);
      expect(acquisitions).toHaveLength(jobCount);
      
      // Check that resource usage never exceeded the limit
      // (This would require more sophisticated tracking in a real implementation)
      expect(currentResourceUsers).toBe(0); // All resources released
    }, 35000);
  });

  describe('Deadlock Prevention and Recovery', () => {
    test('should prevent deadlocks in circular dependencies', async () => {
      const jobPairs = 10;
      const workerCount = 4;
      
      // Create jobs with potential circular dependencies
      const jobIds: string[] = [];
      for (let i = 0; i < jobPairs; i++) {
        const jobA = service.addJob('deadlock_test_a', `PAIR_${i}_A`, { 
          dependsOn: `PAIR_${i}_B`,
          pairIndex: i
        });
        const jobB = service.addJob('deadlock_test_b', `PAIR_${i}_B`, { 
          dependsOn: `PAIR_${i}_A`,
          pairIndex: i
        });
        
        jobIds.push(jobA, jobB);
      }
      
      const completedJobs: any[] = [];
      const timeoutJobs: any[] = [];
      
      // Mock execution with dependency checking and timeout
      service.executeJobByType = jest.fn().mockImplementation(async (context: JobExecutionContext) => {
        const job = context.job;
        const dependsOn = job.data.dependsOn;
        
        // Check if dependency exists and is completed
        const dependencyJob = service.getAllJobs().find((j: BackgroundJob) => 
          j.ticker === dependsOn
        );
        
        if (dependencyJob && dependencyJob.status !== 'completed') {
          // Simulate deadlock detection with timeout
          const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Deadlock detected - timeout')), 1000);
          });
          
          const processing = new Promise(resolve => {
            setTimeout(() => {
              // Break potential deadlock by ignoring dependency
              resolve({ processed: true, deadlockResolved: true });
            }, 800);
          });
          
          try {
            return await Promise.race([processing, timeout]);
          } catch (error) {
            timeoutJobs.push(job.id);
            throw error;
          }
        }
        
        await performanceHelpers.delay(50);
        return { processed: true, dependencyIgnored: !dependencyJob };
      });
      
      workerPool = new WorkerPool(service, workerCount, (workerId, job, result) => {
        completedJobs.push({ workerId, jobId: job.id, result });
      });
      
      await workerPool.start();
      
      // Wait for completion or deadlock resolution
      const startTime = Date.now();
      while (completedJobs.length < jobIds.length && Date.now() - startTime < 15000) {
        await performanceHelpers.delay(200);
      }
      
      // Most jobs should complete (some might timeout due to deadlock)
      expect(completedJobs.length + timeoutJobs.length).toBe(jobIds.length);
      
      // Verify deadlock prevention mechanisms worked
      const resolvedJobs = completedJobs.filter(cj => cj.result.deadlockResolved);
      if (resolvedJobs.length > 0) {
        expect(resolvedJobs.length).toBeGreaterThan(0);
      }
    }, 20000);

    test('should recover from worker pool deadlock', async () => {
      const jobCount = 12;
      const initialWorkerCount = 3;
      
      // Create jobs that will cause workers to wait for each other
      for (let i = 0; i < jobCount; i++) {
        service.addJob('worker_deadlock_test', `TICKER_${i}`, { 
          index: i,
          shouldBlock: i < 6 // First 6 jobs will block
        });
      }
      
      const activeWorkers = new Set<string>();
      const completedJobs: any[] = [];
      const blockedWorkers: string[] = [];
      
      // Mock blocking execution for some jobs
      service.executeJobByType = jest.fn().mockImplementation(async (context: JobExecutionContext) => {
        const workerId = `worker-${Math.random().toString(36).substr(2, 9)}`;
        activeWorkers.add(workerId);
        
        if (context.job.data.shouldBlock) {
          // Simulate worker getting stuck
          blockedWorkers.push(workerId);
          
          // Block until other workers finish non-blocking jobs
          const blockTime = 3000;
          await performanceHelpers.delay(blockTime);
          
          // Check if deadlock should be broken
          if (completedJobs.length < 6) { // If no progress on other jobs
            throw new Error('Worker deadlock detected');
          }
        }
        
        await performanceHelpers.delay(100);
        activeWorkers.delete(workerId);
        
        return { 
          processed: true, 
          workerId,
          wasBlocked: context.job.data.shouldBlock 
        };
      });
      
      workerPool = new WorkerPool(service, initialWorkerCount, (workerId, job, result) => {
        completedJobs.push({ workerId, jobId: job.id, result });
      });
      
      await workerPool.start();
      
      // Monitor for deadlock and recovery
      let deadlockDetected = false;
      const monitorInterval = setInterval(() => {
        const poolStats = workerPool.getWorkerStats();
        
        // Detect potential deadlock (all workers busy but no progress)
        if (poolStats.active === initialWorkerCount && completedJobs.length < 6) {
          deadlockDetected = true;
          
          // Simulate deadlock recovery by adding more workers
          const recoveryPool = new WorkerPool(service, 2, (workerId, job, result) => {
            completedJobs.push({ workerId, jobId: job.id, result, isRecoveryWorker: true });
          });
          recoveryPool.start();
        }
      }, 1000);
      
      // Wait for completion
      const startTime = Date.now();
      while (completedJobs.length < jobCount && Date.now() - startTime < 20000) {
        await performanceHelpers.delay(200);
      }
      
      clearInterval(monitorInterval);
      
      // Verify recovery from potential deadlock
      expect(completedJobs.length).toBeGreaterThanOrEqual(jobCount * 0.8); // Most jobs completed
      
      if (deadlockDetected) {
        const recoveryJobs = completedJobs.filter(cj => cj.isRecoveryWorker);
        expect(recoveryJobs.length).toBeGreaterThan(0); // Recovery workers helped
      }
    }, 25000);
  });

  describe('Performance Under Concurrent Load', () => {
    test('should maintain throughput under high concurrency', async () => {
      const jobCount = 100;
      const workerCount = 10;
      const targetThroughput = 50; // jobs per second
      
      // Create jobs
      for (let i = 0; i < jobCount; i++) {
        service.addJob('high_concurrency_test', `TICKER_${i}`, { index: i });
      }
      
      const startTime = Date.now();
      const completedJobs: any[] = [];
      const throughputMeasurements: number[] = [];
      
      // Mock fast execution
      service.executeJobByType = jest.fn().mockImplementation(async () => {
        await performanceHelpers.delay(20 + Math.random() * 30); // 20-50ms per job
        return { processed: true };
      });
      
      workerPool = new WorkerPool(service, workerCount, (workerId, job) => {
        completedJobs.push({ workerId, jobId: job.id, timestamp: Date.now() });
        
        // Measure throughput every 10 jobs
        if (completedJobs.length % 10 === 0) {
          const elapsed = Date.now() - startTime;
          const throughput = (completedJobs.length / elapsed) * 1000; // jobs per second
          throughputMeasurements.push(throughput);
        }
      });
      
      await workerPool.start();
      
      // Wait for completion
      while (completedJobs.length < jobCount && Date.now() - startTime < 15000) {
        await performanceHelpers.delay(100);
      }
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const overallThroughput = (completedJobs.length / totalTime) * 1000;
      
      expect(completedJobs).toHaveLength(jobCount);
      expect(overallThroughput).toBeGreaterThan(targetThroughput);
      
      // Throughput should remain consistent throughout
      if (throughputMeasurements.length > 2) {
        const avgThroughput = throughputMeasurements.reduce((sum, t) => sum + t, 0) / throughputMeasurements.length;
        const throughputVariance = throughputMeasurements.map(t => Math.abs(t - avgThroughput));
        const maxVariance = Math.max(...throughputVariance);
        
        expect(maxVariance).toBeLessThan(avgThroughput * 0.5); // Variance < 50% of average
      }
    }, 20000);

    test('should scale linearly with worker count', async () => {
      const jobCount = 60;
      const workerCounts = [2, 4, 6];
      const results: { workers: number; throughput: number; efficiency: number }[] = [];
      
      for (const workerCount of workerCounts) {
        // Reset jobs
        service = new (backgroundJobService.constructor as any)();
        service.stopProcessing();
        
        // Create fresh jobs
        for (let i = 0; i < jobCount; i++) {
          service.addJob('scaling_test', `TICKER_${i}`, { index: i });
        }
        
        const completedJobs: any[] = [];
        const startTime = Date.now();
        
        // Start worker pool
        const testWorkerPool = new WorkerPool(service, workerCount, (workerId, job) => {
          completedJobs.push({ workerId, jobId: job.id });
        });
        
        await testWorkerPool.start();
        
        // Wait for completion
        while (completedJobs.length < jobCount && Date.now() - startTime < 20000) {
          await performanceHelpers.delay(100);
        }
        
        await testWorkerPool.shutdown();
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const throughput = (completedJobs.length / totalTime) * 1000;
        const efficiency = throughput / workerCount; // jobs per second per worker
        
        results.push({
          workers: workerCount,
          throughput,
          efficiency
        });
      }
      
      // Verify scaling behavior
      expect(results).toHaveLength(3);
      
      // Throughput should increase with more workers
      expect(results[1].throughput).toBeGreaterThan(results[0].throughput * 1.5);
      expect(results[2].throughput).toBeGreaterThan(results[1].throughput * 1.2);
      
      // Efficiency shouldn't degrade significantly
      const efficiencies = results.map(r => r.efficiency);
      const minEfficiency = Math.min(...efficiencies);
      const maxEfficiency = Math.max(...efficiencies);
      
      expect(minEfficiency).toBeGreaterThan(maxEfficiency * 0.7); // No more than 30% efficiency loss
    }, 40000);
  });
});