// Stablecoin basic information
export interface StablecoinInfo {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  market_cap: number
  genesis_date: string
  blockchain?: string // Network/blockchain
  pegging_type: 'fiat-backed' | 'crypto-collateralized' | 'algorithmic' | 'commodity-backed'
  commodity?: string // For commodity-backed stablecoins
  // Official links from data providers like CoinGecko
  official_links?: {
    homepage: string[]
    twitter_screen_name?: string
    telegram_channel_identifier?: string
    github_repos?: string[]
  }
}

// Risk assessment scores
export interface RiskScores {
  overall: number
  peg_stability: number
  transparency: number
  liquidity: number
  oracle: number
  audit: number
}

// New tiered response types
export interface StablecoinTier1Data {
  tier: 1
  info: Pick<StablecoinInfo, 'id' | 'symbol' | 'name' | 'image' | 'current_price' | 'market_cap'>
  peg_status: {
    is_currently_pegged: boolean
  }
  preliminary_score: number
  last_updated: string
}

export interface StablecoinTier2Data {
  tier: 2
  peg_stability: {
    average_deviation: number
    is_depegged: boolean
    depeg_incidents: number
  }
  basic_transparency: {
    has_dashboard: boolean
    has_proof_of_reserves: boolean
  }
  risk_scores: {
    peg_stability: number
    transparency: number
    preliminary_overall: number
  }
}

export interface StablecoinTier3Data {
  tier: 3
  full_peg_stability: PegStabilityData
  full_transparency: TransparencyData
  liquidity: LiquidityData
  oracle: OracleData
  audits: AuditInfo[]
  complete_risk_scores: RiskScores
  data_sources: string[]
}

export interface TieredStablecoinAssessment {
  tier1?: StablecoinTier1Data
  tier2?: StablecoinTier2Data
  tier3?: StablecoinTier3Data
  complete: boolean
}

// Peg stability data
export interface PegStabilityData {
  price_history: PricePoint[]
  average_deviation: number
  depeg_incidents: number
  depeg_recovery_speed: number // in hours
  is_depegged: boolean
  last_depeg_date?: string
}

export interface PricePoint {
  timestamp: number
  price: number
  deviation_percent: number
}

// Audit information
export interface AuditInfo {
  firm: string
  date: string
  outstanding_issues: number
  critical_high_issues: number
  resolution_status: 'resolved' | 'pending' | 'partial'
  report_url?: string
  is_top_tier: boolean
}

// Transparency data
export interface TransparencyData {
  dashboard_url?: string
  attestation_provider?: string
  attestation_url?: string // Direct link to attestation reports (e.g., Dropbox folder)
  update_frequency: 'daily' | 'weekly' | 'monthly' | 'unknown'
  last_update_date?: string // ISO date string when update_frequency is unknown
  has_proof_of_reserves: boolean
  verification_status: 'verified' | 'unverified' | 'unknown'
}

// Oracle setup
export interface OracleData {
  providers: string[]
  is_multi_oracle: boolean
  decentralization_score: number
}

// Liquidity information
export interface LiquidityData {
  total_liquidity: number
  dex_distribution: DexLiquidity[]
  concentration_risk: 'low' | 'medium' | 'high'
  chain_distribution: ChainLiquidity[]
}

export interface DexLiquidity {
  dex: string
  liquidity: number
  percentage: number
  chain: string
}

export interface ChainLiquidity {
  chain: string
  liquidity: number
  percentage: number
}

// Complete stablecoin assessment
export interface StablecoinAssessment {
  info: StablecoinInfo
  risk_scores: RiskScores
  peg_stability: PegStabilityData
  audits: AuditInfo[]
  transparency: TransparencyData
  oracle: OracleData
  liquidity: LiquidityData
  last_updated: string
  data_sources: string[]
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface SearchResponse {
  found: boolean
  ticker: string
  basic_info?: Pick<StablecoinInfo, 'name' | 'symbol' | 'image'>
}

// Risk factors with detailed analysis
export interface RiskFactors {
  peg_stability: {
    score: number
    details: Record<string, any>
  }
  transparency: {
    score: number
    details: Record<string, any>
  }
  liquidity: {
    score: number
    details: Record<string, any>
  }
  oracle_setup: {
    score: number
    details: Record<string, any>
  }
  audit_status: {
    score: number
    details: Record<string, any>
  }
}

// Error types
export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

// Rate limiting
export interface RateLimitInfo {
  remaining: number
  reset_time: number
  limit: number
} 