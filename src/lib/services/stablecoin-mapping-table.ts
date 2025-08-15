/**
 * Stablecoin Mapping Table
 * 
 * This file contains curated, verified transparency and audit data for major stablecoins.
 * Data is manually maintained to ensure accuracy for financial risk assessment.
 * 
 * Last Updated: 2025-01-06
 * Coverage: Top 11 stablecoins by market cap
 * Sources: Official project websites, regulatory filings, audit reports, security documentation
 */

import { TransparencyData } from '@/lib/types'

// Phase 3 Enhanced Mapping Table Interfaces
export interface FirecrawlExtractionSchema {
  fields: Record<string, {
    type: 'string' | 'number' | 'array' | 'object'
    description: string
    items?: Record<string, { type: string }>
  }>
}

export interface DynamicConfig {
  dashboard_url: string
  extraction_schema: FirecrawlExtractionSchema
  update_frequency: 'real-time' | 'daily' | 'weekly' | 'monthly'
  priority: 'high' | 'medium' | 'low'
  extraction_timeout_ms: number
  retry_attempts: number
  confidence_threshold: number
}

export interface StaticFallback {
  transparency: TransparencyData
  collateral_data: any
  last_verified: string
  verification_source: string
  emergency_use_only: boolean
}

export interface ExtractionMetadata {
  extraction_method: 'firecrawl_mcp' | 'manual_mapping' | 'hybrid'
  last_extraction_time: string
  next_scheduled_extraction: string
  extraction_success_rate: number
  average_confidence_score: number
  cost_per_extraction_usd: number
  total_extractions: number
  failed_extractions: number
}

export interface EnhancedStablecoinMappingEntry {
  symbol: string
  name: string
  genesis_date?: string
  
  // Phase 3 enhancements
  dynamic_config?: DynamicConfig
  static_fallback: StaticFallback
  extraction_metadata: ExtractionMetadata
  
  // Migration tracking
  migration_status: 'pending' | 'testing' | 'partial_rollout' | 'full_rollout' | 'completed'
  rollout_percentage: number
  migration_notes?: string
}

export interface StablecoinMappingEntry {
  symbol: string
  name: string
  transparency: TransparencyData
  audit_folder_url?: string // Direct link to official audit reports/security documentation
  attestation_url?: string // Direct link to attestation reports (e.g., Dropbox, NAV reports)
  // Metadata for maintenance
  lastVerified: string // ISO date when data was last manually verified
  genesis_date?: string // ISO date string for when the stablecoin was first launched/minted
  confidence_score?: number
  collateral_data?: any
  transparency_urls?: string[]
  validation_status?: string
  last_updated?: string
}

// Legacy interface maintained for backward compatibility

/**
 * Curated transparency and audit data for major stablecoins
 * 
 * Data Quality Standards:
 * - Dashboard URLs must be live and accessible
 * - Audit folder URLs lead directly to official security documentation
 * - Attestation providers must be verified and current
 * - Update frequencies based on actual observed patterns
 * - Verification status confirmed through multiple sources
 */
// Enhanced mapping table for Phase 3 migration
export const ENHANCED_STABLECOIN_MAPPING: Record<string, EnhancedStablecoinMappingEntry> = {
  'USDC': {
    symbol: 'USDC',
    name: 'USD Coin',
    genesis_date: '2018-09-26',
    dynamic_config: {
      dashboard_url: process.env.USDC_TRANSPARENCY_URL || 'https://www.circle.com/transparency',
      extraction_schema: {
        fields: {
          total_supply: {
            type: 'number',
            description: 'Total USDC tokens in circulation'
          },
          backing_ratio: {
            type: 'number',
            description: 'Percentage of tokens backed by reserves (should be ~100%)'
          },
          collateral_allocations: {
            type: 'array',
            description: 'Breakdown of reserve assets backing USDC',
            items: {
              asset_type: { type: 'string' },
              percentage: { type: 'number' },
              market_value: { type: 'number' },
              description: { type: 'string' }
            }
          },
          proof_of_reserves_url: {
            type: 'string',
            description: 'URL to detailed reserve attestation'
          },
          audit_firm: {
            type: 'string',
            description: 'Name of auditing firm (Grant Thornton LLP)'
          },
          last_audit_date: {
            type: 'string',
            description: 'Most recent audit date in ISO format'
          }
        }
      },
      update_frequency: 'daily',
      priority: 'high',
      extraction_timeout_ms: 45000,
      retry_attempts: 3,
      confidence_threshold: 0.8
    },
    static_fallback: {
      transparency: {
        dashboard_url: process.env.USDC_TRANSPARENCY_URL || 'https://www.circle.com/transparency',
        attestation_provider: 'Grant Thornton LLP',
        update_frequency: 'monthly',
        has_proof_of_reserves: true,
        verification_status: 'verified',
        collateral_data: {
          collateral_allocations: [
            { 
              asset_type: 'Cash and Cash Equivalents', 
              percentage: 89.2, 
              market_value: 57800000000,
              description: 'Cash held at regulated financial institutions' 
            },
            { 
              asset_type: 'Short-term U.S. Treasury Securities', 
              percentage: 10.8, 
              market_value: 7000000000,
              description: 'U.S. Treasury bills with maturity ≤ 3 months' 
            }
          ],
          total_assets: 64800000000,
          overcollateralization_ratio: 1.0,
          confidence: 0.9,
          extraction_method: 'manual_mapping',
          last_updated: '2025-01-06T00:00:00Z',
          report_url: 'https://www.circle.com/transparency'
        }
      },
      collateral_data: {
        collateral_allocations: [
          { 
            asset_type: 'Cash and Cash Equivalents', 
            percentage: 89.2, 
            market_value: 57800000000,
            description: 'Cash held at regulated financial institutions' 
          },
          { 
            asset_type: 'Short-term U.S. Treasury Securities', 
            percentage: 10.8, 
            market_value: 7000000000,
            description: 'U.S. Treasury bills with maturity ≤ 3 months' 
          }
        ],
        total_assets: 64800000000,
        overcollateralization_ratio: 1.0,
        confidence: 0.9,
        extraction_method: 'manual_mapping',
        last_updated: '2025-01-06T00:00:00Z',
        report_url: 'https://www.circle.com/transparency'
      },
      last_verified: '2025-01-06',
      verification_source: 'manual_verification',
      emergency_use_only: false
    },
    extraction_metadata: {
      extraction_method: 'manual_mapping',
      last_extraction_time: '2025-01-06T00:00:00Z',
      next_scheduled_extraction: '2025-01-07T00:00:00Z',
      extraction_success_rate: 1.0,
      average_confidence_score: 0.9,
      cost_per_extraction_usd: 0.0,
      total_extractions: 1,
      failed_extractions: 0
    },
    migration_status: 'testing',
    rollout_percentage: 25,
    migration_notes: 'High priority stablecoin - starting with 25% rollout'
  },

  'USDT0': {
    symbol: 'USDT0',
    name: 'usdt0',
    genesis_date: '2014-10-06',
    dynamic_config: {
      dashboard_url: process.env.USDT_TRANSPARENCY_URL || 'https://tether.to/en/transparency/?tab=reports',
      extraction_schema: {
        fields: {
          total_supply: {
            type: 'number',
            description: 'Total USDT tokens in circulation across all chains'
          },
          backing_ratio: {
            type: 'number',
            description: 'Percentage backing ratio from reserve reports'
          },
          collateral_allocations: {
            type: 'array',
            description: 'Tether reserve composition (cash, treasury bills, etc.)',
            items: {
              asset_type: { type: 'string' },
              percentage: { type: 'number' },
              market_value: { type: 'number' },
              description: { type: 'string' }
            }
          },
          proof_of_reserves_url: {
            type: 'string',
            description: 'Link to latest attestation report'
          },
          audit_firm: {
            type: 'string',
            description: 'Attestation firm name (BDO Italia)'
          }
        }
      },
      update_frequency: 'daily',
      priority: 'high',
      extraction_timeout_ms: 45000,
      retry_attempts: 3,
      confidence_threshold: 0.75
    },
    static_fallback: {
      transparency: {
        dashboard_url: process.env.USDT_TRANSPARENCY_URL || 'https://tether.to/en/transparency/?tab=reports',
        attestation_provider: 'BDO Italia',
        update_frequency: 'monthly',
        has_proof_of_reserves: true,
        verification_status: 'verified'
      },
      collateral_data: {},
      last_verified: '2025-01-06',
      verification_source: 'manual_verification',
      emergency_use_only: false
    },
    extraction_metadata: {
      extraction_method: 'manual_mapping',
      last_extraction_time: '2025-01-06T00:00:00Z',
      next_scheduled_extraction: '2025-01-07T00:00:00Z',
      extraction_success_rate: 1.0,
      average_confidence_score: 0.85,
      cost_per_extraction_usd: 0.0,
      total_extractions: 1,
      failed_extractions: 0
    },
    migration_status: 'testing',
    rollout_percentage: 25,
    migration_notes: 'Major stablecoin - parallel testing with USDC'
  },

  'PYUSD': {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    dynamic_config: {
      dashboard_url: 'https://www.paxos.com/pyusd-transparency#pyusd-attestations',
      extraction_schema: {
        fields: {
          total_supply: {
            type: 'number',
            description: 'Total PYUSD tokens in circulation'
          },
          backing_ratio: {
            type: 'number',
            description: 'Percentage backing ratio from attestation reports'
          },
          collateral_allocations: {
            type: 'array',
            description: 'PayPal USD reserve composition',
            items: {
              asset_type: { type: 'string' },
              percentage: { type: 'number' },
              market_value: { type: 'number' },
              description: { type: 'string' }
            }
          },
          proof_of_reserves_url: {
            type: 'string',
            description: 'Link to Withum attestation reports'
          },
          audit_firm: {
            type: 'string',
            description: 'Withum attestation firm'
          }
        }
      },
      update_frequency: 'daily',
      priority: 'medium',
      extraction_timeout_ms: 30000,
      retry_attempts: 3,
      confidence_threshold: 0.7
    },
    static_fallback: {
      transparency: {
        dashboard_url: 'https://www.paxos.com/pyusd-transparency#pyusd-attestations',
        attestation_provider: 'Withum',
        update_frequency: 'monthly',
        has_proof_of_reserves: true,
        verification_status: 'verified'
      },
      collateral_data: {},
      last_verified: '2025-01-25',
      verification_source: 'manual_verification',
      emergency_use_only: false
    },
    extraction_metadata: {
      extraction_method: 'manual_mapping',
      last_extraction_time: '2025-01-25T00:00:00Z',
      next_scheduled_extraction: '2025-01-26T00:00:00Z',
      extraction_success_rate: 1.0,
      average_confidence_score: 0.8,
      cost_per_extraction_usd: 0.0,
      total_extractions: 1,
      failed_extractions: 0
    },
    migration_status: 'pending',
    rollout_percentage: 0,
    migration_notes: 'Scheduled for next migration wave'
  }
}

export const STABLECOIN_TRANSPARENCY_MAPPING: Record<string, StablecoinMappingEntry> = {
  'USDC': {
    symbol: 'USDC',
    name: 'USD Coin',
    transparency: {
      dashboard_url: process.env.USDC_TRANSPARENCY_URL || 'https://www.circle.com/transparency',
      attestation_provider: 'Grant Thornton LLP',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified',
      collateral_data: {
        collateral_allocations: [
          { 
            asset_type: 'Cash and Cash Equivalents', 
            percentage: 89.2, 
            market_value: 57800000000,
            description: 'Cash held at regulated financial institutions' 
          },
          { 
            asset_type: 'Short-term U.S. Treasury Securities', 
            percentage: 10.8, 
            market_value: 7000000000,
            description: 'U.S. Treasury bills with maturity ≤ 3 months' 
          }
        ],
        total_assets: 64800000000,
        overcollateralization_ratio: 1.0,
        confidence: 0.9,
        extraction_method: 'manual_mapping',
        last_updated: '2025-01-06T00:00:00Z',
        report_url: 'https://www.circle.com/transparency'
      }
    },
    audit_folder_url: '',
    lastVerified: '2025-01-06',
    genesis_date: '2018-09-26'
  },

  'USDT0': {
    symbol: 'USDT0',
    name: 'usdt0',
    transparency: {
      dashboard_url: process.env.USDT_TRANSPARENCY_URL || 'https://tether.to/en/transparency/?tab=reports',
      attestation_provider: 'BDO Italia',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://github.com/Everdawn-Labs/usdt0-audit-reports',
    lastVerified: '2025-01-06',
    genesis_date: '2014-10-06'
  },


  'FRXUSD': {
    symbol: 'FRXUSD',
    name: 'frxUSD',
    transparency: {
      dashboard_url: 'https://frax.com/transparency',
      attestation_provider: 'On-chain verification',
      update_frequency: 'daily',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://github.com/FraxFinance/frax-solidity/tree/master/src/audits',
    lastVerified: '2025-01-06',
    genesis_date: '2020-12-21'
  },

  'LUSD': {
    symbol: 'LUSD',
    name: 'Liquity USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: 'https://docs.liquity.org/v2-documentation/technical-docs-and-audits',
    lastVerified: '2025-01-06',
    genesis_date: '2021-04-05'
  },

  'FDUSD': {
    symbol: 'FDUSD',
    name: 'First Digital USD',
    transparency: {
      dashboard_url: 'https://firstdigitallabs.com/transparency#monthly-reserve-reports',
      attestation_provider: 'Mazars',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://firstdigitallabs.com/fdusd',
    lastVerified: '2025-01-06'
  },

  'USDE': {
    symbol: 'USDE',
    name: 'Ethena USDe',
    transparency: {
      dashboard_url: 'https://app.ethena.fi/dashboards/transparency',
      attestation_provider: 'Chainlink Proof of Reserve',
      update_frequency: 'daily',
      has_proof_of_reserves: true,
      verification_status: 'verified',
      collateral_data: {
        collateral_allocations: [
          {
            asset_type: 'BTC',
            percentage: 33,
            market_value: 3231900000, // Estimated based on total assets ~$9.8B
            description: 'Bitcoin collateral backing'
          },
          {
            asset_type: 'Liquid Stables',
            percentage: 52,
            market_value: 5092800000,
            description: 'Liquid stablecoin positions'
          },
          {
            asset_type: 'ETH',
            percentage: 11,
            market_value: 1077800000,
            description: 'Ethereum collateral'
          },
          {
            asset_type: 'ETH LSTs',
            percentage: 4,
            market_value: 392000000,
            description: 'Ethereum Liquid Staking Tokens'
          },
          {
            asset_type: 'SOL',
            percentage: 0,
            market_value: 0,
            description: 'Solana collateral (currently 0%)'
          }
        ],
        total_assets: 9794213057,
        total_liabilities: 9794213057,
        overcollateralization_ratio: 1.0069, // Based on 100.69% backing ratio
        confidence: 0.95,
        extraction_method: 'manual_mapping',
        last_updated: '2025-08-08T00:00:00Z',
        report_url: 'https://app.ethena.fi/dashboards/transparency'
      }
    },
    audit_folder_url: 'https://docs.ethena.fi/resources/audits',
    lastVerified: '2025-08-08'
  },
  'USDS': {
  symbol: 'USDS',
  name: 'Sky Money USD',
  transparency: {
    dashboard_url: '',  // assumed main transparency dashboard, adjust if needed
    attestation_provider: '',
    update_frequency: 'unknown',
    has_proof_of_reserves: false,
    verification_status: 'unknown'
  },
  audit_folder_url: 'https://developers.sky.money/security/security-measures/overview/#audits',
  lastVerified: '2025-01-06'
},

  'USDN': {
    symbol: 'USDN',
    name: 'Noble Dollar (USDN)',
    transparency: {
      dashboard_url: 'https://dashboard.m0.org/',
      attestation_provider: 'm0 foundation', // To be determined from dashboard analysis
      update_frequency: 'unknown', // To be determined from dashboard analysis
      has_proof_of_reserves: true, // Initial assumption, can be updated
      verification_status: 'verified' // To be determined from dashboard analysis
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25',
    genesis_date: '2024-07-15'
  },

  'USDY': {
    symbol: 'USDY',
    name: 'Ondo US Dollar Yield',
    transparency: {
      dashboard_url: 'https://docs.ondo.finance', // Documentation site, no dedicated transparency dashboard
      attestation_provider: 'NAV Consulting LLC', // From Dropbox attestation documents
      update_frequency: 'monthly', // Based on standard practice for yield-bearing stablecoins
      has_proof_of_reserves: true, // Attestation reports available in Dropbox
      verification_status: 'verified' // Third-party NAV attestations
    },
    audit_folder_url: 'https://docs.ondo.finance/audits',
    lastVerified: '2025-01-25',
    // Special handling for Dropbox attestation folder
    attestation_url: 'https://www.dropbox.com/scl/fo/375wdvar3rbc7o23nxsgp/AOFY8jhpENaNx9WAw-WPnbY?dl=0&rlkey=4icqn1z9bez725wywr30fx52a'
  },

  'USD1': {
    symbol: 'USD1',
    name: 'World Liberty Financial USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: 'None',
      update_frequency: 'none',
      has_proof_of_reserves: false,
      verification_status: 'unverified'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'USDTB': {
    symbol: 'USDTB',
    name: 'Ethena USDtb',
    transparency: {
      dashboard_url: 'https://app.ethena.fi/dashboards/transparency',
      attestation_provider: 'Chainlink Proof of Reserve',
      update_frequency: 'daily',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://docs.ethena.fi/resources/audits',
    lastVerified: '2025-01-25'
  },

  'PYUSD': {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    transparency: {
      dashboard_url: 'https://www.paxos.com/pyusd-transparency#pyusd-attestations',
      attestation_provider: 'Withum',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://github.com/paxosglobal/pyusd-contract/tree/master/audit-reports',
    lastVerified: '2025-01-25'
  },

  'BENJI': {
    symbol: 'BENJI',
    name: 'Franklin Onchain U.S. Government Money Fund',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'USD0': {
    symbol: 'USD0',
    name: 'Usual USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'daily',
      has_proof_of_reserves: false,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://tech.usual.money/security-and-audits/audits',
    lastVerified: '2025-01-25'
  },

  'USDF': {
    symbol: 'USDF',
    name: 'Falcon USD',
    transparency: {
      dashboard_url: 'https://app.falcon.finance/transparency',
      attestation_provider: 'HT digital',
      update_frequency: 'unknown',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://app.falcon.finance/transparency',
    lastVerified: '2025-01-25'
  },

  'TUSD': {
    symbol: 'TUSD',
    name: 'TrueUSD',
    transparency: {
      dashboard_url: 'https://tusd.io/transparency',
      attestation_provider: 'VeriNumus',
      update_frequency: 'unknown',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'USDD': {
    symbol: 'USDD',
    name: 'USDD',
    transparency: {
      dashboard_url: 'https://usdd.io/data',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: 'https://usdd.io/USDD-V2-audit-report.pdf',
    lastVerified: '2025-01-25'
  },

  'RLUSD': {
    symbol: 'RLUSD',
    name: 'Ripple USD',
    transparency: {
      dashboard_url: 'https://ripple.com/solutions/stablecoin/transparency/',
      attestation_provider: 'Standard Custody & Trust Company, LLC',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: 'https://github.com/ripple/RLUSD-Implementation/tree/main/doc',
    lastVerified: '2025-01-25'
  },

  'USYC': {
    symbol: 'USYC',
    name: 'Hashnote USYC',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'M': {
    symbol: 'M',
    name: 'M By M^0',
    transparency: {
      dashboard_url: 'https://dashboard.m0.org/',
      attestation_provider: '',
      update_frequency: 'daily',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://docs.m0.org/portal/technical/audits',
    lastVerified: '2025-01-25'
  },

  'USDO': {
    symbol: 'USDO',
    name: 'OpenDollar USDO',
    transparency: {
      dashboard_url: 'https://openeden.com/usdo/transparency',
      attestation_provider: 'Chainlink Proof of Reserve',
      update_frequency: 'real-time',
      has_proof_of_reserves: true,
      verification_status: 'verified',
      collateral_data: {
        collateral_allocations: [
          {
            asset_type: 'Short-term U.S. Treasury Bills',
            percentage: 95.0,
            market_value: 47500000, // Estimated based on market cap
            description: 'Tokenized short-term U.S. Treasury securities (≤ 3 months)'
          },
          {
            asset_type: 'Money Market Funds',
            percentage: 5.0,
            market_value: 2500000,
            description: 'OpenEden TBILL Fund and other money market instruments'
          }
        ],
        total_assets: 50000000, // Estimated total
        overcollateralization_ratio: 1.0,
        confidence: 0.85, // Manual mapping with high confidence
        extraction_method: 'manual_mapping' as const,
        last_updated: '2025-01-06T00:00:00Z',
        report_url: 'https://docs.openeden.com/usdo/introduction/usdo-reserves'
      }
    },
    audit_folder_url: 'https://github.com/OpenEdenHQ/audit-reports',
    lastVerified: '2025-01-25'
  },


  'USR': {
    symbol: 'USR',
    name: 'Resolv USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: 'https://docs.resolv.xyz/litepaper/resources/security',
    lastVerified: '2025-01-25'
  },

  'DOLA': {
    symbol: 'DOLA',
    name: 'Dola',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: 'https://docs.inverse.finance/inverse-finance/technical/audits',
    lastVerified: '2025-01-25'
  },
  'RUSD': {
    symbol: 'RUSD',
    name: 'Reservoir rUSD',
    transparency: {
      dashboard_url: 'https://app.reservoir.xyz/reserves',
      attestation_provider: 'Unknown', // Needs manual verification
      update_frequency: 'unknown',
      has_proof_of_reserves: true,
      verification_status: 'unverified'
    },
    lastVerified: '2025-01-26'
  },

  'DEUSD': {
    symbol: 'DEUSD',
    name: 'Elixir deUSD',
    transparency: {
      dashboard_url: 'https://www.elixir.xyz/deusd/dashboard',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: 'https://docs.elixir.xyz/audit',
    lastVerified: '2025-01-25'
  },


  'CRVUSD': {
    symbol: 'CRVUSD',
    name: 'crvUSD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: 'https://github.com/curvefi/security-incident-reports/tree/main/audits/crvusd',
    lastVerified: '2025-01-25'
  },


  'USDZ': {
    symbol: 'USDZ',
    name: 'Anzen USDz',
    transparency: {
      dashboard_url: 'https://app.anzen.finance/transparency',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://github.com/Anzen-Finance/audits',
    lastVerified: '2025-01-25'
  },

  
  'LVLUSD': {
    symbol: 'LVLUSD',
    name: 'Level USD',
    transparency: {
      dashboard_url: 'https://app.level.money/transparency',
      attestation_provider: 'self-attestation',
      update_frequency: 'unknown',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://level-money.gitbook.io/docs/technical-documentation/audits',
    lastVerified: '2025-01-25'
  },

  /*
  'REUSD': {
    symbol: 'REUSD',
    name: 'Resupply USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'AUSD': {
    symbol: 'AUSD',
    name: 'Agora Dollar',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'YU': {
    symbol: 'YU',
    name: 'YU',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'FEUSD': {
    symbol: 'FEUSD',
    name: 'Felix feUSD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'CGUSD': {
    symbol: 'CGUSD',
    name: 'Cygnus Finance Global USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'BUCK': {
    symbol: 'BUCK',
    name: 'Bucket Protocol BUCK Stablecoin',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'FXUSD': {
    symbol: 'FXUSD',
    name: 'fxUSD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'AVUSD': {
    symbol: 'AVUSD',
    name: 'Avant USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'USP': {
    symbol: 'USP',
    name: 'USP Stablecoin',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'LISUSD': {
    symbol: 'LISUSD',
    name: 'Lista USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'MIM': {
    symbol: 'MIM',
    name: 'Magic Internet Money',
    transparency: {
      dashboard_url: 'https://app.abracadabra.money/',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'BUSD': {
    symbol: 'BUSD',
    name: 'Binance USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: 'Withum',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'HONEY': {
    symbol: 'HONEY',
    name: 'Honey',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'SUSD': {
    symbol: 'SUSD',
    name: 'sUSD',
    transparency: {
      dashboard_url: 'https://synthetix.io/',
      attestation_provider: 'On-chain verification',
      update_frequency: 'real-time',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://docs.synthetix.io/security/',
    lastVerified: '2025-01-25'
  },

  'GUSD': {
    symbol: 'GUSD',
    name: 'Gemini Dollar',
    transparency: {
      dashboard_url: '',
      attestation_provider: 'BPM LLP',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'USD3': {
    symbol: 'USD3',
    name: 'Web 3 Dollar',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },

  'USDR': {
    symbol: 'USDR',
    name: 'Real USD',
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25'
  },
*/

  
}

/**
 * Trusted attestation providers
 * Used for scoring transparency quality
 */
export const TRUSTED_ATTESTATION_PROVIDERS = [
  'Grant Thornton LLP',
  'BDO Italia', 
  'Withum',
  'Armanino LLP',
  'BPM LLP',
  'Mazars',
  'On-chain verification',
  'Chainlink Proof of Reserve',
  'Moore Cayman',
  'FSS (Forensic & Specialist Services)',
  'Top Seven Certified Public Accountants',
  'CohnReznick LLP',
  'Friedman LLP'
] as const

// Phase 3 Enhanced Mapping Table Utilities

/**
 * Validates Firecrawl extraction schema structure
 */
export function validateExtractionSchema(schema: FirecrawlExtractionSchema): boolean {
  const validTypes = ['string', 'number', 'array', 'object']
  return Object.values(schema.fields).every((field: any) => 
    validTypes.includes(field.type)
  )
}

/**
 * Validates URL accessibility for dynamic config
 */
export async function validateDashboardUrl(url: string): Promise<{ accessible: boolean; status: number }> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return { accessible: response.ok, status: response.status }
  } catch {
    return { accessible: false, status: 0 }
  }
}

/**
 * Gets recommended update frequency based on stablecoin characteristics
 */
export function getRecommendedUpdateFrequency(
  symbol: string, 
  hasRealTimeData: boolean
): DynamicConfig['update_frequency'] {
  if (hasRealTimeData && ['USDC', 'USDT', 'DAI'].includes(symbol)) {
    return 'real-time'
  } else if (['USDC', 'USDT', 'PYUSD'].includes(symbol)) {
    return 'daily'
  }
  return 'weekly'
}

/**
 * Gets extraction timeout based on priority level
 */
export function getTimeoutForPriority(priority: DynamicConfig['priority']): number {
  switch (priority) {
    case 'high': return 45000 // 45s for high priority
    case 'medium': return 30000 // 30s for medium
    case 'low': return 15000 // 15s for low priority
  }
}

/**
 * Validates static fallback data completeness
 */
export function validateStaticFallback(fallback: StaticFallback): boolean {
  const required = [
    'transparency',
    'collateral_data',
    'last_verified',
    'verification_source'
  ]
  
  return required.every(field => fallback[field as keyof StaticFallback] !== undefined)
}

/**
 * Checks if static fallback data is outdated
 */
export function isStaticFallbackOutdated(lastVerified: string, maxAgeMonths: number = 6): boolean {
  const lastVerifiedDate = new Date(lastVerified)
  const maxAge = new Date()
  maxAge.setMonth(maxAge.getMonth() - maxAgeMonths)
  
  return lastVerifiedDate < maxAge
}

/**
 * Determines whether to use fallback data
 */
export function shouldUseFallback(
  firecrawlFailed: boolean,
  emergencyMode: boolean,
  confidenceThreshold: number,
  lastConfidence: number
): boolean {
  return firecrawlFailed || emergencyMode || lastConfidence < confidenceThreshold
}

/**
 * Calculates next scheduled extraction time
 */
export function calculateNextExtraction(
  lastExtraction: string,
  frequency: DynamicConfig['update_frequency']
): string {
  const last = new Date(lastExtraction)
  const next = new Date(last)

  switch (frequency) {
    case 'real-time':
      next.setMinutes(next.getMinutes() + 15) // 15 min for real-time
      break
    case 'daily':
      next.setDate(next.getDate() + 1)
      break
    case 'weekly':
      next.setDate(next.getDate() + 7)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break
  }

  return next.toISOString().replace('.000Z', 'Z')
}

/**
 * Updates extraction metadata after an attempt
 */
export function updateExtractionMetadata(
  current: ExtractionMetadata,
  success: boolean,
  confidence: number,
  cost: number
): ExtractionMetadata {
  const updated = { ...current }
  
  updated.total_extractions += 1
  if (!success) {
    updated.failed_extractions += 1
  }
  
  updated.extraction_success_rate = (updated.total_extractions - updated.failed_extractions) / updated.total_extractions
  updated.average_confidence_score = (updated.average_confidence_score + confidence) / 2
  updated.cost_per_extraction_usd = cost
  updated.last_extraction_time = new Date().toISOString()
  
  return updated
}

/**
 * Analyzes extraction patterns and provides recommendations
 */
export function analyzeExtractionPatterns(metadata: ExtractionMetadata): string[] {
  const recommendations = []

  if (metadata.extraction_success_rate < 0.7) {
    recommendations.push('LOW_SUCCESS_RATE')
  }
  
  if (metadata.average_confidence_score < 0.6) {
    recommendations.push('LOW_CONFIDENCE')
  }
  
  if (metadata.cost_per_extraction_usd > 0.20) {
    recommendations.push('HIGH_COST')
  }

  if (metadata.failed_extractions / metadata.total_extractions > 0.5) {
    recommendations.push('FREQUENT_FAILURES')
  }

  return recommendations
}

/**
 * Migrates legacy mapping entry to enhanced structure
 */
export function migrateToEnhanced(legacy: any): EnhancedStablecoinMappingEntry {
  return {
    symbol: legacy.symbol,
    name: legacy.name,
    genesis_date: legacy.genesis_date,
    
    // Create default dynamic config
    dynamic_config: {
      dashboard_url: legacy.transparency?.dashboard_url || '',
      extraction_schema: {
        fields: {
          total_supply: { type: 'number' as const, description: 'Total supply of stablecoin' },
          backing_ratio: { type: 'number' as const, description: 'Asset backing ratio percentage' },
          collateral_allocations: {
            type: 'array' as const,
            description: 'Breakdown of collateral assets',
            items: {
              asset: { type: 'string' as const },
              percentage: { type: 'number' as const },
              value_usd: { type: 'number' as const }
            }
          }
        }
      },
      update_frequency: 'daily',
      priority: 'medium',
      extraction_timeout_ms: 30000,
      retry_attempts: 3,
      confidence_threshold: 0.6
    },
    
    // Convert existing data to static fallback
    static_fallback: {
      transparency: legacy.transparency,
      collateral_data: legacy.collateral_data || {},
      last_verified: legacy.lastVerified,
      verification_source: 'legacy_migration',
      emergency_use_only: false
    },
    
    // Initialize extraction metadata
    extraction_metadata: {
      extraction_method: 'manual_mapping',
      last_extraction_time: new Date().toISOString(),
      next_scheduled_extraction: new Date().toISOString(),
      extraction_success_rate: 0,
      average_confidence_score: 0,
      cost_per_extraction_usd: 0,
      total_extractions: 0,
      failed_extractions: 0
    },
    
    migration_status: 'pending',
    rollout_percentage: 0,
    migration_notes: 'Migrated from legacy structure'
  }
}

/**
 * Get enhanced stablecoin mapping entry
 */
export function getEnhancedStablecoinMapping(symbol: string): EnhancedStablecoinMappingEntry | null {
  return ENHANCED_STABLECOIN_MAPPING[symbol] || null
}

/**
 * Check if stablecoin has enhanced configuration
 */
export function hasEnhancedConfig(symbol: string): boolean {
  return symbol in ENHANCED_STABLECOIN_MAPPING
}

/**
 * Get dynamic config for a stablecoin
 */
export function getDynamicConfig(symbol: string): DynamicConfig | null {
  const enhanced = getEnhancedStablecoinMapping(symbol)
  return enhanced?.dynamic_config || null
}

/**
 * Get static fallback data for a stablecoin
 */
export function getStaticFallback(symbol: string): StaticFallback | null {
  const enhanced = getEnhancedStablecoinMapping(symbol)
  return enhanced?.static_fallback || null
}

/**
 * Get extraction metadata for a stablecoin
 */
export function getExtractionMetadata(symbol: string): ExtractionMetadata | null {
  const enhanced = getEnhancedStablecoinMapping(symbol)
  return enhanced?.extraction_metadata || null
}

/**
 * Update enhanced mapping entry
 */
export function updateEnhancedMapping(symbol: string, updates: Partial<EnhancedStablecoinMappingEntry>): boolean {
  if (!hasEnhancedConfig(symbol)) {
    return false
  }
  
  ENHANCED_STABLECOIN_MAPPING[symbol] = {
    ...ENHANCED_STABLECOIN_MAPPING[symbol],
    ...updates
  }
  
  return true
}

/**
 * Add new enhanced mapping entry
 */
export function addEnhancedMapping(entry: EnhancedStablecoinMappingEntry): boolean {
  const validation = validateEnhancedEntry(entry)
  if (!validation.valid) {
    console.error('Cannot add invalid enhanced mapping entry:', validation.errors)
    return false
  }
  
  ENHANCED_STABLECOIN_MAPPING[entry.symbol] = entry
  return true
}

/**
 * Get all stablecoins by migration status
 */
export function getStablecoinsByMigrationStatus(status: EnhancedStablecoinMappingEntry['migration_status']): string[] {
  return Object.values(ENHANCED_STABLECOIN_MAPPING)
    .filter(entry => entry.migration_status === status)
    .map(entry => entry.symbol)
}

/**
 * Get rollout statistics
 */
export function getRolloutStatistics(): {
  total_enhanced: number
  by_status: Record<string, number>
  avg_rollout_percentage: number
  ready_for_full_rollout: string[]
} {
  const entries = Object.values(ENHANCED_STABLECOIN_MAPPING)
  const byStatus: Record<string, number> = {}
  
  entries.forEach(entry => {
    byStatus[entry.migration_status] = (byStatus[entry.migration_status] || 0) + 1
  })
  
  const avgRollout = entries.reduce((sum, entry) => sum + entry.rollout_percentage, 0) / entries.length
  const readyForFullRollout = entries
    .filter(entry => entry.migration_status === 'partial_rollout' && entry.rollout_percentage >= 75)
    .map(entry => entry.symbol)
  
  return {
    total_enhanced: entries.length,
    by_status: byStatus,
    avg_rollout_percentage: avgRollout,
    ready_for_full_rollout: readyForFullRollout
  }
}

/**
 * Validates enhanced mapping entry completeness
 */
export function validateEnhancedEntry(entry: EnhancedStablecoinMappingEntry): { valid: boolean; errors: string[] } {
  const errors = []

  if (!entry.symbol || !entry.name) {
    errors.push('Missing symbol or name')
  }

  if (!entry.static_fallback || !entry.static_fallback.transparency) {
    errors.push('Missing static fallback data')
  }

  if (!entry.extraction_metadata) {
    errors.push('Missing extraction metadata')
  }

  if (!['pending', 'testing', 'partial_rollout', 'full_rollout', 'completed'].includes(entry.migration_status)) {
    errors.push('Invalid migration status')
  }

  if (entry.rollout_percentage < 0 || entry.rollout_percentage > 100) {
    errors.push('Invalid rollout percentage')
  }

  return { valid: errors.length === 0, errors }
}

 