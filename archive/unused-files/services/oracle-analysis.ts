import { StablecoinInfo } from '@/lib/types'

interface OracleProvider {
  name: string
  type: 'price_feed' | 'attestation' | 'hybrid'
  reputation: 'top_tier' | 'established' | 'emerging' | 'unknown'
  chains: string[]
  update_frequency: string
}

interface OracleAnalysis {
  providers: OracleProvider[]
  is_multi_oracle: boolean
  decentralization_score: number
  oracle_count: number
  chain_diversity: number
  reputation_score: number
}

export class OracleAnalysisService {
  
  /**
   * Known oracle configurations for major stablecoins
   */
  private readonly KNOWN_ORACLE_CONFIGS: Record<string, OracleAnalysis> = {
    'USDC': {
      providers: [
        {
          name: 'Centre Consortium',
          type: 'attestation',
          reputation: 'top_tier',
          chains: ['ethereum', 'polygon', 'avalanche', 'arbitrum', 'optimism'],
          update_frequency: 'monthly'
        },
        {
          name: 'Chainlink PoR',
          type: 'attestation',
          reputation: 'top_tier',
          chains: ['ethereum'],
          update_frequency: 'real-time'
        }
      ],
      is_multi_oracle: true,
      decentralization_score: 85,
      oracle_count: 2,
      chain_diversity: 5,
      reputation_score: 95
    },
    
    'USDT': {
      providers: [
        {
          name: 'Tether Limited',
          type: 'attestation',
          reputation: 'established',
          chains: ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum'],
          update_frequency: 'monthly'
        }
      ],
      is_multi_oracle: false,
      decentralization_score: 60,
      oracle_count: 1,
      chain_diversity: 5,
      reputation_score: 75
    },

    'DAI': {
      providers: [
        {
          name: 'MakerDAO Oracle Module',
          type: 'price_feed',
          reputation: 'top_tier',
          chains: ['ethereum'],
          update_frequency: 'real-time'
        },
        {
          name: 'Chainlink',
          type: 'price_feed',
          reputation: 'top_tier',
          chains: ['ethereum', 'polygon', 'arbitrum'],
          update_frequency: 'real-time'
        }
      ],
      is_multi_oracle: true,
      decentralization_score: 95,
      oracle_count: 2,
      chain_diversity: 3,
      reputation_score: 100
    },

    'FRAX': {
      providers: [
        {
          name: 'Frax Protocol Oracle',
          type: 'hybrid',
          reputation: 'established',
          chains: ['ethereum', 'polygon', 'arbitrum', 'avalanche'],
          update_frequency: 'real-time'
        },
        {
          name: 'Chainlink',
          type: 'price_feed',
          reputation: 'top_tier',
          chains: ['ethereum'],
          update_frequency: 'real-time'
        }
      ],
      is_multi_oracle: true,
      decentralization_score: 80,
      oracle_count: 2,
      chain_diversity: 4,
      reputation_score: 85
    },

    'LUSD': {
      providers: [
        {
          name: 'Liquity Protocol',
          type: 'price_feed',
          reputation: 'established',
          chains: ['ethereum'],
          update_frequency: 'real-time'
        },
        {
          name: 'Chainlink ETH/USD',
          type: 'price_feed',
          reputation: 'top_tier',
          chains: ['ethereum'],
          update_frequency: 'real-time'
        }
      ],
      is_multi_oracle: true,
      decentralization_score: 75,
      oracle_count: 2,
      chain_diversity: 1,
      reputation_score: 80
    }
  }

  /**
   * Get comprehensive oracle analysis for a stablecoin
   */
  async getOracleAnalysis(info: StablecoinInfo): Promise<OracleAnalysis> {
    const symbol = info.symbol.toUpperCase()
    
    // Check if we have known configuration
    if (this.KNOWN_ORACLE_CONFIGS[symbol]) {
      console.log(`✅ Using known oracle configuration for ${symbol}`)
      return this.KNOWN_ORACLE_CONFIGS[symbol]
    }

    // Fallback to analysis based on pegging type and available information
    console.log(`⚠️ Analyzing oracle setup for unknown stablecoin: ${symbol}`)
    return this.analyzeByPeggingType(info)
  }

  /**
   * Analyze oracle requirements based on pegging mechanism
   */
  private analyzeByPeggingType(info: StablecoinInfo): OracleAnalysis {
    const baseAnalysis: OracleAnalysis = {
      providers: [],
      is_multi_oracle: false,
      decentralization_score: 30,
      oracle_count: 0,
      chain_diversity: 1,
      reputation_score: 40
    }

    switch (info.pegging_type) {
      case 'fiat-backed':
        return {
          ...baseAnalysis,
          providers: [{
            name: 'Issuer Attestation',
            type: 'attestation',
            reputation: 'unknown',
            chains: ['ethereum'],
            update_frequency: 'monthly'
          }],
          oracle_count: 1,
          decentralization_score: 40,
          reputation_score: 50
        }

      case 'crypto-collateralized':
        return {
          ...baseAnalysis,
          providers: [
            {
              name: 'Protocol Oracle',
              type: 'price_feed',
              reputation: 'unknown',
              chains: ['ethereum'],
              update_frequency: 'real-time'
            },
            {
              name: 'External Price Feed',
              type: 'price_feed',
              reputation: 'unknown',
              chains: ['ethereum'],
              update_frequency: 'real-time'
            }
          ],
          is_multi_oracle: true,
          oracle_count: 2,
          decentralization_score: 60,
          reputation_score: 60
        }

      case 'algorithmic':
        return {
          ...baseAnalysis,
          providers: [{
            name: 'Algorithm-based Oracle',
            type: 'hybrid',
            reputation: 'unknown',
            chains: ['ethereum'],
            update_frequency: 'real-time'
          }],
          oracle_count: 1,
          decentralization_score: 20,
          reputation_score: 30
        }

      case 'commodity-backed':
        return {
          ...baseAnalysis,
          providers: [
            {
              name: 'Commodity Price Oracle',
              type: 'price_feed',
              reputation: 'unknown',
              chains: ['ethereum'],
              update_frequency: 'daily'
            },
            {
              name: 'Custody Attestation',
              type: 'attestation',
              reputation: 'unknown',
              chains: ['ethereum'],
              update_frequency: 'monthly'
            }
          ],
          is_multi_oracle: true,
          oracle_count: 2,
          decentralization_score: 50,
          reputation_score: 45
        }

      default:
        return baseAnalysis
    }
  }

  /**
   * Calculate oracle score based on analysis
   */
  calculateOracleScore(analysis: OracleAnalysis): number {
    let score = 0

    // Base score from decentralization (40% weight)
    score += (analysis.decentralization_score / 100) * 40

    // Reputation score (30% weight)
    score += (analysis.reputation_score / 100) * 30

    // Multi-oracle setup (30% weight)
    if (analysis.is_multi_oracle) {
      score += 30
    } else {
      score += 5 // Small score for single oracle
    }

    return Math.round(Math.max(0, Math.min(100, score)))
  }

  /**
   * Get oracle setup details for display
   */
  getOracleDetails(analysis: OracleAnalysis): Record<string, any> {
    return {
      provider_count: analysis.oracle_count,
      is_multi_oracle: analysis.is_multi_oracle,
      decentralization_score: analysis.decentralization_score,
      reputation_score: analysis.reputation_score,
      top_tier_providers: analysis.providers.filter(p => p.reputation === 'top_tier').length,
      real_time_feeds: analysis.providers.filter(p => p.update_frequency === 'real-time').length,
      provider_names: analysis.providers.map(p => p.name),
    }
  }
}

export const oracleAnalysisService = new OracleAnalysisService() 