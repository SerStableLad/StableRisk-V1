import { config } from '@/lib/config'

export interface SummaryStablecoinData {
  id: string
  symbol: string
  name: string
  current_price: number
  market_cap: number
  market_cap_rank: number
  price_change_24h: number
  price_change_percentage_24h: number
  last_updated: string
  // Basic categorization
  categories?: string[]
  // Minimal additional data
  total_supply?: number
  circulating_supply?: number
}

export interface PriceSummary {
  current_price: number
  price_change_24h: number
  price_change_percentage_24h: number
  price_change_percentage_7d: number
  last_updated: string
}

class SummaryApiClient {
  private baseUrl = config.coingecko.baseUrl

  /**
   * Get basic price data using the simple/price endpoint (fastest)
   */
  async getSimplePrice(coinId: string): Promise<PriceSummary | null> {
    try {
      const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_7d_change=true&include_last_updated_at=true`
      
      console.log(`🚀 Fetching simple price for ${coinId}`)
      const response = await fetch(url, {
        headers: config.coingecko.apiKey ? {
          'X-CG-Demo-API-Key': config.coingecko.apiKey
        } : {}
      })

      if (!response.ok) {
        console.error(`CoinGecko simple price API error: ${response.status}`)
        return null
      }

      const data = await response.json()
      const coinData = data[coinId]

      if (!coinData) {
        console.log(`No price data found for ${coinId}`)
        return null
      }

      return {
        current_price: coinData.usd,
        price_change_24h: coinData.usd_24h_change || 0,
        price_change_percentage_24h: coinData.usd_24h_change || 0,
        price_change_percentage_7d: coinData.usd_7d_change || 0,
        last_updated: new Date(coinData.last_updated_at * 1000).toISOString()
      }
    } catch (error) {
      console.error('Error fetching simple price:', error)
      return null
    }
  }

  /**
   * Get summary data for multiple coins at once
   */
  async getMultipleSimplePrices(coinIds: string[]): Promise<Record<string, PriceSummary> | null> {
    try {
      const url = `${this.baseUrl}/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true&include_7d_change=true&include_last_updated_at=true`
      
      console.log(`🚀 Fetching simple prices for ${coinIds.length} coins`)
      const response = await fetch(url, {
        headers: config.coingecko.apiKey ? {
          'X-CG-Demo-API-Key': config.coingecko.apiKey
        } : {}
      })

      if (!response.ok) {
        console.error(`CoinGecko simple price API error: ${response.status}`)
        return null
      }

      const data = await response.json()
      const result: Record<string, PriceSummary> = {}

      for (const coinId of coinIds) {
        const coinData = data[coinId]
        if (coinData) {
          result[coinId] = {
            current_price: coinData.usd,
            price_change_24h: coinData.usd_24h_change || 0,
            price_change_percentage_24h: coinData.usd_24h_change_percentage || 0,
            price_change_percentage_7d: coinData.usd_7d_change || 0,
            last_updated: new Date(coinData.last_updated_at * 1000).toISOString()
          }
        }
      }

      return result
    } catch (error) {
      console.error('Error fetching multiple simple prices:', error)
      return null
    }
  }

  /**
   * Get basic coin info using direct coins/{id} endpoint (optimized for performance)
   */
  async getBasicCoinInfo(coinId: string): Promise<SummaryStablecoinData | null> {
    try {
      // 🚀 OPTIMIZED: Use direct /coins/{id} endpoint with minimal parameters
      // This replaces the inefficient approach of fetching the entire coins list
      const url = new URL(`${this.baseUrl}/coins/${coinId}`)
      url.searchParams.set('localization', 'false')
      url.searchParams.set('tickers', 'false') 
      url.searchParams.set('market_data', 'true')
      url.searchParams.set('community_data', 'false')
      url.searchParams.set('developer_data', 'false')
      url.searchParams.set('sparkline', 'false')

      const response = await fetch(url.toString(), {
        headers: config.coingecko.apiKey ? {
          'X-CG-Demo-API-Key': config.coingecko.apiKey
        } : {},
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })

      if (!response.ok) {
        console.error(`CoinGecko coins/{id} API error: ${response.status}`)
        return null
      }

      const coinData = await response.json()

      if (!coinData || !coinData.market_data) {
        console.log(`No market data found for ${coinId}`)
        return null
      }

      return {
        id: coinData.id,
        symbol: coinData.symbol,
        name: coinData.name,
        current_price: coinData.market_data.current_price?.usd || 0,
        market_cap: coinData.market_data.market_cap?.usd || 0, // ✅ Now gets real market cap
        market_cap_rank: coinData.market_data.market_cap_rank || 0, // ✅ Now gets real rank
        price_change_24h: coinData.market_data.price_change_24h || 0,
        price_change_percentage_24h: coinData.market_data.price_change_percentage_24h || 0,
        last_updated: coinData.last_updated || new Date().toISOString()
      }
    } catch (error) {
      console.error('Error fetching basic coin info:', error)
      return null
    }
  }

  /**
   * Check if price indicates potential stablecoin (quick validation)
   */
  isPriceStablecoinLike(price: number): boolean {
    return price >= 0.50 && price <= 1.50
  }

  /**
   * Check if price shows significant deviation (anomaly detection)
   */
  hasPriceAnomaly(priceData: PriceSummary, threshold: number = 5): boolean {
    const change24h = Math.abs(priceData.price_change_percentage_24h)
    const change7d = Math.abs(priceData.price_change_percentage_7d || 0)
    
    return change24h > threshold || change7d > threshold
  }

  /**
   * Determine if we need detailed analysis based on summary data
   */
  needsDetailedAnalysis(summaryData: SummaryStablecoinData): {
    needsDetailed: boolean
    reasons: string[]
  } {
    const reasons: string[] = []
    
    // Check price stability
    if (!this.isPriceStablecoinLike(summaryData.current_price)) {
      reasons.push('Price outside stablecoin range')
    }
    
    // Check for significant price changes
    if (Math.abs(summaryData.price_change_percentage_24h) > 2) {
      reasons.push('Significant 24h price change')
    }
    
    // Check market cap (if available)
    if (summaryData.market_cap && summaryData.market_cap < 10_000_000) {
      reasons.push('Low market cap requires detailed analysis')
    }

    return {
      needsDetailed: reasons.length > 0,
      reasons
    }
  }

  /**
   * Get market data summary for multiple stablecoins
   */
  async getStablecoinMarketSummary(coinIds: string[]): Promise<{
    summary: Record<string, SummaryStablecoinData>
    anomalies: string[]
    needsDetailedAnalysis: string[]
  }> {
    try {
      const priceData = await this.getMultipleSimplePrices(coinIds)
      if (!priceData) {
        throw new Error('Failed to fetch market summary')
      }

      const summary: Record<string, SummaryStablecoinData> = {}
      const anomalies: string[] = []
      const needsDetailedAnalysis: string[] = []

      for (const coinId of coinIds) {
        const price = priceData[coinId]
        if (price) {
          const summaryData: SummaryStablecoinData = {
            id: coinId,
            symbol: coinId, // Placeholder
            name: coinId, // Placeholder
            current_price: price.current_price,
            market_cap: 0,
            market_cap_rank: 0,
            price_change_24h: price.price_change_24h,
            price_change_percentage_24h: price.price_change_percentage_24h,
            last_updated: price.last_updated
          }

          summary[coinId] = summaryData

          // Check for anomalies
          if (this.hasPriceAnomaly(price)) {
            anomalies.push(coinId)
          }

          // Check if needs detailed analysis
          const analysis = this.needsDetailedAnalysis(summaryData)
          if (analysis.needsDetailed) {
            needsDetailedAnalysis.push(coinId)
          }
        }
      }

      return {
        summary,
        anomalies,
        needsDetailedAnalysis
      }
    } catch (error) {
      console.error('Error getting market summary:', error)
      throw error
    }
  }
}

// Export singleton instance
export const summaryApiClient = new SummaryApiClient() 