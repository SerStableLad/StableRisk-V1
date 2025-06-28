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

export interface StablecoinMappingEntry {
  symbol: string
  name: string
  transparency: TransparencyData
  audit_folder_url?: string // Direct link to official audit reports/security documentation
  attestation_url?: string // Direct link to attestation reports (e.g., Dropbox, NAV reports)
  // Metadata for maintenance
  lastVerified: string // ISO date when data was last manually verified
  genesis_date?: string // ISO date string for when the stablecoin was first launched/minted
}

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
export const STABLECOIN_TRANSPARENCY_MAPPING: Record<string, StablecoinMappingEntry> = {
  'USDC': {
    symbol: 'USDC',
    name: 'USD Coin',
    transparency: {
      dashboard_url: process.env.USDC_TRANSPARENCY_URL || 'https://www.circle.com/transparency',
      attestation_provider: 'Grant Thornton LLP',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified'
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
      verification_status: 'verified'
    },
    audit_folder_url: 'https://docs.ethena.fi/resources/audits',
    lastVerified: '2025-01-06'
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
      attestation_provider: '', // To be determined from dashboard analysis
      update_frequency: 'unknown', // To be determined from dashboard analysis
      has_proof_of_reserves: false, // Initial assumption, can be updated
      verification_status: 'unknown' // To be determined from dashboard analysis
    },
    audit_folder_url: 'https://docs.m0.org/portal/technical/audits',
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
      verification_status: 'verified'
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

 