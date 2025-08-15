/**
 * Background Jobs Service Client
 * 
 * A robust client for communicating with the background jobs service.
 * Provides graceful degradation when the service is unavailable, with fallback
 * to the local background job service.
 */

import { 
  JobSubmissionRequest, 
  JobSubmissionResponse, 
  BulkJobSubmissionRequest, 
  BulkJobSubmissionResponse,
  Job,
  JobStatus,
  JobOptions,
  JobPriority,
  QueueStatistics,
  HealthCheckResult,
  JobQueryOptions,
  QueueCleanupOptions,
  CleanupResult,
  StablecoinDataCollectionJob,
  TransparencyAnalysisJob,
  CacheInvalidationJob,
  MetricsAggregationJob
} from '../../../background-jobs-service/src/types'
import { backgroundJobService } from '../services/background-job-service'

export interface BackgroundJobsClientConfig {
  baseUrl?: string
  timeout?: number
  retryAttempts?: number
  retryDelay?: number
  enableFallback?: boolean
  circuitBreakerThreshold?: number
  circuitBreakerResetTimeout?: number
  healthCheckInterval?: number
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open'
  failures: number
  lastFailureTime?: number
  nextRetryTime?: number
}

export class BackgroundJobsClient {
  private static instance: BackgroundJobsClient
  private baseUrl: string
  private timeout: number
  private retryAttempts: number
  private retryDelay: number
  private enableFallback: boolean
  private circuitBreaker: CircuitBreakerState
  private circuitBreakerThreshold: number
  private circuitBreakerResetTimeout: number
  private isServiceHealthy: boolean = true
  private lastHealthCheck: number = 0
  private healthCheckInterval: number

  private constructor(config: BackgroundJobsClientConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.BACKGROUND_JOBS_SERVICE_URL || 'http://localhost:3003'
    this.timeout = config.timeout || parseInt(process.env.BACKGROUND_JOBS_TIMEOUT || '30000')
    this.retryAttempts = config.retryAttempts || 3
    this.retryDelay = config.retryDelay || 1000
    this.enableFallback = config.enableFallback !== false
    this.circuitBreakerThreshold = config.circuitBreakerThreshold || 5
    this.circuitBreakerResetTimeout = config.circuitBreakerResetTimeout || 60000 // 1 minute
    this.healthCheckInterval = config.healthCheckInterval || 60000 // 1 minute
    
    this.circuitBreaker = {
      state: 'closed',
      failures: 0
    }
  }

  public static getInstance(config?: BackgroundJobsClientConfig): BackgroundJobsClient {
    if (!BackgroundJobsClient.instance) {
      BackgroundJobsClient.instance = new BackgroundJobsClient(config)
    }
    return BackgroundJobsClient.instance
  }

  /**
   * Submit a single job to the background jobs service
   */
  async submitJob(
    type: string,
    data: any,
    options: JobOptions = {}
  ): Promise<string> {
    const request: JobSubmissionRequest = { type, data, options }
    
    if (!this.enableFallback || await this.checkServiceHealthAndCircuitBreaker()) {
      try {
        const response: JobSubmissionResponse = await this.makeRequest('POST', '/jobs', request)
        this.onSuccess()
        return response.jobId
      } catch (error) {
        this.onFailure()
        console.error('Failed to submit job to remote service:', error)
        if (!this.enableFallback) {
          throw error
        }
      }
    }

    // Fallback to local background job service
    if (this.enableFallback) {
      console.log(`[BackgroundJobsClient] Falling back to local service for job: ${type}`)
      return this.submitJobToLocalService(type, data, options)
    }

    throw new Error('Background jobs service unavailable and fallback disabled')
  }

  /**
   * Submit multiple jobs in bulk
   */
  async submitJobsBulk(jobs: JobSubmissionRequest[]): Promise<string[]> {
    if (!jobs || jobs.length === 0) {
      return []
    }

    const request: BulkJobSubmissionRequest = { jobs }
    
    if (!this.enableFallback || await this.checkServiceHealthAndCircuitBreaker()) {
      try {
        const response: BulkJobSubmissionResponse = await this.makeRequest('POST', '/jobs/bulk', request)
        this.onSuccess()
        return response.jobIds
      } catch (error) {
        this.onFailure()
        console.error('Failed to submit bulk jobs to remote service:', error)
        if (!this.enableFallback) {
          throw error
        }
      }
    }

    // Fallback to local background job service
    if (this.enableFallback) {
      console.log(`[BackgroundJobsClient] Falling back to local service for bulk jobs (${jobs.length} jobs)`)
      return Promise.all(jobs.map(job => this.submitJobToLocalService(job.type, job.data, job.options)))
    }

    throw new Error('Background jobs service unavailable and fallback disabled')
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<Job | null> {
    if (!this.enableFallback || await this.checkServiceHealthAndCircuitBreaker()) {
      try {
        const response = await this.makeRequest('GET', `/jobs/${jobId}`)
        this.onSuccess()
        return response.job
      } catch (error) {
        this.onFailure()
        console.error('Failed to get job status from remote service:', error)
        if (!this.enableFallback) {
          throw error
        }
      }
    }

    // Fallback to local service
    if (this.enableFallback) {
      const localJob = backgroundJobService.getJob(jobId)
      if (localJob) {
        return this.convertLocalJobToRemoteFormat(localJob)
      }
    }

    return null
  }

  /**
   * Get multiple job statuses
   */
  async getJobStatuses(jobIds: string[]): Promise<Job[]> {
    if (!jobIds || jobIds.length === 0) {
      return []
    }

    if (!this.enableFallback || await this.checkServiceHealthAndCircuitBreaker()) {
      try {
        const response = await this.makeRequest('POST', '/jobs/status', { jobIds })
        this.onSuccess()
        return response.jobs || []
      } catch (error) {
        this.onFailure()
        console.error('Failed to get job statuses from remote service:', error)
        if (!this.enableFallback) {
          throw error
        }
      }
    }

    // Fallback to local service
    if (this.enableFallback) {
      const localJobs = jobIds
        .map(id => backgroundJobService.getJob(id))
        .filter(job => job !== null)
        .map(job => this.convertLocalJobToRemoteFormat(job!))
      return localJobs
    }

    return []
  }

  /**
   * Query jobs with filters
   */
  async queryJobs(options: JobQueryOptions = {}): Promise<Job[]> {
    if (!this.enableFallback || await this.checkServiceHealthAndCircuitBreaker()) {
      try {
        const params = this.buildQueryParams(options)
        const response = await this.makeRequest('GET', `/jobs?${params.toString()}`)
        this.onSuccess()
        return response.jobs || []
      } catch (error) {
        this.onFailure()
        console.error('Failed to query jobs from remote service:', error)
        if (!this.enableFallback) {
          throw error
        }
      }
    }

    // Fallback to local service with limited filtering
    if (this.enableFallback) {
      let localJobs = backgroundJobService.getAllJobs()
      
      if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status]
        localJobs = localJobs.filter(job => statuses.includes(job.status as JobStatus))
      }
      
      if (options.type) {
        const types = Array.isArray(options.type) ? options.type : [options.type]
        localJobs = localJobs.filter(job => types.includes(job.type))
      }
      
      return localJobs
        .slice(0, options.limit || 100)
        .map(job => this.convertLocalJobToRemoteFormat(job))
    }

    return []
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    if (!this.enableFallback || await this.checkServiceHealthAndCircuitBreaker()) {
      try {
        const response = await this.makeRequest('POST', `/jobs/${jobId}/cancel`)
        this.onSuccess()
        return response.success || false
      } catch (error) {
        this.onFailure()
        console.error('Failed to cancel job via remote service:', error)
        if (!this.enableFallback) {
          throw error
        }
      }
    }

    // Fallback to local service
    if (this.enableFallback) {
      return backgroundJobService.cancelJob(jobId)
    }

    return false
  }

  /**
   * Get queue statistics
   */
  async getQueueStatistics(): Promise<QueueStatistics | null> {
    if (!this.enableFallback || await this.checkServiceHealthAndCircuitBreaker()) {
      try {
        const response = await this.makeRequest('GET', '/admin/stats')
        this.onSuccess()
        return response.statistics
      } catch (error) {
        this.onFailure()
        console.error('Failed to get queue statistics from remote service:', error)
        if (!this.enableFallback) {
          throw error
        }
      }
    }

    // Fallback to local service
    if (this.enableFallback) {
      const localStats = backgroundJobService.getQueueStats()
      return {
        pending: localStats.pending,
        processing: localStats.running,
        delayed: localStats.retrying,
        completed: localStats.completed,
        failed: localStats.failed,
        cancelled: localStats.cancelled,
        total: localStats.total,
        processingRate: 0, // Not available in local service
        averageProcessingTime: 0, // Not available in local service
        errorRate: localStats.total > 0 ? (localStats.failed / localStats.total) * 100 : 0
      }
    }

    return null
  }

  /**
   * Cleanup old jobs
   */
  async cleanupJobs(options: QueueCleanupOptions = {}): Promise<CleanupResult | null> {
    if (!this.enableFallback || await this.checkServiceHealthAndCircuitBreaker()) {
      try {
        const response = await this.makeRequest('POST', '/admin/cleanup', options)
        this.onSuccess()
        return response.result
      } catch (error) {
        this.onFailure()
        console.error('Failed to cleanup jobs via remote service:', error)
        if (!this.enableFallback) {
          throw error
        }
      }
    }

    // Fallback to local service
    if (this.enableFallback) {
      const maxAgeHours = options.maxAge ? Math.floor(options.maxAge / (1000 * 60 * 60)) : 24
      const deletedJobs = backgroundJobService.clearOldJobs(maxAgeHours)
      return {
        deletedJobs,
        freedMemory: 0, // Not available in local service
        operations: [`Deleted ${deletedJobs} old jobs from local service`]
      }
    }

    return null
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const response = await this.makeRequest('GET', '/health', undefined, 5000)
      this.isServiceHealthy = response.status === 'healthy'
      this.lastHealthCheck = Date.now()
      return {
        service: 'background-jobs',
        status: response.status,
        timestamp: new Date(),
        details: response.details
      }
    } catch (error) {
      this.isServiceHealthy = false
      this.lastHealthCheck = Date.now()
      return {
        service: 'background-jobs',
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Convenience methods for specific job types

  /**
   * Submit stablecoin data collection job
   */
  async submitStablecoinDataJob(
    ticker: string, 
    sources: string[], 
    urgent: boolean = false,
    options: JobOptions = {}
  ): Promise<string> {
    const jobData: StablecoinDataCollectionJob['data'] = {
      ticker,
      sources,
      urgent
    }
    
    const priority = urgent ? JobPriority.HIGH : (options.priority || JobPriority.MEDIUM)
    
    return this.submitJob('collect-stablecoin-data', jobData, {
      ...options,
      priority
    })
  }

  /**
   * Submit transparency analysis job
   */
  async submitTransparencyAnalysisJob(
    ticker: string,
    url: string,
    schema?: any,
    options: JobOptions = {}
  ): Promise<string> {
    const jobData: TransparencyAnalysisJob['data'] = {
      ticker,
      url,
      schema
    }
    
    return this.submitJob('analyze-transparency', jobData, options)
  }

  /**
   * Submit cache invalidation job
   */
  async submitCacheInvalidationJob(
    pattern: string,
    keys?: string[],
    options: JobOptions = {}
  ): Promise<string> {
    const jobData: CacheInvalidationJob['data'] = {
      pattern,
      keys
    }
    
    return this.submitJob('invalidate-cache', jobData, {
      ...options,
      priority: JobPriority.HIGH // Cache invalidation should be high priority
    })
  }

  /**
   * Submit metrics aggregation job
   */
  async submitMetricsAggregationJob(
    startTime: Date,
    endTime: Date,
    aggregationLevel: 'minute' | 'hour' | 'day' = 'hour',
    options: JobOptions = {}
  ): Promise<string> {
    const jobData: MetricsAggregationJob['data'] = {
      startTime,
      endTime,
      aggregationLevel
    }
    
    return this.submitJob('aggregate-metrics', jobData, options)
  }

  // Private helper methods

  private async checkServiceHealthAndCircuitBreaker(): Promise<boolean> {
    // Check circuit breaker state
    if (this.circuitBreaker.state === 'open') {
      if (this.circuitBreaker.nextRetryTime && Date.now() < this.circuitBreaker.nextRetryTime) {
        return false
      } else {
        // Transition to half-open
        this.circuitBreaker.state = 'half-open'
      }
    }

    // Check cached health status
    const now = Date.now()
    if (now - this.lastHealthCheck > this.healthCheckInterval) {
      const healthResult = await this.healthCheck()
      return healthResult.status === 'healthy'
    }
    
    return this.isServiceHealthy
  }

  private onSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      // Reset circuit breaker on successful request
      this.circuitBreaker = {
        state: 'closed',
        failures: 0
      }
    }
  }

  private onFailure(): void {
    this.circuitBreaker.failures++
    this.circuitBreaker.lastFailureTime = Date.now()
    
    if (this.circuitBreaker.failures >= this.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'open'
      this.circuitBreaker.nextRetryTime = Date.now() + this.circuitBreakerResetTimeout
      console.warn(`[BackgroundJobsClient] Circuit breaker opened due to ${this.circuitBreaker.failures} failures`)
    }
  }

  private async submitJobToLocalService(
    type: string, 
    data: any, 
    options: JobOptions = {}
  ): Promise<string> {
    // Map remote job types to local service methods
    switch (type) {
      case 'collect-stablecoin-data':
        // Use existing background job service
        return backgroundJobService.addJob(
          'stablecoin_data_collection',
          data.ticker,
          data,
          options.priority as any || 'medium'
        )
      
      case 'analyze-transparency':
        return backgroundJobService.addJob(
          'transparency_analysis',
          data.ticker,
          data,
          options.priority as any || 'medium'
        )
      
      case 'invalidate-cache':
        return backgroundJobService.addJob(
          'cache_invalidation',
          'system', // Use 'system' as ticker for cache operations
          data,
          options.priority as any || 'high'
        )
      
      case 'aggregate-metrics':
        return backgroundJobService.addJob(
          'metrics_aggregation',
          'system', // Use 'system' as ticker for metrics operations
          data,
          options.priority as any || 'medium'
        )
      
      default:
        return backgroundJobService.addJob(
          type,
          data.ticker || 'unknown',
          data,
          options.priority as any || 'medium'
        )
    }
  }

  private convertLocalJobToRemoteFormat(localJob: any): Job {
    return {
      id: localJob.id,
      type: localJob.type,
      data: localJob.data,
      options: {
        priority: localJob.priority as JobPriority,
        attempts: localJob.maxAttempts
      },
      createdAt: localJob.createdAt,
      scheduledFor: localJob.scheduledAt || localJob.createdAt,
      attempts: localJob.attempts,
      maxAttempts: localJob.maxAttempts,
      status: this.mapLocalStatusToRemote(localJob.status),
      error: localJob.lastError,
      result: localJob.result,
      processingStartedAt: localJob.startedAt,
      completedAt: localJob.completedAt,
      cost: localJob.cost,
      processingTimeMs: localJob.processingTimeMs
    }
  }

  private mapLocalStatusToRemote(localStatus: string): JobStatus {
    switch (localStatus) {
      case 'pending': return JobStatus.PENDING
      case 'running': return JobStatus.PROCESSING
      case 'completed': return JobStatus.COMPLETED
      case 'failed': return JobStatus.FAILED
      case 'retrying': return JobStatus.DELAYED
      case 'cancelled': return JobStatus.CANCELLED
      default: return JobStatus.PENDING
    }
  }

  private buildQueryParams(options: JobQueryOptions): URLSearchParams {
    const params = new URLSearchParams()
    
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      statuses.forEach(status => params.append('status', status))
    }
    
    if (options.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type]
      types.forEach(type => params.append('type', type))
    }
    
    if (options.limit) params.set('limit', options.limit.toString())
    if (options.offset) params.set('offset', options.offset.toString())
    if (options.sortBy) params.set('sortBy', options.sortBy)
    if (options.sortOrder) params.set('sortOrder', options.sortOrder)
    if (options.dateFrom) params.set('dateFrom', options.dateFrom.toISOString())
    if (options.dateTo) params.set('dateTo', options.dateTo.toISOString())
    
    return params
  }

  private async makeRequest(
    method: string,
    endpoint: string,
    data?: any,
    timeoutOverride?: number
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`
    const timeout = timeoutOverride || this.timeout

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const config: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'StableRisk-BackgroundJobsClient/1.0.0'
          },
          signal: controller.signal
        }

        if (data) {
          config.body = JSON.stringify(data)
        }

        const response = await fetch(url, config)
        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          return await response.json()
        } else {
          return {}
        }

      } catch (error: any) {
        console.warn(`Background jobs service request attempt ${attempt}/${this.retryAttempts} failed:`, error.message)

        if (attempt === this.retryAttempts) {
          throw error
        }

        // Exponential backoff for retries
        const delay = this.retryDelay * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error('All retry attempts failed')
  }

  /**
   * Update client configuration
   */
  updateConfig(config: Partial<BackgroundJobsClientConfig>): void {
    if (config.baseUrl) this.baseUrl = config.baseUrl
    if (config.timeout) this.timeout = config.timeout
    if (config.retryAttempts) this.retryAttempts = config.retryAttempts
    if (config.retryDelay) this.retryDelay = config.retryDelay
    if (config.enableFallback !== undefined) this.enableFallback = config.enableFallback
    if (config.circuitBreakerThreshold) this.circuitBreakerThreshold = config.circuitBreakerThreshold
    if (config.circuitBreakerResetTimeout) this.circuitBreakerResetTimeout = config.circuitBreakerResetTimeout
    if (config.healthCheckInterval) this.healthCheckInterval = config.healthCheckInterval
  }

  /**
   * Get current client configuration
   */
  getConfig(): BackgroundJobsClientConfig {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
      enableFallback: this.enableFallback,
      circuitBreakerThreshold: this.circuitBreakerThreshold,
      circuitBreakerResetTimeout: this.circuitBreakerResetTimeout,
      healthCheckInterval: this.healthCheckInterval
    }
  }

  /**
   * Get client status including circuit breaker state
   */
  getStatus(): {
    isHealthy: boolean
    lastHealthCheck: Date
    baseUrl: string
    circuitBreakerState: CircuitBreakerState
    enableFallback: boolean
  } {
    return {
      isHealthy: this.isServiceHealthy,
      lastHealthCheck: new Date(this.lastHealthCheck),
      baseUrl: this.baseUrl,
      circuitBreakerState: { ...this.circuitBreaker },
      enableFallback: this.enableFallback
    }
  }
}

// Export singleton instance
export const backgroundJobsClient = BackgroundJobsClient.getInstance()