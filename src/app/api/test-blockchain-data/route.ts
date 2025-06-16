import { NextResponse } from 'next/server'
import { coinGeckoService } from '@/lib/services/coingecko'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker') || 'USDT'
  
  console.log(`[BLOCKCHAIN DATA TEST] Testing blockchain data for: ${ticker}`)
  
  try {
    // Step 1: Search for the coin
    const coinId = await coinGeckoService.searchStablecoin(ticker)
    if (!coinId) {
      return NextResponse.json({
        success: false,
        error: `Could not find CoinGecko ID for ${ticker}`
      })
    }
    
    console.log(`[BLOCKCHAIN DATA TEST] Found CoinGecko ID: ${coinId}`)
    
    // Step 2: Get detailed coin info to examine blockchain data
    const info = await coinGeckoService.getStablecoinInfo(coinId)
    if (!info) {
      return NextResponse.json({
        success: false,
        error: `Could not get coin info for ${coinId}`
      })
    }
    
    // Step 3: Get raw CoinGecko data to see what platforms/blockchain data is available
    const rawResponse = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`)
    const rawData = await rawResponse.json()
    
    return NextResponse.json({
      success: true,
      ticker,
      coinId,
      detailed_info: info, // Include full info object to see genesis_date
      current_blockchain_field: info.blockchain,
      platforms: rawData.platforms || {},
      blockchain_sites: rawData.links?.blockchain_site || [],
      asset_platform_id: rawData.asset_platform_id || null,
      contract_address: rawData.contract_address || null,
      detail_platforms: rawData.detail_platforms || {},
      categories: rawData.categories || []
    })
    
  } catch (error) {
    console.error(`[BLOCKCHAIN DATA TEST] Error:`, error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
} 