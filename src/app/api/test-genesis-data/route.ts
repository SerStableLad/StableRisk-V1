import { NextResponse } from 'next/server'
import { coinGeckoService } from '@/lib/services/coingecko'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker') || 'USDT'
  
  console.log(`[GENESIS DATA TEST] Testing genesis data for: ${ticker}`)
  
  try {
    // Step 1: Search for the coin
    const coinId = await coinGeckoService.searchStablecoin(ticker)
    if (!coinId) {
      return NextResponse.json({
        success: false,
        error: `Could not find CoinGecko ID for ${ticker}`
      })
    }
    
    console.log(`[GENESIS DATA TEST] Found CoinGecko ID: ${coinId}`)
    
    // Step 2: Get raw CoinGecko data to examine all available fields
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=true&sparkline=false`)
    const rawData = await response.json()
    
    // Extract potential genesis date fields
    const potentialDateFields: Record<string, any> = {}
    
    // Check top-level fields
    Object.keys(rawData).forEach(key => {
      const value = rawData[key]
      if (key.toLowerCase().includes('date') || 
          key.toLowerCase().includes('time') || 
          key.toLowerCase().includes('launch') || 
          key.toLowerCase().includes('genesis') ||
          key.toLowerCase().includes('created') ||
          key.toLowerCase().includes('start')) {
        potentialDateFields[key] = value
      }
    })
    
    // Check market_data for date fields
    if (rawData.market_data) {
      Object.keys(rawData.market_data).forEach(key => {
        const value = rawData.market_data[key]
        if (key.toLowerCase().includes('date') || 
            key.toLowerCase().includes('time') || 
            key.toLowerCase().includes('first') ||
            key.toLowerCase().includes('ath_date') ||
            key.toLowerCase().includes('atl_date')) {
          potentialDateFields[`market_data.${key}`] = value
        }
      })
    }
    
    // Check if there's an inception date or similar
    const inceptionDate = rawData.inception_date || rawData.genesis_date || rawData.launch_date
    const athDate = rawData.market_data?.ath_date?.usd
    const atlDate = rawData.market_data?.atl_date?.usd
    
    return NextResponse.json({
      success: true,
      ticker,
      coinId,
      potential_genesis_fields: potentialDateFields,
      inception_date: inceptionDate,
      ath_date: athDate,
      atl_date: atlDate,
      // Include some key fields for analysis
      key_fields: {
        id: rawData.id,
        name: rawData.name,
        symbol: rawData.symbol,
        description: rawData.description?.en?.substring(0, 200) + '...',
        categories: rawData.categories,
        public_notice: rawData.public_notice,
        additional_notices: rawData.additional_notices
      }
    })
    
  } catch (error) {
    console.error(`[GENESIS DATA TEST] Error:`, error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
} 