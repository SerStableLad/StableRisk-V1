/**
 * Cost Control Service
 * 
 * Implements comprehensive budget tracking and cost controls for AI services:
 * - Daily budget limits with automatic cutoffs
 * - Cost tracking per extraction method
 * - Circuit breaker pattern for cost overruns
 * - Alerts and automatic fallback triggers
 * - Per-symbol and per-method cost analytics
 * 
 * Supports multiple AI services: Firecrawl MCP, Gemini AI, etc.
 */

import { config } from '@/lib/config'
import { enhancedCacheService } from './enhanced-cache-service'

export interface CostEntry {
  timestamp: string
  service: 'firecrawl_mcp' | 'gemini_ai' | 'other'
  operation_type: string
  symbol?: string
  cost_usd: number
  tokens_used?: number
  success: boolean
  confidence_score?: number
  metadata?: Record<string, unknown>
}

export interface DailyBudgetStatus {
  date: string
  total_spent: number
  budget_limit: number
  remaining_budget: number
  percentage_used: number
  service_breakdown: Record<string, number>
  operation_breakdown: Record<string, number>
  warnings_triggered: string[]
  cutoff_active: boolean
}

export interface CostAlert {
  level: 'info' | 'warning' | 'critical'
  message: string
  timestamp: string
  budget_percentage: number
  daily_spent: number
}

// Circuit breaker for cost control
class CostCircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private lastTriggered = 0
  private readonly cooldownPeriod = 300000 // 5 minutes

  isOpen(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastTriggered > this.cooldownPeriod) {
        this.state = 'HALF_OPEN'
        return false
      }
      return true
    }
    return false
  }

  trip(reason: string): void {
    this.state = 'OPEN'
    this.lastTriggered = Date.now()
    console.error(`🚫 Cost circuit breaker TRIPPED: ${reason}`)
  }

  reset(): void {
    this.state = 'CLOSED'
    console.log('✅ Cost circuit breaker RESET')
  }
}

export class CostControlService {
  private readonly dailyBudgetLimit: number
  private readonly costEntries: CostEntry[] = []
  private readonly alerts: CostAlert[] = []
  private circuitBreaker = new CostCircuitBreaker()
  private costTrackingEnabled: boolean

  // Warning thresholds
  private readonly WARNING_THRESHOLD = 0.75 // 75% of budget
  private readonly CRITICAL_THRESHOLD = 0.90 // 90% of budget
  private readonly CUTOFF_THRESHOLD = 1.0 // 100% of budget

  constructor() {
    this.dailyBudgetLimit = config.features?.aiDailyBudgetLimit || 10.0
    this.costTrackingEnabled = config.features?.aiJobCostTracking !== false
    
    // Schedule daily reset at midnight
    this.scheduleDailyReset()
    
    console.log(`💰 Cost control initialized: $${this.dailyBudgetLimit}/day limit, tracking=${this.costTrackingEnabled}`)
  }

  /**
   * Check if operation can proceed based on estimated cost
   */
  canProceedWithCost(estimatedCost: number, service: string, operationType: string): {
    allowed: boolean
    reason?: string
    currentStatus: DailyBudgetStatus
  } {
    const currentStatus = this.getDailyBudgetStatus()

    // Check if circuit breaker is open
    if (this.circuitBreaker.isOpen()) {
      return {
        allowed: false,
        reason: 'Cost circuit breaker is active',
        currentStatus
      }
    }

    // Check if cost tracking is disabled
    if (!this.costTrackingEnabled) {
      return { allowed: true, currentStatus }
    }

    // Check if adding this cost would exceed budget
    const projectedSpent = currentStatus.total_spent + estimatedCost
    const projectedPercentage = projectedSpent / this.dailyBudgetLimit

    if (projectedPercentage > this.CUTOFF_THRESHOLD) {
      this.circuitBreaker.trip(`Daily budget exceeded: $${projectedSpent.toFixed(2)} > $${this.dailyBudgetLimit}`)
      
      this.addAlert({
        level: 'critical',
        message: `Daily budget exceeded. Operation blocked: ${service}:${operationType}`,
        timestamp: new Date().toISOString(),
        budget_percentage: projectedPercentage * 100,
        daily_spent: currentStatus.total_spent
      })

      return {
        allowed: false,
        reason: `Would exceed daily budget: $${projectedSpent.toFixed(2)} > $${this.dailyBudgetLimit}`,
        currentStatus
      }
    }

    // Generate warnings if thresholds are crossed
    const currentPercentage = currentStatus.percentage_used / 100 // Convert to decimal
    
    if (projectedPercentage >= this.CRITICAL_THRESHOLD && currentPercentage < this.CRITICAL_THRESHOLD) {
      this.addAlert({
        level: 'critical',
        message: `Critical budget usage: ${(projectedPercentage * 100).toFixed(1)}% of daily budget`,
        timestamp: new Date().toISOString(),
        budget_percentage: projectedPercentage * 100,
        daily_spent: projectedSpent
      })
    } else if (projectedPercentage >= this.WARNING_THRESHOLD && currentPercentage < this.WARNING_THRESHOLD) {
      this.addAlert({
        level: 'warning',
        message: `High budget usage: ${(projectedPercentage * 100).toFixed(1)}% of daily budget`,
        timestamp: new Date().toISOString(),
        budget_percentage: projectedPercentage * 100,
        daily_spent: projectedSpent
      })
    }

    return { allowed: true, currentStatus }
  }

  /**
   * Record a cost entry for tracking and analytics
   */
  recordCost(entry: Omit<CostEntry, 'timestamp'>): void {
    if (!this.costTrackingEnabled) return

    const costEntry: CostEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    }

    this.costEntries.push(costEntry)

    // Cache the entry for persistence
    this.cacheCostEntry(costEntry)

    console.log(`💸 Cost recorded: ${entry.service}:${entry.operation_type} = $${entry.cost_usd.toFixed(4)}${entry.symbol ? ` (${entry.symbol})` : ''}`)

    // Check if this pushes us over any thresholds
    const currentStatus = this.getDailyBudgetStatus()
    this.checkThresholds(currentStatus)
  }

  /**
   * Get current daily budget status
   */
  getDailyBudgetStatus(): DailyBudgetStatus {
    const today = new Date().toISOString().split('T')[0]
    const todayEntries = this.getTodaysCostEntries()

    const totalSpent = todayEntries.reduce((sum, entry) => sum + entry.cost_usd, 0)
    const remainingBudget = Math.max(0, this.dailyBudgetLimit - totalSpent)
    const percentageUsed = (totalSpent / this.dailyBudgetLimit) * 100

    // Service breakdown
    const serviceBreakdown: Record<string, number> = {}
    const operationBreakdown: Record<string, number> = {}

    todayEntries.forEach(entry => {
      serviceBreakdown[entry.service] = (serviceBreakdown[entry.service] || 0) + entry.cost_usd
      operationBreakdown[entry.operation_type] = (operationBreakdown[entry.operation_type] || 0) + entry.cost_usd
    })

    // Recent warnings
    const recentAlerts = this.alerts
      .filter(alert => alert.timestamp.startsWith(today))
      .map(alert => `${alert.level}: ${alert.message}`)

    return {
      date: today,
      total_spent: totalSpent,
      budget_limit: this.dailyBudgetLimit,
      remaining_budget: remainingBudget,
      percentage_used: percentageUsed,
      service_breakdown: serviceBreakdown,
      operation_breakdown: operationBreakdown,
      warnings_triggered: recentAlerts,
      cutoff_active: this.circuitBreaker.isOpen()
    }
  }

  /**
   * Get cost analytics for a specific time period
   */
  getCostAnalytics(days: number = 7): {
    total_cost: number
    daily_average: number
    service_breakdown: Record<string, number>
    operation_breakdown: Record<string, number>
    success_rate: number
    average_confidence: number
    top_symbols: Array<{ symbol: string; cost: number; count: number }>
  } {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const relevantEntries = this.costEntries.filter(
      entry => new Date(entry.timestamp) >= cutoffDate
    )

    const totalCost = relevantEntries.reduce((sum, entry) => sum + entry.cost_usd, 0)
    const dailyAverage = totalCost / days

    // Service breakdown
    const serviceBreakdown: Record<string, number> = {}
    const operationBreakdown: Record<string, number> = {}
    const symbolStats: Record<string, { cost: number; count: number }> = {}

    let successfulOperations = 0
    let totalConfidence = 0
    let confidenceCount = 0

    relevantEntries.forEach(entry => {
      serviceBreakdown[entry.service] = (serviceBreakdown[entry.service] || 0) + entry.cost_usd
      operationBreakdown[entry.operation_type] = (operationBreakdown[entry.operation_type] || 0) + entry.cost_usd

      if (entry.symbol) {
        if (!symbolStats[entry.symbol]) {
          symbolStats[entry.symbol] = { cost: 0, count: 0 }
        }
        symbolStats[entry.symbol].cost += entry.cost_usd
        symbolStats[entry.symbol].count += 1
      }

      if (entry.success) successfulOperations++
      if (entry.confidence_score !== undefined) {
        totalConfidence += entry.confidence_score
        confidenceCount++
      }
    })

    const successRate = relevantEntries.length > 0 ? (successfulOperations / relevantEntries.length) * 100 : 0
    const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0

    // Top symbols by cost
    const topSymbols = Object.entries(symbolStats)
      .map(([symbol, stats]) => ({ symbol, cost: stats.cost, count: stats.count }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10)

    return {
      total_cost: totalCost,
      daily_average: dailyAverage,
      service_breakdown: serviceBreakdown,
      operation_breakdown: operationBreakdown,
      success_rate: successRate,
      average_confidence: averageConfidence,
      top_symbols: topSymbols
    }
  }

  /**
   * Reset daily budget (called automatically at midnight)
   */
  resetDailyBudget(): void {
    const today = new Date().toISOString().split('T')[0]
    const previousStatus = this.getDailyBudgetStatus()

    // Clear today's entries (keep for analytics, but remove from active tracking)
    console.log(`🔄 Daily budget reset: Previous day spent $${previousStatus.total_spent.toFixed(2)}/${this.dailyBudgetLimit}`)

    // Clear today's cost entries from active tracking
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    
    // Remove entries older than yesterday (keep current day entries during reset)
    const currentEntries = this.costEntries.filter(entry => 
      !entry.timestamp.startsWith(yesterdayStr)
    )
    this.costEntries.splice(0, this.costEntries.length, ...currentEntries)

    // Reset circuit breaker
    this.circuitBreaker.reset()

    // Clear old alerts (keep last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const recentAlerts = this.alerts.filter(
      alert => new Date(alert.timestamp) >= sevenDaysAgo
    )
    this.alerts.splice(0, this.alerts.length, ...recentAlerts)

    console.log(`💰 Daily budget reset complete for ${today}`)
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(hours: number = 24): CostAlert[] {
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - hours)

    return this.alerts.filter(alert => new Date(alert.timestamp) >= cutoffTime)
  }

  /**
   * Manually trigger emergency budget cutoff
   */
  triggerEmergencyCutoff(reason: string): void {
    this.circuitBreaker.trip(`Emergency cutoff: ${reason}`)
    
    this.addAlert({
      level: 'critical',
      message: `Emergency budget cutoff activated: ${reason}`,
      timestamp: new Date().toISOString(),
      budget_percentage: this.getDailyBudgetStatus().percentage_used,
      daily_spent: this.getDailyBudgetStatus().total_spent
    })
  }

  /**
   * Reset circuit breaker (admin function)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset()
    console.log('🔓 Circuit breaker manually reset')
  }

  // Private helper methods

  private getTodaysCostEntries(): CostEntry[] {
    const today = new Date().toISOString().split('T')[0]
    return this.costEntries.filter(entry => entry.timestamp.startsWith(today))
  }

  private addAlert(alert: CostAlert): void {
    this.alerts.push(alert)
    console.warn(`🚨 Cost Alert [${alert.level.toUpperCase()}]: ${alert.message}`)
  }

  private checkThresholds(status: DailyBudgetStatus): void {
    // Additional threshold checks can be implemented here
    // This method is called after each cost recording
  }

  private async cacheCostEntry(entry: CostEntry): Promise<void> {
    try {
      const cacheKey = `cost_entry_${entry.timestamp}`
      await enhancedCacheService.set('ai_analysis', cacheKey, entry, 7 * 24 * 60 * 60) // 7 days
    } catch (error) {
      console.warn('Failed to cache cost entry:', error)
    }
  }

  private scheduleDailyReset(): void {
    // Calculate milliseconds until next midnight
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const msUntilMidnight = tomorrow.getTime() - now.getTime()

    // Schedule first reset
    setTimeout(() => {
      this.resetDailyBudget()
      
      // Then schedule daily resets
      setInterval(() => {
        this.resetDailyBudget()
      }, 24 * 60 * 60 * 1000) // Every 24 hours
    }, msUntilMidnight)

    console.log(`⏰ Daily budget reset scheduled for ${tomorrow.toISOString().split('T')[0]} 00:00`)
  }
}

// Export singleton instance
export const costControlService = new CostControlService()