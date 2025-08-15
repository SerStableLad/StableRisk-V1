import { CollateralData, ConfidenceBasedCacheEntry, AIExtractionMetrics } from '@/lib/types'
import { cacheService } from './cache-service'

/**
 * Confidence-Based Caching Service
 * Implements dynamic TTL based on extraction confidence scores
 * Higher confidence = longer cache TTL, Lower confidence = shorter TTL
 */
export class ConfidenceBasedCachingService {
  private readonly MIN_TTL = 1 * 60 * 60 * 1000 // 1 hour minimum
  private readonly MAX_TTL = 24 * 60 * 60 * 1000 // 24 hours maximum
  private readonly CONFIDENCE_MULTIPLIER = 20 // Hours multiplier for confidence score
  
  private metrics: AIExtractionMetrics = {
    totalCost: 0,
    averageConfidence: 0,
    extractionCount: 0,
    successRate: 0,
    averageLatency: 0
  }

  /**
   * Cache collateral data with confidence-based TTL
   */
  async cacheCollateralData(
    symbol: string,
    data: CollateralData,
    confidence: number
  ): Promise<void> {
    try {
      const ttl = this.calculateTTL(confidence)
      const cacheKey = this.buildCacheKey(symbol)
      
      const cacheEntry: ConfidenceBasedCacheEntry = {
        data,
        confidence,
        cachedAt: Date.now(),
        ttl
      }

      await cacheService.set(cacheKey, cacheEntry, ttl)
      
      console.log(`[ConfidenceCache] Cached ${symbol} with confidence ${confidence.toFixed(2)} for ${this.formatTTL(ttl)}`)
      
      this.updateMetrics(confidence, ttl)
    } catch (error) {
      console.error(`[ConfidenceCache] Failed to cache ${symbol}:`, error)
    }
  }

  /**
   * Retrieve cached collateral data
   */
  async getCachedCollateralData(symbol: string): Promise<CollateralData | null> {
    try {
      const cacheKey = this.buildCacheKey(symbol)
      const cacheEntry = await cacheService.get(cacheKey) as ConfidenceBasedCacheEntry
      
      if (!cacheEntry) {
        return null
      }

      // Check if cache is still valid based on confidence-adjusted TTL
      const age = Date.now() - cacheEntry.cachedAt
      if (age > cacheEntry.ttl) {
        console.log(`[ConfidenceCache] Cache expired for ${symbol} (age: ${this.formatTTL(age)}, ttl: ${this.formatTTL(cacheEntry.ttl)})`)
        await this.invalidateCache(symbol)
        return null
      }

      console.log(`[ConfidenceCache] Cache hit for ${symbol} (confidence: ${cacheEntry.confidence.toFixed(2)}, age: ${this.formatTTL(age)})`)
      return cacheEntry.data
    } catch (error) {
      console.error(`[ConfidenceCache] Failed to retrieve ${symbol}:`, error)
      return null
    }
  }

  /**
   * Check if cached data exists and is valid
   */
  async isCached(symbol: string): Promise<boolean> {
    try {
      const cacheKey = this.buildCacheKey(symbol)
      const cacheEntry = await cacheService.get(cacheKey) as ConfidenceBasedCacheEntry
      
      if (!cacheEntry) {
        return false
      }

      const age = Date.now() - cacheEntry.cachedAt
      return age <= cacheEntry.ttl
    } catch (error) {
      console.error(`[ConfidenceCache] Error checking cache for ${symbol}:`, error)
      return false
    }
  }

  /**
   * Get cache metadata (confidence, age, TTL)
   */
  async getCacheMetadata(symbol: string): Promise<{
    confidence: number
    age: number
    ttl: number
    remainingTime: number
  } | null> {
    try {
      const cacheKey = this.buildCacheKey(symbol)
      const cacheEntry = await cacheService.get(cacheKey) as ConfidenceBasedCacheEntry
      
      if (!cacheEntry) {
        return null
      }

      const age = Date.now() - cacheEntry.cachedAt
      const remainingTime = Math.max(0, cacheEntry.ttl - age)

      return {
        confidence: cacheEntry.confidence,
        age,
        ttl: cacheEntry.ttl,
        remainingTime
      }
    } catch (error) {
      console.error(`[ConfidenceCache] Error getting metadata for ${symbol}:`, error)
      return null
    }
  }

  /**
   * Invalidate cache for a specific symbol
   */
  async invalidateCache(symbol: string): Promise<void> {
    try {
      const cacheKey = this.buildCacheKey(symbol)
      await cacheService.delete(cacheKey)
      console.log(`[ConfidenceCache] Invalidated cache for ${symbol}`)
    } catch (error) {
      console.error(`[ConfidenceCache] Error invalidating cache for ${symbol}:`, error)
    }
  }

  /**
   * Clear all confidence-based cache entries
   */
  async clearAllCache(): Promise<void> {
    try {
      // This would need to be implemented based on the underlying cache service
      // For now, we'll log the operation
      console.log(`[ConfidenceCache] Cache clear requested - not implemented for underlying cache service`)
    } catch (error) {
      console.error(`[ConfidenceCache] Error clearing cache:`, error)
    }
  }

  /**
   * Get caching performance metrics
   */
  getMetrics(): AIExtractionMetrics {
    return { ...this.metrics }
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalCost: 0,
      averageConfidence: 0,
      extractionCount: 0,
      successRate: 0,
      averageLatency: 0
    }
  }

  /**
   * Calculate TTL based on confidence score
   * Higher confidence = longer TTL
   * Low confidence = shorter TTL to allow for re-extraction
   */
  private calculateTTL(confidence: number): number {
    // Clamp confidence between 0 and 1
    const clampedConfidence = Math.max(0, Math.min(1, confidence))
    
    // Calculate TTL in milliseconds
    // Formula: MIN_TTL + (confidence^2 * CONFIDENCE_MULTIPLIER * 60 * 60 * 1000)
    // Using confidence^2 to create non-linear scaling favoring high confidence
    const baseTTL = this.MIN_TTL
    const confidenceBonus = Math.pow(clampedConfidence, 2) * this.CONFIDENCE_MULTIPLIER * 60 * 60 * 1000
    const calculatedTTL = baseTTL + confidenceBonus
    
    // Ensure TTL is within bounds
    return Math.min(this.MAX_TTL, Math.max(this.MIN_TTL, calculatedTTL))
  }

  /**
   * Build cache key for collateral data
   */
  private buildCacheKey(symbol: string): string {
    return `collateral:ai:${symbol.toLowerCase()}`
  }

  /**
   * Format TTL for human-readable logging
   */
  private formatTTL(milliseconds: number): string {
    const hours = Math.floor(milliseconds / (60 * 60 * 1000))
    const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000))
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  /**
   * Update internal metrics
   */
  private updateMetrics(confidence: number, ttl: number): void {
    this.metrics.extractionCount++
    
    // Update average confidence using incremental formula
    this.metrics.averageConfidence = 
      (this.metrics.averageConfidence * (this.metrics.extractionCount - 1) + confidence) / 
      this.metrics.extractionCount
    
    // Success rate calculation would need to be updated elsewhere when extractions fail
    this.metrics.successRate = this.metrics.extractionCount > 0 ? 
      this.metrics.successRate : 1.0
  }

  /**
   * Record extraction failure for metrics
   */
  recordExtractionFailure(): void {
    this.metrics.extractionCount++
    this.metrics.successRate = 
      (this.metrics.successRate * (this.metrics.extractionCount - 1)) / 
      this.metrics.extractionCount
  }

  /**
   * Record extraction cost for metrics
   */
  recordExtractionCost(cost: number): void {
    this.metrics.totalCost += cost
  }

  /**
   * Record extraction latency for metrics
   */
  recordExtractionLatency(latencyMs: number): void {
    // Update average latency using incremental formula
    this.metrics.averageLatency = 
      (this.metrics.averageLatency * (this.metrics.extractionCount - 1) + latencyMs) / 
      this.metrics.extractionCount
  }
}

// Export singleton instance
export const confidenceBasedCachingService = new ConfidenceBasedCachingService()