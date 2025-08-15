# Task 06: Background Jobs Service Extraction

## Overview
Extract the background job processing system from the monolith into a dedicated service that can scale independently and handle async operations efficiently.

## Time Estimate: 8-10 days

## Prerequisites
- Phase 1 foundation tasks completed (Tasks 01-04)
- Metrics service extraction completed (Task 05)
- Understanding of current background-job-service.ts implementation
- Redis for job queue management

## Technical Requirements

### 1. Background Jobs Service Architecture
```typescript
// background-jobs-service/src/app.ts
import express from 'express';
import { JobProcessor } from './processors/job-processor';
import { JobController } from './controllers/job-controller';
import { HealthCheckController } from './controllers/health-controller';
import { RedisConnection } from './redis/connection';
import { DatabaseConnection } from './db/connection';

const app = express();
const port = process.env.PORT || 3003;

// Initialize connections
const redis = RedisConnection.getInstance();
const db = DatabaseConnection.getInstance();

// Initialize job processor
const jobProcessor = new JobProcessor();

app.use(express.json({ limit: '10mb' }));

// Health checks
app.use('/health', HealthCheckController.routes());

// Job management API
app.use('/jobs', JobController.routes());

// Start job processing
jobProcessor.start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await jobProcessor.stop();
  await redis.disconnect();
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await jobProcessor.stop();
  await redis.disconnect();
  await db.close();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Background Jobs service listening on port ${port}`);
});
```

### 2. Job Queue Management with Redis
```typescript
// background-jobs-service/src/redis/job-queue.ts
import { Redis } from 'ioredis';
import { RedisConnection } from './connection';

export interface Job {
  id: string;
  type: string;
  data: any;
  options?: {
    priority?: number;
    delay?: number;
    attempts?: number;
    backoff?: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
  };
  createdAt: Date;
  scheduledFor?: Date;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'delayed';
  error?: string;
  result?: any;
  processingStartedAt?: Date;
  completedAt?: Date;
}

export class JobQueue {
  private redis: Redis;
  private queueName: string;

  constructor(queueName: string = 'stablerisk:jobs') {
    this.redis = RedisConnection.getInstance().getClient();
    this.queueName = queueName;
  }

  async addJob(
    type: string,
    data: any,
    options: {
      priority?: number;
      delay?: number;
      attempts?: number;
      backoff?: { type: 'fixed' | 'exponential'; delay: number };
    } = {}
  ): Promise<string> {
    const job: Job = {
      id: this.generateJobId(),
      type,
      data,
      options,
      createdAt: new Date(),
      scheduledFor: options.delay 
        ? new Date(Date.now() + options.delay) 
        : new Date(),
      attempts: 0,
      maxAttempts: options.attempts || 3,
      status: options.delay ? 'delayed' : 'pending'
    };

    // Store job data
    await this.redis.hset(
      `${this.queueName}:jobs`,
      job.id,
      JSON.stringify(job)
    );

    // Add to appropriate queue
    if (options.delay) {
      await this.redis.zadd(
        `${this.queueName}:delayed`,
        Date.now() + options.delay,
        job.id
      );
    } else {
      const priority = options.priority || 0;
      await this.redis.zadd(
        `${this.queueName}:pending`,
        -priority, // Negative for descending order
        job.id
      );
    }

    return job.id;
  }

  async getNextJob(): Promise<Job | null> {
    // First, move any ready delayed jobs to pending
    await this.promoteDelayedJobs();

    // Get highest priority pending job
    const result = await this.redis.zpopmax(`${this.queueName}:pending`);
    if (!result || result.length === 0) return null;

    const jobId = result[0];
    const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
    
    if (!jobData) return null;

    const job = JSON.parse(jobData) as Job;
    job.status = 'processing';
    job.processingStartedAt = new Date();

    // Update job status
    await this.redis.hset(
      `${this.queueName}:jobs`,
      job.id,
      JSON.stringify(job)
    );

    // Add to processing set with timeout
    const processingTimeout = 30 * 60 * 1000; // 30 minutes
    await this.redis.zadd(
      `${this.queueName}:processing`,
      Date.now() + processingTimeout,
      job.id
    );

    return job;
  }

  async completeJob(jobId: string, result?: any): Promise<void> {
    const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
    if (!jobData) return;

    const job = JSON.parse(jobData) as Job;
    job.status = 'completed';
    job.result = result;
    job.completedAt = new Date();

    await this.redis.hset(
      `${this.queueName}:jobs`,
      job.id,
      JSON.stringify(job)
    );

    // Remove from processing
    await this.redis.zrem(`${this.queueName}:processing`, jobId);

    // Add to completed set (with TTL)
    await this.redis.zadd(
      `${this.queueName}:completed`,
      Date.now(),
      jobId
    );

    // Set TTL on completed jobs (7 days)
    await this.redis.expire(`${this.queueName}:completed`, 7 * 24 * 3600);
  }

  async failJob(jobId: string, error: string): Promise<void> {
    const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
    if (!jobData) return;

    const job = JSON.parse(jobData) as Job;
    job.attempts++;
    job.error = error;

    // Check if we should retry
    if (job.attempts < job.maxAttempts) {
      job.status = 'delayed';
      
      // Calculate backoff delay
      let delay = 1000; // Default 1 second
      if (job.options?.backoff) {
        if (job.options.backoff.type === 'exponential') {
          delay = job.options.backoff.delay * Math.pow(2, job.attempts - 1);
        } else {
          delay = job.options.backoff.delay;
        }
      }

      job.scheduledFor = new Date(Date.now() + delay);

      // Add back to delayed queue
      await this.redis.zadd(
        `${this.queueName}:delayed`,
        Date.now() + delay,
        jobId
      );
    } else {
      job.status = 'failed';
      job.completedAt = new Date();

      // Add to failed set
      await this.redis.zadd(
        `${this.queueName}:failed`,
        Date.now(),
        jobId
      );
    }

    await this.redis.hset(
      `${this.queueName}:jobs`,
      job.id,
      JSON.stringify(job)
    );

    // Remove from processing
    await this.redis.zrem(`${this.queueName}:processing`, jobId);
  }

  private async promoteDelayedJobs(): Promise<void> {
    const now = Date.now();
    const readyJobs = await this.redis.zrangebyscore(
      `${this.queueName}:delayed`,
      '-inf',
      now
    );

    for (const jobId of readyJobs) {
      const jobData = await this.redis.hget(`${this.queueName}:jobs`, jobId);
      if (!jobData) continue;

      const job = JSON.parse(jobData) as Job;
      job.status = 'pending';

      await this.redis.hset(
        `${this.queueName}:jobs`,
        job.id,
        JSON.stringify(job)
      );

      // Move from delayed to pending
      await this.redis.zrem(`${this.queueName}:delayed`, jobId);
      await this.redis.zadd(
        `${this.queueName}:pending`,
        -(job.options?.priority || 0),
        jobId
      );
    }
  }

  async getQueueStats(): Promise<any> {
    const [pending, processing, delayed, completed, failed] = await Promise.all([
      this.redis.zcard(`${this.queueName}:pending`),
      this.redis.zcard(`${this.queueName}:processing`),
      this.redis.zcard(`${this.queueName}:delayed`),
      this.redis.zcard(`${this.queueName}:completed`),
      this.redis.zcard(`${this.queueName}:failed`)
    ]);

    return {
      pending,
      processing,
      delayed,
      completed,
      failed,
      total: pending + processing + delayed + completed + failed
    };
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 3. Job Processor
```typescript
// background-jobs-service/src/processors/job-processor.ts
import { JobQueue, Job } from '../redis/job-queue';
import { StablecoinDataCollector } from './handlers/stablecoin-data-collector';
import { TransparencyAnalyzer } from './handlers/transparency-analyzer';
import { CacheInvalidator } from './handlers/cache-invalidator';
import { MetricsAggregator } from './handlers/metrics-aggregator';
import { DatabaseConnection } from '../db/connection';

export class JobProcessor {
  private queue: JobQueue;
  private isRunning = false;
  private workers: Worker[] = [];
  private maxWorkers: number;
  private handlers: Map<string, (job: Job) => Promise<any>>;

  constructor(maxWorkers: number = 5) {
    this.queue = new JobQueue();
    this.maxWorkers = maxWorkers;
    this.handlers = new Map();
    this.registerHandlers();
  }

  private registerHandlers(): void {
    const stablecoinCollector = new StablecoinDataCollector();
    const transparencyAnalyzer = new TransparencyAnalyzer();
    const cacheInvalidator = new CacheInvalidator();
    const metricsAggregator = new MetricsAggregator();

    this.handlers.set('collect-stablecoin-data', stablecoinCollector.process.bind(stablecoinCollector));
    this.handlers.set('analyze-transparency', transparencyAnalyzer.process.bind(transparencyAnalyzer));
    this.handlers.set('invalidate-cache', cacheInvalidator.process.bind(cacheInvalidator));
    this.handlers.set('aggregate-metrics', metricsAggregator.process.bind(metricsAggregator));
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log(`Starting ${this.maxWorkers} job workers...`);

    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(i, this.queue, this.handlers);
      this.workers.push(worker);
      worker.start();
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('Stopping job workers...');
    this.isRunning = false;

    await Promise.all(
      this.workers.map(worker => worker.stop())
    );

    this.workers = [];
  }

  getStatus(): any {
    return {
      running: this.isRunning,
      workers: this.workers.length,
      workerStats: this.workers.map(w => w.getStats())
    };
  }
}

class Worker {
  private id: number;
  private queue: JobQueue;
  private handlers: Map<string, (job: Job) => Promise<any>>;
  private isRunning = false;
  private currentJob: Job | null = null;
  private stats = {
    processed: 0,
    failed: 0,
    startedAt: new Date()
  };

  constructor(
    id: number,
    queue: JobQueue,
    handlers: Map<string, (job: Job) => Promise<any>>
  ) {
    this.id = id;
    this.queue = queue;
    this.handlers = handlers;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`Worker ${this.id} started`);
    
    while (this.isRunning) {
      try {
        const job = await this.queue.getNextJob();
        
        if (!job) {
          await this.sleep(1000); // Wait 1 second when no jobs
          continue;
        }

        this.currentJob = job;
        await this.processJob(job);
        this.currentJob = null;
      } catch (error) {
        console.error(`Worker ${this.id} error:`, error);
        await this.sleep(5000); // Wait 5 seconds on error
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    
    // Wait for current job to complete (with timeout)
    if (this.currentJob) {
      console.log(`Worker ${this.id} waiting for current job to complete...`);
      const timeout = 30000; // 30 seconds
      const start = Date.now();
      
      while (this.currentJob && Date.now() - start < timeout) {
        await this.sleep(100);
      }
    }
    
    console.log(`Worker ${this.id} stopped`);
  }

  private async processJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    
    if (!handler) {
      await this.queue.failJob(job.id, `No handler found for job type: ${job.type}`);
      this.stats.failed++;
      return;
    }

    try {
      console.log(`Worker ${this.id} processing job ${job.id} (${job.type})`);
      const result = await handler(job);
      await this.queue.completeJob(job.id, result);
      this.stats.processed++;
      console.log(`Worker ${this.id} completed job ${job.id}`);
    } catch (error) {
      console.error(`Worker ${this.id} failed job ${job.id}:`, error);
      await this.queue.failJob(job.id, error.message);
      this.stats.failed++;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): any {
    return {
      id: this.id,
      running: this.isRunning,
      currentJob: this.currentJob?.id,
      ...this.stats
    };
  }
}
```

### 4. Job Handler Examples
```typescript
// background-jobs-service/src/processors/handlers/stablecoin-data-collector.ts
import { Job } from '../../redis/job-queue';
import { ExternalAPIClient } from '../../clients/external-api-client';

export class StablecoinDataCollector {
  private apiClient = new ExternalAPIClient();

  async process(job: Job): Promise<any> {
    const { ticker, sources } = job.data;
    
    console.log(`Collecting stablecoin data for ${ticker} from sources:`, sources);
    
    const results = await Promise.allSettled(
      sources.map(async (source: string) => {
        switch (source) {
          case 'coingecko':
            return await this.collectFromCoinGecko(ticker);
          case 'transparency':
            return await this.collectTransparencyData(ticker);
          case 'dex':
            return await this.collectDexData(ticker);
          default:
            throw new Error(`Unknown source: ${source}`);
        }
      })
    );

    const collected = results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);

    const errors = results
      .filter(result => result.status === 'rejected')
      .map(result => (result as PromiseRejectedResult).reason.message);

    return {
      ticker,
      collectedData: collected,
      errors,
      collectedAt: new Date().toISOString()
    };
  }

  private async collectFromCoinGecko(ticker: string): Promise<any> {
    // Implementation similar to existing service
    return await this.apiClient.fetchCoinGeckoData(ticker);
  }

  private async collectTransparencyData(ticker: string): Promise<any> {
    // Implementation similar to existing transparency service
    return await this.apiClient.fetchTransparencyData(ticker);
  }

  private async collectDexData(ticker: string): Promise<any> {
    // Implementation similar to existing DEX data collection
    return await this.apiClient.fetchDexData(ticker);
  }
}
```

### 5. Job Controller for API
```typescript
// background-jobs-service/src/controllers/job-controller.ts
import { Router } from 'express';
import { JobQueue } from '../redis/job-queue';
import { JobProcessor } from '../processors/job-processor';

export class JobController {
  private static queue = new JobQueue();

  static routes(): Router {
    const router = Router();

    // Submit job
    router.post('/submit', async (req, res) => {
      try {
        const { type, data, options } = req.body;
        
        if (!type || !data) {
          return res.status(400).json({ 
            error: 'Missing required fields: type, data' 
          });
        }

        const jobId = await this.queue.addJob(type, data, options);
        
        res.status(201).json({ 
          jobId,
          message: 'Job submitted successfully'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get job status
    router.get('/:jobId', async (req, res) => {
      try {
        const { jobId } = req.params;
        const job = await this.queue.getJob(jobId);
        
        if (!job) {
          return res.status(404).json({ error: 'Job not found' });
        }
        
        res.json(job);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get queue statistics
    router.get('/stats/queue', async (req, res) => {
      try {
        const stats = await this.queue.getQueueStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Bulk job submission
    router.post('/bulk', async (req, res) => {
      try {
        const { jobs } = req.body;
        
        if (!Array.isArray(jobs)) {
          return res.status(400).json({ 
            error: 'jobs must be an array' 
          });
        }

        const jobIds = await Promise.all(
          jobs.map(job => this.queue.addJob(job.type, job.data, job.options))
        );

        res.status(201).json({ 
          jobIds,
          count: jobIds.length,
          message: 'Jobs submitted successfully'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }
}
```

### 6. Client Integration
```typescript
// src/lib/clients/background-jobs-client.ts (in main app)
export class BackgroundJobsClient {
  private static instance: BackgroundJobsClient;
  private baseUrl: string;
  private timeout: number;

  private constructor() {
    this.baseUrl = process.env.BACKGROUND_JOBS_URL || 'http://localhost:3003';
    this.timeout = parseInt(process.env.BACKGROUND_JOBS_TIMEOUT || '10000');
  }

  public static getInstance(): BackgroundJobsClient {
    if (!BackgroundJobsClient.instance) {
      BackgroundJobsClient.instance = new BackgroundJobsClient();
    }
    return BackgroundJobsClient.instance;
  }

  async submitJob(
    type: string,
    data: any,
    options: {
      priority?: number;
      delay?: number;
      attempts?: number;
    } = {}
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/jobs/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data, options }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    return result.jobId;
  }

  async submitBulkJobs(jobs: Array<{
    type: string;
    data: any;
    options?: any;
  }>): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/jobs/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    return result.jobIds;
  }

  async getJobStatus(jobId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  async getQueueStats(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/jobs/stats/queue`, {
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

## Acceptance Criteria

### Functional Requirements
- [x] Background jobs service starts and connects to Redis successfully
- [x] Can submit jobs via REST API and process them asynchronously  
- [x] Job queue handles priority, delays, and retries correctly
- [x] Multiple workers process jobs concurrently
- [x] Failed jobs are retried with exponential backoff

### Performance Requirements
- [x] Service can handle 100+ jobs per minute
- [x] Job submission responds within 100ms
- [x] Worker startup time under 10 seconds
- [x] Memory usage stays under 512MB under normal load

### Integration Requirements  
- [x] Main application can submit jobs without blocking
- [x] Graceful degradation when background service unavailable
- [x] Redis connection handles reconnection automatically
- [x] Service integrates with existing monitoring

## Testing
```bash
# Build and start background jobs service
cd background-jobs-service && npm run build
docker-compose up -d redis background-jobs-service

# Test job submission
curl -X POST http://localhost:3003/jobs/submit \
  -H "Content-Type: application/json" \
  -d '{"type":"collect-stablecoin-data","data":{"ticker":"USDT","sources":["coingecko"]}}'

# Check queue stats  
curl http://localhost:3003/jobs/stats/queue

# Integration tests
npm run test:background-jobs-integration
```

## Rollback Plan
1. Stop background jobs service: `docker-compose down background-jobs-service`
2. Remove job submission calls from main application  
3. Keep existing background-job-service.ts as fallback
4. Jobs in Redis queue will remain until service restarts
5. Remove service configuration from docker-compose.yml

## Dependencies
- All Phase 1 foundation tasks (01-04)
- Task 05 (Metrics service) for job metrics reporting
- Redis for job queue management
- PostgreSQL for job result persistence

## Risks & Mitigation
- **Risk**: Redis failure causes job loss
  - **Mitigation**: Redis persistence, job result logging to PostgreSQL
- **Risk**: Long-running jobs block workers
  - **Mitigation**: Job timeouts, separate worker pools for different job types
- **Risk**: Service restart loses in-progress jobs  
  - **Mitigation**: Job status tracking, recovery mechanisms

## Notes
- Service designed to handle both quick tasks and long-running jobs
- Redis provides reliable job queue with persistence
- Worker pool scales based on job volume and types
- Job handlers are modular and can be extended easily
- Integration maintains backward compatibility with existing background job patterns