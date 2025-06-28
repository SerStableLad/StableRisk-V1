import { NextRequest, NextResponse } from 'next/server'
import { stablecoinDataService } from '@/lib/services/stablecoin-data'
import { summaryApiClient } from '@/lib/services/summary-api-client'
import { backgroundJobService } from '@/lib/services/background-job-service'
import { enhancedCacheService } from '@/lib/services/enhanced-cache-service'
import { checkRateLimit } from '@/lib/rate-limit'
import { metricsService } from '@/lib/metrics'
import { coinGeckoService } from '@/lib/services/coingecko'
import { 
  isKnownStablecoin, 
  getKnownTransparencyData,
  getKnownAuditFolderUrl
} from '@/lib/services/stablecoin-mapping-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Progressive loading endpoint - returns fast data immediately, 
 * triggers background jobs for detailed data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const startTime = performance.now()
  const resolvedParams = await params
  const ticker = resolvedParams.ticker.toLowerCase()
  
  try {
    console.log(`🚀 Progressive loading request for ${ticker}`)
    
    // Rate limiting check
    const rateLimitResult = await checkRateLimit(request)
    if (!rateLimitResult.allowed) {
      metricsService.recordRateLimitExceeded()
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Rate limit exceeded',
          message: `Maximum ${rateLimitResult.info.limit} requests per day. Please try again in ${
            Math.ceil((rateLimitResult.info.reset_time - Date.now()) / 1000 / 60)
          } minutes.`
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Step 1: Check for complete cached data first
    const cachedData = await enhancedCacheService.get('assessment', ticker)
    if (cachedData) {
      console.log(`✅ Returning complete cached data for ${ticker}`)
      
      return NextResponse.json({
        success: true,
        data: cachedData,
        cached: true,
        loadingStatus: {
          audit: 'completed',
          transparency: 'completed',
          detailed: 'completed'
        },
        timestamp: Date.now()
      })
    }

    // Step 2: Get fast summary data
    console.log(`🚀 Fetching summary data for ${ticker}`)
    const coinId = await coinGeckoService.searchStablecoin(ticker)
    
    if (!coinId) {
      return NextResponse.json({
        success: false,
        error: 'Stablecoin not found',
        message: `No stablecoin found with ticker: ${ticker}`
      }, { status: 404 })
    }

    // Get basic info and summary price in parallel
    const [basicInfo, summaryPrice] = await Promise.all([
      coinGeckoService.getStablecoinInfo(coinId),
      summaryApiClient.getSimplePrice(coinId)
    ])

    if (!basicInfo || !summaryPrice) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch basic data',
        message: 'Could not retrieve basic stablecoin information'
      }, { status: 500 })
    }

    // Quick stablecoin validation
    if (!summaryApiClient.isPriceStablecoinLike(summaryPrice.current_price)) {
      return NextResponse.json({
        success: false,
        error: 'Not a stablecoin',
        message: `Price ${summaryPrice.current_price} indicates this is not a stablecoin`
      }, { status: 400 })
    }

    // Step 3: Prepare fast response data
    const fastData: any = {
      basic_info: {
        id: coinId,
        symbol: basicInfo.symbol,
        name: basicInfo.name,
        current_price: summaryPrice.current_price,
        price_change_24h: summaryPrice.price_change_24h,
        price_change_percentage_24h: summaryPrice.price_change_percentage_24h,
        last_updated: summaryPrice.last_updated,
        market_cap: basicInfo.market_cap || 0,
        total_supply: 0
      },
      risk_summary: {
        // Quick risk assessment based on price data
        peg_stability: summaryPrice.current_price >= 0.98 && summaryPrice.current_price <= 1.02 ? 'stable' : 'unstable',
        price_deviation: Math.abs(summaryPrice.current_price - 1.0),
        volatility_24h: Math.abs(summaryPrice.price_change_percentage_24h),
        overall_risk: 'calculating' // Will be updated when detailed analysis completes
      }
    }

    // Step 4: Check what data we already have cached
    const loadingStatus = {
      audit: 'loading',
      transparency: 'loading', 
      detailed: 'loading'
    }

    // Check for existing cached transparency data
    const cachedTransparency = await enhancedCacheService.get('transparency', ticker)
    if (cachedTransparency || (isKnownStablecoin(ticker) && getKnownTransparencyData(ticker))) {
      fastData.transparency = cachedTransparency || getKnownTransparencyData(ticker)
      loadingStatus.transparency = 'completed'
    }

    // Check for existing cached audit data
    const cachedAudit = await enhancedCacheService.get('audits', ticker)
    if (cachedAudit) {
      fastData.audit = cachedAudit
      loadingStatus.audit = 'completed'
    }

    // Step 5: Trigger background jobs for missing data
    const jobIds = []

    // Trigger audit discovery if needed
    if (loadingStatus.audit === 'loading') {
      const auditFolderUrl = getKnownAuditFolderUrl(ticker)
      if (auditFolderUrl && 
          !backgroundJobService.hasActiveJobOfType(ticker, 'audit_discovery') &&
          !backgroundJobService.hasRecentlyCompletedJob(ticker, 'audit_discovery', 5)) {
        const auditJobId = backgroundJobService.addJob(
          'audit_discovery',
          ticker,
          { info: basicInfo, auditFolderUrl },
          'high' // High priority for user-requested data
        )
        jobIds.push(auditJobId)
        console.log(`🔄 Triggered audit discovery job: ${auditJobId}`)
      } else if (backgroundJobService.hasRecentlyCompletedJob(ticker, 'audit_discovery', 5)) {
        console.log(`⏭️ Skipping audit discovery - job completed recently for ${ticker}`)
      }
    }

    // Trigger transparency discovery if needed  
    if (loadingStatus.transparency === 'loading') {
      if (!isKnownStablecoin(ticker) && 
          !backgroundJobService.hasActiveJobOfType(ticker, 'transparency_discovery') &&
          !backgroundJobService.hasRecentlyCompletedJob(ticker, 'transparency_discovery', 5)) {
        const transparencyJobId = backgroundJobService.addJob(
          'transparency_discovery',
          ticker,
          { info: basicInfo },
          'normal'
        )
        jobIds.push(transparencyJobId)
        console.log(`🔄 Triggered transparency discovery job: ${transparencyJobId}`)
      } else if (backgroundJobService.hasRecentlyCompletedJob(ticker, 'transparency_discovery', 5)) {
        console.log(`⏭️ Skipping transparency discovery - job completed recently for ${ticker}`)
      }
    }

    // Trigger detailed analysis
    const detailedJobId = backgroundJobService.addJob(
      'detailed_analysis',
      ticker,
      { info: basicInfo, coinId },
      'normal'
    )
    jobIds.push(detailedJobId)

    // Step 6: Return fast response
    const response = {
      success: true,
      data: fastData,
      cached: false,
      loadingStatus,
      jobIds, // Client can use these to poll for updates
      estimatedCompletion: {
        audit: loadingStatus.audit === 'completed' ? null : Date.now() + 10000, // ~10s
        transparency: loadingStatus.transparency === 'completed' ? null : Date.now() + 5000, // ~5s
        detailed: Date.now() + 15000 // ~15s
      },
      timestamp: Date.now(),
      processingTime: performance.now() - startTime
    }

    console.log(`✅ Fast response for ${ticker} in ${(performance.now() - startTime).toFixed(2)}ms`)
    metricsService.recordApiRequest(ticker, false)
    
    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Error in progressive loading:', error)
    metricsService.recordApiError('progressive_loading_error')
    
    return NextResponse.json({
      success: false,
      error: 'Server error',
      message: 'Failed to process progressive loading request',
      error_details: error.message || 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 })
  }
}

/**
 * Get status of background jobs for a ticker
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const resolvedParams = await params
    const ticker = resolvedParams.ticker.toLowerCase()
    const body = await request.json()

    // Validate request body
    if (!body || typeof body !== 'object') {
      return NextResponse.json({
        success: false,
        error: 'Invalid request body',
        message: 'Request body must be a valid JSON object'
      }, { status: 400 })
    }

    const { jobIds } = body

    // Validate jobIds
    if (jobIds && !Array.isArray(jobIds)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid jobIds',
        message: 'jobIds must be an array'
      }, { status: 400 })
    }
    console.log(`📊 Checking job status for ${ticker}`)
    
    const jobStatuses: any = {}
    const completedData: any = {}

    // Check each job status
    for (const jobId of jobIds || []) {
      const job = backgroundJobService.getJob(jobId)
      if (job) {
        jobStatuses[job.type] = {
          status: job.status,
          error: job.error,
          completedAt: job.completedAt
        }

        // If job completed successfully, include the data
        if (job.status === 'completed' && job.data) {
          if (job.type === 'audit_discovery') {
            completedData.audit = job.data.audits
          } else if (job.type === 'transparency_discovery') {
            completedData.transparency = job.data.transparency
          } else if (job.type === 'detailed_analysis') {
            completedData.detailed = job.data.detailedAnalysis
          }
        }
      }
    }

    // Also check for any completed jobs that might not be in the jobIds list
    const allJobs = backgroundJobService.getJobsForTicker(ticker)
    for (const job of allJobs) {
      if (job.status === 'completed' && job.data && !jobStatuses[job.type]) {
        jobStatuses[job.type] = {
          status: job.status,
          completedAt: job.completedAt
        }

        if (job.type === 'audit_discovery') {
          completedData.audit = job.data.audits
        } else if (job.type === 'transparency_discovery') {
          completedData.transparency = job.data.transparency
        } else if (job.type === 'detailed_analysis') {
          completedData.detailed = job.data.detailedAnalysis
        }
      }
    }

    return NextResponse.json({
      success: true,
      ticker,
      jobStatuses,
      completedData,
      hasActiveJobs: backgroundJobService.hasActiveJobsForTicker(ticker),
      timestamp: Date.now()
    })

  } catch (error: any) {
    console.error('Error checking job status:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Failed to check job status',
      error_details: error.message || 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 })
  }
} 