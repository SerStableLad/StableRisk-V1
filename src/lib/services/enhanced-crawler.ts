import { chromium, Browser, Page } from 'playwright'
import { cacheService } from './cache-service'
import { metricsService } from './metrics-service'

export interface CrawlResult {
  url: string
  html: string
  text: string
  links: Array<{ href: string; text: string }>
  title?: string
  success: boolean
  error?: string
  responseTime: number
}

export interface CrawlOptions {
  maxConcurrency?: number
  timeout?: number
  headless?: boolean
  retryCount?: number
  waitTime?: number
  userAgent?: string
}

/**
 * Enhanced Web Crawler using optimized Playwright
 * Provides high-performance, parallel web crawling with browser pooling
 */
export class EnhancedCrawlerService {
  private browser: Browser | null = null
  private cacheKeyPrefix = 'enhanced-crawler:'
  private cacheTTL = 86400 // 24 hours
  private activeTasks = new Set<Promise<CrawlResult>>()

  /**
   * Initialize the browser pool
   */
  async initialize(options: CrawlOptions = {}): Promise<void> {
    if (this.browser) {
      console.log('🔄 Browser already initialized')
      return
    }

    console.log('🚀 Initializing Enhanced Crawler with Browser Pool')

    this.browser = await chromium.launch({
      headless: options.headless ?? true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
      ],
      timeout: options.timeout || 30000
    })

    console.log('✅ Enhanced Crawler initialized successfully')
  }

  /**
   * Crawl multiple URLs in parallel with intelligent queue management
   */
  async crawlUrls(urls: string[], options: CrawlOptions = {}): Promise<CrawlResult[]> {
    if (!this.browser) {
      await this.initialize(options)
    }

    const startTime = Date.now()
    console.log(`🕷️ Starting parallel crawl of ${urls.length} URLs`)

    // Strip hash fragments and deduplicate URLs
    const normalizedUrls = Array.from(new Set(urls.map(url => url.split('#')[0])))

    // Check cache first for all URLs
    const cachedResults: CrawlResult[] = []
    const urlsToFetch: string[] = []

    for (const url of normalizedUrls) {
      const cacheKey = `${this.cacheKeyPrefix}${url}`
      const cached = await cacheService.get(cacheKey)
      
      if (cached) {
        console.log(`📦 Cache hit for: ${url}`)
        cachedResults.push(cached as CrawlResult)
      } else {
        urlsToFetch.push(url)
      }
    }

    // Crawl non-cached URLs in parallel with concurrency control
    let fetchedResults: CrawlResult[] = []
    
    if (urlsToFetch.length > 0) {
      console.log(`🌐 Fetching ${urlsToFetch.length} URLs from web`)
      
      const maxConcurrency = options.maxConcurrency || 5
      const chunks = this.chunkArray(urlsToFetch, maxConcurrency)
      
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(url => this.crawlSingleUrl(url, options))
        const chunkResults = await Promise.allSettled(chunkPromises)
        
        const successfulResults = chunkResults
          .filter((result): result is PromiseFulfilledResult<CrawlResult> => 
            result.status === 'fulfilled'
          )
          .map(result => result.value)
        
        fetchedResults = [...fetchedResults, ...successfulResults]
        
        // Small delay between chunks to avoid overwhelming the server
        if (chunks.indexOf(chunk) < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
    }

    // Combine cached and fetched results
    const allResults = [...cachedResults, ...fetchedResults]
    
    const duration = Date.now() - startTime
    console.log(`✅ Completed crawling ${urls.length} URLs in ${duration}ms`)
    console.log(`📊 Cache hits: ${cachedResults.length}, Web fetches: ${urlsToFetch.length}`)

    // Record metrics
    metricsService.recordApiDuration(`enhanced-crawler:batch:${urls.length}`, duration)

    return allResults
  }

  /**
   * Crawl a single URL with caching
   */
  async crawlUrl(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    const results = await this.crawlUrls([url], options)
    return results[0] || {
      url,
      html: '',
      text: '',
      links: [],
      success: false,
      error: 'No result returned',
      responseTime: 0
    }
  }

  /**
   * Internal method to crawl a single URL
   */
  private async crawlSingleUrl(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    if (!this.browser) {
      throw new Error('Browser not initialized')
    }

    const startTime = Date.now()
    let page: Page | null = null

    try {
      console.log(`🔍 Processing: ${url}`)

      // Create a new page with optimized settings
      page = await this.browser.newPage({
        userAgent: options.userAgent || 
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      })

      // Set reasonable timeouts
      page.setDefaultTimeout(options.timeout || 15000)
      page.setDefaultNavigationTimeout(options.timeout || 15000)

      // Navigate to the URL
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: options.timeout || 15000
      })

      // Wait for content to load
      await page.waitForTimeout(options.waitTime || 1500)

      // Extract comprehensive content
      const content = await page.evaluate(() => {
        // Get all text content
        const text = document.body.innerText

        // Get HTML content
        const html = document.documentElement.outerHTML

        // Get page title
        const title = document.title

        // Extract all links
        const links: Array<{ href: string; text: string }> = []
        document.querySelectorAll('a[href]').forEach(link => {
          const href = (link as HTMLAnchorElement).href
          const text = link.textContent?.trim() || ''
          if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
            links.push({ href, text })
          }
        })

        return { html, text, title, links }
      })

      const responseTime = Date.now() - startTime
      const result: CrawlResult = {
        url,
        ...content,
        success: true,
        responseTime
      }

      // Cache the result
      const cacheKey = `${this.cacheKeyPrefix}${url}`
      await cacheService.set(cacheKey, result, this.cacheTTL)

      console.log(`✅ Successfully processed: ${url} (${responseTime}ms)`)
      return result

    } catch (error) {
      const responseTime = Date.now() - startTime
      const result: CrawlResult = {
        url,
        html: '',
        text: '',
        links: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime
      }

      console.error(`❌ Error processing ${url}:`, error)
      return result

    } finally {
      if (page) {
        try {
          await page.close()
        } catch (e) {
          console.warn('Error closing page:', e)
        }
      }
    }
  }

  /**
   * Advanced: Crawl with custom extraction logic
   */
  async crawlWithExtraction<T>(
    urls: string[],
    extractorFunction: (page: Page) => Promise<T>,
    options: CrawlOptions = {}
  ): Promise<Array<{ url: string; data: T; success: boolean; error?: string }>> {
    if (!this.browser) {
      await this.initialize(options)
    }

    // Strip hash fragments and deduplicate URLs
    const normalizedUrls = Array.from(new Set(urls.map(url => url.split('#')[0])))

    const results: Array<{ url: string; data: T; success: boolean; error?: string }> = []
    const maxConcurrency = options.maxConcurrency || 3
    const chunks = this.chunkArray(normalizedUrls, maxConcurrency)

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (url) => {
        let page: Page | null = null
        try {
          page = await this.browser!.newPage()
          await page.goto(url, { waitUntil: 'networkidle' })
          await page.waitForTimeout(options.waitTime || 1500)
          
          const data = await extractorFunction(page)
          return { url, data, success: true }
        } catch (error) {
          return {
            url,
            data: {} as T,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        } finally {
          if (page) {
            try {
              await page.close()
            } catch (e) {
              console.warn('Error closing page:', e)
            }
          }
        }
      })

      const chunkResults = await Promise.allSettled(chunkPromises)
      
      for (const result of chunkResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        }
      }
    }

    return results
  }

  /**
   * Utility: Split array into chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      console.log('🧹 Enhanced Crawler cleaned up')
    }
  }

  /**
   * Get browser status
   */
  isInitialized(): boolean {
    return this.browser !== null && this.browser.isConnected()
  }
}

// Export singleton instance
export const enhancedCrawlerService = new EnhancedCrawlerService() 