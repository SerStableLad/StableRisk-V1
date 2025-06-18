import { NextResponse } from 'next/server'
import { StablecoinDataService } from '@/lib/services/stablecoin-data'
import { auditDiscoveryService } from '@/lib/services/audit-discovery'
import { transparencyService } from '@/lib/services/transparency'

export async function GET() {
  console.log(`[PARALLEL TEST] Testing parallel operations`)
  
  try {
    const dataService = new StablecoinDataService()
    
    // Get the basic data first
    const searchMethod = (dataService as any).searchStablecoin.bind(dataService)
    const coinId = await searchMethod('USDT')
    
    const getInfoMethod = (dataService as any).getStablecoinInfo.bind(dataService)
    const info = await getInfoMethod(coinId)
    
    const getPriceHistoryMethod = (dataService as any).getPriceHistory.bind(dataService)
    const priceHistory = await getPriceHistoryMethod(coinId)
    
    console.log(`[PARALLEL TEST] Basic data retrieved successfully`)
    
    // Test each parallel operation individually
    const results: any = {}
    
    // Test 1: auditDiscoveryService
    try {
      console.log(`[PARALLEL TEST] Testing auditDiscoveryService`)
      const audits = await auditDiscoveryService.discoverAudits(
        'USDT', 
        info.name, 
        info.official_links?.github_repos, 
        info.official_links?.homepage
      )
      results.audits = { success: true, count: audits.length }
      console.log(`[PARALLEL TEST] auditDiscoveryService: Success (${audits.length} audits)`)
    } catch (error) {
      results.audits = { success: false, error: error instanceof Error ? error.message : String(error) }
      console.log(`[PARALLEL TEST] auditDiscoveryService: Failed -`, error)
    }
    
    // Test 2: transparencyService
    try {
      console.log(`[PARALLEL TEST] Testing transparencyService`)
      const transparency = await transparencyService.getTransparencyData('USDT', info.name, info.official_links?.homepage)
      results.transparency = { success: true, hasData: !!transparency.dashboard_url }
      console.log(`[PARALLEL TEST] transparencyService: Success`)
    } catch (error) {
      results.transparency = { success: false, error: error instanceof Error ? error.message : String(error) }
      console.log(`[PARALLEL TEST] transparencyService: Failed -`, error)
    }
    
    // Test 3: calculateRiskFactors
    try {
      console.log(`[PARALLEL TEST] Testing calculateRiskFactors`)
      const calculateRiskFactorsMethod = (dataService as any).calculateRiskFactors.bind(dataService)
      const riskFactors = await calculateRiskFactorsMethod(info, priceHistory, coinId, 'USDT')
      results.riskFactors = { success: true, scores: {
        peg_stability: riskFactors.peg_stability.score,
        transparency: riskFactors.transparency.score,
        liquidity: riskFactors.liquidity.score,
        oracle: riskFactors.oracle_setup.score,
        audit: riskFactors.audit_status.score
      }}
      console.log(`[PARALLEL TEST] calculateRiskFactors: Success`)
    } catch (error) {
      results.riskFactors = { success: false, error: error instanceof Error ? error.message : String(error) }
      console.log(`[PARALLEL TEST] calculateRiskFactors: Failed -`, error)
    }
    
    return NextResponse.json({
      success: true,
      results
    })
  } catch (error) {
    console.error(`[PARALLEL TEST] Error:`, error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
} 