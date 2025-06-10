import { ApiClient } from './api-client'
import { config } from '@/lib/config'
import { StablecoinInfo, PricePoint } from '@/lib/types'

// CoinMarketCap API response interfaces
interface CMCQuoteResponse {
  status: {
    error_code: number
    error_message: string | null
  }
  data: {
    [key: string]: {
      id: number
      name: string
      symbol: string
      slug: string
      is_active: number
      first_historical_data: string
      last_historical_data: string
      platform?: {
        id: number
        name: string
        symbol: string
        slug: string
        token_address: string
      }
      quote: {
        USD: {
          price: number
          volume_24h: number
          market_cap: number
          percent_change_1h: number
          percent_change_24h: number
          percent_change_7d: number
          last_updated: string
        }
      }
    }
  }
}

interface CMCHistoricalResponse {
  status: {
    error_code: number
    error_message: string | null
  }
  data: {
    quotes: Array<{
      timestamp: string
      quote: {
        USD: {
          price: number
          volume_24h: number
          market_cap: number
        }
      }
    }>
  }
}

interface CMCMapResponse {
  status: {
    error_code: number
    error_message: string | null
  }
  data: Array<{
    id: number
    name: string
    symbol: string
    slug: string
    is_active: number
    first_historical_data: string
    last_historical_data: string
    platform?: {
      id: number
      name: string
      symbol: string
      slug: string
      token_address: string
    }
  }>
}

class CoinMarketCapService {
  private apiClient = new ApiClient(config.coinmarketcap.baseUrl, {
    'X-CMC_PRO_API_KEY': config.coinmarketcap.apiKey,
    'Accept': 'application/json',
    'Accept-Encoding': 'deflate, gzip',
    'Content-Type': 'application/json',
    'User-Agent': 'StableRisk/1.0',
  })

  /**
   * Search for stablecoin by symbol
   */
  async searchStablecoin(symbol: string): Promise<number | null> {
    try {
      const response = await this.apiClient.get<CMCMapResponse>('/cryptocurrency/map', {
        params: {
          symbol: symbol.toUpperCase(),
          listing_status: 'active',
          start: 1,
          limit: 10,
        }
      })

      if (response.status.error_code !== 0) {
        throw new Error(response.status.error_message || 'CMC API error')
      }

      // Look for exact symbol match
      const coin = response.data.find((c: any) => c.symbol === symbol.toUpperCase())
      return coin ? coin.id : null
    } catch (error) {
      console.error('CMC search error:', error)
      return null
    }
  }

  /**
   * Get detailed stablecoin information
   */
  async getStablecoinInfo(coinId: number): Promise<StablecoinInfo | null> {
    try {
      const response = await this.apiClient.get<CMCQuoteResponse>('/cryptocurrency/quotes/latest', {
        params: {
          id: coinId,
          convert: 'USD',
        }
      })

      if (response.status.error_code !== 0) {
        throw new Error(response.status.error_message || 'CMC API error')
      }

      const coinData = response.data[coinId.toString()]
      if (!coinData) {
        return null
      }

              return {
          id: coinData.slug,
          symbol: coinData.symbol,
          name: coinData.name,
          image: '', // CMC doesn't provide image URLs in this endpoint
          current_price: coinData.quote.USD.price,
          market_cap: coinData.quote.USD.market_cap,
          genesis_date: coinData.first_historical_data,
          pegging_type: 'fiat-backed', // Default assumption, should be enhanced later
        }
    } catch (error) {
      console.error('CMC info error:', error)
      return null
    }
  }

  /**
   * Get price history for peg stability analysis
   */
  async getPriceHistory(coinId: number, days: number = 365): Promise<PricePoint[]> {
    try {
      // CMC historical endpoint requires specific time range
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - (days * 24 * 60 * 60 * 1000))
      
      const response = await this.apiClient.request<CMCHistoricalResponse>('/cryptocurrency/quotes/historical', {
        params: {
          id: coinId,
          time_start: startTime.toISOString(),
          time_end: endTime.toISOString(),
          interval: 'daily',
          convert: 'USD',
          count: days,
        }
      })

      if (response.data.status.error_code !== 0) {
        throw new Error(response.data.status.error_message || 'CMC API error')
      }

      return response.data.data.quotes.map(quote => {
        const price = quote.quote.USD.price
        const deviation = Math.abs(price - 1.0) // Deviation from $1 peg
        
        return {
          timestamp: new Date(quote.timestamp).getTime(),
          price: price,
          deviation_percent: (deviation / 1.0) * 100,
        }
      })
    } catch (error) {
      console.error('CMC price history error:', error)
      return []
    }
  }

  /**
   * Check if service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.apiClient.request<any>('/key/info')
      return response.data.status?.error_code === 0
    } catch (error) {
      console.error('CMC health check failed:', error)
      return false
    }
  }
}

export const coinMarketCapService = new CoinMarketCapService() 