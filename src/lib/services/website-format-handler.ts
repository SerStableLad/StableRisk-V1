import { WebsiteFormat } from '@/lib/types'
import { chromium, Browser, Page } from 'playwright'

/**
 * Website Format Handler
 * Detects and handles different website formats (HTML, PDF, SPA, protected)
 * Provides appropriate extraction strategies for each format type
 */
export class WebsiteFormatHandler {
  private readonly DEFAULT_TIMEOUT = 15000
  private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  /**
   * Detect the format and characteristics of a website
   */
  async detectWebsiteFormat(url: string): Promise<WebsiteFormat> {
    try {
      console.log(`[WebsiteFormat] Detecting format for ${url}`)
      
      // First, try a HEAD request to check content type
      const headResponse = await this.performHeadRequest(url)
      
      // Check for PDF content
      if (headResponse.contentType && headResponse.contentType.includes('application/pdf')) {
        return {
          type: 'pdf',
          requiresAuth: headResponse.status === 401 || headResponse.status === 403,
          hasJavaScript: false,
          estimatedComplexity: 'medium'
        }
      }

      // Check for authentication requirements
      if (headResponse.status === 401 || headResponse.status === 403) {
        return {
          type: 'protected',
          requiresAuth: true,
          hasJavaScript: false,
          estimatedComplexity: 'high'
        }
      }

      // For HTML content, we need to analyze the actual content
      if (headResponse.status === 200) {
        const format = await this.analyzeHTMLContent(url)
        return format
      }

      // Fallback for unknown responses
      return {
        type: 'html',
        requiresAuth: false,
        hasJavaScript: false,
        estimatedComplexity: 'low'
      }

    } catch (error) {
      console.warn(`[WebsiteFormat] Error detecting format for ${url}:`, error)
      
      // Default fallback
      return {
        type: 'html',
        requiresAuth: false,
        hasJavaScript: true, // Assume JS for safety
        estimatedComplexity: 'medium'
      }
    }
  }

  /**
   * Extract content based on detected website format
   */
  async extractContent(url: string, format?: WebsiteFormat): Promise<{
    content: string
    success: boolean
    extractionMethod: string
    error?: string
  }> {
    const detectedFormat = format || await this.detectWebsiteFormat(url)
    
    console.log(`[WebsiteFormat] Extracting content from ${detectedFormat.type} format: ${url}`)

    try {
      switch (detectedFormat.type) {
        case 'pdf':
          return await this.extractPDFContent(url)
        
        case 'spa':
          return await this.extractSPAContent(url)
        
        case 'protected':
          return await this.extractProtectedContent(url)
        
        case 'html':
        default:
          if (detectedFormat.hasJavaScript) {
            return await this.extractDynamicHTMLContent(url)
          } else {
            return await this.extractStaticHTMLContent(url)
          }
      }
    } catch (error) {
      console.error(`[WebsiteFormat] Extraction failed for ${url}:`, error)
      return {
        content: '',
        success: false,
        extractionMethod: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Perform HEAD request to check basic website characteristics
   */
  private async performHeadRequest(url: string): Promise<{
    status: number
    contentType?: string
    contentLength?: number
  }> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'User-Agent': this.USER_AGENT,
        },
        signal: AbortSignal.timeout(5000)
      })

      return {
        status: response.status,
        contentType: response.headers.get('content-type') || undefined,
        contentLength: parseInt(response.headers.get('content-length') || '0') || undefined
      }
    } catch (error) {
      console.warn(`[WebsiteFormat] HEAD request failed for ${url}:`, error)
      return { status: 0 }
    }
  }

  /**
   * Analyze HTML content to determine characteristics
   */
  private async analyzeHTMLContent(url: string): Promise<WebsiteFormat> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.USER_AGENT },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        return {
          type: 'html',
          requiresAuth: response.status === 401 || response.status === 403,
          hasJavaScript: false,
          estimatedComplexity: 'low'
        }
      }

      const html = await response.text()
      
      // Detect JavaScript frameworks and dynamic content
      const hasReact = /(__NEXT_DATA__|_next\/|react|ReactDOM)/i.test(html)
      const hasVue = /(__nuxt|_nuxt\/|vue\.js|Vue\.)/i.test(html)
      const hasAngular = /(ng-|angular|@angular)/i.test(html)
      const scriptMatches = html.match(/<script/gi)
      const hasHeavyJS = /<script[^>]*src[^>]*>/gi.test(html) && (scriptMatches?.length ?? 0) > 5
      
      // Detect SPA characteristics
      const isSPA = hasReact || hasVue || hasAngular || 
                   html.includes('document.getElementById') ||
                   html.includes('app-root') ||
                   html.includes('root') && html.length < 5000 // Small HTML suggests SPA
      
      // Detect authentication requirements
      const requiresAuth = /login|sign.?in|authenticate|unauthorized/i.test(html) &&
                          html.length < 10000 // Small page suggesting login redirect

      // Estimate complexity
      let complexity: 'low' | 'medium' | 'high' = 'low'
      if (isSPA || hasHeavyJS) complexity = 'high'
      else if (hasReact || hasVue || hasAngular) complexity = 'medium'

      return {
        type: isSPA ? 'spa' : 'html',
        requiresAuth,
        hasJavaScript: hasReact || hasVue || hasAngular || hasHeavyJS,
        estimatedComplexity: complexity
      }

    } catch (error) {
      console.warn(`[WebsiteFormat] HTML analysis failed for ${url}:`, error)
      return {
        type: 'html',
        requiresAuth: false,
        hasJavaScript: true, // Assume JS for safety
        estimatedComplexity: 'medium'
      }
    }
  }

  /**
   * Extract content from PDF documents (placeholder - would need PDF parsing library)
   */
  private async extractPDFContent(url: string): Promise<{
    content: string
    success: boolean
    extractionMethod: string
    error?: string
  }> {
    // For now, return indication that PDF extraction is not implemented
    // In a real implementation, you would use a library like pdf-parse or similar
    return {
      content: `PDF_CONTENT_PLACEHOLDER: ${url}`,
      success: false,
      extractionMethod: 'pdf_not_implemented',
      error: 'PDF extraction not implemented - would require pdf-parse library'
    }
  }

  /**
   * Extract content from Single Page Applications using Playwright
   */
  private async extractSPAContent(url: string): Promise<{
    content: string
    success: boolean
    extractionMethod: string
    error?: string
  }> {
    let browser: Browser | null = null
    let page: Page | null = null

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      })

      page = await browser.newPage({
        userAgent: this.USER_AGENT,
        viewport: { width: 1366, height: 768 }
      })

      // Navigate and wait for SPA to load
      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: this.DEFAULT_TIMEOUT 
      })

      // Wait additional time for React/Vue components to render
      await page.waitForTimeout(3000)

      // Wait for potential data loading
      try {
        await page.waitForFunction(() => {
          const text = document.body.innerText
          return text.length > 1000 || // Content has loaded
                 text.includes('$') ||   // Financial data indicators
                 text.includes('%') ||
                 document.querySelectorAll('[data-testid], [class*="card"], [class*="metric"]').length > 0
        }, { timeout: 10000 })
      } catch {
        // Continue if data loading detection times out
      }

      const content = await page.content()

      return {
        content,
        success: true,
        extractionMethod: 'spa_playwright'
      }

    } catch (error) {
      return {
        content: '',
        success: false,
        extractionMethod: 'spa_playwright_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      if (page) await page.close().catch(() => {})
      if (browser) await browser.close().catch(() => {})
    }
  }

  /**
   * Extract content from protected/authentication-required sites
   */
  private async extractProtectedContent(url: string): Promise<{
    content: string
    success: boolean
    extractionMethod: string
    error?: string
  }> {
    // For protected content, we can't extract without credentials
    // This is a security feature - we don't attempt to bypass authentication
    return {
      content: '',
      success: false,
      extractionMethod: 'protected_no_auth',
      error: 'Content requires authentication - extraction not possible without credentials'
    }
  }

  /**
   * Extract content from dynamic HTML with JavaScript
   */
  private async extractDynamicHTMLContent(url: string): Promise<{
    content: string
    success: boolean
    extractionMethod: string
    error?: string
  }> {
    let browser: Browser | null = null
    let page: Page | null = null

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      })

      page = await browser.newPage({
        userAgent: this.USER_AGENT,
        viewport: { width: 1366, height: 768 }
      })

      await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: this.DEFAULT_TIMEOUT 
      })

      // Wait for content to load
      await page.waitForTimeout(2000)

      const content = await page.content()

      return {
        content,
        success: true,
        extractionMethod: 'dynamic_html_playwright'
      }

    } catch (error) {
      return {
        content: '',
        success: false,
        extractionMethod: 'dynamic_html_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } finally {
      if (page) await page.close().catch(() => {})
      if (browser) await browser.close().catch(() => {})
    }
  }

  /**
   * Extract content from static HTML
   */
  private async extractStaticHTMLContent(url: string): Promise<{
    content: string
    success: boolean
    extractionMethod: string
    error?: string
  }> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.USER_AGENT },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        return {
          content: '',
          success: false,
          extractionMethod: 'static_html_failed',
          error: `HTTP ${response.status}: ${response.statusText}`
        }
      }

      const content = await response.text()

      return {
        content,
        success: true,
        extractionMethod: 'static_html_fetch'
      }

    } catch (error) {
      return {
        content: '',
        success: false,
        extractionMethod: 'static_html_failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get recommended extraction strategy based on website format
   */
  getExtractionStrategy(format: WebsiteFormat): {
    preferredMethod: string
    estimatedCost: number
    estimatedLatency: number
    fallbackMethods: string[]
  } {
    switch (format.type) {
      case 'pdf':
        return {
          preferredMethod: 'pdf_parsing',
          estimatedCost: 0.05, // Medium cost due to PDF processing
          estimatedLatency: 3000,
          fallbackMethods: ['ai_extraction']
        }

      case 'spa':
        return {
          preferredMethod: 'playwright_spa',
          estimatedCost: 0.02, // Higher cost due to browser usage
          estimatedLatency: 8000,
          fallbackMethods: ['ai_extraction', 'static_html']
        }

      case 'protected':
        return {
          preferredMethod: 'skip_extraction',
          estimatedCost: 0.0,
          estimatedLatency: 100,
          fallbackMethods: []
        }

      case 'html':
      default:
        if (format.hasJavaScript) {
          return {
            preferredMethod: 'playwright_dynamic',
            estimatedCost: 0.01,
            estimatedLatency: 4000,
            fallbackMethods: ['dom_parsing', 'ai_extraction']
          }
        } else {
          return {
            preferredMethod: 'dom_parsing',
            estimatedCost: 0.0, // Free for static content
            estimatedLatency: 1000,
            fallbackMethods: ['ai_extraction']
          }
        }
    }
  }
}

// Export singleton instance
export const websiteFormatHandler = new WebsiteFormatHandler()