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

interface GeckoTerminalOHLCVResponse {
  data: {
    attributes: {
      ohlcv_list: Array<[number, number, number, number, number, number]> // [timestamp, open, high, low, close, volume]
    }
  }
}

interface TVLHistoryData {
  timestamp: number
  date: string
  tvl: number
  chain: string
}

interface ChainTVLHistory {
  chain: string
  data: TVLHistoryData[]
  color: string
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
   * Phase 1 optimization: Accept platform data to avoid redundant API calls
   */
  async getLiquidityAnalysis(
    tokenAddress: string, 
    symbol: string, 
    platformData?: Record<string, string>
  ): Promise<LiquidityAnalysis | null> {
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
      
      // Phase 1 optimization: Use provided platform data or fall back to API calls
      let platforms: Record<string, string>
      let supportedNetworks: GeckoTerminalNetwork[]
      
      if (platformData && Object.keys(platformData).length > 0) {
        // Use provided platform data (no redundant API calls)
        console.log(`✅ Using provided platform data for ${symbol}`)
        platforms = platformData
        supportedNetworks = await this.getSupportedNetworks()
      } else {
        // Fallback: Get data via API calls (for backward compatibility)
        console.log(`⚠️ No platform data provided, falling back to API calls for ${symbol}`)
        const [coinGeckoId, networks] = await Promise.all([
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
        
        platforms = tokenData.platforms
        supportedNetworks = networks
      }

      console.log(`📋 Found token addresses for ${symbol}:`, platforms)
      console.log(`🌐 GeckoTerminal supports ${supportedNetworks.length} networks`)

      // 🧠 SMART CHAIN DISCOVERY: Match platforms to networks
      const allPools: Array<GeckoTerminalPool & { networkId: string }> = []
      const discoveredChains: string[] = []

      // Phase 2 optimization: Prepare all platform-network mappings first
      const validPlatforms: Array<{ platform: string; address: string; networkId: string }> = []
      
      for (const [platform, address] of Object.entries(platforms)) {
        if (!address) continue

        const networkId = this.matchPlatformToNetwork(platform, supportedNetworks)
        if (!networkId) {
          console.log(`⏭️ Skipping unsupported platform: ${platform}`)
          continue
        }

        validPlatforms.push({ platform, address, networkId })
        discoveredChains.push(networkId)
      }

      console.log(`🚀 Phase 2: Fetching pools from ${validPlatforms.length} networks in parallel`)

      // Phase 2 optimization: Fetch all pools in parallel instead of sequential
      const poolPromises = validPlatforms.map(async ({ platform, address, networkId }) => {
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
            console.log(`✅ Found ${response.data.length} pools on ${networkId}`)
            return poolsWithNetwork
          }
          return []
        } catch (error) {
          console.warn(`❌ Failed to get pools for ${symbol} on ${networkId}:`, error)
          return []
        }
      })

      // Wait for all pool requests to complete
      const poolResults = await Promise.all(poolPromises)
      
      // Flatten results into single array
      poolResults.forEach(pools => {
        allPools.push(...pools)
      })

      // Summary logging
      console.log(`🎯 Discovery Results for ${symbol}:`)
      console.log(`   • Platforms found: ${Object.keys(platforms).length}`)
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

  /**
   * Get historical TVL data by blockchain for charting
   * For now, we'll generate mock historical data based on current TVL
   * TODO: Implement real historical data when GeckoTerminal historical API is available
   */
  async getHistoricalTVLByChain(
    tokenAddress: string, 
    symbol: string, 
    timeframe: '1h' | '4h' | '1d' | '1w' = '1d',
    days: 7 | 30 | 90 = 30
  ): Promise<ChainTVLHistory[]> {
    try {
      console.log(`📈 Generating ${days}d historical TVL data for ${symbol}...`)
      
      // First get current liquidity analysis to know which chains have TVL
      const currentAnalysis = await this.getLiquidityAnalysis(tokenAddress, symbol)
      if (!currentAnalysis || !currentAnalysis.chain_distribution.length) {
        console.warn('No current liquidity data found for historical analysis')
        return []
      }

      // Generate mock historical data for each chain with significant TVL
      const chainHistories: ChainTVLHistory[] = []
      const significantChains = currentAnalysis.chain_distribution.filter(chain => chain.percentage > 1) // Only chains with >1% TVL

      for (const chainData of significantChains) {
        const historicalData: TVLHistoryData[] = []
        const currentTVL = chainData.liquidity

        // Generate data points for the specified time period
        const dataPoints = Math.min(days, 30) // Limit to 30 data points max
        const timeInterval = (days * 24 * 60 * 60) / dataPoints // seconds between points

        for (let i = 0; i < dataPoints; i++) {
          const timestamp = Math.floor(Date.now() / 1000) - ((dataPoints - 1 - i) * timeInterval)
          
          // Generate realistic variation around current TVL (±20% variation)
          const variation = 0.8 + (Math.random() * 0.4) // 0.8 to 1.2 multiplier
          const historicalTVL = Math.round(currentTVL * variation)
          
          historicalData.push({
            timestamp,
            date: new Date(timestamp * 1000).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric' 
            }),
            tvl: historicalTVL,
            chain: chainData.chain
          })
        }

        chainHistories.push({
          chain: chainData.chain,
          data: historicalData,
          color: this.getChainColor(chainData.chain)
        })
      }

      console.log(`✅ Generated historical TVL data for ${chainHistories.length} chains`)
      return chainHistories

    } catch (error) {
      console.error('Failed to generate historical TVL data:', error)
      return []
    }
  }

  /**
   * Get OHLCV data for a specific pool
   */
  private async getPoolOHLCV(
    poolId: string,
    timeframe: string,
    startTime: number,
    endTime: number
  ): Promise<Array<{ timestamp: number; tvl: number }>> {
    try {
      const response = await this.client.get<GeckoTerminalOHLCVResponse>(
        `/networks/eth/pools/${poolId}/ohlcv/${timeframe}`,
        {
          params: {
            aggregate: 1,
            before_timestamp: endTime,
            limit: 1000,
            currency: 'usd'
          }
        }
      )

      if (!response.data?.attributes?.ohlcv_list) {
        return []
      }

      // Convert OHLCV data to TVL points
      // Using volume as a proxy for TVL (in practice, you might want to use different logic)
      return response.data.attributes.ohlcv_list
        .filter(([timestamp]) => timestamp >= startTime && timestamp <= endTime)
        .map(([timestamp, open, high, low, close, volume]) => ({
          timestamp,
          tvl: volume // Using volume as TVL proxy - could be enhanced
        }))
        .sort((a, b) => a.timestamp - b.timestamp)

    } catch (error) {
      console.warn(`Failed to get OHLCV data for pool ${poolId}:`, error)
      return []
    }
  }

  /**
   * Get pools for a specific token and chain
   */
  private async getPoolsForToken(
    tokenAddress: string,
    symbol: string,
    targetChain: string
  ): Promise<GeckoTerminalPool[]> {
    try {
      // This is a simplified version - you might need to implement proper token/pool discovery
      // For now, return empty array as we'll use the existing pool data
      return []
    } catch (error) {
      console.warn(`Failed to get pools for ${symbol} on ${targetChain}:`, error)
      return []
    }
  }

  /**
   * Extract pool ID from pool data
   */
  private extractPoolId(pool: GeckoTerminalPool): string | null {
    // Implementation depends on pool data structure
    // This is a placeholder - you'll need to implement based on actual data
    return null
  }

  /**
   * Get consistent color for blockchain
   */
  private getChainColor(chain: string): string {
    const colors: { [key: string]: string } = {
      'ethereum': '#627EEA',
      'eth': '#627EEA',
      'polygon': '#8247E5',
      'bsc': '#F3BA2F',
      'binance-smart-chain': '#F3BA2F',
      'arbitrum': '#28A0F0',
      'optimism': '#FF0420',
      'avalanche': '#E84142',
      'fantom': '#1969FF',
      'solana': '#9945FF',
      'base': '#0052FF',
      'zksync': '#8C8DFC'
    }
    return colors[chain.toLowerCase()] || '#64748B'
  }
}

export const geckoTerminalService = new GeckoTerminalService() 