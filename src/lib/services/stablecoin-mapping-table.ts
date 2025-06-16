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
  marketCapRank?: number // Approximate ranking to help prioritize updates
  notes?: string // Any important context about the data
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
    marketCapRank: 2,
    notes: 'Centre Consortium provides monthly attestations via Grant Thornton',
    genesis_date: '2018-09-26'
  },

  'USDT': {
    symbol: 'USDT',
    name: 'Tether',
    transparency: {
      dashboard_url: process.env.USDT_TRANSPARENCY_URL || 'https://tether.to/en/transparency/?tab=reports',
      attestation_provider: 'BDO Italia',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://github.com/Everdawn-Labs/usdt0-audit-reports',
    lastVerified: '2025-01-06',
    marketCapRank: 1,
    notes: 'BDO Italia provides quarterly attestations, transparency page updated monthly',
    genesis_date: '2014-10-06'
  },


  'FRAX': {
    symbol: 'FRAX',
    name: 'Frax',
    transparency: {
      dashboard_url: 'https://app.frax.finance/',
      attestation_provider: 'On-chain verification',
      update_frequency: 'daily',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://github.com/FraxFinance/frax-solidity/tree/master/src/audits',
    lastVerified: '2025-01-06',
    marketCapRank: 5,
    notes: 'Algorithmic + collateral backing, on-chain transparency',
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
    marketCapRank: 9,
    notes: 'Fully on-chain, ETH-only collateral, immutable protocol',
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
    audit_folder_url: '',
    lastVerified: '2025-01-06',
    marketCapRank: 10,
    notes: 'Hong Kong-regulated issuer with Mazars attestations'
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
    lastVerified: '2025-01-06',
    marketCapRank: 11,
    notes: 'Synthetic stablecoin with delta-hedging strategy, Chainlink PoR integration'
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
  lastVerified: '2025-01-06',
  marketCapRank: 12, // approximate, adjust with real rank if needed
  notes: 'Synthetic stablecoin backed by Sky Money with on-chain PoR and third-party audits'
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
    marketCapRank: 50, // approximate based on current market cap
    notes: 'M0 protocol stablecoin with institutional focus, comprehensive audit documentation',
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
    marketCapRank: 75, // approximate based on current market cap
    notes: 'Yield-bearing stablecoin with monthly NAV attestations stored in Dropbox shared folder',
    // Special handling for Dropbox attestation folder
    attestation_url: 'https://www.dropbox.com/scl/fo/375wdvar3rbc7o23nxsgp/AOFY8jhpENaNx9WAw-WPnbY?dl=0&rlkey=4icqn1z9bez725wywr30fx52a'
  },

  'USD1': {
    symbol: 'USD1',
    name: 'World Liberty Financial USD',
    transparency: {
      dashboard_url: 'https://www.bitgo.com/usd1/',
      attestation_provider: 'None',
      update_frequency: 'none',
      has_proof_of_reserves: false,
      verification_status: 'unverified'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25',
    marketCapRank: 10, // ~$2.1B market cap according to research
    notes: 'Trump-endorsed stablecoin with no transparency, no attestations, no audits. Claims 100% backing by US Treasuries but provides no evidence.'
  },

  'USDO': {
    symbol: 'USDO',
    name: 'OpenEden USD',
    transparency: {
      dashboard_url: 'https://openeden.com/usdo/transparency',
      attestation_provider: 'Chainlink Proof of Reserves',
      update_frequency: 'real-time',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://docs.openeden.com/usdo/risks',
    lastVerified: '2025-01-25',
    marketCapRank: 50,
    notes: 'Real-time transparency dashboard with Chainlink PoR feed. Backed by US Treasuries.'
  },

  'PYUSD': {
    symbol: 'PYUSD',
    name: 'PayPal USD',
    transparency: {
      dashboard_url: 'https://www.paxos.com/pyusd-transparency',
      attestation_provider: 'KPMG LLP',
      update_frequency: 'monthly',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://www.paxos.com/pyusd-transparency',
    lastVerified: '2025-01-25',
    marketCapRank: 15, // Major stablecoin by PayPal
    notes: 'Issued by regulated Paxos Trust Company. Monthly attestations by KPMG. Available on Ethereum and Solana.'
  },

  'USD0': {
    symbol: 'USD0',
    name: 'Usual USD',
    transparency: {
      dashboard_url: 'https://app.rwa.xyz/assets/USD0',
      attestation_provider: 'Hashnote',
      update_frequency: 'real-time',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://gitbook.usual.money/',
    lastVerified: '2025-01-25',
    marketCapRank: 25, // ~$618M market cap
    notes: 'Real-time transparency via RWA.xyz. Backed by short-term US Treasury Bills. Managed by Hashnote.'
  },

  'DEUSD': {
    symbol: 'DEUSD',
    name: 'Elixir deUSD',
    transparency: {
      dashboard_url: 'https://dashboard.elixir.xyz/',
      attestation_provider: 'Real-time on-chain verification',
      update_frequency: 'real-time',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://dedaub.com/audits/',
    lastVerified: '2025-01-25',
    marketCapRank: 30, // ~$126M backing assets
    notes: 'Real-time transparency dashboard. Backed by USDT, Staked USDS, and institutional RWA (BlackRock BUIDL, Hamilton Lane SCOPE).'
  },

  'USDB': {
    symbol: 'USDB',
    name: 'USD Balance',
    transparency: {
      dashboard_url: '',
      attestation_provider: 'Unknown',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unverified'
    },
    audit_folder_url: '',
    lastVerified: '2025-01-25',
    marketCapRank: 999,
    notes: 'Manual verification needed - limited information available'
  },

  'SUSD': {
    symbol: 'SUSD',
    name: 'Synthetix USD',
    transparency: {
      dashboard_url: 'https://synthetix.io/',
      attestation_provider: 'On-chain collateralization',
      update_frequency: 'real-time',
      has_proof_of_reserves: true,
      verification_status: 'verified'
    },
    audit_folder_url: 'https://docs.synthetix.io/security/',
    lastVerified: '2025-01-25',
    marketCapRank: 40,
    notes: 'Synthetic stablecoin backed by SNX collateral. Over-collateralized system with on-chain transparency.'
  }
}

/**
 * Trusted attestation providers ranked by reliability and reputation
 * Used for scoring transparency quality
 */
export const TRUSTED_ATTESTATION_PROVIDERS = {
  tier1: [
    'Grant Thornton LLP',
    'BDO Italia', 
    'Withum',
    'Armanino LLP',
    'BPM LLP',
    'Mazars',
    'On-chain verification',
    'Chainlink Proof of Reserve'
  ],
  tier2: [
    'Moore Cayman',
    'FSS (Forensic & Specialist Services)',
    'Top Seven Certified Public Accountants',
    'CohnReznick LLP',
    'Friedman LLP'
  ]
} as const

/**
 * Get transparency data for a known stablecoin
 */
export function getKnownTransparencyData(symbol: string): TransparencyData | null {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  return entry ? entry.transparency : null
}

/**
 * Get attestation URL for a known stablecoin (e.g., Dropbox folder with NAV reports)
 */
export function getKnownAttestationUrl(symbol: string): string | null {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  return entry?.attestation_url || null
}

/**
 * Get audit folder URL for a known stablecoin
 */
export function getKnownAuditFolderUrl(symbol: string): string | null {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  return entry?.audit_folder_url || null
}

/**
 * Check if a stablecoin is in our curated mapping
 */
export function isKnownStablecoin(symbol: string): boolean {
  return symbol.toUpperCase() in STABLECOIN_TRANSPARENCY_MAPPING
}

/**
 * Get full mapping entry for a known stablecoin
 */
export function getKnownStablecoinEntry(symbol: string): StablecoinMappingEntry | null {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  return entry || null
}

/**
 * Get genesis date for a known stablecoin
 */
export function getKnownGenesisDate(symbol: string): string | null {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  return entry?.genesis_date || null
}

/**
 * Get mapping metadata for maintenance purposes
 */
export function getMappingMetadata(symbol: string): Omit<StablecoinMappingEntry, 'transparency'> | null {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  if (!entry) return null
  
  const { transparency, ...metadata } = entry
  return metadata
}

/**
 * Check if a stablecoin has curated audit data
 */
export function hasKnownAuditData(symbol: string): boolean {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  return Boolean(entry?.audit_folder_url)
}

/**
 * Get all known stablecoin symbols
 */
export function getAllKnownSymbols(): string[] {
  return Object.keys(STABLECOIN_TRANSPARENCY_MAPPING)
}

/**
 * Check if mapping data might be stale (older than 90 days)
 */
export function isMappingDataStale(symbol: string): boolean {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  if (!entry) return false
  
  const lastVerified = new Date(entry.lastVerified)
  const ninetyDaysAgo = new Date()  
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  
  return lastVerified < ninetyDaysAgo
}

/**
 * Get statistics about mapping coverage
 */
export function getMappingStats() {
  const entries = Object.values(STABLECOIN_TRANSPARENCY_MAPPING)
  
  return {
    totalMapped: entries.length,
    withDashboards: entries.filter(e => e.transparency.dashboard_url).length,
    withAuditUrls: entries.filter(e => e.audit_folder_url).length,
    withPoR: entries.filter(e => e.transparency.has_proof_of_reserves).length,
    verifiedOnly: entries.filter(e => e.transparency.verification_status === 'verified').length,
    dailyUpdates: entries.filter(e => e.transparency.update_frequency === 'daily').length,
    lastUpdated: Math.max(...entries.map(e => new Date(e.lastVerified).getTime()))
  }
}

/**
 * Add a new stablecoin to the mapping table dynamically
 * This function appends new entries to the in-memory mapping and optionally persists them
 */
export function addNewStablecoinToMapping(
  symbol: string,
  name: string,
  coinGeckoId?: string,
  marketCapRank?: number,
  basicInfo?: {
    homepage?: string
    market_cap?: number
    genesis_date?: string
  }
): StablecoinMappingEntry {
  const newEntry: StablecoinMappingEntry = {
    symbol: symbol.toUpperCase(),
    name: name,
    transparency: {
      dashboard_url: '',
      attestation_provider: '',
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unknown'
    },
    audit_folder_url: '',
    lastVerified: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
    marketCapRank: marketCapRank || 999,
    notes: `Auto-discovered stablecoin - requires manual verification and data curation`
  }

  // Add to the in-memory mapping
  STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()] = newEntry

  console.log(`✅ Added new stablecoin to mapping table: ${symbol} (${name})`)
  
  // Log the addition for manual review
  console.log(`📝 New mapping entry created:`, {
    symbol: newEntry.symbol,
    name: newEntry.name,
    marketCapRank: newEntry.marketCapRank,
    needsManualReview: true
  })

  return newEntry
}

/**
 * Update an existing mapping entry with discovered transparency data
 */
export function updateMappingWithDiscoveredData(
  symbol: string,
  discoveredData: Partial<TransparencyData>,
  auditUrl?: string
): boolean {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  if (!entry) {
    return false
  }

  // Update transparency data with discovered information
  if (discoveredData.dashboard_url) {
    entry.transparency.dashboard_url = discoveredData.dashboard_url
  }
  if (discoveredData.attestation_provider) {
    entry.transparency.attestation_provider = discoveredData.attestation_provider
  }
  if (discoveredData.update_frequency) {
    entry.transparency.update_frequency = discoveredData.update_frequency
  }
  if (discoveredData.has_proof_of_reserves !== undefined) {
    entry.transparency.has_proof_of_reserves = discoveredData.has_proof_of_reserves
  }
  if (discoveredData.verification_status) {
    entry.transparency.verification_status = discoveredData.verification_status
  }

  // Update audit URL if provided
  if (auditUrl) {
    entry.audit_folder_url = auditUrl
  }

  // Update last verified date
  entry.lastVerified = new Date().toISOString().split('T')[0]
  
  // Update notes to indicate auto-discovery
  entry.notes = `Auto-updated with discovered data on ${entry.lastVerified} - requires manual verification`

  console.log(`✅ Updated mapping entry for ${symbol} with discovered data`)
  
  return true
}

/**
 * Generate a mapping table entry string for manual addition to the file
 * This helps with maintaining the mapping table file
 */
export function generateMappingEntryString(entry: StablecoinMappingEntry): string {
  return `
  '${entry.symbol}': {
    symbol: '${entry.symbol}',
    name: '${entry.name}',
    transparency: {
      dashboard_url: '${entry.transparency.dashboard_url}',
      attestation_provider: '${entry.transparency.attestation_provider}',
      update_frequency: '${entry.transparency.update_frequency}',
      has_proof_of_reserves: ${entry.transparency.has_proof_of_reserves},
      verification_status: '${entry.transparency.verification_status}'
    },
    audit_folder_url: '${entry.audit_folder_url}',
    lastVerified: '${entry.lastVerified}',
    marketCapRank: ${entry.marketCapRank},
    notes: '${entry.notes}'
  },`
}

/**
 * Get all auto-discovered entries that need manual review
 */
export function getAutoDiscoveredEntries(): StablecoinMappingEntry[] {
  return Object.values(STABLECOIN_TRANSPARENCY_MAPPING)
    .filter(entry => entry.notes?.includes('Auto-discovered') || entry.notes?.includes('Auto-updated'))
}

/**
 * Check if a stablecoin was auto-discovered and needs manual review
 */
export function needsManualReview(symbol: string): boolean {
  const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
  return Boolean(entry?.notes?.includes('Auto-discovered') || entry?.notes?.includes('Auto-updated'))
} 