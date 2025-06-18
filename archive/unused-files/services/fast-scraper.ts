// Fast scraper service placeholder
// This service requires playwright dependency: npm install playwright

export interface FastScrapingOptions {
  waitTime?: number
  timeout?: number
  userAgent?: string
  viewport?: { width: number; height: number }
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
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

// Placeholder implementation
export const fastScraperService = {
  async scrapePage(url: string, options?: FastScrapingOptions): Promise<ScrapedContent> {
    return {
      html: '',
      text: '',
      url,
      links: [],
      success: false,
      error: 'Playwright not installed. Run: npm install playwright'
    }
  },

  async scrapeMultiple(urls: string[], options?: FastScrapingOptions): Promise<ScrapedContent[]> {
    return urls.map(url => ({
      html: '',
      text: '',
      url,
      links: [],
      success: false,
      error: 'Playwright not installed'
    }))
  },

  async closeBrowser(): Promise<void> {
    // No-op
  }
} 