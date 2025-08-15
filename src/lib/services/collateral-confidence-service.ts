import {
  StablecoinInfo,
  CollateralDiscoveryResult,
  UniversalCollateralOrchestrationResult,
  CollateralData,
  CollateralAllocation
} from '@/lib/types'
import { metricsService } from './metrics-service'

/**
 * Collateral Confidence Service
 * 
 * Provides advanced confidence scoring, fallback strategy analysis,
 * and quality assurance for collateral discovery results
 */
export class CollateralConfidenceService {
  
  /**
   * Calculate comprehensive confidence score for collateral discovery result
   */
  calculateComprehensiveConfidence(
    result: CollateralDiscoveryResult,
    info: StablecoinInfo,
    fallbackResults?: CollateralDiscoveryResult[]
  ): number {
    const baseConfidence = result.confidence
    let adjustedConfidence = baseConfidence
    
    console.log(`[ConfidenceService] Calculating comprehensive confidence for ${info.symbol}`)
    console.log(`[ConfidenceService] Base confidence: ${baseConfidence}, Source tier: ${result.source_tier}`)

    // Tier-based confidence adjustments
    adjustedConfidence = this.applyTierAdjustments(adjustedConfidence, result.source_tier, info)

    // Data quality adjustments
    adjustedConfidence = this.applyDataQualityAdjustments(adjustedConfidence, result.data)

    // Cross-validation with fallback results
    if (fallbackResults && fallbackResults.length > 0) {
      adjustedConfidence = this.applyCrossValidationAdjustments(
        adjustedConfidence, 
        result, 
        fallbackResults
      )
    }

    // Market context adjustments
    adjustedConfidence = this.applyMarketContextAdjustments(adjustedConfidence, info)

    // Temporal stability adjustments
    adjustedConfidence = this.applyTemporalAdjustments(adjustedConfidence, result.data)

    const finalConfidence = Math.max(0, Math.min(1, adjustedConfidence))

    console.log(`[ConfidenceService] Final adjusted confidence: ${finalConfidence} (adjustment: ${finalConfidence - baseConfidence >= 0 ? '+' : ''}${((finalConfidence - baseConfidence) * 100).toFixed(1)}%)`)

    return finalConfidence
  }

  /**
   * Apply tier-based confidence adjustments
   */
  private applyTierAdjustments(
    confidence: number, 
    tier: 1 | 2 | 3 | 4, 
    info: StablecoinInfo
  ): number {
    let adjustment = 0

    switch (tier) {
      case 1: // Manual mapping - highest confidence
        adjustment = 0.05 // Small boost for manual curation
        break
      case 2: // AI extraction - depends on data source quality
        if (this.isHighQualitySource(info)) {
          adjustment = 0.02 // Boost for high-quality sources
        } else {
          adjustment = -0.05 // Penalty for unknown sources
        }
        break
      case 3: // On-chain analysis - generally reliable
        if (info.pegging_type === 'crypto-collateralized') {
          adjustment = 0.03 // Boost for crypto-collateralized (readable on-chain)
        } else if (info.pegging_type === 'fiat-backed') {
          adjustment = -0.02 // Slight penalty for fiat-backed (limited on-chain visibility)
        }
        break
      case 4: // Heuristic fallback - lower confidence by nature
        adjustment = -0.10 // Penalty for fallback method
        break
    }

    console.log(`[ConfidenceService] Tier ${tier} adjustment: ${adjustment >= 0 ? '+' : ''}${(adjustment * 100).toFixed(1)}%`)
    return confidence + adjustment
  }

  /**
   * Apply data quality adjustments based on completeness and consistency
   */
  private applyDataQualityAdjustments(confidence: number, data: CollateralData): number {
    let adjustment = 0

    // Check data completeness
    const completeness = this.calculateDataCompleteness(data)
    if (completeness >= 0.9) {
      adjustment += 0.05 // Bonus for very complete data
    } else if (completeness >= 0.7) {
      adjustment += 0.02 // Small bonus for good completeness
    } else if (completeness < 0.3) {
      adjustment -= 0.08 // Penalty for incomplete data
    }

    // Check allocation consistency
    const allocationConsistency = this.checkAllocationConsistency(data)
    if (allocationConsistency < 0.8) {
      adjustment -= 0.05 // Penalty for inconsistent allocations
    }

    // Check for reasonable values
    if (this.hasReasonableValues(data)) {
      adjustment += 0.02 // Bonus for reasonable values
    } else {
      adjustment -= 0.10 // Heavy penalty for unreasonable values
    }

    console.log(`[ConfidenceService] Data quality adjustment: ${adjustment >= 0 ? '+' : ''}${(adjustment * 100).toFixed(1)}%`)
    return confidence + adjustment
  }

  /**
   * Apply cross-validation adjustments using fallback results
   */
  private applyCrossValidationAdjustments(
    confidence: number,
    primaryResult: CollateralDiscoveryResult,
    fallbackResults: CollateralDiscoveryResult[]
  ): number {
    let adjustment = 0

    // Calculate consistency across results
    const consistencyScore = this.calculateCrossValidationConsistency(
      primaryResult.data,
      fallbackResults.map(r => r.data)
    )

    if (consistencyScore >= 0.8) {
      adjustment += 0.08 // Strong boost for high consistency across methods
    } else if (consistencyScore >= 0.6) {
      adjustment += 0.04 // Moderate boost for good consistency
    } else if (consistencyScore < 0.3) {
      adjustment -= 0.06 // Penalty for low consistency
    }

    // Check if multiple high-tier sources agree
    const highTierAgreement = fallbackResults.filter(r => 
      r.source_tier <= 2 && r.confidence >= 0.7
    ).length
    
    if (highTierAgreement >= 2) {
      adjustment += 0.05 // Bonus for multiple high-tier agreement
    }

    console.log(`[ConfidenceService] Cross-validation adjustment: ${adjustment >= 0 ? '+' : ''}${(adjustment * 100).toFixed(1)}%`)
    return confidence + adjustment
  }

  /**
   * Apply market context adjustments
   */
  private applyMarketContextAdjustments(confidence: number, info: StablecoinInfo): number {
    let adjustment = 0

    // Market cap size adjustments
    const marketCap = info.market_cap || 0
    if (marketCap > 10_000_000_000) { // > $10B
      adjustment += 0.03 // Large stablecoins typically have better transparency
    } else if (marketCap < 100_000_000) { // < $100M
      adjustment -= 0.05 // Small stablecoins may have less reliable data
    }

    // Pegging type risk adjustments
    switch (info.pegging_type) {
      case 'fiat-backed':
        adjustment += 0.02 // Generally more straightforward collateral
        break
      case 'algorithmic':
        adjustment -= 0.05 // More complex and potentially less transparent
        break
      case 'crypto-collateralized':
        adjustment += 0.01 // Generally transparent due to on-chain nature
        break
    }

    // Genesis date adjustments (older = more established)
    if (info.genesis_date && info.genesis_date !== 'Unknown') {
      const genesisDate = new Date(info.genesis_date)
      const age = Date.now() - genesisDate.getTime()
      const ageYears = age / (365 * 24 * 60 * 60 * 1000)
      
      if (ageYears > 3) {
        adjustment += 0.02 // Established stablecoins
      } else if (ageYears < 0.5) {
        adjustment -= 0.03 // Very new stablecoins may have less reliable data
      }
    }

    console.log(`[ConfidenceService] Market context adjustment: ${adjustment >= 0 ? '+' : ''}${(adjustment * 100).toFixed(1)}%`)
    return confidence + adjustment
  }

  /**
   * Apply temporal stability adjustments
   */
  private applyTemporalAdjustments(confidence: number, data: CollateralData): number {
    let adjustment = 0

    // Check data freshness
    if (data.last_updated) {
      const lastUpdated = new Date(data.last_updated)
      const hoursSinceUpdate = (Date.now() - lastUpdated.getTime()) / (60 * 60 * 1000)
      
      if (hoursSinceUpdate > 168) { // > 1 week
        adjustment -= 0.08 // Penalty for stale data
      } else if (hoursSinceUpdate > 24) { // > 1 day
        adjustment -= 0.03 // Small penalty for day-old data
      } else if (hoursSinceUpdate < 1) { // < 1 hour
        adjustment += 0.02 // Bonus for very fresh data
      }
    } else {
      adjustment -= 0.05 // Penalty for missing timestamp
    }

    console.log(`[ConfidenceService] Temporal adjustment: ${adjustment >= 0 ? '+' : ''}${(adjustment * 100).toFixed(1)}%`)
    return confidence + adjustment
  }

  /**
   * Calculate data completeness score
   */
  private calculateDataCompleteness(data: CollateralData): number {
    let completeness = 0
    let factors = 0

    if ((data.total_assets || 0) > 0) { completeness += 1; factors++ }
    if (data.total_liabilities !== undefined && data.total_liabilities > 0) { completeness += 1; factors++ }
    if (data.overcollateralization_ratio !== undefined) { completeness += 1; factors++ }
    if (data.collateral_allocations && data.collateral_allocations.length > 0) { completeness += 1; factors++ }
    if (data.report_url) { completeness += 1; factors++ }
    if (data.last_updated) { completeness += 1; factors++ }

    // Detailed allocation check
    const detailedAllocations = data.collateral_allocations?.filter(alloc => 
      alloc.value_usd && alloc.percentage
    ).length || 0
    
    if (detailedAllocations >= 3) { completeness += 1; factors++ }

    return factors > 0 ? completeness / factors : 0
  }

  /**
   * Check allocation consistency
   */
  private checkAllocationConsistency(data: CollateralData): number {
    if (!data.collateral_allocations || data.collateral_allocations.length === 0) {
      return 0
    }

    const allocations = data.collateral_allocations
    let consistencyScore = 1.0

    // Check percentage sum (should be close to 100%)
    const totalPercentage = allocations.reduce((sum, alloc) => sum + (alloc.percentage || 0), 0)
    if (totalPercentage > 0) {
      const percentageDiff = Math.abs(totalPercentage - 100) / 100
      consistencyScore -= Math.min(0.5, percentageDiff) // Max penalty of 0.5
    }

    // Check value consistency with totals
    const totalValue = allocations.reduce((sum, alloc) => sum + (alloc.value_usd || 0), 0)
    if (totalValue > 0 && data.total_assets && data.total_assets > 0) {
      const valueDiff = Math.abs(totalValue - data.total_assets) / data.total_assets
      consistencyScore -= Math.min(0.3, valueDiff) // Max penalty of 0.3
    }

    return Math.max(0, consistencyScore)
  }

  /**
   * Check for reasonable values
   */
  private hasReasonableValues(data: CollateralData): boolean {
    // Check for negative values
    if ((data.total_assets || 0) < 0 || (data.total_liabilities || 0) < 0) {
      return false
    }

    // Check for extremely high values (> $1T)
    if ((data.total_assets || 0) > 1_000_000_000_000) {
      return false
    }

    // Check overcollateralization ratio
    if (data.overcollateralization_ratio !== undefined) {
      if (data.overcollateralization_ratio < 0 || data.overcollateralization_ratio > 10) {
        return false
      }
    }

    // Check individual allocations
    if (data.collateral_allocations) {
      for (const alloc of data.collateral_allocations) {
        if ((alloc.percentage || 0) < 0 || (alloc.percentage || 0) > 100) {
          return false
        }
        if ((alloc.value_usd || 0) < 0) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Calculate cross-validation consistency
   */
  private calculateCrossValidationConsistency(
    primaryData: CollateralData,
    fallbackData: CollateralData[]
  ): number {
    if (fallbackData.length === 0) return 1.0

    let totalConsistency = 0
    let validComparisons = 0

    for (const fallbackItem of fallbackData) {
      const consistency = this.compareCollateralData(primaryData, fallbackItem)
      totalConsistency += consistency
      validComparisons++
    }

    return validComparisons > 0 ? totalConsistency / validComparisons : 0
  }

  /**
   * Compare two collateral data objects
   */
  private compareCollateralData(data1: CollateralData, data2: CollateralData): number {
    let similarity = 0
    let factors = 0

    // Compare total assets (within 30% tolerance)
    if ((data1.total_assets || 0) > 0 && (data2.total_assets || 0) > 0) {
      const diff = Math.abs(data1.total_assets! - data2.total_assets!) / 
                   Math.max(data1.total_assets!, data2.total_assets!)
      similarity += diff < 0.3 ? 1 : (diff < 0.6 ? 0.5 : 0)
      factors++
    }

    // Compare overcollateralization ratios
    if (data1.overcollateralization_ratio !== undefined && 
        data2.overcollateralization_ratio !== undefined) {
      const diff = Math.abs(data1.overcollateralization_ratio - data2.overcollateralization_ratio)
      similarity += diff < 0.2 ? 1 : (diff < 0.5 ? 0.5 : 0)
      factors++
    }

    // Compare allocation structures
    const alloc1Count = data1.collateral_allocations?.length || 0
    const alloc2Count = data2.collateral_allocations?.length || 0
    const allocCountDiff = Math.abs(alloc1Count - alloc2Count)
    similarity += allocCountDiff <= 1 ? 1 : (allocCountDiff <= 3 ? 0.5 : 0)
    factors++

    return factors > 0 ? similarity / factors : 0
  }

  /**
   * Check if stablecoin has high-quality data sources
   */
  private isHighQualitySource(info: StablecoinInfo): boolean {
    // Check for official transparency pages
    if (info.official_links?.homepage) {
      const homepage = Array.isArray(info.official_links.homepage) 
        ? info.official_links.homepage[0] 
        : info.official_links.homepage

      // Known high-quality transparency domains
      const highQualityDomains = [
        'tether.to', 'centre.io', 'paxos.com', 'trueusd.tusd.io',
        'makerdao.com', 'app.frax.finance', 'app.fei.money',
        'liquity.org'
      ]

      return highQualityDomains.some(domain => homepage.includes(domain))
    }

    return false
  }

  /**
   * Recommend fallback strategy based on current results
   */
  recommendFallbackStrategy(
    orchestrationResult: UniversalCollateralOrchestrationResult,
    info: StablecoinInfo
  ): {
    shouldUseFallback: boolean
    recommendedTier: 1 | 2 | 3 | 4 | null
    reasoning: string[]
  } {
    const reasoning: string[] = []
    let shouldUseFallback = false
    let recommendedTier: 1 | 2 | 3 | 4 | null = null

    const primaryConfidence = orchestrationResult.final_confidence
    const primaryTier = orchestrationResult.primary_result.source_tier

    // Low confidence trigger
    if (primaryConfidence < 0.6) {
      shouldUseFallback = true
      reasoning.push(`Primary confidence ${primaryConfidence.toFixed(2)} is below 0.6 threshold`)
    }

    // High-tier failure fallback
    if (primaryTier >= 3 && primaryConfidence < 0.8) {
      shouldUseFallback = true
      reasoning.push(`High-tier method (Tier ${primaryTier}) produced low confidence result`)
      
      // Recommend trying lower-tier methods
      if (primaryTier === 4) {
        recommendedTier = 3
      } else if (primaryTier === 3) {
        recommendedTier = 2
      }
    }

    // Market cap importance
    const marketCap = info.market_cap || 0
    if (marketCap > 1_000_000_000 && primaryConfidence < 0.7) {
      shouldUseFallback = true
      reasoning.push('Large market cap stablecoin requires higher confidence threshold')
    }

    // Quality assurance failure
    if (orchestrationResult.quality_assurance.cross_validation_performed &&
        orchestrationResult.quality_assurance.consistency_score < 0.5) {
      shouldUseFallback = true
      reasoning.push('Cross-validation showed low consistency between methods')
    }

    // Data completeness issues
    if (orchestrationResult.quality_assurance.data_completeness < 0.4) {
      shouldUseFallback = true
      reasoning.push('Data completeness is below acceptable threshold')
      recommendedTier = 2 // Try AI extraction for more complete data
    }

    return {
      shouldUseFallback,
      recommendedTier,
      reasoning
    }
  }

  /**
   * Generate confidence report for debugging and monitoring
   */
  generateConfidenceReport(
    orchestrationResult: UniversalCollateralOrchestrationResult,
    info: StablecoinInfo
  ): {
    overall_confidence: number
    confidence_breakdown: Record<string, number>
    quality_metrics: Record<string, number>
    recommendations: string[]
  } {
    const primaryResult = orchestrationResult.primary_result
    const data = primaryResult.data

    const confidenceBreakdown = {
      base_confidence: primaryResult.confidence,
      tier_adjustment: 0, // Would need to recalculate
      data_quality: this.calculateDataCompleteness(data),
      cross_validation: orchestrationResult.quality_assurance.consistency_score,
      final_confidence: orchestrationResult.final_confidence
    }

    const qualityMetrics = {
      data_completeness: orchestrationResult.quality_assurance.data_completeness,
      consistency_score: orchestrationResult.quality_assurance.consistency_score,
      cost_efficiency: orchestrationResult.total_cost_usd > 0 ? 
        orchestrationResult.final_confidence / orchestrationResult.total_cost_usd : 
        orchestrationResult.final_confidence,
      extraction_speed: 1000 / Math.max(orchestrationResult.total_extraction_time_ms, 100), // ops per second
    }

    const recommendations: string[] = []

    if (orchestrationResult.final_confidence < 0.7) {
      recommendations.push('Consider manual verification of collateral data')
    }

    if (orchestrationResult.quality_assurance.data_completeness < 0.6) {
      recommendations.push('Investigate additional data sources for completeness')
    }

    if (orchestrationResult.total_cost_usd > 0.25) {
      recommendations.push('High extraction cost - consider caching or manual mapping')
    }

    return {
      overall_confidence: orchestrationResult.final_confidence,
      confidence_breakdown: confidenceBreakdown,
      quality_metrics: qualityMetrics,
      recommendations
    }
  }
}

// Export singleton instance
export const collateralConfidenceService = new CollateralConfidenceService()