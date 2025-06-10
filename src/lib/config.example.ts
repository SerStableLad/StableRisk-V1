// API Configuration for StableRisk
// Copy this file to config.ts and fill in your actual API keys
export const config = {
  // CoinGecko API (Primary data source)
  coingecko: {
    apiKey: process.env.COINGECKO_API_KEY || 'your-coingecko-api-key-here',
    baseUrl: 'https://api.coingecko.com/api/v3',
  },
  
  // CoinMarketCap API (Fallback data source)
  coinmarketcap: {
    apiKey: process.env.COINMARKETCAP_API_KEY || 'your-coinmarketcap-api-key-here',
    baseUrl: 'https://pro-api.coinmarketcap.com/v1',
  },
  
  // GeckoTerminal API (DEX liquidity data)
  geckoterminal: {
    baseUrl: 'https://api.geckoterminal.com/api/v2',
  },
  
  // DeFiLlama API (Additional liquidity data)
  defillama: {
    baseUrl: 'https://api.llama.fi',
  },
  
  // GitHub API (Audit and repository data)
  github: {
    accessToken: process.env.GITHUB_ACCESS_TOKEN || 'your-github-access-token-here',
    baseUrl: 'https://api.github.com',
  },
  
  // Application Configuration
  app: {
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
  
  // Rate Limiting Configuration
  rateLimit: {
    max: 10, // 10 requests per IP per day
    windowMs: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  },
  
  // Cache Configuration
  cache: {
    ttl: 24 * 60 * 60, // 24 hours in seconds
  },
} as const

// Environment-specific settings
export const isDevelopment = process.env.NODE_ENV === 'development'
export const isProduction = process.env.NODE_ENV === 'production'

// API endpoints configuration
export const endpoints = {
  // CoinGecko endpoints
  coingecko: {
    coinsList: '/coins/list',
    coinData: (id: string) => `/coins/${id}`,
    coinHistory: (id: string) => `/coins/${id}/history`,
    coinMarketChart: (id: string) => `/coins/${id}/market_chart`,
    simplePrices: '/simple/price',
  },
  
  // CoinMarketCap endpoints
  coinmarketcap: {
    coinQuotes: '/cryptocurrency/quotes/latest',
    coinInfo: '/cryptocurrency/info',
    coinMap: '/cryptocurrency/map',
  },
  
  // GeckoTerminal endpoints
  geckoterminal: {
    networks: '/networks',
    pools: (network: string) => `/networks/${network}/pools`,
    tokens: (network: string) => `/networks/${network}/tokens`,
  },
  
  // DeFiLlama endpoints
  defillama: {
    protocols: '/protocols',
    protocolData: (protocol: string) => `/protocol/${protocol}`,
    tvl: '/tvl',
  },
} as const 