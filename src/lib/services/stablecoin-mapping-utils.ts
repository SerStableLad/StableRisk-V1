/**
 * Stablecoin Mapping Utilities
 * 
 * Utility functions for working with the stablecoin mapping table data.
 * Separated from data for better maintainability and clean imports.
 * 
 * Last Updated: 2025-01-26
 */

import { TransparencyData } from '@/lib/types'
import { STABLECOIN_TRANSPARENCY_MAPPING, StablecoinMappingEntry, TRUSTED_ATTESTATION_PROVIDERS } from './stablecoin-mapping-table'

/**
 * Symbol mapping for legacy/alternative names
 * Maps old or alternative symbols to their canonical symbols in our system
 */
const SYMBOL_MAPPINGS: Record<string, string> = {
  'FRAX': 'FRXUSD',
  'USDT': 'USDT0'
}

/**
 * Get the canonical symbol for a given symbol, handling legacy mappings
 * @param symbol - The input symbol (case-insensitive)
 * @returns The canonical symbol that should be used in the system
 */
export function getCanonicalSymbol(symbol: string): string {
  const upperSymbol = symbol.toUpperCase().trim()
  return SYMBOL_MAPPINGS[upperSymbol] || upperSymbol
}

/**
 * Check if a symbol needs to be redirected to its canonical form
 * @param symbol - The input symbol
 * @returns Object with redirect info: { shouldRedirect: boolean, canonicalSymbol: string }
 */
export function checkSymbolRedirect(symbol: string): { shouldRedirect: boolean, canonicalSymbol: string } {
  const upperSymbol = symbol.toUpperCase().trim()
  const canonicalSymbol = SYMBOL_MAPPINGS[upperSymbol]
  
  return {
    shouldRedirect: !!canonicalSymbol,
    canonicalSymbol: canonicalSymbol || upperSymbol
  }
}

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
    genesis_date: basicInfo?.genesis_date
  }

  // Add to the in-memory mapping
  STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()] = newEntry

  console.log(`✅ Added new stablecoin to mapping table: ${symbol} (${name})`)
  
  // Log the addition for manual review
  console.log(`📝 New mapping entry created:`, {
    symbol: newEntry.symbol,
    name: newEntry.name,
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
  
  // Entry has been auto-updated with discovered data

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
    lastVerified: '${entry.lastVerified}'${entry.genesis_date ? `,
    genesis_date: '${entry.genesis_date}'` : ''}
  },`
}

/**
 * Get all auto-discovered entries that need manual review
 * Note: Since notes field was removed, this now returns empty array
 * Manual review tracking should be implemented through other means
 */
export function getAutoDiscoveredEntries(): StablecoinMappingEntry[] {
  return []
}

/**
 * Check if a stablecoin was auto-discovered and needs manual review
 * Note: Since notes field was removed, this always returns false
 * Manual review tracking should be implemented through other means
 */
export function needsManualReview(symbol: string): boolean {
  return false
}

/**
 * Export TRUSTED_ATTESTATION_PROVIDERS for convenience
 */
export { TRUSTED_ATTESTATION_PROVIDERS } 