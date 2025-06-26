import { enhancedCrawlerService, CrawlResult, CrawlOptions } from './enhanced-crawler'
import { transparencyService } from './transparency'
import { cacheService } from './cache-service'
import { metricsService } from './metrics-service'

export interface EnhancedTransparencyData {
  official_websites: string[]
  transparency_dashboard: string | null
  audit_reports: Array<{
    url: string
    title: string
    date?: string
    firm?: string
  }>
  documentation_links: string[]
  social_media: Array<{
    platform: string
    url: string
  }>
  github_repositories: string[]
  discovery_method: string
  performance_metrics: {
    total_time: number
    cache_hits: number
    web_fetches: number
    parallel_operations: number
  }
}

/**
 * Enhanced Transparency Service using optimized parallel crawling
 * Integrates with existing transparency service while providing significant performance improvements
 */
export class EnhancedTransparencyService {
  private cacheKeyPrefix = 'enhanced-transparency:'
  private cacheTTL = 86400 // 24 hours

  /**
   * Get transparency data with enhanced parallel crawling
   */
  async getEnhancedTransparencyData(
    symbol: string, 
    officialWebsites: string[] = [],
    options: CrawlOptions = {}
  ): Promise<EnhancedTransparencyData> {
    const startTime = Date.now()
    
    console.log(`🔍 Starting enhanced transparency analysis for ${symbol}`)
    
    // Check cache first
    const cacheKey = `${this.cacheKeyPrefix}${symbol.toLowerCase()}`
    const cached = await cacheService.get(cacheKey)
    if (cached) {
      console.log(`📦 Cache hit for transparency data: ${symbol}`)
      return cached as EnhancedTransparencyData
    }

    try {
      // Phase 1: Get baseline data from existing service (fallback)
      const baselineData = await transparencyService.getTransparencyData(symbol, officialWebsites[0] || '')
      
      // Phase 2: Enhanced parallel discovery
      const enhancedData = await this.performEnhancedDiscovery(symbol, officialWebsites, options)
      
      // Phase 3: Merge and deduplicate results
      const mergedData = this.mergeTransparencyData(baselineData, enhancedData)
      
      const totalTime = Date.now() - startTime
      const result: EnhancedTransparencyData = {
        ...mergedData,
        performance_metrics: {
          total_time: totalTime,
          cache_hits: enhancedData.cache_hits || 0,
          web_fetches: enhancedData.web_fetches || 0,
          parallel_operations: enhancedData.parallel_operations || 0
        }
      }

      // Cache the result
      await cacheService.set(cacheKey, result, this.cacheTTL)
      
      console.log(`✅ Enhanced transparency analysis completed for ${symbol} in ${totalTime}ms`)
      return result

    } catch (error) {
      console.error(`❌ Enhanced transparency analysis failed for ${symbol}:`, error)
      
      // Fallback to baseline service
      const baselineData = await transparencyService.getTransparencyData(symbol, officialWebsites[0] || '')
      return {
        official_websites: [], // TransparencyData doesn't have this field
        transparency_dashboard: baselineData.dashboard_url || null,
        audit_reports: [], // TransparencyData doesn't have this field
        documentation_links: [], // TransparencyData doesn't have this field
        social_media: [], // TransparencyData doesn't have this field
        github_repositories: [], // TransparencyData doesn't have this field
        discovery_method: 'fallback',
        performance_metrics: {
          total_time: Date.now() - startTime,
          cache_hits: 0,
          web_fetches: 0,
          parallel_operations: 0
        }
      }
    }
  }

  /**
   * Perform enhanced discovery using parallel crawling
   */
  private async performEnhancedDiscovery(
    symbol: string, 
    officialWebsites: string[],
    options: CrawlOptions = {}
  ): Promise<{
    official_websites: string[]
    transparency_dashboard: string | null
    audit_reports: Array<{ url: string; title: string; date?: string; firm?: string }>
    documentation_links: string[]
    social_media: Array<{ platform: string; url: string }>
    github_repositories: string[]
    cache_hits?: number
    web_fetches?: number
    parallel_operations?: number
  }> {
    
    console.log(`🚀 Starting enhanced parallel discovery for ${symbol}`)
    
    // Step 1: Prepare URLs for parallel crawling
    const urlsToAnalyze = [
      ...officialWebsites,
      `https://coinmarketcap.com/currencies/${symbol.toLowerCase()}/`,
      `https://coingecko.com/en/coins/${symbol.toLowerCase()}`,
      `https://github.com/search?q=${symbol}+stablecoin&type=repositories`,
    ].filter(url => url && url.length > 0)

    // Step 2: Parallel crawl all URLs
    const crawlResults = await enhancedCrawlerService.crawlUrls(urlsToAnalyze, {
      maxConcurrency: 5, // Process 5 URLs simultaneously
      timeout: 15000,
      waitTime: 1500,
      ...options
    })

    console.log(`📊 Parallel crawl completed: ${crawlResults.length} results`)

    // Step 3: Extract structured data from crawl results
    const extractedData = await this.extractStructuredData(symbol, crawlResults)

    // Step 4: Enhanced link discovery using custom extraction
    const enhancedLinks = await this.discoverAdditionalLinks(symbol, extractedData.official_websites)

    return {
      ...extractedData,
      ...enhancedLinks,
      cache_hits: crawlResults.filter(r => r.responseTime < 100).length, // Fast responses likely from cache
      web_fetches: crawlResults.filter(r => r.success && r.responseTime >= 100).length,
      parallel_operations: crawlResults.length
    }
  }

  /**
   * Extract structured transparency data from crawl results
   */
  private async extractStructuredData(symbol: string, crawlResults: CrawlResult[]) {
    const result = {
      official_websites: [] as string[],
      transparency_dashboard: null as string | null,
      audit_reports: [] as Array<{ url: string; title: string; date?: string; firm?: string }>,
      documentation_links: [] as string[],
      social_media: [] as Array<{ platform: string; url: string }>,
      github_repositories: [] as string[]
    }

    for (const crawlResult of crawlResults) {
      if (!crawlResult.success) continue

      const { url, text, links, html } = crawlResult

      // Extract transparency dashboards
      if (this.isTransparencyDashboard(text, html)) {
        result.transparency_dashboard = url
      }

      // Extract audit reports
      const auditLinks = this.extractAuditReports(links, text)
      result.audit_reports.push(...auditLinks)

      // Extract GitHub repositories
      const githubRepos = this.extractGitHubRepositories(links, text, symbol)
      result.github_repositories.push(...githubRepos)

      // Extract social media links
      const socialLinks = this.extractSocialMedia(links, text)
      result.social_media.push(...socialLinks)

      // Extract documentation links
      const docLinks = this.extractDocumentationLinks(links, text)
      result.documentation_links.push(...docLinks)

      // Add official websites
      if (this.isOfficialWebsite(url, text, symbol)) {
        result.official_websites.push(url)
      }
    }

    // Deduplicate all arrays
    result.official_websites = [...new Set(result.official_websites)]
    result.documentation_links = [...new Set(result.documentation_links)]
    result.github_repositories = [...new Set(result.github_repositories)]
    
    // Deduplicate objects by URL
    result.audit_reports = this.deduplicateByUrl(result.audit_reports)
    result.social_media = this.deduplicateByUrl(result.social_media)

    return result
  }

  /**
   * Discover additional links using targeted crawling
   */
  private async discoverAdditionalLinks(symbol: string, officialWebsites: string[]) {
    if (officialWebsites.length === 0) {
      return {
        additional_documentation: [],
        additional_repositories: [],
        additional_social: []
      }
    }

    // Use custom extraction to find specific transparency-related content
    const additionalData = await enhancedCrawlerService.crawlWithExtraction(
      officialWebsites.slice(0, 3), // Limit to first 3 official sites
      async (page) => {
        return await page.evaluate((symbolName) => {
          const links: Array<{ href: string; text: string; type: string }> = []
          
          // Look for transparency-specific links
          document.querySelectorAll('a[href]').forEach(link => {
            const href = (link as HTMLAnchorElement).href
            const text = link.textContent?.toLowerCase() || ''
            
            if (text.includes('audit') || text.includes('transparency') || text.includes('reserve')) {
              links.push({ href, text, type: 'transparency' })
            } else if (text.includes('github') || href.includes('github.com')) {
              links.push({ href, text, type: 'github' })
            } else if (text.includes('docs') || text.includes('documentation')) {
              links.push({ href, text, type: 'documentation' })
            }
          })
          
          return links
        }, symbol)
      },
      { maxConcurrency: 3, timeout: 10000 }
    )

    // Process the additional data
    const additional = {
      additional_documentation: [] as string[],
      additional_repositories: [] as string[],
      additional_social: [] as string[]
    }

    for (const result of additionalData) {
      if (result.success && result.data) {
        for (const link of result.data) {
          if (link.type === 'documentation') {
            additional.additional_documentation.push(link.href)
          } else if (link.type === 'github') {
            additional.additional_repositories.push(link.href)
          } else if (link.type === 'transparency') {
            additional.additional_documentation.push(link.href)
          }
        }
      }
    }

    return additional
  }

  // Utility methods for data extraction (simplified versions)
  private isTransparencyDashboard(text: string, html: string): boolean {
    const transparencyIndicators = [
      'reserve', 'transparency', 'attestation', 'proof of reserves',
      'backing', 'collateral', 'audit', 'real-time'
    ]
    
    const textLower = text.toLowerCase()
    return transparencyIndicators.some(indicator => textLower.includes(indicator))
  }

  private extractAuditReports(links: Array<{ href: string; text: string }>, text: string) {
    return links
      .filter(link => {
        const linkText = link.text.toLowerCase()
        const href = link.href.toLowerCase()
        return linkText.includes('audit') || linkText.includes('report') || 
               href.includes('audit') || href.includes('report')
      })
      .map(link => ({
        url: link.href,
        title: link.text || 'Audit Report',
        date: this.extractDateFromText(link.text),
        firm: this.extractAuditFirm(link.text)
      }))
  }

  private extractGitHubRepositories(links: Array<{ href: string; text: string }>, text: string, symbol: string) {
    return links
      .filter(link => link.href.includes('github.com'))
      .map(link => link.href)
      .filter(url => url.includes(symbol.toLowerCase()) || url.includes('stablecoin'))
  }

  private extractSocialMedia(links: Array<{ href: string; text: string }>, text: string) {
    const socialPlatforms = ['twitter.com', 'x.com', 'linkedin.com', 'telegram.org', 't.me', 'discord.gg']
    
    return links
      .filter(link => socialPlatforms.some(platform => link.href.includes(platform)))
      .map(link => ({
        platform: this.identifyPlatform(link.href),
        url: link.href
      }))
  }

  private extractDocumentationLinks(links: Array<{ href: string; text: string }>, text: string) {
    return links
      .filter(link => {
        const linkText = link.text.toLowerCase()
        return linkText.includes('docs') || linkText.includes('documentation') || 
               linkText.includes('whitepaper') || linkText.includes('guide')
      })
      .map(link => link.href)
  }

  private isOfficialWebsite(url: string, text: string, symbol: string): boolean {
    // Simple heuristic - can be enhanced
    return text.toLowerCase().includes(symbol.toLowerCase()) && 
           !url.includes('coinmarketcap') && 
           !url.includes('coingecko')
  }

  // Helper methods
  private extractDateFromText(text: string): string | undefined {
    const dateRegex = /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4}/
    const match = text.match(dateRegex)
    return match ? match[0] : undefined
  }

  private extractAuditFirm(text: string): string | undefined {
    const firms = ['pwc', 'kpmg', 'deloitte', 'ey', 'certik', 'quantstamp', 'trail of bits']
    const textLower = text.toLowerCase()
    return firms.find(firm => textLower.includes(firm))
  }

  private identifyPlatform(url: string): string {
    if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter'
    if (url.includes('linkedin.com')) return 'linkedin'
    if (url.includes('telegram.org') || url.includes('t.me')) return 'telegram'
    if (url.includes('discord.gg')) return 'discord'
    return 'other'
  }

  private deduplicateByUrl<T extends { url: string }>(items: T[]): T[] {
    const seen = new Set<string>()
    return items.filter(item => {
      if (seen.has(item.url)) return false
      seen.add(item.url)
      return true
    })
  }

  private mergeTransparencyData(baseline: any, enhanced: any): any {
    // Merge and deduplicate data from both sources
    return {
      official_websites: [...new Set([...(baseline.official_websites || []), ...(enhanced.official_websites || [])])],
      transparency_dashboard: enhanced.transparency_dashboard || baseline.transparency_dashboard,
      audit_reports: this.deduplicateByUrl([...(baseline.audit_reports || []), ...(enhanced.audit_reports || [])]),
      documentation_links: [...new Set([...(baseline.documentation_links || []), ...(enhanced.documentation_links || [])])],
      social_media: this.deduplicateByUrl([...(baseline.social_media || []), ...(enhanced.social_media || [])]),
      github_repositories: [...new Set([...(baseline.github_repositories || []), ...(enhanced.github_repositories || [])])],
      discovery_method: 'enhanced_parallel'
    }
  }
}

// Export singleton instance
export const enhancedTransparencyService = new EnhancedTransparencyService() 