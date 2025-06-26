import { NextRequest, NextResponse } from 'next/server'
import { updateMappingWithDiscoveredData } from '@/lib/services/stablecoin-mapping-utils'
import { STABLECOIN_TRANSPARENCY_MAPPING } from '@/lib/services/stablecoin-mapping-table'

// Simple authentication - in production, use proper auth
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'your-secret-key'

export async function POST(request: NextRequest) {
  try {
    const { secret, symbol, updates } = await request.json()
    
    // Basic authentication
    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Update the mapping
    const success = updateMappingWithDiscoveredData(symbol, updates.transparency, updates.audit_folder_url)
    
    if (success) {
      return NextResponse.json({ 
        success: true, 
        message: `Updated ${symbol} mapping data`,
        updatedEntry: STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
      })
    } else {
      return NextResponse.json({ error: 'Failed to update mapping' }, { status: 400 })
    }
    
  } catch (error) {
    console.error('Admin update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint to view current mapping
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  const symbol = searchParams.get('symbol')
  
  if (secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  if (symbol) {
    const entry = STABLECOIN_TRANSPARENCY_MAPPING[symbol.toUpperCase()]
    return NextResponse.json({ symbol, entry })
  }
  
  return NextResponse.json({ 
    mapping: STABLECOIN_TRANSPARENCY_MAPPING,
    totalEntries: Object.keys(STABLECOIN_TRANSPARENCY_MAPPING).length
  })
} 