/**
 * Background Jobs Service - Core Type Definitions
 * 
 * Comprehensive TypeScript interfaces for job management,
 * queue operations, and service configuration.
 */

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  CANCELLED = 'cancelled'
}

export enum JobPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum BackoffStrategy {
  FIXED = 'fixed',
  EXPONENTIAL = 'exponential'
}

export interface JobOptions {
  priority?: JobPriority;
  delay?: number; // milliseconds
  attempts?: number;
  backoff?: {
    type: BackoffStrategy;
    delay: number;
  };
  timeout?: number; // milliseconds
  retryDelays?: number[]; // custom retry delays
}

export interface Job {
  id: string;
  type: string;
  data: any;
  options: JobOptions;
  createdAt: Date;
  scheduledFor: Date;
  attempts: number;
  maxAttempts: number;
  status: JobStatus;
  error?: string;
  result?: any;
  processingStartedAt?: Date;
  completedAt?: Date;
  timeoutAt?: Date;
  cost?: number;
  processingTimeMs?: number;
}

export interface JobExecutionContext {
  job: Job;
  attempt: number;
  isLastAttempt: boolean;
  worker?: WorkerInfo;
}

export interface WorkerInfo {
  id: number;
  startedAt: Date;
  processed: number;
  failed: number;
  currentJob?: string;
  status: 'idle' | 'processing' | 'stopping';
}

export interface QueueStatistics {
  pending: number;
  processing: number;
  delayed: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
  processingRate: number; // jobs per minute
  averageProcessingTime: number; // milliseconds
  errorRate: number; // percentage
  lastProcessed?: Date;
}

export interface JobHandler {
  process(job: Job): Promise<any>;
}

export interface ProcessorConfig {
  maxWorkers: number;
  pollingInterval: number; // milliseconds
  staleJobTimeout: number; // milliseconds
  enableMetrics: boolean;
  concurrency: {
    maxConcurrentJobs: number;
    jobTypeLimit?: Record<string, number>;
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
  keepAlive: number;
  connectTimeout: number;
  commandTimeout: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  poolSize: number;
  connectionTimeout: number;
  queryTimeout: number;
}

export interface ServiceConfig {
  port: number;
  redis: RedisConfig;
  database: DatabaseConfig;
  processor: ProcessorConfig;
  logging: {
    level: string;
    format: string;
    enableConsole: boolean;
    enableFile: boolean;
    filename?: string;
  };
  monitoring: {
    enableMetrics: boolean;
    metricsPort: number;
    healthCheckInterval: number;
  };
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  details?: Record<string, any>;
  error?: string;
}

export interface JobSubmissionRequest {
  type: string;
  data: any;
  options?: JobOptions;
}

export interface JobSubmissionResponse {
  jobId: string;
  status: JobStatus;
  message: string;
  estimatedCompletion?: Date;
}

export interface BulkJobSubmissionRequest {
  jobs: JobSubmissionRequest[];
}

export interface BulkJobSubmissionResponse {
  jobIds: string[];
  count: number;
  message: string;
  failedJobs?: Array<{
    index: number;
    error: string;
  }>;
}

export interface JobQueryOptions {
  status?: JobStatus | JobStatus[];
  type?: string | string[];
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'priority' | 'attempts';
  sortOrder?: 'asc' | 'desc';
  dateFrom?: Date;
  dateTo?: Date;
}

export interface QueueCleanupOptions {
  maxAge?: number; // milliseconds
  maxJobs?: number;
  statuses?: JobStatus[];
  dryRun?: boolean;
}

export interface CleanupResult {
  deletedJobs: number;
  freedMemory: number; // bytes
  operations: string[];
}

// Error types
export class JobError extends Error {
  constructor(message: string, public jobId: string, public cause?: Error) {
    super(message);
    this.name = 'JobError';
  }
}

export class QueueError extends Error {
  constructor(message: string, public operation: string, public cause?: Error) {
    super(message);
    this.name = 'QueueError';
  }
}

export class WorkerError extends Error {
  constructor(message: string, public workerId: number, public cause?: Error) {
    super(message);
    this.name = 'WorkerError';
  }
}

// Service events
export interface ServiceEvent {
  type: string;
  timestamp: Date;
  data?: any;
}

export interface JobEvent extends ServiceEvent {
  jobId: string;
  jobType: string;
  status: JobStatus;
}

export interface WorkerEvent extends ServiceEvent {
  workerId: number;
  workerStatus: WorkerInfo['status'];
}

export interface QueueEvent extends ServiceEvent {
  operation: string;
  affectedJobs: number;
}

// Job type definitions for different handlers
export interface StablecoinDataCollectionJob {
  type: 'collect-stablecoin-data';
  data: {
    ticker: string;
    sources: string[];
    urgent?: boolean;
  };
}

export interface TransparencyAnalysisJob {
  type: 'analyze-transparency';
  data: {
    ticker: string;
    url: string;
    schema?: any;
  };
}

export interface CacheInvalidationJob {
  type: 'invalidate-cache';
  data: {
    pattern: string;
    keys?: string[];
  };
}

export interface MetricsAggregationJob {
  type: 'aggregate-metrics';
  data: {
    startTime: Date;
    endTime: Date;
    aggregationLevel: 'minute' | 'hour' | 'day';
  };
}

// Union type for all job types
export type JobData = 
  | StablecoinDataCollectionJob
  | TransparencyAnalysisJob
  | CacheInvalidationJob
  | MetricsAggregationJob;