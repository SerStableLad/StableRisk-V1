/**
 * Performance Alerting System
 * 
 * Monitors performance metrics and triggers alerts based on configurable thresholds:
 * - Success rate, latency, confidence score, cost efficiency alerts
 * - Performance degradation detection with baseline comparison
 * - Configurable alert rules with cooldown periods  
 * - Alert acknowledgment and resolution tracking
 * - Integration with cost control and budget monitoring
 * 
 * Part of Task 9: Performance Monitoring for extraction metrics and dashboards
 */

import { costControlService } from './cost-control-service'

export interface AlertThresholds {
  success_rate: {
    warning: number    // Below this triggers warning (e.g., 85%)
    critical: number   // Below this triggers critical (e.g., 70%)
  }
  latency_ms: {
    warning: number    // Above this triggers warning (e.g., 3000ms)
    critical: number   // Above this triggers critical (e.g., 5000ms)
  }
  confidence_score: {
    warning: number    // Below this triggers warning (e.g., 0.75)
    critical: number   // Below this triggers critical (e.g., 0.60)
  }
  cost_efficiency: {
    warning: number    // Above this cost per success triggers warning
    critical: number   // Above this cost per success triggers critical
  }
  budget_usage: {
    warning: number    // Above this percentage triggers warning (e.g., 75%)
    critical: number   // Above this percentage triggers critical (e.g., 90%)
  }
  performance_degradation: {
    warning: number    // Performance degradation % that triggers warning (e.g., 15%)
    critical: number   // Performance degradation % that triggers critical (e.g., 30%)
  }
  error_rate: {
    warning: number    // Above this error rate triggers warning (e.g., 10%)
    critical: number   // Above this error rate triggers critical (e.g., 25%)
  }
}

export interface PerformanceDegradationAlert {
  type: 'latency_degradation' | 'success_rate_degradation' | 'confidence_degradation' | 'cost_inefficiency'
  severity: 'warning' | 'critical'
  current_value: number
  baseline_value: number
  degradation_percentage: number
  affected_method: 'firecrawl' | 'manual' | 'both'
  time_window: string
  recommendation?: string
  timestamp: string
}

export interface AlertRule {
  id: string
  name: string
  description: string
  metric_type: keyof AlertThresholds
  threshold_type: 'warning' | 'critical'
  comparison: 'greater_than' | 'less_than'
  value: number
  enabled: boolean
  cooldown_minutes: number // Prevent alert spam
  conditions?: {
    min_samples?: number    // Minimum samples required before alerting
    time_window_minutes?: number  // Time window for evaluation
    consecutive_violations?: number // Consecutive violations needed
  }
}

export interface AlertEvent {
  id: string
  rule_id: string
  severity: 'warning' | 'critical'
  message: string
  metric_value: number
  threshold_value: number
  method?: 'firecrawl' | 'manual'
  symbol?: string
  timestamp: string
  acknowledged: boolean
  acknowledged_by?: string
  acknowledged_at?: string
  resolved: boolean
  resolved_at?: string
  metadata?: Record<string, any>
}

/**
 * Performance Alerting System
 * Monitors performance metrics and triggers alerts based on configurable thresholds
 */
export class PerformanceAlertingSystem {
  private thresholds: AlertThresholds = {
    success_rate: { warning: 85, critical: 70 },
    latency_ms: { warning: 3000, critical: 5000 },
    confidence_score: { warning: 0.75, critical: 0.60 },
    cost_efficiency: { warning: 0.08, critical: 0.15 },
    budget_usage: { warning: 75, critical: 90 },
    performance_degradation: { warning: 15, critical: 30 },
    error_rate: { warning: 10, critical: 25 }
  }

  private alertRules: AlertRule[] = []
  private alertEvents: AlertEvent[] = []
  private lastAlertTimes: Map<string, number> = new Map()
  private performanceBaselines: Map<string, {
    success_rate: number
    latency_ms: number
    confidence_score: number
    cost_per_success: number
    timestamp: string
  }> = new Map()

  constructor() {
    this.initializeDefaultRules()
  }

  updateThresholds(newThresholds: Partial<AlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds }
    console.log('🔧 Alert thresholds updated:', newThresholds)
  }

  getThresholds(): AlertThresholds {
    return { ...this.thresholds }
  }

  addAlertRule(rule: AlertRule): void {
    // Validate rule
    if (!rule.id || !rule.name || !rule.metric_type) {
      throw new Error('Invalid alert rule: missing required fields')
    }

    // Check for duplicate IDs
    if (this.alertRules.find(r => r.id === rule.id)) {
      throw new Error(`Alert rule with ID '${rule.id}' already exists`)
    }

    this.alertRules.push(rule)
    console.log(`📋 Alert rule added: ${rule.name}`)
  }

  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): void {
    const ruleIndex = this.alertRules.findIndex(r => r.id === ruleId)
    if (ruleIndex === -1) {
      throw new Error(`Alert rule with ID '${ruleId}' not found`)
    }

    this.alertRules[ruleIndex] = { ...this.alertRules[ruleIndex], ...updates }
    console.log(`📝 Alert rule updated: ${ruleId}`)
  }

  deleteAlertRule(ruleId: string): void {
    const ruleIndex = this.alertRules.findIndex(r => r.id === ruleId)
    if (ruleIndex === -1) {
      throw new Error(`Alert rule with ID '${ruleId}' not found`)
    }

    this.alertRules.splice(ruleIndex, 1)
    console.log(`🗑️ Alert rule deleted: ${ruleId}`)
  }

  getAlertRules(): AlertRule[] {
    return [...this.alertRules]
  }

  checkPerformanceMetrics(metrics: {
    method: 'firecrawl' | 'manual'
    success_rate: number
    average_latency_ms: number
    average_confidence: number
    cost_per_success: number
    error_rate: number
    sample_count: number
    time_window_minutes: number
  }): AlertEvent[] {
    const newAlerts: AlertEvent[] = []

    // Check each enabled alert rule
    this.alertRules.filter(rule => rule.enabled).forEach(rule => {
      const alertEvent = this.evaluateRule(rule, metrics)
      if (alertEvent) {
        newAlerts.push(alertEvent)
      }
    })

    // Check for performance degradation
    const degradationAlerts = this.checkPerformanceDegradation(metrics)
    newAlerts.push(...degradationAlerts)

    // Store new alerts
    this.alertEvents.push(...newAlerts)

    return newAlerts
  }

  checkPerformanceDegradation(currentMetrics: {
    method: 'firecrawl' | 'manual'
    success_rate: number
    average_latency_ms: number
    average_confidence: number
    cost_per_success: number
    time_window_minutes: number
  }): AlertEvent[] {
    const alerts: AlertEvent[] = []
    const baselineKey = currentMetrics.method
    const baseline = this.performanceBaselines.get(baselineKey)

    if (!baseline) {
      // No baseline yet, establish one
      this.performanceBaselines.set(baselineKey, {
        success_rate: currentMetrics.success_rate,
        latency_ms: currentMetrics.average_latency_ms,
        confidence_score: currentMetrics.average_confidence,
        cost_per_success: currentMetrics.cost_per_success,
        timestamp: new Date().toISOString()
      })
      return alerts
    }

    // Check for latency degradation
    const latencyDegradation = this.calculateDegradationPercentage(
      baseline.latency_ms, currentMetrics.average_latency_ms, 'higher_is_worse'
    )

    if (latencyDegradation >= this.thresholds.performance_degradation.critical) {
      alerts.push(this.createDegradationAlert(
        'latency_degradation', 'critical', currentMetrics.average_latency_ms,
        baseline.latency_ms, latencyDegradation, currentMetrics.method
      ))
    } else if (latencyDegradation >= this.thresholds.performance_degradation.warning) {
      alerts.push(this.createDegradationAlert(
        'latency_degradation', 'warning', currentMetrics.average_latency_ms,
        baseline.latency_ms, latencyDegradation, currentMetrics.method
      ))
    }

    // Check for success rate degradation
    const successDegradation = this.calculateDegradationPercentage(
      baseline.success_rate, currentMetrics.success_rate, 'lower_is_worse'
    )

    if (successDegradation >= this.thresholds.performance_degradation.critical) {
      alerts.push(this.createDegradationAlert(
        'success_rate_degradation', 'critical', currentMetrics.success_rate,
        baseline.success_rate, successDegradation, currentMetrics.method
      ))
    } else if (successDegradation >= this.thresholds.performance_degradation.warning) {
      alerts.push(this.createDegradationAlert(
        'success_rate_degradation', 'warning', currentMetrics.success_rate,
        baseline.success_rate, successDegradation, currentMetrics.method
      ))
    }

    // Check for confidence score degradation
    const confidenceDegradation = this.calculateDegradationPercentage(
      baseline.confidence_score, currentMetrics.average_confidence, 'lower_is_worse'
    )

    if (confidenceDegradation >= this.thresholds.performance_degradation.critical) {
      alerts.push(this.createDegradationAlert(
        'confidence_degradation', 'critical', currentMetrics.average_confidence,
        baseline.confidence_score, confidenceDegradation, currentMetrics.method
      ))
    } else if (confidenceDegradation >= this.thresholds.performance_degradation.warning) {
      alerts.push(this.createDegradationAlert(
        'confidence_degradation', 'warning', currentMetrics.average_confidence,
        baseline.confidence_score, confidenceDegradation, currentMetrics.method
      ))
    }

    // Check for cost inefficiency
    const costDegradation = this.calculateDegradationPercentage(
      baseline.cost_per_success, currentMetrics.cost_per_success, 'higher_is_worse'
    )

    if (costDegradation >= this.thresholds.performance_degradation.critical) {
      alerts.push(this.createDegradationAlert(
        'cost_inefficiency', 'critical', currentMetrics.cost_per_success,
        baseline.cost_per_success, costDegradation, currentMetrics.method
      ))
    } else if (costDegradation >= this.thresholds.performance_degradation.warning) {
      alerts.push(this.createDegradationAlert(
        'cost_inefficiency', 'warning', currentMetrics.cost_per_success,
        baseline.cost_per_success, costDegradation, currentMetrics.method
      ))
    }

    return alerts
  }

  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alertEvents.find(a => a.id === alertId)
    if (!alert) return false

    alert.acknowledged = true
    alert.acknowledged_by = acknowledgedBy
    alert.acknowledged_at = new Date().toISOString()

    console.log(`✅ Alert acknowledged: ${alertId} by ${acknowledgedBy}`)
    return true
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alertEvents.find(a => a.id === alertId)
    if (!alert) return false

    alert.resolved = true
    alert.resolved_at = new Date().toISOString()

    console.log(`🔒 Alert resolved: ${alertId}`)
    return true
  }

  getActiveAlerts(): AlertEvent[] {
    return this.alertEvents.filter(a => !a.resolved)
  }

  getAlertHistory(hours: number = 24): AlertEvent[] {
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - hours)

    return this.alertEvents.filter(a => new Date(a.timestamp) >= cutoffTime)
  }

  updateBaseline(method: 'firecrawl' | 'manual', metrics: {
    success_rate: number
    average_latency_ms: number
    average_confidence: number
    cost_per_success: number
  }): void {
    this.performanceBaselines.set(method, {
      success_rate: metrics.success_rate,
      latency_ms: metrics.average_latency_ms,
      confidence_score: metrics.average_confidence,
      cost_per_success: metrics.cost_per_success,
      timestamp: new Date().toISOString()
    })

    console.log(`📊 Performance baseline updated for ${method}`)
  }

  getBaselines(): Record<string, any> {
    const baselines: Record<string, any> = {}
    this.performanceBaselines.forEach((value, key) => {
      baselines[key] = value
    })
    return baselines
  }

  clearAlerts(): void {
    this.alertEvents = []
    this.lastAlertTimes.clear()
  }

  clearBaselines(): void {
    this.performanceBaselines.clear()
  }

  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'firecrawl_success_rate_warning',
        name: 'Firecrawl Success Rate Warning',
        description: 'Alert when Firecrawl success rate drops below warning threshold',
        metric_type: 'success_rate',
        threshold_type: 'warning',
        comparison: 'less_than',
        value: 85,
        enabled: true,
        cooldown_minutes: 30,
        conditions: { min_samples: 5, time_window_minutes: 60 }
      },
      {
        id: 'manual_latency_critical',
        name: 'Manual Extraction Latency Critical',
        description: 'Alert when manual extraction latency exceeds critical threshold',
        metric_type: 'latency_ms',
        threshold_type: 'critical',
        comparison: 'greater_than',
        value: 8000,
        enabled: true,
        cooldown_minutes: 15,
        conditions: { min_samples: 3 }
      },
      {
        id: 'confidence_score_warning',
        name: 'Low Confidence Score Warning',
        description: 'Alert when average confidence score drops below threshold',
        metric_type: 'confidence_score',
        threshold_type: 'warning',
        comparison: 'less_than',
        value: 0.75,
        enabled: true,
        cooldown_minutes: 45,
        conditions: { min_samples: 10, consecutive_violations: 2 }
      }
    ]

    this.alertRules.push(...defaultRules)
  }

  private evaluateRule(rule: AlertRule, metrics: {
    method: 'firecrawl' | 'manual'
    success_rate: number
    average_latency_ms: number
    average_confidence: number
    cost_per_success: number
    error_rate: number
    sample_count: number
    time_window_minutes: number
  }): AlertEvent | null {
    // Check cooldown
    const lastAlertTime = this.lastAlertTimes.get(rule.id) || 0
    const cooldownMs = rule.cooldown_minutes * 60 * 1000
    if (Date.now() - lastAlertTime < cooldownMs) {
      return null
    }

    // Check minimum samples condition
    if (rule.conditions?.min_samples && metrics.sample_count < rule.conditions.min_samples) {
      return null
    }

    // Get metric value
    let metricValue: number
    switch (rule.metric_type) {
      case 'success_rate':
        metricValue = metrics.success_rate
        break
      case 'latency_ms':
        metricValue = metrics.average_latency_ms
        break
      case 'confidence_score':
        metricValue = metrics.average_confidence
        break
      case 'cost_efficiency':
        metricValue = metrics.cost_per_success
        break
      case 'error_rate':
        metricValue = metrics.error_rate
        break
      default:
        return null
    }

    // Check threshold violation
    let violatesThreshold = false
    if (rule.comparison === 'greater_than') {
      violatesThreshold = metricValue > rule.value
    } else if (rule.comparison === 'less_than') {
      violatesThreshold = metricValue < rule.value
    }

    if (!violatesThreshold) {
      return null
    }

    // Create alert event
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const alertEvent: AlertEvent = {
      id: alertId,
      rule_id: rule.id,
      severity: rule.threshold_type,
      message: `${rule.name}: ${rule.metric_type} (${metricValue.toFixed(2)}) ${rule.comparison.replace('_', ' ')} ${rule.value}`,
      metric_value: metricValue,
      threshold_value: rule.value,
      method: metrics.method,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
      metadata: {
        rule_name: rule.name,
        metric_type: rule.metric_type,
        sample_count: metrics.sample_count,
        time_window_minutes: metrics.time_window_minutes
      }
    }

    // Update last alert time
    this.lastAlertTimes.set(rule.id, Date.now())

    console.warn(`🚨 Alert triggered: ${alertEvent.message}`)
    return alertEvent
  }

  private calculateDegradationPercentage(
    baseline: number, 
    current: number, 
    direction: 'higher_is_worse' | 'lower_is_worse'
  ): number {
    if (baseline === 0) return 0

    if (direction === 'higher_is_worse') {
      // For metrics like latency and cost where higher values are worse
      return Math.max(0, ((current - baseline) / baseline) * 100)
    } else {
      // For metrics like success rate and confidence where lower values are worse
      return Math.max(0, ((baseline - current) / baseline) * 100)
    }
  }

  private createDegradationAlert(
    type: PerformanceDegradationAlert['type'],
    severity: 'warning' | 'critical',
    currentValue: number,
    baselineValue: number,
    degradationPercentage: number,
    method: 'firecrawl' | 'manual'
  ): AlertEvent {
    const alertId = `degradation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    let recommendation = ''
    switch (type) {
      case 'latency_degradation':
        recommendation = 'Check for network issues, optimize extraction logic, or increase timeout values'
        break
      case 'success_rate_degradation':
        recommendation = 'Review recent website changes, update extraction patterns, or increase retry attempts'
        break
      case 'confidence_degradation':
        recommendation = 'Review data quality, update extraction algorithms, or retrain confidence models'
        break
      case 'cost_inefficiency':
        recommendation = 'Optimize API usage, implement better caching, or review pricing models'
        break
    }

    return {
      id: alertId,
      rule_id: `degradation_${type}`,
      severity,
      message: `${method.charAt(0).toUpperCase() + method.slice(1)} ${type.replace('_', ' ')}: ${degradationPercentage.toFixed(1)}% degradation detected (current: ${currentValue.toFixed(3)}, baseline: ${baselineValue.toFixed(3)})`,
      metric_value: currentValue,
      threshold_value: baselineValue,
      method,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
      metadata: {
        type,
        degradation_percentage: degradationPercentage,
        baseline_value: baselineValue,
        recommendation
      }
    }
  }
}

// Export singleton instance
export const performanceAlertingSystem = new PerformanceAlertingSystem()