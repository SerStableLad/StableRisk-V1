// API Configuration for StableRisk
// Copy this file to config.ts and fill in your actual API keys
export const config = {
  // CoinGecko API (Primary data source)
  coingecko: {
    apiKey: process.env.COINGECKO_API_KEY || 'your-coingecko-api-key-here',
    baseUrl: 'https://api.coingecko.com/api/v3',
  },
  
  // GeckoTerminal API (DEX liquidity data)
  geckoterminal: {
    baseUrl: 'https://api.geckoterminal.com/api/v2',
  },
  
  // GitHub API (Audit and repository data)
  github: {
    accessToken: process.env.GITHUB_ACCESS_TOKEN || 'your-github-access-token-here',
    baseUrl: 'https://api.github.com',
  },
  
  // Gemini AI API (AI analysis and insights)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || 'your-gemini-api-key-here',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS || '8192'),
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE || '0.1'),
    rateLimitPerMinute: parseInt(process.env.GEMINI_RATE_LIMIT_PER_MINUTE || '60'),
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
  
  // GeckoTerminal endpoints
  geckoterminal: {
    networks: '/networks',
    pools: (network: string) => `/networks/${network}/pools`,
    tokens: (network: string) => `/networks/${network}/tokens`,
  },
  
  // Gemini AI endpoints
  gemini: {
    generateContent: (model: string) => `/models/${model}:generateContent`,
  },
} as const 