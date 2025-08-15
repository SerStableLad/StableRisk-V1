/**
 * Extraction Dashboard Service
 * 
 * Provides dashboard data preparation and visualization metrics for extraction methods:
 * - Summary metrics across all extractions
 * - Method comparison (Firecrawl vs Manual)
 * - Performance trending (hourly and daily aggregates)
 * - Alert summaries and top performer analysis
 * - Error type breakdown and cost analysis
 * 
 * Part of Task 9: Performance Monitoring for extraction metrics and dashboards
 */

export interface ExtractionDashboardData {
  summary: {
    total_extractions_24h: number
    firecrawl_percentage: number
    overall_success_rate: number
    average_response_time: number
    cost_per_extraction: number
    confidence_score_avg: number
  }
  method_comparison: {
    firecrawl: MethodComparisonStats
    manual: MethodComparisonStats
  }
  performance_trends: {
    hourly_data: Array<{
      hour: string
      firecrawl_success_rate: number
      manual_success_rate: number
      firecrawl_avg_latency: number
      manual_avg_latency: number
      firecrawl_cost: number
      manual_cost: number
      total_attempts: number
    }>
    daily_aggregates: Array<{
      date: string
      firecrawl_attempts: number
      manual_attempts: number
      firecrawl_success_rate: number
      manual_success_rate: number
      cost_savings_vs_manual: number
      latency_improvement: number
    }>
  }
  alerts_summary: {
    active_alerts: number
    alert_breakdown: Record<'info' | 'warning' | 'critical', number>
    recent_alerts: Array<{
      timestamp: string
      level: string
      message: string
      affected_method?: string
    }>
  }
  top_performers: {
    best_symbols: Array<{
      symbol: string
      success_rate: number
      avg_confidence: number
      method: string
      cost_efficiency: number
    }>
    worst_symbols: Array<{
      symbol: string
      success_rate: number
      error_count: number
      method: string
      avg_latency: number
    }>
  }
}

export interface MethodComparisonStats {
  total_attempts: number
  success_rate: number
  avg_latency_ms: number
  avg_confidence: number
  total_cost_usd: number
  cost_per_success: number
  error_types: Record<string, number>
}

/**
 * Dashboard Data Aggregation Service
 */
export class ExtractionDashboardService {
  private extractionData: Array<{
    method: 'firecrawl' | 'manual'
    symbol: string
    success: boolean
    latency_ms: number
    confidence_score?: number
    cost_usd?: number
    timestamp: string
    error_type?: string
  }> = []

  private alerts: Array<{
    level: 'info' | 'warning' | 'critical'
    message: string
    timestamp: string
    method?: string
  }> = []

  recordExtraction(data: {
    method: 'firecrawl' | 'manual'
    symbol: string
    success: boolean
    latency_ms: number
    confidence_score?: number
    cost_usd?: number
    error_type?: string
  }): void {
    this.extractionData.push({
      ...data,
      timestamp: new Date().toISOString()
    })
  }

  addAlert(alert: {
    level: 'info' | 'warning' | 'critical'
    message: string
    method?: string
  }): void {
    this.alerts.push({
      ...alert,
      timestamp: new Date().toISOString()
    })
  }

  getDashboardData(hoursBack: number = 24): ExtractionDashboardData {
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - hoursBack)

    const recentData = this.extractionData.filter(
      d => new Date(d.timestamp) >= cutoffTime
    )

    const firecrawlData = recentData.filter(d => d.method === 'firecrawl')
    const manualData = recentData.filter(d => d.method === 'manual')

    return {
      summary: this.calculateSummary(recentData),
      method_comparison: {
        firecrawl: this.calculateMethodStats(firecrawlData),
        manual: this.calculateMethodStats(manualData)
      },
      performance_trends: this.calculateTrends(recentData, hoursBack),
      alerts_summary: this.calculateAlertsSummary(),
      top_performers: this.calculateTopPerformers(recentData)
    }
  }

  resetData(): void {
    this.extractionData = []
    this.alerts = []
  }

  private calculateSummary(data: typeof this.extractionData) {
    const successful = data.filter(d => d.success)
    const firecrawlCount = data.filter(d => d.method === 'firecrawl').length
    const totalCost = data.reduce((sum, d) => sum + (d.cost_usd || 0), 0)
    const avgLatency = data.length > 0 ? 
      data.reduce((sum, d) => sum + d.latency_ms, 0) / data.length : 0
    
    const confidenceScores = data.filter(d => d.confidence_score !== undefined)
    const avgConfidence = confidenceScores.length > 0 ?
      confidenceScores.reduce((sum, d) => sum + (d.confidence_score || 0), 0) / confidenceScores.length : 0

    return {
      total_extractions_24h: data.length,
      firecrawl_percentage: data.length > 0 ? (firecrawlCount / data.length) * 100 : 0,
      overall_success_rate: data.length > 0 ? (successful.length / data.length) * 100 : 0,
      average_response_time: avgLatency,
      cost_per_extraction: data.length > 0 ? totalCost / data.length : 0,
      confidence_score_avg: avgConfidence
    }
  }

  private calculateMethodStats(data: typeof this.extractionData): MethodComparisonStats {
    if (data.length === 0) {
      return {
        total_attempts: 0,
        success_rate: 0,
        avg_latency_ms: 0,
        avg_confidence: 0,
        total_cost_usd: 0,
        cost_per_success: 0,
        error_types: {}
      }
    }

    const successful = data.filter(d => d.success)
    const totalCost = data.reduce((sum, d) => sum + (d.cost_usd || 0), 0)
    const avgLatency = data.reduce((sum, d) => sum + d.latency_ms, 0) / data.length
    
    const confidenceScores = data.filter(d => d.confidence_score !== undefined)
    const avgConfidence = confidenceScores.length > 0 ?
      confidenceScores.reduce((sum, d) => sum + (d.confidence_score || 0), 0) / confidenceScores.length : 0

    // Error type breakdown
    const errorTypes: Record<string, number> = {}
    data.filter(d => !d.success && d.error_type).forEach(d => {
      errorTypes[d.error_type!] = (errorTypes[d.error_type!] || 0) + 1
    })

    return {
      total_attempts: data.length,
      success_rate: (successful.length / data.length) * 100,
      avg_latency_ms: avgLatency,
      avg_confidence: avgConfidence,
      total_cost_usd: totalCost,
      cost_per_success: successful.length > 0 ? totalCost / successful.length : 0,
      error_types: errorTypes
    }
  }

  private calculateTrends(data: typeof this.extractionData, hoursBack: number) {
    const hourlyData: ExtractionDashboardData['performance_trends']['hourly_data'] = []
    const dailyAggregates: ExtractionDashboardData['performance_trends']['daily_aggregates'] = []

    // Generate hourly data
    for (let i = hoursBack - 1; i >= 0; i--) {
      const hourStart = new Date()
      hourStart.setHours(hourStart.getHours() - i, 0, 0, 0)
      const hourEnd = new Date(hourStart)
      hourEnd.setHours(hourEnd.getHours() + 1)

      const hourData = data.filter(d => {
        const ts = new Date(d.timestamp)
        return ts >= hourStart && ts < hourEnd
      })

      const firecrawlHour = hourData.filter(d => d.method === 'firecrawl')
      const manualHour = hourData.filter(d => d.method === 'manual')

      hourlyData.push({
        hour: hourStart.toISOString().slice(0, 13) + ':00',
        firecrawl_success_rate: firecrawlHour.length > 0 ?
          (firecrawlHour.filter(d => d.success).length / firecrawlHour.length) * 100 : 0,
        manual_success_rate: manualHour.length > 0 ?
          (manualHour.filter(d => d.success).length / manualHour.length) * 100 : 0,
        firecrawl_avg_latency: firecrawlHour.length > 0 ?
          firecrawlHour.reduce((sum, d) => sum + d.latency_ms, 0) / firecrawlHour.length : 0,
        manual_avg_latency: manualHour.length > 0 ?
          manualHour.reduce((sum, d) => sum + d.latency_ms, 0) / manualHour.length : 0,
        firecrawl_cost: firecrawlHour.reduce((sum, d) => sum + (d.cost_usd || 0), 0),
        manual_cost: manualHour.reduce((sum, d) => sum + (d.cost_usd || 0), 0),
        total_attempts: hourData.length
      })
    }

    // Generate daily aggregates for the past week
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date()
      dayStart.setDate(dayStart.getDate() - i)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setHours(23, 59, 59, 999)

      const dayData = this.extractionData.filter(d => {
        const ts = new Date(d.timestamp)
        return ts >= dayStart && ts <= dayEnd
      })

      const firecrawlDay = dayData.filter(d => d.method === 'firecrawl')
      const manualDay = dayData.filter(d => d.method === 'manual')

      const firecrawlSuccessRate = firecrawlDay.length > 0 ?
        (firecrawlDay.filter(d => d.success).length / firecrawlDay.length) * 100 : 0
      const manualSuccessRate = manualDay.length > 0 ?
        (manualDay.filter(d => d.success).length / manualDay.length) * 100 : 0

      const firecrawlAvgLatency = firecrawlDay.length > 0 ?
        firecrawlDay.reduce((sum, d) => sum + d.latency_ms, 0) / firecrawlDay.length : 0
      const manualAvgLatency = manualDay.length > 0 ?
        manualDay.reduce((sum, d) => sum + d.latency_ms, 0) / manualDay.length : 0

      const firecrawlCostPerSuccess = firecrawlDay.filter(d => d.success).length > 0 ?
        firecrawlDay.reduce((sum, d) => sum + (d.cost_usd || 0), 0) / firecrawlDay.filter(d => d.success).length : 0
      const manualCostPerSuccess = manualDay.filter(d => d.success).length > 0 ?
        manualDay.reduce((sum, d) => sum + (d.cost_usd || 0), 0) / manualDay.filter(d => d.success).length : 0

      dailyAggregates.push({
        date: dayStart.toISOString().split('T')[0],
        firecrawl_attempts: firecrawlDay.length,
        manual_attempts: manualDay.length,
        firecrawl_success_rate: firecrawlSuccessRate,
        manual_success_rate: manualSuccessRate,
        cost_savings_vs_manual: manualCostPerSuccess - firecrawlCostPerSuccess,
        latency_improvement: manualAvgLatency > 0 ? ((manualAvgLatency - firecrawlAvgLatency) / manualAvgLatency) * 100 : 0
      })
    }

    return { hourly_data: hourlyData, daily_aggregates: dailyAggregates }
  }

  private calculateAlertsSummary() {
    const recentAlerts = this.alerts.filter(a => {
      const alertTime = new Date(a.timestamp)
      const oneDayAgo = new Date()
      oneDayAgo.setHours(oneDayAgo.getHours() - 24)
      return alertTime >= oneDayAgo
    })

    const alertBreakdown: Record<'info' | 'warning' | 'critical', number> = {
      info: 0,
      warning: 0,
      critical: 0
    }

    recentAlerts.forEach(alert => {
      alertBreakdown[alert.level]++
    })

    return {
      active_alerts: recentAlerts.length,
      alert_breakdown: alertBreakdown,
      recent_alerts: recentAlerts.slice(-10).map(alert => ({
        timestamp: alert.timestamp,
        level: alert.level,
        message: alert.message,
        affected_method: alert.method
      }))
    }
  }

  private calculateTopPerformers(data: typeof this.extractionData) {
    // Group by symbol
    const symbolStats: Record<string, {
      attempts: number
      successes: number
      totalConfidence: number
      confidenceCount: number
      totalCost: number
      totalLatency: number
      errors: number
      method: 'firecrawl' | 'manual'
    }> = {}

    data.forEach(d => {
      if (!symbolStats[d.symbol]) {
        symbolStats[d.symbol] = {
          attempts: 0,
          successes: 0,
          totalConfidence: 0,
          confidenceCount: 0,
          totalCost: 0,
          totalLatency: 0,
          errors: 0,
          method: d.method
        }
      }

      const stats = symbolStats[d.symbol]
      stats.attempts++
      if (d.success) stats.successes++
      if (d.confidence_score !== undefined) {
        stats.totalConfidence += d.confidence_score
        stats.confidenceCount++
      }
      stats.totalCost += d.cost_usd || 0
      stats.totalLatency += d.latency_ms
      if (!d.success) stats.errors++
    })

    // Calculate derived metrics and sort
    const symbolPerformance = Object.entries(symbolStats).map(([symbol, stats]) => ({
      symbol,
      success_rate: (stats.successes / stats.attempts) * 100,
      avg_confidence: stats.confidenceCount > 0 ? stats.totalConfidence / stats.confidenceCount : 0,
      method: stats.method,
      cost_efficiency: stats.successes > 0 ? stats.totalCost / stats.successes : Infinity,
      avg_latency: stats.totalLatency / stats.attempts,
      error_count: stats.errors
    }))

    const bestSymbols = symbolPerformance
      .filter(s => s.success_rate > 0)
      .sort((a, b) => {
        // Sort by success rate first, then confidence, then cost efficiency
        if (b.success_rate !== a.success_rate) return b.success_rate - a.success_rate
        if (b.avg_confidence !== a.avg_confidence) return b.avg_confidence - a.avg_confidence
        return a.cost_efficiency - b.cost_efficiency
      })
      .slice(0, 10)

    const worstSymbols = symbolPerformance
      .filter(s => s.success_rate < 100 || s.error_count > 0)
      .sort((a, b) => {
        // Sort by success rate (lowest first), then error count (highest first)
        if (a.success_rate !== b.success_rate) return a.success_rate - b.success_rate
        return b.error_count - a.error_count
      })
      .slice(0, 10)

    return { best_symbols: bestSymbols, worst_symbols: worstSymbols }
  }
}

// Export singleton instance
export const extractionDashboardService = new ExtractionDashboardService()