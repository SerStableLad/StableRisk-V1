import { NextResponse } from 'next/server'
import { coinGeckoService } from '@/lib/services/coingecko'
import { getKnownGenesisDate } from '@/lib/services/stablecoin-mapping-table'

export async function GET() {
  console.log('[USDC DEBUG] Starting USDC debug test')
  
  try {
    // Step 1: Search for USDC
    console.log('[USDC DEBUG] Searching for USDC...')
    const coinId = await coinGeckoService.searchStablecoin('USDC')
    console.log('[USDC DEBUG] CoinGecko ID:', coinId)
    
    if (!coinId) {
      return NextResponse.json({
        success: false,
        error: 'Could not find CoinGecko ID for USDC'
      })
    }
    
    // Step 2: Test mapping table lookup
    console.log('[USDC DEBUG] Testing mapping table lookup...')
    const mappingGenesisDate = getKnownGenesisDate('USDC')
    console.log('[USDC DEBUG] Mapping table genesis date:', mappingGenesisDate)
    
    // Step 3: Get raw CoinGecko data
    console.log('[USDC DEBUG] Fetching raw CoinGecko data...')
    const rawResponse = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`)
    
    if (!rawResponse.ok) {
      throw new Error(`CoinGecko API error: ${rawResponse.status}`)
    }
    
    const rawData = await rawResponse.json()
    console.log('[USDC DEBUG] Raw data symbol:', rawData.symbol)
    console.log('[USDC DEBUG] Raw data genesis_date:', rawData.genesis_date)
    
    // Step 4: Try getStablecoinInfo
    console.log('[USDC DEBUG] Testing getStablecoinInfo...')
    const info = await coinGeckoService.getStablecoinInfo(coinId)
    console.log('[USDC DEBUG] getStablecoinInfo result:', info ? 'Success' : 'Failed')
    
    return NextResponse.json({
      success: true,
      coinId,
      mappingGenesisDate,
      rawSymbol: rawData.symbol,
      rawGenesisDate: rawData.genesis_date,
      infoResult: info,
      debug: 'USDC debug complete'
    })
    
  } catch (error) {
    console.error('[USDC DEBUG] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
} 