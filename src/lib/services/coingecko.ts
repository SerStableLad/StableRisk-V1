import { createApiClient } from './api-client'
import { config, endpoints } from '@/lib/config'
import { StablecoinInfo, PricePoint } from '@/lib/types'
import { getKnownGenesisDate } from './stablecoin-mapping-utils'

// CoinGecko API response interfaces
interface CoinGeckoApiResponse {
  id: string
  symbol: string
  name: string
  image: {
    thumb: string
    small: string
    large: string
  }
  market_data: {
    current_price: {
      usd: number
    }
    market_cap: {
      usd: number
    }
    total_volume: {
      usd: number
    }
    price_change_24h: number
    price_change_percentage_24h: number
  }
  genesis_date: string
  description: {
    en: string
  }
  categories: string[] // CoinGecko categories (e.g., ["usd-stablecoin"])
  links: {
    homepage: string[]
    blockchain_site: string[]
    official_forum_url: string[]
    chat_url: string[]
    announcement_url: string[]
    twitter_screen_name: string
    facebook_username: string
    telegram_channel_identifier: string
    repos_url: {
      github: string[]
      bitbucket: string[]
    }
  }
  // Phase 1 optimization: Include platform data in response
  platforms?: Record<string, string>
  contract_address?: string
}

interface CoinGeckoHistoryResponse {
  market_data: {
    current_price: {
      usd: number
    }
  }
}

interface CoinGeckoChartResponse {
  prices: [number, number][] // [timestamp, price]
  market_caps: [number, number][]
  total_volumes: [number, number][]
}

interface CoinGeckoSimplePriceResponse {
  [coinId: string]: {
    usd: number
    usd_24h_change?: number
  }
}

interface CoinGeckoTickersResponse {
  name: string
  tickers: Array<{
    base: string
    target: string
    market: {
      name: string
      identifier: string
      has_trading_incentive: boolean
    }
    last: number
    volume: number
    converted_last: {
      btc: number
      eth: number
      usd: number
    }
    converted_volume: {
      btc: number
      eth: number
      usd: number
    }
    trust_score: string
    bid_ask_spread_percentage: number
    timestamp: string
    last_traded_at: string
    last_fetch_at: string
    is_anomaly: boolean
    is_stale: boolean
    trade_url: string
    token_info_url: string | null
    coin_id: string
    target_coin_id: string
  }>
}

interface ExchangeVolumeData {
  totalCexVolume: number
  totalDexVolume: number
  cexPercentage: number
  dexPercentage: number
  topCexExchanges: Array<{
    name: string
    volume: number
    percentage: number
  }>
  topDexExchanges: Array<{
    name: string
    volume: number
    percentage: number
  }>
}

export class CoinGeckoService {
  private client: ReturnType<typeof createApiClient>

  constructor() {
    // For CoinGecko free tier, don't use API key
    this.client = createApiClient(
      config.coingecko.baseUrl
      // Removed API key for free tier
    )
  }

  /**
   * Search for stablecoin by ticker
   */
  async searchStablecoin(ticker: string): Promise<string | null> {
    try {
      console.log(`[CoinGecko] Searching for ticker: ${ticker}`)
      console.log(`[CoinGecko] API client base URL: ${this.client}`)
      
      const response = await this.client.get<any>(
        '/search',
        {
          params: {
            query: ticker
          }
        }
      )

      console.log(`[CoinGecko] Search response status: Success`)
      console.log(`[CoinGecko] Found ${response.coins?.length || 0} coins`)

      // Find exact matches by symbol
      const matchingCoins = response.coins?.filter((c: any) => 
        c.symbol?.toLowerCase() === ticker.toLowerCase()
      ) || []

      if (matchingCoins.length === 0) {
        console.warn(`[CoinGecko] No exact match found for ${ticker}`)
        console.log(`[CoinGecko] Available coins:`, response.coins?.map((c: any) => ({ id: c.id, symbol: c.symbol })))
        return null
      }

      // If multiple matches, prioritize by market cap rank (lower rank = higher market cap)
      let coin = matchingCoins[0]
      if (matchingCoins.length > 1) {
        console.log(`[CoinGecko] Found ${matchingCoins.length} matches for ${ticker}:`, 
          matchingCoins.map((c: any) => ({ id: c.id, name: c.name, rank: c.market_cap_rank })))
        
        // Sort by market cap rank (nulls go to end)
        coin = matchingCoins.sort((a: any, b: any) => {
          if (a.market_cap_rank === null) return 1
          if (b.market_cap_rank === null) return -1
          return a.market_cap_rank - b.market_cap_rank
        })[0]
        
        console.log(`[CoinGecko] Selected highest ranked match: ${coin.id} (rank: ${coin.market_cap_rank})`)
      }

      console.log(`[CoinGecko] Found CoinGecko ID for ${ticker}: ${coin.id}`)
      return coin.id
    } catch (error) {
      console.error(`[CoinGecko] Search error for ${ticker}:`, error)
      console.error(`[CoinGecko] Error details:`, {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      return null
    }
  }

  /**
   * Get basic stablecoin information
   */
  async getStablecoinInfo(coinId: string): Promise<StablecoinInfo | null> {
    try {
      const data = await this.client.get<CoinGeckoApiResponse>(
        endpoints.coingecko.coinData(coinId),
        {
          params: {
            localization: 'false',
            tickers: 'false',
            market_data: 'true',
            community_data: 'false',
            developer_data: 'false',
            sparkline: 'false'
          }
        }
      )

      // Determine pegging type based on symbol and description
      const pegType = this.determinePeggingType(data.symbol, data.description?.en || '')

      // Extract blockchain platforms from the platforms field
      const blockchains = this.extractBlockchainPlatforms(data as any)

      // Get genesis date from mapping table first, then fall back to API data
      const mappingGenesisDate = getKnownGenesisDate(data.symbol)
      const genesisDate = mappingGenesisDate || data.genesis_date || 'Unknown'

      return {
        id: data.id,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        image: data.image.large,
        current_price: data.market_data.current_price.usd,
        market_cap: data.market_data.market_cap.usd,
        genesis_date: genesisDate,
        blockchain: blockchains,
        pegging_type: pegType,
        categories: data.categories || [], // Include CoinGecko categories for validation
        // Include official links from CoinGecko
        official_links: {
          homepage: data.links?.homepage?.filter(url => url && url.trim() !== '') || [],
          twitter_screen_name: data.links?.twitter_screen_name || undefined,
          telegram_channel_identifier: data.links?.telegram_channel_identifier || undefined,
          github_repos: data.links?.repos_url?.github?.filter(url => 
            url && url.trim() !== ''
          ) || []
        },
        // Phase 1 optimization: Include platform data to eliminate redundant API calls
        platforms: data.platforms || {},
        contract_address: data.contract_address || (data.platforms?.ethereum ? data.platforms.ethereum : undefined)
      }
    } catch (error) {
      console.error('CoinGecko coin info error:', {
        coinId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        errorType: typeof error,
        errorString: String(error)
      })
      return null
    }
  }

  /**
   * Get price history for peg stability analysis
   */
  async getPriceHistory(coinId: string, days: number = 365): Promise<PricePoint[]> {
    try {
      const data = await this.client.get<CoinGeckoChartResponse>(
        endpoints.coingecko.coinMarketChart(coinId),
        {
          params: {
            vs_currency: 'usd',
            days: days.toString(),
            interval: 'daily'
          }
        }
      )

      return data.prices.map(([timestamp, price]) => ({
        timestamp,
        price,
        deviation_percent: ((price - 1) / 1) * 100, // Deviation from $1 peg
      }))
    } catch (error) {
      console.error('CoinGecko price history error:', {
        coinId,
        days,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message
        } : error,
        errorString: String(error)
      })
      return []
    }
  }

  /**
   * Get current price with fallback
   */
  async getCurrentPrice(coinId: string): Promise<number | null> {
    try {
      const data = await this.client.get<CoinGeckoSimplePriceResponse>(
        endpoints.coingecko.simplePrices,
        {
          params: {
            ids: coinId,
            vs_currencies: 'usd',
            include_24hr_change: 'true'
          }
        }
      )

      return data[coinId]?.usd || null
    } catch (error) {
      console.error('CoinGecko current price error:', {
        coinId,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message
        } : error,
        errorString: String(error)
      })
      return null
    }
  }

  /**
   * Get historical price for a specific date
   */
  async getHistoricalPrice(coinId: string, date: string): Promise<number | null> {
    try {
      const data = await this.client.get<CoinGeckoHistoryResponse>(
        endpoints.coingecko.coinHistory(coinId),
        {
          params: {
            date,
            localization: 'false'
          }
        }
      )

      return data.market_data.current_price.usd
    } catch (error) {
      console.error('CoinGecko historical price error:', {
        coinId,
        date,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message
        } : error,
        errorString: String(error)
      })
      return null
    }
  }

    /**
   * Extract blockchain platforms from CoinGecko data
   */
  private extractBlockchainPlatforms(data: any): string {
    try {
      // Get platforms data from CoinGecko response
      const platforms = data.platforms || {}
      const categories = data.categories || []
      
      // Map CoinGecko platform IDs to readable blockchain names
      const platformMap: Record<string, string> = {
        'ethereum': 'Ethereum',
        'binance-smart-chain': 'BNB Smart Chain',
        'polygon-pos': 'Polygon',
        'avalanche': 'Avalanche',
        'solana': 'Solana',
        'tron': 'Tron',
        'arbitrum-one': 'Arbitrum',
        'optimistic-ethereum': 'Optimism',
        'fantom': 'Fantom',
        'harmony-shard-0': 'Harmony',
        'klay-token': 'Klaytn',
        'near-protocol': 'NEAR Protocol',
        'celo': 'Celo',
        'the-open-network': 'TON',
        'kava': 'Kava',
        'aptos': 'Aptos',
        'sui': 'Sui',
        'cardano': 'Cardano',
        'algorand': 'Algorand',
        'stellar': 'Stellar',
        'cosmos': 'Cosmos',
        'osmosis': 'Osmosis',
        'terra': 'Terra',
        'terra-2': 'Terra 2.0',
        'cronos': 'Cronos',
        'moonbeam': 'Moonbeam',
        'moonriver': 'Moonriver',
        'aurora': 'Aurora',
        'xdai': 'Gnosis Chain',
        'huobi-token': 'HECO',
        'okex-chain': 'OKC'
      }
      
      // Extract blockchain names from platforms
      const blockchainNames: string[] = []
      
      for (const [platformId, contractAddress] of Object.entries(platforms)) {
        if (platformId && contractAddress && platformId !== '') {
          const readableName = platformMap[platformId] || this.formatPlatformName(platformId)
          if (readableName && !blockchainNames.includes(readableName)) {
            blockchainNames.push(readableName)
          }
        }
      }
      
      // If no platforms found, try to infer from categories or asset_platform_id
      if (blockchainNames.length === 0) {
        if (data.asset_platform_id) {
          const readableName = platformMap[data.asset_platform_id] || this.formatPlatformName(data.asset_platform_id)
          if (readableName) {
            blockchainNames.push(readableName)
          }
        }
        
        // Try to infer from categories
        for (const category of categories) {
          if (category.includes('Ecosystem')) {
            const ecosystemName = category.replace(' Ecosystem', '')
            if (!blockchainNames.includes(ecosystemName)) {
              blockchainNames.push(ecosystemName)
            }
          }
        }
      }
      
      // If still no blockchains found, check if it's a native token
      if (blockchainNames.length === 0) {
        // For tokens like USDN that might be native to a specific chain
        if (data.links?.blockchain_site?.[0]) {
          const url = data.links.blockchain_site[0]
          if (url.includes('mintscan.io/noble')) {
            blockchainNames.push('Noble')
          } else if (url.includes('etherscan.io')) {
            blockchainNames.push('Ethereum')
          } else if (url.includes('bscscan.com')) {
            blockchainNames.push('BNB Smart Chain')
          } else if (url.includes('polygonscan.com')) {
            blockchainNames.push('Polygon')
          }
          // Add more blockchain detection patterns as needed
        }
      }
      
      // Return formatted string
      if (blockchainNames.length === 0) {
        return 'Unknown'
      } else if (blockchainNames.length === 1) {
        return blockchainNames[0]
      } else {
        return blockchainNames.join(', ')
      }
      
    } catch (error) {
      console.error('Error extracting blockchain platforms:', {
        data: data ? { id: data.id, symbol: data.symbol } : 'No data',
        error: error instanceof Error ? {
          name: error.name,
          message: error.message
        } : error,
        errorString: String(error)
      })
      return 'Unknown'
    }
  }

  /**
   * Format platform name for display
   */
  private formatPlatformName(platformId: string): string {
    return platformId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /**
   * Determine pegging type based on coin data
   */
  private determinePeggingType(
    symbol: string,
    description: string
  ): StablecoinInfo['pegging_type'] {
    const desc = description.toLowerCase()
    const sym = symbol.toLowerCase()

    // Algorithmic stablecoins
    if (desc.includes('algorithmic') || desc.includes('elastic') || desc.includes('seigniorage')) {
      return 'algorithmic'
    }

    // Crypto-collateralized
    if (desc.includes('collateral') && (desc.includes('eth') || desc.includes('crypto'))) {
      return 'crypto-collateralized'
    }

    // Commodity-backed (gold, silver, etc.)
    if (desc.includes('gold') || desc.includes('silver') || desc.includes('commodity')) {
      return 'commodity-backed'
    }

    // Default to fiat-backed for most stablecoins (USDT, USDC, etc.)
    return 'fiat-backed'
  }

  /**
   * Get token data including platforms/contracts
   */
  async getTokenData(coinId: string): Promise<{
    contract_address?: string
    platforms?: Record<string, string>
  } | null> {
    try {
      const data = await this.client.get<any>(
        endpoints.coingecko.coinData(coinId),
        {
          params: {
            localization: 'false',
            tickers: 'false',
            market_data: 'false',
            community_data: 'false',
            developer_data: 'false',
            sparkline: 'false'
          }
        }
      )

      return {
        contract_address: data.contract_address,
        platforms: data.platforms || {}
      }
    } catch (error) {
      console.error('CoinGecko token data error:', error)
      return null
    }
  }

  /**
   * Get exchange tickers data to analyze CEX vs DEX volume distribution
   */
  async getExchangeTickers(coinId: string): Promise<ExchangeVolumeData | null> {
    try {
      console.log(`[CoinGecko] Fetching tickers for ${coinId}`)
      
      const data = await this.client.get<CoinGeckoTickersResponse>(
        `/coins/${coinId}/tickers`,
        {
          params: {
            include_exchange_logo: 'false',
            page: 1,
            order: 'volume_desc'
          }
        }
      )

      console.log(`[CoinGecko] Found ${data.tickers?.length || 0} trading pairs`)

      if (!data.tickers || data.tickers.length === 0) {
        return null
      }

      // Known DEX identifiers - exchanges that are decentralized
      const dexIdentifiers = new Set([
        'uniswap-v2', 'uniswap-v3', 'sushiswap', 'pancakeswap-v2', 'pancakeswap-v3',
        'curve', 'balancer', 'orca', 'raydium', 'jupiter', 'dydx',
        'trader-joe', 'quickswap', 'spookyswap', 'spiritswap', 'honeyswap',
        'bancor', 'kyber', 'mooniswap', 'dodo', 'mdex', 'biswap',
        'apeswap', 'bakeryswap', 'camelot', 'ramses', 'velodrome',
        'aerodrome', 'solidly', 'thena', 'alienbase', 'baseswap'
      ])

      let totalCexVolume = 0
      let totalDexVolume = 0
      const cexExchanges = new Map<string, number>()
      const dexExchanges = new Map<string, number>()

      // Process each ticker to categorize and sum volumes
      for (const ticker of data.tickers) {
        // Skip anomalous or stale data
        if (ticker.is_anomaly || ticker.is_stale) {
          continue
        }

        const volume = ticker.converted_volume?.usd || 0
        const exchangeName = ticker.market.name
        const exchangeId = ticker.market.identifier

        // Determine if this is a DEX or CEX
        const isDex = dexIdentifiers.has(exchangeId.toLowerCase()) || 
                      exchangeName.toLowerCase().includes('uniswap') ||
                      exchangeName.toLowerCase().includes('pancakeswap') ||
                      exchangeName.toLowerCase().includes('curve') ||
                      exchangeName.toLowerCase().includes('sushiswap')

        if (isDex) {
          totalDexVolume += volume
          dexExchanges.set(exchangeName, (dexExchanges.get(exchangeName) || 0) + volume)
        } else {
          totalCexVolume += volume
          cexExchanges.set(exchangeName, (cexExchanges.get(exchangeName) || 0) + volume)
        }
      }

      const totalVolume = totalCexVolume + totalDexVolume

      if (totalVolume === 0) {
        return null
      }

      // Calculate percentages
      const cexPercentage = (totalCexVolume / totalVolume) * 100
      const dexPercentage = (totalDexVolume / totalVolume) * 100

      // Get top exchanges
      const topCexExchanges = Array.from(cexExchanges.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, volume]) => ({
          name,
          volume,
          percentage: (volume / totalVolume) * 100
        }))

      const topDexExchanges = Array.from(dexExchanges.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, volume]) => ({
          name,
          volume,
          percentage: (volume / totalVolume) * 100
        }))

      console.log(`[CoinGecko] Volume distribution - CEX: ${cexPercentage.toFixed(1)}%, DEX: ${dexPercentage.toFixed(1)}%`)

      return {
        totalCexVolume,
        totalDexVolume,
        cexPercentage,
        dexPercentage,
        topCexExchanges,
        topDexExchanges
      }

    } catch (error) {
      console.error(`[CoinGecko] Exchange tickers error for ${coinId}:`, error)
      return null
    }
  }
}

// Export singleton instance
export const coinGeckoService = new CoinGeckoService() 