import { NextResponse } from 'next/server'
import { 
  getAllKnownSymbols, 
  isKnownStablecoin, 
  getAutoDiscoveredEntries,
  getMappingStats,
  addNewStablecoinToMapping 
} from '@/lib/services/stablecoin-mapping-table'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'status'
  const ticker = searchParams.get('ticker')
  
  console.log(`[MAPPING STATUS] Action: ${action}, Ticker: ${ticker}`)
  
  try {
    if (action === 'status') {
      // Get current mapping status
      const allSymbols = getAllKnownSymbols()
      const autoDiscovered = getAutoDiscoveredEntries()
      const stats = getMappingStats()
      
      return NextResponse.json({
        success: true,
        action: 'status',
        total_known_symbols: allSymbols.length,
        known_symbols: allSymbols,
        auto_discovered_count: autoDiscovered.length,
        auto_discovered_entries: autoDiscovered.map(e => ({
          symbol: e.symbol,
          name: e.name,
          lastVerified: e.lastVerified,
          notes: e.notes
        })),
        mapping_stats: stats
      })
    }
    
    if (action === 'check' && ticker) {
      // Check if a specific ticker is known
      const isKnown = isKnownStablecoin(ticker)
      
      return NextResponse.json({
        success: true,
        action: 'check',
        ticker: ticker.toUpperCase(),
        is_known: isKnown
      })
    }
    
    if (action === 'add-test' && ticker) {
      // Test adding a new stablecoin (for testing purposes)
      const wasKnownBefore = isKnownStablecoin(ticker)
      
      if (!wasKnownBefore) {
        const newEntry = addNewStablecoinToMapping(
          ticker,
          `Test ${ticker}`,
          undefined,
          999,
          {
            homepage: 'https://example.com',
            market_cap: 1000000,
            genesis_date: '2025-01-01'
          }
        )
        
        const isKnownAfter = isKnownStablecoin(ticker)
        
        return NextResponse.json({
          success: true,
          action: 'add-test',
          ticker: ticker.toUpperCase(),
          was_known_before: wasKnownBefore,
          is_known_after: isKnownAfter,
          added_entry: {
            symbol: newEntry.symbol,
            name: newEntry.name,
            lastVerified: newEntry.lastVerified,
            notes: newEntry.notes
          }
        })
      } else {
        return NextResponse.json({
          success: true,
          action: 'add-test',
          ticker: ticker.toUpperCase(),
          was_known_before: wasKnownBefore,
          message: 'Ticker was already known, no action taken'
        })
      }
    }
    
    return NextResponse.json({
      success: false,
      error: 'Invalid action. Use: status, check, or add-test',
      available_actions: ['status', 'check', 'add-test']
    }, { status: 400 })
    
  } catch (error) {
    console.error('[MAPPING STATUS] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      action
    }, { status: 500 })
  }
} 