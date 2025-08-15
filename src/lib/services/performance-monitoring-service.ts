/**
 * Performance Monitoring Service
 * 
 * Tracks extraction performance metrics for both Firecrawl and Manual methods:
 * - Success rates, costs, and confidence scores  
 * - Latency impact vs manual mapping
 * - Dashboard metrics for method comparison
 * - Performance degradation alerts
 * - Integration with existing MetricsService and CostControlService
 * 
 * Part of Task 9: Performance Monitoring for extraction metrics and dashboards
 */

import { metricsService } from './metrics-service'
import { costControlService } from './cost-control-service'

export interface ExtractionMetrics {
  method: 'firecrawl' | 'manual'
  symbol: string
  success: boolean
  latency_ms: number
  confidence_score?: number
  cost_usd?: number
  timestamp: string
  errors?: string[]
  extraction_data?: {
    items_found: number
    processing_time_ms: number
    quality_score: number
  }
}

export interface DashboardMetrics {
  overall: {
    total_extractions: number
    success_rate: number
    average_latency: number
    average_confidence: number
    total_cost: number
    cost_per_extraction: number
  }
  by_method: {
    firecrawl: MethodStats
    manual: MethodStats
  }
  performance_comparison: {
    latency_improvement: number // percentage improvement (negative means manual is faster)
    cost_difference: number // cost difference per extraction
    confidence_improvement: number // confidence score difference
    reliability_comparison: number // success rate difference
  }
  trending: {
    hourly_stats: Array<{
      hour: string
      firecrawl_count: number
      manual_count: number
      firecrawl_success_rate: number
      manual_success_rate: number
      avg_firecrawl_latency: number
      avg_manual_latency: number
    }>
  }
}

export interface MethodStats {
  count: number
  success_rate: number
  average_latency: number
  average_confidence: number
  total_cost: number
  cost_efficiency: number // cost per successful extraction
}

export interface AlertConfiguration {
  success_rate_threshold: number // minimum success rate before alert
  latency_threshold_ms: number // maximum latency before alert
  confidence_threshold: number // minimum confidence score before alert
  cost_efficiency_threshold: number // maximum cost per successful extraction
  budget_percentage_threshold: number // budget usage percentage threshold
  comparison_degradation_threshold: number // performance degradation threshold
}

/**
 * Performance Monitoring Service
 * Aggregates and analyzes extraction performance metrics
 */
export class PerformanceMonitoringService {
  private metrics: ExtractionMetrics[] = []
  private alertConfig: AlertConfiguration = {
    success_rate_threshold: 85,
    latency_threshold_ms: 5000,
    confidence_threshold: 0.7,
    cost_efficiency_threshold: 0.10, // $0.10 per successful extraction
    budget_percentage_threshold: 80,
    comparison_degradation_threshold: 20 // 20% degradation triggers alert
  }
  private alerts: Array<{
    type: string
    level: 'info' | 'warning' | 'critical'
    message: string
    timestamp: string
    metrics?: any
  }> = []

  recordExtractionMetric(metric: ExtractionMetrics): void {
    this.metrics.push(metric)
    
    // Record to existing services
    metricsService.recordMetric('extraction_performance', 'extraction_attempt', {
      method: metric.method,
      symbol: metric.symbol,
      success: metric.success,
      latency: metric.latency_ms,
      confidence: metric.confidence_score
    })

    if (metric.cost_usd) {
      costControlService.recordCost({
        service: metric.method === 'firecrawl' ? 'firecrawl_mcp' : 'other',
        operation_type: 'collateral_extraction',
        symbol: metric.symbol,
        cost_usd: metric.cost_usd,
        success: metric.success,
        confidence_score: metric.confidence_score
      })
    }

    // Check for performance alerts
    this.checkPerformanceAlerts()
  }

  getDashboardMetrics(hoursBack: number = 24): DashboardMetrics {
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - hoursBack)

    const relevantMetrics = this.metrics.filter(
      m => new Date(m.timestamp) >= cutoffTime
    )

    if (relevantMetrics.length === 0) {
      return this.getEmptyDashboardMetrics()
    }

    const firecrawlMetrics = relevantMetrics.filter(m => m.method === 'firecrawl')
    const manualMetrics = relevantMetrics.filter(m => m.method === 'manual')

    // Calculate overall metrics
    const totalSuccessful = relevantMetrics.filter(m => m.success).length
    const totalCost = relevantMetrics.reduce((sum, m) => sum + (m.cost_usd || 0), 0)
    const avgLatency = relevantMetrics.reduce((sum, m) => sum + m.latency_ms, 0) / relevantMetrics.length
    const avgConfidence = this.calculateAverageConfidence(relevantMetrics)

    // Calculate method-specific metrics
    const firecrawlStats = this.calculateMethodStats(firecrawlMetrics)
    const manualStats = this.calculateMethodStats(manualMetrics)

    // Calculate performance comparison
    const latencyImprovement = this.calculateLatencyImprovement(firecrawlStats, manualStats)
    const costDifference = firecrawlStats.cost_efficiency - manualStats.cost_efficiency
    const confidenceImprovement = firecrawlStats.average_confidence - manualStats.average_confidence
    const reliabilityComparison = firecrawlStats.success_rate - manualStats.success_rate

    // Generate hourly trending data
    const hourlyStats = this.generateHourlyStats(relevantMetrics, hoursBack)

    return {
      overall: {
        total_extractions: relevantMetrics.length,
        success_rate: (totalSuccessful / relevantMetrics.length) * 100,
        average_latency: avgLatency,
        average_confidence: avgConfidence,
        total_cost: totalCost,
        cost_per_extraction: totalCost / relevantMetrics.length
      },
      by_method: {
        firecrawl: firecrawlStats,
        manual: manualStats
      },
      performance_comparison: {
        latency_improvement: latencyImprovement,
        cost_difference: costDifference,
        confidence_improvement: confidenceImprovement,
        reliability_comparison: reliabilityComparison
      },
      trending: {
        hourly_stats: hourlyStats
      }
    }
  }

  getPerformanceAlerts(hours: number = 24): typeof this.alerts {
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - hours)

    return this.alerts.filter(alert => new Date(alert.timestamp) >= cutoffTime)
  }

  updateAlertConfiguration(config: Partial<AlertConfiguration>): void {
    this.alertConfig = { ...this.alertConfig, ...config }
  }

  getAlertConfiguration(): AlertConfiguration {
    return { ...this.alertConfig }
  }

  resetMetrics(): void {
    this.metrics = []
    this.alerts = []
  }

  // Historical data cleanup (retain data for specified days)
  cleanupHistoricalData(retainDays: number = 30): number {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retainDays)

    const initialCount = this.metrics.length
    this.metrics = this.metrics.filter(m => new Date(m.timestamp) >= cutoffDate)
    
    const removedCount = initialCount - this.metrics.length
    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} performance metrics older than ${retainDays} days`)
    }

    return removedCount
  }

  private calculateMethodStats(metrics: ExtractionMetrics[]): MethodStats {
    if (metrics.length === 0) {
      return {
        count: 0,
        success_rate: 0,
        average_latency: 0,
        average_confidence: 0,
        total_cost: 0,
        cost_efficiency: 0
      }
    }

    const successfulMetrics = metrics.filter(m => m.success)
    const totalCost = metrics.reduce((sum, m) => sum + (m.cost_usd || 0), 0)
    const avgLatency = metrics.reduce((sum, m) => sum + m.latency_ms, 0) / metrics.length
    const avgConfidence = this.calculateAverageConfidence(metrics)
    const costEfficiency = successfulMetrics.length > 0 ? totalCost / successfulMetrics.length : 0

    return {
      count: metrics.length,
      success_rate: (successfulMetrics.length / metrics.length) * 100,
      average_latency: avgLatency,
      average_confidence: avgConfidence,
      total_cost: totalCost,
      cost_efficiency: costEfficiency
    }
  }

  private calculateAverageConfidence(metrics: ExtractionMetrics[]): number {
    const metricsWithConfidence = metrics.filter(m => m.confidence_score !== undefined)
    if (metricsWithConfidence.length === 0) return 0

    return metricsWithConfidence.reduce((sum, m) => sum + (m.confidence_score || 0), 0) / metricsWithConfidence.length
  }

  private calculateLatencyImprovement(firecrawlStats: MethodStats, manualStats: MethodStats): number {
    if (manualStats.average_latency === 0) return 0
    return ((manualStats.average_latency - firecrawlStats.average_latency) / manualStats.average_latency) * 100
  }

  private generateHourlyStats(metrics: ExtractionMetrics[], hoursBack: number) {
    const hourlyStats: DashboardMetrics['trending']['hourly_stats'] = []
    
    for (let i = hoursBack - 1; i >= 0; i--) {
      const hourStart = new Date()
      hourStart.setHours(hourStart.getHours() - i, 0, 0, 0)
      const hourEnd = new Date(hourStart)
      hourEnd.setHours(hourEnd.getHours() + 1)

      const hourMetrics = metrics.filter(m => {
        const timestamp = new Date(m.timestamp)
        return timestamp >= hourStart && timestamp < hourEnd
      })

      const firecrawlHour = hourMetrics.filter(m => m.method === 'firecrawl')
      const manualHour = hourMetrics.filter(m => m.method === 'manual')

      hourlyStats.push({
        hour: hourStart.toISOString().slice(0, 13) + ':00',
        firecrawl_count: firecrawlHour.length,
        manual_count: manualHour.length,
        firecrawl_success_rate: firecrawlHour.length > 0 ? 
          (firecrawlHour.filter(m => m.success).length / firecrawlHour.length) * 100 : 0,
        manual_success_rate: manualHour.length > 0 ? 
          (manualHour.filter(m => m.success).length / manualHour.length) * 100 : 0,
        avg_firecrawl_latency: firecrawlHour.length > 0 ? 
          firecrawlHour.reduce((sum, m) => sum + m.latency_ms, 0) / firecrawlHour.length : 0,
        avg_manual_latency: manualHour.length > 0 ? 
          manualHour.reduce((sum, m) => sum + m.latency_ms, 0) / manualHour.length : 0
      })
    }

    return hourlyStats
  }

  private getEmptyDashboardMetrics(): DashboardMetrics {
    return {
      overall: {
        total_extractions: 0,
        success_rate: 0,
        average_latency: 0,
        average_confidence: 0,
        total_cost: 0,
        cost_per_extraction: 0
      },
      by_method: {
        firecrawl: {
          count: 0,
          success_rate: 0,
          average_latency: 0,
          average_confidence: 0,
          total_cost: 0,
          cost_efficiency: 0
        },
        manual: {
          count: 0,
          success_rate: 0,
          average_latency: 0,
          average_confidence: 0,
          total_cost: 0,
          cost_efficiency: 0
        }
      },
      performance_comparison: {
        latency_improvement: 0,
        cost_difference: 0,
        confidence_improvement: 0,
        reliability_comparison: 0
      },
      trending: {
        hourly_stats: []
      }
    }
  }

  private checkPerformanceAlerts(): void {
    const recentMetrics = this.getDashboardMetrics(1) // Last hour

    // Check overall success rate
    if (recentMetrics.overall.success_rate < this.alertConfig.success_rate_threshold) {
      this.addAlert('success_rate_low', 'warning', 
        `Overall success rate (${recentMetrics.overall.success_rate.toFixed(1)}%) below threshold (${this.alertConfig.success_rate_threshold}%)`,
        recentMetrics.overall
      )
    }

    // Check latency
    if (recentMetrics.overall.average_latency > this.alertConfig.latency_threshold_ms) {
      this.addAlert('latency_high', 'warning',
        `Average latency (${recentMetrics.overall.average_latency.toFixed(0)}ms) exceeds threshold (${this.alertConfig.latency_threshold_ms}ms)`,
        recentMetrics.overall
      )
    }

    // Check confidence scores
    if (recentMetrics.overall.average_confidence < this.alertConfig.confidence_threshold) {
      this.addAlert('confidence_low', 'warning',
        `Average confidence score (${recentMetrics.overall.average_confidence.toFixed(2)}) below threshold (${this.alertConfig.confidence_threshold})`,
        recentMetrics.overall
      )
    }

    // Check cost efficiency
    if (recentMetrics.overall.cost_per_extraction > this.alertConfig.cost_efficiency_threshold) {
      this.addAlert('cost_high', 'warning',
        `Cost per extraction ($${recentMetrics.overall.cost_per_extraction.toFixed(4)}) exceeds threshold ($${this.alertConfig.cost_efficiency_threshold})`,
        recentMetrics.overall
      )
    }

    // Check method performance degradation
    if (recentMetrics.performance_comparison.latency_improvement < -this.alertConfig.comparison_degradation_threshold) {
      this.addAlert('performance_degradation', 'critical',
        `Firecrawl method showing ${Math.abs(recentMetrics.performance_comparison.latency_improvement).toFixed(1)}% latency degradation vs manual`,
        recentMetrics.performance_comparison
      )
    }

    // Check budget status
    const budgetStatus = costControlService.getDailyBudgetStatus()
    if (budgetStatus.percentage_used > this.alertConfig.budget_percentage_threshold) {
      this.addAlert('budget_high', 'critical',
        `Daily budget usage (${budgetStatus.percentage_used.toFixed(1)}%) exceeds threshold (${this.alertConfig.budget_percentage_threshold}%)`,
        budgetStatus
      )
    }
  }

  private addAlert(type: string, level: 'info' | 'warning' | 'critical', message: string, metrics?: any): void {
    this.alerts.push({
      type,
      level,
      message,
      timestamp: new Date().toISOString(),
      metrics
    })

    console.warn(`🚨 Performance Alert [${level.toUpperCase()}]: ${message}`)
  }
}

// Export singleton instance
export const performanceMonitoringService = new PerformanceMonitoringService()