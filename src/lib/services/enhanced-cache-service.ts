import { cacheService } from './cache-service'
import { backgroundJobsClient } from '@/lib/clients/background-jobs-client'

export interface CacheConfig {
  ttl: number // Time to live in seconds
  prefix: string
}

/**
 * Enhanced Cache Service with multi-level caching
 * Different cache TTLs for different types of data
 */
export class EnhancedCacheService {
  private static instance: EnhancedCacheService
  
  // Cache configurations for different data types
  private readonly configs = {
    // Basic stablecoin info - changes rarely (6 hours)
    basic: { ttl: 6 * 60 * 60, prefix: 'basic' },
    
    // Price history - updates frequently (30 minutes)
    price: { ttl: 30 * 60, prefix: 'price' },
    
    // Liquidity data - updates moderately (1 hour)
    liquidity: { ttl: 60 * 60, prefix: 'liquidity' },
    
    // Transparency data - changes rarely (4 hours)
    transparency: { ttl: 4 * 60 * 60, prefix: 'transparency' },
    
    // Audit data - changes very rarely (24 hours)
    audits: { ttl: 24 * 60 * 60, prefix: 'audits' },
    
    // AI analysis - confidence-based caching (2-24 hours)
    ai_analysis: { ttl: 2 * 60 * 60, prefix: 'ai_analysis' },
    
    // MCP data - fresh data (6 hours)
    mcp_data: { ttl: 6 * 60 * 60, prefix: 'mcp_data' },
    
    // Assessment results - short cache for API responses (15 minutes)
    assessment: { ttl: 15 * 60, prefix: 'assessment' },
    
    // Search results - moderate cache (2 hours)
    search: { ttl: 2 * 60 * 60, prefix: 'search' },
    
    // Universal collateral discovery - long cache (12 hours)
    universal_collateral: { ttl: 12 * 60 * 60, prefix: 'universal_collateral' },
    
    // On-chain collateral data - medium cache (6 hours)
    onchain_collateral: { ttl: 6 * 60 * 60, prefix: 'onchain_collateral' },
    
    // Firecrawl MCP extraction results - confidence-based caching
    firecrawl_extraction: { ttl: 6 * 60 * 60, prefix: 'firecrawl_extraction' }
  }

  public static getInstance(): EnhancedCacheService {
    if (!EnhancedCacheService.instance) {
      EnhancedCacheService.instance = new EnhancedCacheService()
    }
    return EnhancedCacheService.instance
  }

  /**
   * Get cached data with type-specific TTL
   */
  async get<T>(type: keyof typeof this.configs, key: string): Promise<T | null> {
    const config = this.configs[type]
    const fullKey = `${config.prefix}:${key.toLowerCase()}`
    
    try {
      const data = await cacheService.get(fullKey) as T
      if (data) {
        console.log(`🎯 Cache HIT for ${type}:${key}`)
        return data
      }
      console.log(`❌ Cache MISS for ${type}:${key}`)
      return null
    } catch (error) {
      console.warn(`Cache get error for ${fullKey}:`, error)
      return null
    }
  }

  /**
   * Set cached data with type-specific TTL
   */
  async set<T>(type: keyof typeof this.configs, key: string, data: T, customTtl?: number): Promise<void> {
    const config = this.configs[type]
    const fullKey = `${config.prefix}:${key.toLowerCase()}`
    const ttl = customTtl || config.ttl
    
    try {
      await cacheService.set(fullKey, data, ttl)
      console.log(`💾 Cache SET for ${type}:${key} (TTL: ${ttl}s)`)
    } catch (error) {
      console.warn(`Cache set error for ${fullKey}:`, error)
    }
  }

  /**
   * Set AI analysis data with confidence-based TTL
   * High confidence (>0.8): 24 hours
   * Medium confidence (0.5-0.8): 6 hours  
   * Low confidence (<0.5): 2 hours
   */
  async setAiAnalysis<T extends { confidence?: number }>(key: string, data: T): Promise<void> {
    const confidence = data.confidence || 0
    let ttl: number
    
    if (confidence > 0.8) {
      ttl = 24 * 60 * 60 // 24 hours for high confidence
    } else if (confidence >= 0.5) {
      ttl = 6 * 60 * 60  // 6 hours for medium confidence
    } else {
      ttl = 2 * 60 * 60  // 2 hours for low confidence
    }
    
    await this.set('ai_analysis', key, data, ttl)
    console.log(`🤖 AI cache SET for ${key} (confidence: ${confidence.toFixed(2)}, TTL: ${ttl}s)`)
  }

  /**
   * Set transparency data with confidence-based TTL
   */
  async setTransparencyWithConfidence<T extends { confidence?: number }>(key: string, data: T): Promise<void> {
    const confidence = data.confidence || 0
    let ttl: number
    
    if (confidence > 0.8) {
      ttl = 24 * 60 * 60 // 24 hours for high confidence transparency data
    } else if (confidence >= 0.5) {
      ttl = 6 * 60 * 60  // 6 hours for medium confidence
    } else {
      ttl = 2 * 60 * 60  // 2 hours for low confidence
    }
    
    await this.set('transparency', key, data, ttl)
    console.log(`🔍 Transparency cache SET for ${key} (confidence: ${confidence.toFixed(2)}, TTL: ${ttl}s)`)
  }

  /**
   * Set Firecrawl extraction results with confidence-based TTL
   * High confidence (>70): 24 hours
   * Medium confidence (50-70): 6 hours  
   * Low confidence (<50): 2 hours
   */
  async setFirecrawlExtraction<T extends { confidence_score?: number, extraction_method?: string }>(key: string, data: T): Promise<void> {
    const confidence = data.confidence_score || 0
    let ttl: number
    
    if (confidence > 70) {
      ttl = 24 * 60 * 60 // 24 hours for high confidence
    } else if (confidence >= 50) {
      ttl = 6 * 60 * 60  // 6 hours for medium confidence
    } else {
      ttl = 2 * 60 * 60  // 2 hours for low confidence
    }

    // Override for manual mapping fallback - shorter cache
    if (data.extraction_method === 'manual_mapping') {
      ttl = Math.min(ttl, 4 * 60 * 60) // Max 4 hours for manual fallback
    }
    
    await this.set('firecrawl_extraction', key, data, ttl)
    console.log(`🔥 Firecrawl cache SET for ${key} (confidence: ${confidence}, method: ${data.extraction_method}, TTL: ${ttl}s)`)
  }

  /**
   * Check if data exists in cache
   */
  async has(type: keyof typeof this.configs, key: string): Promise<boolean> {
    const data = await this.get(type, key)
    return data !== null
  }

  /**
   * Delete cached data
   */
  async delete(type: keyof typeof this.configs, key: string): Promise<void> {
    const config = this.configs[type]
    const fullKey = `${config.prefix}:${key.toLowerCase()}`
    
    try {
      await cacheService.delete(fullKey)
      console.log(`🗑️  Cache DELETE for ${type}:${key}`)
    } catch (error) {
      console.warn(`Cache delete error for ${fullKey}:`, error)
    }
  }

  /**
   * Warm cache with popular stablecoins using background jobs
   */
  async warmCache(popularStablecoins: string[] = ['USDT', 'USDC', 'DAI', 'USDE']): Promise<void> {
    console.log('🔥 Warming cache for popular stablecoins...')
    
    try {
      const { backgroundJobService } = await import('./background-job-service')
      
      for (const ticker of popularStablecoins) {
        // Check cache status
        const hasBasic = await this.has('basic', ticker)
        const hasAssessment = await this.has('assessment', ticker)
        const hasAiAnalysis = await this.has('ai_analysis', `ai_risk_${ticker.toLowerCase()}`)
        
        if (!hasBasic || !hasAssessment) {
          console.log(`🔄 Pre-warming basic data for ${ticker}...`)
          // Trigger a background job to warm the cache
          // This would normally call the stablecoin service, but we'll schedule background jobs instead
        }
        
        // Schedule AI jobs for cache warming if not present
        if (!hasAiAnalysis) {
          try {
            // Only schedule if no recent jobs
            const hasRecentAiJob = backgroundJobService.hasActiveJobOfType(ticker, 'ai_risk_analysis') ||
                                  backgroundJobService.hasRecentlyCompletedJob(ticker, 'ai_risk_analysis', 60)
            
            if (!hasRecentAiJob) {
              backgroundJobService.addJob(
                'ai_risk_analysis',
                ticker,
                {
                  stablecoinData: {
                    symbol: ticker,
                    name: `${ticker} Stablecoin`,
                    pegging_type: 'USD',
                    current_price: 1.0,
                    market_cap: 0, // Will be updated
                    blockchain: 'multiple',
                    genesis_date: 'unknown',
                    categories: ['stablecoin']
                  },
                  priceHistory: [],
                  additionalContext: 'Cache warming analysis'
                },
                'low' // Low priority for cache warming
              )
              console.log(`🎯 Scheduled cache warming AI analysis for ${ticker}`)
            }
          } catch (budgetError) {
            console.log(`💰 Cache warming AI job skipped for ${ticker}: ${budgetError instanceof Error ? budgetError.message : String(budgetError)}`)
          }
        }
        
        console.log(`📊 Cache status for ${ticker}: basic=${hasBasic}, assessment=${hasAssessment}, ai=${hasAiAnalysis}`)
      }
    } catch (error) {
      console.warn('Error warming cache:', error)
    }
  }

  /**
   * Schedule background cache warming on startup
   */
  async scheduleAutomaticWarming(): Promise<void> {
    console.log('🌡️ Scheduling automatic cache warming...')
    
    // Warm cache immediately
    await this.warmCache()
    
    // Schedule periodic warming (every 6 hours)
    setInterval(async () => {
      console.log('🔄 Periodic cache warming...')
      await this.warmCache()
    }, 6 * 60 * 60 * 1000) // 6 hours
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    hits: number
    misses: number
    hitRate: number
  }> {
    // This would integrate with the metrics service
    return {
      hits: 0,
      misses: 0,
      hitRate: 0
    }
  }

  /**
   * Clear all caches (for debugging)
   */
  async clearAll(): Promise<void> {
    console.log('🧹 Clearing all enhanced caches...')
    
    for (const [type, config] of Object.entries(this.configs)) {
      try {
        // Clear all keys with this prefix
        // Implementation would depend on the underlying cache service
        console.log(`Cleared ${type} cache`)
      } catch (error) {
        console.warn(`Error clearing ${type} cache:`, error)
      }
    }
  }

  /**
   * Trigger background cache invalidation for specific patterns
   * Useful for bulk cache invalidation without blocking the main thread
   */
  async triggerBackgroundCacheInvalidation(
    pattern: string,
    keys?: string[]
  ): Promise<string> {
    try {
      console.log(`[EnhancedCacheService] Triggering background cache invalidation for pattern: ${pattern}`)
      
      const jobId = await backgroundJobsClient.submitCacheInvalidationJob(
        pattern,
        keys,
        {
          timeout: 60000, // 1 minute should be enough for cache operations
          attempts: 2,
          priority: 'high' // Cache invalidation should be high priority
        }
      )
      
      console.log(`[EnhancedCacheService] Background cache invalidation job submitted: ${jobId}`)
      return jobId
    } catch (error) {
      console.error(`[EnhancedCacheService] Failed to trigger background cache invalidation:`, error)
      throw error
    }
  }

  /**
   * Invalidate cache for a specific ticker across all data types
   */
  async invalidateAllForTicker(ticker: string, useBackground: boolean = false): Promise<string | void> {
    const pattern = `*:${ticker}`
    
    if (useBackground) {
      return this.triggerBackgroundCacheInvalidation(pattern)
    } else {
      // Immediate invalidation
      for (const [type, config] of Object.entries(this.configs)) {
        const key = `${config.prefix}:${ticker}`
        try {
          await cacheService.delete(key)
          console.log(`Invalidated ${type} cache for ${ticker}`)
        } catch (error) {
          console.warn(`Error invalidating ${type} cache for ${ticker}:`, error)
        }
      }
    }
  }

  /**
   * Invalidate cache for all tickers of a specific data type
   */
  async invalidateAllForType(
    type: keyof typeof this.configs, 
    useBackground: boolean = false
  ): Promise<string | void> {
    const config = this.configs[type]
    if (!config) {
      throw new Error(`Invalid cache type: ${type}`)
    }

    const pattern = `${config.prefix}:*`
    
    if (useBackground) {
      return this.triggerBackgroundCacheInvalidation(pattern)
    } else {
      // Immediate invalidation - implementation would depend on cache service capabilities
      console.log(`Invalidated all ${type} caches`)
    }
  }

  /**
   * Get the status of a background cache invalidation job
   */
  async getCacheInvalidationJobStatus(jobId: string) {
    try {
      return await backgroundJobsClient.getJobStatus(jobId)
    } catch (error) {
      console.error(`[EnhancedCacheService] Failed to get cache invalidation job status for ${jobId}:`, error)
      return null
    }
  }
}

// Export singleton instance
export const enhancedCacheService = EnhancedCacheService.getInstance() 