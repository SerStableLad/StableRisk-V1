import { NextRequest, NextResponse } from 'next/server'
import { stablecoinDataService } from '@/lib/services/stablecoin-data'
import { cacheService, cacheKeys, CACHE_TTL } from '@/lib/cache'
import { checkRateLimit } from '@/lib/rate-limit'
import { ApiResponse, StablecoinAssessment } from '@/lib/types'
import { metricsService, measureExecutionTime } from '@/lib/metrics'

export const dynamic = 'force-dynamic'
export const revalidate = 0 // Disable Next.js cache for this route, we'll handle caching manually

/**
 * GET handler for stablecoin data
 * Implements tiered response streaming
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { ticker: string } }
) {
  const startTime = performance.now()
  const resolvedParams = await params
  const ticker = resolvedParams.ticker.toLowerCase()
  
  try {
    // Record API request in metrics
    const isStreaming = request.nextUrl.searchParams.get('stream') !== 'false'
    metricsService.recordApiRequest(ticker, isStreaming)
    
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
    
    // Record performance metrics
    console.time(`api-${ticker}-total`)
    
    // Update cache metrics
    const cacheStats = await cacheService.stats()
    metricsService.updateCacheMetrics(cacheStats.metrics.hits, cacheStats.metrics.misses)
    
    if (isStreaming) {
      return streamingResponse(ticker)
    } else {
      return standardResponse(ticker)
    }
    
  } catch (error: any) {
    console.error('Error processing stablecoin request:', error)
    
    // Record the error in metrics
    metricsService.recordApiError('server_error')
    
    const endTime = performance.now()
    const metric = {
      startTime,
      endTime,
      duration: endTime - startTime,
      success: false
    }
    metricsService.endPerformanceTimer(metric, false, true)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Server error',
        message: 'Failed to process stablecoin data request',
        error_details: error.message || 'Unknown error',
        partial: true,
        timestamp: Date.now()
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * Process streaming tiered API response
 */
async function streamingResponse(ticker: string) {
  // Create a TransformStream for streaming the response
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Start processing in the background
  const processPromise = processTieredData(ticker, writer, encoder)
  
  // Set appropriate headers for streaming response
  const headers = new Headers()
  headers.set('Content-Type', 'text/event-stream')
  headers.set('Cache-Control', 'no-cache')
  headers.set('Connection', 'keep-alive')
  
  // Return the stream immediately
  const response = new Response(stream.readable, {
    headers
  })

  // Ensure the processing completes, even if client disconnects
  processPromise.catch(error => {
    console.error('Error during tiered processing:', error)
    metricsService.recordApiError('stream_processing_error')
    writer.close()
  })

  return response
}

/**
 * Process the tiered data and write to the stream
 * Implements tier-specific caching and graceful error handling
 */
async function processTieredData(
  ticker: string, 
  writer: WritableStreamDefaultWriter,
  encoder: TextEncoder
) {
  // Track overall performance
  const overallMetric = metricsService.startPerformanceTimer()
  let tier1Success = false
  let tier2Success = false
  let tier3Success = false
  
  const writeChunk = async (tier: number | string, data: any, complete = false) => {
    await writer.write(
      encoder.encode(`data: ${JSON.stringify({
        tier, 
        data,
        complete,
        timestamp: Date.now()
      })}\n\n`)
    )
  }
  
  try {
    const normalizedTicker = ticker.toLowerCase()
    
    // TIER 1: Fast metadata and basic status (<500ms)
    console.time(`api-${normalizedTicker}-tier1`)
    const tier1Metric = metricsService.startPerformanceTimer(1)
    
    try {
      // Check tier 1 cache first
      const tier1CacheKey = cacheKeys.stablecoinTier(normalizedTicker, 1)
      let tier1Data = await cacheService.get(tier1CacheKey)
      
      if (!tier1Data) {
        // Not in cache, fetch from service
        const tier1Result = await measureExecutionTime(
          async () => {
            const assessmentGenerator = stablecoinDataService.getStablecoinAssessmentTiered(normalizedTicker)
            return assessmentGenerator.next()
          },
          { tier: 1 }
        )
        
        tier1Data = tier1Result.value.tier1
        
        // Cache the tier 1 result
        if (tier1Data) {
          await cacheService.setForTier(tier1CacheKey, tier1Data, 1)
        }
      }
      
      if (!tier1Data) {
        // No tier 1 data - stablecoin not found
        await writeChunk('error', { 
          message: 'Stablecoin not found',
          error: `No stablecoin found with ticker: ${ticker}`
        }, true)
        
        metricsService.endPerformanceTimer(tier1Metric, false)
        metricsService.endPerformanceTimer(overallMetric, false)
        metricsService.recordApiError('stablecoin_not_found', 1)
        
        console.timeEnd(`api-${normalizedTicker}-tier1`)
        console.timeEnd(`api-${normalizedTicker}-total`)
        await writer.close()
        return
      }
      
      // Send tier 1 data
      await writeChunk(1, tier1Data)
      tier1Success = true
      metricsService.endPerformanceTimer(tier1Metric, true)
      
    } catch (error: any) {
      console.error('Error processing tier 1 data:', error)
      metricsService.endPerformanceTimer(tier1Metric, false)
      metricsService.recordApiError('tier1_error', 1)
      
      // Critical error - cannot proceed without tier 1 data
      await writeChunk('error', { 
        message: 'Error fetching basic stablecoin data',
        error: error.message || 'Unknown error',
        partial: false
      }, true)
      
      console.timeEnd(`api-${normalizedTicker}-tier1`)
      console.timeEnd(`api-${normalizedTicker}-total`)
      metricsService.endPerformanceTimer(overallMetric, false)
      
      await writer.close()
      return
    }
    
    console.timeEnd(`api-${normalizedTicker}-tier1`)
    
    // TIER 2: Core analysis with peg stability and oracle data (<2s)
    console.time(`api-${normalizedTicker}-tier2`)
    const tier2Metric = metricsService.startPerformanceTimer(2)
    
    try {
      // Check tier 2 cache
      const tier2CacheKey = cacheKeys.stablecoinTier(normalizedTicker, 2)
      let tier2Data = await cacheService.get(tier2CacheKey)
      
      if (!tier2Data) {
        // Not in cache, fetch from service
        const tier2Result = await measureExecutionTime(
          async () => {
            const assessmentGenerator = stablecoinDataService.getStablecoinAssessmentTiered(normalizedTicker)
            await assessmentGenerator.next() // Skip tier 1
            return assessmentGenerator.next()
          },
          { tier: 2 }
        )
        
        tier2Data = tier2Result.value.tier2
        
        // Cache the tier 2 result
        if (tier2Data) {
          await cacheService.setForTier(tier2CacheKey, tier2Data, 2)
        }
      }
      
      // Send tier 2 data if available
      if (tier2Data) {
        await writeChunk(2, tier2Data)
        tier2Success = true
        metricsService.endPerformanceTimer(tier2Metric, true)
      } else {
        throw new Error('Tier 2 data not available')
      }
      
    } catch (error: any) {
      console.error('Error fetching tier 2 data:', error)
      metricsService.endPerformanceTimer(tier2Metric, false, true)
      metricsService.recordApiError('tier2_error', 2)
      
      // Non-critical error - send partial error but continue to tier 3
      await writeChunk('tier2-error', { 
        message: 'Error fetching tier 2 data',
        error: error.message || 'Unknown error',
        partial: true
      }, false)
    }
    
    console.timeEnd(`api-${normalizedTicker}-tier2`)
    
    // TIER 3: Comprehensive analysis (<5s)
    console.time(`api-${normalizedTicker}-tier3`)
    const tier3Metric = metricsService.startPerformanceTimer(3)
    
    try {
      // Check tier 3 cache
      const tier3CacheKey = cacheKeys.stablecoinTier(normalizedTicker, 3)
      let tier3Data = await cacheService.get(tier3CacheKey)
      
      if (!tier3Data) {
        // Not in cache, fetch from service
        const tier3Result = await measureExecutionTime(
          async () => {
            const assessmentGenerator = stablecoinDataService.getStablecoinAssessmentTiered(normalizedTicker)
            await assessmentGenerator.next() // Skip tier 1
            await assessmentGenerator.next() // Skip tier 2
            return assessmentGenerator.next()
          },
          { tier: 3 }
        )
        
        tier3Data = tier3Result.value.tier3
        
        // Cache the tier 3 result
        if (tier3Data) {
          await cacheService.setForTier(tier3CacheKey, tier3Data, 3)
        }
      }
      
      // Send tier 3 data if available
      if (tier3Data) {
        await writeChunk(3, tier3Data, true)
        tier3Success = true
        metricsService.endPerformanceTimer(tier3Metric, true)
      } else {
        throw new Error('Tier 3 data not available')
      }
      
    } catch (error: any) {
      console.error('Error fetching tier 3 data:', error)
      metricsService.endPerformanceTimer(tier3Metric, false, true)
      metricsService.recordApiError('tier3_error', 3)
      metricsService.recordPartialResponse(3)
      
      // Send partial error
      await writeChunk('tier3-error', { 
        message: 'Error fetching comprehensive data',
        error: error.message || 'Unknown error',
        partial: true
      }, true)
    }
    
    console.timeEnd(`api-${normalizedTicker}-tier3`)
    console.timeEnd(`api-${normalizedTicker}-total`)
    
    // End overall performance tracking
    const isCompletelySuccessful = tier1Success && tier2Success && tier3Success
    const hasPartialData = tier1Success && (tier2Success || tier3Success)
    
    metricsService.endPerformanceTimer(
      overallMetric, 
      isCompletelySuccessful,
      !isCompletelySuccessful && hasPartialData
    )
    
    // Close the writer when done
    await writer.close()
  } catch (error: any) {
    console.error('Error processing tiered data:', error)
    metricsService.recordApiError('stream_processing_error')
    metricsService.endPerformanceTimer(overallMetric, false, true)
    
    // Send error to client, but include any partial data we might have
    await writeChunk('error', {
      message: 'Failed to process stablecoin data',
      error: error.message || 'Unknown error',
      partial: true,
      timestamp: Date.now()
    }, true)
    
    console.timeEnd(`api-${ticker}-total`)
    await writer.close()
  }
}

/**
 * Process standard non-streaming response
 * Returns all data at once but still benefits from tier-specific caching
 */
async function standardResponse(ticker: string) {
  const normalizedTicker = ticker.toLowerCase()
  console.time(`api-${normalizedTicker}-standard`)
  
  // Start performance tracking
  const metric = metricsService.startPerformanceTimer()
  
  try {
    // Check full response cache first
    const fullCacheKey = cacheKeys.stablecoinFull(normalizedTicker)
    let cachedAssessment = await cacheService.get<StablecoinAssessment>(fullCacheKey)
    
    if (cachedAssessment) {
      console.timeEnd(`api-${normalizedTicker}-standard`)
      console.timeEnd(`api-${normalizedTicker}-total`)
      
      // End performance tracking - successful from cache
      metricsService.endPerformanceTimer(metric, true)
      
      return new Response(
        JSON.stringify({
          success: true,
          data: cachedAssessment,
          timestamp: Date.now()
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Get full assessment (non-tiered)
    const assessment = await measureExecutionTime(
      () => stablecoinDataService.getStablecoinAssessment(normalizedTicker),
      { name: 'full_assessment' }
    )
    
    if (!assessment) {
      console.timeEnd(`api-${normalizedTicker}-standard`)
      console.timeEnd(`api-${normalizedTicker}-total`)
      
      // End performance tracking - not found
      metricsService.endPerformanceTimer(metric, false)
      metricsService.recordApiError('stablecoin_not_found')
      
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Not found',
          message: `No stablecoin found with ticker: ${ticker}`,
          timestamp: Date.now()
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Cache the result
    await cacheService.set(fullCacheKey, assessment, CACHE_TTL.default)
    
    console.timeEnd(`api-${normalizedTicker}-standard`)
    console.timeEnd(`api-${normalizedTicker}-total`)
    
    // End performance tracking - successful
    metricsService.endPerformanceTimer(metric, true)
    
    return new Response(
      JSON.stringify({
        success: true,
        data: assessment,
        timestamp: Date.now()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error in standard response:', error)
    console.timeEnd(`api-${normalizedTicker}-standard`)
    console.timeEnd(`api-${normalizedTicker}-total`)
    
    // End performance tracking - error
    metricsService.endPerformanceTimer(metric, false, true)
    metricsService.recordApiError('standard_response_error')
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Processing error',
        message: `Error processing data for: ${ticker}`,
        error_details: error.message || 'Unknown error',
        partial: true,
        timestamp: Date.now()
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
} 