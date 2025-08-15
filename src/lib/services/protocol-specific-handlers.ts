import { 
  StablecoinInfo, 
  ProtocolSpecificHandler,
  CollateralDiscoveryResult,
  CollateralData,
  CollateralAllocation,
  ProtocolMechanism,
  HeuristicCollateralData
} from '@/lib/types'
import { enhancedCacheService } from './enhanced-cache-service'
import { metricsService } from './metrics-service'

/**
 * Base Protocol Handler
 */
abstract class BaseProtocolHandler implements ProtocolSpecificHandler {
  abstract name: string
  abstract supportedMechanisms: ProtocolMechanism['type'][]

  abstract extractCollateralData(info: StablecoinInfo): Promise<CollateralDiscoveryResult>
  abstract getConfidenceScore(data: CollateralData): number
  abstract validateData(data: CollateralData): boolean

  protected createFailureResult(error: string, extractionTime: number): CollateralDiscoveryResult {
    return {
      source_tier: 4,
      discovery_method: 'heuristic_fallback',
      data: {
        collateral_allocations: [],
        confidence: 0,
        extraction_method: 'manual_mapping'
      },
      confidence: 0,
      cost_usd: 0,
      extraction_time_ms: extractionTime,
      fallback_reason: error
    }
  }
}

/**
 * Centralized Stablecoin Handler (USDT, USDC, BUSD)
 */
export class CentralizedStablecoinHandler extends BaseProtocolHandler {
  name = 'CentralizedStablecoinHandler'
  supportedMechanisms: ProtocolMechanism['type'][] = ['centralized']

  private readonly KNOWN_CENTRALIZED_COINS = {
    'usdt': {
      issuer: 'Tether Limited',
      typical_backing: ['cash', 'commercial_paper', 'treasury_bills', 'corporate_bonds'],
      transparency_url: 'https://tether.to/en/transparency/',
      attestation_frequency: 'quarterly'
    },
    'usdc': {
      issuer: 'Centre Consortium',
      typical_backing: ['cash', 'short_duration_us_treasuries'],
      transparency_url: 'https://centre.io/usdc-transparency',
      attestation_frequency: 'monthly'
    },
    'busd': {
      issuer: 'Paxos',
      typical_backing: ['cash', 'treasury_bills'],
      transparency_url: 'https://paxos.com/busd-transparency/',
      attestation_frequency: 'monthly'
    },
    'tusd': {
      issuer: 'TrustToken',
      typical_backing: ['cash', 'cash_equivalents'],
      transparency_url: 'https://trueusd.tusd.io/trueusd/transparency/',
      attestation_frequency: 'monthly'
    }
  }

  async extractCollateralData(info: StablecoinInfo): Promise<CollateralDiscoveryResult> {
    const startTime = Date.now()
    console.log(`[CentralizedHandler] Analyzing centralized stablecoin: ${info.symbol}`)

    try {
      const coinKey = info.symbol.toLowerCase()
      const knownData = this.KNOWN_CENTRALIZED_COINS[coinKey as keyof typeof this.KNOWN_CENTRALIZED_COINS]

      if (!knownData) {
        return this.createGenericCentralizedResult(info, startTime)
      }

      // Create collateral allocations based on known backing
      const allocations: CollateralAllocation[] = knownData.typical_backing.map((assetType, index) => {
        // Distribute market cap across asset types with typical weightings
        let percentage = 0
        switch (assetType) {
          case 'cash':
            percentage = coinKey === 'usdt' ? 15 : 85 // USDT has less cash, more commercial paper
            break
          case 'commercial_paper':
            percentage = coinKey === 'usdt' ? 65 : 0
            break
          case 'treasury_bills':
            percentage = coinKey === 'usdt' ? 15 : 10
            break
          case 'short_duration_us_treasuries':
            percentage = coinKey === 'usdc' ? 15 : 0
            break
          default:
            percentage = 5
        }

        return {
          asset_type: assetType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          percentage,
          value_usd: (info.market_cap || 0) * (percentage / 100),
          description: `Typical ${assetType.replace(/_/g, ' ')} backing for ${knownData.issuer}`
        }
      }).filter(alloc => alloc.percentage > 0)

      const collateralData: CollateralData = {
        total_assets: info.market_cap || 0,
        total_liabilities: info.market_cap || 0,
        overcollateralization_ratio: 1.0, // Centralized stablecoins target 1:1 backing
        collateral_allocations: allocations,
        last_updated: new Date().toISOString(),
        report_url: knownData.transparency_url,
        confidence: 0.85, // High confidence for known centralized stablecoins
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

    } catch (error) {
      console.error(`[CentralizedHandler] Error analyzing ${info.symbol}:`, error)
      return this.createFailureResult(
        error instanceof Error ? error.message : 'Unknown error',
        Date.now() - startTime
      )
    }
  }

  private createGenericCentralizedResult(info: StablecoinInfo, startTime: number): CollateralDiscoveryResult {
    // Generic centralized stablecoin analysis
    const allocations: CollateralAllocation[] = [
      {
        asset_type: 'Cash and Cash Equivalents',
        percentage: 80,
        value_usd: (info.market_cap || 0) * 0.8,
        description: 'Estimated cash reserves for unknown centralized stablecoin'
      },
      {
        asset_type: 'Short Term Securities',
        percentage: 20,
        value_usd: (info.market_cap || 0) * 0.2,
        description: 'Estimated short-term investment securities'
      }
    ]

    const collateralData: CollateralData = {
      total_assets: info.market_cap || 0,
      total_liabilities: info.market_cap || 0,
      overcollateralization_ratio: 1.0,
      collateral_allocations: allocations,
      last_updated: new Date().toISOString(),
      confidence: 0.60, // Lower confidence for unknown centralized coins
      extraction_method: 'heuristic_fallback'
    }

    return {
      source_tier: 4,
      discovery_method: 'heuristic_fallback',
      data: collateralData,
      confidence: 0.60,
      cost_usd: 0,
      extraction_time_ms: Date.now() - startTime
    }
  }

  getConfidenceScore(data: CollateralData): number {
    // Base confidence
    let confidence = 0.7

    // Higher confidence if we have detailed allocations
    if (data.collateral_allocations.length >= 3) {
      confidence += 0.1
    }

    // Higher confidence if we have report URL
    if (data.report_url) {
      confidence += 0.05
    }

    return Math.min(0.9, confidence)
  }

  validateData(data: CollateralData): boolean {
    // Basic validation for centralized stablecoins
    return (
      data.collateral_allocations.length > 0 &&
      (data.total_assets || 0) > 0 &&
      data.overcollateralization_ratio !== undefined &&
      data.overcollateralization_ratio >= 0.95 && // Should be close to 1:1 backing
      data.overcollateralization_ratio <= 1.05
    )
  }
}

/**
 * Over-Collateralized Stablecoin Handler (DAI, LUSD, etc.)
 */
export class OverCollateralizedHandler extends BaseProtocolHandler {
  name = 'OverCollateralizedHandler'
  supportedMechanisms: ProtocolMechanism['type'][] = ['over_collateralized', 'crypto-collateralized']

  private readonly KNOWN_OVER_COLLATERALIZED = {
    'dai': {
      protocol: 'MakerDAO',
      typical_collateral: ['eth', 'wbtc', 'usdc', 'steth'],
      min_collateral_ratio: 150, // 150%
      governance_token: 'mkr'
    },
    'lusd': {
      protocol: 'Liquity',
      typical_collateral: ['eth'],
      min_collateral_ratio: 110, // 110%
      governance_token: 'lqty'
    },
    'frxusd': {
      protocol: 'Frax',
      typical_collateral: ['usdc', 'eth', 'fxs'],
      min_collateral_ratio: 100, // Can be 100% due to algorithmic mechanism
      governance_token: 'fxs'
    }
  }

  async extractCollateralData(info: StablecoinInfo): Promise<CollateralDiscoveryResult> {
    const startTime = Date.now()
    console.log(`[OverCollateralizedHandler] Analyzing over-collateralized stablecoin: ${info.symbol}`)

    try {
      const coinKey = info.symbol.toLowerCase()
      const knownData = this.KNOWN_OVER_COLLATERALIZED[coinKey as keyof typeof this.KNOWN_OVER_COLLATERALIZED]

      if (!knownData) {
        return this.createGenericOverCollateralizedResult(info, startTime)
      }

      // Create collateral allocations based on typical asset distribution
      const allocations: CollateralAllocation[] = knownData.typical_collateral.map((asset, index) => {
        let percentage = 0
        let valueMultiplier = 1.5 // Default 150% over-collateralization

        switch (asset) {
          case 'eth':
            percentage = coinKey === 'lusd' ? 100 : (coinKey === 'dai' ? 60 : 40)
            break
          case 'wbtc':
            percentage = coinKey === 'dai' ? 15 : 0
            break
          case 'usdc':
            percentage = coinKey === 'dai' ? 20 : (coinKey === 'frxusd' ? 40 : 0)
            break
          case 'steth':
            percentage = coinKey === 'dai' ? 5 : 0
            break
          case 'fxs':
            percentage = coinKey === 'frxusd' ? 20 : 0
            break
          default:
            percentage = 0
        }

        if (knownData.min_collateral_ratio) {
          valueMultiplier = knownData.min_collateral_ratio / 100
        }

        const baseValue = (info.market_cap || 0) * (percentage / 100)

        return {
          asset_type: asset.toUpperCase(),
          percentage,
          value_usd: baseValue * valueMultiplier,
          description: `${asset.toUpperCase()} collateral in ${knownData.protocol}`
        }
      }).filter(alloc => alloc.percentage > 0)

      const totalCollateralValue = allocations.reduce((sum, alloc) => sum + (alloc.value_usd || 0), 0)

      const collateralData: CollateralData = {
        total_assets: totalCollateralValue,
        total_liabilities: info.market_cap || 0,
        overcollateralization_ratio: totalCollateralValue / (info.market_cap || 1),
        collateral_allocations: allocations,
        last_updated: new Date().toISOString(),
        report_url: this.getProtocolDashboardUrl(knownData.protocol),
        confidence: 0.88, // High confidence for known over-collateralized protocols
        extraction_method: 'manual_mapping'
      }

      return {
        source_tier: 1,
        discovery_method: 'manual_mapping',
        data: collateralData,
        confidence: 0.88,
        cost_usd: 0,
        extraction_time_ms: Date.now() - startTime
      }

    } catch (error) {
      console.error(`[OverCollateralizedHandler] Error analyzing ${info.symbol}:`, error)
      return this.createFailureResult(
        error instanceof Error ? error.message : 'Unknown error',
        Date.now() - startTime
      )
    }
  }

  private createGenericOverCollateralizedResult(info: StablecoinInfo, startTime: number): CollateralDiscoveryResult {
    // Generic over-collateralized analysis with common crypto assets
    const allocations: CollateralAllocation[] = [
      {
        asset_type: 'ETH',
        percentage: 60,
        value_usd: (info.market_cap || 0) * 0.6 * 1.5, // 150% over-collateralized
        description: 'Estimated ETH collateral'
      },
      {
        asset_type: 'WBTC',
        percentage: 25,
        value_usd: (info.market_cap || 0) * 0.25 * 1.5,
        description: 'Estimated WBTC collateral'
      },
      {
        asset_type: 'USDC',
        percentage: 15,
        value_usd: (info.market_cap || 0) * 0.15 * 1.5,
        description: 'Estimated stable collateral'
      }
    ]

    const totalCollateralValue = allocations.reduce((sum, alloc) => sum + (alloc.value_usd || 0), 0)

    const collateralData: CollateralData = {
      total_assets: totalCollateralValue,
      total_liabilities: info.market_cap || 0,
      overcollateralization_ratio: 1.5,
      collateral_allocations: allocations,
      last_updated: new Date().toISOString(),
      confidence: 0.65, // Lower confidence for unknown protocols
      extraction_method: 'heuristic_fallback'
    }

    return {
      source_tier: 4,
      discovery_method: 'heuristic_fallback',
      data: collateralData,
      confidence: 0.65,
      cost_usd: 0,
      extraction_time_ms: Date.now() - startTime
    }
  }

  private getProtocolDashboardUrl(protocol: string): string {
    const dashboards: Record<string, string> = {
      'MakerDAO': 'https://daistats.com/',
      'Liquity': 'https://dune.com/dani/Liquity',
      'Frax': 'https://app.frax.finance/transparency'
    }
    return dashboards[protocol] || ''
  }

  getConfidenceScore(data: CollateralData): number {
    let confidence = 0.75

    // Higher confidence if over-collateralized
    if ((data.overcollateralization_ratio || 0) > 1.2) {
      confidence += 0.1
    }

    // Higher confidence with diverse collateral types
    if (data.collateral_allocations.length >= 3) {
      confidence += 0.05
    }

    return Math.min(0.95, confidence)
  }

  validateData(data: CollateralData): boolean {
    return (
      data.collateral_allocations.length > 0 &&
      (data.total_assets || 0) > 0 &&
      (data.overcollateralization_ratio || 0) >= 1.05 // Should be over-collateralized
    )
  }
}

/**
 * Algorithmic Stablecoin Handler (FRAX, FEI, etc.)
 */
export class AlgorithmicStablecoinHandler extends BaseProtocolHandler {
  name = 'AlgorithmicStablecoinHandler'
  supportedMechanisms: ProtocolMechanism['type'][] = ['algorithmic']

  private readonly KNOWN_ALGORITHMIC = {
    'frax': {
      mechanism: 'fractional_reserve',
      collateral_ratio_target: 90, // Variable, around 90%
      stabilization_mechanism: ['share_minting', 'burning', 'amo_operations'],
      governance_token: 'fxs'
    },
    'fei': {
      mechanism: 'protocol_controlled_value',
      collateral_ratio_target: 100,
      stabilization_mechanism: ['direct_incentives', 'reweighting'],
      governance_token: 'tribe'
    },
    'ust': {
      mechanism: 'seigniorage_shares',
      collateral_ratio_target: 0, // Purely algorithmic (before collapse)
      stabilization_mechanism: ['luna_burning', 'ust_minting'],
      governance_token: 'luna'
    }
  }

  async extractCollateralData(info: StablecoinInfo): Promise<CollateralDiscoveryResult> {
    const startTime = Date.now()
    console.log(`[AlgorithmicHandler] Analyzing algorithmic stablecoin: ${info.symbol}`)

    try {
      const coinKey = info.symbol.toLowerCase()
      const knownData = this.KNOWN_ALGORITHMIC[coinKey as keyof typeof this.KNOWN_ALGORITHMIC]

      if (!knownData) {
        return this.createGenericAlgorithmicResult(info, startTime)
      }

      // Create allocations based on mechanism type
      const allocations: CollateralAllocation[] = []

      if (knownData.collateral_ratio_target > 0) {
        // Partial collateral backing
        const collateralValue = (info.market_cap || 0) * (knownData.collateral_ratio_target / 100)
        allocations.push({
          asset_type: 'Stable Collateral',
          percentage: knownData.collateral_ratio_target,
          value_usd: collateralValue,
          description: `${knownData.mechanism} collateral backing`
        })

        // Algorithm/governance token component
        const algorithmicValue = (info.market_cap || 0) * ((100 - knownData.collateral_ratio_target) / 100)
        allocations.push({
          asset_type: `${knownData.governance_token.toUpperCase()} Value`,
          percentage: 100 - knownData.collateral_ratio_target,
          value_usd: algorithmicValue,
          description: `Algorithmic backing via ${knownData.governance_token.toUpperCase()}`
        })
      } else {
        // Purely algorithmic
        allocations.push({
          asset_type: 'Algorithmic Mechanism',
          percentage: 100,
          value_usd: info.market_cap || 0,
          description: `Pure algorithmic backing via ${knownData.stabilization_mechanism.join(', ')}`
        })
      }

      const collateralData: CollateralData = {
        total_assets: info.market_cap || 0,
        total_liabilities: info.market_cap || 0,
        overcollateralization_ratio: knownData.collateral_ratio_target / 100,
        collateral_allocations: allocations,
        last_updated: new Date().toISOString(),
        report_url: this.getAlgorithmicDashboardUrl(coinKey),
        confidence: 0.75, // Medium-high confidence for algorithmic analysis
        extraction_method: 'manual_mapping'
      }

      return {
        source_tier: 1,
        discovery_method: 'manual_mapping',
        data: collateralData,
        confidence: 0.75,
        cost_usd: 0,
        extraction_time_ms: Date.now() - startTime
      }

    } catch (error) {
      console.error(`[AlgorithmicHandler] Error analyzing ${info.symbol}:`, error)
      return this.createFailureResult(
        error instanceof Error ? error.message : 'Unknown error',
        Date.now() - startTime
      )
    }
  }

  private createGenericAlgorithmicResult(info: StablecoinInfo, startTime: number): CollateralDiscoveryResult {
    // Generic algorithmic stablecoin analysis
    const allocations: CollateralAllocation[] = [
      {
        asset_type: 'Algorithmic Reserve',
        percentage: 70,
        value_usd: (info.market_cap || 0) * 0.7,
        description: 'Estimated algorithmic stability mechanism value'
      },
      {
        asset_type: 'Protocol Treasury',
        percentage: 30,
        value_usd: (info.market_cap || 0) * 0.3,
        description: 'Estimated protocol-controlled value'
      }
    ]

    const collateralData: CollateralData = {
      total_assets: info.market_cap || 0,
      total_liabilities: info.market_cap || 0,
      overcollateralization_ratio: 1.0,
      collateral_allocations: allocations,
      last_updated: new Date().toISOString(),
      confidence: 0.50, // Lower confidence for unknown algorithmic coins
      extraction_method: 'heuristic_fallback'
    }

    return {
      source_tier: 4,
      discovery_method: 'heuristic_fallback',
      data: collateralData,
      confidence: 0.50,
      cost_usd: 0,
      extraction_time_ms: Date.now() - startTime
    }
  }

  private getAlgorithmicDashboardUrl(symbol: string): string {
    const dashboards: Record<string, string> = {
      'frax': 'https://app.frax.finance/transparency',
      'fei': 'https://app.fei.money/',
      'ust': 'https://www.terraswap.io/' // Historical
    }
    return dashboards[symbol] || ''
  }

  getConfidenceScore(data: CollateralData): number {
    // Algorithmic stablecoins have inherently lower confidence
    let confidence = 0.60

    // Slightly higher confidence if there's some collateral backing
    if ((data.overcollateralization_ratio || 0) > 0.5) {
      confidence += 0.1
    }

    // Higher confidence with documented mechanisms
    if (data.report_url) {
      confidence += 0.05
    }

    return Math.min(0.80, confidence) // Cap at 80% for algorithmic
  }

  validateData(data: CollateralData): boolean {
    return (
      data.collateral_allocations.length > 0 &&
      (data.total_assets || 0) >= 0 &&
      data.overcollateralization_ratio !== undefined &&
      data.overcollateralization_ratio >= 0 // Can be 0 for pure algorithmic
    )
  }
}

/**
 * Protocol Handler Factory
 */
export class ProtocolHandlerFactory {
  private handlers: Map<string, ProtocolSpecificHandler> = new Map()

  constructor() {
    // Initialize all handlers
    this.registerHandler(new CentralizedStablecoinHandler())
    this.registerHandler(new OverCollateralizedHandler())
    this.registerHandler(new AlgorithmicStablecoinHandler())
  }

  registerHandler(handler: ProtocolSpecificHandler): void {
    this.handlers.set(handler.name, handler)
  }

  getHandlerForStablecoin(info: StablecoinInfo): ProtocolSpecificHandler | null {
    // Determine the best handler based on pegging type and other characteristics
    switch (info.pegging_type) {
      case 'fiat-backed':
        return this.handlers.get('CentralizedStablecoinHandler') || null
      case 'crypto-collateralized':
      case 'over_collateralized':
        return this.handlers.get('OverCollateralizedHandler') || null
      case 'algorithmic':
        return this.handlers.get('AlgorithmicStablecoinHandler') || null
      default:
        // Default to centralized handler for unknown types
        return this.handlers.get('CentralizedStablecoinHandler') || null
    }
  }

  getAllHandlers(): ProtocolSpecificHandler[] {
    return Array.from(this.handlers.values())
  }
}

// Export singleton factory
export const protocolHandlerFactory = new ProtocolHandlerFactory()