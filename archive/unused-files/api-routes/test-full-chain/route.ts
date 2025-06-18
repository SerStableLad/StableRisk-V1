import { NextResponse } from 'next/server'
import { StablecoinDataService } from '@/lib/services/stablecoin-data'

export async function GET() {
  console.log(`[FULL CHAIN TEST] Testing full StablecoinDataService chain`)
  
  try {
    const dataService = new StablecoinDataService()
    console.log(`[FULL CHAIN TEST] Service created`)
    
    // Step 1: Search for stablecoin
    console.log(`[FULL CHAIN TEST] Step 1: Searching for USDT`)
    const searchMethod = (dataService as any).searchStablecoin.bind(dataService)
    const coinId = await searchMethod('USDT')
    console.log(`[FULL CHAIN TEST] Step 1 result:`, coinId)
    
    if (!coinId) {
      return NextResponse.json({
        success: false,
        step: 1,
        error: 'searchStablecoin returned null'
      })
    }
    
    // Step 2: Get stablecoin info
    console.log(`[FULL CHAIN TEST] Step 2: Getting info for ${coinId}`)
    const getInfoMethod = (dataService as any).getStablecoinInfo.bind(dataService)
    const info = await getInfoMethod(coinId)
    console.log(`[FULL CHAIN TEST] Step 2 result:`, info ? 'Success' : 'Failed')
    
    if (!info) {
      return NextResponse.json({
        success: false,
        step: 2,
        coinId,
        error: 'getStablecoinInfo returned null'
      })
    }
    
    // Step 3: Get price history
    console.log(`[FULL CHAIN TEST] Step 3: Getting price history for ${coinId}`)
    const getPriceHistoryMethod = (dataService as any).getPriceHistory.bind(dataService)
    const priceHistory = await getPriceHistoryMethod(coinId)
    console.log(`[FULL CHAIN TEST] Step 3 result:`, priceHistory.length, 'price points')
    
    return NextResponse.json({
      success: true,
      steps: {
        step1_search: coinId,
        step2_info: {
          name: info.name,
          symbol: info.symbol,
          current_price: info.current_price
        },
        step3_price_history: priceHistory.length
      }
    })
  } catch (error) {
    console.error(`[FULL CHAIN TEST] Error:`, error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
  }
} 