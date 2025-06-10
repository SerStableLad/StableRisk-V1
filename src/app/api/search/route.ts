import { NextRequest, NextResponse } from 'next/server'
import { coinGeckoService } from '@/lib/services/coingecko'
import { cache, cacheKeys } from '@/lib/cache'
import { checkRateLimit } from '@/lib/rate-limit'
import { ApiResponse, SearchResponse } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    // Rate limiting check
    const { allowed, info } = checkRateLimit(request)
    
    if (!allowed) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Rate limit exceeded',
        message: `You have exceeded the rate limit of ${info.limit} requests per day. Try again later.`,
      }, {
        status: 429,
        headers: {
          'X-RateLimit-Limit': info.limit.toString(),
          'X-RateLimit-Remaining': info.remaining.toString(),
          'X-RateLimit-Reset': info.reset_time.toString(),
        }
      })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    // Validate query parameter
    if (!query || typeof query !== 'string' || query.length < 1 || query.length > 20) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid query',
        message: 'Query parameter "q" must be between 1 and 20 characters',
      }, { status: 400 })
    }

    // Clean query (remove special characters)
    const cleanQuery = query.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    
    if (cleanQuery.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid query format',
        message: 'Query must contain at least one alphanumeric character',
      }, { status: 400 })
    }

    // Check cache first
    const cacheKey = cacheKeys.coinGeckoSearch(cleanQuery)
    let coinId = cache.get<string | null>(cacheKey)

    if (coinId === undefined) {
      // Fetch from CoinGecko
      console.log(`Searching for ${cleanQuery}`)
      coinId = await coinGeckoService.searchStablecoin(cleanQuery)
      
      // Cache for 1 hour (searches can be cached for shorter time)
      cache.set(cacheKey, coinId, 60 * 60 * 1000)
    } else {
      console.log(`Serving cached search result for ${cleanQuery}`)
    }

    if (!coinId) {
      return NextResponse.json<ApiResponse<SearchResponse>>({
        success: true,
        data: {
          found: false,
          ticker: cleanQuery,
        },
        message: `No stablecoin found for query: ${cleanQuery}`,
      }, {
        headers: {
          'Cache-Control': 'public, max-age=1800', // 30 minutes client cache
          'X-RateLimit-Limit': info.limit.toString(),
          'X-RateLimit-Remaining': info.remaining.toString(),
          'X-RateLimit-Reset': info.reset_time.toString(),
        }
      })
    }

    // Get basic info
    const basicInfo = await coinGeckoService.getStablecoinInfo(coinId)
    
    const searchResult: SearchResponse = {
      found: true,
      ticker: cleanQuery,
      basic_info: basicInfo ? {
        name: basicInfo.name,
        symbol: basicInfo.symbol,
        image: basicInfo.image,
      } : undefined,
    }

    return NextResponse.json<ApiResponse<SearchResponse>>({
      success: true,
      data: searchResult,
      message: `Search completed for: ${cleanQuery}`,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=1800', // 30 minutes client cache
        'X-RateLimit-Limit': info.limit.toString(),
        'X-RateLimit-Remaining': info.remaining.toString(),
        'X-RateLimit-Reset': info.reset_time.toString(),
      }
    })

  } catch (error) {
    console.error('Search API Error:', error)
    
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your search',
    }, { status: 500 })
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