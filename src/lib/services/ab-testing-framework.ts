/**
 * A/B Testing Framework for Feature Flag Management
 * Implements percentage-based rollout with symbol-based hash distribution
 */

import crypto from 'crypto'
import { metricsService } from './metrics-service'

export interface FeatureFlagConfig {
  enabled: boolean
  rolloutPercentage: number // 0-100
  description?: string
  enabledAt?: Date
  lastModified?: Date
}

export interface RolloutMetrics {
  totalRequests: number
  enabledRequests: number
  disabledRequests: number
  successRate: number
  averageLatency: number
  errorRate: number
  totalResults: number      // Track actual results recorded
  successfulResults: number // Track successful results
  failedResults: number     // Track failed results
}

export interface ABTestResult {
  enabled: boolean
  reason: 'flag_disabled' | 'symbol_hash' | 'rollout_percentage' | 'full_rollout'
  rolloutPercentage: number
  symbolHash?: string
}

/**
 * A/B Testing Framework Service
 */
export class ABTestingFramework {
  private static instance: ABTestingFramework
  private featureFlags = new Map<string, FeatureFlagConfig>()
  private metrics = new Map<string, RolloutMetrics>()

  private constructor() {
    this.initializeDefaultFlags()
  }

  public static getInstance(): ABTestingFramework {
    if (!ABTestingFramework.instance) {
      ABTestingFramework.instance = new ABTestingFramework()
    }
    return ABTestingFramework.instance
  }

  /**
   * Initialize default feature flags from environment variables
   */
  private initializeDefaultFlags(): void {
    // Firecrawl rollout flag from Task 8 requirements
    const firecrawlRolloutStr = process.env.FIRECRAWL_ROLLOUT_PERCENTAGE || '10'
    const firecrawlRollout = parseInt(firecrawlRolloutStr, 10)
    const validRollout = isNaN(firecrawlRollout) ? 10 : firecrawlRollout
    this.setFeatureFlag('firecrawl_extraction', {
      enabled: process.env.FIRECRAWL_ENABLED === 'true',
      rolloutPercentage: Math.min(Math.max(validRollout, 0), 100),
      description: 'Firecrawl MCP-based collateral extraction rollout',
      enabledAt: new Date()
    })

    // Future feature flags can be added here
    this.setFeatureFlag('enhanced_caching', {
      enabled: true,
      rolloutPercentage: 100,
      description: 'Enhanced confidence-based caching system'
    })
  }

  /**
   * Set or update a feature flag configuration
   */
  public setFeatureFlag(flagName: string, config: FeatureFlagConfig): void {
    // Validate rollout percentage
    if (config.rolloutPercentage < 0 || config.rolloutPercentage > 100) {
      throw new Error(`Invalid rollout percentage: ${config.rolloutPercentage}. Must be between 0 and 100.`)
    }

    const existingConfig = this.featureFlags.get(flagName)
    const updatedConfig: FeatureFlagConfig = {
      ...config,
      lastModified: new Date(),
      enabledAt: existingConfig?.enabledAt || (config.enabled ? new Date() : undefined)
    }

    this.featureFlags.set(flagName, updatedConfig)
    
    // Initialize metrics if not exists
    if (!this.metrics.has(flagName)) {
      this.metrics.set(flagName, {
        totalRequests: 0,
        enabledRequests: 0,
        disabledRequests: 0,
        successRate: 0,
        averageLatency: 0,
        errorRate: 0,
        totalResults: 0,
        successfulResults: 0,
        failedResults: 0
      })
    }

    metricsService.recordMetric('ab_testing', 'flag_updated', {
      flag: flagName,
      rollout_percentage: config.rolloutPercentage,
      enabled: config.enabled
    })
  }

  /**
   * Get feature flag configuration
   */
  public getFeatureFlag(flagName: string): FeatureFlagConfig | undefined {
    return this.featureFlags.get(flagName)
  }

  /**
   * Check if a feature is enabled for a given symbol/identifier
   * Uses consistent hash-based distribution for reliable A/B testing
   */
  public isFeatureEnabled(flagName: string, symbol?: string): ABTestResult {
    const config = this.featureFlags.get(flagName)
    
    if (!config) {
      throw new Error(`Feature flag '${flagName}' not found`)
    }

    // Update metrics
    this.incrementMetric(flagName, 'totalRequests')

    // Feature flag completely disabled
    if (!config.enabled) {
      this.incrementMetric(flagName, 'disabledRequests')
      return {
        enabled: false,
        reason: 'flag_disabled',
        rolloutPercentage: config.rolloutPercentage
      }
    }

    // 100% rollout - everyone gets the feature
    if (config.rolloutPercentage >= 100) {
      this.incrementMetric(flagName, 'enabledRequests')
      return {
        enabled: true,
        reason: 'full_rollout',
        rolloutPercentage: config.rolloutPercentage
      }
    }

    // 0% rollout - no one gets the feature
    if (config.rolloutPercentage <= 0) {
      this.incrementMetric(flagName, 'disabledRequests')
      return {
        enabled: false,
        reason: 'rollout_percentage',
        rolloutPercentage: config.rolloutPercentage
      }
    }

    // Use symbol-based hash distribution for consistent assignment
    const symbolHash = this.generateSymbolHash(flagName, symbol || 'default')
    const hashPercentage = this.hashToPercentage(symbolHash)
    const enabled = hashPercentage <= config.rolloutPercentage

    if (enabled) {
      this.incrementMetric(flagName, 'enabledRequests')
    } else {
      this.incrementMetric(flagName, 'disabledRequests')
    }

    return {
      enabled,
      reason: 'symbol_hash',
      rolloutPercentage: config.rolloutPercentage,
      symbolHash
    }
  }

  /**
   * Generate consistent hash for symbol and flag combination
   */
  private generateSymbolHash(flagName: string, symbol: string): string {
    const input = `${flagName}:${symbol.toLowerCase()}`
    return crypto.createHash('sha256').update(input).digest('hex')
  }

  /**
   * Convert hash to percentage (0-100)
   */
  private hashToPercentage(hash: string): number {
    // Take first 8 characters of hash for consistency
    const hashSubset = hash.substring(0, 8)
    const hashInt = parseInt(hashSubset, 16)
    // Convert to percentage (0-100)
    return (hashInt % 10000) / 100
  }

  /**
   * Record success/failure for monitoring
   */
  public recordFeatureResult(
    flagName: string, 
    success: boolean, 
    latency?: number, 
    error?: Error
  ): void {
    const metrics = this.metrics.get(flagName)
    if (!metrics) return

    // Update result counters
    metrics.totalResults++
    if (success) {
      metrics.successfulResults++
    } else {
      metrics.failedResults++
    }

    // Update success rate based on actual results
    if (metrics.totalResults > 0) {
      metrics.successRate = (metrics.successfulResults / metrics.totalResults) * 100
      metrics.errorRate = (metrics.failedResults / metrics.totalResults) * 100
    }

    // Update average latency
    if (latency !== undefined && metrics.totalResults > 0) {
      const totalLatency = metrics.averageLatency * (metrics.totalResults - 1)
      metrics.averageLatency = (totalLatency + latency) / metrics.totalResults
    }

    // Record in metrics service
    metricsService.recordMetric('ab_testing', success ? 'feature_success' : 'feature_failure', {
      flag: flagName,
      latency,
      error: error?.message
    })
  }

  /**
   * Get rollout metrics for a feature flag
   */
  public getRolloutMetrics(flagName: string): RolloutMetrics | undefined {
    return this.metrics.get(flagName)
  }

  /**
   * Get all feature flags and their current status
   */
  public getAllFeatureFlags(): Record<string, FeatureFlagConfig> {
    const result: Record<string, FeatureFlagConfig> = {}
    this.featureFlags.forEach((config, flagName) => {
      result[flagName] = { ...config }
    })
    return result
  }

  /**
   * Get rollout statistics for monitoring dashboard
   */
  public getRolloutStats(): Record<string, RolloutMetrics> {
    const result: Record<string, RolloutMetrics> = {}
    this.metrics.forEach((metrics, flagName) => {
      result[flagName] = { ...metrics }
    })
    return result
  }

  /**
   * Update rollout percentage for gradual rollout
   */
  public updateRolloutPercentage(flagName: string, newPercentage: number): void {
    const config = this.featureFlags.get(flagName)
    if (!config) {
      throw new Error(`Feature flag '${flagName}' not found`)
    }

    if (newPercentage < 0 || newPercentage > 100) {
      throw new Error(`Invalid rollout percentage: ${newPercentage}. Must be between 0 and 100.`)
    }

    this.setFeatureFlag(flagName, {
      ...config,
      rolloutPercentage: newPercentage
    })

    metricsService.recordMetric('ab_testing', 'rollout_updated', {
      flag: flagName,
      old_percentage: config.rolloutPercentage,
      new_percentage: newPercentage
    })
  }

  /**
   * Emergency rollback - disable feature immediately
   */
  public emergencyRollback(flagName: string): void {
    const config = this.featureFlags.get(flagName)
    if (!config) {
      throw new Error(`Feature flag '${flagName}' not found`)
    }

    this.setFeatureFlag(flagName, {
      ...config,
      enabled: false,
      rolloutPercentage: 0
    })

    metricsService.recordMetric('ab_testing', 'emergency_rollback', {
      flag: flagName,
      rollback_time: new Date().toISOString()
    })
  }

  /**
   * Helper method to increment metrics
   */
  private incrementMetric(flagName: string, metricName: keyof RolloutMetrics): void {
    const metrics = this.metrics.get(flagName)
    if (!metrics) return

    if (metricName === 'totalRequests' || metricName === 'enabledRequests' || metricName === 'disabledRequests') {
      ;(metrics[metricName] as number)++
    }
  }

  /**
   * Reset metrics for testing
   */
  public resetMetrics(): void {
    this.metrics.clear()
    this.featureFlags.forEach((_, flagName) => {
      this.metrics.set(flagName, {
        totalRequests: 0,
        enabledRequests: 0,
        disabledRequests: 0,
        successRate: 0,
        averageLatency: 0,
        errorRate: 0,
        totalResults: 0,
        successfulResults: 0,
        failedResults: 0
      })
    })
  }
}

// Export singleton instance
export const abTestingFramework = ABTestingFramework.getInstance()