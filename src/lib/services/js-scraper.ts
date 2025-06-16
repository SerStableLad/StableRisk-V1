import puppeteer, { Browser, Page } from 'puppeteer'
import { cacheService } from './cache-service'

export interface ScrapingOptions {
  waitTime?: number
  timeout?: number
  userAgent?: string
  viewport?: { width: number; height: number }
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'
}

export interface ScrapedContent {
  html: string
  text: string
  url: string
  title?: string
  links: Array<{ href: string; text: string }>
  success: boolean
  error?: string
}

/**
 * Reusable JavaScript scraping service using Puppeteer
 * Handles JavaScript-rendered content that basic fetch() cannot access
 */
export class JavaScriptScraperService {
  private cacheKeyPrefix = 'js-scraper:'
  private cacheTTL = 86400 // 24 hours

  /**
   * Scrape a JavaScript-rendered page and return structured content
   */
  async scrapePage(url: string, options: ScrapingOptions = {}): Promise<ScrapedContent> {
    const cacheKey = `${this.cacheKeyPrefix}${url}`
    
    // Check cache first
    const cached = await cacheService.get(cacheKey)
    if (cached) {
      console.log(`📦 Cache hit for JS scraping: ${url}`)
      return cached as ScrapedContent
    }

    console.log(`🔍 JS scraping (cache miss): ${url}`)

    let browser: Browser | null = null
    let page: Page | null = null

    try {
      // Launch browser with appropriate options
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        timeout: options.timeout || 30000
      })

      page = await browser.newPage()

      // Set user agent
      await page.setUserAgent(
        options.userAgent || 
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )

      // Set viewport
      await page.setViewport(options.viewport || { width: 1366, height: 768 })

      // Navigate to the URL
      console.log(`🌐 Navigating to ${url}`)
      await page.goto(url, {
        waitUntil: options.waitUntil || 'networkidle2',
        timeout: options.timeout || 15000
      })

      // Wait for content to load (especially for React/Vue apps)
      await new Promise(resolve => setTimeout(resolve, options.waitTime || 3000))

      // Extract content
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

        return {
          html,
          text,
          title,
          links
        }
      })

      const result: ScrapedContent = {
        ...content,
        url,
        success: true
      }

      // Cache the result
      await cacheService.set(cacheKey, result, this.cacheTTL)
      console.log(`✅ Successfully scraped and cached: ${url}`)

      return result

    } catch (error) {
      console.error(`💥 Error scraping ${url}:`, error)
      
      const errorResult: ScrapedContent = {
        html: '',
        text: '',
        url,
        links: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }

      return errorResult

    } finally {
      // Clean up resources
      if (page) {
        try {
          await page.close()
        } catch (e) {
          console.warn('Error closing page:', e)
        }
      }
      if (browser) {
        try {
          await browser.close()
        } catch (e) {
          console.warn('Error closing browser:', e)
        }
      }
    }
  }

  /**
   * Extract links matching specific patterns from a scraped page
   */
  async extractLinks(url: string, patterns: RegExp[], options: ScrapingOptions = {}): Promise<Array<{ href: string; text: string }>> {
    const content = await this.scrapePage(url, options)
    
    if (!content.success) {
      return []
    }

    return content.links.filter(link => 
      patterns.some(pattern => 
        pattern.test(link.href) || pattern.test(link.text)
      )
    )
  }

  /**
   * Search for specific text patterns in a JavaScript-rendered page
   */
  async searchText(url: string, patterns: RegExp[], options: ScrapingOptions = {}): Promise<Array<{ pattern: RegExp; matches: string[] }>> {
    const content = await this.scrapePage(url, options)
    
    if (!content.success) {
      return []
    }

    const results: Array<{ pattern: RegExp; matches: string[] }> = []

    for (const pattern of patterns) {
      const matches = content.text.match(pattern) || []
      if (matches.length > 0) {
        results.push({ pattern, matches })
      }
    }

    return results
  }

  /**
   * Extract structured data from a JavaScript-rendered page using custom evaluation function
   */
  async extractData<T>(
    url: string, 
    extractorFunction: () => T, 
    options: ScrapingOptions = {}
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    let browser: Browser | null = null
    let page: Page | null = null

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        timeout: options.timeout || 30000
      })

      page = await browser.newPage()
      await page.setUserAgent(
        options.userAgent || 
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )
      await page.setViewport(options.viewport || { width: 1366, height: 768 })

      await page.goto(url, {
        waitUntil: options.waitUntil || 'networkidle2',
        timeout: options.timeout || 15000
      })

      await new Promise(resolve => setTimeout(resolve, options.waitTime || 3000))

      const data = await page.evaluate(extractorFunction)

      return { success: true, data }

    } catch (error) {
      console.error(`💥 Error extracting data from ${url}:`, error)
      return { 
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
      if (browser) {
        try {
          await browser.close()
        } catch (e) {
          console.warn('Error closing browser:', e)
        }
      }
    }
  }
}

// Export singleton instance
export const jsScraperService = new JavaScriptScraperService() 