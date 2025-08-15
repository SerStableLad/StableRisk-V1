import { 
  StablecoinInfo, 
  CollateralDiscoveryConfig,
  CollateralDiscoveryResult,
  UniversalCollateralOrchestrationResult,
  CollateralData,
  CollateralAllocation
} from '@/lib/types'
import { enhancedCacheService } from './enhanced-cache-service'
import { metricsService } from './metrics-service'
import { onChainCollateralService } from './on-chain-collateral-service'
import { protocolHandlerFactory } from './protocol-specific-handlers'
import { EnhancedCollateralExtractionService, enhancedCollateralExtractionService } from './enhanced-collateral-extraction-service'
import { AICollateralExtractionService } from './ai-collateral-extraction-service'
import { 
  isKnownStablecoin, 
  getKnownTransparencyData 
} from './stablecoin-mapping-utils'
import { collateralConfidenceService } from './collateral-confidence-service'
import { costControlService } from './cost-control-service'
import { rolloutManagementService } from './rollout-management-service'
import { config } from '@/lib/config'

/**
 * Universal Collateral Orchestrator
 * 
 * Coordinates all collateral discovery methods with intelligent fallback strategies:
 * - Tier 1: Manual mapping (0.9-1.0 confidence)
 * - Tier 2: Enhanced AI-powered extraction with A/B testing (0.6-0.9 confidence) 
 *   - Primary: Firecrawl MCP with dynamic scraping
 *   - Enhancement: Gemini AI validation for confidence boosting
 *   - Fallback: Legacy AI extraction for backward compatibility
 * - Tier 3: On-chain analysis (0.7-0.95 confidence)
 * - Tier 4: Heuristic fallbacks (0.3-0.6 confidence)
 * 
 * Features:
 * - Multi-source data aggregation with A/B testing framework
 * - Dynamic discovery pipeline with confidence scoring
 * - Fallback strategies when primary methods fail
 * - Cost control with daily budget limits and circuit breaker
 * - Quality assurance with cross-validation
 * - Real-time triggers for new stablecoin detection
 */
export class UniversalCollateralOrchestrator {
  private config: CollateralDiscoveryConfig
  private enhancedExtractionService: EnhancedCollateralExtractionService
  private legacyAiExtractionService: AICollateralExtractionService // Backward compatibility fallback
  private readonly rolloutPercentage: number

  constructor(config?: Partial<CollateralDiscoveryConfig>) {
    this.config = {
      enableTier1ManualMapping: true,
      enableTier2AIExtraction: true,
      enableTier3OnChain: true,
      enableTier4Heuristics: true,
      confidenceThresholds: {
        tier1: 0.90,
        tier2: 0.60,
        tier3: 0.70,
        tier4: 0.30
      },
      fallbackStrategy: 'best_effort',
      maxCostPerDiscovery: 0.50, // $0.50 max per discovery
      ...config
    }

    // Initialize A/B testing rollout percentage
    this.rolloutPercentage = config?.firecrawlMcp?.rolloutPercentage ?? 10

    // Initialize Enhanced extraction service (primary)
    this.enhancedExtractionService = enhancedCollateralExtractionService

    // Initialize legacy AI extraction service for backward compatibility
    this.legacyAiExtractionService = new AICollateralExtractionService({
      maxCostPerExtraction: this.config.maxCostPerDiscovery * 0.8,
      confidenceThreshold: this.config.confidenceThresholds.tier2,
      fallbackToAI: true,
      cacheBasedOnConfidence: true
    })

    console.log(`[UniversalOrchestrator] Initialized with config:`, {
      enabledTiers: {
        tier1: this.config.enableTier1ManualMapping,
        tier2: this.config.enableTier2AIExtraction,
        tier3: this.config.enableTier3OnChain,
        tier4: this.config.enableTier4Heuristics
      },
      confidenceThresholds: this.config.confidenceThresholds,
      maxCost: this.config.maxCostPerDiscovery,
      firecrawlRollout: `${this.rolloutPercentage}%`,
      costControls: costControlService.getDailyBudgetStatus()
    })
  }

  /**
   * Main orchestration method - discovers collateral data using all available methods
   */
  async discoverCollateralData(info: StablecoinInfo): Promise<UniversalCollateralOrchestrationResult> {
    const startTime = Date.now()
    console.log(`[UniversalOrchestrator] Starting comprehensive collateral discovery for ${info.symbol}`)

    try {
      // Check cache first (covers all tiers)
      const cacheKey = `universal_collateral:${info.symbol}`
      const cachedResult = await enhancedCacheService.get<UniversalCollateralOrchestrationResult>(
        'universal_collateral',
        info.symbol
      )

      if (cachedResult) {
        console.log(`[UniversalOrchestrator] Using cached collateral data for ${info.symbol}`)
        metricsService.recordCacheHit('universal_collateral_discovery')
        return cachedResult
      }

      // Execute discovery pipeline in order of preference
      const discoveryResults: CollateralDiscoveryResult[] = []
      let totalCost = 0
      let bestResult: CollateralDiscoveryResult | null = null

      // TIER 1: Manual Mapping (Highest confidence, no cost)
      if (this.config.enableTier1ManualMapping) {
        const tier1Result = await this.executeTier1Discovery(info)
        if (tier1Result) {
          discoveryResults.push(tier1Result)
          if (tier1Result.confidence >= this.config.confidenceThresholds.tier1) {
            bestResult = tier1Result
            console.log(`[UniversalOrchestrator] Tier 1 success for ${info.symbol} - confidence: ${tier1Result.confidence}`)
          }
        }
      }

      // TIER 3: On-Chain Analysis (High confidence, low cost)
      // Execute Tier 3 before Tier 2 as it's cheaper and often more reliable
      if (!bestResult && this.config.enableTier3OnChain && totalCost < this.config.maxCostPerDiscovery) {
        const tier3Result = await this.executeTier3Discovery(info)
        if (tier3Result) {
          discoveryResults.push(tier3Result)
          totalCost += tier3Result.cost_usd
          if (tier3Result.confidence >= this.config.confidenceThresholds.tier3) {
            bestResult = tier3Result
            console.log(`[UniversalOrchestrator] Tier 3 success for ${info.symbol} - confidence: ${tier3Result.confidence}`)
          }
        }
      }

      // TIER 2: AI-Powered Extraction (Good confidence, higher cost)
      if (!bestResult && this.config.enableTier2AIExtraction && totalCost < this.config.maxCostPerDiscovery) {
        const tier2Result = await this.executeTier2Discovery(info)
        if (tier2Result) {
          discoveryResults.push(tier2Result)
          totalCost += tier2Result.cost_usd
          if (tier2Result.confidence >= this.config.confidenceThresholds.tier2) {
            bestResult = tier2Result
            console.log(`[UniversalOrchestrator] Tier 2 success for ${info.symbol} - confidence: ${tier2Result.confidence}`)
          }
        }
      }

      // TIER 4: Heuristic Fallbacks (Lower confidence, no cost)
      if (!bestResult && this.config.enableTier4Heuristics) {
        const tier4Result = await this.executeTier4Discovery(info)
        if (tier4Result) {
          discoveryResults.push(tier4Result)
          if (tier4Result.confidence >= this.config.confidenceThresholds.tier4) {
            bestResult = tier4Result
            console.log(`[UniversalOrchestrator] Tier 4 fallback used for ${info.symbol} - confidence: ${tier4Result.confidence}`)
          }
        }
      }

      // If no successful result found, create a minimal fallback
      if (!bestResult) {
        bestResult = this.createMinimalFallback(info)
        discoveryResults.push(bestResult)
        console.warn(`[UniversalOrchestrator] All discovery methods failed for ${info.symbol}, using minimal fallback`)
      }

      // ENHANCEMENT: Re-evaluate best result considering data completeness
      // Sometimes a lower-confidence result with complete data is better than 
      // a higher-confidence result with incomplete data
      if (discoveryResults.length > 1) {
        const reevaluatedBest = this.selectBestResultWithCompleteness(discoveryResults, info.symbol)
        if (reevaluatedBest && reevaluatedBest !== bestResult) {
          console.log(`[UniversalOrchestrator] Re-selected best result for ${info.symbol}: ${bestResult.discovery_method} (${bestResult.confidence.toFixed(3)}) → ${reevaluatedBest.discovery_method} (${reevaluatedBest.confidence.toFixed(3)}) based on data completeness`)
          bestResult = reevaluatedBest
        }
      }

      // Perform quality assurance if we have multiple results
      const qualityAssurance = await this.performQualityAssurance(discoveryResults)

      // Calculate enhanced confidence score using the confidence service
      const fallbackResults = discoveryResults.filter(r => r !== bestResult)
      const enhancedConfidence = collateralConfidenceService.calculateComprehensiveConfidence(
        bestResult,
        info,
        fallbackResults
      )

      console.log(`[UniversalOrchestrator] Enhanced confidence for ${info.symbol}: ${bestResult.confidence.toFixed(3)} → ${enhancedConfidence.toFixed(3)}`)

      // Check if we should use fallback strategy
      const preliminaryResult: UniversalCollateralOrchestrationResult = {
        primary_result: bestResult,
        fallback_results: fallbackResults,
        final_confidence: enhancedConfidence,
        total_cost_usd: totalCost,
        total_extraction_time_ms: Date.now() - startTime,
        quality_assurance: qualityAssurance
      }

      const fallbackRecommendation = collateralConfidenceService.recommendFallbackStrategy(
        preliminaryResult,
        info
      )

      if (fallbackRecommendation.shouldUseFallback && this.config.fallbackStrategy === 'best_effort') {
        console.log(`[UniversalOrchestrator] Fallback recommended for ${info.symbol}:`, fallbackRecommendation.reasoning)
        
        // Try recommended fallback tier if suggested
        if (fallbackRecommendation.recommendedTier && totalCost < this.config.maxCostPerDiscovery * 0.8) {
          const fallbackResult = await this.executeFallbackTier(info, fallbackRecommendation.recommendedTier)
          if (fallbackResult && fallbackResult.confidence > enhancedConfidence) {
            console.log(`[UniversalOrchestrator] Fallback successful - using Tier ${fallbackRecommendation.recommendedTier} result`)
            bestResult = fallbackResult
            totalCost += fallbackResult.cost_usd
            discoveryResults.push(fallbackResult)
          }
        }
      }

      // Create final orchestration result with final confidence
      const finalEnhancedConfidence = bestResult === preliminaryResult.primary_result ? 
        enhancedConfidence : 
        collateralConfidenceService.calculateComprehensiveConfidence(bestResult, info, fallbackResults)

      const orchestrationResult: UniversalCollateralOrchestrationResult = {
        primary_result: bestResult,
        fallback_results: discoveryResults.filter(r => r !== bestResult),
        final_confidence: finalEnhancedConfidence,
        total_cost_usd: totalCost,
        total_extraction_time_ms: Date.now() - startTime,
        quality_assurance: qualityAssurance
      }

      // Cache the result with confidence-based TTL
      const cacheTTL = this.calculateCacheTTL(bestResult.confidence)
      await enhancedCacheService.set(
        'universal_collateral',
        info.symbol,
        orchestrationResult,
        cacheTTL
      )

      // Record metrics
      metricsService.recordCostMetric('universal_collateral_discovery', totalCost)
      metricsService.recordApiDuration('universal_collateral_discovery', Date.now() - startTime)

      console.log(`[UniversalOrchestrator] Discovery completed for ${info.symbol} - final confidence: ${bestResult.confidence}, cost: $${totalCost.toFixed(4)}`)

      return orchestrationResult

    } catch (error) {
      console.error(`[UniversalOrchestrator] Error in collateral discovery for ${info.symbol}:`, error)
      metricsService.recordApiError(`universal_collateral_discovery:${info.symbol}`, error)

      // Return error result
      const errorResult = this.createMinimalFallback(info, error instanceof Error ? error.message : 'Unknown error')
      return {
        primary_result: errorResult,
        fallback_results: [],
        final_confidence: 0,
        total_cost_usd: 0,
        total_extraction_time_ms: Date.now() - startTime,
        quality_assurance: {
          cross_validation_performed: false,
          consistency_score: 0,
          data_completeness: 0
        }
      }
    }
  }

  /**
   * Tier 1: Manual mapping discovery (highest confidence)
   */
  private async executeTier1Discovery(info: StablecoinInfo): Promise<CollateralDiscoveryResult | null> {
    const startTime = Date.now()
    console.log(`[UniversalOrchestrator] Executing Tier 1 (manual mapping) for ${info.symbol}`)

    try {
      // Check if stablecoin is in manual mapping table
      if (!isKnownStablecoin(info.symbol)) {
        return null // Not in manual mapping
      }

      // Try protocol-specific handler first
      const protocolHandler = protocolHandlerFactory.getHandlerForStablecoin(info)
      if (protocolHandler) {
        const handlerResult = await protocolHandler.extractCollateralData(info)
        if (handlerResult.confidence >= this.config.confidenceThresholds.tier1) {
          return {
            ...handlerResult,
            source_tier: 1,
            discovery_method: 'manual_mapping',
            extraction_time_ms: Date.now() - startTime
          }
        }
      }

      // Fallback to known transparency data
      const knownTransparency = getKnownTransparencyData(info.symbol)
      if (knownTransparency) {
        return this.createTransparencyBasedResult(info, knownTransparency, startTime)
      }

      return null

    } catch (error) {
      console.error(`[UniversalOrchestrator] Tier 1 error for ${info.symbol}:`, error)
      return null
    }
  }

  /**
   * Tier 2: Enhanced AI-powered extraction discovery with A/B testing
   * Uses EnhancedCollateralExtractionService with Firecrawl MCP, Gemini AI, and manual fallback
   * Implements A/B testing framework for gradual rollout
   * Falls back to legacy AICollateralExtractionService for backward compatibility
   */
  private async executeTier2Discovery(info: StablecoinInfo): Promise<CollateralDiscoveryResult | null> {
    const startTime = Date.now()
    const estimatedCost = config.firecrawlMcp.costPerExtraction

    console.log(`[UniversalOrchestrator] Executing Tier 2 (Enhanced AI extraction) for ${info.symbol}`)

    // A/B Testing Decision: Determine if this symbol should use Enhanced service
    const shouldUseEnhancedService = this.shouldUseEnhancedService(info.symbol)
    console.log(`[UniversalOrchestrator] A/B Test for ${info.symbol}: ${shouldUseEnhancedService ? 'Enhanced' : 'Legacy'} service (${this.rolloutPercentage}% rollout)`)

    // Cost control check before proceeding
    const costCheck = costControlService.canProceedWithCost(
      estimatedCost, 
      'enhanced_collateral_extraction', 
      'tier2_discovery'
    )

    if (!costCheck.allowed) {
      console.warn(`[UniversalOrchestrator] Cost control blocked Tier 2 for ${info.symbol}: ${costCheck.reason}`)
      
      // Record the blocked operation
      costControlService.recordCost({
        service: 'other',
        operation_type: 'tier2_blocked',
        symbol: info.symbol,
        cost_usd: 0,
        success: false,
        metadata: { reason: costCheck.reason }
      })
      
      return null
    }

    try {
      let extractionResult = null
      let actualCost = 0
      let extractionMethod = 'unknown'

      // Enhanced Service Path (A/B Test Group)
      if (shouldUseEnhancedService && config.firecrawlMcp.enabled) {
        console.log(`[UniversalOrchestrator] Attempting Enhanced Collateral Extraction for ${info.symbol}`)
        
        try {
          extractionResult = await this.enhancedExtractionService.extractCollateralData(info.symbol)
          actualCost = extractionResult.cost_usd
          extractionMethod = extractionResult.extraction_method

          // Record cost for enhanced service
          costControlService.recordCost({
            service: extractionResult.extraction_method === 'firecrawl_mcp' ? 'firecrawl_mcp' : 'gemini_ai',
            operation_type: 'tier2_enhanced_extraction',
            symbol: info.symbol,
            cost_usd: actualCost,
            success: extractionResult.confidence_score >= this.config.confidenceThresholds.tier2 * 100,
            confidence_score: extractionResult.confidence_score,
            metadata: { 
              extraction_method: extractionResult.extraction_method,
              processing_time_ms: extractionResult.processing_time_ms
            }
          })

          if (extractionResult.data && extractionResult.confidence_score >= this.config.confidenceThresholds.tier2 * 100) {
            // Convert enhanced service result to orchestrator format
            const collateralData = this.convertEnhancedResultToCollateralData(
              extractionResult, 
              info
            )

            // Track migration status for rollout management
            rolloutManagementService.trackMigrationStatus(
              info.symbol,
              rolloutManagementService.getCurrentRollout().percentage,
              [{ 
                method: extractionResult.extraction_method, 
                success: true, 
                timestamp: new Date().toISOString() 
              }]
            )

            console.log(`[UniversalOrchestrator] Enhanced service success for ${info.symbol} - method: ${extractionResult.extraction_method}, confidence: ${extractionResult.confidence_score}%`)

            return {
              source_tier: 2,
              discovery_method: 'ai_extraction',
              data: collateralData,
              confidence: extractionResult.confidence_score / 100, // Convert percentage to decimal
              cost_usd: actualCost,
              extraction_time_ms: extractionResult.processing_time_ms || (Date.now() - startTime),
              fallback_reason: extractionResult.fallback_reason
            }
          } else {
            console.log(`[UniversalOrchestrator] Enhanced service returned low confidence for ${info.symbol}: ${extractionResult?.confidence_score || 0}%, falling back to legacy`)
          }
        } catch (enhancedError) {
          console.warn(`[UniversalOrchestrator] Enhanced service failed for ${info.symbol}:`, enhancedError)
          
          // Record failed enhanced extraction
          costControlService.recordCost({
            service: 'other',
            operation_type: 'tier2_enhanced_failed',
            symbol: info.symbol,
            cost_usd: actualCost,
            success: false,
            metadata: { error: String(enhancedError) }
          })
        }
      }

      // Legacy Service Path (fallback and control group)
      if (!extractionResult || extractionResult.confidence_score < this.config.confidenceThresholds.tier2 * 100) {
        console.log(`[UniversalOrchestrator] Attempting legacy AI extraction ${shouldUseEnhancedService ? 'fallback' : 'control group'} for ${info.symbol}`)
        
        const transparencyUrl = this.getTransparencyUrl(info)
        if (!transparencyUrl) {
          console.log(`[UniversalOrchestrator] No transparency URL found for ${info.symbol}, skipping legacy extraction`)
          return null
        }
        
        const legacyResult = await this.legacyAiExtractionService.extractCollateralData(
          transparencyUrl,
          info.symbol
        )

        // Record legacy extraction cost
        const legacyCost = legacyResult.cost_usd || 0
        costControlService.recordCost({
          service: 'other',
          operation_type: shouldUseEnhancedService ? 'tier2_legacy_fallback' : 'tier2_legacy_control',
          symbol: info.symbol,
          cost_usd: legacyCost,
          success: legacyResult.success,
          confidence_score: legacyResult.data?.confidence ? legacyResult.data.confidence * 100 : undefined,
          metadata: { 
            method_used: legacyResult.method_used,
            ab_test_group: shouldUseEnhancedService ? 'enhanced_fallback' : 'legacy_control'
          }
        })

        if (legacyResult.success && legacyResult.data) {
          console.log(`[UniversalOrchestrator] Legacy AI extraction success for ${info.symbol}`)
          
          return {
            source_tier: 2,
            discovery_method: 'ai_extraction',
            data: legacyResult.data,
            confidence: legacyResult.data.confidence || 0,
            cost_usd: actualCost + legacyCost, // Include both enhanced attempt cost and legacy cost
            extraction_time_ms: Date.now() - startTime,
            fallback_reason: shouldUseEnhancedService ? 
              'Enhanced service failed or low confidence - used legacy AI extraction' :
              'Legacy control group - used legacy AI extraction'
          }
        }
      }

    } catch (error) {
      console.error(`[UniversalOrchestrator] All Tier 2 extraction methods failed for ${info.symbol}:`, error)
      
      // Record complete failure
      costControlService.recordCost({
        service: 'other',
        operation_type: 'tier2_complete_failure',
        symbol: info.symbol,
        cost_usd: 0,
        success: false,
        metadata: { error: String(error) }
      })
    }

    return null
  }

  /**
   * Tier 3: On-chain analysis discovery
   */
  private async executeTier3Discovery(info: StablecoinInfo): Promise<CollateralDiscoveryResult | null> {
    console.log(`[UniversalOrchestrator] Executing Tier 3 (on-chain analysis) for ${info.symbol}`)

    try {
      if (!onChainCollateralService.isSupported(info)) {
        console.log(`[UniversalOrchestrator] On-chain analysis not supported for ${info.symbol}`)
        return null
      }

      const onChainResult = await onChainCollateralService.extractCollateralData(info)
      
      if (onChainResult.confidence >= this.config.confidenceThresholds.tier3) {
        return onChainResult
      }

      return null

    } catch (error) {
      console.error(`[UniversalOrchestrator] Tier 3 error for ${info.symbol}:`, error)
      return null
    }
  }

  /**
   * Tier 4: Heuristic fallback discovery
   */
  private async executeTier4Discovery(info: StablecoinInfo): Promise<CollateralDiscoveryResult | null> {
    const startTime = Date.now()
    console.log(`[UniversalOrchestrator] Executing Tier 4 (heuristic fallback) for ${info.symbol}`)

    try {
      // Get protocol handler for heuristic analysis
      const protocolHandler = protocolHandlerFactory.getHandlerForStablecoin(info)
      if (protocolHandler) {
        const handlerResult = await protocolHandler.extractCollateralData(info)
        return {
          ...handlerResult,
          source_tier: 4,
          discovery_method: 'heuristic_fallback',
          extraction_time_ms: Date.now() - startTime
        }
      }

      // Generic heuristic fallback
      return this.createGenericHeuristicResult(info, startTime)

    } catch (error) {
      console.error(`[UniversalOrchestrator] Tier 4 error for ${info.symbol}:`, error)
      return this.createGenericHeuristicResult(info, startTime)
    }
  }

  /**
   * Execute fallback tier based on recommendation
   */
  private async executeFallbackTier(
    info: StablecoinInfo, 
    recommendedTier: 1 | 2 | 3 | 4
  ): Promise<CollateralDiscoveryResult | null> {
    console.log(`[UniversalOrchestrator] Executing fallback Tier ${recommendedTier} for ${info.symbol}`)
    
    try {
      switch (recommendedTier) {
        case 1:
          return await this.executeTier1Discovery(info)
        case 2:
          return await this.executeTier2Discovery(info)
        case 3:
          return await this.executeTier3Discovery(info)
        case 4:
          return await this.executeTier4Discovery(info)
        default:
          console.warn(`[UniversalOrchestrator] Invalid fallback tier: ${recommendedTier}`)
          return null
      }
    } catch (error) {
      console.error(`[UniversalOrchestrator] Fallback Tier ${recommendedTier} failed for ${info.symbol}:`, error)
      return null
    }
  }

  /**
   * Create transparency-based result from known data
   */
  private createTransparencyBasedResult(
    info: StablecoinInfo,
    transparencyData: any,
    startTime: number
  ): CollateralDiscoveryResult {
    const allocations: CollateralAllocation[] = [
      {
        asset_type: 'Reserves',
        percentage: 100,
        value_usd: info.market_cap || 0,
        description: `Reserves data from ${transparencyData.dashboard_url || 'transparency provider'}`
      }
    ]

    const collateralData: CollateralData = {
      total_assets: info.market_cap || 0,
      total_liabilities: info.market_cap || 0,
      overcollateralization_ratio: 1.0,
      collateral_allocations: allocations,
      last_updated: new Date().toISOString(),
      report_url: transparencyData.dashboard_url,
      confidence: 0.85,
      extraction_method: 'manual_mapping'
    }

    return {
      source_tier: 1,
      discovery_method: 'manual_mapping',
      data: collateralData,
      confidence: 0.85,
      cost_usd: 0,
      extraction_time_ms: Date.now() - startTime
    }
  }

  /**
   * Create generic heuristic result based on market cap and stablecoin type
   */
  private createGenericHeuristicResult(info: StablecoinInfo, startTime: number): CollateralDiscoveryResult {
    const allocations: CollateralAllocation[] = []
    let confidence = 0.40

    // Basic heuristics based on pegging type
    switch (info.pegging_type) {
      case 'fiat-backed':
        allocations.push({
          asset_type: 'Fiat Reserves (Estimated)',
          percentage: 95,
          value_usd: (info.market_cap || 0) * 0.95,
          description: 'Estimated fiat backing based on market cap'
        })
        allocations.push({
          asset_type: 'Working Capital',
          percentage: 5,
          value_usd: (info.market_cap || 0) * 0.05,
          description: 'Estimated operational reserves'
        })
        confidence = 0.50
        break

      case 'crypto-collateralized':
        allocations.push({
          asset_type: 'Crypto Collateral (Estimated)',
          percentage: 100,
          value_usd: (info.market_cap || 0) * 1.5, // Assume 150% over-collateralization
          description: 'Estimated crypto collateral with over-collateralization'
        })
        confidence = 0.45
        break

      case 'algorithmic':
        allocations.push({
          asset_type: 'Algorithmic Backing (Estimated)',
          percentage: 60,
          value_usd: (info.market_cap || 0) * 0.6,
          description: 'Estimated algorithmic stability mechanism'
        })
        allocations.push({
          asset_type: 'Protocol Treasury (Estimated)',
          percentage: 40,
          value_usd: (info.market_cap || 0) * 0.4,
          description: 'Estimated protocol-controlled value'
        })
        confidence = 0.35
        break

      default:
        allocations.push({
          asset_type: 'Unknown Backing',
          percentage: 100,
          value_usd: info.market_cap || 0,
          description: 'Unknown backing mechanism - market cap estimate'
        })
        confidence = 0.30
    }

    const collateralData: CollateralData = {
      total_assets: allocations.reduce((sum, alloc) => sum + (alloc.value_usd || 0), 0),
      total_liabilities: info.market_cap || 0,
      overcollateralization_ratio: info.pegging_type === 'crypto-collateralized' ? 1.5 : 1.0,
      collateral_allocations: allocations,
      last_updated: new Date().toISOString(),
      confidence: confidence,
      extraction_method: 'heuristic_fallback'
    }

    return {
      source_tier: 4,
      discovery_method: 'heuristic_fallback',
      data: collateralData,
      confidence: confidence,
      cost_usd: 0,
      extraction_time_ms: Date.now() - startTime
    }
  }

  /**
   * Create minimal fallback result
   */
  private createMinimalFallback(info: StablecoinInfo, error?: string): CollateralDiscoveryResult {
    const collateralData: CollateralData = {
      total_assets: 0,
      total_liabilities: info.market_cap || 0,
      overcollateralization_ratio: 0,
      collateral_allocations: [],
      last_updated: new Date().toISOString(),
      confidence: 0,
      extraction_method: 'heuristic_fallback'
    }

    return {
      source_tier: 4,
      discovery_method: 'heuristic_fallback',
      data: collateralData,
      confidence: 0,
      cost_usd: 0,
      extraction_time_ms: 0,
      fallback_reason: error || 'All discovery methods failed'
    }
  }

  /**
   * Get transparency URL from stablecoin info
   */
  private getTransparencyUrl(info: StablecoinInfo): string | null {
    // Check known transparency data first
    const knownTransparency = getKnownTransparencyData(info.symbol)
    if (knownTransparency?.dashboard_url) {
      return knownTransparency.dashboard_url
    }

    // Try official homepage
    if (info.official_links?.homepage) {
      const homepage = Array.isArray(info.official_links.homepage) 
        ? info.official_links.homepage[0]
        : info.official_links.homepage
      return homepage
    }

    return null
  }

  /**
   * Perform quality assurance on discovery results
   */
  private async performQualityAssurance(results: CollateralDiscoveryResult[]): Promise<{
    cross_validation_performed: boolean
    consistency_score: number
    data_completeness: number
  }> {
    if (results.length < 2) {
      return {
        cross_validation_performed: false,
        consistency_score: 1.0, // Single result is consistent with itself
        data_completeness: this.calculateDataCompleteness(results[0]?.data)
      }
    }

    // Cross-validate results
    let consistencyScore = 0
    let validComparisons = 0

    for (let i = 0; i < results.length - 1; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const consistency = this.compareCollateralData(results[i].data, results[j].data)
        consistencyScore += consistency
        validComparisons++
      }
    }

    const avgConsistency = validComparisons > 0 ? consistencyScore / validComparisons : 0
    const bestResult = results.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    )

    return {
      cross_validation_performed: true,
      consistency_score: avgConsistency,
      data_completeness: this.calculateDataCompleteness(bestResult.data)
    }
  }

  /**
   * Compare two collateral data objects for consistency
   */
  private compareCollateralData(data1: CollateralData, data2: CollateralData): number {
    let score = 0
    let factors = 0

    // Compare total assets (within 20% tolerance)
    if (data1.total_assets && data2.total_assets) {
      const diff = Math.abs(data1.total_assets - data2.total_assets) / Math.max(data1.total_assets, data2.total_assets)
      score += diff < 0.2 ? 1 : (diff < 0.5 ? 0.5 : 0)
      factors++
    }

    // Compare over-collateralization ratio
    if (data1.overcollateralization_ratio && data2.overcollateralization_ratio) {
      const diff = Math.abs(data1.overcollateralization_ratio - data2.overcollateralization_ratio)
      score += diff < 0.1 ? 1 : (diff < 0.3 ? 0.5 : 0)
      factors++
    }

    // Compare allocation count
    const allocDiff = Math.abs(data1.collateral_allocations.length - data2.collateral_allocations.length)
    score += allocDiff <= 1 ? 1 : (allocDiff <= 3 ? 0.5 : 0)
    factors++

    return factors > 0 ? score / factors : 0
  }

  /**
   * Calculate data completeness score
   */
  private calculateDataCompleteness(data: CollateralData): number {
    let completeness = 0
    let factors = 0

    // Check for total assets
    if (data.total_assets && data.total_assets > 0) completeness += 1
    factors++

    // Check for over-collateralization ratio
    if (data.overcollateralization_ratio !== undefined) completeness += 1
    factors++

    // Check for allocations
    if (data.collateral_allocations.length > 0) completeness += 1
    factors++

    // Check for detailed allocations
    if (data.collateral_allocations.some(alloc => alloc.value_usd && alloc.percentage)) completeness += 1
    factors++

    // Check for report URL
    if (data.report_url) completeness += 1
    factors++

    return factors > 0 ? completeness / factors : 0
  }

  /**
   * Calculate cache TTL based on confidence
   */
  private calculateCacheTTL(confidence: number): number {
    // Higher confidence = longer cache
    if (confidence >= 0.9) return 24 * 60 * 60 * 1000 // 24 hours
    if (confidence >= 0.7) return 12 * 60 * 60 * 1000 // 12 hours
    if (confidence >= 0.5) return 6 * 60 * 60 * 1000  // 6 hours
    return 2 * 60 * 60 * 1000 // 2 hours
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CollateralDiscoveryConfig>): void {
    this.config = { ...this.config, ...newConfig }
    console.log(`[UniversalOrchestrator] Configuration updated:`, this.config)
  }

  /**
   * Get current configuration
   */
  getConfig(): CollateralDiscoveryConfig {
    return { ...this.config }
  }

  /**
   * A/B Testing: Determine if symbol should use enhanced service
   * Uses consistent hash-based distribution for reliable testing
   * Now integrated with rollout management service for coordinated deployment
   */
  private shouldUseEnhancedService(symbol: string): boolean {
    const currentRollout = rolloutManagementService.getCurrentRollout()
    
    // Use rollout management service to determine extraction method
    const extractionMethod = rolloutManagementService.getExtractionMethod(
      symbol,
      currentRollout.percentage,
      {
        firecrawl_enabled: config.firecrawlMcp.enabled
      }
    )
    
    // Enhanced service uses firecrawl_mcp method
    return extractionMethod === 'firecrawl_mcp'
  }

  /**
   * Convert Enhanced Collateral Extraction result to CollateralData format
   */
  private convertEnhancedResultToCollateralData(
    extractionResult: any,
    info: StablecoinInfo
  ): CollateralData {
    const collateralData = {
      total_assets: extractionResult.data.total_supply || 0,
      total_liabilities: info.market_cap || 0,
      overcollateralization_ratio: 1.0,
      collateral_allocations: extractionResult.data.collateral_allocations || [],
      last_updated: extractionResult.data.timestamp || new Date().toISOString(),
      report_url: extractionResult.data.proof_of_reserves_url,
      confidence: extractionResult.confidence_score / 100, // Convert percentage to decimal
      extraction_method: extractionResult.extraction_method
    }

    // Calculate overcollateralization ratio if we have both assets and liabilities
    if (collateralData.total_assets > 0 && collateralData.total_liabilities > 0) {
      collateralData.overcollateralization_ratio = collateralData.total_assets / collateralData.total_liabilities
    }

    // Enhance collateral allocations with proper formatting
    if (extractionResult.data.collateral_allocations) {
      collateralData.collateral_allocations = extractionResult.data.collateral_allocations.map((allocation: any) => ({
        asset_type: allocation.asset || allocation.asset_type,
        percentage: allocation.percentage || 0,
        value_usd: allocation.value_usd || 0,
        description: allocation.description || `${allocation.asset || allocation.asset_type} holdings`
      }))
    }

    return collateralData
  }

  /**
   * Simple string hashing for consistent A/B testing
   * Same implementation as Enhanced Collateral Extraction Service
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Get discovery statistics
   */
  async getDiscoveryStatistics(): Promise<{
    cache_hit_rate: number
    avg_confidence: number
    avg_cost: number
    tier_usage: Record<number, number>
  }> {
    // This would typically pull from metrics service
    return {
      cache_hit_rate: 0.75,
      avg_confidence: 0.78,
      avg_cost: 0.15,
      tier_usage: {
        1: 0.45, // 45% Tier 1 usage
        2: 0.25, // 25% Tier 2 usage  
        3: 0.20, // 20% Tier 3 usage
        4: 0.10  // 10% Tier 4 usage
      }
    }
  }

  /**
   * Select best result considering both confidence and data completeness
   * This helps choose results with complete data over those with empty arrays
   */
  private selectBestResultWithCompleteness(
    results: CollateralDiscoveryResult[], 
    symbol: string
  ): CollateralDiscoveryResult {
    if (results.length === 0) {
      throw new Error('No results to evaluate')
    }
    
    if (results.length === 1) {
      return results[0]
    }

    console.log(`[UniversalOrchestrator] Evaluating ${results.length} results for ${symbol} with completeness scoring`)

    // Score each result based on confidence + data completeness
    const scoredResults = results.map(result => {
      const completeness = this.calculateDataCompleteness(result.data)
      
      // Combined score: 70% confidence + 30% completeness
      // This ensures complete data is valued but confidence still matters most
      const combinedScore = (result.confidence * 0.7) + (completeness * 0.3)
      
      console.log(`[UniversalOrchestrator] ${symbol} - ${result.discovery_method}: confidence=${result.confidence.toFixed(3)}, completeness=${completeness.toFixed(3)}, combined=${combinedScore.toFixed(3)}`)
      
      return {
        result,
        completeness,
        combinedScore
      }
    })

    // Sort by combined score (descending)
    scoredResults.sort((a, b) => b.combinedScore - a.combinedScore)
    
    const bestScored = scoredResults[0]
    console.log(`[UniversalOrchestrator] Best scored result for ${symbol}: ${bestScored.result.discovery_method} (combined score: ${bestScored.combinedScore.toFixed(3)})`)
    
    return bestScored.result
  }
}

// Export singleton instance with default configuration
export const universalCollateralOrchestrator = new UniversalCollateralOrchestrator()