import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/services/api-client'
import { config } from '@/lib/config'

export async function GET() {
  console.log(`[DIRECT TEST] Testing API client directly`)
  
  try {
    // Test the API client directly
    const client = createApiClient(config.coingecko.baseUrl)
    console.log(`[DIRECT TEST] API client created with base URL: ${config.coingecko.baseUrl}`)
    
    const response = await client.get<any>('/search', {
      params: {
        query: 'USDT'
      }
    })
    
    console.log(`[DIRECT TEST] API call successful`)
    console.log(`[DIRECT TEST] Found ${response.coins?.length || 0} coins`)
    
    const coin = response.coins?.find((c: any) => 
      c.symbol?.toLowerCase() === 'usdt'
    )
    
    return NextResponse.json({
      success: true,
      baseUrl: config.coingecko.baseUrl,
      coinsFound: response.coins?.length || 0,
      usdtFound: coin ? coin.id : null,
      firstFewCoins: response.coins?.slice(0, 3).map((c: any) => ({ id: c.id, symbol: c.symbol }))
    })
  } catch (error) {
    console.error(`[DIRECT TEST] Error:`, error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      baseUrl: config.coingecko.baseUrl
    })
  }
} 