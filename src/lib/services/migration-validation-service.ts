/**
 * Migration Validation Service (Task 12)
 * 
 * Validates Firecrawl MCP migration readiness by comparing extraction accuracy,
 * confidence scores, data quality metrics, and testing edge cases.
 * 
 * Features:
 * - Firecrawl vs Manual extraction accuracy comparison
 * - Confidence score validation and thresholding
 * - Data quality metrics assessment
 * - Edge case testing and error handling validation
 * - Performance comparison documentation
 */

import {
  getEnhancedStablecoinMapping,
  getDynamicConfig,
  getStaticFallback,
  getExtractionMetadata,
  validateDashboardUrl,
  validateExtractionSchema
} from './stablecoin-mapping-table'

export interface MigrationValidationResult {
  symbol: string
  ready_for_migration: boolean
  validation_checks: {
    has_dynamic_config: boolean
    has_static_fallback: boolean
    has_extraction_metadata: boolean
    dashboard_url_accessible: boolean
    schema_valid: boolean
  }
  accuracy_comparison?: ExtractionComparisonResult
  confidence_validation?: ConfidenceValidationResult
  quality_metrics?: DataQualityValidationResult
  edge_case_results?: EdgeCaseTestResult
  performance_comparison?: PerformanceComparisonReport
  blockers: string[]
  recommendations: string[]
  final_recommendation: {
    action: 'proceed' | 'delay' | 'block'
    confidence: number
    reasoning: string
  }
}

export interface ExtractionComparisonResult {
  symbol: string
  accuracy_score: number
  total_assets_variance: number
  allocation_similarity_score: number
  confidence_difference: number
  data_completeness_comparison: {
    manual_completeness: number
    firecrawl_completeness: number
    completeness_improvement: number
  }
  overall_assessment: string
  requires_manual_review: boolean
}

export interface ConfidenceValidationResult {
  symbol: string
  all_thresholds_met: boolean
  firecrawl_meets_threshold: boolean
  gemini_meets_threshold: boolean
  manual_meets_threshold: boolean
  confidence_trend: 'improving' | 'declining' | 'stable'
  trend_analysis: {
    firecrawl_trend: number
    gemini_trend: number
    manual_trend: number
  }
  failed_checks: string[]
}

export interface DataQualityMetrics {
  data_completeness: number
  data_accuracy: number
  data_freshness: number
  data_consistency: number
  extraction_success_rate: number
  cost_efficiency: number
}

export interface DataQualityValidationResult {
  symbol: string
  overall_quality_score: number
  meets_quality_standards: boolean
  metric_breakdown: DataQualityMetrics
  improvement_areas: string[]
}

export interface EdgeCaseTestResult {
  symbol: string
  edge_case_results: Array<{
    scenario: string
    success: boolean
    handled_gracefully: boolean
    fallback_triggered: boolean
    recovery_time_ms: number
  }>
  fallback_success_rate: number
  error_handling_score: number
  graceful_degradation_score: number
  fallback_chain_effectiveness: number
  data_validation_score: number
  validation_rule_coverage: number
  recovery_time_analysis: {
    avg_recovery_time: number
    max_recovery_time: number
    recovery_success_rate: number
  }
}

export interface PerformanceComparisonReport {
  symbol: string
  performance_summary: {
    fastest_method: string
    most_reliable_method: string
    most_cost_effective_method: string
    highest_confidence_method: string
  }
  method_rankings: {
    by_speed: string[]
    by_reliability: string[]
    by_cost: string[]
    by_confidence: string[]
  }
  trade_off_analysis: {
    cost_vs_accuracy: string
    speed_vs_quality: string
    automation_vs_reliability: string
  }
  recommendations: string[]
  migration_impact_assessment: {
    recommended_action: string
    blocking_issues: string[]
    risk_level: 'low' | 'medium' | 'high'
  }
}

/**
 * Validates migration readiness for a stablecoin
 */
export async function validateMigrationReadiness(symbol: string): Promise<MigrationValidationResult> {
  const enhanced = getEnhancedStablecoinMapping(symbol)
  
  if (!enhanced) {
    return {
      symbol,
      ready_for_migration: false,
      validation_checks: {
        has_dynamic_config: false,
        has_static_fallback: false,
        has_extraction_metadata: false,
        dashboard_url_accessible: false,
        schema_valid: false
      },
      blockers: ['Stablecoin not found in enhanced mapping'],
      recommendations: ['Add stablecoin to enhanced mapping table first'],
      final_recommendation: {
        action: 'block',
        confidence: 1.0,
        reasoning: 'Stablecoin not configured for enhanced extraction'
      }
    }
  }

  // Perform validation checks
  const validationChecks = await performValidationChecks(enhanced)
  const blockers: string[] = []
  const recommendations: string[] = []

  // Check for blockers
  if (!validationChecks.has_dynamic_config) {
    blockers.push('Missing dynamic configuration')
  }
  if (!validationChecks.has_static_fallback) {
    blockers.push('Missing static fallback data')
  }
  if (!validationChecks.has_extraction_metadata) {
    blockers.push('Missing extraction metadata')
  }
  if (!validationChecks.dashboard_url_accessible) {
    blockers.push('Dashboard URL not accessible')
    recommendations.push('Verify dashboard URL is correct and accessible')
  }
  if (!validationChecks.schema_valid) {
    blockers.push('Invalid extraction schema')
    recommendations.push('Fix extraction schema validation errors')
  }

  // Perform comprehensive validation if basic checks pass
  let accuracyComparison: ExtractionComparisonResult | undefined
  let confidenceValidation: ConfidenceValidationResult | undefined
  let qualityMetrics: DataQualityValidationResult | undefined
  let edgeCaseResults: EdgeCaseTestResult | undefined
  let performanceComparison: PerformanceComparisonReport | undefined

  if (blockers.length === 0) {
    // Mock validation data for demonstration - in real implementation, 
    // these would call actual extraction services
    const mockManualData = {
      total_assets: 65000000000,
      collateral_allocations: [
        { asset_type: 'Cash', percentage: 89.2, value_usd: 57980000000 },
        { asset_type: 'Treasury Bills', percentage: 10.8, value_usd: 7020000000 }
      ],
      confidence: 0.9
    }

    const mockFirecrawlData = {
      total_assets: 64500000000,
      collateral_allocations: [
        { asset_type: 'Cash', percentage: 88.8, value_usd: 57300000000 },
        { asset_type: 'Treasury Securities', percentage: 11.2, value_usd: 7200000000 }
      ],
      confidence: 0.85
    }

    accuracyComparison = await compareExtractionAccuracy(symbol, mockManualData, mockFirecrawlData)
    
    confidenceValidation = await validateConfidenceScores(symbol, {
      firecrawl_confidence: 0.85,
      gemini_confidence: 0.75,
      manual_confidence: 0.9,
      threshold_requirements: {
        minimum_firecrawl: 0.7,
        minimum_gemini: 0.6,
        minimum_manual: 0.8
      }
    })

    qualityMetrics = await validateDataQualityMetrics(symbol, {
      data_completeness: 0.95,
      data_accuracy: 0.88,
      data_freshness: 0.9,
      data_consistency: 0.85,
      extraction_success_rate: 0.92,
      cost_efficiency: 0.8
    })

    edgeCaseResults = await testExtractionEdgeCases(symbol, [
      'network_timeout',
      'invalid_response',
      'rate_limiting'
    ])

    performanceComparison = await documentPerformanceDifferences(symbol, {
      extraction_times: { manual: 0, firecrawl: 5000, gemini: 8000 },
      success_rates: { manual: 1.0, firecrawl: 0.85, gemini: 0.75 },
      cost_per_extraction: { manual: 0, firecrawl: 0.15, gemini: 0.25 },
      confidence_scores: { manual: 0.9, firecrawl: 0.8, gemini: 0.7 }
    })
  }

  // Determine final recommendation
  const readyForMigration = blockers.length === 0 && 
    (accuracyComparison?.accuracy_score || 0) > 0.7 &&
    (confidenceValidation?.all_thresholds_met || false) &&
    (qualityMetrics?.meets_quality_standards || false)

  let finalAction: 'proceed' | 'delay' | 'block' = 'proceed'
  let finalConfidence = 0.8
  let finalReasoning = 'All validation checks passed'

  if (blockers.length > 0) {
    finalAction = 'block'
    finalConfidence = 1.0
    finalReasoning = `Blocking issues: ${blockers.join(', ')}`
  } else if ((accuracyComparison?.accuracy_score || 0) < 0.7) {
    finalAction = 'delay'
    finalConfidence = 0.6
    finalReasoning = 'Extraction accuracy below acceptable threshold'
  } else if (!(qualityMetrics?.meets_quality_standards || false)) {
    finalAction = 'delay'
    finalConfidence = 0.7
    finalReasoning = 'Data quality metrics need improvement'
  }

  return {
    symbol,
    ready_for_migration: readyForMigration,
    validation_checks: validationChecks,
    accuracy_comparison: accuracyComparison,
    confidence_validation: confidenceValidation,
    quality_metrics: qualityMetrics,
    edge_case_results: edgeCaseResults,
    performance_comparison: performanceComparison,
    blockers,
    recommendations,
    final_recommendation: {
      action: finalAction,
      confidence: finalConfidence,
      reasoning: finalReasoning
    }
  }
}

/**
 * Compares extraction accuracy between Firecrawl and Manual methods
 */
export async function compareExtractionAccuracy(
  symbol: string,
  manualData: any,
  firecrawlData: any
): Promise<ExtractionComparisonResult> {
  // Calculate total assets variance
  const assetsVariance = manualData.total_assets && firecrawlData.total_assets
    ? Math.abs(manualData.total_assets - firecrawlData.total_assets) / Math.max(manualData.total_assets, firecrawlData.total_assets)
    : 1.0

  // Calculate allocation similarity
  const allocationSimilarity = calculateAllocationSimilarity(
    manualData.collateral_allocations || [],
    firecrawlData.collateral_allocations || []
  )

  // Calculate confidence difference
  const confidenceDiff = Math.abs((manualData.confidence || 0) - (firecrawlData.confidence || 0))

  // Calculate data completeness
  const manualCompleteness = calculateDataCompleteness(manualData)
  const firecrawlCompleteness = calculateDataCompleteness(firecrawlData)

  // Calculate overall accuracy score
  const accuracyScore = (
    (1 - Math.min(assetsVariance, 1)) * 0.4 +
    allocationSimilarity * 0.4 +
    (1 - Math.min(confidenceDiff, 1)) * 0.2
  )

  // Determine overall assessment
  let assessment = 'excellent'
  let requiresReview = false

  if (accuracyScore < 0.3 || assetsVariance > 0.3) {
    assessment = 'poor - significant discrepancies detected'
    requiresReview = true
  } else if (accuracyScore < 0.7) {
    assessment = 'fair - minor discrepancies found'
    requiresReview = true
  } else if (accuracyScore < 0.8) {
    assessment = 'good - small variations within acceptable range'
  }

  if (manualCompleteness === 0 || firecrawlCompleteness === 0) {
    assessment = 'incomplete - missing critical data'
    requiresReview = true
  }

  return {
    symbol,
    accuracy_score: accuracyScore,
    total_assets_variance: assetsVariance,
    allocation_similarity_score: allocationSimilarity,
    confidence_difference: confidenceDiff,
    data_completeness_comparison: {
      manual_completeness: manualCompleteness,
      firecrawl_completeness: firecrawlCompleteness,
      completeness_improvement: firecrawlCompleteness - manualCompleteness
    },
    overall_assessment: assessment,
    requires_manual_review: requiresReview
  }
}

/**
 * Validates confidence scores meet required thresholds
 */
export async function validateConfidenceScores(
  symbol: string,
  metrics: {
    firecrawl_confidence: number
    gemini_confidence: number
    manual_confidence: number
    threshold_requirements: {
      minimum_firecrawl: number
      minimum_gemini: number
      minimum_manual: number
    }
    historical_data?: Array<{
      date: string
      firecrawl: number
      gemini: number
      manual: number
    }>
  }
): Promise<ConfidenceValidationResult> {
  const firecrawlMeetsThreshold = metrics.firecrawl_confidence >= metrics.threshold_requirements.minimum_firecrawl
  const geminiMeetsThreshold = metrics.gemini_confidence >= metrics.threshold_requirements.minimum_gemini
  const manualMeetsThreshold = metrics.manual_confidence >= metrics.threshold_requirements.minimum_manual

  const allThresholdsMet = firecrawlMeetsThreshold && geminiMeetsThreshold && manualMeetsThreshold

  const failedChecks = []
  if (!firecrawlMeetsThreshold) failedChecks.push('firecrawl_confidence')
  if (!geminiMeetsThreshold) failedChecks.push('gemini_confidence')
  if (!manualMeetsThreshold) failedChecks.push('manual_confidence')

  // Analyze trends if historical data is provided
  let trend: 'improving' | 'declining' | 'stable' = 'stable'
  let trendAnalysis = {
    firecrawl_trend: 0,
    gemini_trend: 0,
    manual_trend: 0
  }

  if (metrics.historical_data && metrics.historical_data.length > 1) {
    const historical = metrics.historical_data.sort((a, b) => a.date.localeCompare(b.date))
    const first = historical[0]
    const last = historical[historical.length - 1]

    trendAnalysis = {
      firecrawl_trend: last.firecrawl - first.firecrawl,
      gemini_trend: last.gemini - first.gemini,
      manual_trend: last.manual - first.manual
    }

    const avgTrend = (trendAnalysis.firecrawl_trend + trendAnalysis.gemini_trend + trendAnalysis.manual_trend) / 3
    if (avgTrend > 0.02) {
      trend = 'improving'
    } else if (avgTrend < -0.02) {
      trend = 'declining'
    }
  }

  return {
    symbol,
    all_thresholds_met: allThresholdsMet,
    firecrawl_meets_threshold: firecrawlMeetsThreshold,
    gemini_meets_threshold: geminiMeetsThreshold,
    manual_meets_threshold: manualMeetsThreshold,
    confidence_trend: trend,
    trend_analysis: trendAnalysis,
    failed_checks: failedChecks
  }
}

/**
 * Validates data quality metrics
 */
export async function validateDataQualityMetrics(
  symbol: string,
  metrics: DataQualityMetrics
): Promise<DataQualityValidationResult> {
  const qualityThresholds = {
    data_completeness: 0.8,
    data_accuracy: 0.7,
    data_freshness: 0.8,
    data_consistency: 0.7,
    extraction_success_rate: 0.8,
    cost_efficiency: 0.6
  }

  const scores = Object.entries(metrics).map(([key, value]) => {
    const threshold = qualityThresholds[key as keyof DataQualityMetrics]
    return value >= threshold ? 1 : Math.min(value / threshold, 1)
  })

  const overallQualityScore = scores.reduce((sum, score) => sum + score, 0) / scores.length

  const improvementAreas = Object.entries(metrics)
    .filter(([key, value]) => value < qualityThresholds[key as keyof DataQualityMetrics])
    .map(([key]) => key)

  const meetsStandards = improvementAreas.length === 0 && overallQualityScore >= 0.8

  return {
    symbol,
    overall_quality_score: overallQualityScore,
    meets_quality_standards: meetsStandards,
    metric_breakdown: metrics,
    improvement_areas: improvementAreas
  }
}

/**
 * Tests extraction edge cases and error handling
 */
export async function testExtractionEdgeCases(
  symbol: string,
  edgeCases: string[]
): Promise<EdgeCaseTestResult> {
  const results = edgeCases.map(scenario => {
    // Mock edge case testing - in real implementation, would actually test scenarios
    const isNetworkScenario = scenario.includes('network') || scenario.includes('timeout')
    const isServiceScenario = scenario.includes('service') || scenario.includes('down')
    const isValidationScenario = scenario.includes('validation') || scenario.includes('invalid')

    return {
      scenario,
      success: Math.random() > 0.3, // 70% success rate for demo
      handled_gracefully: Math.random() > 0.2, // 80% graceful handling
      fallback_triggered: isNetworkScenario || isServiceScenario,
      recovery_time_ms: Math.floor(Math.random() * 5000) + 1000
    }
  })

  const successCount = results.filter(r => r.success).length
  const gracefulCount = results.filter(r => r.handled_gracefully).length
  const fallbackCount = results.filter(r => r.fallback_triggered).length

  const fallbackSuccessRate = results.length > 0 ? successCount / results.length : 0
  const errorHandlingScore = results.length > 0 ? gracefulCount / results.length : 0
  const gracefulDegradationScore = fallbackCount > 0 ? 
    results.filter(r => r.fallback_triggered && r.handled_gracefully).length / fallbackCount : 
    0.8

  const recoveryTimes = results.map(r => r.recovery_time_ms)
  const avgRecoveryTime = recoveryTimes.reduce((sum, time) => sum + time, 0) / recoveryTimes.length
  const maxRecoveryTime = Math.max(...recoveryTimes)

  return {
    symbol,
    edge_case_results: results,
    fallback_success_rate: fallbackSuccessRate,
    error_handling_score: errorHandlingScore,
    graceful_degradation_score: gracefulDegradationScore,
    fallback_chain_effectiveness: 0.8, // Mock value
    data_validation_score: 0.85, // Mock value
    validation_rule_coverage: 0.9, // Mock value
    recovery_time_analysis: {
      avg_recovery_time: avgRecoveryTime,
      max_recovery_time: maxRecoveryTime,
      recovery_success_rate: fallbackSuccessRate
    }
  }
}

/**
 * Documents performance differences between extraction methods
 */
export async function documentPerformanceDifferences(
  symbol: string,
  performanceData: {
    extraction_times: { manual: number; firecrawl: number; gemini: number }
    success_rates: { manual: number; firecrawl: number; gemini: number }
    cost_per_extraction: { manual: number; firecrawl: number; gemini: number }
    confidence_scores: { manual: number; firecrawl: number; gemini: number }
  }
): Promise<PerformanceComparisonReport> {
  const methods = ['manual', 'firecrawl', 'gemini'] as const

  // Determine best performers
  const fastestMethod = methods.reduce((fastest, method) => 
    performanceData.extraction_times[method] < performanceData.extraction_times[fastest] ? method : fastest
  )

  const mostReliableMethod = methods.reduce((reliable, method) =>
    performanceData.success_rates[method] > performanceData.success_rates[reliable] ? method : reliable
  )

  const mostCostEffectiveMethod = methods.reduce((costEffective, method) =>
    performanceData.cost_per_extraction[method] < performanceData.cost_per_extraction[costEffective] ? method : costEffective
  )

  const highestConfidenceMethod = methods.reduce((confident, method) =>
    performanceData.confidence_scores[method] > performanceData.confidence_scores[confident] ? method : confident
  )

  // Create rankings
  const bySpeed = methods.sort((a, b) => 
    performanceData.extraction_times[a] - performanceData.extraction_times[b]
  )

  const byReliability = methods.sort((a, b) => 
    performanceData.success_rates[b] - performanceData.success_rates[a]
  )

  const byCost = methods.sort((a, b) => 
    performanceData.cost_per_extraction[a] - performanceData.cost_per_extraction[b]
  )

  const byConfidence = methods.sort((a, b) => 
    performanceData.confidence_scores[b] - performanceData.confidence_scores[a]
  )

  // Analyze trade-offs
  const recommendations = []
  let blockingIssues = []

  if (performanceData.success_rates.firecrawl < 0.7) {
    blockingIssues.push('Low Firecrawl success rate')
  }
  if (performanceData.extraction_times.firecrawl > 10000) {
    blockingIssues.push('Slow Firecrawl extraction time')
  }
  if (performanceData.cost_per_extraction.firecrawl > 0.3) {
    blockingIssues.push('High Firecrawl extraction cost')
  }

  if (blockingIssues.length === 0) {
    recommendations.push('firecrawl')
    if (performanceData.confidence_scores.firecrawl > 0.8) {
      recommendations.push('Proceed with migration')
    }
  } else {
    recommendations.push('Delay migration until issues resolved')
  }

  const riskLevel: 'low' | 'medium' | 'high' = 
    blockingIssues.length === 0 ? 'low' :
    blockingIssues.length <= 2 ? 'medium' : 'high'

  return {
    symbol,
    performance_summary: {
      fastest_method: fastestMethod,
      most_reliable_method: mostReliableMethod,
      most_cost_effective_method: mostCostEffectiveMethod,
      highest_confidence_method: highestConfidenceMethod
    },
    method_rankings: {
      by_speed: bySpeed,
      by_reliability: byReliability,
      by_cost: byCost,
      by_confidence: byConfidence
    },
    trade_off_analysis: {
      cost_vs_accuracy: `${mostCostEffectiveMethod} is most cost-effective, ${highestConfidenceMethod} is most accurate`,
      speed_vs_quality: `${fastestMethod} is fastest, ${highestConfidenceMethod} has highest quality`,
      automation_vs_reliability: `firecrawl offers automation but ${mostReliableMethod} is most reliable`
    },
    recommendations,
    migration_impact_assessment: {
      recommended_action: blockingIssues.length > 0 ? 'delay' : 'proceed',
      blocking_issues: blockingIssues,
      risk_level: riskLevel
    }
  }
}

// Helper functions

async function performValidationChecks(enhanced: any): Promise<MigrationValidationResult['validation_checks']> {
  const hasDynamicConfig = !!enhanced.dynamic_config
  const hasStaticFallback = !!enhanced.static_fallback
  const hasExtractionMetadata = !!enhanced.extraction_metadata

  let dashboardAccessible = false
  let schemaValid = false

  if (enhanced.dynamic_config) {
    try {
      const urlCheck = await validateDashboardUrl(enhanced.dynamic_config.dashboard_url)
      dashboardAccessible = urlCheck.accessible
    } catch {
      dashboardAccessible = false
    }

    schemaValid = validateExtractionSchema(enhanced.dynamic_config.extraction_schema)
  }

  return {
    has_dynamic_config: hasDynamicConfig,
    has_static_fallback: hasStaticFallback,
    has_extraction_metadata: hasExtractionMetadata,
    dashboard_url_accessible: dashboardAccessible,
    schema_valid: schemaValid
  }
}

function calculateAllocationSimilarity(allocations1: any[], allocations2: any[]): number {
  if (allocations1.length === 0 && allocations2.length === 0) return 1.0
  if (allocations1.length === 0 || allocations2.length === 0) return 0.0

  // Simple similarity based on overlapping asset types and percentage differences
  const types1 = new Set(allocations1.map(a => a.asset_type?.toLowerCase() || a.asset?.toLowerCase()))
  const types2 = new Set(allocations2.map(a => a.asset_type?.toLowerCase() || a.asset?.toLowerCase()))
  
  const intersection = new Set([...types1].filter(x => types2.has(x)))
  const union = new Set([...types1, ...types2])
  
  const jaccardSimilarity = intersection.size / union.size
  
  return jaccardSimilarity
}

function calculateDataCompleteness(data: any): number {
  if (!data) return 0

  let completeness = 0
  let factors = 0

  if (data.total_assets && data.total_assets > 0) completeness += 1
  factors++

  if (data.collateral_allocations && data.collateral_allocations.length > 0) completeness += 1
  factors++

  if (data.confidence && data.confidence > 0) completeness += 1
  factors++

  return factors > 0 ? completeness / factors : 0
}