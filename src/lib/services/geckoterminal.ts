import { ApiClient } from './api-client'
import { config } from '@/lib/config'
import { coinGeckoService } from '@/lib/services/coingecko'

interface DexLiquidityData {
  dex: string
  liquidity: number
  percentage: number
  chain: string
}

interface ChainLiquidityData {
  chain: string
  liquidity: number
  percentage: number
}

export interface LiquidityAnalysis {
  total_liquidity: number
  dex_distribution: DexLiquidityData[]
  chain_distribution: ChainLiquidityData[]
  concentration_risk: 'low' | 'medium' | 'high'
}

interface GeckoTerminalPool {
  attributes: {
    chain: string
    dex_name: string
    reserve_in_usd: string
    volume_usd?: {
      h24: string
    }
  }
  relationships?: {
    dex?: {
      data?: {
        id: string
      }
    }
    base_token?: {
      data?: {
        id: string
      }
    }
  }
}

interface GeckoTerminalPoolsResponse {
  data: GeckoTerminalPool[]
}

interface GeckoTerminalNetwork {
  id: string
  type: string
  attributes: {
    name: string
    chain_identifier?: string
    coingecko_asset_platform_id?: string
  }
}

interface GeckoTerminalNetworksResponse {
  data: GeckoTerminalNetwork[]
}

interface TokenAddressResponse {
  data: Array<{
    id: string
    type: string
    attributes: {
      address: string
      name: string
      symbol: string
    }
    relationships: {
      network: {
        data: {
          id: string
          type: string
        }
      }
    }
  }>
}

export class GeckoTerminalService {
  private client: ApiClient
  private supportedNetworks: GeckoTerminalNetwork[] | null = null

  constructor() {
    this.client = new ApiClient(
      config.geckoterminal.baseUrl,
      {
        'Accept': 'application/json',
        'User-Agent': 'StableRisk/1.0',
      },
      10000
    )
  }

  /**
   * Get supported networks from GeckoTerminal (cached)
   */
  private async getSupportedNetworks(): Promise<GeckoTerminalNetwork[]> {
    if (this.supportedNetworks) {
      return this.supportedNetworks
    }

    try {
      console.log('🔍 Fetching supported networks from GeckoTerminal...')
      const response = await this.client.get<GeckoTerminalNetworksResponse>('/networks')
      this.supportedNetworks = response.data || []
      console.log(`✅ Found ${this.supportedNetworks.length} supported networks`)
      return this.supportedNetworks
    } catch (error) {
      console.warn('Failed to fetch supported networks:', error)
      this.supportedNetworks = []
      return []
    }
  }

  /**
   * Intelligently match CoinGecko platform ID to GeckoTerminal network ID
   */
  private matchPlatformToNetwork(coinGeckoPlatformId: string, supportedNetworks: GeckoTerminalNetwork[]): string | null {
    // 1. Direct coingecko_asset_platform_id match (most accurate)
    const directMatch = supportedNetworks.find(network => 
      network.attributes.coingecko_asset_platform_id === coinGeckoPlatformId
    )
    if (directMatch) {
      console.log(`🎯 Direct match: ${coinGeckoPlatformId} → ${directMatch.id}`)
      return directMatch.id
    }

    // 2. Smart name-based matching patterns
    const nameMatching: { [key: string]: string[] } = {
      'ethereum': ['eth', 'ethereum'],
      'arbitrum_one': ['arbitrum', 'arb'],
      'optimistic_ethereum': ['optimism', 'op'],
      'polygon_pos': ['polygon', 'matic'],
      'binance_smart_chain': ['bsc', 'bnb'],
      'avalanche': ['avalanche', 'avax'],
      'base': ['base'],
      'zksync': ['zksync', 'zk'],
      'solana': ['solana', 'sol'],
      'aptos': ['aptos', 'apt'],
      'zircuit': ['zircuit'],
      'the_open_network': ['ton'],
      'sui': ['sui'],
      'near_protocol': ['near'],
      'fantom': ['fantom', 'ftm'],
      'cronos': ['cronos', 'cro']
    }

    const possibleNames = nameMatching[coinGeckoPlatformId] || [coinGeckoPlatformId]
    
    for (const name of possibleNames) {
      const match = supportedNetworks.find(network => 
        network.id === name || 
        network.attributes.name?.toLowerCase().includes(name.toLowerCase())
      )
      if (match) {
        console.log(`🔗 Name match: ${coinGeckoPlatformId} → ${match.id} (via "${name}")`)
        return match.id
      }
    }

    console.log(`❌ No match found for platform: ${coinGeckoPlatformId}`)
    return null
  }

  /**
   * Get token address from symbol
   */
  private async getTokenAddress(symbol: string): Promise<string | null> {
    try {
      // Search for token
      const response = await this.client.get<TokenAddressResponse>(
        `/search/tokens`,
        {
          params: {
            query: symbol,
            include: 'network',
            limit: 20
          }
        }
      )

      // Find token with matching symbol
      const token = response.data?.find(t => 
        t.attributes.symbol?.toLowerCase() === symbol.toLowerCase()
      )

      if (!token) {
        console.warn(`No token found for symbol: ${symbol}`)
        return null
      }

      const address = token.attributes.address
      const network = token.relationships.network.data.id

      console.log(`Found token address for ${symbol}: ${address} on ${network}`)
      return address
    } catch (error) {
      console.error('Error getting token address:', error)
      return null
    }
  }

  /**
   * Get comprehensive liquidity analysis for a stablecoin
   */
  async getLiquidityAnalysis(tokenAddress: string, symbol: string): Promise<LiquidityAnalysis | null> {
    try {
      // If no token address provided, try to get it from symbol
      if (!tokenAddress) {
        tokenAddress = await this.getTokenAddress(symbol) || ''
      }

      if (!tokenAddress) {
        console.warn(`No token address found for ${symbol}`)
        return null
      }

      console.log(`🔍 Getting pools for token ${symbol} (${tokenAddress})`)
      
      // 🚀 PARALLEL API CALLS: Get both CoinGecko data and supported networks simultaneously
      const [coinGeckoId, supportedNetworks] = await Promise.all([
        coinGeckoService.searchStablecoin(symbol),
        this.getSupportedNetworks()
      ])

      if (!coinGeckoId) {
        console.warn(`No CoinGecko ID found for ${symbol}`)
        return null
      }

      const tokenData = await coinGeckoService.getTokenData(coinGeckoId)
      if (!tokenData?.platforms) {
        console.warn(`No platform data found for ${symbol}`)
        return null
      }

      console.log(`📋 Found token addresses for ${symbol}:`, tokenData.platforms)
      console.log(`🌐 GeckoTerminal supports ${supportedNetworks.length} networks`)

      // 🧠 SMART CHAIN DISCOVERY: Match platforms to networks
      const allPools: Array<GeckoTerminalPool & { networkId: string }> = []
      const discoveredChains: string[] = []

      for (const [platform, address] of Object.entries(tokenData.platforms)) {
        if (!address) continue

        const networkId = this.matchPlatformToNetwork(platform, supportedNetworks)
        if (!networkId) {
          console.log(`⏭️ Skipping unsupported platform: ${platform}`)
          continue
        }

        discoveredChains.push(networkId)
        console.log(`🔍 Getting pools for ${symbol} on ${networkId} (${address})`)
        
        try {
          const response = await this.client.get<GeckoTerminalPoolsResponse>(
            `/networks/${networkId}/tokens/${address}/pools`,
            {
              params: {
                page: 1,
                limit: 100
              }
            }
          )

          if (response.data) {
            // Add networkId to each pool for tracking
            const poolsWithNetwork = response.data.map(pool => ({ ...pool, networkId }))
            allPools.push(...poolsWithNetwork)
            console.log(`✅ Found ${response.data.length} pools on ${networkId}`)
          }
        } catch (error) {
          console.warn(`❌ Failed to get pools for ${symbol} on ${networkId}:`, error)
        }
      }

      // Summary logging
      console.log(`🎯 Discovery Results for ${symbol}:`)
      console.log(`   • Platforms found: ${Object.keys(tokenData.platforms).length}`)
      console.log(`   • Networks matched: ${discoveredChains.length}`)
      console.log(`   • Total pools found: ${allPools.length}`)
      console.log(`   • Discovered chains: ${discoveredChains.join(', ')}`)

      // Debug logging
      console.log(`📊 Pool breakdown for ${symbol}:`)
      allPools.forEach(pool => {
        console.log(`   Chain: ${pool.networkId}, DEX: ${pool.relationships?.dex?.data?.id || 'unknown'}, Liquidity: $${parseFloat(pool.attributes.reserve_in_usd || '0').toLocaleString()}`)
      })

      if (allPools.length === 0) {
        // Try searching by symbol as fallback
        console.log(`🔄 No pools found by address, trying symbol search for ${symbol}`)
        const searchResponse = await this.client.get<GeckoTerminalPoolsResponse>(
          `/search/pools`,
          {
            params: {
              query: symbol,
              page: 1,
              limit: 100
            }
          }
        )

        const searchPools = searchResponse.data || []
        console.log(`🔍 Found ${searchPools.length} pools by symbol search`)

        if (searchPools.length > 0) {
          // Add default networkId for fallback search results
          const poolsWithNetwork = searchPools.map(pool => ({ ...pool, networkId: 'unknown' }))
          return this.analyzeLiquidityData(poolsWithNetwork)
        }

        console.warn(`❌ No pools found for ${symbol}`)
        return null
      }

      return this.analyzeLiquidityData(allPools)
    } catch (error) {
      console.error('GeckoTerminal liquidity analysis error:', error)
      return null
    }
  }

  /**
   * Analyze liquidity data from pools
   */
  private analyzeLiquidityData(pools: Array<GeckoTerminalPool & { networkId: string }>): LiquidityAnalysis {
    // Calculate total liquidity
    const totalLiquidity = pools.reduce((sum, pool) => {
      return sum + parseFloat(pool.attributes.reserve_in_usd || '0')
    }, 0)

    console.log(`Total liquidity: $${totalLiquidity.toLocaleString()}`)

    // Calculate DEX distribution
    const dexLiquidity: { [key: string]: { liquidity: number, chain: string } } = {}
    pools.forEach(pool => {
      const dex = pool.relationships?.dex?.data?.id || 'unknown'
      const liquidity = parseFloat(pool.attributes.reserve_in_usd || '0')
      const chain = pool.networkId // Use the networkId we tracked

      if (!dexLiquidity[dex]) {
        dexLiquidity[dex] = { liquidity: 0, chain }
      }
      dexLiquidity[dex].liquidity += liquidity
    })

    console.log('DEX liquidity:', dexLiquidity)

    const dexDistribution = Object.entries(dexLiquidity)
      .map(([dex, data]) => ({
        dex,
        liquidity: data.liquidity,
        percentage: (data.liquidity / totalLiquidity) * 100,
        chain: data.chain
      }))
      .sort((a, b) => b.liquidity - a.liquidity)

    console.log('DEX distribution:', dexDistribution)

    // Calculate chain distribution
    const chainLiquidity: { [key: string]: number } = {}
    pools.forEach(pool => {
      const chain = pool.networkId // Use the networkId we tracked
      const liquidity = parseFloat(pool.attributes.reserve_in_usd || '0')
      chainLiquidity[chain] = (chainLiquidity[chain] || 0) + liquidity
    })

    console.log('Chain liquidity:', chainLiquidity)

    const chainDistribution = Object.entries(chainLiquidity)
      .map(([chain, liquidity]) => ({
        chain,
        liquidity,
        percentage: (liquidity / totalLiquidity) * 100
      }))
      .sort((a, b) => b.liquidity - a.liquidity)

    console.log('Chain distribution:', chainDistribution)

    // Calculate concentration risk
    const maxDexPercentage = dexDistribution[0]?.percentage || 0
    const maxChainPercentage = chainDistribution[0]?.percentage || 0
    const maxConcentration = Math.max(maxDexPercentage, maxChainPercentage)

    console.log(`Max DEX percentage: ${maxDexPercentage}%`)
    console.log(`Max chain percentage: ${maxChainPercentage}%`)
    console.log(`Max concentration: ${maxConcentration}%`)

    let concentrationRisk: 'low' | 'medium' | 'high'
    if (maxConcentration < 33) {
      concentrationRisk = 'low'
    } else if (maxConcentration < 66) {
      concentrationRisk = 'medium'
    } else {
      concentrationRisk = 'high'
    }

    return {
      total_liquidity: Math.round(totalLiquidity),
      dex_distribution: dexDistribution,
      chain_distribution: chainDistribution,
      concentration_risk: concentrationRisk
    }
  }
}

export const geckoTerminalService = new GeckoTerminalService() 