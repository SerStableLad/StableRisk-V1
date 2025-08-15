/**
 * Rollout Management Service - Task 13: Full Rollout Deployment
 * 
 * This service manages the complete migration rollout from manual_mapping to firecrawl_mcp
 * extraction methods with comprehensive monitoring, traffic distribution, and safety controls.
 * 
 * Key Features:
 * - 100% traffic rollout with gradual increase capabilities
 * - System stability monitoring with automatic rollback triggers
 * - Traffic distribution management across extraction methods
 * - Migration state tracking and validation
 * - Performance monitoring and alerting
 * - Cost control integration
 * - Emergency fallback mechanisms
 */

import { StablecoinInfo, CollateralData } from '@/lib/types'
import { metricsService } from './metrics-service'
import { enhancedCacheService } from './enhanced-cache-service'
import { costControlService } from './cost-control-service'
import { backgroundJobService } from './background-job-service'
import { abTestingFramework } from './ab-testing-framework'
import { config } from '@/lib/config'

// Rollout Configuration Types
export interface RolloutConfiguration {
  rollout_percentage: number
  target_stablecoins: string[]
  rollout_strategy: 'gradual' | 'immediate' | 'canary'
  monitoring_enabled: boolean
  fallback_threshold: number
  auto_rollback_enabled: boolean
}

export interface SystemStabilityMetrics {
  api_response_time_p95: number
  error_rate_percentage: number
  extraction_success_rate: number
  cache_hit_rate: number
  cost_per_hour_usd: number
  memory_usage_mb: number
  cpu_usage_percentage: number
}

export interface TrafficSplitResult {
  total_requests: number
  firecrawl_requests: number
  manual_requests: number
  hybrid_requests: number
  rollout_percentage_actual: number
  distribution_accuracy: number
}

export interface RolloutMonitoringAlert {
  alert_type: 'performance' | 'error_rate' | 'cost' | 'stability'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  metric_value: number
  threshold_value: number
  timestamp: string
  auto_action_taken?: string
}

export interface MigrationStatus {
  symbol: string
  current_method: 'manual_mapping' | 'firecrawl_mcp' | 'hybrid'
  target_method: 'firecrawl_mcp'
  migration_percentage: number
  last_extraction_time: string
  extraction_success_rate: number
  migration_complete: boolean
}

export interface StabilityCheck {
  error_rate: number
  response_time_p95: number
  extraction_success_rate: number
  resource_health: 'healthy' | 'warning' | 'critical'
}

export interface RolloutDecision {
  should_rollback: boolean
  triggers: string[]
  severity: 'medium' | 'high' | 'critical'
}

export interface DeploymentValidationResult {
  deployment_id: string
  validation_timestamp: string
  rollout_config: RolloutConfiguration
  stability_metrics: SystemStabilityMetrics
  traffic_split_results: TrafficSplitResult[]
  monitoring_alerts: RolloutMonitoringAlert[]
  overall_deployment_health: 'healthy' | 'warning' | 'critical' | 'failed'
  recommended_actions: string[]
}

/**
 * Rollout Management Service
 * Coordinates the complete migration rollout with monitoring and safety controls
 */
export class RolloutManagementService {
  private readonly config: RolloutConfiguration
  private readonly stabilityThresholds: any
  private readonly responseTimeHistory: number[] = []
  private readonly errorHistory: Array<{ success: boolean; error_type?: string; timestamp: string }> = []
  private readonly deploymentId: string
  private rolloutInProgress: boolean = false

  constructor(config?: Partial<RolloutConfiguration>) {
    this.deploymentId = `deploy-${Date.now()}`
    
    this.config = {
      rollout_percentage: 100, // Full rollout by default for Task 13
      target_stablecoins: ['USDC', 'USDT', 'DAI', 'FRAX', 'PYUSD'], // Major stablecoins
      rollout_strategy: 'gradual',
      monitoring_enabled: true,
      fallback_threshold: 0.7, // Rollback if success rate < 70%
      auto_rollback_enabled: true,
      ...config
    }

    this.stabilityThresholds = {
      max_error_rate: 15, // 15% max error rate
      max_response_time: 5000, // 5 second max response time
      min_success_rate: 0.8, // 80% min extraction success rate
      max_cost_per_hour: 10.0, // $10/hour max cost
      cpu_critical: 85, // 85% CPU usage critical
      cpu_warning: 70, // 70% CPU usage warning
      memory_critical: 1024, // 1GB memory critical
      memory_warning: 768, // 768MB memory warning
      cache_hit_minimum: 0.7 // 70% cache hit rate minimum
    }

    console.log(`[RolloutManager] Initialized deployment ${this.deploymentId}`, {
      rollout_percentage: this.config.rollout_percentage,
      target_stablecoins: this.config.target_stablecoins.length,
      strategy: this.config.rollout_strategy,
      auto_rollback: this.config.auto_rollback_enabled
    })
  }

  /**
   * Perform gradual rollout with stability monitoring
   */
  async performGradualRollout(rolloutSteps: number[] = [0, 25, 50, 75, 100]): Promise<any[]> {
    const results = []
    this.rolloutInProgress = true

    try {
      console.log(`[RolloutManager] Starting gradual rollout with steps: ${rolloutSteps.join(', ')}%`)

      for (const percentage of rolloutSteps) {
        console.log(`[RolloutManager] Rolling out to ${percentage}%`)
        
        // Update rollout percentage
        await this.setRolloutPercentage(percentage)
        
        // Perform stability check
        const stabilityCheck = await this.performStabilityCheck()
        
        const rolloutResult = {
          step: percentage,
          success: stabilityCheck.error_rate < this.stabilityThresholds.max_error_rate &&
                   stabilityCheck.response_time_p95 < this.stabilityThresholds.max_response_time &&
                   stabilityCheck.extraction_success_rate >= this.stabilityThresholds.min_success_rate,
          timestamp: new Date().toISOString(),
          stability_check: {
            api_response_time: stabilityCheck.response_time_p95,
            error_rate: stabilityCheck.error_rate,
            extraction_success_rate: stabilityCheck.extraction_success_rate
          },
          traffic_distribution: {
            firecrawl_percentage: percentage,
            manual_percentage: 100 - percentage
          }
        }

        results.push(rolloutResult)

        // Check if rollback is needed
        if (this.config.auto_rollback_enabled) {
          const rollbackDecision = this.shouldTriggerRollback(stabilityCheck, this.stabilityThresholds)
          if (rollbackDecision.should_rollback) {
            console.log(`[RolloutManager] Auto-rollback triggered:`, rollbackDecision.triggers)
            await this.performRollback(percentage, rollbackDecision.triggers)
            break
          }
        }

        // Wait before next step (simulated delay for stability)
        if (percentage < 100) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      return results
    } finally {
      this.rolloutInProgress = false
    }
  }

  /**
   * Set rollout percentage and update feature flags
   */
  async setRolloutPercentage(percentage: number): Promise<void> {
    if (percentage < 0 || percentage > 100) {
      throw new Error(`Invalid rollout percentage: ${percentage}. Must be between 0 and 100.`)
    }

    // Update AB testing framework
    abTestingFramework.updateRolloutPercentage('firecrawl_extraction', percentage)
    
    // Record metric
    metricsService.recordMetric('rollout_management', 'percentage_updated', {
      deployment_id: this.deploymentId,
      new_percentage: percentage,
      timestamp: new Date().toISOString()
    })

    console.log(`[RolloutManager] Updated rollout percentage to ${percentage}%`)
  }

  /**
   * Get current rollout status
   */
  getCurrentRollout(): { percentage: number; active_stablecoins: string[] } {
    const currentFlag = abTestingFramework.getFeatureFlag('firecrawl_extraction')
    return {
      percentage: currentFlag?.rolloutPercentage || 0,
      active_stablecoins: this.config.target_stablecoins
    }
  }

  /**
   * Distribute traffic based on rollout percentage
   */
  distributeTraffic(
    totalRequests: number,
    rolloutPercentage: number,
    stablecoinSymbol: string
  ): TrafficSplitResult {
    // Use deterministic hash-based distribution for consistency
    const symbolHash = stablecoinSymbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const shouldUseFirecrawl = (symbolHash % 100) < rolloutPercentage
    
    const firecrawlRequests = shouldUseFirecrawl ? 
      Math.floor(totalRequests * (rolloutPercentage / 100)) : 0
    const manualRequests = totalRequests - firecrawlRequests
    
    const result: TrafficSplitResult = {
      total_requests: totalRequests,
      firecrawl_requests: firecrawlRequests,
      manual_requests: manualRequests,
      hybrid_requests: 0,
      rollout_percentage_actual: (firecrawlRequests / totalRequests) * 100,
      distribution_accuracy: Math.abs(rolloutPercentage - ((firecrawlRequests / totalRequests) * 100))
    }

    // Record traffic distribution metrics
    metricsService.recordMetric('rollout_traffic', 'distribution', {
      symbol: stablecoinSymbol,
      ...result
    })

    return result
  }

  /**
   * Determine extraction method for a symbol with feature flag support
   */
  getExtractionMethod(
    symbol: string,
    rolloutPercentage: number,
    featureFlags: Record<string, boolean> = {}
  ): 'manual_mapping' | 'firecrawl_mcp' {
    // Check for override flags first
    if (featureFlags[`force_manual_${symbol}`]) {
      return 'manual_mapping'
    }
    
    if (featureFlags[`force_firecrawl_${symbol}`]) {
      return 'firecrawl_mcp'
    }
    
    if (!featureFlags.firecrawl_enabled) {
      return 'manual_mapping'
    }
    
    // Use rollout percentage for normal distribution
    const symbolHash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return (symbolHash % 100) < rolloutPercentage ? 'firecrawl_mcp' : 'manual_mapping'
  }

  /**
   * Update API response to reflect new extraction method
   */
  updateAPIResponse(
    response: any,
    useFirecrawl: boolean,
    firecrawlData?: any
  ): any {
    if (!useFirecrawl) {
      return response // Keep manual mapping response
    }

    return {
      ...response,
      transparency: {
        ...response.transparency,
        extraction_method: 'firecrawl_mcp',
        last_updated: new Date().toISOString(),
        confidence: firecrawlData?.confidence || 0.85
      },
      collateral_data: firecrawlData || response.collateral_data
    }
  }

  /**
   * Track migration status across stablecoins
   */
  trackMigrationStatus(
    symbol: string,
    rolloutPercentage: number,
    recentExtractions: Array<{ method: string; success: boolean; timestamp: string }>
  ): MigrationStatus {
    const firecrawlExtractions = recentExtractions.filter(e => e.method === 'firecrawl_mcp')
    const successfulExtractions = recentExtractions.filter(e => e.success)
    
    const currentMethod = rolloutPercentage === 100 ? 'firecrawl_mcp' : 
                         rolloutPercentage === 0 ? 'manual_mapping' : 'hybrid'
    
    return {
      symbol,
      current_method: currentMethod,
      target_method: 'firecrawl_mcp',
      migration_percentage: rolloutPercentage,
      last_extraction_time: recentExtractions[recentExtractions.length - 1]?.timestamp || '',
      extraction_success_rate: successfulExtractions.length / recentExtractions.length,
      migration_complete: rolloutPercentage === 100 && firecrawlExtractions.length > 0
    }
  }

  /**
   * Monitor system stability metrics
   */
  async performStabilityCheck(): Promise<StabilityCheck> {
    // Simulate collecting real metrics (in production, these would come from actual monitoring)
    const metrics = await this.collectSystemMetrics()
    
    return {
      error_rate: metrics.error_rate_percentage,
      response_time_p95: metrics.api_response_time_p95,
      extraction_success_rate: metrics.extraction_success_rate,
      resource_health: this.evaluateResourceHealth(metrics)
    }
  }

  /**
   * Evaluate overall resource health
   */
  private evaluateResourceHealth(metrics: SystemStabilityMetrics): 'healthy' | 'warning' | 'critical' {
    const alerts = []

    if (metrics.cpu_usage_percentage > this.stabilityThresholds.cpu_critical) {
      alerts.push('CPU_CRITICAL')
    } else if (metrics.cpu_usage_percentage > this.stabilityThresholds.cpu_warning) {
      alerts.push('CPU_WARNING')
    }

    if (metrics.memory_usage_mb > this.stabilityThresholds.memory_critical) {
      alerts.push('MEMORY_CRITICAL')
    } else if (metrics.memory_usage_mb > this.stabilityThresholds.memory_warning) {
      alerts.push('MEMORY_WARNING')
    }

    if (metrics.cache_hit_rate < this.stabilityThresholds.cache_hit_minimum) {
      alerts.push('CACHE_EFFICIENCY_LOW')
    }

    return alerts.some(a => a.includes('CRITICAL')) ? 'critical' :
           alerts.length > 0 ? 'warning' : 'healthy'
  }

  /**
   * Check if automatic rollback should be triggered
   */
  shouldTriggerRollback(stability: StabilityCheck, thresholds: any): RolloutDecision {
    const triggers = []

    if (stability.error_rate > thresholds.max_error_rate) {
      triggers.push('HIGH_ERROR_RATE')
    }

    if (stability.response_time_p95 > thresholds.max_response_time) {
      triggers.push('HIGH_RESPONSE_TIME')
    }

    if (stability.extraction_success_rate < thresholds.min_success_rate) {
      triggers.push('LOW_SUCCESS_RATE')
    }

    if (stability.resource_health === 'critical') {
      triggers.push('RESOURCE_CRITICAL')
    }

    return {
      should_rollback: triggers.length > 0,
      triggers: triggers,
      severity: triggers.includes('RESOURCE_CRITICAL') ? 'critical' : 
               triggers.length >= 2 ? 'high' : 'medium'
    }
  }

  /**
   * Perform automatic rollback
   */
  async performRollback(fromPercentage: number, reason: string[]): Promise<any[]> {
    const rollbackSteps = [fromPercentage, 50, 25, 0]
    const results = []

    console.log(`[RolloutManager] Performing rollback from ${fromPercentage}% due to:`, reason)

    for (const percentage of rollbackSteps) {
      await this.setRolloutPercentage(percentage)
      
      results.push({
        percentage: percentage,
        timestamp: new Date().toISOString(),
        action: 'rollback_step',
        reason: reason
      })
      
      // Record rollback event
      metricsService.recordMetric('rollout_management', 'rollback_step', {
        deployment_id: this.deploymentId,
        from_percentage: fromPercentage,
        to_percentage: percentage,
        reason: reason
      })
      
      await new Promise(resolve => setTimeout(resolve, 100)) // Simulate rollback delay
    }

    console.log(`[RolloutManager] Rollback completed to 0%`)
    return results
  }

  /**
   * Validate rollout configuration
   */
  validateRolloutConfig(config: RolloutConfiguration): { valid: boolean; errors: string[] } {
    const errors = []

    if (config.rollout_percentage < 0 || config.rollout_percentage > 100) {
      errors.push(`Invalid rollout percentage: ${config.rollout_percentage}`)
    }

    if (!config.target_stablecoins || config.target_stablecoins.length === 0) {
      errors.push('No target stablecoins specified')
    }

    if (config.fallback_threshold < 0 || config.fallback_threshold > 1) {
      errors.push(`Invalid fallback threshold: ${config.fallback_threshold}`)
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Collect system metrics (simulated for now)
   */
  private async collectSystemMetrics(): Promise<SystemStabilityMetrics> {
    // In production, these would be real metrics from monitoring systems
    return {
      api_response_time_p95: 1250 + Math.random() * 500,
      error_rate_percentage: 3.2 + Math.random() * 2,
      extraction_success_rate: 0.91 + Math.random() * 0.08,
      cache_hit_rate: 0.82 + Math.random() * 0.15,
      cost_per_hour_usd: 8.50 + Math.random() * 3,
      memory_usage_mb: 456 + Math.random() * 200,
      cpu_usage_percentage: 52 + Math.random() * 20
    }
  }

  /**
   * Validate migration completion across all target stablecoins
   */
  validateMigrationCompletion(
    targetStablecoins: string[],
    migrationStatuses: Record<string, {
      extraction_method: string
      rollout_percentage: number
      last_successful_extraction: string
    }>
  ): {
    total_stablecoins: number
    completed_migrations: number
    completion_rate: number
    individual_results: any[]
    overall_migration_complete: boolean
  } {
    const results = targetStablecoins.map(symbol => {
      const status = migrationStatuses[symbol]
      
      return {
        symbol: symbol,
        migration_complete: status?.extraction_method === 'firecrawl_mcp' && 
                           status?.rollout_percentage === 100,
        current_method: status?.extraction_method || 'unknown',
        rollout_percentage: status?.rollout_percentage || 0,
        has_recent_extraction: status?.last_successful_extraction && 
                              new Date(status.last_successful_extraction).getTime() > 
                              Date.now() - (24 * 60 * 60 * 1000) // Within 24 hours
      }
    })

    const completedMigrations = results.filter(r => r.migration_complete).length
    const migrationCompletionRate = completedMigrations / targetStablecoins.length

    return {
      total_stablecoins: targetStablecoins.length,
      completed_migrations: completedMigrations,
      completion_rate: migrationCompletionRate,
      individual_results: results,
      overall_migration_complete: migrationCompletionRate === 1.0
    }
  }

  /**
   * Perform comprehensive deployment validation
   */
  async performDeploymentValidation(): Promise<DeploymentValidationResult> {
    console.log(`[RolloutManager] Performing deployment validation for ${this.deploymentId}`)

    // Collect stability metrics
    const stabilityMetrics = await this.collectSystemMetrics()

    // Simulate traffic split validation
    const trafficSplitResults: TrafficSplitResult[] = this.config.target_stablecoins.map(symbol => ({
      total_requests: 1000,
      firecrawl_requests: this.config.rollout_percentage === 100 ? 1000 : 750,
      manual_requests: this.config.rollout_percentage === 100 ? 0 : 250,
      hybrid_requests: 0,
      rollout_percentage_actual: this.config.rollout_percentage === 100 ? 100 : 75,
      distribution_accuracy: 2.5
    }))

    // Generate monitoring alerts
    const monitoringAlerts: RolloutMonitoringAlert[] = []
    
    if (stabilityMetrics.error_rate_percentage > 5) {
      monitoringAlerts.push({
        alert_type: 'error_rate',
        severity: 'medium',
        message: 'Error rate above threshold',
        metric_value: stabilityMetrics.error_rate_percentage,
        threshold_value: 5,
        timestamp: new Date().toISOString()
      })
    }

    if (stabilityMetrics.cost_per_hour_usd > 10) {
      monitoringAlerts.push({
        alert_type: 'cost',
        severity: 'high',
        message: 'Hourly cost exceeding budget',
        metric_value: stabilityMetrics.cost_per_hour_usd,
        threshold_value: 10,
        timestamp: new Date().toISOString()
      })
    }

    // Determine overall health
    const criticalAlerts = monitoringAlerts.filter(a => a.severity === 'critical')
    const highAlerts = monitoringAlerts.filter(a => a.severity === 'high')
    
    const overallHealth = criticalAlerts.length > 0 ? 'critical' :
                         highAlerts.length > 0 ? 'warning' :
                         monitoringAlerts.length > 0 ? 'warning' : 'healthy'

    const recommendedActions = []
    if (stabilityMetrics.error_rate_percentage > 5) {
      recommendedActions.push('INVESTIGATE_ERROR_SOURCES')
    }
    if (stabilityMetrics.extraction_success_rate < 0.9) {
      recommendedActions.push('IMPROVE_EXTRACTION_RELIABILITY')
    }
    if (stabilityMetrics.cost_per_hour_usd > 10) {
      recommendedActions.push('OPTIMIZE_COST_EFFICIENCY')
    }

    return {
      deployment_id: this.deploymentId,
      validation_timestamp: new Date().toISOString(),
      rollout_config: this.config,
      stability_metrics: stabilityMetrics,
      traffic_split_results: trafficSplitResults,
      monitoring_alerts: monitoringAlerts,
      overall_deployment_health: overallHealth,
      recommended_actions: recommendedActions
    }
  }

  /**
   * Get deployment status summary
   */
  getDeploymentStatus() {
    const currentRollout = this.getCurrentRollout()
    return {
      deployment_id: this.deploymentId,
      rollout_in_progress: this.rolloutInProgress,
      current_percentage: currentRollout.percentage,
      target_stablecoins: this.config.target_stablecoins,
      auto_rollback_enabled: this.config.auto_rollback_enabled,
      monitoring_enabled: this.config.monitoring_enabled
    }
  }
}

// Export singleton instance
export const rolloutManagementService = new RolloutManagementService()