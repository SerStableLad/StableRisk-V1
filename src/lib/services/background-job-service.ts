export interface Job {
  id: string
  type: 'audit_discovery' | 'transparency_discovery' | 'detailed_analysis'
  ticker: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  data?: any
  error?: string
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  priority: 'low' | 'normal' | 'high'
}

export interface JobResult {
  success: boolean
  data?: any
  error?: string
}

class BackgroundJobService {
  private jobs = new Map<string, Job>()
  private processingQueue: Job[] = []
  private isProcessing = false
  private maxConcurrentJobs = 3

  /**
   * Add a new job to the queue
   */
  addJob(type: Job['type'], ticker: string, data?: any, priority: Job['priority'] = 'normal'): string {
    const jobId = `${type}_${ticker}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const job: Job = {
      id: jobId,
      type,
      ticker: ticker.toLowerCase(),
      status: 'pending',
      data,
      createdAt: new Date(),
      priority
    }

    this.jobs.set(jobId, job)
    this.processingQueue.push(job)
    
    // Sort queue by priority (high -> normal -> low) and creation time
    this.processingQueue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 }
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      }
      return a.createdAt.getTime() - b.createdAt.getTime()
    })

    console.log(`📋 Added ${type} job for ${ticker} (ID: ${jobId})`)
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processQueue()
    }

    return jobId
  }

  /**
   * Get job status and result
   */
  getJob(jobId: string): Job | null {
    return this.jobs.get(jobId) || null
  }

  /**
   * Get all jobs for a ticker
   */
  getJobsForTicker(ticker: string): Job[] {
    const normalizedTicker = ticker.toLowerCase()
    return Array.from(this.jobs.values()).filter(job => job.ticker === normalizedTicker)
  }

  /**
   * Check if there are any pending/processing jobs for a ticker
   */
  hasActiveJobsForTicker(ticker: string): boolean {
    const normalizedTicker = ticker.toLowerCase()
    return Array.from(this.jobs.values()).some(
      job => job.ticker === normalizedTicker && (job.status === 'pending' || job.status === 'processing')
    )
  }

  /**
   * Get the latest completed job of a specific type for a ticker
   */
  getLatestCompletedJob(ticker: string, type: Job['type']): Job | null {
    const normalizedTicker = ticker.toLowerCase()
    const completedJobs = Array.from(this.jobs.values())
      .filter(job => 
        job.ticker === normalizedTicker && 
        job.type === type && 
        job.status === 'completed'
      )
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
    
    return completedJobs[0] || null
  }

  /**
   * Process the job queue
   */
  private async processQueue() {
    if (this.isProcessing) return
    
    this.isProcessing = true
    console.log('🚀 Starting background job processing...')

    while (this.processingQueue.length > 0) {
      // Process jobs in parallel up to maxConcurrentJobs
      const jobsToProcess = this.processingQueue.splice(0, this.maxConcurrentJobs)
      
      await Promise.allSettled(
        jobsToProcess.map(job => this.processJob(job))
      )
    }

    this.isProcessing = false
    console.log('✅ Background job processing completed')
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job) {
    try {
      console.log(`🔄 Processing ${job.type} job for ${job.ticker} (ID: ${job.id})`)
      
      job.status = 'processing'
      job.startedAt = new Date()

      let result: JobResult

      switch (job.type) {
        case 'audit_discovery':
          result = await this.processAuditDiscovery(job)
          break
        case 'transparency_discovery':
          result = await this.processTransparencyDiscovery(job)
          break
        case 'detailed_analysis':
          result = await this.processDetailedAnalysis(job)
          break
        default:
          throw new Error(`Unknown job type: ${job.type}`)
      }

      if (result.success) {
        job.status = 'completed'
        job.data = result.data
        console.log(`✅ Completed ${job.type} job for ${job.ticker}`)
      } else {
        job.status = 'failed'
        job.error = result.error
        console.error(`❌ Failed ${job.type} job for ${job.ticker}: ${result.error}`)
      }

    } catch (error: any) {
      job.status = 'failed'
      job.error = error.message
      console.error(`❌ Error processing ${job.type} job for ${job.ticker}:`, error)
    } finally {
      job.completedAt = new Date()
    }
  }

  /**
   * Process audit discovery job
   */
  private async processAuditDiscovery(job: Job): Promise<JobResult> {
    try {
      // Import here to avoid circular dependencies
      const { AuditDiscoveryService } = await import('./audit-discovery')
      const auditService = new AuditDiscoveryService()
      
      const { info, auditFolderUrl } = job.data || {}
      
      if (!auditFolderUrl) {
        return { success: false, error: 'No audit folder URL provided' }
      }

      console.log(`🔍 Discovering audits for ${job.ticker} from: ${auditFolderUrl}`)
      const audits = await auditService.discoverAudits(job.ticker, info?.name, [], [auditFolderUrl])
      
      return {
        success: true,
        data: {
          audits: audits || [],
          discoveredAt: new Date().toISOString()
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Process transparency discovery job
   */
  private async processTransparencyDiscovery(job: Job): Promise<JobResult> {
    try {
      // Import here to avoid circular dependencies
      const { transparencyService } = await import('./transparency')
      
      const { info } = job.data || {}
      
      if (!info) {
        return { success: false, error: 'No stablecoin info provided' }
      }

      console.log(`🔍 Discovering transparency data for ${job.ticker}`)
      const transparencyData = await transparencyService.getTransparencyData(
        job.ticker, 
        info.name, 
        Array.isArray(info.official_links?.homepage) 
          ? info.official_links.homepage 
          : info.official_links?.homepage ? [info.official_links.homepage] : undefined
      )
      
      return {
        success: true,
        data: {
          transparency: transparencyData,
          discoveredAt: new Date().toISOString()
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Process detailed analysis job
   */
  private async processDetailedAnalysis(job: Job): Promise<JobResult> {
    try {
      // This would include detailed oracle analysis, enhanced liquidity data, etc.
      // For now, return success with placeholder data
      console.log(`🔍 Running detailed analysis for ${job.ticker}`)
      
      // Add artificial delay to simulate complex analysis
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      return {
        success: true,
        data: {
          detailedAnalysis: 'Placeholder for detailed analysis',
          analyzedAt: new Date().toISOString()
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Clean up old completed jobs (optional, for memory management)
   */
  cleanupOldJobs(maxAge: number = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoff = new Date(Date.now() - maxAge)
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'completed' && job.completedAt && job.completedAt < cutoff) {
        this.jobs.delete(jobId)
      }
    }
  }

  /**
   * Get queue status for monitoring
   */
  getQueueStatus() {
    const jobs = Array.from(this.jobs.values())
    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      isProcessing: this.isProcessing
    }
  }
}

// Export singleton instance
export const backgroundJobService = new BackgroundJobService()

// Clean up old jobs every hour
setInterval(() => {
  backgroundJobService.cleanupOldJobs()
}, 60 * 60 * 1000) 