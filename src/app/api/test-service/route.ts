import { NextResponse } from 'next/server'
import { coinGeckoService } from '@/lib/services/coingecko'

export async function GET() {
  console.log(`[SERVICE TEST] Testing coinGeckoService instance`)
  
  try {
    console.log(`[SERVICE TEST] Calling searchStablecoin('USDT')`)
    const coinId = await coinGeckoService.searchStablecoin('USDT')
    console.log(`[SERVICE TEST] searchStablecoin result:`, coinId)
    
    if (coinId) {
      console.log(`[SERVICE TEST] Calling getStablecoinInfo('${coinId}')`)
      const info = await coinGeckoService.getStablecoinInfo(coinId)
      console.log(`[SERVICE TEST] getStablecoinInfo result:`, info ? 'Success' : 'Failed')
      
      return NextResponse.json({
        success: true,
        coinId,
        info: info ? {
          name: info.name,
          symbol: info.symbol,
          current_price: info.current_price
        } : null
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'searchStablecoin returned null'
      })
    }
  } catch (error) {
    console.error(`[SERVICE TEST] Error:`, error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
} 