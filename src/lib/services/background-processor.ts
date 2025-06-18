import { cacheService } from './cache-service'
import { metricsService } from './metrics-service'
import { AuditInfo, TransparencyData } from '@/lib/types'

/**
 * 🚀 BACKGROUND PROCESSOR SERVICE
 * 
 * Handles expensive operations in background to improve API response times.
 * Strategy:
 * 1. Return cached/basic data immediately
 * 2. Queue expensive operations for background processing
 * 3. Update cache when background processing completes
 * 4. Next request gets enhanced data from cache
 */
export class BackgroundProcessorService {
  private processingQueue = new Map<string, Promise<any>>()
  private readonly MAX_CONCURRENT_JOBS = 3
  private currentJobs = 0

  /**
   * Queue expensive audit discovery for background processing
   */
  async queueAuditDiscovery(
    symbol: string,
    projectName?: string,
    githubRepos?: string[],
    homepageUrls?: string[]
  ): Promise<void> {
    const jobKey = `audit:${symbol}`
    
    // Don't queue if already processing
    if (this.processingQueue.has(jobKey)) {
      console.log(`⏳ Audit discovery for ${symbol} already queued`)
      return
    }

    // Don't queue if we're at max capacity
    if (this.currentJobs >= this.MAX_CONCURRENT_JOBS) {
      console.log(`🚫 Background processor at capacity, skipping audit discovery for ${symbol}`)
      return
    }

    console.log(`📋 Queuing background audit discovery for ${symbol}`)
    
    const jobPromise = this.processAuditDiscovery(symbol, projectName, githubRepos, homepageUrls)
    this.processingQueue.set(jobKey, jobPromise)
    this.currentJobs++

    // Clean up when done
    jobPromise
      .finally(() => {
        this.processingQueue.delete(jobKey)
        this.currentJobs--
        console.log(`✅ Background audit discovery completed for ${symbol}`)
      })
      .catch(error => {
        console.error(`❌ Background audit discovery failed for ${symbol}:`, error)
      })
  }

  /**
   * Queue expensive transparency discovery for background processing
   */
  async queueTransparencyDiscovery(
    symbol: string,
    projectName?: string,
    officialUrls?: string[]
  ): Promise<void> {
    const jobKey = `transparency:${symbol}`
    
    // Don't queue if already processing
    if (this.processingQueue.has(jobKey)) {
      console.log(`⏳ Transparency discovery for ${symbol} already queued`)
      return
    }

    // Don't queue if we're at max capacity
    if (this.currentJobs >= this.MAX_CONCURRENT_JOBS) {
      console.log(`🚫 Background processor at capacity, skipping transparency discovery for ${symbol}`)
      return
    }

    console.log(`📋 Queuing background transparency discovery for ${symbol}`)
    
    const jobPromise = this.processTransparencyDiscovery(symbol, projectName, officialUrls)
    this.processingQueue.set(jobKey, jobPromise)
    this.currentJobs++

    // Clean up when done
    jobPromise
      .finally(() => {
        this.processingQueue.delete(jobKey)
        this.currentJobs--
        console.log(`✅ Background transparency discovery completed for ${symbol}`)
      })
      .catch(error => {
        console.error(`❌ Background transparency discovery failed for ${symbol}:`, error)
      })
  }

  /**
   * Process audit discovery in background
   */
  private async processAuditDiscovery(
    symbol: string,
    projectName?: string,
    githubRepos?: string[],
    homepageUrls?: string[]
  ): Promise<void> {
    const startTime = Date.now()
    
    try {
      console.log(`🔍 Background processing: Audit discovery for ${symbol}`)
      
      // Dynamic import to avoid circular dependencies
      const { auditDiscoveryService } = await import('./audit-discovery')
      
      // Run expensive discovery
      const audits = await auditDiscoveryService.discoverAudits(
        symbol,
        projectName,
        githubRepos,
        homepageUrls
      )
      
      // Update cache with results
      const cacheKey = `audit:${symbol}`
      await cacheService.set(cacheKey, audits, 24 * 60 * 60 * 1000) // 24 hours
      
      console.log(`✅ Background audit discovery completed for ${symbol}: ${audits.length} audits found`)
      metricsService.recordApiDuration(`backgroundAuditDiscovery:${symbol}`, Date.now() - startTime)
      
    } catch (error) {
      console.error(`❌ Background audit discovery failed for ${symbol}:`, error)
      metricsService.recordApiError(`backgroundAuditDiscovery:${symbol}`, error)
      
      // Cache empty result to avoid retries
      const cacheKey = `audit:${symbol}`
      await cacheService.set(cacheKey, [], 6 * 60 * 60 * 1000) // 6 hours for failures
    }
  }

  /**
   * Process transparency discovery in background
   */
  private async processTransparencyDiscovery(
    symbol: string,
    projectName?: string,
    officialUrls?: string[]
  ): Promise<void> {
    const startTime = Date.now()
    
    try {
      console.log(`🔍 Background processing: Transparency discovery for ${symbol}`)
      
      // Dynamic import to avoid circular dependencies
      const { transparencyService } = await import('./transparency')
      
      // Run expensive discovery
      const transparencyData = await transparencyService.getTransparencyData(
        symbol,
        projectName,
        officialUrls
      )
      
      // Update cache with results
      const cacheKey = `transparency:full:${symbol}`
      await cacheService.set(cacheKey, transparencyData, 24 * 60 * 60 * 1000) // 24 hours
      
      console.log(`✅ Background transparency discovery completed for ${symbol}`)
      metricsService.recordApiDuration(`backgroundTransparencyDiscovery:${symbol}`, Date.now() - startTime)
      
    } catch (error) {
      console.error(`❌ Background transparency discovery failed for ${symbol}:`, error)
      metricsService.recordApiError(`backgroundTransparencyDiscovery:${symbol}`, error)
      
      // Cache default result to avoid retries
      const cacheKey = `transparency:full:${symbol}`
      const defaultData = {
        dashboard_url: undefined,
        has_proof_of_reserves: false,
        attestation_provider: undefined,
        update_frequency: 'unknown',
        verification_status: 'unverified',
        confidence: 0.1
      }
      await cacheService.set(cacheKey, defaultData, 6 * 60 * 60 * 1000) // 6 hours for failures
    }
  }

  /**
   * Get current processing status
   */
  getStatus(): { queueSize: number; currentJobs: number; maxJobs: number } {
    return {
      queueSize: this.processingQueue.size,
      currentJobs: this.currentJobs,
      maxJobs: this.MAX_CONCURRENT_JOBS
    }
  }

  /**
   * Check if a specific job is currently processing
   */
  isProcessing(jobKey: string): boolean {
    return this.processingQueue.has(jobKey)
  }
}

// Export singleton instance
export const backgroundProcessorService = new BackgroundProcessorService() 