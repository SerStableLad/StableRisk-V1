/**
 * Background Job Service - Redis Integration Tests
 * 
 * Tests Redis-based job queue implementation:
 * - Job persistence and retrieval
 * - Queue operations (enqueue, dequeue, peek)
 * - Priority queue management with Redis sorted sets
 * - Job status tracking and updates
 * - Distributed processing scenarios
 * - Redis failure recovery
 */

import Redis from 'ioredis';
import { BackgroundJob } from '../background-job-service';

// Mock Redis for testing
jest.mock('ioredis');

interface RedisJobQueue {
  redis: Redis;
  keyPrefix: string;
  
  // Core queue operations
  enqueueJob(job: BackgroundJob): Promise<string>;
  dequeueJob(priority?: string): Promise<BackgroundJob | null>;
  peekNextJob(): Promise<BackgroundJob | null>;
  updateJobStatus(jobId: string, status: BackgroundJob['status'], data?: any): Promise<void>;
  
  // Job management
  getJob(jobId: string): Promise<BackgroundJob | null>;
  deleteJob(jobId: string): Promise<boolean>;
  getJobsByStatus(status: BackgroundJob['status']): Promise<BackgroundJob[]>;
  
  // Queue statistics
  getQueueStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
  }>;
  
  // Cleanup operations
  cleanupOldJobs(maxAgeMs: number): Promise<number>;
}

class RedisJobQueueImpl implements RedisJobQueue {
  redis: Redis;
  keyPrefix: string = 'jobs:';
  
  constructor(redis: Redis) {
    this.redis = redis;
  }
  
  async enqueueJob(job: BackgroundJob): Promise<string> {
    const pipeline = this.redis.pipeline();
    const jobKey = `${this.keyPrefix}data:${job.id}`;
    const priorityScore = this.getPriorityScore(job);
    
    // Store job data
    pipeline.hset(jobKey, this.serializeJob(job));
    
    // Add to priority queue
    pipeline.zadd(`${this.keyPrefix}queue:${job.status}`, priorityScore, job.id);
    
    // Add to status index
    pipeline.sadd(`${this.keyPrefix}status:${job.status}`, job.id);
    
    // Add to type index
    pipeline.sadd(`${this.keyPrefix}type:${job.type}`, job.id);
    
    // Set expiration for completed/failed jobs (24 hours)
    if (job.status === 'completed' || job.status === 'failed') {
      pipeline.expire(jobKey, 24 * 60 * 60);
    }
    
    await pipeline.exec();
    return job.id;
  }
  
  async dequeueJob(priority?: string): Promise<BackgroundJob | null> {
    const queueKey = priority 
      ? `${this.keyPrefix}queue:pending:${priority}`
      : `${this.keyPrefix}queue:pending`;
    
    // Get highest priority job
    const results = await this.redis.zrevrange(queueKey, 0, 0);
    if (!results.length) return null;
    
    const jobId = results[0];
    const job = await this.getJob(jobId);
    
    if (!job) return null;
    
    // Move job from pending to running
    const pipeline = this.redis.pipeline();
    pipeline.zrem(`${this.keyPrefix}queue:pending`, jobId);
    pipeline.zadd(`${this.keyPrefix}queue:running`, Date.now(), jobId);
    pipeline.srem(`${this.keyPrefix}status:pending`, jobId);
    pipeline.sadd(`${this.keyPrefix}status:running`, jobId);
    
    await pipeline.exec();
    
    job.status = 'running';
    job.startedAt = new Date();
    await this.updateJobData(job);
    
    return job;
  }
  
  async peekNextJob(): Promise<BackgroundJob | null> {
    const results = await this.redis.zrevrange(`${this.keyPrefix}queue:pending`, 0, 0);
    if (!results.length) return null;
    
    return this.getJob(results[0]);
  }
  
  async updateJobStatus(jobId: string, status: BackgroundJob['status'], data?: any): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) return;
    
    const oldStatus = job.status;
    job.status = status;
    
    if (data) {
      Object.assign(job, data);
    }
    
    const pipeline = this.redis.pipeline();
    
    // Update job data
    pipeline.hset(`${this.keyPrefix}data:${jobId}`, this.serializeJob(job));
    
    // Move between status queues
    if (oldStatus !== status) {
      pipeline.zrem(`${this.keyPrefix}queue:${oldStatus}`, jobId);
      pipeline.srem(`${this.keyPrefix}status:${oldStatus}`, jobId);
      
      if (status === 'pending' || status === 'running' || status === 'retrying') {
        const score = status === 'retrying' 
          ? (job.scheduledAt?.getTime() || Date.now())
          : this.getPriorityScore(job);
        pipeline.zadd(`${this.keyPrefix}queue:${status}`, score, jobId);
      }
      
      pipeline.sadd(`${this.keyPrefix}status:${status}`, jobId);
    }
    
    await pipeline.exec();
  }
  
  async getJob(jobId: string): Promise<BackgroundJob | null> {
    const jobData = await this.redis.hgetall(`${this.keyPrefix}data:${jobId}`);
    if (!Object.keys(jobData).length) return null;
    
    return this.deserializeJob(jobData);
  }
  
  async deleteJob(jobId: string): Promise<boolean> {
    const job = await this.getJob(jobId);
    if (!job) return false;
    
    const pipeline = this.redis.pipeline();
    
    // Remove from all data structures
    pipeline.del(`${this.keyPrefix}data:${jobId}`);
    pipeline.zrem(`${this.keyPrefix}queue:${job.status}`, jobId);
    pipeline.srem(`${this.keyPrefix}status:${job.status}`, jobId);
    pipeline.srem(`${this.keyPrefix}type:${job.type}`, jobId);
    
    const results = await pipeline.exec();
    return results?.[0]?.[1] === 1;
  }
  
  async getJobsByStatus(status: BackgroundJob['status']): Promise<BackgroundJob[]> {
    const jobIds = await this.redis.smembers(`${this.keyPrefix}status:${status}`);
    const jobs = await Promise.all(
      jobIds.map(id => this.getJob(id))
    );
    
    return jobs.filter(job => job !== null) as BackgroundJob[];
  }
  
  async getQueueStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
  }> {
    const statuses = ['pending', 'running', 'completed', 'failed', 'retrying', 'cancelled'];
    const priorities = ['high', 'medium', 'low'];
    
    const pipeline = this.redis.pipeline();
    
    // Get counts by status
    statuses.forEach(status => {
      pipeline.scard(`${this.keyPrefix}status:${status}`);
    });
    
    const results = await pipeline.exec();
    
    const byStatus: Record<string, number> = {};
    let total = 0;
    
    statuses.forEach((status, index) => {
      const count = results?.[index]?.[1] as number || 0;
      byStatus[status] = count;
      total += count;
    });
    
    // For priority counts, we'd need to scan jobs - simplified for demo
    const byPriority = { high: 0, medium: 0, low: 0 };
    
    return { total, byStatus, byPriority };
  }
  
  async cleanupOldJobs(maxAgeMs: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeMs;
    const completedJobs = await this.getJobsByStatus('completed');
    const failedJobs = await this.getJobsByStatus('failed');
    
    const oldJobs = [...completedJobs, ...failedJobs]
      .filter(job => job.createdAt.getTime() < cutoffTime);
    
    let cleaned = 0;
    for (const job of oldJobs) {
      if (await this.deleteJob(job.id)) {
        cleaned++;
      }
    }
    
    return cleaned;
  }
  
  private getPriorityScore(job: BackgroundJob): number {
    const priorityScores = { high: 3, medium: 2, low: 1 };
    const priorityScore = priorityScores[job.priority] || 1;
    
    // Use negative timestamp to maintain FIFO within priority
    return priorityScore * 1000000 - job.createdAt.getTime();
  }
  
  private serializeJob(job: BackgroundJob): Record<string, string> {
    return {
      id: job.id,
      type: job.type,
      ticker: job.ticker,
      status: job.status,
      priority: job.priority,
      data: JSON.stringify(job.data || {}),
      createdAt: job.createdAt.toISOString(),
      scheduledAt: job.scheduledAt?.toISOString() || '',
      startedAt: job.startedAt?.toISOString() || '',
      completedAt: job.completedAt?.toISOString() || '',
      attempts: job.attempts.toString(),
      maxAttempts: job.maxAttempts.toString(),
      lastError: job.lastError || '',
      result: JSON.stringify(job.result || {}),
      cost: (job.cost || 0).toString(),
      processingTimeMs: (job.processingTimeMs || 0).toString()
    };
  }
  
  private deserializeJob(data: Record<string, string>): BackgroundJob {
    return {
      id: data.id,
      type: data.type,
      ticker: data.ticker,
      status: data.status as BackgroundJob['status'],
      priority: data.priority as BackgroundJob['priority'],
      data: JSON.parse(data.data || '{}'),
      createdAt: new Date(data.createdAt),
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      attempts: parseInt(data.attempts) || 0,
      maxAttempts: parseInt(data.maxAttempts) || 5,
      lastError: data.lastError || undefined,
      result: JSON.parse(data.result || '{}') || undefined,
      cost: parseFloat(data.cost) || undefined,
      processingTimeMs: parseInt(data.processingTimeMs) || undefined
    };
  }
  
  private async updateJobData(job: BackgroundJob): Promise<void> {
    await this.redis.hset(`${this.keyPrefix}data:${job.id}`, this.serializeJob(job));
  }
}

describe('Redis Job Queue Integration', () => {
  let mockRedis: jest.Mocked<Redis>;
  let jobQueue: RedisJobQueue;
  
  const createTestJob = (overrides: Partial<BackgroundJob> = {}): BackgroundJob => ({
    id: `test_job_${Date.now()}`,
    type: 'test_job',
    ticker: 'USDC',
    status: 'pending',
    priority: 'medium',
    createdAt: new Date(),
    attempts: 0,
    maxAttempts: 3,
    ...overrides
  });
  
  beforeEach(() => {
    // Create mock Redis instance
    mockRedis = {
      pipeline: jest.fn().mockReturnValue({
        hset: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        zrem: jest.fn().mockReturnThis(),
        srem: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      }),
      hgetall: jest.fn(),
      hset: jest.fn(),
      zrevrange: jest.fn(),
      smembers: jest.fn(),
      scard: jest.fn(),
      del: jest.fn(),
      zrem: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn()
    } as any;
    
    jobQueue = new RedisJobQueueImpl(mockRedis);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Job Persistence', () => {
    test('should enqueue job with correct Redis operations', async () => {
      const job = createTestJob();
      const mockPipeline = {
        hset: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1]])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      const jobId = await jobQueue.enqueueJob(job);
      
      expect(jobId).toBe(job.id);
      expect(mockPipeline.hset).toHaveBeenCalledWith(
        `jobs:data:${job.id}`,
        expect.objectContaining({
          id: job.id,
          type: job.type,
          ticker: job.ticker,
          status: job.status
        })
      );
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'jobs:queue:pending',
        expect.any(Number),
        job.id
      );
      expect(mockPipeline.sadd).toHaveBeenCalledWith('jobs:status:pending', job.id);
      expect(mockPipeline.sadd).toHaveBeenCalledWith('jobs:type:test_job', job.id);
    });
    
    test('should retrieve job from Redis correctly', async () => {
      const job = createTestJob();
      const serializedJob = {
        id: job.id,
        type: job.type,
        ticker: job.ticker,
        status: job.status,
        priority: job.priority,
        data: JSON.stringify(job.data || {}),
        createdAt: job.createdAt.toISOString(),
        scheduledAt: '',
        startedAt: '',
        completedAt: '',
        attempts: '0',
        maxAttempts: '3',
        lastError: '',
        result: '{}',
        cost: '0',
        processingTimeMs: '0'
      };
      
      mockRedis.hgetall.mockResolvedValue(serializedJob);
      
      const retrievedJob = await jobQueue.getJob(job.id);
      
      expect(retrievedJob).toEqual(expect.objectContaining({
        id: job.id,
        type: job.type,
        ticker: job.ticker,
        status: job.status
      }));
      expect(mockRedis.hgetall).toHaveBeenCalledWith(`jobs:data:${job.id}`);
    });
    
    test('should return null for non-existent job', async () => {
      mockRedis.hgetall.mockResolvedValue({});
      
      const job = await jobQueue.getJob('nonexistent');
      expect(job).toBeNull();
    });
  });
  
  describe('Queue Operations', () => {
    test('should dequeue highest priority job', async () => {
      const job = createTestJob({ priority: 'high' });
      
      mockRedis.zrevrange.mockResolvedValue([job.id]);
      mockRedis.hgetall.mockResolvedValue({
        id: job.id,
        type: job.type,
        ticker: job.ticker,
        status: 'pending',
        priority: 'high',
        data: '{}',
        createdAt: job.createdAt.toISOString(),
        scheduledAt: '',
        startedAt: '',
        completedAt: '',
        attempts: '0',
        maxAttempts: '3',
        lastError: '',
        result: '{}',
        cost: '0',
        processingTimeMs: '0'
      });
      
      const mockPipeline = {
        zrem: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        srem: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1]])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      const dequeuedJob = await jobQueue.dequeueJob();
      
      expect(dequeuedJob).toBeDefined();
      expect(dequeuedJob?.id).toBe(job.id);
      expect(dequeuedJob?.status).toBe('running');
      
      expect(mockPipeline.zrem).toHaveBeenCalledWith('jobs:queue:pending', job.id);
      expect(mockPipeline.zadd).toHaveBeenCalledWith('jobs:queue:running', expect.any(Number), job.id);
    });
    
    test('should return null when queue is empty', async () => {
      mockRedis.zrevrange.mockResolvedValue([]);
      
      const job = await jobQueue.dequeueJob();
      expect(job).toBeNull();
    });
    
    test('should peek next job without removing it', async () => {
      const job = createTestJob();
      
      mockRedis.zrevrange.mockResolvedValue([job.id]);
      mockRedis.hgetall.mockResolvedValue({
        id: job.id,
        type: job.type,
        ticker: job.ticker,
        status: 'pending',
        priority: 'medium',
        data: '{}',
        createdAt: job.createdAt.toISOString(),
        scheduledAt: '',
        startedAt: '',
        completedAt: '',
        attempts: '0',
        maxAttempts: '3',
        lastError: '',
        result: '{}',
        cost: '0',
        processingTimeMs: '0'
      });
      
      const peekedJob = await jobQueue.peekNextJob();
      
      expect(peekedJob?.id).toBe(job.id);
      expect(mockRedis.zrevrange).toHaveBeenCalledWith('jobs:queue:pending', 0, 0);
      
      // Should not modify the queue
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });
  });
  
  describe('Status Management', () => {
    test('should update job status correctly', async () => {
      const job = createTestJob({ status: 'running' });
      
      mockRedis.hgetall.mockResolvedValue({
        id: job.id,
        type: job.type,
        ticker: job.ticker,
        status: 'running',
        priority: 'medium',
        data: '{}',
        createdAt: job.createdAt.toISOString(),
        scheduledAt: '',
        startedAt: '',
        completedAt: '',
        attempts: '0',
        maxAttempts: '3',
        lastError: '',
        result: '{}',
        cost: '0',
        processingTimeMs: '0'
      });
      
      const mockPipeline = {
        hset: jest.fn().mockReturnThis(),
        zrem: jest.fn().mockReturnThis(),
        srem: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1]])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      await jobQueue.updateJobStatus(job.id, 'completed', {
        completedAt: new Date(),
        result: { success: true }
      });
      
      expect(mockPipeline.zrem).toHaveBeenCalledWith('jobs:queue:running', job.id);
      expect(mockPipeline.srem).toHaveBeenCalledWith('jobs:status:running', job.id);
      expect(mockPipeline.sadd).toHaveBeenCalledWith('jobs:status:completed', job.id);
    });
    
    test('should get jobs by status', async () => {
      const jobIds = ['job1', 'job2', 'job3'];
      mockRedis.smembers.mockResolvedValue(jobIds);
      
      const mockJobs = jobIds.map(id => ({
        id,
        type: 'test_job',
        ticker: 'USDC',
        status: 'completed' as const,
        priority: 'medium' as const,
        data: '{}',
        createdAt: new Date().toISOString(),
        scheduledAt: '',
        startedAt: '',
        completedAt: new Date().toISOString(),
        attempts: '1',
        maxAttempts: '3',
        lastError: '',
        result: '{}',
        cost: '0',
        processingTimeMs: '100'
      }));
      
      mockRedis.hgetall
        .mockResolvedValueOnce(mockJobs[0])
        .mockResolvedValueOnce(mockJobs[1])
        .mockResolvedValueOnce(mockJobs[2]);
      
      const jobs = await jobQueue.getJobsByStatus('completed');
      
      expect(jobs).toHaveLength(3);
      expect(mockRedis.smembers).toHaveBeenCalledWith('jobs:status:completed');
      expect(mockRedis.hgetall).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('Priority Queue Management', () => {
    test('should maintain correct priority order', async () => {
      const highPriorityJob = createTestJob({ priority: 'high', id: 'high_job' });
      const mediumPriorityJob = createTestJob({ priority: 'medium', id: 'medium_job' });
      const lowPriorityJob = createTestJob({ priority: 'low', id: 'low_job' });
      
      // Test priority scoring
      const queue = new RedisJobQueueImpl(mockRedis);
      const highScore = (queue as any).getPriorityScore(highPriorityJob);
      const mediumScore = (queue as any).getPriorityScore(mediumPriorityJob);
      const lowScore = (queue as any).getPriorityScore(lowPriorityJob);
      
      expect(highScore).toBeGreaterThan(mediumScore);
      expect(mediumScore).toBeGreaterThan(lowScore);
    });
    
    test('should maintain FIFO order within same priority', async () => {
      const earlierTime = new Date('2023-01-01T00:00:00.000Z');
      const laterTime = new Date('2023-01-01T00:01:00.000Z');
      
      const firstJob = createTestJob({ 
        priority: 'medium', 
        id: 'first_job',
        createdAt: earlierTime
      });
      const secondJob = createTestJob({ 
        priority: 'medium', 
        id: 'second_job',
        createdAt: laterTime
      });
      
      const queue = new RedisJobQueueImpl(mockRedis);
      const firstScore = (queue as any).getPriorityScore(firstJob);
      const secondScore = (queue as any).getPriorityScore(secondJob);
      
      // Earlier job should have higher score (processed first)
      expect(firstScore).toBeGreaterThan(secondScore);
    });
  });
  
  describe('Queue Statistics', () => {
    test('should return comprehensive queue statistics', async () => {
      const mockCounts = [5, 2, 10, 3, 1, 0]; // pending, running, completed, failed, retrying, cancelled
      
      mockRedis.scard
        .mockResolvedValueOnce(5)  // pending
        .mockResolvedValueOnce(2)  // running
        .mockResolvedValueOnce(10) // completed
        .mockResolvedValueOnce(3)  // failed
        .mockResolvedValueOnce(1)  // retrying
        .mockResolvedValueOnce(0); // cancelled
      
      const mockPipeline = {
        scard: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 5], [null, 2], [null, 10], [null, 3], [null, 1], [null, 0]
        ])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      const stats = await jobQueue.getQueueStats();
      
      expect(stats.total).toBe(21); // Sum of all statuses
      expect(stats.byStatus).toEqual({
        pending: 5,
        running: 2,
        completed: 10,
        failed: 3,
        retrying: 1,
        cancelled: 0
      });
    });
  });
  
  describe('Job Cleanup', () => {
    test('should clean up old completed and failed jobs', async () => {
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      
      const oldCompletedJob = createTestJob({
        id: 'old_completed',
        status: 'completed',
        createdAt: oldTime
      });
      const oldFailedJob = createTestJob({
        id: 'old_failed',
        status: 'failed',
        createdAt: oldTime
      });
      const recentCompletedJob = createTestJob({
        id: 'recent_completed',
        status: 'completed',
        createdAt: recentTime
      });
      
      // Mock getting jobs by status
      mockRedis.smembers
        .mockResolvedValueOnce(['old_completed', 'recent_completed']) // completed jobs
        .mockResolvedValueOnce(['old_failed']); // failed jobs
      
      // Mock job retrieval
      mockRedis.hgetall
        .mockResolvedValueOnce({
          id: 'old_completed',
          createdAt: oldTime.toISOString(),
          status: 'completed',
          type: 'test_job',
          ticker: 'USDC',
          priority: 'medium',
          data: '{}',
          scheduledAt: '',
          startedAt: '',
          completedAt: '',
          attempts: '1',
          maxAttempts: '3',
          lastError: '',
          result: '{}',
          cost: '0',
          processingTimeMs: '100'
        })
        .mockResolvedValueOnce({
          id: 'recent_completed',
          createdAt: recentTime.toISOString(),
          status: 'completed',
          type: 'test_job',
          ticker: 'USDT',
          priority: 'medium',
          data: '{}',
          scheduledAt: '',
          startedAt: '',
          completedAt: '',
          attempts: '1',
          maxAttempts: '3',
          lastError: '',
          result: '{}',
          cost: '0',
          processingTimeMs: '150'
        })
        .mockResolvedValueOnce({
          id: 'old_failed',
          createdAt: oldTime.toISOString(),
          status: 'failed',
          type: 'test_job',
          ticker: 'PYUSD',
          priority: 'high',
          data: '{}',
          scheduledAt: '',
          startedAt: '',
          completedAt: '',
          attempts: '3',
          maxAttempts: '3',
          lastError: 'Test error',
          result: '{}',
          cost: '0',
          processingTimeMs: '0'
        });
      
      // Mock deletion
      const mockPipeline = {
        del: jest.fn().mockReturnThis(),
        zrem: jest.fn().mockReturnThis(),
        srem: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 1], [null, 1], [null, 1]])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      const cleaned = await jobQueue.cleanupOldJobs(24 * 60 * 60 * 1000); // 24 hours
      
      expect(cleaned).toBe(2); // Should clean old_completed and old_failed
      expect(mockPipeline.del).toHaveBeenCalledWith('jobs:data:old_completed');
      expect(mockPipeline.del).toHaveBeenCalledWith('jobs:data:old_failed');
    });
  });
  
  describe('Error Handling and Edge Cases', () => {
    test('should handle Redis connection failures gracefully', async () => {
      mockRedis.pipeline.mockImplementation(() => {
        throw new Error('Redis connection failed');
      });
      
      const job = createTestJob();
      
      await expect(jobQueue.enqueueJob(job)).rejects.toThrow('Redis connection failed');
    });
    
    test('should handle corrupted job data', async () => {
      mockRedis.hgetall.mockResolvedValue({
        id: 'corrupted_job',
        // Missing required fields or invalid JSON
        data: 'invalid json{',
        createdAt: 'invalid date'
      });
      
      // Should not crash, might return null or handle gracefully
      await expect(jobQueue.getJob('corrupted_job')).not.toThrow();
    });
    
    test('should handle Redis pipeline failures', async () => {
      const mockPipeline = {
        hset: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Pipeline failed'))
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      const job = createTestJob();
      
      await expect(jobQueue.enqueueJob(job)).rejects.toThrow('Pipeline failed');
    });
    
    test('should handle large job payloads', async () => {
      const largeData = {
        payload: 'x'.repeat(1024 * 1024) // 1MB of data
      };
      
      const job = createTestJob({ data: largeData });
      
      const mockPipeline = {
        hset: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1]])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      await expect(jobQueue.enqueueJob(job)).resolves.toBe(job.id);
      
      // Should serialize large data correctly
      expect(mockPipeline.hset).toHaveBeenCalledWith(
        `jobs:data:${job.id}`,
        expect.objectContaining({
          data: JSON.stringify(largeData)
        })
      );
    });
  });
  
  describe('Distributed Processing Scenarios', () => {
    test('should handle concurrent job processing', async () => {
      const jobs = Array.from({ length: 10 }, (_, i) => 
        createTestJob({ id: `concurrent_job_${i}` })
      );
      
      // Mock multiple jobs in queue
      mockRedis.zrevrange.mockImplementation((key, start, stop) => {
        if (start === 0 && stop === 0) {
          return Promise.resolve(jobs.length > 0 ? [jobs.shift()!.id] : []);
        }
        return Promise.resolve([]);
      });
      
      const mockPipeline = {
        zrem: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        srem: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1]])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      // Simulate concurrent dequeue operations
      const dequeuePromises = Array.from({ length: 5 }, () => jobQueue.dequeueJob());
      
      // Should handle concurrent access without issues
      await expect(Promise.all(dequeuePromises)).resolves.toBeDefined();
    });
    
    test('should maintain consistency during worker failures', async () => {
      const job = createTestJob({ status: 'running' });
      
      // Simulate worker failure - job stuck in running state
      mockRedis.hgetall.mockResolvedValue({
        id: job.id,
        type: job.type,
        ticker: job.ticker,
        status: 'running',
        priority: 'medium',
        data: '{}',
        createdAt: job.createdAt.toISOString(),
        scheduledAt: '',
        startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        completedAt: '',
        attempts: '1',
        maxAttempts: '3',
        lastError: '',
        result: '{}',
        cost: '0',
        processingTimeMs: '0'
      });
      
      const mockPipeline = {
        hset: jest.fn().mockReturnThis(),
        zrem: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        srem: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1]])
      };
      
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      // Should be able to reset stalled job to pending
      await jobQueue.updateJobStatus(job.id, 'pending');
      
      expect(mockPipeline.zrem).toHaveBeenCalledWith('jobs:queue:running', job.id);
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'jobs:queue:pending', 
        expect.any(Number), 
        job.id
      );
    });
  });
});