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
  pegging_type: 'fiat-backed' | 'crypto-collateralized' | 'algorithmic' | 'commodity-backed' | 'over_collateralized'
  commodity?: string // For commodity-backed stablecoins
  categories?: string[] // CoinGecko categories for validation
  // Official links from data providers like CoinGecko
  official_links?: {
    homepage: string[]
    twitter_screen_name?: string
    telegram_channel_identifier?: string
    github_repos?: string[]
  }
  // Phase 1 optimization: Include platform data to eliminate redundant API calls
  platforms?: Record<string, string> // blockchain platform -> contract address mapping
  contract_address?: string // primary contract address (usually Ethereum)
}

// Risk assessment scores
export interface RiskScores {
  overall: number
  peg_stability: number
  transparency: number | null // Can be null when no transparency data is found
  liquidity: number
  // oracle: number // Disabled oracle functionality
  audit: number | null // Can be null when no audit data is found
}

// Logging interface
export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
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
  ai_market_insights?: {
    insights: string
    confidence: number
  }
}

export interface StablecoinTier3Data {
  tier: 3
  full_peg_stability: PegStabilityData
  full_transparency: TransparencyData
  liquidity: LiquidityData
  // oracle: OracleData // Disabled oracle functionality
  audits: AuditInfo[]
  complete_risk_scores: RiskScores
  data_sources: string[]
  // NEW: Comprehensive collateral discovery data
  collateral_discovery?: {
    primary_result: CollateralDiscoveryResult
    final_confidence: number
    discovery_tier: 1 | 2 | 3 | 4
    discovery_method: 'manual_mapping' | 'ai_extraction' | 'on_chain_analysis' | 'heuristic_fallback'
    total_cost_usd: number
    quality_assurance: {
      cross_validation_performed: boolean
      consistency_score: number
      data_completeness: number
    }
  } | null
  comprehensive_ai_analysis?: {
    risk_analysis?: {
      content: string
      confidence: number
    }
    transparency_analysis?: {
      content: string
      confidence: number
    }
    generated_at: string
  }
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
  update_frequency: 'real-time' | 'daily' | 'weekly' | 'monthly' | 'none' | 'unknown'
  last_update_date?: string // ISO date string when update_frequency is unknown
  has_proof_of_reserves: boolean
  verification_status: 'verified' | 'unverified' | 'unknown'
  collateral_data?: CollateralData
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
  total_volume_24h?: any
  total_volume_7d?: number
  volume_change_24h?: number
  market_cap?: any
  liquidity_score?: any
  exchanges?: any
  liquidity_pools?: any[]
  market_depth_analysis?: {
    depth_1_percent: number
    depth_5_percent: number
    depth_10_percent: number
    average_spread: number
  }
  dex_liquidity_by_chain?: any
  overall_liquidity_health?: string
  volume_to_liquidity_ratio?: number
  historical_tvl?: Array<{
    chain: string
    data: Array<{
      timestamp: number
      date: string
      tvl: number
      chain: string
    }>
    color: string
  }>
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
  oracle: OracleData // Re-enabled for interface compatibility
  liquidity: LiquidityData
  // Add collateral data at the top level for easy access
  collateral_data?: CollateralData
  // NEW: Comprehensive collateral discovery data
  collateral_discovery?: {
    primary_result: CollateralDiscoveryResult
    final_confidence: number
    discovery_tier: 1 | 2 | 3 | 4
    discovery_method: 'manual_mapping' | 'ai_extraction' | 'on_chain_analysis' | 'heuristic_fallback'
    total_cost_usd: number
    quality_assurance: {
      cross_validation_performed: boolean
      consistency_score: number
      data_completeness: number
    }
    fallback_results?: CollateralDiscoveryResult[]
  } | null
  last_updated: string
  data_sources: string[]
  ai_insights?: {
    risk_analysis: string
    confidence: number
    ai_metadata: any
  }
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
    score: number | null // Can be null when no transparency data is found
    details: Record<string, any>
  }
  liquidity: {
    score: number
    details: Record<string, any>
  }
  // oracle_setup: { // Disabled oracle functionality
  //   score: number
  //   details: Record<string, any>
  // }
  audit_status: {
    score: number | null // Can be null when no audit data is found
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

// Add these new interfaces for collateral data extraction

export interface CollateralAllocation {
  asset_type: string // e.g., "Cash", "Treasury Bills", "Commercial Paper"
  market_value?: number // Dollar value
  value_usd?: number // Dollar value (alternative naming)
  amount_usd?: number // Dollar value (alternative naming)
  percentage?: number // Percentage of total (0-100)
  description?: string // Additional details about the asset
}

export interface CollateralData {
  total_assets?: number // Total asset value in USD
  total_liabilities?: number // Total liabilities in USD
  overcollateralization_ratio?: number // Ratio (e.g., 1.05 = 105%)
  collateral_allocations: CollateralAllocation[]
  last_updated?: string // ISO date string
  report_url?: string // URL to the source report
  confidence: number // Confidence score (0-1) for the extracted data
  confidence_score?: number // Alternative name for confidence (0-1)
  extraction_method?: 'dom_parsing' | 'ai_extraction' | 'hybrid' | 'manual_mapping' | 'on_chain_analysis' | 'heuristic_fallback' | 'static_fallback' // Method used for extraction
}

// AI-powered collateral extraction interfaces
export interface AICollateralExtractionConfig {
  maxCostPerExtraction: number // Maximum cost in USD per extraction
  confidenceThreshold: number // Minimum confidence threshold (0-1)
  fallbackToAI: boolean // Whether to fallback to AI when DOM parsing fails
  cacheBasedOnConfidence: boolean // Use confidence-based cache TTL
  enableCaching?: boolean // Enable caching functionality
  fallbackStrategies?: string[] // Fallback strategies to use
  circuitBreakerEnabled?: boolean // Enable circuit breaker functionality
  timeoutMs?: number // Timeout in milliseconds
}

export interface ExtractionResult {
  success: boolean
  data?: CollateralData
  error?: string
  cost_usd: number
  extraction_time_ms: number
  method_used: 'dom_parsing' | 'ai_extraction' | 'hybrid' | 'manual_mapping' | 'on_chain_analysis' | 'heuristic_fallback'
  confidence: number
}

export interface ConfidenceBasedCacheEntry {
  data: CollateralData
  confidence: number
  cachedAt: number
  ttl: number
}

export interface AIExtractionMetrics {
  totalCost: number
  averageConfidence: number
  extractionCount: number
  successRate: number
  averageLatency: number
}

export interface CircuitBreakerStatus {
  isOpen: boolean
  failureCount: number
  lastFailure?: number
  nextRetry?: number
}

export interface WebsiteFormat {
  type: 'html' | 'pdf' | 'spa' | 'protected'
  requiresAuth: boolean
  hasJavaScript: boolean
  estimatedComplexity: 'low' | 'medium' | 'high'
}

export interface ExtractionStrategy {
  name: string
  priority: number
  estimatedCost: number
  estimatedLatency: number
  supportedFormats: WebsiteFormat['type'][]
}

export interface HybridExtractionResult {
  domResult?: Partial<CollateralData>
  aiResult?: Partial<CollateralData>  
  combinedResult: CollateralData
  confidence: number
  totalCost: number
  strategies: string[]
}

// Universal Collateral Discovery System Types

export interface CollateralDiscoveryConfig {
  enableTier1ManualMapping: boolean
  enableTier2AIExtraction: boolean
  enableTier3OnChain: boolean
  enableTier4Heuristics: boolean
  confidenceThresholds: {
    tier1: number // 0.9-1.0 (manual mapping)
    tier2: number // 0.6-0.9 (AI extraction)
    tier3: number // 0.7-0.95 (on-chain)
    tier4: number // 0.3-0.6 (heuristics)
  }
  fallbackStrategy: 'best_effort' | 'fail_fast'
  maxCostPerDiscovery: number
  firecrawlMcp?: any // Firecrawl MCP configuration
}

export interface OnChainCollateralData {
  contract_address: string
  chain: string
  total_supply?: bigint
  backing_assets?: Array<{
    token_address: string
    symbol: string
    balance: bigint
    value_usd: number
  }>
  reserves_ratio?: number
  last_block_checked: number
  data_freshness: 'real_time' | 'recent' | 'stale'
  confidence: number
  extraction_method: 'on_chain_read'
}

export interface ProtocolMechanism {
  type: 'algorithmic' | 'centralized' | 'over_collateralized' | 'synthetic' | 'hybrid' | 'crypto-collateralized'
  subtype?: string // e.g., 'rebase', 'burn_mint', 'cdp'
  backing_mechanism: string
  governance_model?: 'dao' | 'centralized' | 'hybrid'
  stability_mechanism: string[]
}

export interface ProtocolSpecificHandler {
  name: string
  supportedMechanisms: ProtocolMechanism['type'][]
  extractCollateralData(info: StablecoinInfo): Promise<CollateralDiscoveryResult>
  getConfidenceScore(data: CollateralData): number
  validateData(data: CollateralData): boolean
}

export interface CollateralDiscoveryResult {
  source_tier: 1 | 2 | 3 | 4
  discovery_method: 'manual_mapping' | 'ai_extraction' | 'on_chain_analysis' | 'heuristic_fallback'
  data: CollateralData
  confidence: number
  cost_usd: number
  extraction_time_ms: number
  fallback_reason?: string
}

export interface UniversalCollateralOrchestrationResult {
  primary_result: CollateralDiscoveryResult
  fallback_results: CollateralDiscoveryResult[]
  final_confidence: number
  total_cost_usd: number
  total_extraction_time_ms: number
  quality_assurance: {
    cross_validation_performed: boolean
    consistency_score: number
    data_completeness: number
  }
}

export interface HeuristicCollateralData {
  estimated_backing: 'full_reserves' | 'partial_reserves' | 'algorithmic' | 'over_collateralized'
  confidence_level: 'high' | 'medium' | 'low'
  reasoning: string[]
  market_cap_based_estimate?: number
  protocol_analysis?: {
    governance_tokens: boolean
    dao_treasury: boolean
    insurance_funds: boolean
  }
} 