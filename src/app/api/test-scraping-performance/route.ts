import { NextRequest, NextResponse } from 'next/server'
import { hybridScraperService } from '@/lib/services/hybrid-scraper'
import { playwrightScraperService } from '@/lib/services/playwright-scraper'
// import { ultraFastScraperService } from '@/lib/services/ultra-fast-scraper'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const testUrl = searchParams.get('url') || 'https://httpbin.org/html'
  const method = searchParams.get('method') || 'hybrid'

  const results: any = {
    url: testUrl,
    method,
    timestamp: new Date().toISOString()
  }

  try {
    const startTime = Date.now()

    if (method === 'hybrid') {
      console.log(`🔄 Testing hybrid scraping for: ${testUrl}`)
      const result = await hybridScraperService.scrapePage(testUrl, {
        timeout: 15000
      })
      
      results.result = {
        success: result.success,
        method: result.method,
        contentLength: result.html.length,
        textLength: result.text.length,
        linksCount: result.links.length,
        title: result.title,
        error: result.error,
        loadTime: Date.now() - startTime
      }

    } else if (method === 'playwright') {
      console.log(`🎭 Testing Playwright scraping for: ${testUrl}`)
      const result = await playwrightScraperService.scrapePage(testUrl, {
        timeout: 15000,
        waitTime: 2000
      })
      
      results.result = {
        success: result.success,
        method: 'playwright',
        contentLength: result.html.length,
        textLength: result.text.length,
        linksCount: result.links.length,
        title: result.title,
        error: result.error,
        loadTime: Date.now() - startTime
      }

    } else {
      return NextResponse.json({
        error: 'Invalid method. Use "hybrid" or "playwright"'
      }, { status: 400 })
    }

    console.log(`✅ ${method} scraping completed in ${results.result.loadTime}ms`)
    return NextResponse.json(results)

  } catch (error) {
    console.error(`💥 Error testing ${method} scraping:`, error)
    return NextResponse.json({
      ...results,
      error: error instanceof Error ? error.message : 'Unknown error',
      loadTime: Date.now() - Date.now()
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { urls, method = 'hybrid' } = await request.json()
    
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'URLs array is required' }, { status: 400 })
    }

    const results = []
    
    for (const url of urls.slice(0, 5)) { // Limit to 5 URLs for safety
      const startTime = Date.now()
      
      try {
        let result
        if (method === 'hybrid') {
          result = await hybridScraperService.scrapePage(url, { timeout: 10000 })
        } else if (method === 'playwright') {
          result = await playwrightScraperService.scrapePage(url, { timeout: 15000, waitTime: 2000 })
        } else {
          throw new Error(`Unknown method: ${method}`)
        }
        
        results.push({
          url,
          success: result.success,
          loadTime: Date.now() - startTime,
          contentLength: result.html.length,
          linksFound: result.links.length,
          method: (result as any).method || method,
          error: result.error
        })
        
      } catch (error) {
        results.push({
          url,
          success: false,
          loadTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    return NextResponse.json({
      totalUrls: urls.length,
      processedUrls: results.length,
      results,
      summary: {
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        averageLoadTime: Math.round(
          results.reduce((sum, r) => sum + r.loadTime, 0) / results.length
        ),
        totalTime: results.reduce((sum, r) => sum + r.loadTime, 0)
      }
    })
    
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 