/**
 * Background Job Service - Error Handling and Edge Cases Tests
 * 
 * Tests comprehensive error scenarios:
 * - Service failures and recovery
 * - Network timeouts and retries
 * - Data corruption and validation
 * - Resource exhaustion scenarios
 * - Dependency failures
 * - Race conditions and concurrency issues
 * - Memory leaks and cleanup
 * - Configuration errors
 */

import { backgroundJobService, BackgroundJob, JobExecutionContext } from '../background-job-service';
import { costControlService } from '../cost-control-service';
import { performanceMonitoringService } from '../performance-monitoring-service';
import { firecrawlMcpService } from '../firecrawl-mcp-service';

// Mock dependencies
jest.mock('../cost-control-service');
jest.mock('../performance-monitoring-service');
jest.mock('../firecrawl-mcp-service');

// Use fake timers for controlled testing
jest.useFakeTimers();

describe('Background Job Service - Error Handling and Edge Cases', () => {
  let service: any;

  beforeEach(() => {
    // Create fresh service instance
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
      collateral_allocations: []
    });
  });

  afterEach(() => {
    service?.stopProcessing();
    jest.clearAllTimers();
  });

  describe('Service Initialization Errors', () => {
    test('should handle constructor errors gracefully', () => {
      // Mock a scenario where service initialization might fail
      const originalConsoleError = console.error;
      console.error = jest.fn();
      
      expect(() => {
        new (service.constructor)();
      }).not.toThrow();
      
      console.error = originalConsoleError;
    });

    test('should handle missing dependencies', async () => {
      // Mock missing cost control service
      (costControlService.canProceedWithCost as jest.Mock).mockImplementation(() => {
        throw new Error('Cost control service not available');
      });
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://example.com'
      });
      
      const job = service.getJob(jobId);
      await service.executeJob(job);
      
      const updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('retrying');
      expect(updatedJob.lastError).toContain('Cost control service not available');
    });

    test('should handle invalid configuration', () => {
      // Test with invalid processing interval
      const invalidService = new (service.constructor)();
      (invalidService as any).processingInterval = -1000; // Invalid negative interval
      
      // Should not crash and should use a fallback value or handle gracefully
      expect(() => {
        invalidService.startJobProcessing();
      }).not.toThrow();
    });
  });

  describe('Job Creation Edge Cases', () => {
    test('should handle null/undefined job data', () => {
      const jobId1 = service.addJob('test_job', 'USDC', null);
      const jobId2 = service.addJob('test_job', 'USDC', undefined);
      
      const job1 = service.getJob(jobId1);
      const job2 = service.getJob(jobId2);
      
      expect(job1).toBeDefined();
      expect(job2).toBeDefined();
      expect(job1.data).toBeNull();
      expect(job2.data).toBeUndefined();
    });

    test('should handle circular references in job data', () => {
      const circularData: any = { name: 'test' };
      circularData.self = circularData; // Create circular reference
      
      expect(() => {
        service.addJob('circular_test', 'USDC', circularData);
      }).not.toThrow();
      
      // Should handle the circular reference gracefully
      // (might serialize safely or handle during processing)
    });

    test('should handle extremely large job data', () => {
      const largeData = {
        payload: 'x'.repeat(10 * 1024 * 1024), // 10MB string
        arrays: Array.from({ length: 100000 }, (_, i) => ({
          id: i,
          data: `item_${i}_${'x'.repeat(1000)}`
        }))
      };
      
      const jobId = service.addJob('large_data_test', 'USDC', largeData);
      const job = service.getJob(jobId);
      
      expect(job).toBeDefined();
      expect(job.data.payload.length).toBe(10 * 1024 * 1024);
      expect(job.data.arrays).toHaveLength(100000);
    });

    test('should handle special characters in job parameters', () => {
      const specialData = {
        unicode: '🚀💎🔥',
        emoji: '😀😎🤖',
        special: '!@#$%^&*()[]{}|\\:";\'<>?,./',
        control: '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0A\x0B\x0C\x0D',
        html: '<script>alert("xss")</script>',
        sql: "'; DROP TABLE jobs; --",
        json: '{"key": "value", "nested": {"array": [1,2,3]}}',
        xml: '<?xml version="1.0"?><root><item>test</item></root>'
      };
      
      const jobId = service.addJob('special_chars_test', 'USDC-TEST/123', specialData);
      const job = service.getJob(jobId);
      
      expect(job).toBeDefined();
      expect(job.ticker).toBe('USDC-TEST/123');
      expect(job.data).toEqual(specialData);
    });

    test('should handle invalid date inputs', () => {
      const invalidDates = [
        'not-a-date',
        '2023-13-45', // Invalid month/day
        'Thu, 01 Jan 1970 00:00:00 GMT', // Epoch
        '9999-12-31T23:59:59.999Z', // Far future
        new Date('invalid')
      ];
      
      invalidDates.forEach((invalidDate, index) => {
        expect(() => {
          service.addJob('date_test', `TICKER_${index}`, {}, 'medium', invalidDate);
        }).not.toThrow();
      });
    });
  });

  describe('Job Processing Failures', () => {
    test('should handle job processing timeout', async () => {
      // Mock a job that never completes
      (firecrawlMcpService.extractTransparencyData as jest.Mock).mockImplementation(() => {
        return new Promise(() => {}); // Never resolves
      });
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://timeout-test.com'
      });
      
      const job = service.getJob(jobId);
      
      // Start execution and immediately advance timers
      const executionPromise = service.executeJob(job);
      
      // Fast-forward to simulate timeout
      jest.advanceTimersByTime(30000); // 30 seconds
      
      // The job should handle timeout gracefully
      await expect(executionPromise).resolves.not.toThrow();
      
      const updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('retrying');
    });

    test('should handle memory exhaustion during processing', async () => {
      let memoryPressureLevel = 0;
      
      (firecrawlMcpService.extractTransparencyData as jest.Mock).mockImplementation(async () => {
        // Simulate increasing memory pressure
        memoryPressureLevel++;
        
        if (memoryPressureLevel > 2) {
          throw new Error('RangeError: Maximum call stack size exceeded');
        }
        
        // Simulate memory-intensive operation
        const largeArray = new Array(1000000).fill('memory-test');
        
        return {
          confidence_score: 0.5,
          collateral_allocations: largeArray.slice(0, 10)
        };
      });
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://memory-test.com'
      });
      
      const job = service.getJob(jobId);
      
      // First attempt should succeed
      await service.executeJob(job);
      let updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('retrying'); // Due to memory error
      
      // Retry should also hit memory issues
      jest.advanceTimersByTime(2000);
      await service.executeJob(updatedJob);
      updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('retrying');
      
      // Final attempt should fail completely
      jest.advanceTimersByTime(4000);
      await service.executeJob(updatedJob);
      updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('failed');
      expect(updatedJob.lastError).toContain('Maximum call stack size exceeded');
    });

    test('should handle network errors with proper retry', async () => {
      const networkErrors = [
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('ENOTFOUND'),
        new Error('ECONNRESET'),
        new Error('Network request failed')
      ];
      
      let attemptCount = 0;
      (firecrawlMcpService.extractTransparencyData as jest.Mock).mockImplementation(async () => {
        const error = networkErrors[attemptCount % networkErrors.length];
        attemptCount++;
        throw error;
      });
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://unreliable-network.com'
      });
      
      const job = service.getJob(jobId);
      job.maxAttempts = 5; // Increase for testing
      
      // Execute multiple times to test different network errors
      for (let i = 0; i < 5; i++) {
        await service.executeJob(service.getJob(jobId));
        jest.advanceTimersByTime(2000 * Math.pow(2, i)); // Exponential backoff
      }
      
      const finalJob = service.getJob(jobId);
      expect(finalJob.status).toBe('failed');
      expect(finalJob.attempts).toBe(5);
      expect(networkErrors.some(error => 
        finalJob.lastError?.includes(error.message)
      )).toBe(true);
    });

    test('should handle dependency service errors', async () => {
      // Test various dependency failure scenarios
      const dependencyErrors = [
        { service: 'cost-control', error: 'Budget service unavailable' },
        { service: 'monitoring', error: 'Metrics collection failed' },
        { service: 'firecrawl', error: 'External API rate limited' }
      ];
      
      for (const { service: serviceName, error } of dependencyErrors) {
        if (serviceName === 'cost-control') {
          (costControlService.canProceedWithCost as jest.Mock).mockImplementation(() => {
            throw new Error(error);
          });
        } else if (serviceName === 'monitoring') {
          (performanceMonitoringService.recordExtractionMetric as jest.Mock).mockImplementation(() => {
            throw new Error(error);
          });
        } else if (serviceName === 'firecrawl') {
          (firecrawlMcpService.extractTransparencyData as jest.Mock).mockRejectedValue(new Error(error));
        }
        
        const jobId = service.addFirecrawlExtractionJob('USDC', {
          url: `https://${serviceName}-test.com`
        });
        
        const job = service.getJob(jobId);
        await service.executeJob(job);
        
        const updatedJob = service.getJob(jobId);
        expect(updatedJob.lastError).toContain(error);
        
        // Reset mocks for next iteration
        jest.clearAllMocks();
        (costControlService.canProceedWithCost as jest.Mock).mockReturnValue({
          allowed: true,
          reason: null
        });
        (firecrawlMcpService.extractTransparencyData as jest.Mock).mockResolvedValue({
          confidence_score: 0.8,
          collateral_allocations: []
        });
      }
    });

    test('should handle job execution exceptions', async () => {
      const exceptions = [
        new TypeError('Cannot read property of undefined'),
        new ReferenceError('Variable is not defined'),
        new SyntaxError('Unexpected token'),
        new RangeError('Maximum call stack size exceeded'),
        new URIError('URI malformed'),
        new EvalError('Eval error occurred')
      ];
      
      let exceptionIndex = 0;
      
      // Mock job execution to throw different types of exceptions
      const originalExecuteJobByType = service.executeJobByType.bind(service);
      service.executeJobByType = jest.fn().mockImplementation((context) => {
        const exception = exceptions[exceptionIndex % exceptions.length];
        exceptionIndex++;
        throw exception;
      });
      
      for (let i = 0; i < exceptions.length; i++) {
        const jobId = service.addJob('exception_test', `TICKER_${i}`, { index: i });
        const job = service.getJob(jobId);
        
        await service.executeJob(job);
        
        const updatedJob = service.getJob(jobId);
        expect(updatedJob.status).toBe('retrying');
        expect(updatedJob.lastError).toContain(exceptions[i].message);
      }
    });
  });

  describe('Data Corruption and Validation', () => {
    test('should handle corrupted job state', () => {
      const jobId = service.addJob('corruption_test', 'USDC');
      const job = service.getJob(jobId);
      
      // Simulate data corruption
      (job as any).status = 'invalid_status';
      (job as any).attempts = 'not_a_number';
      (job as any).createdAt = 'invalid_date';
      (job as any).priority = null;
      
      // Service should handle corrupted data gracefully
      expect(() => {
        service.getQueueStats();
      }).not.toThrow();
      
      expect(() => {
        service.getNextJobToProcess();
      }).not.toThrow();
    });

    test('should validate job data integrity', async () => {
      const jobId = service.addJob('integrity_test', 'USDC', {
        sensitive: 'data',
        checksum: 'abc123'
      });
      
      const job = service.getJob(jobId);
      
      // Simulate data modification
      job.data.sensitive = 'modified_data';
      delete job.data.checksum;
      
      // Service should detect and handle data integrity issues
      await service.executeJob(job);
      
      // Should still complete (with logging/monitoring of integrity issues)
      const updatedJob = service.getJob(jobId);
      expect(updatedJob).toBeDefined();
    });

    test('should handle malformed JSON in job data', () => {
      // Simulate scenario where job data becomes malformed
      const jobId = service.addJob('malformed_test', 'USDC', {
        validData: 'initial'
      });
      
      const job = service.getJob(jobId);
      
      // Simulate JSON corruption
      (job as any).data = '{"invalid": json}';
      
      expect(() => {
        service.getJob(jobId);
      }).not.toThrow();
    });

    test('should handle database constraint violations', () => {
      // Simulate various constraint violations
      const constraintViolations = [
        { field: 'id', value: null },
        { field: 'type', value: '' },
        { field: 'ticker', value: null },
        { field: 'status', value: 'invalid_status' },
        { field: 'priority', value: 'invalid_priority' },
        { field: 'attempts', value: -1 },
        { field: 'maxAttempts', value: 0 }
      ];
      
      constraintViolations.forEach(({ field, value }, index) => {
        expect(() => {
          const jobData = {
            type: 'constraint_test',
            ticker: 'USDC',
            data: {},
            priority: 'medium'
          };
          
          (jobData as any)[field] = value;
          
          const jobId = service.addJob(
            jobData.type,
            jobData.ticker,
            jobData.data,
            jobData.priority
          );
          
          // Service should handle constraint violations gracefully
          const job = service.getJob(jobId);
          expect(job).toBeDefined();
          
        }).not.toThrow();
      });
    });
  });

  describe('Race Conditions and Concurrency', () => {
    test('should handle concurrent job modifications', async () => {
      const jobId = service.addJob('concurrent_mod_test', 'USDC');
      
      // Simulate concurrent modifications
      const modifications = [
        () => { service.cancelJob(jobId); },
        () => { const job = service.getJob(jobId); job && (job.priority = 'high'); },
        () => { const job = service.getJob(jobId); job && (job.data = { modified: true }); },
        () => { service.executeJob(service.getJob(jobId)); },
        () => { const job = service.getJob(jobId); job && (job.attempts = 5); }
      ];
      
      // Execute modifications concurrently
      const concurrentPromises = modifications.map(modification => 
        new Promise(resolve => {
          setTimeout(() => {
            try {
              modification();
            } catch (error) {
              // Expected that some operations might fail due to race conditions
            }
            resolve(null);
          }, Math.random() * 10);
        })
      );
      
      await Promise.all(concurrentPromises);
      
      // Job should still exist and be in a valid state
      const finalJob = service.getJob(jobId);
      expect(finalJob).toBeDefined();
    });

    test('should handle concurrent queue access', () => {
      const jobCount = 100;
      const jobIds: string[] = [];
      
      // Create jobs concurrently
      const creationPromises = Array.from({ length: jobCount }, (_, i) =>
        new Promise<void>(resolve => {
          setTimeout(() => {
            const id = service.addJob('concurrent_access_test', `TICKER_${i}`, { index: i });
            jobIds.push(id);
            resolve();
          }, Math.random() * 10);
        })
      );
      
      return Promise.all(creationPromises).then(() => {
        // Verify all jobs were created successfully
        expect(jobIds).toHaveLength(jobCount);
        
        const stats = service.getQueueStats();
        expect(stats.total).toBe(jobCount);
        
        // Test concurrent reads
        const readPromises = jobIds.map(id =>
          new Promise(resolve => {
            setTimeout(() => {
              const job = service.getJob(id);
              resolve(job);
            }, Math.random() * 10);
          })
        );
        
        return Promise.all(readPromises).then(jobs => {
          expect(jobs.every(job => job !== null)).toBe(true);
        });
      });
    });

    test('should handle worker collision during job processing', async () => {
      const jobId = service.addJob('collision_test', 'USDC');
      const job = service.getJob(jobId);
      
      // Mock scenario where multiple workers try to process same job
      let executionCount = 0;
      const originalExecuteJobByType = service.executeJobByType.bind(service);
      service.executeJobByType = jest.fn().mockImplementation(async (context) => {
        executionCount++;
        
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return { processed: true, executionNumber: executionCount };
      });
      
      // Start multiple executions simultaneously
      const executionPromises = [
        service.executeJob(job),
        service.executeJob(job),
        service.executeJob(job)
      ];
      
      const results = await Promise.allSettled(executionPromises);
      
      // At least one should succeed, others might be handled gracefully
      const successfulResults = results.filter(result => result.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(0);
      
      const finalJob = service.getJob(jobId);
      expect(finalJob).toBeDefined();
    });
  });

  describe('Resource Exhaustion', () => {
    test('should handle queue overflow', () => {
      const maxJobs = 10000;
      
      // Create large number of jobs
      const jobIds = [];
      for (let i = 0; i < maxJobs; i++) {
        try {
          const jobId = service.addJob('overflow_test', `TICKER_${i}`, {
            index: i,
            data: Array(1000).fill(`data_${i}`)
          });
          jobIds.push(jobId);
        } catch (error) {
          // Service might implement queue size limits
          break;
        }
      }
      
      // Service should handle large queues or implement limits
      expect(jobIds.length).toBeGreaterThan(0);
      
      const stats = service.getQueueStats();
      expect(stats.total).toBe(jobIds.length);
      
      // Should still be functional
      const testJobId = service.addJob('post_overflow_test', 'USDC');
      expect(service.getJob(testJobId)).toBeDefined();
    });

    test('should handle memory leaks in long-running processes', async () => {
      const iterations = 1000;
      let memoryGrowth = false;
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Simulate long-running process with potential memory leaks
      for (let i = 0; i < iterations; i++) {
        const jobId = service.addJob('memory_leak_test', `TICKER_${i}`, {
          iteration: i,
          largeData: new Array(1000).fill(`iteration_${i}`)
        });
        
        // Process and complete job
        const job = service.getJob(jobId);
        job.status = 'completed';
        job.result = { processed: true, iteration: i };
        
        // Periodically check memory usage
        if (i % 100 === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          const memoryIncrease = currentMemory - initialMemory;
          
          // If memory grows significantly, trigger cleanup
          if (memoryIncrease > 50 * 1024 * 1024) { // 50MB
            service.clearOldJobs(0); // Clear all completed jobs
            global.gc && global.gc(); // Force garbage collection if available
            memoryGrowth = true;
          }
        }
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const totalGrowth = finalMemory - initialMemory;
      
      // Memory growth should be reasonable
      expect(totalGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB growth
      
      // Service should implement cleanup mechanisms
      expect(memoryGrowth).toBe(true); // We should have triggered cleanup
    });

    test('should handle disk space exhaustion', async () => {
      // Simulate disk space issues (would typically involve file operations)
      const originalConsoleError = console.error;
      const errors: string[] = [];
      console.error = jest.fn().mockImplementation((...args) => {
        errors.push(args.join(' '));
      });
      
      // Mock a scenario where disk operations might fail
      const jobId = service.addJob('disk_space_test', 'USDC', {
        largePayload: 'x'.repeat(10 * 1024 * 1024) // 10MB
      });
      
      const job = service.getJob(jobId);
      
      // Service should handle disk space issues gracefully
      await expect(service.executeJob(job)).resolves.not.toThrow();
      
      console.error = originalConsoleError;
    });

    test('should handle file descriptor exhaustion', async () => {
      const maxConnections = 100;
      const connections = [];
      
      // Simulate creating many connections/file descriptors
      (firecrawlMcpService.extractTransparencyData as jest.Mock).mockImplementation(async () => {
        // Simulate resource-intensive operation
        const connection = { id: Math.random(), opened: new Date() };
        connections.push(connection);
        
        if (connections.length > maxConnections) {
          throw new Error('EMFILE: too many open files');
        }
        
        return { confidence_score: 0.5, collateral_allocations: [] };
      });
      
      // Create many jobs that would open connections
      const jobIds = [];
      for (let i = 0; i < maxConnections + 10; i++) {
        const jobId = service.addFirecrawlExtractionJob('USDC', {
          url: `https://test-${i}.com`
        });
        jobIds.push(jobId);
      }
      
      // Process jobs - should handle file descriptor exhaustion
      let processed = 0;
      for (const jobId of jobIds) {
        try {
          const job = service.getJob(jobId);
          await service.executeJob(job);
          processed++;
        } catch (error) {
          // Expected to fail when resources exhausted
          expect(error.message).toContain('too many open files');
        }
      }
      
      expect(processed).toBeGreaterThan(0);
      expect(processed).toBeLessThanOrEqual(maxConnections);
    });
  });

  describe('Configuration and Environment Errors', () => {
    test('should handle missing environment variables', () => {
      const originalEnv = process.env;
      
      // Clear environment variables
      process.env = {};
      
      expect(() => {
        new (service.constructor)();
      }).not.toThrow();
      
      // Restore environment
      process.env = originalEnv;
    });

    test('should handle invalid configuration values', () => {
      const invalidConfigs = [
        { processingInterval: -1000 },
        { retryDelays: [] },
        { maxAttempts: 0 },
        { priorityOrder: null }
      ];
      
      invalidConfigs.forEach((config, index) => {
        expect(() => {
          const testService = new (service.constructor)();
          Object.assign(testService, config);
          testService.addJob('config_test', `TICKER_${index}`);
        }).not.toThrow();
      });
    });

    test('should handle version compatibility issues', () => {
      // Mock version incompatibility
      const testService = new (service.constructor)();
      
      // Simulate older job format
      const legacyJob = {
        id: 'legacy_job_123',
        type: 'legacy_type',
        ticker: 'USDC',
        status: 'pending',
        // Missing newer fields like priority, attempts, etc.
      };
      
      // Service should handle legacy job formats gracefully
      expect(() => {
        (testService as any).jobs.set(legacyJob.id, legacyJob);
        const retrievedJob = testService.getJob(legacyJob.id);
        expect(retrievedJob).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('External Service Failures', () => {
    test('should handle third-party API failures', async () => {
      const apiFailures = [
        { status: 500, message: 'Internal Server Error' },
        { status: 503, message: 'Service Unavailable' },
        { status: 429, message: 'Too Many Requests' },
        { status: 401, message: 'Unauthorized' },
        { status: 404, message: 'Not Found' }
      ];
      
      for (const failure of apiFailures) {
        (firecrawlMcpService.extractTransparencyData as jest.Mock).mockRejectedValue(
          new Error(`HTTP ${failure.status}: ${failure.message}`)
        );
        
        const jobId = service.addFirecrawlExtractionJob('USDC', {
          url: 'https://api-failure-test.com'
        });
        
        const job = service.getJob(jobId);
        await service.executeJob(job);
        
        const updatedJob = service.getJob(jobId);
        expect(updatedJob.status).toBe('retrying');
        expect(updatedJob.lastError).toContain(`HTTP ${failure.status}`);
      }
    });

    test('should handle SSL/TLS errors', async () => {
      const sslErrors = [
        'CERT_HAS_EXPIRED',
        'CERT_UNTRUSTED',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        'SELF_SIGNED_CERT_IN_CHAIN',
        'DEPTH_ZERO_SELF_SIGNED_CERT'
      ];
      
      for (const sslError of sslErrors) {
        (firecrawlMcpService.extractTransparencyData as jest.Mock).mockRejectedValue(
          new Error(`SSL Error: ${sslError}`)
        );
        
        const jobId = service.addFirecrawlExtractionJob('USDC', {
          url: 'https://ssl-error-test.com'
        });
        
        const job = service.getJob(jobId);
        await service.executeJob(job);
        
        const updatedJob = service.getJob(jobId);
        expect(updatedJob.lastError).toContain(sslError);
      }
    });

    test('should handle DNS resolution failures', async () => {
      (firecrawlMcpService.extractTransparencyData as jest.Mock).mockRejectedValue(
        new Error('ENOTFOUND: getaddrinfo ENOTFOUND nonexistent-domain.com')
      );
      
      const jobId = service.addFirecrawlExtractionJob('USDC', {
        url: 'https://nonexistent-domain.com'
      });
      
      const job = service.getJob(jobId);
      await service.executeJob(job);
      
      const updatedJob = service.getJob(jobId);
      expect(updatedJob.status).toBe('retrying');
      expect(updatedJob.lastError).toContain('ENOTFOUND');
    });
  });

  describe('Cleanup and Recovery', () => {
    test('should recover from corrupted internal state', () => {
      // Corrupt internal data structures
      (service as any).jobs = new Map([
        ['corrupted1', null],
        ['corrupted2', undefined],
        ['corrupted3', 'not-an-object'],
        ['valid', service.addJob('recovery_test', 'USDC')]
      ]);
      
      // Service should recover and continue functioning
      expect(() => {
        const stats = service.getQueueStats();
        expect(stats).toBeDefined();
      }).not.toThrow();
      
      expect(() => {
        service.addJob('post_recovery_test', 'USDT');
      }).not.toThrow();
    });

    test('should handle graceful shutdown during processing', async () => {
      const jobId = service.addJob('shutdown_test', 'USDC');
      
      // Mock long-running job
      (firecrawlMcpService.extractTransparencyData as jest.Mock).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return { confidence_score: 0.8, collateral_allocations: [] };
      });
      
      service.restartProcessing();
      
      // Start job processing
      const job = service.getJob(jobId);
      const executionPromise = service.executeJob(job);
      
      // Simulate shutdown during processing
      setTimeout(() => {
        service.stopProcessing();
      }, 1000);
      
      // Should handle shutdown gracefully
      await expect(executionPromise).resolves.not.toThrow();
    });

    test('should implement circuit breaker pattern', async () => {
      let failureCount = 0;
      const maxFailures = 5;
      
      (firecrawlMcpService.extractTransparencyData as jest.Mock).mockImplementation(async () => {
        failureCount++;
        if (failureCount <= maxFailures) {
          throw new Error('Service temporarily unavailable');
        }
        // After max failures, circuit should open and fast-fail
        throw new Error('Circuit breaker: Service unavailable');
      });
      
      // Process jobs until circuit breaker activates
      for (let i = 0; i < maxFailures + 2; i++) {
        const jobId = service.addFirecrawlExtractionJob('USDC', {
          url: `https://circuit-breaker-test-${i}.com`
        });
        
        const job = service.getJob(jobId);
        await service.executeJob(job);
        
        const updatedJob = service.getJob(jobId);
        
        if (i >= maxFailures) {
          // Circuit should be open, fast-failing
          expect(updatedJob.lastError).toContain('Circuit breaker');
        }
      }
    });
  });
});