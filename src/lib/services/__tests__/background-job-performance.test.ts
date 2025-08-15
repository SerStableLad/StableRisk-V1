/**
 * Background Job Service - Performance Tests
 * 
 * Tests performance requirements:
 * - 100+ jobs per minute processing capacity
 * - <100ms job submission response time
 * - Concurrent processing efficiency
 * - Memory usage under load
 * - Throughput under different scenarios
 * - Resource utilization monitoring
 */

import { backgroundJobService, BackgroundJob } from '../background-job-service';
import { costControlService } from '../cost-control-service';
import { performanceMonitoringService } from '../performance-monitoring-service';
import { firecrawlMcpService } from '../firecrawl-mcp-service';
import { performanceHelpers, loadTestHelpers } from './test-setup';

// Mock dependencies for performance testing
jest.mock('../cost-control-service');
jest.mock('../performance-monitoring-service');
jest.mock('../firecrawl-mcp-service');

// Use real timers for performance tests
jest.useRealTimers();

describe('Background Job Service - Performance Tests', () => {
  let service: any;
  
  // Performance test configuration
  const PERFORMANCE_REQUIREMENTS = {
    JOBS_PER_MINUTE: 100,
    SUBMISSION_TIMEOUT_MS: 100,
    MAX_MEMORY_USAGE_MB: 512,
    MAX_CPU_UTILIZATION: 80,
    CONCURRENT_WORKERS: 10
  };

  beforeEach(() => {
    // Create fresh service instance
    service = new (backgroundJobService.constructor as any)();
    service.stopProcessing();
    
    // Setup optimistic mocks for performance testing
    (costControlService.canProceedWithCost as jest.Mock).mockReturnValue({
      allowed: true,
      reason: null
    });
    
    (firecrawlMcpService.extractTransparencyData as jest.Mock).mockImplementation(
      async () => {
        // Simulate realistic API response time (50-200ms)
        await performanceHelpers.delay(Math.random() * 150 + 50);
        return {
          confidence_score: 0.8,
          collateral_allocations: [
            { asset: 'USDC', percentage: 50 },
            { asset: 'USDT', percentage: 30 },
            { asset: 'Treasury Bills', percentage: 20 }
          ]
        };
      }
    );
  });

  afterEach(() => {
    service?.stopProcessing();
    // Allow GC to clean up
    global.gc && global.gc();
  });

  describe('Job Submission Performance', () => {
    test('should submit single job within 100ms', async () => {
      const { timeMs } = await performanceHelpers.measureTime(async () => {
        return service.addJob('perf_test', 'USDC', { test: 'data' });
      });
      
      expect(timeMs).toBeLessThan(PERFORMANCE_REQUIREMENTS.SUBMISSION_TIMEOUT_MS);
    });

    test('should submit batch of 50 jobs within 100ms', async () => {
      const { result, timeMs } = await performanceHelpers.measureTime(async () => {
        const jobIds = [];
        for (let i = 0; i < 50; i++) {
          jobIds.push(service.addJob('batch_test', `TICKER_${i}`, { index: i }));
        }
        return jobIds;
      });
      
      expect(timeMs).toBeLessThan(PERFORMANCE_REQUIREMENTS.SUBMISSION_TIMEOUT_MS);
      expect(result).toHaveLength(50);
      expect(result.every(id => typeof id === 'string')).toBe(true);
    });

    test('should handle high-frequency job submissions', async () => {
      const submissionCount = 1000;
      const batchSize = 100;
      const maxBatchTime = 50; // ms per batch
      
      let totalJobs = 0;
      const startTime = Date.now();
      
      // Submit jobs in batches to test sustained performance
      for (let batch = 0; batch < submissionCount / batchSize; batch++) {
        const batchStart = Date.now();
        
        const batchJobs = [];
        for (let i = 0; i < batchSize; i++) {
          batchJobs.push(
            service.addJob('high_freq_test', `TICKER_${batch}_${i}`, {
              batch,
              index: i,
              timestamp: Date.now()
            })
          );
        }
        
        const batchTime = Date.now() - batchStart;
        expect(batchTime).toBeLessThan(maxBatchTime);
        
        totalJobs += batchJobs.length;
        
        // Small delay to prevent overwhelming
        await performanceHelpers.delay(1);
      }
      
      const totalTime = Date.now() - startTime;
      const jobsPerSecond = (totalJobs / totalTime) * 1000;
      
      expect(totalJobs).toBe(submissionCount);
      expect(jobsPerSecond).toBeGreaterThan(1000); // Should handle >1000 submissions/sec
    });

    test('should maintain submission performance under memory pressure', async () => {
      // Create memory pressure with large job data
      const largeData = {
        payload: 'x'.repeat(10 * 1024), // 10KB per job
        metadata: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          value: Math.random(),
          description: `Item ${i} with random data ${Math.random()}`
        }))
      };
      
      const jobCount = 100;
      const submissionTimes: number[] = [];
      
      for (let i = 0; i < jobCount; i++) {
        const { timeMs } = await performanceHelpers.measureTime(async () => {
          return service.addJob('memory_pressure_test', `TICKER_${i}`, {
            ...largeData,
            jobIndex: i
          });
        });
        
        submissionTimes.push(timeMs);
        
        // Check that submission time doesn't degrade significantly
        if (i > 10) { // Allow warmup
          const recentAverage = submissionTimes.slice(-10).reduce((a, b) => a + b, 0) / 10;
          expect(recentAverage).toBeLessThan(PERFORMANCE_REQUIREMENTS.SUBMISSION_TIMEOUT_MS);
        }
      }
      
      // Overall average should be well under limit
      const overallAverage = submissionTimes.reduce((a, b) => a + b, 0) / submissionTimes.length;
      expect(overallAverage).toBeLessThan(PERFORMANCE_REQUIREMENTS.SUBMISSION_TIMEOUT_MS / 2);
    });
  });

  describe('Processing Throughput', () => {
    test('should process 100+ jobs per minute', async () => {
      const targetJobCount = 120; // Exceed minimum requirement
      const testTimeoutMs = 65000; // Slightly over 1 minute
      
      // Create jobs with fast execution
      service.executeJobByType = jest.fn().mockImplementation(async (context) => {
        // Simulate realistic job processing (100-300ms)
        await performanceHelpers.delay(Math.random() * 200 + 100);
        return { 
          processed: true, 
          jobId: context.job.id,
          processingTime: Date.now() - context.job.startedAt?.getTime()
        };
      });
      
      // Submit jobs
      const jobIds = [];
      for (let i = 0; i < targetJobCount; i++) {
        jobIds.push(
          service.addJob('throughput_test', `TICKER_${i}`, { 
            index: i,
            priority: i % 3 === 0 ? 'high' : 'medium'
          })
        );
      }
      
      service.restartProcessing();
      const startTime = Date.now();
      
      // Wait for jobs to complete or timeout
      while (Date.now() - startTime < testTimeoutMs) {
        const completedJobs = service.getJobsByStatus('completed');
        if (completedJobs.length >= PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE) {
          break;
        }
        await performanceHelpers.delay(100);
      }
      
      const endTime = Date.now();
      const actualTime = endTime - startTime;
      const completedJobs = service.getJobsByStatus('completed');
      
      // Calculate throughput
      const jobsPerMinute = (completedJobs.length / actualTime) * 60000;
      
      expect(completedJobs.length).toBeGreaterThanOrEqual(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE);
      expect(jobsPerMinute).toBeGreaterThanOrEqual(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE);
      
      // Verify job quality
      completedJobs.forEach(job => {
        expect(job.status).toBe('completed');
        expect(job.result).toBeDefined();
        expect(job.processingTimeMs).toBeGreaterThan(0);
      });
    }, testTimeoutMs);

    test('should maintain throughput with mixed job types', async () => {
      const jobTypes = [
        { type: 'fast_job', weight: 0.5, processingTime: 50 },
        { type: 'medium_job', weight: 0.3, processingTime: 150 },
        { type: 'slow_job', weight: 0.2, processingTime: 300 }
      ];
      
      // Mock different execution times
      service.executeJobByType = jest.fn().mockImplementation(async (context) => {
        const jobType = jobTypes.find(type => context.job.type === type.type);
        const processingTime = jobType?.processingTime || 100;
        
        await performanceHelpers.delay(processingTime);
        return { processed: true, type: context.job.type };
      });
      
      // Create mixed workload
      const totalJobs = 150;
      const jobIds = [];
      
      for (let i = 0; i < totalJobs; i++) {
        const random = Math.random();
        let selectedType = jobTypes[0];
        
        let cumulativeWeight = 0;
        for (const type of jobTypes) {
          cumulativeWeight += type.weight;
          if (random <= cumulativeWeight) {
            selectedType = type;
            break;
          }
        }
        
        jobIds.push(
          service.addJob(selectedType.type, `TICKER_${i}`, {
            index: i,
            expectedTime: selectedType.processingTime
          })
        );
      }
      
      service.restartProcessing();
      const startTime = Date.now();
      
      // Monitor progress
      const progressChecks = [];
      const checkInterval = setInterval(() => {
        const completed = service.getJobsByStatus('completed');
        const running = service.getJobsByStatus('running');
        const pending = service.getJobsByStatus('pending');
        
        progressChecks.push({
          time: Date.now() - startTime,
          completed: completed.length,
          running: running.length,
          pending: pending.length
        });
      }, 1000);
      
      // Wait for target completion
      while (Date.now() - startTime < 70000) {
        const completedJobs = service.getJobsByStatus('completed');
        if (completedJobs.length >= 100) {
          break;
        }
        await performanceHelpers.delay(100);
      }
      
      clearInterval(checkInterval);
      
      const endTime = Date.now();
      const completedJobs = service.getJobsByStatus('completed');
      const throughput = (completedJobs.length / (endTime - startTime)) * 60000;
      
      expect(throughput).toBeGreaterThanOrEqual(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE * 0.8);
      
      // Verify mixed types were processed
      const completedTypes = completedJobs.reduce((acc, job) => {
        acc[job.type] = (acc[job.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      expect(Object.keys(completedTypes)).toHaveLength(3);
    }, 75000);

    test('should scale processing with priority queues', async () => {
      const priorities = ['high', 'medium', 'low'] as const;
      const jobsPerPriority = 50;
      
      // Mock priority-aware execution
      const executionOrder: string[] = [];
      service.executeJobByType = jest.fn().mockImplementation(async (context) => {
        executionOrder.push(context.job.id);
        await performanceHelpers.delay(100);
        return { processed: true, priority: context.job.priority };
      });
      
      // Create jobs with different priorities
      const allJobIds: Record<string, string[]> = {
        high: [],
        medium: [],
        low: []
      };
      
      for (const priority of priorities) {
        for (let i = 0; i < jobsPerPriority; i++) {
          const jobId = service.addJob(
            'priority_test',
            `TICKER_${priority}_${i}`,
            { index: i },
            priority
          );
          allJobIds[priority].push(jobId);
        }
      }
      
      service.restartProcessing();
      const startTime = Date.now();
      
      // Wait for substantial completion
      while (Date.now() - startTime < 30000) {
        const completed = service.getJobsByStatus('completed');
        if (completed.length >= 100) {
          break;
        }
        await performanceHelpers.delay(100);
      }
      
      const completedJobs = service.getJobsByStatus('completed');
      const throughput = (completedJobs.length / (Date.now() - startTime)) * 60000;
      
      expect(throughput).toBeGreaterThanOrEqual(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE);
      
      // Verify priority ordering in early executions
      const first30Executions = executionOrder.slice(0, 30);
      const highPriorityExecutions = first30Executions.filter(jobId =>
        allJobIds.high.includes(jobId)
      );
      
      // Most early executions should be high priority
      expect(highPriorityExecutions.length).toBeGreaterThan(15);
    }, 35000);
  });

  describe('Concurrent Processing', () => {
    test('should handle concurrent job processing efficiently', async () => {
      const concurrentJobs = 50;
      const processingTimeMs = 200;
      
      // Mock concurrent-safe execution
      const activeJobs = new Set();
      let maxConcurrency = 0;
      
      service.executeJobByType = jest.fn().mockImplementation(async (context) => {
        activeJobs.add(context.job.id);
        maxConcurrency = Math.max(maxConcurrency, activeJobs.size);
        
        await performanceHelpers.delay(processingTimeMs);
        
        activeJobs.delete(context.job.id);
        return { processed: true, concurrency: maxConcurrency };
      });
      
      // Create concurrent jobs
      const jobIds = [];
      for (let i = 0; i < concurrentJobs; i++) {
        jobIds.push(
          service.addJob('concurrent_test', `TICKER_${i}`, { index: i })
        );
      }
      
      // Process jobs with multiple workers
      const workerPromises = [];
      for (let worker = 0; worker < PERFORMANCE_REQUIREMENTS.CONCURRENT_WORKERS; worker++) {
        workerPromises.push(
          (async () => {
            while (true) {
              const job = service.getNextJobToProcess();
              if (!job) {
                await performanceHelpers.delay(50);
                continue;
              }
              
              if (service.getJobsByStatus('completed').length >= concurrentJobs) {
                break;
              }
              
              await service.executeJob(job);
            }
          })()
        );
      }
      
      const startTime = Date.now();
      await Promise.all(workerPromises);
      const endTime = Date.now();
      
      const completedJobs = service.getJobsByStatus('completed');
      const actualTime = endTime - startTime;
      
      // Should complete much faster than sequential processing
      const sequentialTime = concurrentJobs * processingTimeMs;
      const expectedConcurrentTime = sequentialTime / PERFORMANCE_REQUIREMENTS.CONCURRENT_WORKERS;
      
      expect(actualTime).toBeLessThan(expectedConcurrentTime * 1.5); // Allow 50% overhead
      expect(completedJobs).toHaveLength(concurrentJobs);
      expect(maxConcurrency).toBeGreaterThan(1);
      expect(maxConcurrency).toBeLessThanOrEqual(PERFORMANCE_REQUIREMENTS.CONCURRENT_WORKERS);
    }, 30000);

    test('should maintain performance under resource contention', async () => {
      const jobCount = 100;
      const memoryPressure = 1024 * 1024; // 1MB per job
      
      // Create memory-intensive jobs
      service.executeJobByType = jest.fn().mockImplementation(async (context) => {
        // Simulate memory allocation
        const largeBuffer = Buffer.alloc(memoryPressure);
        largeBuffer.fill(Math.random() * 255);
        
        await performanceHelpers.delay(100);
        
        return { 
          processed: true,
          memoryUsed: largeBuffer.length,
          jobId: context.job.id
        };
      });
      
      // Submit memory-intensive jobs
      const jobIds = [];
      for (let i = 0; i < jobCount; i++) {
        jobIds.push(
          service.addJob('memory_intensive', `TICKER_${i}`, {
            index: i,
            largeData: Array(1000).fill(`data-${i}`)
          })
        );
      }
      
      service.restartProcessing();
      const startTime = Date.now();
      
      // Monitor memory usage
      const memoryUsage: number[] = [];
      const memoryMonitor = setInterval(() => {
        const usage = process.memoryUsage();
        memoryUsage.push(usage.heapUsed / 1024 / 1024); // MB
      }, 500);
      
      // Wait for completion
      while (Date.now() - startTime < 45000) {
        const completed = service.getJobsByStatus('completed');
        if (completed.length >= jobCount * 0.8) {
          break;
        }
        await performanceHelpers.delay(200);
      }
      
      clearInterval(memoryMonitor);
      
      const completedJobs = service.getJobsByStatus('completed');
      const throughput = (completedJobs.length / (Date.now() - startTime)) * 60000;
      const peakMemoryMB = Math.max(...memoryUsage);
      
      expect(throughput).toBeGreaterThan(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE * 0.7);
      expect(peakMemoryMB).toBeLessThan(PERFORMANCE_REQUIREMENTS.MAX_MEMORY_USAGE_MB);
      expect(completedJobs.length).toBeGreaterThan(jobCount * 0.8);
    }, 50000);
  });

  describe('Stress Testing', () => {
    test('should handle sustained high load', async () => {
      const duration = 30000; // 30 seconds
      const targetRate = PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE * 1.5; // 150 jobs/min
      const submissionRate = Math.floor(targetRate / 60 * 1000); // jobs per second
      
      // Mock fast execution
      service.executeJobByType = jest.fn().mockImplementation(async () => {
        await performanceHelpers.delay(50 + Math.random() * 100);
        return { processed: true };
      });
      
      service.restartProcessing();
      
      let jobsSubmitted = 0;
      const startTime = Date.now();
      
      // Sustained job submission
      const submissionInterval = setInterval(() => {
        for (let i = 0; i < Math.ceil(submissionRate / 10); i++) {
          service.addJob('stress_test', `TICKER_${jobsSubmitted}`, {
            index: jobsSubmitted,
            submittedAt: Date.now()
          });
          jobsSubmitted++;
        }
      }, 100); // Submit every 100ms
      
      // Monitor performance metrics
      const performanceMetrics = [];
      const metricsInterval = setInterval(() => {
        const stats = service.getQueueStats();
        const currentTime = Date.now();
        
        performanceMetrics.push({
          time: currentTime - startTime,
          totalJobs: stats.total,
          pending: stats.pending,
          running: stats.running,
          completed: stats.completed,
          failed: stats.failed,
          submissionRate: (jobsSubmitted / (currentTime - startTime)) * 1000,
          throughput: (stats.completed / (currentTime - startTime)) * 60000
        });
      }, 1000);
      
      // Run stress test
      await performanceHelpers.delay(duration);
      
      clearInterval(submissionInterval);
      clearInterval(metricsInterval);
      
      // Allow processing to catch up
      await performanceHelpers.delay(5000);
      
      const finalStats = service.getQueueStats();
      const totalTime = Date.now() - startTime;
      const overallThroughput = (finalStats.completed / totalTime) * 60000;
      
      expect(jobsSubmitted).toBeGreaterThan(targetRate / 2); // At least half target rate
      expect(finalStats.completed).toBeGreaterThan(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE);
      expect(overallThroughput).toBeGreaterThan(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE * 0.8);
      expect(finalStats.failed).toBeLessThan(finalStats.total * 0.05); // <5% failure rate
      
      // Verify sustained performance
      const lastFiveMetrics = performanceMetrics.slice(-5);
      const avgRecentThroughput = lastFiveMetrics.reduce((sum, m) => sum + m.throughput, 0) / lastFiveMetrics.length;
      expect(avgRecentThroughput).toBeGreaterThan(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE * 0.7);
    }, 40000);

    test('should recover from processing bottlenecks', async () => {
      let processingDelay = 500; // Start with slow processing
      const jobCount = 100;
      
      service.executeJobByType = jest.fn().mockImplementation(async (context) => {
        await performanceHelpers.delay(processingDelay);
        return { processed: true, delay: processingDelay };
      });
      
      // Submit jobs during bottleneck
      const jobIds = [];
      for (let i = 0; i < jobCount; i++) {
        jobIds.push(
          service.addJob('bottleneck_test', `TICKER_${i}`, { index: i })
        );
      }
      
      service.restartProcessing();
      const startTime = Date.now();
      
      // Monitor queue buildup
      let maxQueueSize = 0;
      const monitorInterval = setInterval(() => {
        const stats = service.getQueueStats();
        maxQueueSize = Math.max(maxQueueSize, stats.pending + stats.running);
        
        // After 10 seconds, speed up processing (bottleneck resolved)
        if (Date.now() - startTime > 10000 && processingDelay > 100) {
          processingDelay = 100;
        }
      }, 1000);
      
      // Wait for recovery
      while (Date.now() - startTime < 30000) {
        const stats = service.getQueueStats();
        if (stats.completed >= jobCount * 0.9) {
          break;
        }
        await performanceHelpers.delay(500);
      }
      
      clearInterval(monitorInterval);
      
      const finalStats = service.getQueueStats();
      const totalTime = Date.now() - startTime;
      
      expect(maxQueueSize).toBeGreaterThan(20); // Queue should have built up
      expect(finalStats.completed).toBeGreaterThan(jobCount * 0.8);
      
      // Should recover to good throughput after bottleneck resolved
      const finalThroughput = (finalStats.completed / totalTime) * 60000;
      expect(finalThroughput).toBeGreaterThan(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE * 0.6);
    }, 35000);
  });

  describe('Resource Utilization', () => {
    test('should optimize memory usage', async () => {
      const jobCount = 200;
      const largeDataSize = 50 * 1024; // 50KB per job
      
      // Create jobs with substantial data
      const jobIds = [];
      for (let i = 0; i < jobCount; i++) {
        jobIds.push(
          service.addJob('memory_test', `TICKER_${i}`, {
            index: i,
            largePayload: 'x'.repeat(largeDataSize),
            metadata: {
              created: new Date(),
              tags: Array.from({ length: 100 }, (_, j) => `tag-${i}-${j}`)
            }
          })
        );
      }
      
      const initialMemory = process.memoryUsage();
      
      // Process some jobs and monitor memory
      service.executeJobByType = jest.fn().mockImplementation(async () => {
        await performanceHelpers.delay(100);
        return { processed: true };
      });
      
      service.restartProcessing();
      
      // Monitor memory during processing
      const memoryReadings = [];
      const memoryInterval = setInterval(() => {
        const usage = process.memoryUsage();
        memoryReadings.push({
          heapUsed: usage.heapUsed,
          heapTotal: usage.heapTotal,
          external: usage.external,
          timestamp: Date.now()
        });
      }, 1000);
      
      // Process jobs
      await performanceHelpers.delay(15000);
      clearInterval(memoryInterval);
      
      const finalStats = service.getQueueStats();
      const finalMemory = process.memoryUsage();
      
      // Clean up old jobs to test memory release
      service.clearOldJobs(0);
      global.gc && global.gc();
      
      await performanceHelpers.delay(1000);
      const cleanupMemory = process.memoryUsage();
      
      // Memory should be managed efficiently
      const peakMemoryMB = Math.max(...memoryReadings.map(r => r.heapUsed)) / 1024 / 1024;
      const memoryGrowthMB = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      
      expect(peakMemoryMB).toBeLessThan(PERFORMANCE_REQUIREMENTS.MAX_MEMORY_USAGE_MB);
      expect(memoryGrowthMB).toBeLessThan(jobCount * largeDataSize / 1024 / 1024 * 0.5); // Should be < 50% of data size
      expect(finalStats.completed).toBeGreaterThan(0);
      
      // Memory should decrease after cleanup
      expect(cleanupMemory.heapUsed).toBeLessThanOrEqual(finalMemory.heapUsed);
    }, 20000);

    test('should handle CPU-intensive jobs efficiently', async () => {
      const jobCount = 50;
      let cpuUsageSum = 0;
      let cpuMeasurements = 0;
      
      // Mock CPU-intensive work
      service.executeJobByType = jest.fn().mockImplementation(async (context) => {
        const start = process.hrtime.bigint();
        
        // Simulate CPU work (prime calculation)
        let primes = 0;
        for (let i = 2; i < 10000; i++) {
          let isPrime = true;
          for (let j = 2; j < Math.sqrt(i); j++) {
            if (i % j === 0) {
              isPrime = false;
              break;
            }
          }
          if (isPrime) primes++;
        }
        
        const end = process.hrtime.bigint();
        const cpuTime = Number(end - start) / 1000000; // Convert to ms
        
        return { 
          processed: true, 
          primesFound: primes,
          cpuTime 
        };
      });
      
      // Submit CPU-intensive jobs
      const jobIds = [];
      for (let i = 0; i < jobCount; i++) {
        jobIds.push(
          service.addJob('cpu_intensive', `TICKER_${i}`, { index: i })
        );
      }
      
      service.restartProcessing();
      const startTime = Date.now();
      
      // Monitor CPU usage
      const cpuInterval = setInterval(() => {
        // Simple CPU usage estimation
        const usage = process.cpuUsage();
        const userCpuPercent = (usage.user / 1000 / 10) * 100; // Rough estimation
        
        cpuUsageSum += userCpuPercent;
        cpuMeasurements++;
      }, 1000);
      
      // Wait for completion
      while (Date.now() - startTime < 25000) {
        const completed = service.getJobsByStatus('completed');
        if (completed.length >= jobCount) {
          break;
        }
        await performanceHelpers.delay(500);
      }
      
      clearInterval(cpuInterval);
      
      const completedJobs = service.getJobsByStatus('completed');
      const totalTime = Date.now() - startTime;
      const throughput = (completedJobs.length / totalTime) * 60000;
      
      // Should still maintain reasonable throughput with CPU-intensive work
      expect(completedJobs.length).toBe(jobCount);
      expect(throughput).toBeGreaterThan(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE * 0.5);
      
      // Verify CPU work was done
      const validResults = completedJobs.filter(job => 
        job.result?.primesFound > 0 && job.result?.cpuTime > 0
      );
      expect(validResults).toHaveLength(jobCount);
    }, 30000);
  });

  describe('Performance Regression Detection', () => {
    test('should detect performance degradation', async () => {
      const baselineJobs = 30;
      const testJobs = 30;
      
      // Baseline performance
      service.executeJobByType = jest.fn().mockImplementation(async () => {
        await performanceHelpers.delay(100); // Fast execution
        return { processed: true, version: 'baseline' };
      });
      
      // Run baseline
      for (let i = 0; i < baselineJobs; i++) {
        service.addJob('baseline_test', `BASELINE_${i}`, { index: i });
      }
      
      service.restartProcessing();
      const baselineStart = Date.now();
      
      while (service.getJobsByStatus('completed').length < baselineJobs) {
        await performanceHelpers.delay(100);
      }
      
      const baselineTime = Date.now() - baselineStart;
      const baselineThroughput = (baselineJobs / baselineTime) * 60000;
      
      // Clear completed jobs
      service.clearOldJobs(0);
      
      // Test performance with degradation
      service.executeJobByType = jest.fn().mockImplementation(async () => {
        await performanceHelpers.delay(300); // Slower execution (degraded)
        return { processed: true, version: 'degraded' };
      });
      
      // Run test
      for (let i = 0; i < testJobs; i++) {
        service.addJob('degraded_test', `DEGRADED_${i}`, { index: i });
      }
      
      const testStart = Date.now();
      
      while (service.getJobsByStatus('completed').length < testJobs) {
        await performanceHelpers.delay(100);
      }
      
      const testTime = Date.now() - testStart;
      const testThroughput = (testJobs / testTime) * 60000;
      
      // Detect significant performance regression
      const performanceRatio = testThroughput / baselineThroughput;
      const isRegression = performanceRatio < 0.7; // 30% degradation threshold
      
      expect(baselineThroughput).toBeGreaterThan(PERFORMANCE_REQUIREMENTS.JOBS_PER_MINUTE);
      expect(isRegression).toBe(true); // We expect to detect the intentional degradation
      expect(performanceRatio).toBeLessThan(0.7);
      
      console.log(`Performance regression detected: ${(performanceRatio * 100).toFixed(1)}% of baseline`);
    }, 20000);
  });
});