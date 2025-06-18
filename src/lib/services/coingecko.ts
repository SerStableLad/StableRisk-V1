import { createApiClient } from './api-client'
import { config, endpoints } from '@/lib/config'
import { StablecoinInfo, PricePoint } from '@/lib/types'
import { getKnownGenesisDate } from './stablecoin-mapping-table'

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

      // Find exact match by symbol
      const coin = response.coins?.find((c: any) => 
        c.symbol?.toLowerCase() === ticker.toLowerCase()
      )

      if (!coin) {
        console.warn(`[CoinGecko] No exact match found for ${ticker}`)
        console.log(`[CoinGecko] Available coins:`, response.coins?.map((c: any) => ({ id: c.id, symbol: c.symbol })))
        return null
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
        // Include official links from CoinGecko
        official_links: {
          homepage: data.links?.homepage?.filter(url => url && url.trim() !== '') || [],
          twitter_screen_name: data.links?.twitter_screen_name || undefined,
          telegram_channel_identifier: data.links?.telegram_channel_identifier || undefined,
          github_repos: data.links?.repos_url?.github?.filter(url => 
            url && url.trim() !== ''
          ) || []
        }
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
   * Get token contract addresses
   */
  async getTokenData(coinId: string): Promise<{
    contract_address?: string
    platforms?: Record<string, string>
  } | null> {
    try {
      const data = await this.client.get<any>(
        `/coins/${coinId}`,
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

      // Get the first available contract address
      const platforms = data.platforms || {}
      const firstPlatform = Object.keys(platforms)[0]
      const contract_address = firstPlatform ? platforms[firstPlatform] : undefined

      return {
        contract_address,
        platforms
      }
    } catch (error) {
      console.error('CoinGecko token data error:', {
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
}

// Export singleton instance
export const coinGeckoService = new CoinGeckoService() 