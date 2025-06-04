// Stablecoin basic information
export interface StablecoinInfo {
  coin_id: string
  name: string
  symbol: string
  image?: string
  market_cap?: number
  current_price?: number
  price_change_percentage_24h?: number
  website?: string
  github_repo?: string
  genesis_date?: string
  description?: string
}

// Risk factor scores
export interface RiskFactors {
  price_stability: number
  liquidity: number
  oracle: number
  audit: number
  centralization: number
}

// Detailed risk factor information
export interface RiskFactorDetail {
  score: number
  description: string
  data_available: boolean
  confidence: number
  source: string
  provider: string
}

// Detailed risk factors
export interface RiskFactorDetails {
  price_stability: RiskFactorDetail
  liquidity: RiskFactorDetail
  oracle: RiskFactorDetail
  audit: RiskFactorDetail
  centralization: RiskFactorDetail
}

// Overall risk assessment
export interface RiskAssessment {
  overall_score: number
  risk_level: string
  confidence: number
  factors: RiskFactors
  factor_details?: RiskFactorDetails
  warnings?: string[]
  recommendations?: string[]
  summary: string
}

// Audit information
export interface AuditInfo {
  auditor: string
  date: string
  report_url?: string
  critical_issues: number
  resolved_issues: number
  outstanding_issues: number
}

// Transparency dashboard data
export interface TransparencyData {
  last_update: string
  update_frequency: string
  attestation_provider?: string
  total_reserves?: number
  reserve_ratio?: number
  dashboard_url?: string
}

// Oracle infrastructure
export interface OracleInfo {
  oracle_type: string
  has_backup: boolean
  update_interval?: string
  centralization_risk: number
  reliability_score: number
}

// Liquidity data
export interface LiquidityInfo {
  total_liquidity: number
  chain_breakdown: Record<string, {
    tvl: number
    dex_count: number
    top_dex: string
    score: number
  }>
  concentration_risk: number
}

// Price stability analysis
export interface PriceStabilityInfo {
  max_deviation: number
  avg_deviation: number
  depeg_events: number
  recovery_time_avg: number
  stability_score: number
}

// Complete stablecoin analysis
export interface StablecoinAnalysis {
  basic_info: StablecoinInfo
  risk_assessment: RiskAssessment
  price_stability: PriceStabilityInfo
  liquidity: LiquidityInfo
  audits: AuditInfo[]
  transparency: TransparencyData
  oracle: OracleInfo
  last_updated: string
}

// API response wrapper
export interface ApiResponse<T> {
  data: T
  status: 'success' | 'error'
  message?: string
} 