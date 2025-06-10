import { createApiClient } from './api-client'
import { config, endpoints } from '@/lib/config'
import { StablecoinInfo, PricePoint } from '@/lib/types'

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
    this.client = createApiClient(
      config.coingecko.baseUrl,
      config.coingecko.apiKey,
      'x-cg-demo-api-key'
    )
  }

  /**
   * Search for stablecoin by ticker
   */
  async searchStablecoin(ticker: string): Promise<string | null> {
    try {
      console.log(`Searching CoinGecko for ticker: ${ticker}`)
      const response = await this.client.get<any>(
        '/search',
        {
          params: {
            query: ticker
          }
        }
      )

      console.log('CoinGecko search response:', response)

      // Find exact match by symbol
      const coin = response.coins?.find((c: any) => 
        c.symbol?.toLowerCase() === ticker.toLowerCase()
      )

      if (!coin) {
        console.warn(`No exact match found for ${ticker}`)
        return null
      }

      console.log(`Found CoinGecko ID for ${ticker}: ${coin.id}`)
      return coin.id
    } catch (error) {
      console.error('CoinGecko search error:', error)
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

      return {
        id: data.id,
        symbol: data.symbol.toUpperCase(),
        name: data.name,
        image: data.image.large,
        current_price: data.market_data.current_price.usd,
        market_cap: data.market_data.market_cap.usd,
        genesis_date: data.genesis_date || 'Unknown',
        blockchain: data.links?.blockchain_site?.[0] || 'Unknown',
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
      console.error('CoinGecko coin info error:', error)
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
      console.error('CoinGecko price history error:', error)
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
      console.error('CoinGecko current price error:', error)
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
      console.error('CoinGecko historical price error:', error)
      return null
    }
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
      console.error('CoinGecko token data error:', error)
      return null
    }
  }
}

// Export singleton instance
export const coinGeckoService = new CoinGeckoService() 