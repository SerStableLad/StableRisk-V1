import { config } from '@/lib/config'
import { StablecoinInfo, PricePoint } from '@/lib/types'
import { getKnownGenesisDate } from './stablecoin-mapping-utils'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

// MCP-specific interfaces based on CoinGecko MCP Server capabilities
interface McpCoinMarketData {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  market_cap: number
  market_cap_rank: number
  fully_diluted_valuation: number | null
  total_volume: number
  high_24h: number
  low_24h: number
  price_change_24h: number
  price_change_percentage_24h: number
  market_cap_change_24h: number
  market_cap_change_percentage_24h: number
  circulating_supply: number
  total_supply: number | null
  max_supply: number | null
  ath: number
  ath_change_percentage: number
  ath_date: string
  atl: number
  atl_change_percentage: number
  atl_date: string
  last_updated: string
}

interface McpCoinDetails {
  id: string
  symbol: string
  name: string
  description: { en: string }
  image: {
    thumb: string
    small: string
    large: string
  }
  categories: string[]
  genesis_date: string
  market_data: {
    current_price: { usd: number }
    market_cap: { usd: number }
    total_volume: { usd: number }
    price_change_24h: number
    price_change_percentage_24h: number
  }
  platforms: Record<string, string>
  links: {
    homepage: string[]
    blockchain_site: string[]
    twitter_screen_name: string
    telegram_channel_identifier: string
    repos_url: {
      github: string[]
    }
  }
}

interface McpChartData {
  prices: [number, number][]
  market_caps: [number, number][]
  total_volumes: [number, number][]
}

// DEX/Onchain interfaces for MCP
interface McpDexPool {
  id: string
  attributes: {
    name: string
    address: string
    dex_id: string
    network_id: string
    reserve_in_usd: string
    volume_usd?: {
      h24: string
    }
    price_change_percentage?: {
      h24: string
    }
  }
  relationships?: {
    dex?: {
      data?: {
        id: string
        type: string
      }
    }
    base_token?: {
      data?: {
        id: string
        type: string
      }
    }
    quote_token?: {
      data?: {
        id: string
        type: string
      }
    }
  }
}

interface McpDexPoolsResponse {
  data: McpDexPool[]
  meta?: {
    count: number
  }
}

interface McpLiquidityAnalysis {
  total_liquidity: number
  dex_distribution: Array<{
    dex: string
    liquidity: number
    percentage: number
    chain: string
  }>
  chain_distribution: Array<{
    chain: string
    liquidity: number
    percentage: number
  }>
  concentration_risk: 'low' | 'medium' | 'high'
}

interface McpResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: number
}

/**
 * CoinGecko MCP Service - Abstracts MCP server communication
 * Provides a clean interface for querying CoinGecko data via MCP protocol
 * with fallback to traditional REST API when MCP is unavailable
 */
/**
 * Real MCP client for CoinGecko Remote Server
 * Uses MCP SDK with SSE (Server-Sent Events) transport
 */
class RealMcpClient {
  private client: Client | null = null
  private transport: SSEClientTransport | null = null
  private readonly serverUrl: string
  private readonly timeout: number
  private isConnected: boolean = false

  constructor(serverUrl: string, timeout: number) {
    this.serverUrl = serverUrl
    this.timeout = timeout
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return
    }

    try {
      console.log(`[CoinGecko MCP] Connecting to ${this.serverUrl}`)
      
      // Create SSE transport
      this.transport = new SSEClientTransport(new URL(this.serverUrl))
      
      // Create MCP client
      this.client = new Client({
        name: "stablerisk-coingecko-client",
        version: "1.0.0"
      }, {
        capabilities: {
          tools: {}
        }
      })

      // Connect to server
      await this.client.connect(this.transport)
      this.isConnected = true
      
      console.log(`[CoinGecko MCP] Successfully connected to ${this.serverUrl}`)
    } catch (error) {
      console.error(`[CoinGecko MCP] Failed to connect:`, error)
      this.isConnected = false
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close()
      } catch (error) {
        console.warn(`[CoinGecko MCP] Error during disconnect:`, error)
      }
    }
    this.client = null
    this.transport = null
    this.isConnected = false
  }

  async callTool(toolName: string, params: Record<string, unknown>, options: { timeout?: number; signal?: AbortSignal } = {}): Promise<{ success: boolean; content?: any; error?: string }> {
    try {
      // Ensure we're connected
      if (!this.isConnected) {
        await this.connect()
      }

      if (!this.client) {
        throw new Error('MCP client not initialized')
      }

      console.log(`[CoinGecko MCP] Calling tool: ${toolName} with params:`, params)
      
      // Create timeout controller
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || this.timeout)
      
      try {
        // Call the MCP tool
        const result = await this.client.callTool({
          name: toolName,
          arguments: params
        })
        
        clearTimeout(timeoutId)
        
        if (result.isError) {
          return {
            success: false,
            error: Array.isArray(result.content) && result.content[0] && typeof result.content[0] === 'object' && 'text' in result.content[0] 
              ? (result.content[0] as any).text 
              : 'Tool call failed'
          }
        }

        // Extract content from MCP response
        if (Array.isArray(result.content) && result.content.length > 0) {
          const content = result.content[0] as any
          if (content?.type === 'text' && typeof content.text === 'string') {
            try {
              // Try to parse as JSON
              const parsedContent = JSON.parse(content.text)
              return {
                success: true,
                content: parsedContent
              }
            } catch {
              // Return as plain text if not JSON
              return {
                success: true,
                content: content.text
              }
            }
          }
        }

        return {
          success: true,
          content: result.content
        }

      } catch (error) {
        clearTimeout(timeoutId)
        
        if (controller.signal.aborted || options.signal?.aborted) {
          throw new Error('Request aborted')
        }
        
        throw error
      }

    } catch (error) {
      console.error(`[CoinGecko MCP] Tool call failed:`, error)
      
      // Try to reconnect on connection errors
      if (error instanceof Error && (
        error.message.includes('connection') || 
        error.message.includes('transport') ||
        error.message.includes('disconnect')
      )) {
        console.log(`[CoinGecko MCP] Attempting to reconnect...`)
        this.isConnected = false
        try {
          await this.connect()
          // Retry the call once after reconnection
          return await this.callTool(toolName, params, options)
        } catch (reconnectError) {
          console.error(`[CoinGecko MCP] Reconnection failed:`, reconnectError)
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

export class CoinGeckoMcpService {
  private mcpClient: RealMcpClient | null = null
  private readonly isEnabled: boolean
  private readonly serverUrl: string
  private readonly timeout: number
  private readonly retryAttempts: number
  private readonly retryDelay: number

  constructor() {
    // Use environment variable for MCP server URL, fallback to public keyless server
    this.serverUrl = process.env.COINGECKO_MCP_SERVER_URL || 'https://mcp.api.coingecko.com/sse'
    this.isEnabled = process.env.COINGECKO_MCP_ENABLED === 'true'
    this.timeout = parseInt(process.env.COINGECKO_MCP_TIMEOUT || '30000')
    this.retryAttempts = parseInt(process.env.COINGECKO_MCP_RETRY_ATTEMPTS || '3')
    this.retryDelay = parseInt(process.env.COINGECKO_MCP_RETRY_DELAY || '1000')

    if (this.isEnabled) {
      console.log(`[CoinGecko MCP] Service enabled, will initialize client on first use`)
    } else {
      console.log('[CoinGecko MCP] Service disabled via configuration')
    }
  }

  /**
   * Lazy initialization of MCP client
   */
  private getMcpClient(): RealMcpClient | null {
    if (!this.isEnabled) {
      return null
    }

    if (!this.mcpClient) {
      try {
        console.log(`[CoinGecko MCP] Lazy initializing client with server: ${this.serverUrl}`)
        this.mcpClient = new RealMcpClient(this.serverUrl, this.timeout)
      } catch (error) {
        console.error('[CoinGecko MCP] Failed to initialize client:', error)
        this.mcpClient = null
      }
    }
    return this.mcpClient
  }

  /**
   * Check if MCP service is enabled and available
   */
  isAvailable(): boolean {
    return this.isEnabled && this.getMcpClient() !== null
  }

  /**
   * Execute MCP query with retry logic and error handling
   */
  private async executeQuery<T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<McpResponse<T>> {
    if (!this.isEnabled) {
      return {
        success: false,
        error: 'MCP service is disabled',
        timestamp: Date.now()
      }
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        console.log(`[CoinGecko MCP] Executing ${method} (attempt ${attempt}/${this.retryAttempts})`)
        
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)

        // Note: This is a placeholder for MCP client implementation
        // In a real implementation, you would use an MCP client library
        // to communicate with the MCP server
        const response = await this.makeMcpRequest<T>(method, params, controller.signal)
        
        clearTimeout(timeoutId)
        
        return {
          success: true,
          data: response,
          timestamp: Date.now()
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`[CoinGecko MCP] Attempt ${attempt} failed:`, lastError.message)
        
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt) // Exponential backoff
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown MCP error',
      timestamp: Date.now()
    }
  }

  /**
   * Actual MCP request implementation using CoinGecko MCP client
   */
  private async makeMcpRequest<T>(
    toolName: string,
    params: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<T> {
    const mcpClient = this.getMcpClient()
    if (!mcpClient) {
      throw new Error('MCP client not initialized')
    }

    console.log(`[CoinGecko MCP] Making request: ${toolName}`, params)
    
    try {
      // Use the real MCP client to make the request
      const response = await mcpClient.callTool(toolName, params, { 
        timeout: this.timeout,
        signal 
      })

      if (!response.success) {
        throw new Error(response.error || 'MCP request failed')
      }

      return response.content as T
    } catch (error) {
      // Check if request was aborted
      if (signal.aborted) {
        throw new Error('Request aborted')
      }
      
      if (error instanceof Error) {
        throw error
      } else {
        throw new Error(`MCP request failed: ${String(error)}`)
      }
    }
  }

  /**
   * Search for cryptocurrency by ticker using MCP
   */
  async searchCryptocurrency(ticker: string): Promise<{ id: string; symbol: string; name: string } | null> {
    try {
      const response = await this.executeQuery<{
        coins: Array<{ id: string; symbol: string; name: string; market_cap_rank?: number }>
      }>(
        'get_search',
        { query: ticker }
      )

      if (!response.success || !response.data?.coins) {
        console.warn(`[CoinGecko MCP] Search failed: ${response.error}`)
        return null
      }

      // Find exact matches by symbol
      const matchingCoins = response.data.coins.filter(
        (coin) => coin.symbol.toLowerCase() === ticker.toLowerCase()
      )

      if (matchingCoins.length === 0) {
        console.warn(`[CoinGecko MCP] No exact match found for ${ticker}`)
        return null
      }

      // If multiple matches, prioritize by market cap rank (lower rank = higher market cap)
      let selectedCoin = matchingCoins[0]
      if (matchingCoins.length > 1) {
        console.log(`[CoinGecko MCP] Found ${matchingCoins.length} matches for ${ticker}`)
        
        // Sort by market cap rank (nulls go to end)
        selectedCoin = matchingCoins.sort((a, b) => {
          if (a.market_cap_rank === null || a.market_cap_rank === undefined) return 1
          if (b.market_cap_rank === null || b.market_cap_rank === undefined) return -1
          return a.market_cap_rank - b.market_cap_rank
        })[0]
        
        console.log(`[CoinGecko MCP] Selected highest ranked match: ${selectedCoin.id}`)
      }

      return {
        id: selectedCoin.id,
        symbol: selectedCoin.symbol,
        name: selectedCoin.name
      }

    } catch (error) {
      console.error(`[CoinGecko MCP] Search error for ${ticker}:`, error)
      return null
    }
  }

  /**
   * Get coin market data using MCP
   */
  async getCoinMarketData(coinId: string): Promise<McpCoinMarketData | null> {
    try {
      const response = await this.executeQuery<McpCoinMarketData[]>(
        'get_coins_markets',
        { 
          ids: coinId,
          vs_currency: 'usd',
          include_market_cap: true,
          include_24hr_vol: true,
          include_24hr_change: true
        }
      )

      if (!response.success || !response.data || response.data.length === 0) {
        console.warn(`[CoinGecko MCP] Market data failed: ${response.error}`)
        return null
      }

      return response.data[0]

    } catch (error) {
      console.error(`[CoinGecko MCP] Market data error for ${coinId}:`, error)
      return null
    }
  }

  /**
   * Get detailed coin information using MCP
   */
  async getCoinDetails(coinId: string): Promise<StablecoinInfo | null> {
    try {
      const response = await this.executeQuery<McpCoinDetails>(
        'get_id_coins',
        { 
          id: coinId,
          localization: false,
          tickers: false,
          market_data: true,
          community_data: false,
          developer_data: false
        }
      )

      if (!response.success || !response.data) {
        console.warn(`[CoinGecko MCP] Coin details failed: ${response.error}`)
        return null
      }

      const data = response.data

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
        blockchain: this.extractBlockchainPlatforms(data.platforms),
        pegging_type: this.determinePeggingType(data.symbol, data.description.en),
        categories: data.categories || [],
        official_links: {
          homepage: data.links.homepage?.filter(url => url && url.trim() !== '') || [],
          twitter_screen_name: data.links.twitter_screen_name || undefined,
          telegram_channel_identifier: data.links.telegram_channel_identifier || undefined,
          github_repos: data.links.repos_url?.github?.filter(url => url && url.trim() !== '') || []
        },
        platforms: data.platforms || {},
        contract_address: data.platforms?.ethereum ? data.platforms.ethereum : undefined
      }

    } catch (error) {
      console.error(`[CoinGecko MCP] Coin details error for ${coinId}:`, error)
      return null
    }
  }

  /**
   * Get price history using MCP
   */
  async getPriceHistory(coinId: string, days: number = 365): Promise<PricePoint[]> {
    try {
      const response = await this.executeQuery<McpChartData>(
        'get_range_coins_market_chart',
        { 
          id: coinId,
          vs_currency: 'usd',
          from: Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000),
          to: Math.floor(Date.now() / 1000),
          days: days.toString(),
          interval: 'daily'
        }
      )

      if (!response.success || !response.data) {
        console.warn(`[CoinGecko MCP] Price history failed: ${response.error}`)
        return []
      }

      return response.data.prices.map(([timestamp, price]) => ({
        timestamp,
        price,
        deviation_percent: ((price - 1) / 1) * 100, // Deviation from $1 peg
      }))

    } catch (error) {
      console.error(`[CoinGecko MCP] Price history error for ${coinId}:`, error)
      return []
    }
  }

  /**
   * Get current price using MCP
   */
  async getCurrentPrice(coinId: string): Promise<number | null> {
    try {
      const response = await this.executeQuery<Record<string, { usd: number }>>(
        'get_simple_price',
        { 
          ids: coinId,
          vs_currencies: 'usd',
          include_24hr_change: true
        }
      )

      if (!response.success || !response.data) {
        console.warn(`[CoinGecko MCP] Current price failed: ${response.error}`)
        return null
      }

      return response.data[coinId]?.usd || null

    } catch (error) {
      console.error(`[CoinGecko MCP] Current price error for ${coinId}:`, error)
      return null
    }
  }

  /**
   * Get top gaining/losing coins using MCP
   */
  async getTopGainersLosers(): Promise<{
    gainers: McpCoinMarketData[]
    losers: McpCoinMarketData[]
  } | null> {
    try {
      const response = await this.executeQuery<{
        top_gainers: McpCoinMarketData[]
        top_losers: McpCoinMarketData[]
      }>(
        'get_coins_top_gainers_losers',
        { 
          vs_currency: 'usd',
          duration: '24h'
        }
      )

      if (!response.success || !response.data) {
        console.warn(`[CoinGecko MCP] Top gainers/losers failed: ${response.error}`)
        return null
      }

      return {
        gainers: response.data.top_gainers,
        losers: response.data.top_losers
      }

    } catch (error) {
      console.error('[CoinGecko MCP] Top gainers/losers error:', error)
      return null
    }
  }

  /**
   * Extract blockchain platforms from platforms data
   */
  private extractBlockchainPlatforms(platforms: Record<string, string>): string {
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
    }

    const blockchainNames = Object.keys(platforms)
      .filter(key => platforms[key])
      .map(key => platformMap[key] || key)
      .filter(Boolean)

    return blockchainNames.length > 0 ? blockchainNames.join(', ') : 'Unknown'
  }

  /**
   * Determine pegging type based on coin data
   */
  private determinePeggingType(
    symbol: string,
    description: string
  ): StablecoinInfo['pegging_type'] {
    const desc = description.toLowerCase()

    if (desc.includes('algorithmic') || desc.includes('elastic')) {
      return 'algorithmic'
    }

    if (desc.includes('collateral') && (desc.includes('eth') || desc.includes('crypto'))) {
      return 'crypto-collateralized'
    }

    if (desc.includes('gold') || desc.includes('silver') || desc.includes('commodity')) {
      return 'commodity-backed'
    }

    return 'fiat-backed'
  }

  /**
   * Utility method to add delay between retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Health check for MCP service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const mcpClient = this.getMcpClient()
      if (!mcpClient) {
        return false
      }

      // Try a simple query to test connectivity
      const response = await this.executeQuery('get_simple_price', {
        ids: 'bitcoin',
        vs_currencies: 'usd'
      })
      return response.success
    } catch {
      return false
    }
  }

  /**
   * Note: CoinGecko MCP does not currently support DEX liquidity analysis
   * This method is a placeholder that returns null to indicate unavailability
   * DEX analysis should be handled by a dedicated service like GeckoTerminal
   */
  async getLiquidityAnalysis(
    tokenAddress: string,
    symbol: string,
    platformData?: Record<string, string>
  ): Promise<McpLiquidityAnalysis | null> {
    console.log(`[CoinGecko MCP] DEX liquidity analysis not available via MCP - ${symbol}`)
    console.log(`[CoinGecko MCP] MCP focuses on market data, not DEX pool analysis`)
    return null
  }

  /**
   * Note: CoinGecko MCP does not currently support token address resolution
   * This method is a placeholder that returns null to indicate unavailability
   */
  async getTokenAddress(symbol: string): Promise<string | null> {
    console.log(`[CoinGecko MCP] Token address resolution not available via MCP - ${symbol}`)
    console.log(`[CoinGecko MCP] MCP focuses on market data, not onchain address resolution`)
    return null
  }

  /**
   * Get stablecoins with market data using MCP
   * Returns coins from the 'stablecoins' category with market data
   */
  async getStablecoinsWithMarketData(): Promise<Array<{
    id: string
    symbol: string
    name: string
    current_price: number
    market_cap: number
    categories?: string[]
    official_links?: {
      homepage: string[]
      twitter_screen_name?: string
      telegram_channel_identifier?: string
    }
  }>> {
    return this.getStablecoinCandidates()
  }

  /**
   * Get stablecoin candidates using MCP
   * Alias method to match test expectations
   */
  async getStablecoinCandidates(): Promise<Array<{
    id: string
    symbol: string
    name: string
    current_price: number
    market_cap: number
    categories?: string[]
    official_links?: {
      homepage: string[]
      twitter_screen_name?: string
      telegram_channel_identifier?: string
    }
  }>> {
    try {
      // Get market data for stablecoins category
      const response = await this.executeQuery<McpCoinMarketData[]>(
        'get_coins_markets',
        {
          vs_currency: 'usd',
          category: 'stablecoins',
          order: 'market_cap_desc',
          per_page: 100,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        }
      )

      if (!response.success || !response.data) {
        console.warn(`[CoinGecko MCP] Failed to get stablecoins: ${response.error}`)
        return []
      }

      // Convert to the expected format
      return response.data.map(coin => ({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        current_price: coin.current_price,
        market_cap: coin.market_cap,
        categories: ['stablecoins'], // Assume stablecoins category since we queried for it
        official_links: {
          homepage: [], // Not available in market data, would need separate getCoinDetails call
          twitter_screen_name: undefined,
          telegram_channel_identifier: undefined
        }
      }))

    } catch (error) {
      console.error('[CoinGecko MCP] Error getting stablecoins with market data:', error)
      return []
    }
  }
}

// Export singleton instance
export const coinGeckoMcpService = new CoinGeckoMcpService()
export const coinGeckoService = coinGeckoMcpService // Alias for compatibility