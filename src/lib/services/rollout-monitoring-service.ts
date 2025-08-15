/**
 * Rollout Monitoring Service
 * Comprehensive monitoring and alerting for A/B test rollouts
 */

import { abTestingFramework } from './ab-testing-framework'
import { metricsService } from './metrics-service'

export interface RolloutAlert {
  severity: 'low' | 'medium' | 'high' | 'critical'
  type: 'error_rate' | 'latency' | 'success_rate' | 'cost_overrun' | 'feature_failure'
  message: string
  flagName: string
  threshold: number
  currentValue: number
  timestamp: Date
  actionRecommended?: string
}

export interface RolloutHealthCheck {
  flagName: string
  status: 'healthy' | 'warning' | 'critical'
  metrics: {
    successRate: number
    errorRate: number
    averageLatency: number
    totalRequests: number
    enabledPercentage: number
    totalResults: number
    successfulResults: number
    failedResults: number
  }
  alerts: RolloutAlert[]
  recommendations: string[]
  lastChecked: Date
}

export interface MonitoringThresholds {
  errorRateWarning: number      // 5%
  errorRateCritical: number     // 15%
  latencyWarningMs: number      // 5000ms
  latencyCriticalMs: number     // 10000ms
  successRateWarning: number    // 90%
  successRateCritical: number   // 75%
  minRequestsForAlert: number   // 10 requests minimum
}

export interface RolloutPerformanceReport {
  periodStart: Date
  periodEnd: Date
  flagName: string
  totalRequests: number
  enabledRequests: number
  successfulRequests: number
  failedRequests: number
  averageLatency: number
  p95Latency: number
  errorRate: number
  successRate: number
  costPerRequest?: number
  recommendations: string[]
}

/**
 * Rollout Monitoring Service for tracking A/B test performance
 */
export class RolloutMonitoringService {
  private static instance: RolloutMonitoringService
  private readonly defaultThresholds: MonitoringThresholds = {
    errorRateWarning: 5,      // 5%
    errorRateCritical: 15,    // 15%
    latencyWarningMs: 5000,   // 5s
    latencyCriticalMs: 10000, // 10s
    successRateWarning: 90,   // 90%
    successRateCritical: 75,  // 75%
    minRequestsForAlert: 10   // Need at least 10 requests
  }

  private customThresholds = new Map<string, Partial<MonitoringThresholds>>()
  private latencyHistory = new Map<string, number[]>()
  private alertHistory = new Map<string, RolloutAlert[]>()
  private lastHealthChecks = new Map<string, RolloutHealthCheck>()

  private constructor() {
    // Initialize monitoring for default flags
    this.startPeriodicHealthChecks()
  }

  public static getInstance(): RolloutMonitoringService {
    if (!RolloutMonitoringService.instance) {
      RolloutMonitoringService.instance = new RolloutMonitoringService()
    }
    return RolloutMonitoringService.instance
  }

  /**
   * Set custom monitoring thresholds for specific feature flags
   */
  public setThresholds(flagName: string, thresholds: Partial<MonitoringThresholds>): void {
    this.customThresholds.set(flagName, thresholds)
    
    metricsService.recordMetric('rollout_monitoring', 'thresholds_updated', {
      flag: flagName,
      thresholds
    })
  }

  /**
   * Get effective thresholds for a flag (custom or default)
   */
  private getThresholds(flagName: string): MonitoringThresholds {
    const custom = this.customThresholds.get(flagName)
    return { ...this.defaultThresholds, ...custom }
  }

  /**
   * Record latency for percentile calculations
   */
  public recordLatency(flagName: string, latency: number): void {
    if (!this.latencyHistory.has(flagName)) {
      this.latencyHistory.set(flagName, [])
    }
    
    const history = this.latencyHistory.get(flagName)!
    history.push(latency)
    
    // Keep only last 1000 measurements for performance
    if (history.length > 1000) {
      history.splice(0, history.length - 1000)
    }
  }

  /**
   * Calculate P95 latency from history
   */
  private calculateP95Latency(flagName: string): number {
    const history = this.latencyHistory.get(flagName) || []
    if (history.length === 0) return 0
    
    const sorted = [...history].sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * 0.95) - 1
    return sorted[index] || 0
  }

  /**
   * Perform comprehensive health check for a feature flag
   */
  public performHealthCheck(flagName: string): RolloutHealthCheck {
    const metrics = abTestingFramework.getRolloutMetrics(flagName)
    const thresholds = this.getThresholds(flagName)
    const alerts: RolloutAlert[] = []
    const recommendations: string[] = []

    if (!metrics) {
      return {
        flagName,
        status: 'critical',
        metrics: {
          successRate: 0,
          errorRate: 0,
          averageLatency: 0,
          totalRequests: 0,
          enabledPercentage: 0,
          totalResults: 0,
          successfulResults: 0,
          failedResults: 0
        },
        alerts: [{
          severity: 'critical',
          type: 'feature_failure',
          message: 'No metrics found for feature flag',
          flagName,
          threshold: 0,
          currentValue: 0,
          timestamp: new Date(),
          actionRecommended: 'Check if feature flag exists and is configured properly'
        }],
        recommendations: ['Verify feature flag configuration'],
        lastChecked: new Date()
      }
    }

    let status: 'healthy' | 'warning' | 'critical' = 'healthy'

    // Skip alerts if not enough data
    if (metrics.totalRequests < thresholds.minRequestsForAlert) {
      const healthCheck: RolloutHealthCheck = {
        flagName,
        status: 'healthy',
        metrics: {
          successRate: metrics.successRate,
          errorRate: metrics.errorRate,
          averageLatency: metrics.averageLatency,
          totalRequests: metrics.totalRequests,
          enabledPercentage: (metrics.enabledRequests / Math.max(metrics.totalRequests, 1)) * 100,
          totalResults: metrics.totalResults,
          successfulResults: metrics.successfulResults,
          failedResults: metrics.failedResults
        },
        alerts: [],
        recommendations: ['Insufficient data for meaningful alerts. Continue monitoring.'],
        lastChecked: new Date()
      }
      
      this.lastHealthChecks.set(flagName, healthCheck)
      return healthCheck
    }

    // Check error rate
    if (metrics.errorRate >= thresholds.errorRateCritical) {
      status = 'critical'
      alerts.push({
        severity: 'critical',
        type: 'error_rate',
        message: `Critical error rate: ${metrics.errorRate.toFixed(1)}%`,
        flagName,
        threshold: thresholds.errorRateCritical,
        currentValue: metrics.errorRate,
        timestamp: new Date(),
        actionRecommended: 'Consider immediate rollback or investigation'
      })
      recommendations.push('Emergency rollback recommended due to high error rate')
    } else if (metrics.errorRate >= thresholds.errorRateWarning) {
      status = 'warning'
      alerts.push({
        severity: 'medium',
        type: 'error_rate',
        message: `Elevated error rate: ${metrics.errorRate.toFixed(1)}%`,
        flagName,
        threshold: thresholds.errorRateWarning,
        currentValue: metrics.errorRate,
        timestamp: new Date(),
        actionRecommended: 'Monitor closely and investigate causes'
      })
      recommendations.push('Investigate error causes and consider reducing rollout percentage')
    }

    // Check success rate
    if (metrics.successRate <= thresholds.successRateCritical) {
      status = 'critical'
      alerts.push({
        severity: 'critical',
        type: 'success_rate',
        message: `Critical success rate: ${metrics.successRate.toFixed(1)}%`,
        flagName,
        threshold: thresholds.successRateCritical,
        currentValue: metrics.successRate,
        timestamp: new Date(),
        actionRecommended: 'Consider immediate rollback'
      })
      recommendations.push('Low success rate indicates serious issues - rollback recommended')
    } else if (metrics.successRate <= thresholds.successRateWarning) {
      status = status === 'critical' ? 'critical' : 'warning'
      alerts.push({
        severity: 'medium',
        type: 'success_rate',
        message: `Low success rate: ${metrics.successRate.toFixed(1)}%`,
        flagName,
        threshold: thresholds.successRateWarning,
        currentValue: metrics.successRate,
        timestamp: new Date(),
        actionRecommended: 'Investigate performance issues'
      })
      recommendations.push('Success rate below target - investigate performance bottlenecks')
    }

    // Check latency
    if (metrics.averageLatency >= thresholds.latencyCriticalMs) {
      status = 'critical'
      alerts.push({
        severity: 'critical',
        type: 'latency',
        message: `Critical latency: ${metrics.averageLatency.toFixed(0)}ms`,
        flagName,
        threshold: thresholds.latencyCriticalMs,
        currentValue: metrics.averageLatency,
        timestamp: new Date(),
        actionRecommended: 'Performance is severely degraded'
      })
      recommendations.push('Severe latency issues detected - consider rollback')
    } else if (metrics.averageLatency >= thresholds.latencyWarningMs) {
      status = status === 'critical' ? 'critical' : 'warning'
      alerts.push({
        severity: 'medium',
        type: 'latency',
        message: `Elevated latency: ${metrics.averageLatency.toFixed(0)}ms`,
        flagName,
        threshold: thresholds.latencyWarningMs,
        currentValue: metrics.averageLatency,
        timestamp: new Date(),
        actionRecommended: 'Monitor performance and optimize if needed'
      })
      recommendations.push('Latency higher than expected - monitor performance closely')
    }

    // Add positive recommendations if healthy
    if (status === 'healthy') {
      recommendations.push('Feature is performing well - consider increasing rollout percentage')
    }

    const healthCheck: RolloutHealthCheck = {
      flagName,
      status,
      metrics: {
        successRate: metrics.successRate,
        errorRate: metrics.errorRate,
        averageLatency: metrics.averageLatency,
        totalRequests: metrics.totalRequests,
        enabledPercentage: (metrics.enabledRequests / Math.max(metrics.totalRequests, 1)) * 100,
        totalResults: metrics.totalResults,
        successfulResults: metrics.successfulResults,
        failedResults: metrics.failedResults
      },
      alerts,
      recommendations,
      lastChecked: new Date()
    }

    this.lastHealthChecks.set(flagName, healthCheck)
    
    // Record alerts in history
    if (alerts.length > 0) {
      if (!this.alertHistory.has(flagName)) {
        this.alertHistory.set(flagName, [])
      }
      this.alertHistory.get(flagName)!.push(...alerts)
      
      // Record metrics for each alert
      alerts.forEach(alert => {
        metricsService.recordMetric('rollout_monitoring', 'alert_triggered', {
          flag: flagName,
          severity: alert.severity,
          type: alert.type,
          value: alert.currentValue,
          threshold: alert.threshold
        })
      })
    }

    return healthCheck
  }

  /**
   * Generate comprehensive performance report for a feature flag
   */
  public generatePerformanceReport(flagName: string, periodHours: number = 24): RolloutPerformanceReport {
    const metrics = abTestingFramework.getRolloutMetrics(flagName)
    const now = new Date()
    const periodStart = new Date(now.getTime() - (periodHours * 60 * 60 * 1000))
    
    if (!metrics) {
      return {
        periodStart,
        periodEnd: now,
        flagName,
        totalRequests: 0,
        enabledRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        p95Latency: 0,
        errorRate: 0,
        successRate: 0,
        recommendations: ['No data available for this feature flag']
      }
    }

    const p95Latency = this.calculateP95Latency(flagName)
    const successfulRequests = Math.round((metrics.successRate / 100) * metrics.enabledRequests)
    const failedRequests = metrics.enabledRequests - successfulRequests
    
    const recommendations: string[] = []
    
    // Generate recommendations based on performance
    if (metrics.successRate >= 95) {
      recommendations.push('Excellent success rate - ready for full rollout')
    } else if (metrics.successRate >= 85) {
      recommendations.push('Good performance - consider gradual rollout increase')
    } else if (metrics.successRate >= 75) {
      recommendations.push('Performance concerns - investigate issues before increasing rollout')
    } else {
      recommendations.push('Poor performance - consider rollback or major fixes')
    }

    if (metrics.averageLatency < 2000) {
      recommendations.push('Latency is within acceptable limits')
    } else if (metrics.averageLatency < 5000) {
      recommendations.push('Latency is elevated - monitor closely')
    } else {
      recommendations.push('High latency detected - performance optimization needed')
    }

    if (metrics.totalRequests < 100) {
      recommendations.push('Limited data available - continue monitoring before major decisions')
    }

    return {
      periodStart,
      periodEnd: now,
      flagName,
      totalRequests: metrics.totalRequests,
      enabledRequests: metrics.enabledRequests,
      successfulRequests,
      failedRequests,
      averageLatency: metrics.averageLatency,
      p95Latency,
      errorRate: metrics.errorRate,
      successRate: metrics.successRate,
      recommendations
    }
  }

  /**
   * Get all active alerts across all feature flags
   */
  public getActiveAlerts(): RolloutAlert[] {
    const activeAlerts: RolloutAlert[] = []
    const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000)) // Last 24 hours
    
    this.alertHistory.forEach((alerts) => {
      alerts.forEach(alert => {
        if (alert.timestamp >= cutoffTime) {
          activeAlerts.push(alert)
        }
      })
    })

    return activeAlerts.sort((a, b) => {
      // Sort by severity (critical first) then by timestamp
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity]
      if (severityDiff !== 0) return severityDiff
      return b.timestamp.getTime() - a.timestamp.getTime()
    })
  }

  /**
   * Get dashboard summary of all monitored features
   */
  public getDashboardSummary(): {
    totalFlags: number
    healthyFlags: number
    warningFlags: number
    criticalFlags: number
    totalActiveAlerts: number
    criticalAlerts: number
    lastUpdated: Date
  } {
    const allFlags = abTestingFramework.getAllFeatureFlags()
    const flagNames = Object.keys(allFlags)
    
    let healthyFlags = 0
    let warningFlags = 0
    let criticalFlags = 0

    flagNames.forEach(flagName => {
      const lastCheck = this.lastHealthChecks.get(flagName)
      if (lastCheck) {
        switch (lastCheck.status) {
          case 'healthy': healthyFlags++; break
          case 'warning': warningFlags++; break
          case 'critical': criticalFlags++; break
        }
      }
    })

    const activeAlerts = this.getActiveAlerts()
    const criticalAlerts = activeAlerts.filter(alert => alert.severity === 'critical').length

    return {
      totalFlags: flagNames.length,
      healthyFlags,
      warningFlags,
      criticalFlags,
      totalActiveAlerts: activeAlerts.length,
      criticalAlerts,
      lastUpdated: new Date()
    }
  }

  /**
   * Automated rollback if critical thresholds are exceeded
   */
  public checkAutomaticRollback(flagName: string): boolean {
    const healthCheck = this.performHealthCheck(flagName)
    
    // Automatic rollback criteria
    const criticalAlerts = healthCheck.alerts.filter(alert => alert.severity === 'critical')
    const hasMultipleCriticalAlerts = criticalAlerts.length >= 2
    const hasHighErrorRate = criticalAlerts.some(alert => 
      alert.type === 'error_rate' && alert.currentValue >= 20
    )
    const hasVeryLowSuccessRate = criticalAlerts.some(alert =>
      alert.type === 'success_rate' && alert.currentValue <= 60
    )

    if (hasMultipleCriticalAlerts || hasHighErrorRate || hasVeryLowSuccessRate) {
      try {
        abTestingFramework.emergencyRollback(flagName)
        
        metricsService.recordMetric('rollout_monitoring', 'automatic_rollback', {
          flag: flagName,
          reason: 'critical_alerts',
          alert_count: criticalAlerts.length,
          timestamp: new Date().toISOString()
        })
        
        return true
      } catch (error) {
        metricsService.recordMetric('rollout_monitoring', 'rollback_failed', {
          flag: flagName,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    return false
  }

  /**
   * Start periodic health checks (every 5 minutes)
   */
  private startPeriodicHealthChecks(): void {
    setInterval(() => {
      const allFlags = abTestingFramework.getAllFeatureFlags()
      Object.keys(allFlags).forEach(flagName => {
        this.performHealthCheck(flagName)
        this.checkAutomaticRollback(flagName)
      })
    }, 5 * 60 * 1000) // 5 minutes
  }

  /**
   * Clean up old data for performance
   */
  public cleanupOldData(): void {
    const cutoffTime = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)) // 7 days
    
    // Clean up alert history
    this.alertHistory.forEach((alerts, flagName) => {
      const recentAlerts = alerts.filter(alert => alert.timestamp >= cutoffTime)
      if (recentAlerts.length === 0) {
        this.alertHistory.delete(flagName)
      } else {
        this.alertHistory.set(flagName, recentAlerts)
      }
    })

    metricsService.recordMetric('rollout_monitoring', 'cleanup_completed', {
      cutoff_date: cutoffTime.toISOString()
    })
  }
}

// Export singleton instance
export const rolloutMonitoringService = RolloutMonitoringService.getInstance()