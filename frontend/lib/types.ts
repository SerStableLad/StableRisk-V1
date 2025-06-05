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

// Depeg event information
export interface DepegEvent {
  timestamp: string
  price: number
  deviation_percent: number
  duration_hours?: number
  recovered: boolean
}

// Individual price data point for charting
export interface PricePoint {
  timestamp: string
  price: number
  deviation_percent: number
}

// Price peg stability analysis from backend
export interface PegAnalysis {
  target_peg: number
  current_price: number
  current_deviation: number
  max_deviation_7d: number
  max_deviation_30d: number
  max_deviation_1y: number
  depeg_events: DepegEvent[]
  avg_recovery_time_hours?: number
  price_history: PricePoint[]
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
  critical_issues_summary?: string[]
  outstanding_issues_summary?: string[]
  severity_breakdown?: {
    critical: number
    high: number
    medium: number
    low: number
  }
}

// Transparency dashboard data
export interface TransparencyData {
  last_update: string
  update_frequency: string
  attestation_provider?: string
  total_reserves?: number
  reserve_ratio?: number
  dashboard_url?: string
  
  // Enhanced reserve transparency details
  reserve_backing?: ReserveBackingInfo
  attestation_details?: AttestationInfo
  custody_info?: CustodyInfo
  transparency_score?: number
  report_frequency_details?: ReportFrequencyInfo
}

// Reserve backing composition
export interface ReserveBackingInfo {
  composition: ReserveComponent[]
  last_verification_date: string
  backing_type: 'Fiat-Backed' | 'Crypto-Backed' | 'Commodity-Backed' | 'Mixed-Collateral' | 'Algorithmic'
  overcollateralization_ratio?: number
  geographical_distribution?: string[]
}

// Individual reserve components
export interface ReserveComponent {
  asset_type: string  // e.g., "US Dollars", "US Treasury Bills", "Ethereum", "Bitcoin"
  percentage: number  // Percentage of total reserves
  amount_usd?: number  // USD value
  custody_location?: string
  verification_method: 'Third-party audit' | 'On-chain verification' | 'Bank attestation' | 'Self-reported'
}

// Third-party attestation information
export interface AttestationInfo {
  primary_verifier: string  // e.g., "Grant Thornton LLP", "BDO Italia", "Armanino LLP"
  verifier_type: 'Big 4 Accounting' | 'Regional Accounting' | 'Specialized Auditor' | 'Legal Firm' | 'Internal'
  attestation_type: 'Full Audit' | 'Review' | 'Agreed-Upon Procedures' | 'Compilation'
  last_attestation_date: string
  next_scheduled_date?: string
  attestation_scope: string[]  // e.g., ["Reserve composition", "Bank balances", "Custodial holdings"]
  regulatory_compliance?: string[]  // e.g., ["SOX", "PCAOB", "AICPA"]
  report_url?: string
}

// Custody information
export interface CustodyInfo {
  custodians: CustodianInfo[]
  custody_model: 'Self-Custody' | 'Third-Party Custody' | 'Mixed Custody' | 'Decentralized'
  insurance_coverage?: number  // USD amount
  insurance_provider?: string
  regulatory_oversight?: string[]
}

// Individual custodian details
export interface CustodianInfo {
  name: string
  type: 'Traditional Bank' | 'Digital Asset Custodian' | 'Prime Brokerage' | 'Insurance Company' | 'Trust Company'
  jurisdiction: string
  assets_held: string[]  // Types of assets they custody
  percentage_of_reserves?: number
  regulatory_status: string  // e.g., "FDIC Insured", "CFTC Registered", "SEC Registered"
  insurance_coverage?: number
}

// Report frequency details
export interface ReportFrequencyInfo {
  frequency: 'Real-time' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Annually' | 'Irregular'
  last_update_time: string
  update_consistency: 'Very Consistent' | 'Consistent' | 'Irregular' | 'Unreliable'
  automated_reporting: boolean
  transparency_grade: 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F'
}

// Oracle infrastructure
export interface OracleInfo {
  oracle_type: string
  has_backup: boolean
  update_interval?: string
  centralization_risk: number
  reliability_score: number
  // Enhanced oracle data
  oracle_types_available?: Record<string, any>
  risk_levels_info?: Record<string, string>
  oracle_summary?: any
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

// Price stability analysis with chart data
export interface PriceStabilityInfo {
  max_deviation: number
  avg_deviation: number
  depeg_events: number
  recovery_time_avg: number
  stability_score: number
  detailed_analysis?: PegAnalysis | null
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