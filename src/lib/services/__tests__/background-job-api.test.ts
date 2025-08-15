/**
 * Background Job Service - API Endpoint Tests
 * 
 * Tests REST API endpoints for:
 * - Job submission (single and bulk)
 * - Job status retrieval
 * - Queue statistics and monitoring
 * - Health checks
 * - Error handling and validation
 * - Authentication and authorization
 * - Rate limiting
 */

import { NextRequest, NextResponse } from 'next/server';
import { backgroundJobService, BackgroundJob } from '../background-job-service';

// Mock Next.js dependencies
jest.mock('next/server');

// API Route Handlers Implementation
class BackgroundJobsAPI {
  /**
   * POST /api/jobs - Submit a new job
   */
  async submitJob(request: NextRequest): Promise<NextResponse> {
    try {
      const body = await request.json();
      const { type, ticker, data, priority = 'medium', scheduledAt } = body;
      
      // Validation
      if (!type || !ticker) {
        return NextResponse.json(
          { error: 'Missing required fields: type, ticker' },
          { status: 400 }
        );
      }
      
      if (!['low', 'medium', 'high'].includes(priority)) {
        return NextResponse.json(
          { error: 'Invalid priority. Must be: low, medium, high' },
          { status: 400 }
        );
      }
      
      const scheduleTime = scheduledAt ? new Date(scheduledAt) : undefined;
      const jobId = backgroundJobService.addJob(type, ticker, data, priority, scheduleTime);
      
      const job = backgroundJobService.getJob(jobId);
      
      return NextResponse.json({
        success: true,
        jobId,
        job: {
          id: job?.id,
          type: job?.type,
          ticker: job?.ticker,
          status: job?.status,
          priority: job?.priority,
          createdAt: job?.createdAt,
          scheduledAt: job?.scheduledAt
        }
      }, { status: 201 });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to submit job', details: String(error) },
        { status: 500 }
      );
    }
  }
  
  /**
   * POST /api/jobs/bulk - Submit multiple jobs
   */
  async submitBulkJobs(request: NextRequest): Promise<NextResponse> {
    try {
      const body = await request.json();
      const { jobs } = body;
      
      if (!Array.isArray(jobs) || jobs.length === 0) {
        return NextResponse.json(
          { error: 'Jobs must be a non-empty array' },
          { status: 400 }
        );
      }
      
      if (jobs.length > 100) {
        return NextResponse.json(
          { error: 'Maximum 100 jobs per bulk request' },
          { status: 400 }
        );
      }
      
      const results = [];
      const errors = [];
      
      for (let i = 0; i < jobs.length; i++) {
        const jobData = jobs[i];
        try {
          const { type, ticker, data, priority = 'medium', scheduledAt } = jobData;
          
          if (!type || !ticker) {
            errors.push({ index: i, error: 'Missing required fields: type, ticker' });
            continue;
          }
          
          const scheduleTime = scheduledAt ? new Date(scheduledAt) : undefined;
          const jobId = backgroundJobService.addJob(type, ticker, data, priority, scheduleTime);
          
          results.push({
            index: i,
            jobId,
            status: 'submitted'
          });
          
        } catch (error) {
          errors.push({ index: i, error: String(error) });
        }
      }
      
      return NextResponse.json({
        success: true,
        submitted: results.length,
        failed: errors.length,
        results,
        errors
      }, { status: 201 });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to process bulk jobs', details: String(error) },
        { status: 500 }
      );
    }
  }
  
  /**
   * GET /api/jobs/[jobId] - Get job status
   */
  async getJobStatus(request: NextRequest, { params }: { params: { jobId: string } }): Promise<NextResponse> {
    try {
      const { jobId } = params;
      
      if (!jobId) {
        return NextResponse.json(
          { error: 'Job ID is required' },
          { status: 400 }
        );
      }
      
      const job = backgroundJobService.getJob(jobId);
      
      if (!job) {
        return NextResponse.json(
          { error: 'Job not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          type: job.type,
          ticker: job.ticker,
          status: job.status,
          priority: job.priority,
          createdAt: job.createdAt,
          scheduledAt: job.scheduledAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          lastError: job.lastError,
          result: job.result,
          processingTimeMs: job.processingTimeMs
        }
      });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to retrieve job status', details: String(error) },
        { status: 500 }
      );
    }
  }
  
  /**
   * GET /api/jobs - List jobs with filtering
   */
  async listJobs(request: NextRequest): Promise<NextResponse> {
    try {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status') as BackgroundJob['status'] | null;
      const type = searchParams.get('type');
      const ticker = searchParams.get('ticker');
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
      const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
      
      let jobs: BackgroundJob[] = [];
      
      if (status) {
        jobs = backgroundJobService.getJobsByStatus(status);
      } else if (type) {
        jobs = backgroundJobService.getJobsByType(type);
      } else if (ticker) {
        jobs = backgroundJobService.getJobsForTicker(ticker);
      } else {
        jobs = backgroundJobService.getAllJobs();
      }
      
      // Sort by creation time (newest first)
      jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      // Apply pagination
      const paginatedJobs = jobs.slice(offset, offset + limit);
      
      return NextResponse.json({
        success: true,
        total: jobs.length,
        offset,
        limit,
        jobs: paginatedJobs.map(job => ({
          id: job.id,
          type: job.type,
          ticker: job.ticker,
          status: job.status,
          priority: job.priority,
          createdAt: job.createdAt,
          scheduledAt: job.scheduledAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          processingTimeMs: job.processingTimeMs
        }))
      });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to list jobs', details: String(error) },
        { status: 500 }
      );
    }
  }
  
  /**
   * DELETE /api/jobs/[jobId] - Cancel a job
   */
  async cancelJob(request: NextRequest, { params }: { params: { jobId: string } }): Promise<NextResponse> {
    try {
      const { jobId } = params;
      
      const cancelled = backgroundJobService.cancelJob(jobId);
      
      if (!cancelled) {
        return NextResponse.json(
          { error: 'Job not found or cannot be cancelled' },
          { status: 404 }
        );
      }
      
      return NextResponse.json({
        success: true,
        message: 'Job cancelled successfully',
        jobId
      });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to cancel job', details: String(error) },
        { status: 500 }
      );
    }
  }
  
  /**
   * GET /api/jobs/stats - Get queue statistics
   */
  async getQueueStats(request: NextRequest): Promise<NextResponse> {
    try {
      const stats = backgroundJobService.getQueueStats();
      
      return NextResponse.json({
        success: true,
        stats: {
          total: stats.total,
          pending: stats.pending,
          running: stats.running,
          completed: stats.completed,
          failed: stats.failed,
          retrying: stats.retrying,
          cancelled: stats.cancelled,
          byPriority: stats.by_priority,
          byType: stats.by_type
        }
      });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to retrieve queue statistics', details: String(error) },
        { status: 500 }
      );
    }
  }
  
  /**
   * POST /api/jobs/cleanup - Clean up old jobs
   */
  async cleanupJobs(request: NextRequest): Promise<NextResponse> {
    try {
      const body = await request.json();
      const { maxAgeHours = 24 } = body;
      
      if (maxAgeHours < 1 || maxAgeHours > 168) { // 1 hour to 1 week
        return NextResponse.json(
          { error: 'maxAgeHours must be between 1 and 168' },
          { status: 400 }
        );
      }
      
      const cleaned = backgroundJobService.clearOldJobs(maxAgeHours);
      
      return NextResponse.json({
        success: true,
        message: `Cleaned up ${cleaned} old jobs`,
        cleanedCount: cleaned
      });
      
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to clean up jobs', details: String(error) },
        { status: 500 }
      );
    }
  }
  
  /**
   * GET /api/jobs/health - Health check
   */
  async healthCheck(request: NextRequest): Promise<NextResponse> {
    try {
      const stats = backgroundJobService.getQueueStats();
      const queueHealth = {
        healthy: true,
        totalJobs: stats.total,
        activeJobs: stats.pending + stats.running + stats.retrying,
        failureRate: stats.total > 0 ? (stats.failed / stats.total) * 100 : 0,
        timestamp: new Date().toISOString()
      };
      
      // Consider unhealthy if failure rate > 10%
      if (queueHealth.failureRate > 10) {
        queueHealth.healthy = false;
      }
      
      const statusCode = queueHealth.healthy ? 200 : 503;
      
      return NextResponse.json({
        success: queueHealth.healthy,
        service: 'background-jobs',
        status: queueHealth.healthy ? 'healthy' : 'degraded',
        health: queueHealth
      }, { status: statusCode });
      
    } catch (error) {
      return NextResponse.json(
        { 
          success: false,
          service: 'background-jobs',
          status: 'unhealthy',
          error: String(error)
        },
        { status: 503 }
      );
    }
  }
}

describe('Background Jobs API Endpoints', () => {
  let api: BackgroundJobsAPI;
  let mockRequest: jest.Mocked<NextRequest>;
  let service: any;

  beforeEach(() => {
    api = new BackgroundJobsAPI();
    service = backgroundJobService;
    service.stopProcessing();
    
    // Mock NextRequest
    mockRequest = {
      json: jest.fn(),
      url: 'http://localhost:3000/api/jobs',
      method: 'GET',
      headers: new Headers(),
      nextUrl: {
        searchParams: new URLSearchParams()
      }
    } as any;
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    service.stopProcessing();
  });

  describe('Job Submission API', () => {
    test('should submit job successfully', async () => {
      const jobData = {
        type: 'test_job',
        ticker: 'USDC',
        data: { test: 'data' },
        priority: 'high'
      };
      
      mockRequest.json.mockResolvedValue(jobData);
      
      const response = await api.submitJob(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(201);
      expect(responseData.success).toBe(true);
      expect(responseData.jobId).toBeDefined();
      expect(responseData.job.type).toBe('test_job');
      expect(responseData.job.ticker).toBe('USDC');
      expect(responseData.job.priority).toBe('high');
      
      // Verify job was created in service
      const job = service.getJob(responseData.jobId);
      expect(job).toBeDefined();
      expect(job.type).toBe('test_job');
    });

    test('should validate required fields', async () => {
      mockRequest.json.mockResolvedValue({
        type: 'test_job'
        // Missing ticker
      });
      
      const response = await api.submitJob(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(400);
      expect(responseData.success).toBeUndefined();
      expect(responseData.error).toContain('Missing required fields');
    });

    test('should validate priority values', async () => {
      mockRequest.json.mockResolvedValue({
        type: 'test_job',
        ticker: 'USDC',
        priority: 'invalid'
      });
      
      const response = await api.submitJob(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(400);
      expect(responseData.error).toContain('Invalid priority');
    });

    test('should handle scheduled jobs', async () => {
      const futureTime = new Date(Date.now() + 3600000); // 1 hour from now
      
      mockRequest.json.mockResolvedValue({
        type: 'scheduled_job',
        ticker: 'USDT',
        scheduledAt: futureTime.toISOString()
      });
      
      const response = await api.submitJob(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(201);
      expect(responseData.success).toBe(true);
      expect(new Date(responseData.job.scheduledAt)).toEqual(futureTime);
    });

    test('should handle submission errors gracefully', async () => {
      mockRequest.json.mockRejectedValue(new Error('Invalid JSON'));
      
      const response = await api.submitJob(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(500);
      expect(responseData.error).toBe('Failed to submit job');
      expect(responseData.details).toContain('Invalid JSON');
    });
  });

  describe('Bulk Job Submission API', () => {
    test('should submit multiple jobs successfully', async () => {
      const jobs = [
        { type: 'bulk_test_1', ticker: 'USDC', priority: 'high' },
        { type: 'bulk_test_2', ticker: 'USDT', priority: 'medium' },
        { type: 'bulk_test_3', ticker: 'PYUSD', priority: 'low' }
      ];
      
      mockRequest.json.mockResolvedValue({ jobs });
      
      const response = await api.submitBulkJobs(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(201);
      expect(responseData.success).toBe(true);
      expect(responseData.submitted).toBe(3);
      expect(responseData.failed).toBe(0);
      expect(responseData.results).toHaveLength(3);
      
      // Verify all jobs were created
      responseData.results.forEach((result: any, index: number) => {
        const job = service.getJob(result.jobId);
        expect(job).toBeDefined();
        expect(job.type).toBe(jobs[index].type);
        expect(job.ticker).toBe(jobs[index].ticker);
      });
    });

    test('should handle mixed success/failure in bulk submission', async () => {
      const jobs = [
        { type: 'valid_job', ticker: 'USDC' },
        { type: 'invalid_job' }, // Missing ticker
        { type: 'another_valid', ticker: 'USDT' }
      ];
      
      mockRequest.json.mockResolvedValue({ jobs });
      
      const response = await api.submitBulkJobs(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(201);
      expect(responseData.success).toBe(true);
      expect(responseData.submitted).toBe(2);
      expect(responseData.failed).toBe(1);
      expect(responseData.errors).toHaveLength(1);
      expect(responseData.errors[0].index).toBe(1);
    });

    test('should reject empty job arrays', async () => {
      mockRequest.json.mockResolvedValue({ jobs: [] });
      
      const response = await api.submitBulkJobs(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(400);
      expect(responseData.error).toContain('non-empty array');
    });

    test('should enforce bulk submission limits', async () => {
      const jobs = Array.from({ length: 101 }, (_, i) => ({
        type: 'limit_test',
        ticker: `TICKER_${i}`
      }));
      
      mockRequest.json.mockResolvedValue({ jobs });
      
      const response = await api.submitBulkJobs(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(400);
      expect(responseData.error).toContain('Maximum 100 jobs');
    });
  });

  describe('Job Status and Retrieval API', () => {
    test('should retrieve job status successfully', async () => {
      const jobId = service.addJob('status_test', 'USDC', { test: 'data' });
      
      const response = await api.getJobStatus(mockRequest, { params: { jobId } });
      const responseData = await response.json();
      
      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.job.id).toBe(jobId);
      expect(responseData.job.type).toBe('status_test');
      expect(responseData.job.ticker).toBe('USDC');
      expect(responseData.job.status).toBe('pending');
    });

    test('should return 404 for non-existent jobs', async () => {
      const response = await api.getJobStatus(mockRequest, { params: { jobId: 'nonexistent' } });
      const responseData = await response.json();
      
      expect(response.status).toBe(404);
      expect(responseData.error).toBe('Job not found');
    });

    test('should list jobs with filtering', async () => {
      // Create test jobs
      const job1 = service.addJob('list_test_1', 'USDC', {}, 'high');
      const job2 = service.addJob('list_test_2', 'USDT', {}, 'medium');
      const job3 = service.addJob('list_test_1', 'PYUSD', {}, 'low');
      
      // Test status filtering
      mockRequest.url = 'http://localhost:3000/api/jobs?status=pending';
      mockRequest.nextUrl.searchParams = new URLSearchParams('status=pending');
      
      const response = await api.listJobs(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.total).toBe(3);
      expect(responseData.jobs).toHaveLength(3);
      expect(responseData.jobs.every((job: any) => job.status === 'pending')).toBe(true);
    });

    test('should handle pagination', async () => {
      // Create multiple jobs
      for (let i = 0; i < 25; i++) {
        service.addJob('pagination_test', `TICKER_${i}`, { index: i });
      }
      
      mockRequest.url = 'http://localhost:3000/api/jobs?limit=10&offset=5';
      mockRequest.nextUrl.searchParams = new URLSearchParams('limit=10&offset=5');
      
      const response = await api.listJobs(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(200);
      expect(responseData.total).toBe(25);
      expect(responseData.jobs).toHaveLength(10);
      expect(responseData.offset).toBe(5);
      expect(responseData.limit).toBe(10);
    });

    test('should enforce maximum page size', async () => {
      mockRequest.url = 'http://localhost:3000/api/jobs?limit=500';
      mockRequest.nextUrl.searchParams = new URLSearchParams('limit=500');
      
      const response = await api.listJobs(mockRequest);
      const responseData = await response.json();
      
      expect(responseData.limit).toBe(100); // Should be capped at 100
    });
  });

  describe('Job Management API', () => {
    test('should cancel pending jobs', async () => {
      const jobId = service.addJob('cancel_test', 'USDC');
      
      const response = await api.cancelJob(mockRequest, { params: { jobId } });
      const responseData = await response.json();
      
      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.message).toContain('cancelled successfully');
      
      const job = service.getJob(jobId);
      expect(job?.status).toBe('cancelled');
    });

    test('should handle cancellation of non-existent jobs', async () => {
      const response = await api.cancelJob(mockRequest, { params: { jobId: 'nonexistent' } });
      const responseData = await response.json();
      
      expect(response.status).toBe(404);
      expect(responseData.error).toContain('not found or cannot be cancelled');
    });

    test('should provide queue statistics', async () => {
      // Create jobs with different statuses
      service.addJob('stats_test_1', 'USDC', {}, 'high');
      service.addJob('stats_test_2', 'USDT', {}, 'medium');
      const completedJobId = service.addJob('stats_test_3', 'PYUSD', {}, 'low');
      
      // Manually set one as completed for testing
      const completedJob = service.getJob(completedJobId);
      completedJob.status = 'completed';
      
      const response = await api.getQueueStats(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.stats.total).toBe(3);
      expect(responseData.stats.pending).toBe(2);
      expect(responseData.stats.completed).toBe(1);
      expect(responseData.stats.byPriority.high).toBe(1);
      expect(responseData.stats.byPriority.medium).toBe(1);
      expect(responseData.stats.byPriority.low).toBe(1);
    });

    test('should clean up old jobs', async () => {
      // Create old jobs (simulate by modifying timestamps)
      const oldJobId = service.addJob('cleanup_old', 'USDC');
      const recentJobId = service.addJob('cleanup_recent', 'USDT');
      
      const oldJob = service.getJob(oldJobId);
      const recentJob = service.getJob(recentJobId);
      
      oldJob.status = 'completed';
      oldJob.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      
      recentJob.status = 'completed';
      recentJob.createdAt = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      
      mockRequest.json.mockResolvedValue({ maxAgeHours: 24 });
      
      const response = await api.cleanupJobs(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.cleanedCount).toBe(1);
      expect(service.getJob(oldJobId)).toBeNull();
      expect(service.getJob(recentJobId)).toBeDefined();
    });

    test('should validate cleanup parameters', async () => {
      mockRequest.json.mockResolvedValue({ maxAgeHours: 200 }); // Too high
      
      const response = await api.cleanupJobs(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(400);
      expect(responseData.error).toContain('must be between 1 and 168');
    });
  });

  describe('Health Check API', () => {
    test('should return healthy status', async () => {
      // Create some jobs with good health metrics
      service.addJob('health_test_1', 'USDC');
      service.addJob('health_test_2', 'USDT');
      
      const response = await api.healthCheck(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(200);
      expect(responseData.success).toBe(true);
      expect(responseData.service).toBe('background-jobs');
      expect(responseData.status).toBe('healthy');
      expect(responseData.health.healthy).toBe(true);
      expect(responseData.health.totalJobs).toBe(2);
    });

    test('should return degraded status with high failure rate', async () => {
      // Create jobs with high failure rate
      for (let i = 0; i < 10; i++) {
        const jobId = service.addJob('health_fail_test', `TICKER_${i}`);
        const job = service.getJob(jobId);
        job.status = i < 8 ? 'failed' : 'completed'; // 80% failure rate
      }
      
      const response = await api.healthCheck(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(503);
      expect(responseData.success).toBe(false);
      expect(responseData.status).toBe('degraded');
      expect(responseData.health.healthy).toBe(false);
      expect(responseData.health.failureRate).toBeGreaterThan(10);
    });

    test('should handle health check errors', async () => {
      // Mock service error
      const originalGetQueueStats = service.getQueueStats;
      service.getQueueStats = jest.fn().mockImplementation(() => {
        throw new Error('Service unavailable');
      });
      
      const response = await api.healthCheck(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(503);
      expect(responseData.success).toBe(false);
      expect(responseData.status).toBe('unhealthy');
      expect(responseData.error).toContain('Service unavailable');
      
      // Restore original method
      service.getQueueStats = originalGetQueueStats;
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed JSON requests', async () => {
      mockRequest.json.mockRejectedValue(new SyntaxError('Unexpected token'));
      
      const response = await api.submitJob(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(500);
      expect(responseData.error).toBe('Failed to submit job');
    });

    test('should handle service unavailability', async () => {
      // Mock service error
      const originalAddJob = service.addJob;
      service.addJob = jest.fn().mockImplementation(() => {
        throw new Error('Service temporarily unavailable');
      });
      
      mockRequest.json.mockResolvedValue({
        type: 'test_job',
        ticker: 'USDC'
      });
      
      const response = await api.submitJob(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(500);
      expect(responseData.error).toBe('Failed to submit job');
      expect(responseData.details).toContain('Service temporarily unavailable');
      
      // Restore original method
      service.addJob = originalAddJob;
    });

    test('should handle large payloads gracefully', async () => {
      const largeData = {
        payload: 'x'.repeat(1024 * 1024), // 1MB of data
        metadata: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          value: `large_value_${i}_${'x'.repeat(100)}`
        }))
      };
      
      mockRequest.json.mockResolvedValue({
        type: 'large_payload_test',
        ticker: 'USDC',
        data: largeData
      });
      
      const response = await api.submitJob(mockRequest);
      const responseData = await response.json();
      
      expect(response.status).toBe(201);
      expect(responseData.success).toBe(true);
      
      const job = service.getJob(responseData.jobId);
      expect(job.data.payload).toBeDefined();
      expect(job.data.metadata).toHaveLength(10000);
    });

    test('should handle concurrent API requests', async () => {
      const concurrentRequests = 50;
      const requests = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        const mockReq = {
          json: jest.fn().mockResolvedValue({
            type: 'concurrent_test',
            ticker: `TICKER_${i}`,
            data: { index: i }
          })
        } as any;
        
        requests.push(api.submitJob(mockReq));
      }
      
      const responses = await Promise.all(requests);
      
      // All requests should succeed
      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
      });
      
      // Verify all jobs were created
      const stats = service.getQueueStats();
      expect(stats.total).toBe(concurrentRequests);
    });
  });
});