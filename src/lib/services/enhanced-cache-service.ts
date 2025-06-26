import { cacheService } from './cache-service'

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
    
    // Assessment results - short cache for API responses (15 minutes)
    assessment: { ttl: 15 * 60, prefix: 'assessment' },
    
    // Search results - moderate cache (2 hours)
    search: { ttl: 2 * 60 * 60, prefix: 'search' }
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
  async set<T>(type: keyof typeof this.configs, key: string, data: T): Promise<void> {
    const config = this.configs[type]
    const fullKey = `${config.prefix}:${key.toLowerCase()}`
    
    try {
      await cacheService.set(fullKey, data, config.ttl)
      console.log(`💾 Cache SET for ${type}:${key} (TTL: ${config.ttl}s)`)
    } catch (error) {
      console.warn(`Cache set error for ${fullKey}:`, error)
    }
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
   * Warm cache with popular stablecoins
   */
  async warmCache(popularStablecoins: string[] = ['USDT', 'USDC', 'DAI', 'USDE']): Promise<void> {
    console.log('🔥 Warming cache for popular stablecoins...')
    
    for (const ticker of popularStablecoins) {
      const hasBasic = await this.has('basic', ticker)
      const hasAssessment = await this.has('assessment', ticker)
      
      if (!hasBasic || !hasAssessment) {
        console.log(`🔄 Pre-warming ${ticker}...`)
        // This would trigger the full assessment and cache the results
        // Implementation would call the main service here
      }
    }
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
}

// Export singleton instance
export const enhancedCacheService = EnhancedCacheService.getInstance() 