import { NextResponse } from 'next/server'
import { StablecoinDataService } from '@/lib/services/stablecoin-data'

export async function GET() {
  console.log(`[SEARCH TEST] Testing StablecoinDataService.searchStablecoin`)
  
  try {
    const dataService = new StablecoinDataService()
    console.log(`[SEARCH TEST] Service created`)
    
    // Access the private method by casting to any (for testing purposes)
    const searchMethod = (dataService as any).searchStablecoin.bind(dataService)
    console.log(`[SEARCH TEST] Calling searchStablecoin('USDT')`)
    
    const coinId = await searchMethod('USDT')
    console.log(`[SEARCH TEST] searchStablecoin result:`, coinId)
    
    return NextResponse.json({
      success: true,
      coinId,
      message: coinId ? 'Search successful' : 'Search returned null'
    })
  } catch (error) {
    console.error(`[SEARCH TEST] Error:`, error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
} 