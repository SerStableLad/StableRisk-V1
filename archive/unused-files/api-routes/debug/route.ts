import { NextResponse } from 'next/server'
import { StablecoinDataService } from '@/lib/services/stablecoin-data'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker') || 'USDT'
  
  console.log(`[DEBUG API] Testing StablecoinDataService for ${ticker}`)
  
  try {
    const dataService = new StablecoinDataService()
    console.log(`[DEBUG API] Service created successfully`)
    
    const result = await dataService.getStablecoinAssessment(ticker.toUpperCase())
    console.log(`[DEBUG API] Assessment result:`, result ? 'Success' : 'Failed')
    
    if (result) {
      return NextResponse.json({
        success: true,
        data: {
          name: result.info.name,
          symbol: result.info.symbol,
          current_price: result.info.current_price,
          overall_score: result.risk_scores.overall
        }
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'No assessment data returned'
      })
    }
  } catch (error) {
    console.error(`[DEBUG API] Error:`, error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined
    })
  }
} 