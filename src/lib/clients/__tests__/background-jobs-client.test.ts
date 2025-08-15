/**
 * Background Jobs Client Integration Tests
 * 
 * Tests for the BackgroundJobsClient including:
 * - Job submission and retrieval
 * - Circuit breaker functionality
 * - Fallback mechanisms
 * - Error handling
 * - Health checks
 */

import { BackgroundJobsClient } from '../background-jobs-client'
import { JobStatus, JobPriority } from '../../../background-jobs-service/src/types'

// Mock the background job service
jest.mock('../../services/background-job-service', () => ({
  backgroundJobService: {
    addJob: jest.fn().mockReturnValue('local-job-123'),
    getJob: jest.fn(),
    getAllJobs: jest.fn().mockReturnValue([]),
    cancelJob: jest.fn().mockReturnValue(true),
    getQueueStats: jest.fn().mockReturnValue({
      total: 5,
      pending: 2,
      running: 1,
      completed: 2,
      failed: 0,
      retrying: 0,
      cancelled: 0
    })
  }
}))

// Mock fetch globally
global.fetch = jest.fn()

describe('BackgroundJobsClient', () => {
  let client: BackgroundJobsClient
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()
    
    // Create a new client instance for each test with test configuration
    client = BackgroundJobsClient.getInstance({
      baseUrl: 'http://localhost:3003',
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100,
      enableFallback: true,
      circuitBreakerThreshold: 2,
      circuitBreakerResetTimeout: 1000
    })
  })

  describe('Job Submission', () => {
    it('should submit a single job successfully', async () => {
      const mockResponse = {
        jobId: 'remote-job-456',
        status: 'pending',
        message: 'Job submitted successfully'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobId = await client.submitJob('collect-stablecoin-data', {
        ticker: 'USDC',
        sources: ['coingecko']
      })

      expect(jobId).toBe('remote-job-456')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/jobs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            type: 'collect-stablecoin-data',
            data: { ticker: 'USDC', sources: ['coingecko'] },
            options: {}
          })
        })
      )
    })

    it('should fallback to local service when remote fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const jobId = await client.submitJob('collect-stablecoin-data', {
        ticker: 'USDC'
      })

      expect(jobId).toBe('local-job-123')
    })

    it('should submit bulk jobs successfully', async () => {
      const mockResponse = {
        jobIds: ['job-1', 'job-2', 'job-3'],
        count: 3,
        message: 'All jobs submitted successfully'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobs = [
        { type: 'collect-stablecoin-data', data: { ticker: 'USDC' } },
        { type: 'collect-stablecoin-data', data: { ticker: 'USDT' } },
        { type: 'analyze-transparency', data: { ticker: 'DAI', url: 'https://example.com' } }
      ]

      const jobIds = await client.submitJobsBulk(jobs)

      expect(jobIds).toEqual(['job-1', 'job-2', 'job-3'])
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/jobs/bulk',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ jobs })
        })
      )
    })
  })

  describe('Job Status and Monitoring', () => {
    it('should get job status successfully', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'collect-stablecoin-data',
        data: { ticker: 'USDC' },
        status: JobStatus.COMPLETED,
        createdAt: new Date(),
        attempts: 1,
        maxAttempts: 3
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job: mockJob }),
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const job = await client.getJobStatus('job-123')

      expect(job).toEqual(mockJob)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/jobs/job-123',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('should query jobs with filters', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          type: 'collect-stablecoin-data',
          status: JobStatus.PENDING
        },
        {
          id: 'job-2',
          type: 'collect-stablecoin-data',
          status: JobStatus.PROCESSING
        }
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobs: mockJobs }),
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobs = await client.queryJobs({
        type: 'collect-stablecoin-data',
        status: [JobStatus.PENDING, JobStatus.PROCESSING],
        limit: 10
      })

      expect(jobs).toEqual(mockJobs)
    })

    it('should get queue statistics', async () => {
      const mockStats = {
        pending: 5,
        processing: 2,
        delayed: 0,
        completed: 10,
        failed: 1,
        cancelled: 0,
        total: 18,
        processingRate: 0.5,
        averageProcessingTime: 5000,
        errorRate: 5.56
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ statistics: mockStats }),
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const stats = await client.getQueueStatistics()

      expect(stats).toEqual(mockStats)
    })
  })

  describe('Convenience Methods', () => {
    it('should submit stablecoin data job with correct parameters', async () => {
      const mockResponse = { jobId: 'stablecoin-job-123' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobId = await client.submitStablecoinDataJob(
        'USDC',
        ['coingecko', 'geckoterminal'],
        true // urgent
      )

      expect(jobId).toBe('stablecoin-job-123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/jobs',
        expect.objectContaining({
          body: JSON.stringify({
            type: 'collect-stablecoin-data',
            data: {
              ticker: 'USDC',
              sources: ['coingecko', 'geckoterminal'],
              urgent: true
            },
            options: {
              priority: JobPriority.HIGH
            }
          })
        })
      )
    })

    it('should submit transparency analysis job', async () => {
      const mockResponse = { jobId: 'transparency-job-456' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobId = await client.submitTransparencyAnalysisJob(
        'USDC',
        'https://centre.io/usdc-transparency',
        { extractCollateral: true }
      )

      expect(jobId).toBe('transparency-job-456')
    })

    it('should submit cache invalidation job with high priority', async () => {
      const mockResponse = { jobId: 'cache-job-789' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobId = await client.submitCacheInvalidationJob(
        'assessment:*',
        ['assessment:USDC', 'assessment:USDT']
      )

      expect(jobId).toBe('cache-job-789')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/jobs',
        expect.objectContaining({
          body: JSON.stringify({
            type: 'invalidate-cache',
            data: {
              pattern: 'assessment:*',
              keys: ['assessment:USDC', 'assessment:USDT']
            },
            options: {
              priority: JobPriority.HIGH
            }
          })
        })
      )
    })

    it('should submit metrics aggregation job', async () => {
      const mockResponse = { jobId: 'metrics-job-101' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const startTime = new Date('2024-01-01T00:00:00Z')
      const endTime = new Date('2024-01-01T23:59:59Z')

      const jobId = await client.submitMetricsAggregationJob(
        startTime,
        endTime,
        'hour'
      )

      expect(jobId).toBe('metrics-job-101')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/jobs',
        expect.objectContaining({
          body: JSON.stringify({
            type: 'aggregate-metrics',
            data: {
              startTime,
              endTime,
              aggregationLevel: 'hour'
            },
            options: {}
          })
        })
      )
    })
  })

  describe('Circuit Breaker', () => {
    it('should open circuit breaker after threshold failures', async () => {
      // Configure circuit breaker to open after 2 failures
      client.updateConfig({ circuitBreakerThreshold: 2 })

      // First failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await client.submitJob('test-job', {}).catch(() => {})

      // Second failure - should open circuit breaker
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await client.submitJob('test-job', {}).catch(() => {})

      // Third call should immediately fallback without trying remote
      const jobId = await client.submitJob('test-job', {})

      // Should have fallen back to local service
      expect(jobId).toBe('local-job-123')
      // Should have only made 2 network calls, not 3
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should transition to half-open and reset on successful request', async () => {
      client.updateConfig({ 
        circuitBreakerThreshold: 1,
        circuitBreakerResetTimeout: 50 // Very short for testing
      })

      // Cause circuit breaker to open
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await client.submitJob('test-job', {}).catch(() => {})

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 60))

      // Next call should succeed and reset circuit breaker
      const mockResponse = { jobId: 'success-job' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobId = await client.submitJob('test-job', {})
      expect(jobId).toBe('success-job')

      // Circuit breaker should be reset - next call should also try remote
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: 'another-success' }),
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobId2 = await client.submitJob('test-job-2', {})
      expect(jobId2).toBe('another-success')
    })
  })

  describe('Health Checks', () => {
    it('should perform health check successfully', async () => {
      const mockHealthResponse = {
        status: 'healthy',
        details: {
          uptime: 3600,
          activeJobs: 5,
          completedJobs: 100
        }
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHealthResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const healthResult = await client.healthCheck()

      expect(healthResult.service).toBe('background-jobs')
      expect(healthResult.status).toBe('healthy')
      expect(healthResult.details).toEqual(mockHealthResponse.details)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/health',
        expect.objectContaining({
          method: 'GET'
        })
      )
    })

    it('should handle health check failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Service unavailable'))

      const healthResult = await client.healthCheck()

      expect(healthResult.service).toBe('background-jobs')
      expect(healthResult.status).toBe('unhealthy')
      expect(healthResult.error).toBe('Service unavailable')
    })
  })

  describe('Error Handling', () => {
    it('should retry failed requests', async () => {
      client.updateConfig({ retryAttempts: 2, retryDelay: 10 })

      // First call fails
      mockFetch.mockRejectedValueOnce(new Error('Temporary error'))
      
      // Second call succeeds
      const mockResponse = { jobId: 'retry-success' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const jobId = await client.submitJob('retry-test', {})

      expect(jobId).toBe('retry-success')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should handle timeout errors', async () => {
      client.updateConfig({ timeout: 100 })

      // Mock a slow response
      mockFetch.mockImplementationOnce(() =>
        new Promise(resolve => setTimeout(resolve, 200))
      )

      // Should fallback to local service due to timeout
      const jobId = await client.submitJob('timeout-test', {})
      expect(jobId).toBe('local-job-123')
    })

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response)

      // Should fallback to local service
      const jobId = await client.submitJob('error-test', {})
      expect(jobId).toBe('local-job-123')
    })
  })

  describe('Configuration', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        baseUrl: 'http://new-host:3004',
        timeout: 10000,
        enableFallback: false
      }

      client.updateConfig(newConfig)
      const currentConfig = client.getConfig()

      expect(currentConfig.baseUrl).toBe('http://new-host:3004')
      expect(currentConfig.timeout).toBe(10000)
      expect(currentConfig.enableFallback).toBe(false)
    })

    it('should return current status', () => {
      const status = client.getStatus()

      expect(status).toHaveProperty('isHealthy')
      expect(status).toHaveProperty('lastHealthCheck')
      expect(status).toHaveProperty('baseUrl')
      expect(status).toHaveProperty('circuitBreakerState')
      expect(status).toHaveProperty('enableFallback')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty bulk job submission', async () => {
      const jobIds = await client.submitJobsBulk([])
      expect(jobIds).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should handle null responses gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
        headers: new Map([['content-type', 'application/json']])
      } as Response)

      const job = await client.getJobStatus('non-existent-job')
      expect(job).toBeUndefined()
    })

    it('should handle non-JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
        headers: new Map([['content-type', 'text/plain']])
      } as Response)

      const job = await client.getJobStatus('plain-text-response')
      expect(job).toBeUndefined()
    })
  })
})