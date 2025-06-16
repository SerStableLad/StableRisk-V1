import { coinGeckoService } from './coingecko'
import { coinMarketCapService } from './coinmarketcap'
import { auditDiscoveryService } from './audit-discovery'
import { transparencyService } from './transparency'
import { geckoTerminalService } from './geckoterminal'
// import { oracleAnalysisService } from './oracle-analysis' // Disabled oracle functionality
import { StablecoinAssessment, StablecoinInfo, PricePoint, RiskFactors, StablecoinTier1Data, StablecoinTier2Data, StablecoinTier3Data, TieredStablecoinAssessment, AuditInfo } from '@/lib/types'
import { cacheService } from './cache-service'
import { metricsService } from './metrics-service'
import { 
  isKnownStablecoin, 
  addNewStablecoinToMapping, 
  updateMappingWithDiscoveredData,
  generateMappingEntryString,
  getKnownTransparencyData,
  getKnownAuditFolderUrl
} from './stablecoin-mapping-table'
import { ApiClient } from './api-client'
import { config } from '@/lib/config'
import { AuditDiscoveryService } from './audit-discovery'

export class StablecoinDataService {
  private auditDiscoveryService = new AuditDiscoveryService()

  /**
   * Main method to get comprehensive stablecoin assessment
   */
  async getStablecoinAssessment(ticker: string): Promise<StablecoinAssessment | null> {
    const startTime = Date.now()
    try {
      // Check cache first (temporarily disabled)
      // const cacheKey = `assessment:${ticker.toLowerCase()}`
      // const cachedData = cacheService.get<StablecoinAssessment>(cacheKey)
      // if (cachedData) {
      //   metricsService.recordApiCall(`getStablecoinAssessment:${ticker}:cached`)
      //   return cachedData
      // }
      
      // No cache, record API call (temporarily disabled)
      // metricsService.recordApiCall(`getStablecoinAssessment:${ticker}`)
      
      // Step 1: Search for stablecoin
      const coinId = await this.searchStablecoin(ticker)
      if (!coinId) {
        return null
      }

      // Step 2: Get basic info
      const info = await this.getStablecoinInfo(coinId)
      if (!info) {
        return null
      }

      // Step 2.5: Auto-add to mapping table if not known
      if (!isKnownStablecoin(ticker)) {
        console.log(`🆕 Auto-discovering new stablecoin: ${ticker} (${info.name})`)
        
        // Add to mapping table with basic info
        const newEntry = addNewStablecoinToMapping(
          ticker,
          info.name,
          coinId,
          undefined, // marketCapRank will be determined later
          {
            homepage: Array.isArray(info.official_links?.homepage) 
              ? info.official_links.homepage[0] 
              : info.official_links?.homepage,
            market_cap: info.market_cap,
            genesis_date: info.genesis_date
          }
        )

        // Log the mapping entry for manual review
        console.log(`📋 Generated mapping entry for manual review:`)
        console.log(generateMappingEntryString(newEntry))
      }

      // Step 3: Get price history for stability analysis
      const priceHistory = await this.getPriceHistory(coinId)

      // Step 4: Get transparency data and update mapping if new data is discovered
      console.log('Getting transparency data...')
      
      let transparency: any = {
        dashboard_url: null,
        attestation_provider: null,
        update_frequency: null,
        has_proof_of_reserves: false,
        verification_status: 'unknown'
      }

      try {
        // For known stablecoins, use mapping table data directly to avoid expensive API calls
        if (isKnownStablecoin(ticker)) {
          const knownTransparency = getKnownTransparencyData(ticker)
          if (knownTransparency) {
            transparency = knownTransparency
            console.log(`✅ Using mapping table transparency data for ${ticker}`)
          } else {
            console.log(`📋 ${ticker} is known but has no transparency data in mapping table`)
          }
        } else {
          // For unknown stablecoins, try discovery (but with timeout to avoid hanging)
          console.log(`🔍 ${ticker} not in mapping table, attempting discovery...`)
          try {
            const transparencyData = await Promise.race([
              transparencyService.getTransparencyData(ticker, info.name, 
                Array.isArray(info.official_links?.homepage) 
                  ? info.official_links.homepage 
                  : info.official_links?.homepage ? [info.official_links.homepage] : undefined
              ),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Transparency discovery timeout')), 5000))
            ]) as any
            
            if (transparencyData) {
              transparency = transparencyData
              console.log('✅ Transparency data discovered successfully')
              
              // Update mapping table with discovered data
              if (transparencyData.dashboard_url && transparencyData.dashboard_url !== '') {
                console.log(`🔄 Updating mapping with discovered transparency data for ${ticker}`)
                updateMappingWithDiscoveredData(ticker, transparencyData)
              }
            }
          } catch (discoveryError) {
            console.warn(`⚠️ Transparency discovery failed for ${ticker}:`, discoveryError)
          }
        }
      } catch (error) {
        console.warn(`Failed to get transparency data for ${ticker}:`, error)
      }

      // Step 5: Get audit data
      console.log('Getting audit data...')
      let audits: any[] = []
      
      // Use audit discovery service for all stablecoins
      const auditFolderUrl = getKnownAuditFolderUrl(ticker)
      if (auditFolderUrl) {
        console.log(`🔍 Discovering audits for ${ticker} from: ${auditFolderUrl}`)
        const discoveredAudits = await this.auditDiscoveryService.discoverAudits(ticker, info?.name, [], [auditFolderUrl])
        audits = discoveredAudits || [] // Ensure we always have an array
        console.log(`📋 Found ${audits.length} audits for ${ticker}`)
      } else {
        console.log(`📋 No audit folder URL found for ${ticker}`)
      }
      
      // Calculate basic risk factors based on available data
      const basicPegAnalysis = this.analyzePegStability(priceHistory)
      const auditScore = await this.calculateAuditStatusWithData(info, audits)
      
      // Calculate actual transparency score using the transparency service
      let transparencyScore = 0
      try {
        transparencyScore = transparencyService.calculateTransparencyScore(transparency)
        console.log(`✅ Calculated transparency score for ${ticker}: ${transparencyScore}`)
      } catch (error) {
        console.warn(`⚠️ Failed to calculate transparency score for ${ticker}:`, error)
        transparencyScore = 50 // Fallback to default middle score
      }
      
      const riskFactors: any = {
        peg_stability: { 
          score: basicPegAnalysis.isCurrentlyDepegged ? 20 : 80, 
          details: { avgDeviation: basicPegAnalysis.avgDeviation } 
        },
        transparency: { score: transparencyScore, details: {} },
        liquidity: { 
          score: info.market_cap > 1_000_000_000 ? 80 : 60, 
          details: { market_cap: info.market_cap } 
        },
        oracle_setup: { score: 70, details: {} }, // Default score
        audit_status: auditScore
      }

      // Step 6: Calculate weighted risk score (1-100)
      const riskScore = this.calculateOverallRiskScore(riskFactors)

      // Step 7: Build comprehensive assessment
      const pegAnalysis = this.analyzePegStability(priceHistory)
      const dataSources = ['CoinGecko']
      
      // Add data source tracking
      if (audits.length > 0) dataSources.push('GitHub')
      if (transparency.dashboard_url) dataSources.push('Transparency APIs')

      const assessment = {
        info,
        risk_scores: {
          overall: riskScore,
          peg_stability: riskFactors.peg_stability.score,
          transparency: riskFactors.transparency.score,
          liquidity: riskFactors.liquidity.score,
          oracle: riskFactors.oracle_setup.score,
          audit: riskFactors.audit_status.score,
        },
        peg_stability: {
          price_history: priceHistory,
          average_deviation: pegAnalysis.avgDeviation,
          depeg_incidents: pegAnalysis.depegIncidents,
          depeg_recovery_speed: pegAnalysis.avgRecoveryTime,
          is_depegged: pegAnalysis.isCurrentlyDepegged,
          last_depeg_date: pegAnalysis.lastDepegDate,
        },
        audits,
        transparency,
        oracle: await this.getEnhancedOracleData(info),
        liquidity: await this.getEnhancedLiquidityData(info, ticker),
        last_updated: new Date().toISOString(),
        data_sources: dataSources,
      }
      
      // Cache for 6 hours (equivalent to Tier 3)
      // cacheService.set(cacheKey, assessment, 6 * 60 * 60 * 1000)
      
      // metricsService.recordApiDuration(`getStablecoinAssessment:${ticker}`, Date.now() - startTime)
      return assessment
    } catch (error) {
      console.error('Error getting stablecoin assessment:', error)
      // metricsService.recordApiError(`getStablecoinAssessment:${ticker}`, error)
      return null
    }
  }

  /**
   * Tiered implementation for progressive data delivery
   * Returns a generator that yields data in tiers
   */
  async *getStablecoinAssessmentTiered(ticker: string): AsyncGenerator<TieredStablecoinAssessment, TieredStablecoinAssessment, void> {
    const startTime = Date.now()
    const assessment: TieredStablecoinAssessment = {
      complete: false
    }

    try {
      // TIER 1: Fast metadata and basic status (<500ms)
      const tier1Data = await this.getTier1Data(ticker)
      
      if (!tier1Data) {
        assessment.complete = true
        return assessment // Early return if stablecoin not found
      }
      
      assessment.tier1 = tier1Data
      yield { ...assessment }

      // TIER 2: Core analysis (<2s)
      const tier2Data = await this.getTier2Data(ticker, tier1Data)
      
      assessment.tier2 = tier2Data
      yield { ...assessment }

      // TIER 3: Comprehensive analysis (<5s)
      const tier3Data = await this.getTier3Data(ticker, tier1Data, tier2Data)
      
      assessment.tier3 = tier3Data
      assessment.complete = true
      
      return assessment
    } catch (error) {
      console.error('Error in tiered stablecoin assessment:', error)
      assessment.complete = true
      return assessment
    }
  }

  /**
   * Tier 1: Fast metadata and basic status (<500ms)
   * Provides basic info, current peg status, and preliminary score
   */
  async getTier1Data(ticker: string): Promise<StablecoinTier1Data | null> {
    console.time('Tier1-Performance')

    try {
      // Step 1: Quickly search for the stablecoin
      const coinId = await this.searchStablecoin(ticker)
      if (!coinId) {
        console.timeEnd('Tier1-Performance')
        return null
      }

      // Step 2: Get basic info (names, market cap)
      const info = await this.getStablecoinInfo(coinId)
      if (!info) {
        console.timeEnd('Tier1-Performance')
        return null
      }

      // Step 2.5: Auto-add to mapping table if not known (Tier 1 discovery)
      if (!isKnownStablecoin(ticker)) {
        console.log(`🆕 [Tier 1] Auto-discovering new stablecoin: ${ticker} (${info.name})`)
        
        // Add to mapping table with basic info
        const newEntry = addNewStablecoinToMapping(
          ticker,
          info.name,
          coinId,
          undefined, // marketCapRank will be determined later
          {
            homepage: Array.isArray(info.official_links?.homepage) 
              ? info.official_links.homepage[0] 
              : info.official_links?.homepage,
            market_cap: info.market_cap,
            genesis_date: info.genesis_date
          }
        )

        // Log the mapping entry for manual review
        console.log(`📋 [Tier 1] Generated mapping entry for manual review:`)
        console.log(generateMappingEntryString(newEntry))
      }

      // Step 3: Create basic peg status
      // We default to pegged=true for Tier 1 until we get real data in Tier 2
      const isPegged = info.current_price >= 0.99 && info.current_price <= 1.01
      
      // Step 4: Calculate preliminary score based on limited data
      // Using market cap and stablecoin type as heuristics
      let preliminaryScore = 70 // Default middle score

      // Adjust by market cap - larger coins tend to be safer
      if (info.market_cap > 1_000_000_000) { // > $1B
        preliminaryScore += 10
      } else if (info.market_cap < 100_000_000) { // < $100M
        preliminaryScore -= 10
      }

      // Adjust by pegging type - fiat-backed tends to be safest
      if (info.pegging_type === 'fiat-backed') {
        preliminaryScore += 5
      } else if (info.pegging_type === 'algorithmic') {
        preliminaryScore -= 10
      }

      // Adjust by peg status
      if (!isPegged) {
        preliminaryScore -= 20
      }

      // Basic info for tier 1
      const tier1Data: StablecoinTier1Data = {
        tier: 1,
        info: {
          id: info.id,
          symbol: info.symbol,
          name: info.name,
          image: info.image,
          current_price: info.current_price,
          market_cap: info.market_cap
        },
        peg_status: {
          is_currently_pegged: isPegged
        },
        preliminary_score: Math.min(100, Math.max(0, Math.round(preliminaryScore))),
        last_updated: new Date().toISOString()
      }

      console.timeEnd('Tier1-Performance')
      return tier1Data
    } catch (error) {
      console.error('Error getting Tier 1 data:', error)
      console.timeEnd('Tier1-Performance')
      return null
    }
  }

  /**
   * Tier 2: Core analysis with peg stability and oracle data (<2s)
   */
  async getTier2Data(ticker: string, tier1Data: StablecoinTier1Data): Promise<StablecoinTier2Data> {
    const fullInfo = await this.getStablecoinInfo(tier1Data.info.id);
    if (!fullInfo) {
      const pegAnalysis = this.analyzePegStability([]);
      return {
        tier: 2,
        peg_stability: {
          average_deviation: pegAnalysis.avgDeviation,
          is_depegged: pegAnalysis.isCurrentlyDepegged,
          depeg_incidents: pegAnalysis.depegIncidents
        },
        basic_transparency: { has_dashboard: false, has_proof_of_reserves: false },
        risk_scores: {
          peg_stability: 0,
          transparency: 0,
          preliminary_overall: tier1Data.preliminary_score
        }
      };
    }
    
    const [priceHistory, basicTransparency] = await Promise.all([
      this.getPriceHistory(fullInfo.id),
      // @ts-ignore
      transparencyService.getBasicTransparencyData(ticker, fullInfo.name, fullInfo.official_links?.homepage[0])
    ]);
    
    const pegAnalysis = this.analyzePegStability(priceHistory);
    const pegStabilityScore = await this.calculateSimplePegScore(priceHistory);
    
    const tier2Data: StablecoinTier2Data = {
      tier: 2,
      peg_stability: {
        average_deviation: pegAnalysis.avgDeviation,
        is_depegged: pegAnalysis.isCurrentlyDepegged,
        depeg_incidents: pegAnalysis.depegIncidents
      },
      basic_transparency: {
        // @ts-ignore
        has_dashboard: basicTransparency.has_dashboard,
        // @ts-ignore
        has_proof_of_reserves: basicTransparency.has_proof_of_reserves,
      },
      risk_scores: {
        peg_stability: pegStabilityScore,
        // @ts-ignore
        transparency: (basicTransparency.has_dashboard ? 20 : 0) + (basicTransparency.has_proof_of_reserves ? 20 : 0),
        // @ts-ignore
        preliminary_overall: Math.round((pegStabilityScore * 0.6) + (((basicTransparency.has_dashboard ? 20 : 0) + (basicTransparency.has_proof_of_reserves ? 20 : 0)) * 0.4))
      }
    };
    
    return tier2Data;
  }

  /**
   * Tier 3: Comprehensive analysis and full risk scoring (<5s)
   */
  async getTier3Data(
    ticker: string, 
    tier1Data: StablecoinTier1Data, 
    tier2Data: StablecoinTier2Data
  ): Promise<StablecoinTier3Data> {
    console.time('Tier3-Performance');

    // Fetch full info to satisfy type requirements for other services
    const fullInfo = await this.getStablecoinInfo(tier1Data.info.id);
    if (!fullInfo) {
      // This case should be handled gracefully. 
      // Returning a default structure for now.
      return {
        tier: 3,
        full_peg_stability: { price_history: [], average_deviation: 0, depeg_incidents: 0, depeg_recovery_speed: 0, is_depegged: true },
        full_transparency: { has_proof_of_reserves: false, update_frequency: 'unknown', verification_status: 'unverified' },
        liquidity: { total_liquidity: 0, dex_distribution: [], concentration_risk: 'high', chain_distribution: [] },
        audits: [],
        complete_risk_scores: { overall: 0, peg_stability: 0, transparency: 0, liquidity: 0, audit: 0 },
        data_sources: []
      };
    }
    
    const [
      priceHistory, 
      audits, 
      transparency,
      liquidity
    ] = await Promise.all([
      this.getPriceHistory(fullInfo.id),
      auditDiscoveryService.discoverAudits(ticker, fullInfo.name, fullInfo.official_links?.github_repos, fullInfo.official_links?.homepage),
      transparencyService.getTransparencyData(ticker, fullInfo.name, fullInfo.official_links?.homepage),
      this.getEnhancedLiquidityData(fullInfo, ticker)
    ]);
    
    const fullPegAnalysis = this.analyzePegStability(priceHistory);
    const riskFactors = await this.calculateRiskFactors(fullInfo, priceHistory, fullInfo.id, ticker);
    
    const tier3Data: StablecoinTier3Data = {
      tier: 3,
      full_peg_stability: {
        price_history: priceHistory,
        average_deviation: fullPegAnalysis.avgDeviation,
        depeg_incidents: fullPegAnalysis.depegIncidents,
        depeg_recovery_speed: fullPegAnalysis.avgRecoveryTime,
        is_depegged: fullPegAnalysis.isCurrentlyDepegged,
        last_depeg_date: fullPegAnalysis.lastDepegDate,
      },
      full_transparency: transparency,
      liquidity,
      audits,
      complete_risk_scores: {
        overall: this.calculateOverallRiskScore(riskFactors),
        peg_stability: riskFactors.peg_stability.score,
        transparency: riskFactors.transparency.score,
        liquidity: riskFactors.liquidity.score,
        audit: riskFactors.audit_status.score,
      },
      data_sources: ['CoinGecko', 'GitHub', 'Transparency APIs']
    };
    
    console.timeEnd('Tier3-Performance');
    return tier3Data;
  }

  /**
   * Simplified peg score calculation for tier 2
   */
  private async calculateSimplePegScore(priceHistory: PricePoint[]): Promise<number> {
    if (priceHistory.length === 0) {
      return 50 // Default middle score
    }

    // Calculate deviations from $1
    const deviations = priceHistory.map(point => Math.abs(point.deviation_percent))
    const maxDeviation = Math.max(...deviations)
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length

    // Quick score based on max deviation
    if (maxDeviation > 10) return 20
    if (maxDeviation > 5) return 40
    if (maxDeviation > 2) return 60
    if (maxDeviation > 0.5) return 80
    return 95
  }

  /**
   * Simplified oracle score calculation for tier 2
   */
  private calculateSimpleOracleScore(peggingType?: string): number {
    switch(peggingType) {
      case 'fiat-backed':
        return 80
      case 'crypto-collateralized':
        return 70
      case 'algorithmic':
        return 50
      case 'commodity-backed':
        return 60
      default:
        return 50
    }
  }

  /**
   * Get basic oracle data for tier 2
   */
  private async getBasicOracleData(info: StablecoinInfo): Promise<{
    is_multi_oracle: boolean
    decentralization_score: number
  }> {
    try {
      // const oracleAnalysis = await oracleAnalysisService.getBasicOracleAnalysis(info)
      return {
        is_multi_oracle: false,
        decentralization_score: 0
      }
    } catch (error) {
      console.warn(`Failed to get basic oracle analysis for ${info.symbol}:`, error)
      return {
        is_multi_oracle: false,
        decentralization_score: 0
      }
    }
  }

  /**
   * Search for stablecoin across data sources with fallback
   */
  private async searchStablecoin(ticker: string): Promise<string | null> {
    // Primary: CoinGecko
    console.log(`Searching for stablecoin with ticker: ${ticker}`)
    const coinGeckoId = await coinGeckoService.searchStablecoin(ticker)
    console.log(`CoinGecko ID for ${ticker}: ${coinGeckoId}`)

    if (coinGeckoId) {
      return coinGeckoId
    }

    // TODO: Add fallback to CoinMarketCap
    console.warn(`No stablecoin found for ticker: ${ticker}`)
    return null
  }

  /**
   * Get stablecoin info with fallback
   */
  private async getStablecoinInfo(coinId: string): Promise<StablecoinInfo | null> {
    // Primary: CoinGecko
    console.log(`Getting stablecoin info for coin ID: ${coinId}`)
    const info = await coinGeckoService.getStablecoinInfo(coinId)
    console.log('Stablecoin info:', info)

    if (info) {
      return info
    }

    // TODO: Add fallback to CoinMarketCap
    console.warn(`No info found for coin ID: ${coinId}`)
    return null
  }

  /**
   * Get price history with fallback
   */
  private async getPriceHistory(coinId: string): Promise<PricePoint[]> {
    // Primary: CoinGecko
    const history = await coinGeckoService.getPriceHistory(coinId, 365)
    if (history.length > 0) {
      return history
    }

    // TODO: Add fallback to CoinMarketCap
    console.warn(`No price history found for coin ID: ${coinId}`)
    return []
  }

  /**
   * Calculate all risk factors for the stablecoin
   */
  private async calculateRiskFactors(
    info: StablecoinInfo,
    priceHistory: PricePoint[],
    coinId: string,
    ticker?: string
  ): Promise<RiskFactors> {
    const [
      pegStability,
      transparency,
      liquidity,
      auditStatus
    ] = await Promise.all([
      this.calculatePegStability(priceHistory),
      this.calculateTransparencyScore(ticker || info.symbol, info),
      this.calculateLiquidity(info, coinId),
      this.calculateAuditStatus(info)
    ])

    return {
      peg_stability: pegStability,
      transparency: transparency,
      liquidity: liquidity,
      audit_status: auditStatus,
    }
  }

  /**
   * Peg Stability Analysis (40% weight)
   * Analyzes historical price deviation from $1 peg
   */
  private async calculatePegStability(priceHistory: PricePoint[]): Promise<{
    score: number
    details: Record<string, any>
  }> {
    if (priceHistory.length === 0) {
      return {
        score: 0,
        details: {
          error: 'No price history available',
          max_deviation: null,
          avg_deviation: null,
          stability_periods: []
        }
      }
    }

    // Calculate deviations
    const deviations = priceHistory.map(point => Math.abs(point.deviation_percent))
    const maxDeviation = Math.max(...deviations)
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length

    // Calculate score based on deviations
    // Perfect score (100): max deviation < 0.5%, avg < 0.1%
    // Good score (80-99): max deviation < 2%, avg < 0.5%
    // Fair score (60-79): max deviation < 5%, avg < 1%
    // Poor score (40-59): max deviation < 10%, avg < 2%
    // Very poor score (0-39): max deviation >= 10%

    let score = 100

    if (maxDeviation >= 10) {
      score = Math.max(0, 40 - (maxDeviation - 10) * 2)
    } else if (maxDeviation >= 5) {
      score = 40 + (10 - maxDeviation) * 4
    } else if (maxDeviation >= 2) {
      score = 60 + (5 - maxDeviation) * 6.67
    } else if (maxDeviation >= 0.5) {
      score = 80 + (2 - maxDeviation) * 12.67
    } else {
      score = 100
    }

    // Adjust for average deviation
    if (avgDeviation > 1) {
      score *= 0.7
    } else if (avgDeviation > 0.5) {
      score *= 0.85
    } else if (avgDeviation > 0.1) {
      score *= 0.95
    }

    return {
      score: Math.round(Math.max(0, Math.min(100, score))),
      details: {
        max_deviation_percent: maxDeviation.toFixed(4),
        avg_deviation_percent: avgDeviation.toFixed(4),
        data_points: priceHistory.length,
        analysis_period_days: 365,
      }
    }
  }

  /**
   * Transparency Analysis (20% weight) - Using Real Transparency Service
   */
  private async calculateTransparencyScore(ticker: string, info: StablecoinInfo): Promise<{
    score: number
    details: Record<string, any>
  }> {
    // Get real transparency data
    const transparencyData = await transparencyService.getTransparencyData(ticker, info.name, info.official_links?.homepage)
    
    // Use the transparency service's scoring method
    const score = transparencyService.calculateTransparencyScore(transparencyData)
    
    // Return score with transparency data as details
    return {
      score,
      details: {
        dashboard_url: transparencyData.dashboard_url,
        attestation_provider: transparencyData.attestation_provider,
        update_frequency: transparencyData.update_frequency,
        has_proof_of_reserves: transparencyData.has_proof_of_reserves,
        verification_status: transparencyData.verification_status,
        transparency_score_breakdown: transparencyService.getTransparencyAnalysis(transparencyData)
      }
    }
  }

  /**
   * Legacy Transparency Analysis (kept for backward compatibility)
   */
  private async calculateTransparency(info: StablecoinInfo): Promise<{
    score: number
    details: Record<string, any>
  }> {
    let score = 0
    const factors: Record<string, boolean> = {}

    // Basic info available (20 points)
    if (info.genesis_date && info.genesis_date !== 'Unknown') {
      score += 20
      factors.has_genesis_date = true
    }

    // Market cap available (20 points)
    if (info.market_cap && info.market_cap > 0) {
      score += 20
      factors.has_market_cap = true
    }

    // Pegging type identified (20 points)
    if (info.pegging_type) {
      score += 20
      factors.has_pegging_type = true
    }

    // Well-known stablecoins get higher transparency scores
    const knownTransparentCoins = ['usdt', 'usdc', 'busd', 'dai', 'frax', 'lusd']
    if (knownTransparentCoins.includes(info.symbol.toLowerCase())) {
      score += 40
      factors.is_well_known = true
    } else {
      // Unknown coins get lower base transparency
      score = Math.min(score, 60)
      factors.is_well_known = false
    }

    return {
      score: Math.min(100, score),
      details: factors
    }
  }

  /**
   * Enhanced Oracle Analysis with detailed provider information
   */
  private async getEnhancedOracleData(info: StablecoinInfo): Promise<{
    providers: string[]
    is_multi_oracle: boolean
    decentralization_score: number
  }> {
    try {
      // const oracleAnalysis = await oracleAnalysisService.getOracleAnalysis(info)
      
      // Convert to expected format (just provider names)
      const providers: string[] = []

      console.log(`✅ Oracle analysis complete for ${info.symbol}: ${providers.length} providers`)

      return {
        providers,
        is_multi_oracle: false,
        decentralization_score: 0,
      }
    } catch (error) {
      console.warn(`Failed to get oracle analysis for ${info.symbol}:`, error)
      
      // Fallback to basic analysis
      return {
        providers: [],
        is_multi_oracle: false,
        decentralization_score: 0,
      }
    }
  }

  /**
   * Enhanced Liquidity Analysis with real DEX data
   */
  private async getEnhancedLiquidityData(info: StablecoinInfo, ticker: string): Promise<{
    total_liquidity: number
    dex_distribution: Array<{
      dex: string
      liquidity: number
      percentage: number
      chain: string
    }>
    concentration_risk: 'low' | 'medium' | 'high'
    chain_distribution: Array<{
      chain: string
      liquidity: number
      percentage: number
    }>
  }> {
    try {
      // Get token address from CoinGecko
      console.log(`Getting token data for ${ticker} (${info.id})`)
      const tokenData = await coinGeckoService.getTokenData(info.id)
      console.log('Token data:', tokenData)

      if (!tokenData?.contract_address) {
        console.warn(`No token address found for ${ticker}`)
        return {
          total_liquidity: 0,
          dex_distribution: [],
          chain_distribution: [],
          concentration_risk: 'high'
        }
      }

      // Get liquidity analysis from GeckoTerminal
      console.log(`Getting liquidity analysis for ${ticker} (${tokenData.contract_address})`)
      const analysis = await geckoTerminalService.getLiquidityAnalysis(
        tokenData.contract_address,
        ticker
      )

      if (!analysis) {
        return {
          total_liquidity: 0,
          dex_distribution: [],
          chain_distribution: [],
          concentration_risk: 'high'
        }
      }

      return analysis
    } catch (error) {
      console.error('Error getting enhanced liquidity data:', error)
      return {
        total_liquidity: 0,
        dex_distribution: [],
        chain_distribution: [],
        concentration_risk: 'high'
      }
    }
  }

  /**
   * Liquidity Analysis (15% weight)
   * Enhanced with real DEX data when available
   */
  private async calculateLiquidity(info: StablecoinInfo, coinId: string): Promise<{
    score: number
    details: Record<string, any>
  }> {
    try {
      const liquidityData = await geckoTerminalService.getLiquidityAnalysis(info.symbol, coinId);
      
      if (!liquidityData) {
        return { score: 0, details: { error: 'Failed to fetch liquidity data' } };
      }
      
      // @ts-ignore
      const score = liquidityData.score || 0;
      
      return { score, details: liquidityData };
    } catch (error) {
      console.error(`Error calculating liquidity for ${info.name}:`, error);
      return { score: 0, details: { error: 'Failed to fetch liquidity data' } };
    }
  }

  /**
   * Oracle Setup Analysis (15% weight)
   * Enhanced with detailed provider analysis
   */
  private async calculateOracleSetup(info: StablecoinInfo): Promise<{
    score: number,
    details: any // To-do: Define a proper type for oracle details
  }> {
    const oracleData = { decentralization_score: 0 }; // Disabled oracle functionality
    
    const score = 0;
    
    console.log(`✅ Enhanced oracle scoring for ${info.symbol}: ${score}/100`);
    
    return {
      score,
      details: {}
    };
  }

  /**
   * Enhanced Audit Status Analysis with actual audit data
   * Takes into account real audit information when available
   */
  private async calculateAuditStatusWithData(info: StablecoinInfo | null, audits: AuditInfo[]): Promise<{
    score: number
    details: Record<string, any>
  }> {
    const details: Record<string, any> = {}

    // If we have actual audit data, calculate score based on that
    if (audits && audits.length > 0) {
      let score = 50 // Base score

      // Recent audits bonus (up to +30 points)
      const recentAudits = audits.filter(audit => {
        const auditDate = new Date(audit.date)
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        return auditDate >= sixMonthsAgo
      })

      if (recentAudits.length >= 3) {
        score += 30 // Excellent: 3+ recent audits
      } else if (recentAudits.length >= 2) {
        score += 25 // Very good: 2 recent audits
      } else if (recentAudits.length >= 1) {
        score += 20 // Good: 1 recent audit
      }

      // Top-tier firm bonus (up to +15 points)
      const topTierAudits = audits.filter(audit => audit.is_top_tier)
      if (topTierAudits.length >= 2) {
        score += 15 // Multiple top-tier audits
      } else if (topTierAudits.length >= 1) {
        score += 10 // At least one top-tier audit
      }

      // Critical/high issues penalty (up to -20 points)
      const totalCriticalHighIssues = audits.reduce((sum, audit) => sum + (audit.critical_high_issues || 0), 0)
      if (totalCriticalHighIssues === 0) {
        score += 10 // Bonus for no critical/high issues
      } else if (totalCriticalHighIssues <= 2) {
        score -= 5 // Minor penalty for few issues
      } else {
        score -= Math.min(20, totalCriticalHighIssues * 3) // Escalating penalty
      }

      // Resolution status bonus (up to +5 points)
      const resolvedAudits = audits.filter(audit => audit.resolution_status === 'resolved')
      if (resolvedAudits.length === audits.length) {
        score += 5 // All issues resolved
      }

      return {
        score: Math.min(100, Math.max(0, Math.round(score))),
        details: {
          total_audits: audits.length,
          recent_audits: recentAudits.length,
          top_tier_audits: topTierAudits.length,
          critical_high_issues: totalCriticalHighIssues,
          resolved_audits: resolvedAudits.length,
          has_audit_data: true
        }
      }
    }

    // Fallback to legacy scoring for known coins without audit data
    // If info is null (API failed), return a default score
    if (!info) {
      return {
        score: 30, // Default score when API fails and no audit data
        details: {
          auditor: 'Unknown - API unavailable',
          is_well_audited: false,
          has_audit_data: false,
          api_failed: true
        }
      }
    }

    return this.calculateAuditStatus(info)
  }

  /**
   * Audit Status Analysis (10% weight)
   * Based on known audit information (legacy method)
   */
  private async calculateAuditStatus(info: StablecoinInfo): Promise<{
    score: number
    details: Record<string, any>
  }> {
    const details: Record<string, any> = {}

    // Well-audited stablecoins
    const wellAuditedCoins = {
      'usdc': { score: 95, auditor: 'Grant Thornton LLP (monthly)' },
      'usdt': { score: 85, auditor: 'BDO Italia (quarterly)' },
      'busd': { score: 90, auditor: 'Withum (monthly)' },
      'dai': { score: 90, auditor: 'Multiple security audits' },
      'frax': { score: 85, auditor: 'Code4rena, Certik' },
    }

    const coinKey = info.symbol.toLowerCase()
    if (wellAuditedCoins[coinKey as keyof typeof wellAuditedCoins]) {
      const auditInfo = wellAuditedCoins[coinKey as keyof typeof wellAuditedCoins]
      return {
        score: auditInfo.score,
        details: {
          auditor: auditInfo.auditor,
          is_well_audited: true,
          has_audit_data: false
        }
      }
    }

    // Unknown coins get lower audit scores
    return {
      score: 30,
      details: {
        auditor: 'Unknown',
        is_well_audited: false,
        has_audit_data: false
      }
    }
  }

  /**
   * Calculate overall weighted risk score
   */
  private calculateOverallRiskScore(riskFactors: RiskFactors): number {
    const weights = {
      peg_stability: 0.50,    // 50% (increased from 40%)
      transparency: 0.25,     // 25% (increased from 20%)
      liquidity: 0.15,        // 15%
      audit_status: 0.10,     // 10%
    }

    const weightedScore = 
      riskFactors.peg_stability.score * weights.peg_stability +
      riskFactors.transparency.score * weights.transparency +
      riskFactors.liquidity.score * weights.liquidity +
      riskFactors.audit_status.score * weights.audit_status

    return Math.round(weightedScore)
  }

  /**
   * Analyze peg stability with detailed depeg incident detection
   */
  private analyzePegStability(priceHistory: PricePoint[]): {
    avgDeviation: number
    depegIncidents: number
    avgRecoveryTime: number
    isCurrentlyDepegged: boolean
    lastDepegDate?: string
  } {
    if (priceHistory.length === 0) {
      return {
        avgDeviation: 0,
        depegIncidents: 0,
        avgRecoveryTime: 0,
        isCurrentlyDepegged: false
      }
    }

    const DEPEG_THRESHOLD = 1.0 // 1% deviation threshold
    const RECOVERY_THRESHOLD = 0.5 // 0.5% back to stable

    // Calculate average deviation
    const avgDeviation = priceHistory.reduce((sum, p) => sum + Math.abs(p.deviation_percent), 0) / priceHistory.length

    // Detect depeg incidents
    let depegIncidents = 0
    let recoveryTimes: number[] = []
    let currentIncident: { start: number; startIndex: number } | null = null
    let lastDepegDate: string | undefined

    for (let i = 0; i < priceHistory.length; i++) {
      const point = priceHistory[i]
      const isDepegged = Math.abs(point.deviation_percent) > DEPEG_THRESHOLD

      if (isDepegged && !currentIncident) {
        // Start of new depeg incident
        currentIncident = { start: point.timestamp, startIndex: i }
        depegIncidents++
        lastDepegDate = new Date(point.timestamp).toISOString().split('T')[0]
      } else if (!isDepegged && currentIncident) {
        // Recovery from depeg
        const recoveryTime = (point.timestamp - currentIncident.start) / (1000 * 60 * 60) // hours
        recoveryTimes.push(recoveryTime)
        currentIncident = null
      }
    }

    // Check if currently depegged
    const latestPoint = priceHistory[priceHistory.length - 1]
    const isCurrentlyDepegged = Math.abs(latestPoint.deviation_percent) > DEPEG_THRESHOLD

    // Calculate average recovery time
    const avgRecoveryTime = recoveryTimes.length > 0 
      ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length 
      : 0

    return {
      avgDeviation,
      depegIncidents,
      avgRecoveryTime,
      isCurrentlyDepegged,
      lastDepegDate
    }
  }
}

// Export singleton instance
export const stablecoinDataService = new StablecoinDataService() 