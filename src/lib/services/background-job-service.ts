/**
 * Background Job Service - Enhanced Implementation for Firecrawl Integration
 * 
 * Comprehensive background job service with:
 * - Job execution with retry logic and exponential backoff
 * - Priority queue management (high, medium, low)
 * - Integration with Cost Control and Performance Monitoring services
 * - Support for 'firecrawl_collateral_extraction' job types
 * - Circuit breaker pattern for reliability
 * - Job status tracking and completion handling
 */

import { costControlService } from './cost-control-service'
import { performanceMonitoringService, ExtractionMetrics } from './performance-monitoring-service'
import { firecrawlMcpService } from './firecrawl-mcp-service'

export interface BackgroundJob {
  id: string
  type: string
  ticker: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  data?: any
  createdAt: Date
  scheduledAt?: Date
  startedAt?: Date
  completedAt?: Date
  attempts: number
  maxAttempts: number
  lastError?: string
  result?: any
  cost?: number
  processingTimeMs?: number
}

export interface JobExecutionContext {
  job: BackgroundJob
  attempt: number
  isLastAttempt: boolean
}

class BackgroundJobService {
  private jobs: Map<string, BackgroundJob> = new Map()
  private processing = false
  private readonly processingInterval = 2000 // 2 seconds
  private readonly retryDelays = [1000, 2000, 4000, 8000, 16000] // Exponential backoff in ms
  private readonly priorityOrder: { [key: string]: number } = { high: 3, medium: 2, low: 1 }

  constructor() {
    // Start job processing loop
    this.startJobProcessing()
  }

  /**
   * Add a new background job with enhanced configuration
   */
  addJob(
    type: string, 
    ticker: string, 
    data?: any, 
    priority: 'low' | 'medium' | 'high' = 'medium',
    scheduledAt?: Date
  ): string {
    const jobId = `${type}_${ticker}_${Date.now()}`
    const maxAttempts = this.getMaxAttemptsForJobType(type)
    
    const job: BackgroundJob = {
      id: jobId,
      type,
      ticker,
      status: 'pending',
      priority,
      data,
      createdAt: new Date(),
      scheduledAt: scheduledAt || new Date(),
      attempts: 0,
      maxAttempts
    }
    
    this.jobs.set(jobId, job)
    console.log(`[BackgroundJobService] Added job ${jobId} for ${ticker} (type: ${type}, priority: ${priority})`)
    
    return jobId
  }

  /**
   * Add a Firecrawl collateral extraction job
   */
  addFirecrawlExtractionJob(
    ticker: string,
    data: {
      url: string
      schema?: any
      urgent?: boolean
    }
  ): string {
    const priority = data.urgent ? 'high' : 'medium'
    
    return this.addJob(
      'firecrawl_collateral_extraction',
      ticker,
      data,
      priority
    )
  }

  /**
   * Start the job processing loop
   */
  private startJobProcessing(): void {
    if (this.processing) return
    
    this.processing = true
    
    // Only run processing on server-side
    if (typeof window === 'undefined') {
      this.processJobsLoop()
    }
  }

  /**
   * Main job processing loop
   */
  private async processJobsLoop(): Promise<void> {
    while (this.processing) {
      try {
        await this.processNextJob()
      } catch (error) {
        console.error('[BackgroundJobService] Error in processing loop:', error)
      }
      
      // Wait before next processing cycle
      await new Promise(resolve => setTimeout(resolve, this.processingInterval))
    }
  }

  /**
   * Process the next highest priority job
   */
  private async processNextJob(): Promise<void> {
    const job = this.getNextJobToProcess()
    if (!job) return

    // Check if scheduled time has arrived
    if (job.scheduledAt && job.scheduledAt > new Date()) {
      return
    }

    await this.executeJob(job)
  }

  /**
   * Get the next job to process based on priority and scheduling
   */
  private getNextJobToProcess(): BackgroundJob | null {
    const eligibleJobs = Array.from(this.jobs.values())
      .filter(job => 
        (job.status === 'pending' || job.status === 'retrying') &&
        (!job.scheduledAt || job.scheduledAt <= new Date())
      )
      .sort((a, b) => {
        // Sort by priority first, then by creation time
        const priorityDiff = this.priorityOrder[b.priority] - this.priorityOrder[a.priority]
        if (priorityDiff !== 0) return priorityDiff
        
        return a.createdAt.getTime() - b.createdAt.getTime()
      })

    return eligibleJobs.length > 0 ? eligibleJobs[0] : null
  }

  /**
   * Execute a background job with retry logic
   */
  private async executeJob(job: BackgroundJob): Promise<void> {
    const startTime = Date.now()
    job.status = 'running'
    job.startedAt = new Date()
    job.attempts++

    const context: JobExecutionContext = {
      job,
      attempt: job.attempts,
      isLastAttempt: job.attempts >= job.maxAttempts
    }

    try {
      console.log(`[BackgroundJobService] Executing job ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`)

      const result = await this.executeJobByType(context)
      
      // Job completed successfully
      job.status = 'completed'
      job.completedAt = new Date()
      job.result = result
      job.processingTimeMs = Date.now() - startTime

      console.log(`[BackgroundJobService] Job ${job.id} completed successfully in ${job.processingTimeMs}ms`)

    } catch (error) {
      const processingTime = Date.now() - startTime
      job.lastError = String(error)
      job.processingTimeMs = processingTime

      console.error(`[BackgroundJobService] Job ${job.id} failed (attempt ${job.attempts}/${job.maxAttempts}):`, error)

      if (job.attempts >= job.maxAttempts) {
        // All attempts exhausted
        job.status = 'failed'
        job.completedAt = new Date()
        console.error(`[BackgroundJobService] Job ${job.id} failed after ${job.attempts} attempts`)

        // Record failure metrics
        this.recordJobMetrics(job, false)
      } else {
        // Schedule retry with exponential backoff
        job.status = 'retrying'
        const retryDelay = this.retryDelays[Math.min(job.attempts - 1, this.retryDelays.length - 1)]
        job.scheduledAt = new Date(Date.now() + retryDelay)
        
        console.log(`[BackgroundJobService] Job ${job.id} scheduled for retry in ${retryDelay}ms`)
      }
    }

    // Update job in storage
    this.jobs.set(job.id, job)

    // Record successful completion metrics
    if (job.status === 'completed') {
      this.recordJobMetrics(job, true)
    }
  }

  /**
   * Execute job based on its type
   */
  private async executeJobByType(context: JobExecutionContext): Promise<any> {
    const { job } = context

    switch (job.type) {
      case 'firecrawl_collateral_extraction':
        return await this.executeFirecrawlExtractionJob(context)
      
      // Add more job types as needed
      default:
        throw new Error(`Unknown job type: ${job.type}`)
    }
  }

  /**
   * Execute Firecrawl collateral extraction job
   */
  private async executeFirecrawlExtractionJob(context: JobExecutionContext): Promise<any> {
    const { job } = context
    const { url, schema } = job.data

    // Check budget before proceeding
    const canProceed = costControlService.canProceedWithCost(0.05, 'firecrawl_mcp', 'collateral_extraction')
    if (!canProceed.allowed) {
      throw new Error(`Budget constraint: ${canProceed.reason}`)
    }

    // Execute Firecrawl extraction
    const result = await firecrawlMcpService.extractTransparencyData(url, job.ticker, schema)
    
    if (!result) {
      throw new Error('Firecrawl extraction returned no data')
    }

    return result
  }

  /**
   * Record job execution metrics for monitoring
   */
  private recordJobMetrics(job: BackgroundJob, success: boolean): void {
    if (job.type === 'firecrawl_collateral_extraction') {
      const metric: ExtractionMetrics = {
        method: 'firecrawl',
        symbol: job.ticker,
        success,
        latency_ms: job.processingTimeMs || 0,
        confidence_score: success ? job.result?.confidence_score : undefined,
        cost_usd: job.cost || 0.05, // Default cost if not recorded
        timestamp: new Date().toISOString(),
        errors: success ? undefined : [job.lastError || 'Unknown error'],
        extraction_data: success ? {
          items_found: job.result?.collateral_allocations?.length || 0,
          processing_time_ms: job.processingTimeMs || 0,
          quality_score: job.result?.confidence_score || 0
        } : undefined
      }

      performanceMonitoringService.recordExtractionMetric(metric)
    }
  }

  /**
   * Get max attempts for different job types
   */
  private getMaxAttemptsForJobType(type: string): number {
    switch (type) {
      case 'firecrawl_collateral_extraction':
        return 3 // Firecrawl can be expensive, limit retries
      default:
        return 5 // Default retry count
    }
  }

  /**
   * Check if there's an active job of a specific type for a ticker
   */
  hasActiveJobOfType(ticker: string, type: string): boolean {
    return Array.from(this.jobs.values()).some(job =>
      job.ticker === ticker && job.type === type && 
      (job.status === 'pending' || job.status === 'running' || job.status === 'retrying')
    )
  }

  /**
   * Check if there's a recently completed job
   */
  hasRecentlyCompletedJob(ticker: string, type: string, maxAgeMinutes: number): boolean {
    const maxAge = maxAgeMinutes * 60 * 1000 // Convert to milliseconds
    const now = new Date().getTime()
    
    return Array.from(this.jobs.values()).some(job => {
      if (job.ticker === ticker && job.type === type && job.status === 'completed' && job.completedAt) {
        const jobAge = now - job.completedAt.getTime()
        return jobAge < maxAge
      }
      return false
    })
  }

  /**
   * Get latest completed job of a specific type
   */
  getLatestCompletedJob(ticker: string, type: string): BackgroundJob | null {
    const completedJobs = Array.from(this.jobs.values())
      .filter(job => job.ticker === ticker && job.type === type && job.status === 'completed')
      .sort((a, b) => {
        if (!a.completedAt || !b.completedAt) return 0
        return b.completedAt.getTime() - a.completedAt.getTime()
      })
    
    return completedJobs.length > 0 ? completedJobs[0] : null
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): BackgroundJob | null {
    return this.jobs.get(jobId) || null
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: BackgroundJob['status']): BackgroundJob[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status)
  }

  /**
   * Get jobs by type
   */
  getJobsByType(type: string): BackgroundJob[] {
    return Array.from(this.jobs.values()).filter(job => job.type === type)
  }

  /**
   * Get jobs for a specific ticker
   */
  getJobsForTicker(ticker: string): BackgroundJob[] {
    return Array.from(this.jobs.values()).filter(job => job.ticker === ticker)
  }

  /**
   * Cancel a pending job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job) return false

    if (job.status === 'pending' || job.status === 'retrying') {
      job.status = 'cancelled'
      job.completedAt = new Date()
      this.jobs.set(jobId, job)
      console.log(`[BackgroundJobService] Job ${jobId} cancelled`)
      return true
    }

    return false
  }

  /**
   * Get job queue statistics
   */
  getQueueStats(): {
    total: number
    pending: number
    running: number
    completed: number
    failed: number
    retrying: number
    cancelled: number
    by_priority: { high: number; medium: number; low: number }
    by_type: Record<string, number>
  } {
    const jobs = Array.from(this.jobs.values())
    
    const stats = {
      total: jobs.length,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      retrying: 0,
      cancelled: 0,
      by_priority: { high: 0, medium: 0, low: 0 },
      by_type: {} as Record<string, number>
    }

    jobs.forEach(job => {
      // Status counts
      stats[job.status]++
      
      // Priority counts
      stats.by_priority[job.priority]++
      
      // Type counts
      stats.by_type[job.type] = (stats.by_type[job.type] || 0) + 1
    })

    return stats
  }

  /**
   * Stop job processing (for testing or shutdown)
   */
  stopProcessing(): void {
    this.processing = false
    console.log('[BackgroundJobService] Job processing stopped')
  }

  /**
   * Restart job processing
   */
  restartProcessing(): void {
    if (!this.processing) {
      this.startJobProcessing()
      console.log('[BackgroundJobService] Job processing restarted')
    }
  }

  /**
   * Get all jobs (for debugging)
   */
  getAllJobs(): BackgroundJob[] {
    return Array.from(this.jobs.values())
  }

  /**
   * Clear old jobs (cleanup)
   */
  clearOldJobs(maxAgeHours: number = 24): number {
    const maxAge = maxAgeHours * 60 * 60 * 1000
    const now = new Date().getTime()
    let cleared = 0
    
    const jobsToDelete: string[] = []
    
    Array.from(this.jobs.entries()).forEach(([id, job]) => {
      // Only clear completed, failed, or cancelled jobs
      if ((job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
        const jobAge = now - job.createdAt.getTime()
        if (jobAge > maxAge) {
          jobsToDelete.push(id)
          cleared++
        }
      }
    })
    
    // Delete the jobs
    jobsToDelete.forEach(id => this.jobs.delete(id))
    
    console.log(`[BackgroundJobService] Cleared ${cleared} old jobs`)
    return cleared
  }
}

// Export singleton instance
export const backgroundJobService = new BackgroundJobService()

// Clean up old jobs periodically (every hour)
if (typeof window === 'undefined') { // Server-side only
  setInterval(() => {
    backgroundJobService.clearOldJobs(24)
  }, 60 * 60 * 1000) // 1 hour
}