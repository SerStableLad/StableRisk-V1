/**
 * Enhanced Metrics Service
 * 
 * Provides comprehensive metrics collection and aggregation for the StableRisk-AI platform:
 * - API performance tracking (duration, errors, success rates)
 * - Cache performance monitoring (hit/miss ratios)
 * - Cost metrics and budget tracking integration
 * - Extraction performance metrics for Firecrawl vs Manual methods
 * - Health metrics and system availability tracking
 * - Support for performance monitoring and alerting systems
 */

import { backgroundJobsClient } from '@/lib/clients/background-jobs-client'

export interface ApiStats {
  totalCalls: number
  totalErrors: number
  endpoints: Record<string, {
    calls: number
    errors: number
    totalDuration: number
    avgDuration: number
  }>
  avgOverallDuration: number
  requestCounts: {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    successRate: number
  }
}

export interface HealthMetrics {
  uptime: number
  successRate: number
  averageResponseTime: number
  cacheHitRatio: number
  partialResponseRate: number
  apiAvailability: number
  externalApiReliability: number
  tierPerformance: {
    tier1WithinTarget: boolean
    tier2WithinTarget: boolean
    tier3WithinTarget: boolean
  }
}

export class MetricsService {
  private metrics: Map<string, any[]> = new Map()
  private apiCalls: Array<{
    service: string
    endpoint: string
    duration: number
    timestamp: Date
    success: boolean
  }> = []
  private cacheStats = {
    hits: 0,
    misses: 0
  }
  private costMetrics: Array<{
    operation: string
    cost: number
    timestamp: Date
  }> = []
  private startTime = Date.now()

  async recordApiCall(service: string, endpoint: string, duration: number, success: boolean = true): Promise<void> {
    this.apiCalls.push({
      service,
      endpoint,
      duration,
      timestamp: new Date(),
      success
    })
    
    console.log(`API Call: ${service}/${endpoint} took ${duration}ms ${success ? '✅' : '❌'}`)
  }
  
  async recordApiDuration(endpoint: string, duration: number): Promise<void> {
    await this.recordApiCall('unknown', endpoint, duration, true)
  }
  
  async recordApiError(service: string, error: any): Promise<void> {
    console.error(`API Error: ${service}`, error)
    
    // Record as failed API call
    this.apiCalls.push({
      service,
      endpoint: 'error',
      duration: 0,
      timestamp: new Date(),
      success: false
    })
  }
  
  async recordCacheHit(key: string): Promise<void> {
    this.cacheStats.hits++
    console.log(`Cache Hit: ${key}`)
  }
  
  async recordCacheMiss(key: string): Promise<void> {
    this.cacheStats.misses++
    console.log(`Cache Miss: ${key}`)
  }
  
  async recordCostMetric(operation: string, cost: number): Promise<void> {
    this.costMetrics.push({
      operation,
      cost,
      timestamp: new Date()
    })
    console.log(`Cost Metric: ${operation} cost $${cost.toFixed(4)}`)
  }
  
  async recordMetric(service: string, event: string, metadata?: any): Promise<void> {
    const metricKey = `${service}:${event}`
    
    if (!this.metrics.has(metricKey)) {
      this.metrics.set(metricKey, [])
    }
    
    this.metrics.get(metricKey)!.push({
      timestamp: new Date(),
      metadata
    })
    
    const logMessage = `Metric: ${service}/${event}`
    if (metadata) {
      console.log(`${logMessage}`, JSON.stringify(metadata, null, 2))
    } else {
      console.log(logMessage)
    }
  }

  // New methods to support performance monitoring

  getApiStats(): ApiStats {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    const recentCalls = this.apiCalls.filter(call => call.timestamp >= last24h)
    const totalCalls = recentCalls.length
    const totalErrors = recentCalls.filter(call => !call.success).length
    const successfulCalls = recentCalls.filter(call => call.success)
    
    // Endpoint breakdown
    const endpoints: Record<string, any> = {}
    recentCalls.forEach(call => {
      const key = `${call.service}/${call.endpoint}`
      if (!endpoints[key]) {
        endpoints[key] = { calls: 0, errors: 0, totalDuration: 0, avgDuration: 0 }
      }
      endpoints[key].calls++
      endpoints[key].totalDuration += call.duration
      if (!call.success) endpoints[key].errors++
    })
    
    // Calculate averages
    Object.values(endpoints).forEach((ep: any) => {
      ep.avgDuration = ep.calls > 0 ? ep.totalDuration / ep.calls : 0
    })
    
    const avgOverallDuration = successfulCalls.length > 0 ? 
      successfulCalls.reduce((sum, call) => sum + call.duration, 0) / successfulCalls.length : 0

    return {
      totalCalls,
      totalErrors,
      endpoints,
      avgOverallDuration,
      requestCounts: {
        totalRequests: totalCalls,
        successfulRequests: successfulCalls.length,
        failedRequests: totalErrors,
        successRate: totalCalls > 0 ? (successfulCalls.length / totalCalls) * 100 : 100
      }
    }
  }

  getHealthMetrics(): HealthMetrics {
    const uptime = Date.now() - this.startTime
    const apiStats = this.getApiStats()
    const cacheHitRatio = (this.cacheStats.hits + this.cacheStats.misses) > 0 ? 
      (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100 : 0

    return {
      uptime: uptime / 1000, // seconds
      successRate: apiStats.requestCounts.successRate,
      averageResponseTime: apiStats.avgOverallDuration,
      cacheHitRatio,
      partialResponseRate: 0, // Would be calculated from actual partial responses
      apiAvailability: apiStats.requestCounts.successRate,
      externalApiReliability: apiStats.requestCounts.successRate,
      tierPerformance: {
        tier1WithinTarget: apiStats.avgOverallDuration < 1000, // < 1s target
        tier2WithinTarget: apiStats.avgOverallDuration < 3000, // < 3s target  
        tier3WithinTarget: apiStats.avgOverallDuration < 10000 // < 10s target
      }
    }
  }

  resetMetrics(): void {
    this.metrics.clear()
    this.apiCalls = []
    this.cacheStats = { hits: 0, misses: 0 }
    this.costMetrics = []
    this.startTime = Date.now()
    console.log('📊 Metrics reset')
  }

  getCacheStats() {
    return { ...this.cacheStats }
  }

  getCostMetrics(hours: number = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    return this.costMetrics.filter(metric => metric.timestamp >= cutoff)
  }

  getMetricHistory(service: string, event: string, hours: number = 24) {
    const metricKey = `${service}:${event}`
    const metrics = this.metrics.get(metricKey) || []
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000)
    
    return metrics.filter(metric => metric.timestamp >= cutoff)
  }

  /**
   * Trigger background metrics aggregation
   * Useful for periodic aggregation of large datasets
   */
  async triggerBackgroundMetricsAggregation(
    startTime: Date = new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
    endTime: Date = new Date(),
    aggregationLevel: 'minute' | 'hour' | 'day' = 'hour'
  ): Promise<string> {
    try {
      console.log(`[MetricsService] Triggering background metrics aggregation from ${startTime.toISOString()} to ${endTime.toISOString()}`)
      
      const jobId = await backgroundJobsClient.submitMetricsAggregationJob(
        startTime,
        endTime,
        aggregationLevel,
        {
          timeout: 120000, // 2 minutes for aggregation
          attempts: 2,
          priority: 'medium'
        }
      )
      
      console.log(`[MetricsService] Background metrics aggregation job submitted: ${jobId}`)
      return jobId
    } catch (error) {
      console.error(`[MetricsService] Failed to trigger background metrics aggregation:`, error)
      throw error
    }
  }

  /**
   * Check if there's an active metrics aggregation job
   */
  async hasActiveMetricsAggregationJob(): Promise<boolean> {
    try {
      const jobs = await backgroundJobsClient.queryJobs({
        type: 'aggregate-metrics',
        status: ['pending', 'processing', 'delayed'],
        limit: 10
      })
      
      return jobs.length > 0
    } catch (error) {
      console.warn(`[MetricsService] Failed to check active metrics aggregation jobs:`, error)
      return false
    }
  }

  /**
   * Get the status of a background metrics aggregation job
   */
  async getMetricsAggregationJobStatus(jobId: string) {
    try {
      return await backgroundJobsClient.getJobStatus(jobId)
    } catch (error) {
      console.error(`[MetricsService] Failed to get metrics aggregation job status for ${jobId}:`, error)
      return null
    }
  }

  /**
   * Schedule periodic metrics aggregation
   * This would typically be called from a cron job or scheduled task
   */
  async schedulePeriodicAggregation(intervalHours: number = 6): Promise<string> {
    const hasActiveJob = await this.hasActiveMetricsAggregationJob()
    if (hasActiveJob) {
      console.log(`[MetricsService] Metrics aggregation job already active, skipping`)
      return ''
    }

    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - intervalHours * 60 * 60 * 1000)
    
    return this.triggerBackgroundMetricsAggregation(startTime, endTime, 'hour')
  }
}

// Export singleton instance
export const metricsService = new MetricsService() 