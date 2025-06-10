import { TransparencyData } from '@/lib/types'
import { 
  getKnownTransparencyData, 
  isKnownStablecoin, 
  getMappingMetadata,
  isMappingDataStale,
  getKnownAttestationUrl,
  TRUSTED_ATTESTATION_PROVIDERS 
} from './stablecoin-mapping-table'
import { cacheService } from './cache-service'
import { metricsService } from './metrics-service'
import { ApiClient } from './api-client'
import { config } from '@/lib/config'
import puppeteer, { Browser, Page } from 'puppeteer'

// Types for hybrid discovery
interface DiscoveryResult {
  url: string
  content?: string
  confidence: number
  source: 'link_harvest' | 'content_analysis' | 'subdomain_enum' | 'intelligent_crawl'
  transparencyData?: Partial<TransparencyData>
}

interface ParsedTransparencyInfo {
  dashboardUrl?: string
  hasProofOfReserves?: boolean
  attestationProvider?: string
  updateFrequency?: string
  lastUpdateDate?: string
  verificationStatus?: string
  confidence: number
}

// Basic transparency data for Tier 2
interface BasicTransparencyData {
  dashboard_url?: string
  has_proof_of_reserves: boolean
}

export class TransparencyService {
  // Maximum number of concurrent requests
  private readonly MAX_CONCURRENT_REQUESTS = 3;
  
  // Minimum acceptable confidence to stop the search
  private readonly SUFFICIENT_CONFIDENCE_THRESHOLD = 0.8;

  /**
   * Get basic transparency data for a stablecoin (for Tier 2)
   * Fast implementation with reduced scope
   */
  async getBasicTransparencyData(symbol: string, projectName?: string): Promise<BasicTransparencyData> {
    console.log(`🔍 Getting basic transparency data for ${symbol} (Tier 2)`)
    console.time('BasicTransparencyData')
    
    // Start performance tracking
    const startTime = Date.now();
    metricsService.recordApiCall(`transparencyBasic:${symbol}`);
    
    // Check cache first for Tier 2 data
    const cacheKey = `transparency:basic:${symbol}`;
    const cachedData = cacheService.get<BasicTransparencyData>(cacheKey);
    if (cachedData) {
      console.log(`✅ Using cached basic transparency data for ${symbol}`);
      metricsService.recordApiDuration(`transparencyBasic:${symbol}`, Date.now() - startTime);
      return cachedData;
    }
    
    try {
      // 🏆 PRIORITY 1: Check mapping table first for known data (fastest)
      const knownData = getKnownTransparencyData(symbol)
      if (knownData) {
        console.log(`📋 Using mapping table data for ${symbol} basic transparency`)
        console.timeEnd('BasicTransparencyData')
        
        const result = {
          dashboard_url: knownData.dashboard_url,
          has_proof_of_reserves: knownData.has_proof_of_reserves
        };
        
        // Check if mapping data is stale and log warning
        if (isMappingDataStale(symbol)) {
          console.warn(`⏰ Mapping data for ${symbol} may be stale - recommend updating`);
        }
        
        // Cache the result
        cacheService.set(cacheKey, result, 12 * 60 * 60 * 1000); // 12 hours (TIER2)
        metricsService.recordApiDuration(`transparencyBasic:${symbol}`, Date.now() - startTime);
        
        return result;
      }

      // Skip expensive search for known stablecoins with no transparency data
      if (isKnownStablecoin(symbol)) {
        console.log(`📋 ${symbol} is in mapping table but has no transparency data - skipping expensive search`);
        console.timeEnd('BasicTransparencyData')
        
        const defaultResult = {
          dashboard_url: undefined,
          has_proof_of_reserves: false
        };
        
        // Cache even negative results to avoid repeat searches
        cacheService.set(cacheKey, defaultResult, 12 * 60 * 60 * 1000); // 12 hours (same as positive results)
        metricsService.recordApiDuration(`transparencyBasic:${symbol}`, Date.now() - startTime);
        
        return defaultResult;
      }

      // 🔄 FALLBACK: Quick search for common transparency URLs for unknown stablecoins
      const websites = await this.findOfficialWebsites(symbol, projectName, undefined)
      
      if (websites.length > 0) {
        // Use parallel processing for link harvesting (fastest discovery layer)
        const linkResultPromises = websites.slice(0, 3).map(website => this.linkHarvestingDiscovery(website));
        const linkResults = await Promise.all(linkResultPromises);
        const validResults = linkResults.filter(result => result !== null) as ParsedTransparencyInfo[];
        
        if (validResults.length > 0) {
          // Use the best result (highest confidence)
          const bestResult = validResults.sort((a, b) => b.confidence - a.confidence)[0];
          console.log(`✅ Basic transparency data found for ${symbol} with confidence ${bestResult.confidence.toFixed(2)}`);
          console.timeEnd('BasicTransparencyData');
          
          const result = {
            dashboard_url: bestResult.dashboardUrl,
            has_proof_of_reserves: bestResult.hasProofOfReserves || false
          };
          
          // Cache the result
          cacheService.set(cacheKey, result, 12 * 60 * 60 * 1000); // 12 hours (TIER2)
          metricsService.recordApiDuration(`transparencyBasic:${symbol}`, Date.now() - startTime);
          
          return result;
        }
      }
      
      // Default values if nothing found
      console.log(`❌ No basic transparency data found for ${symbol}`)
      console.timeEnd('BasicTransparencyData')
      
      const defaultResult = {
        dashboard_url: undefined,
        has_proof_of_reserves: false
      };
      
      // Cache even negative results to avoid repeat searches
      cacheService.set(cacheKey, defaultResult, 6 * 60 * 60 * 1000); // 6 hours (shorter for negative results)
      metricsService.recordApiDuration(`transparencyBasic:${symbol}`, Date.now() - startTime);
      
      return defaultResult;
    } catch (error) {
      console.error(`Error getting basic transparency data for ${symbol}:`, error)
      console.timeEnd('BasicTransparencyData')
      metricsService.recordApiError(`transparencyBasic:${symbol}`, error);
      metricsService.recordApiDuration(`transparencyBasic:${symbol}`, Date.now() - startTime);
      
      return {
        dashboard_url: undefined,
        has_proof_of_reserves: false
      }
    }
  }

  /**
   * Get transparency data for a stablecoin
   * Uses hybrid intelligence approach: dynamic discovery first, then mapping table fallback
   */
  async getTransparencyData(symbol: string, projectName?: string, officialUrls?: string[]): Promise<TransparencyData> {
    console.log(`🔍 Starting hybrid transparency discovery for ${symbol}...`)
    
    // Start performance tracking
    const startTime = Date.now();
    metricsService.recordApiCall(`transparencyFull:${symbol}`);
    
    // Check cache first for Tier 3 data
    const cacheKey = `transparency:full:${symbol}`;
    const cachedData = cacheService.get<TransparencyData>(cacheKey);
    if (cachedData) {
      console.log(`✅ Using cached transparency data for ${symbol}`);
      return cachedData;
    }
    
    try {
      // 🏆 PRIORITY 1: Check mapping table for known URLs (fastest URL discovery)
      const knownData = getKnownTransparencyData(symbol)
      if (knownData && knownData.dashboard_url) {
        console.log(`📋 Found mapping table URL for ${symbol}: ${knownData.dashboard_url}`)
        
        if (isMappingDataStale(symbol)) {
          console.warn(`⏰ Mapping data for ${symbol} may be stale - recommend updating`)
        }
        
        // 🔬 ENHANCED: Analyze the known dashboard URL for live content
        try {
          console.log(`🔍 Analyzing live content from mapping table URL...`)
          const liveAnalysis = await this.analyzeDashboardContent(knownData.dashboard_url, symbol)
          
          if (liveAnalysis && this.isValidTransparencyData(liveAnalysis)) {
            console.log(`✅ Successfully analyzed mapping table dashboard for ${symbol}`)
            
            // Check for special attestation URLs (e.g., Dropbox)
            const attestationUrl = getKnownAttestationUrl(symbol)
            
            // Merge mapping table data with live analysis
            const enhancedData = {
              ...knownData,
              ...liveAnalysis,
              dashboard_url: knownData.dashboard_url, // Keep the curated URL
              attestation_url: attestationUrl || undefined // Add attestation URL if available
            }
            
            // Cache the enhanced result
            cacheService.set(cacheKey, enhancedData, 6 * 60 * 60 * 1000); // 6 hours (TIER3)
            metricsService.recordApiDuration(`transparencyFull:${symbol}`, Date.now() - startTime);
            
            return enhancedData
          } else {
            console.warn(`⚠️ Failed to analyze mapping table URL, using static data`)
          }
        } catch (analysisError) {
          console.error(`💥 Error analyzing mapping table URL:`, analysisError)
        }
        
        // Fallback to mapping table data if live analysis fails
        console.log(`📋 Using static mapping table data for ${symbol} as fallback`)
        
        // Add attestation URL to static data
        const attestationUrl = getKnownAttestationUrl(symbol)
        const enhancedStaticData = {
          ...knownData,
          attestation_url: attestationUrl || undefined
        }
        
        cacheService.set(cacheKey, enhancedStaticData, 6 * 60 * 60 * 1000); // 6 hours (TIER3)
        metricsService.recordApiDuration(`transparencyFull:${symbol}`, Date.now() - startTime);
        
        return enhancedStaticData
      }

      // Skip expensive search for known stablecoins with no transparency data
      if (isKnownStablecoin(symbol)) {
        console.log(`📋 ${symbol} is in mapping table but has no transparency data - skipping expensive search`);
        
        const defaultData = this.getDefaultTransparencyData();
        
        // Cache even negative results to avoid repeat searches
        cacheService.set(cacheKey, defaultData, 6 * 60 * 60 * 1000); // 6 hours
        metricsService.recordApiDuration(`transparencyFull:${symbol}`, Date.now() - startTime);
        
        return defaultData;
      }

      // 🔄 FALLBACK: Dynamic discovery using hybrid intelligence model (for unknown stablecoins)
      console.log(`🔍 ${symbol} not in mapping table, starting expensive discovery...`);
      const discoveredData = await this.hybridIntelligenceDiscovery(symbol, projectName, officialUrls)
      
      if (discoveredData && this.isValidTransparencyData(discoveredData)) {
        console.log(`✅ Hybrid discovery successful for ${symbol}`)
        
        // Cache the successful result
        cacheService.set(cacheKey, discoveredData, 6 * 60 * 60 * 1000); // 6 hours (TIER3)
        metricsService.recordApiDuration(`transparencyFull:${symbol}`, Date.now() - startTime);
        
        return discoveredData
      }

      console.log(`❌ No transparency data found for ${symbol}`)
      const defaultData = this.getDefaultTransparencyData();
      
      // Cache even negative results to avoid repeat searches (shorter TTL)
      cacheService.set(cacheKey, defaultData, 3 * 60 * 60 * 1000); // 3 hours
      metricsService.recordApiDuration(`transparencyFull:${symbol}`, Date.now() - startTime);
      
      return defaultData;
      
    } catch (error) {
      console.error(`💥 Error in transparency discovery for ${symbol}:`, error)
      metricsService.recordApiError(`transparencyFull:${symbol}`, error);
      metricsService.recordApiDuration(`transparencyFull:${symbol}`, Date.now() - startTime);
      
      // Final fallback to mapping table
      const knownData = getKnownTransparencyData(symbol)
      return knownData || this.getDefaultTransparencyData()
    }
  }

  /**
   * OPTIMIZED HYBRID INTELLIGENCE MODEL - 4-Layer Discovery System
   * Layer 1: Link Harvesting (100-200ms) - Run in parallel
   * Layer 2: Content Analysis (500ms) - Run in parallel  
   * Layer 3: Subdomain Enumeration (1-2s) - Only if needed
   * Layer 4: Intelligent Crawling (2-5s) - Only if needed
   */
  private async hybridIntelligenceDiscovery(
    symbol: string, 
    projectName?: string, 
    officialUrls?: string[]
  ): Promise<TransparencyData | null> {
    
    const startTime = Date.now()
    const websites = await this.findOfficialWebsites(symbol, projectName, officialUrls)
    
    if (websites.length === 0) {
      console.log(`🚫 No official websites found for ${symbol}`)
      return null
    }

    console.log(`🌐 Found ${websites.length} official websites for ${symbol}:`, websites)

    // Layer 1: Link Harvesting - Process all websites in parallel (fast)
    console.log(`🔗 Layer 1: Link harvesting for ${websites.length} websites`);
    const linkResults = await Promise.all(
      websites.slice(0, this.MAX_CONCURRENT_REQUESTS).map(website => this.linkHarvestingDiscovery(website))
    );
    
    // Filter out null results and sort by confidence
    const validLinkResults = linkResults
      .filter(result => result !== null) as ParsedTransparencyInfo[];
    
    // Sort by confidence (highest first)
    validLinkResults.sort((a, b) => b.confidence - a.confidence);
    
    // If we have a high-confidence result, use it and skip other layers
    if (validLinkResults.length > 0 && validLinkResults[0].confidence >= this.SUFFICIENT_CONFIDENCE_THRESHOLD) {
      console.log(`✅ High-confidence result from link harvesting: ${validLinkResults[0].confidence.toFixed(2)}`);
      return this.buildTransparencyData(validLinkResults[0]);
    }

    // Layer 2: Content Analysis - Process in parallel (medium speed)
    console.log(`📄 Layer 2: Content analysis for ${websites.length} websites`);
    const contentResults = await Promise.all(
      websites.slice(0, this.MAX_CONCURRENT_REQUESTS).map(website => this.contentAnalysisDiscovery(website))
    );
    
    // Filter and sort by confidence
    const validContentResults = contentResults
      .filter(result => result !== null) as ParsedTransparencyInfo[];
    validContentResults.sort((a, b) => b.confidence - a.confidence);
    
    // If we have a good result, use it
    if (validContentResults.length > 0 && validContentResults[0].confidence >= 0.7) {
      console.log(`✅ High-confidence result from content analysis: ${validContentResults[0].confidence.toFixed(2)}`);
      return this.buildTransparencyData(validContentResults[0]);
    }

    // Combine all results so far
    const combinedResults = [...validLinkResults, ...validContentResults];
    
    // If we have multiple results with reasonable confidence, combine them
    if (combinedResults.length >= 2) {
      console.log(`✅ Combining ${combinedResults.length} results from fast methods`);
      const combinedResult = this.combineAnalysisResults(combinedResults);
      if (combinedResult.confidence >= 0.65) {
        console.log(`✅ Combined result has good confidence: ${combinedResult.confidence.toFixed(2)}`);
        return this.buildTransparencyData(combinedResult);
      }
    }

    // Layer 3: Subdomain Enumeration - Only process top site (slow)
    if (websites.length > 0) {
      console.log(`🔍 Layer 3: Subdomain enumeration for primary website`);
      const subdomainResult = await this.subdomainEnumerationDiscovery(websites[0]);
        if (subdomainResult && subdomainResult.confidence >= 0.6) {
        console.log(`✅ Medium-confidence result from subdomain enumeration: ${subdomainResult.confidence.toFixed(2)}`);
        return this.buildTransparencyData(subdomainResult);
      }
    }

    // Layer 4: Intelligent Crawling - Only as last resort (very slow)
    if (websites.length > 0) {
      console.log(`🕷️ Layer 4: Intelligent crawling for primary website`);
      const crawlResult = await this.intelligentCrawlingDiscovery(websites[0]);
        if (crawlResult && crawlResult.confidence >= 0.5) {
        console.log(`✅ Result found from intelligent crawling: ${crawlResult.confidence.toFixed(2)}`);
        return this.buildTransparencyData(crawlResult);
      }
    }
    
    // If we have any results at all, combine them and use the best we've got
    if (combinedResults.length > 0) {
      console.log(`⚠️ Using best available result with confidence ${combinedResults[0].confidence.toFixed(2)}`);
      return this.buildTransparencyData(combinedResults[0]);
    }

    // Nothing found
    return null;
  }

  /**
   * Layer 1: Link Harvesting Discovery
   * Parse homepage links for transparency-related URLs + check common subdomains
   * Target: 100-200ms execution time (expanded to include subdomain checks)
   */
  private async linkHarvestingDiscovery(website: string): Promise<ParsedTransparencyInfo | null> {
    try {
      const response = await fetch(website, { 
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
      })
      
      if (!response.ok) return null
      
      const html = await response.text()
      let links = this.extractLinksFromHTML(html, website)
      
      // 🆕 OPTION 3: Enhanced Layer 1 with subdomain intelligence
      // Check common transparency subdomains during link harvesting
      const domain = new URL(website).hostname.replace('www.', '')
      const subdomainsToCheck = ['info', 'transparency', 'data', 'dashboard', 'reserves', 'docs']
      
      console.log(`🔍 Layer 1: Checking ${subdomainsToCheck.length} common transparency subdomains for ${domain}`)
      
      // Test each subdomain and add accessible ones to links
      const subdomainPromises = subdomainsToCheck.map(async (subdomain) => {
        const subdomainUrl = `https://${subdomain}.${domain}`
        try {
          const subResponse = await fetch(subdomainUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(2000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
          })
          
          if (subResponse.ok) {
            console.log(`✅ Found accessible subdomain: ${subdomainUrl}`)
            return {
              href: subdomainUrl,
              text: `${subdomain} transparency dashboard` // Synthetic anchor text for scoring
            }
          }
        } catch (error) {
          // Subdomain not accessible, skip
        }
        return null
      })
      
      const subdomainResults = await Promise.allSettled(subdomainPromises)
      const accessibleSubdomains = subdomainResults
        .filter((result): result is PromiseFulfilledResult<{href: string, text: string}> => 
          result.status === 'fulfilled' && result.value !== null
        )
        .map(result => result.value)
      
      // Add accessible subdomains to links array
      links = [...links, ...accessibleSubdomains]
      console.log(`🔗 Total links found: ${links.length} (${accessibleSubdomains.length} from subdomains)`)
      
      // Filter for transparency-related links
      const transparencyLinks = links.filter(link => 
        this.isTransparencyRelatedURL(link.href) || this.isTransparencyRelatedText(link.text)
      )

      if (transparencyLinks.length === 0) return null

      console.log(`🎯 Found ${transparencyLinks.length} transparency-related links for scoring`)

      // Analyze best transparency link using enhanced scoring
      const bestLink = transparencyLinks.reduce((best, current) => {
        const currentScore = this.calculateLinkRelevanceScore(current, html)
        const bestScore = this.calculateLinkRelevanceScore(best, html)
        console.log(`📊 Scoring: ${current.href} = ${currentScore} points`)
        return currentScore > bestScore ? current : best
      })

      console.log(`🏆 Best transparency link selected: ${bestLink.href}`)

      return {
        dashboardUrl: bestLink.href,
        hasProofOfReserves: this.detectProofOfReserves(bestLink.text + ' ' + bestLink.href),
        attestationProvider: this.extractAttestationProvider(html),
        lastUpdateDate: this.extractLastUpdateDate(html),
        confidence: 0.6 + (transparencyLinks.length * 0.1) // More links = higher confidence
      }

    } catch (error) {
      console.error('Link harvesting failed:', error)
      return null
    }
  }

  /**
   * Layer 2: Content Analysis Discovery
   * Deep HTML/JS parsing for hidden transparency patterns
   * Target: 500ms execution time
   */
  private async contentAnalysisDiscovery(website: string): Promise<ParsedTransparencyInfo | null> {
    try {
      const response = await fetch(website, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
      })

      if (!response.ok) return null

      const html = await response.text()
      
      // Advanced content analysis patterns
      const analyses = [
        this.analyzeMetaTags(html),
        this.analyzeJavaScriptContent(html),
        this.analyzeTableContent(html),
        this.analyzeAPIReferences(html),
        this.analyzeStructuredData(html),
        this.analyzeHTMLStructure(html) // Added HTML structure analysis
      ]

      // Combine analysis results
      const combinedResult = this.combineAnalysisResults(analyses)
      
      // Domain-specific confidence boosting for known transparency patterns
      const url = new URL(website)
      const hostname = url.hostname.toLowerCase()
      
      // Boost confidence for transparency-related subdomains
      if (hostname.includes('info.') || hostname.includes('dashboard.') || 
          hostname.includes('transparency.') || hostname.includes('data.') ||
          hostname.includes('stats.') || hostname.includes('metrics.')) {
        combinedResult.confidence += 0.2
        console.log(`🎯 Applied subdomain confidence boost for ${hostname}`)
      }
      
      // Lower threshold for discovery (was 0.3, now 0.2)
      if (combinedResult.confidence < 0.2) return null

      return combinedResult

    } catch (error) {
      console.error('Content analysis failed:', error)
      return null
    }
  }

  /**
   * Layer 3: Subdomain Enumeration Discovery
   * Dynamic subdomain testing based on content analysis
   * Target: 1-2s execution time  
   */
  private async subdomainEnumerationDiscovery(website: string): Promise<ParsedTransparencyInfo | null> {
    try {
      const domain = new URL(website).hostname.replace('www.', '')
      
      // Dynamic subdomain patterns based on common transparency architectures
      const subdomainPatterns = [
        'dashboard', 'transparency', 'info', 'data', 'stats', 'monitor',
        'reserves', 'attestation', 'docs'
      ]

      const subdomainPromises = subdomainPatterns.map(async (subdomain) => {
        const subdomainUrl = `https://${subdomain}.${domain}`
        try {
          const response = await fetch(subdomainUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(2000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
          })
          
          if (response.ok) {
            // Analyze the subdomain for transparency content
            const analysis = await this.analyzeSubdomainTransparency(subdomainUrl)
            return analysis
          }
        } catch {
          return null
        }
        return null
      })

      const results = await Promise.allSettled(subdomainPromises)
      const validResults = results
        .filter((result): result is PromiseFulfilledResult<ParsedTransparencyInfo> => 
          result.status === 'fulfilled' && result.value !== null
        )
        .map(result => result.value)

      if (validResults.length === 0) return null

      // Return best result
      return validResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      )

    } catch (error) {
      console.error('Subdomain enumeration failed:', error)
      return null
    }
  }

  /**
   * Layer 4: Intelligent Crawling Discovery
   * Comprehensive site crawling with transparency-focused filtering
   * Target: 2-5s execution time
   */
  private async intelligentCrawlingDiscovery(website: string): Promise<ParsedTransparencyInfo | null> {
    try {
      // Intelligent path generation based on website structure
      const paths = await this.generateIntelligentPaths(website)
      
      const crawlPromises = paths.slice(0, 10).map(async (path) => { // Limit to 10 paths
        try {
          const url = `${website}${path}`
          const response = await fetch(url, {
            signal: AbortSignal.timeout(3000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
          })

          if (response.ok) {
            const content = await response.text()
            return this.analyzePageForTransparency(url, content)
          }
        } catch {
          return null
        }
        return null
      })

      const results = await Promise.allSettled(crawlPromises)
      const validResults = results
        .filter((result): result is PromiseFulfilledResult<ParsedTransparencyInfo> => 
          result.status === 'fulfilled' && result.value !== null
        )
        .map(result => result.value)

      if (validResults.length === 0) return null

      // Return best result with crawl confidence boost
      const bestResult = validResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      )

      bestResult.confidence = Math.min(bestResult.confidence + 0.1, 1.0) // Crawl confidence boost
      return bestResult

    } catch (error) {
      console.error('Intelligent crawling failed:', error)
      return null
    }
  }

  /**
   * Find official websites for a stablecoin project
   * Now prioritizes CoinGecko official URLs over pattern guessing
   */
  private async findOfficialWebsites(symbol: string, projectName?: string, officialUrls?: string[]): Promise<string[]> {
    const websites: string[] = []

    // 1. PRIORITY: Use official URLs from CoinGecko if available
    if (officialUrls && officialUrls.length > 0) {
      console.log(`Using official URLs from CoinGecko for ${symbol}:`, officialUrls)
      
      // Validate official URLs
      for (const url of officialUrls) {
        try {
          const response = await fetch(url, { method: 'HEAD' })
          if (response.ok) {
            websites.push(url)
          }
        } catch {
          console.warn(`Official URL not accessible: ${url}`)
        }
      }
      
      // If we found working official URLs, return them
      if (websites.length > 0) {
        return websites
      }
    }

    console.log(`No working official URLs found, falling back to pattern guessing for ${symbol}...`)

    // 2. FALLBACK: Pattern-based website guessing (legacy approach)
    const patterns = [
      `https://${symbol.toLowerCase()}.com`,
      `https://${symbol.toLowerCase()}.io`,
      `https://${symbol.toLowerCase()}.fi`,
      `https://${symbol.toLowerCase()}.finance`,
      `https://www.${symbol.toLowerCase()}.com`,
      `https://www.${symbol.toLowerCase()}.io`,
      `https://www.${symbol.toLowerCase()}.fi`,
    ]

    if (projectName) {
      // Extract first word from project name (e.g., "Ethena" from "Ethena USDe")
      const firstWord = projectName.split(' ')[0].toLowerCase()
      const cleanName = projectName.toLowerCase().replace(/\s+/g, '')
      
      patterns.push(
        `https://${firstWord}.com`,
        `https://${firstWord}.io`,
        `https://${firstWord}.fi`,
        `https://${firstWord}.finance`,
        `https://${cleanName}.com`,
        `https://${cleanName}.io`,
        `https://${cleanName}.fi`,
        `https://${cleanName}.finance`,
        `https://www.${firstWord}.com`,
        `https://www.${firstWord}.io`,
        `https://www.${firstWord}.fi`,
        `https://app.${firstWord}.fi`, // For app subdomains like Ethena
      )
    }

    // Check which pattern-based websites exist
    for (const pattern of patterns) {
      try {
        const response = await fetch(pattern, { method: 'HEAD' })
        if (response.ok) {
          websites.push(pattern)
        }
      } catch {
        // Ignore failed requests
      }
    }

    return websites
  }

  /**
   * Analyze a website for transparency information
   */
  private async analyzeWebsiteTransparency(website: string): Promise<TransparencyData> {
    try {
      // In a real implementation, we would scrape the website content
      // For now, return basic analysis based on URL patterns
      
      const transparencyKeywords = [
        'transparency',
        'attestation',
        'reserves',
        'proof-of-reserves',
        'backing'
      ]

      // Check if transparency-related paths exist
      const transparencyPaths = [
        '/transparency',
        '/dashboards/transparency', // Ethena-style nested paths
        '/dashboard/transparency',
        '/app/transparency',
        '/attestation',
        '/reserves',
        '/proof-of-reserves',
        '/proof-reserves',
        '/reserve-attestation'
      ]

      let hasTransparencyPage = false
      for (const path of transparencyPaths) {
        try {
          const response = await fetch(`${website}${path}`, { method: 'HEAD' })
          if (response.ok) {
            hasTransparencyPage = true
            break
          }
        } catch {
          continue
        }
      }

      return {
        dashboard_url: hasTransparencyPage ? `${website}/transparency` : undefined,
        update_frequency: 'unknown',
        has_proof_of_reserves: hasTransparencyPage,
        verification_status: hasTransparencyPage ? 'unverified' : 'unknown'
      }
    } catch (error) {
      console.error('Error analyzing website transparency:', error)
      return {
        update_frequency: 'unknown',
        has_proof_of_reserves: false,
        verification_status: 'unknown'
      }
    }
  }

  /**
   * Calculate transparency score based on data quality
   */
  calculateTransparencyScore(data: TransparencyData): number {
    let score = 0

    // Base score for having some transparency data
    if (data.dashboard_url || data.attestation_provider) {
      score += 20
    }

    // Proof of reserves
    if (data.has_proof_of_reserves) {
      score += 30
    }

    // Attestation provider quality
    if (data.attestation_provider) {
      if (TRUSTED_ATTESTATION_PROVIDERS.tier1.includes(data.attestation_provider as any)) {
        score += 30
      } else if (TRUSTED_ATTESTATION_PROVIDERS.tier2.includes(data.attestation_provider as any)) {
        score += 20
      } else {
        score += 10
      }
    }

    // Update frequency
    switch (data.update_frequency) {
      case 'daily':
        score += 15
        break
      case 'weekly':
        score += 10
        break
      case 'monthly':
        score += 5
        break
      default:
        score += 0
    }

    // Verification status
    switch (data.verification_status) {
      case 'verified':
        score += 5
        break
      case 'unverified':
        score += 2
        break
      default:
        score += 0
    }

    return Math.min(score, 100)
  }

  /**
   * Get detailed transparency analysis
   */
  getTransparencyAnalysis(data: TransparencyData): {
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
  } {
    const strengths: string[] = []
    const weaknesses: string[] = []
    const recommendations: string[] = []

    if (data.has_proof_of_reserves) {
      strengths.push('Provides proof of reserves')
    } else {
      weaknesses.push('No proof of reserves provided')
      recommendations.push('Implement regular proof of reserves attestations')
    }

    if (data.attestation_provider) {
      if (TRUSTED_ATTESTATION_PROVIDERS.tier1.includes(data.attestation_provider as any)) {
        strengths.push(`Tier 1 attestation provider: ${data.attestation_provider}`)
      } else {
        strengths.push(`Third-party attestation: ${data.attestation_provider}`)
      }
    } else {
      weaknesses.push('No third-party attestation')
      recommendations.push('Engage reputable auditing firm for regular attestations')
    }

    if (data.update_frequency === 'daily') {
      strengths.push('Daily transparency updates')
    } else if (data.update_frequency === 'weekly') {
      strengths.push('Weekly transparency updates')
    } else if (data.update_frequency === 'monthly') {
      strengths.push('Monthly transparency updates')
    } else {
      weaknesses.push('Unclear update frequency')
      recommendations.push('Establish regular transparency reporting schedule')
    }

    if (data.dashboard_url) {
      strengths.push('Dedicated transparency dashboard')
    } else {
      weaknesses.push('No dedicated transparency dashboard')
      recommendations.push('Create public transparency dashboard')
    }

    return { strengths, weaknesses, recommendations }
  }

  /**
   * Helper method to validate if transparency data is sufficient
   */
  private isValidTransparencyData(data: TransparencyData): boolean {
    return !!(
      data.dashboard_url || 
      data.has_proof_of_reserves ||
      data.attestation_provider ||
      data.update_frequency !== 'unknown'
    )
  }

  /**
   * Get default transparency data when nothing is found
   */
  private getDefaultTransparencyData(): TransparencyData {
    return {
      update_frequency: 'unknown',
      has_proof_of_reserves: false,
      verification_status: 'unverified'
    }
  }

  /**
   * Build TransparencyData from ParsedTransparencyInfo
   */
  private buildTransparencyData(info: ParsedTransparencyInfo): TransparencyData {
    const updateFrequency = ['daily', 'weekly', 'monthly'].includes(info.updateFrequency || '') 
      ? info.updateFrequency as 'daily' | 'weekly' | 'monthly' 
      : 'unknown'
    
    const verificationStatus = ['verified', 'unverified'].includes(info.verificationStatus || '')
      ? info.verificationStatus as 'verified' | 'unverified'
      : 'unverified'
    
    return {
      dashboard_url: info.dashboardUrl,
      update_frequency: updateFrequency,
      last_update_date: info.lastUpdateDate,
      has_proof_of_reserves: info.hasProofOfReserves || false,
      attestation_provider: info.attestationProvider,
      verification_status: verificationStatus
    }
  }

  /**
   * Extract links from HTML content
   */
  private extractLinksFromHTML(html: string, baseUrl: string): Array<{href: string, text: string}> {
    const links: Array<{href: string, text: string}> = []
    
    // Simple regex to extract links (for production, use a proper HTML parser)
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi
    let match
    
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const href = new URL(match[1], baseUrl).href
        const text = match[2].trim()
        if (href && text) {
          links.push({ href, text })
        }
      } catch {
        // Invalid URL, skip
      }
    }
    
    return links
  }

  /**
   * Check if URL is transparency-related
   */
  private isTransparencyRelatedURL(url: string): boolean {
    const transparencyKeywords = [
      'transparency', 'dashboard', 'reserves', 'attestation', 
       'proof-of-reserves', 'backing', 'collateral',
      // Enhanced financial transparency terms 
      'treasury', 'revenue', 'supply', 'tvl', 'total-value-locked',
      'surplus', 'financials', 'metrics', 'stats', 'data',
      'collateralization', 'liquidity', 'holdings', 'balance',
      // Protocol-specific terms
      'protocol', 'info', 'analytics',
      // Dashboard patterns
      'app', 'portal', 'monitor', 'track', 'view', 'explorer'
    ]
    
    return transparencyKeywords.some(keyword => 
      url.toLowerCase().includes(keyword)
    )
  }

  /**
   * Check if link text is transparency-related
   */
  private isTransparencyRelatedText(text: string): boolean {
    const transparencyKeywords = [
      'transparency', 'reserves', 'attestation', 
      'proof of reserves', 'backing', 'collateral',
      // Enhanced text patterns for Sky and other protocols
      'financial data', 'treasury', 'revenue', 'metrics',
      'dashboard', 'stats', 'analytics', 'protocol data',
      'surplus', 'collateralization', 'tvl', 'total value',
      'financial dashboard', 'protocol metrics', 'real-time data',
    ]
    
    return transparencyKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    )
  }

  /**
   * Calculate relevance score for a link with context analysis and URL pattern intelligence
   */
  private calculateLinkRelevanceScore(link: {href: string, text: string}, html: string): number {
    let score = 0
    
    // 🔄 EXISTING: Original keyword scoring
    const highValueKeywords = ['transparency', 'dashboard', 'proof-of-reserves', 'financials', 'treasury']
    const mediumValueKeywords = ['reserves', 'attestation','tvl', 'supply', 'revenue', 'surplus']
    const lowValueKeywords = ['collateral', 'backing', 'stats', 'metrics', 'balance', 'holdings']
    
    const combinedText = (link.href + ' ' + link.text).toLowerCase()
    
    for (const keyword of highValueKeywords) {
      if (combinedText.includes(keyword)) score += 10
    }
    
    for (const keyword of mediumValueKeywords) {
      if (combinedText.includes(keyword)) score += 5
    }
    
    for (const keyword of lowValueKeywords) {
      if (combinedText.includes(keyword)) score += 2
    }
    
    // 🆕 SOLUTION #2: Link Context Analysis
    const linkContext = this.extractSurroundingText(html, link.href, 100)
    
    const transparencyContext = [
      'transparency report', 'financial data', 'reserve information', 
       'attestation', 'proof of reserves',
      'treasury data', 'collateral backing', 'financial transparency',
      'transparency', 'reserves', 'financial info', 'data'
    ]
    
    const uiContext = [
      'start staking', 'earn rewards', 'trade now', 'swap tokens',
      'connect wallet', 'dashboard login', 'access app', 'launch app',
      'app', 'platform', 'interface', 'portal', 'dapp'
    ]
    
    const contextLower = linkContext.toLowerCase()
    if (transparencyContext.some(keyword => contextLower.includes(keyword))) {
      score += 15 // Boost for transparency context
      console.log(`🎯 Applied transparency context boost for: ${link.href}`)
    } else if (uiContext.some(keyword => contextLower.includes(keyword))) {
      score -= 10 // Penalty for UI/app context
      console.log(`⚠️ Applied UI context penalty for: ${link.href}`)
    }
    
    // 🆕 SOLUTION #4: URL Pattern Intelligence
    try {
      const url = new URL(link.href)
      
      // Information-focused patterns (boost)
      if (url.pathname.includes('/transparency') || 
          url.pathname.includes('/reserves') ||
          url.pathname.includes('/financial') ||
          url.pathname.includes('/data') ||
          url.pathname.includes('/info')) {
        score += 20
        console.log(`📈 Applied information path boost for: ${link.href}`)
      }
      
      // Application interface patterns (penalize)
      if (url.search.includes('widget=') ||
          url.search.includes('modal=') ||
          url.search.includes('tab=') ||
          url.search.includes('action=') ||
          url.hash.includes('#/')) {
        score -= 15
        console.log(`📉 Applied UI parameter penalty for: ${link.href}`)
      }
    } catch (error) {
      // Invalid URL, no additional scoring
    }
    
    return score
  }

  /**
   * Extract surrounding text around a link for context analysis
   */
  private extractSurroundingText(html: string, url: string, radius: number): string {
    const linkIndex = html.indexOf(url)
    if (linkIndex === -1) return ''
    
    const start = Math.max(0, linkIndex - radius)
    const end = Math.min(html.length, linkIndex + url.length + radius)
    
    return html.substring(start, end)
  }

  /**
   * Detect proof of reserves from text
   */
  private detectProofOfReserves(text: string): boolean {
    const porKeywords = [
      'proof of reserves', 'proof-of-reserves', 'por', 
      'reserves attestation', 'reserve proof'
    ]
    
    return porKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    )
  }

  /**
   * Extract attestation provider from HTML
   */
  private extractAttestationProvider(html: string): string | undefined {
    const providers = Object.values(TRUSTED_ATTESTATION_PROVIDERS).flat()
    const htmlLower = html.toLowerCase()
    
    for (const provider of providers) {
      if (htmlLower.includes(provider.toLowerCase())) {
        return provider
      }
    }
    
    return undefined
  }

  /**
   * Extract last update date from HTML content
   */
  private extractLastUpdateDate(html: string): string | undefined {
    // Common patterns for last update information
    const updatePatterns = [
      // "Last updated: 2023-12-15" or "Last update: December 15, 2023"
      /(?:last\s+update[d]?|updated)\s*:?\s*([^<\n,;]+)/gi,
      // "Updated on 2023-12-15" or "Data as of December 15, 2023"
      /(?:updated\s+on|data\s+as\s+of|last\s+sync[ed]?)\s*:?\s*([^<\n,;]+)/gi,
      // "*Last update: ..." patterns
      /\*\s*(?:last\s+update[d]?)\s*:?\s*([^<\n,;*]+)/gi,
      // Look for dates in common formats
      /(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2})?(?:Z|[+-]\d{2}:\d{2})?)/gi,
      /(\w+\s+\d{1,2},?\s+\d{4})/gi, // "December 15, 2023" or "Dec 15 2023"
      /(\d{1,2}\/\d{1,2}\/\d{4})/gi, // "12/15/2023"
      /(\d{1,2}-\d{1,2}-\d{4})/gi    // "15-12-2023"
    ]

    for (const pattern of updatePatterns) {
      const matches = html.match(pattern)
      if (matches) {
        for (const match of matches) {
          const dateMatch = match.match(/(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i)
          if (dateMatch) {
            const dateStr = dateMatch[1]
            const parsedDate = this.parseDate(dateStr)
            if (parsedDate) {
              return parsedDate.toISOString().split('T')[0] // Return YYYY-MM-DD format
            }
          }
        }
      }
    }

    return undefined
  }

  /**
   * Parse various date formats into a Date object
   */
  private parseDate(dateStr: string): Date | null {
    try {
      // Try parsing ISO format first
      if (/\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) return date
      }

      // Try parsing US format (MM/DD/YYYY)
      const usFormat = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (usFormat) {
        const [, month, day, year] = usFormat
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (!isNaN(date.getTime())) return date
      }

      // Try parsing EU format (DD-MM-YYYY or DD/MM/YYYY)
      const euFormat = dateStr.match(/(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})/)
      if (euFormat) {
        const [, day, month, year] = euFormat
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        if (!isNaN(date.getTime())) return date
      }

      // Try parsing text format (December 15, 2023)
      const textDate = new Date(dateStr)
      if (!isNaN(textDate.getTime())) return textDate

    } catch (error) {
      console.warn('Date parsing failed for:', dateStr, error)
    }

    return null
  }

  /**
   * Analyze meta tags for transparency info
   */
  private analyzeMetaTags(html: string): ParsedTransparencyInfo {
    const metaRegex = /<meta[^>]+name=["']([^"']+)["'][^>]+content=["']([^"']+)["'][^>]*>/gi
    const transparencyKeywords = ['transparency', 'reserves', 'attestation']
    
    let confidence = 0
    let hasTransparencyMeta = false
    
    let match
    while ((match = metaRegex.exec(html)) !== null) {
      const name = match[1].toLowerCase()
      const content = match[2].toLowerCase()
      
      if (transparencyKeywords.some(keyword => 
        name.includes(keyword) || content.includes(keyword)
      )) {
        hasTransparencyMeta = true
        confidence += 0.2
      }
    }
    
    return {
      confidence: Math.min(confidence, 0.5),
      hasProofOfReserves: hasTransparencyMeta
    }
  }

  /**
   * Analyze JavaScript content for transparency patterns
   */
  private analyzeJavaScriptContent(html: string): ParsedTransparencyInfo {
    const scriptRegex = /<script[^>]*>(.*?)<\/script>/gi
    
    // Enhanced keywords for financial dashboard detection
    const jsFinancialKeywords = [
      'reserves', 'attestation', 'transparency', 'treasury', 'revenue',
      'surplus', 'collateralization', 'tvl', 'total_supply', 'balance',
      // API patterns for real-time data
      'api/balance', 'api/reserves', 'api/treasury', 'api/metrics',
      // Dashboard frameworks and financial data patterns
      'chart', 'dashboard', 'financial', 'metrics', 'price_feed',
 
    ]
    
    // Patterns for financial data structures
    const financialDataPatterns = [
      /["'](?:total_?supply|treasury|revenue|surplus|tvl)["']\s*:/gi,
      /api.*?(?:balance|reserves|treasury|metrics)/gi,
      /\$[\d,]+(?:\.\d+)?[kmb]?/gi, // Dollar amounts
      /[\d,]+(?:\.\d+)?\s*(?:tokens?|usds?|dai|usdt?)/gi // Token amounts
    ]
    
    let confidence = 0
    let hasTransparencyAPI = false
    let hasFinancialData = false
    
    let match
    while ((match = scriptRegex.exec(html)) !== null) {
      const script = match[1].toLowerCase()
      
      // Check for financial keywords
      const keywordMatches = jsFinancialKeywords.filter(keyword => script.includes(keyword))
      if (keywordMatches.length > 0) {
        hasTransparencyAPI = true
        confidence += Math.min(keywordMatches.length * 0.05, 0.3)
      }
      
      // Check for financial data patterns
      for (const pattern of financialDataPatterns) {
        const patternMatches = (script.match(pattern) || []).length
        if (patternMatches > 0) {
          hasFinancialData = true
          confidence += Math.min(patternMatches * 0.1, 0.4)
        }
      }
    }
    
    // Bonus confidence for modern dashboard patterns
    if (hasTransparencyAPI && hasFinancialData) {
      confidence += 0.2 // Dashboard pattern bonus
    }
    
    return {
      confidence: Math.min(confidence, 0.6), // Increased max for comprehensive JS analysis
      hasProofOfReserves: hasTransparencyAPI || hasFinancialData
    }
  }

  /**
   * Analyze table content for transparency data
   */
  private analyzeTableContent(html: string): ParsedTransparencyInfo {
    const tableRegex = /<table[^>]*>(.*?)<\/table>/gi
    const transparencyKeywords = [
      'reserves', 'collateral', 'backing', 'attestation',
      // Enhanced financial metrics
      'treasury', 'revenue', 'supply', 'tvl', 'total value locked',
      'surplus', 'balance', 'holdings', 'liquidity', 'assets'
    ]
    
    let confidence = 0
    let hasTransparencyTable = false
    
    let match
    while ((match = tableRegex.exec(html)) !== null) {
      const table = match[1]
      
      if (transparencyKeywords.some(keyword => table.toLowerCase().includes(keyword))) {
        hasTransparencyTable = true
        confidence += 0.2
      }
    }
    
    // Also check for financial metric cards/widgets (common in modern dashboards)
    const cardPatterns = [
      /total\s+supply.*?[\d,\.]+/gi,
      /treasury.*?balance.*?[\$\d,\.]+/gi,
      /collateralization.*?[\$\d,\.]+/gi,
      /tvl.*?[\$\d,\.]+/gi,
      /revenue.*?[\$\d,\.]+/gi,
      /surplus.*?[\$\d,\.]+/gi
    ]
    
    for (const pattern of cardPatterns) {
      if (pattern.test(html)) {
        hasTransparencyTable = true
        confidence += 0.15
      }
    }
    
    return {
      confidence: Math.min(confidence, 0.6), // Increased max confidence for financial metrics
      hasProofOfReserves: hasTransparencyTable
    }
  }

  /**
   * Analyze API references in HTML
   */
  private analyzeAPIReferences(html: string): ParsedTransparencyInfo {
    const apiRegex = /(?:api|endpoint)[\s]*:[\s]*["']([^"']+)["']/gi
    const transparencyAPIs = ['reserves', 'transparency', 'attestation']
    
    let confidence = 0
    let hasTransparencyAPI = false
    
    let match
    while ((match = apiRegex.exec(html)) !== null) {
      const apiUrl = match[1].toLowerCase()
      
      if (transparencyAPIs.some(keyword => apiUrl.includes(keyword))) {
        hasTransparencyAPI = true
        confidence += 0.15
      }
    }
    
    return {
      confidence: Math.min(confidence, 0.3),
      hasProofOfReserves: hasTransparencyAPI
    }
  }

  /**
   * Analyze structured data (JSON-LD, microdata)
   */
  private analyzeStructuredData(html: string): ParsedTransparencyInfo {
    const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gi
    
    let confidence = 0
    let hasStructuredTransparency = false
    
    let match
    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1])
        const dataStr = JSON.stringify(data).toLowerCase()
        
        if (dataStr.includes('transparency') || dataStr.includes('reserves')) {
          hasStructuredTransparency = true
          confidence += 0.3
        }
      } catch {
        // Invalid JSON, skip
      }
    }
    
    return {
      confidence: Math.min(confidence, 0.3),
      hasProofOfReserves: hasStructuredTransparency
    }
  }

  /**
   * Analyze HTML structure for dashboard patterns
   */
  private analyzeHTMLStructure(html: string): ParsedTransparencyInfo {
    let confidence = 0
    let hasFinancialStructure = false

    // Look for dashboard-specific HTML patterns
    const dashboardPatterns = [
      // Financial metric cards/widgets
      /<div[^>]*class[^>]*(?:card|widget|metric|stat)[^>]*>/gi,
      /<section[^>]*class[^>]*(?:dashboard|metrics|financial)[^>]*>/gi,
      // Chart/visualization containers
      /<div[^>]*(?:chart|graph|visual)[^>]*>/gi,
      /<canvas[^>]*>/gi,
      // Data display patterns
      /<span[^>]*class[^>]*(?:value|amount|price|balance)[^>]*>/gi,
      /<div[^>]*class[^>]*(?:total|supply|treasury|revenue)[^>]*>/gi
    ]

    // Financial data patterns in HTML attributes and classes
    const financialAttributePatterns = [
      /class="[^"]*(?:balance|treasury|revenue|surplus|tvl|supply)[^"]*"/gi,
      /id="[^"]*(?:dashboard|metrics|financial|transparency)[^"]*"/gi,
      /data-[^=]*="[^"]*(?:\$[\d,]+|[\d,]+\s*(?:tokens?|usds?|dai))[^"]*"/gi
    ]

    // Check for dashboard structure patterns
    for (const pattern of dashboardPatterns) {
      const matches = (html.match(pattern) || []).length
      if (matches > 0) {
        hasFinancialStructure = true
        confidence += Math.min(matches * 0.05, 0.3)
      }
    }

    // Check for financial attribute patterns
    for (const pattern of financialAttributePatterns) {
      const matches = (html.match(pattern) || []).length
      if (matches > 0) {
        hasFinancialStructure = true
        confidence += Math.min(matches * 0.1, 0.4)
      }
    }

    // Look for modern financial dashboard frameworks
    const frameworkPatterns = [
      /recharts/gi, // React charting library
      /chart\.js/gi, // Chart.js
      /d3\./gi, // D3.js
      /plotly/gi, // Plotly
      /highcharts/gi // Highcharts
    ]

    for (const pattern of frameworkPatterns) {
      if (pattern.test(html)) {
        hasFinancialStructure = true
        confidence += 0.2
        break // Only count one framework bonus
      }
    }

    return {
      confidence: Math.min(confidence, 0.5), // Max confidence for HTML structure
      hasProofOfReserves: hasFinancialStructure,
      lastUpdateDate: this.extractLastUpdateDate(html)
    }
  }

  /**
   * Combines multiple transparency analysis results into a single result
   * Merges data and calculates a weighted confidence score
   */
  private combineAnalysisResults(results: ParsedTransparencyInfo[]): ParsedTransparencyInfo {
    if (results.length === 0) {
      throw new Error('Cannot combine empty results');
    }
    
    if (results.length === 1) {
      return results[0];
    }
    
    // Sort by confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence);
    
    const combined: ParsedTransparencyInfo = {
      confidence: 0,
      // Start with the highest confidence values
      dashboardUrl: results[0].dashboardUrl,
      hasProofOfReserves: results[0].hasProofOfReserves,
      attestationProvider: results[0].attestationProvider,
      updateFrequency: results[0].updateFrequency,
      lastUpdateDate: results[0].lastUpdateDate,
      verificationStatus: results[0].verificationStatus
    };
    
    // Calculate weighted confidence score
    let totalConfidence = 0;
    let totalWeight = 0;
    
    // Consider all results, with higher weights for higher confidence results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      // Weight decreases as we go down the confidence ranking
      const weight = 1 / (i + 1); 
      totalConfidence += result.confidence * weight;
      totalWeight += weight;
      
      // Fill in missing values from lower-confidence results
      if (!combined.dashboardUrl && result.dashboardUrl) {
        combined.dashboardUrl = result.dashboardUrl;
      }
      
      if (combined.hasProofOfReserves === undefined && result.hasProofOfReserves !== undefined) {
        combined.hasProofOfReserves = result.hasProofOfReserves;
      }
      
      if (!combined.attestationProvider && result.attestationProvider) {
        combined.attestationProvider = result.attestationProvider;
      }
      
      if (!combined.updateFrequency && result.updateFrequency) {
        combined.updateFrequency = result.updateFrequency;
      }
      
      if (!combined.lastUpdateDate && result.lastUpdateDate) {
        combined.lastUpdateDate = result.lastUpdateDate;
      }
      
      if (!combined.verificationStatus && result.verificationStatus) {
        combined.verificationStatus = result.verificationStatus;
      }
    }
    
    // Calculate the final confidence score
    // This is higher than the average but lower than the max if we have multiple results
    combined.confidence = totalConfidence / totalWeight;
    
    // Boost confidence slightly if we have multiple results agreeing
    if (results.length >= 3) {
      combined.confidence = Math.min(0.95, combined.confidence * 1.15);
    } else if (results.length >= 2) {
      combined.confidence = Math.min(0.9, combined.confidence * 1.1);
    }
    
    return combined;
  }

  /**
   * Analyze subdomain for transparency content
   */
  private async analyzeSubdomainTransparency(url: string): Promise<ParsedTransparencyInfo | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
      })
      
      if (!response.ok) return null
      
      const html = await response.text()
      const analysis = await this.contentAnalysisDiscovery(url)
      
      console.log(`🔍 Analyzing subdomain ${url}: confidence=${analysis?.confidence || 0}`)
      
      // Lower threshold for subdomain analysis (was 0.3, now 0.15)
      if (analysis && analysis.confidence > 0.15) {
        console.log(`✅ Subdomain ${url} passed confidence threshold with ${analysis.confidence}`)
        return {
          ...analysis,
          dashboardUrl: url,
          confidence: analysis.confidence + 0.2 // Subdomain confidence boost
        }
      } else {
        console.log(`❌ Subdomain ${url} failed confidence threshold: ${analysis?.confidence || 0} < 0.15`)
      }
      
      return null
    } catch (error) {
      console.error(`Error analyzing subdomain ${url}:`, error)
      return null
    }
  }

  /**
   * Generate intelligent paths based on website structure
   */
  private async generateIntelligentPaths(website: string): Promise<string[]> {
    const staticPaths = [
      '/transparency', '/dashboard', '/reserves', '/attestation',
      '/proof-of-reserves', '/backing', '/collateral',
      '/app/transparency', '/app/dashboard', '/app/reserves',
      '/dashboards/transparency', '/data/reserves', '/stats'
    ]
    
    try {
      // Analyze homepage for sitemap or navigation structure
      const response = await fetch(website, {
        signal: AbortSignal.timeout(2000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
      })
      
      if (response.ok) {
        const html = await response.text()
        const dynamicPaths = this.extractNavigationPaths(html)
        return [...staticPaths, ...dynamicPaths]
      }
    } catch {
      // Fall back to static paths
    }
    
    return staticPaths
  }

  /**
   * Extract navigation paths from HTML
   */
  private extractNavigationPaths(html: string): string[] {
    const paths: string[] = []
    const navRegex = /<nav[^>]*>(.*?)<\/nav>/gi
    const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi
    
    let navMatch
    while ((navMatch = navRegex.exec(html)) !== null) {
      const nav = navMatch[1]
      
      let linkMatch
      while ((linkMatch = linkRegex.exec(nav)) !== null) {
        const href = linkMatch[1]
        if (href.startsWith('/') && href.length > 1) {
          paths.push(href);
        }
      }
    }
    
    return paths.filter(path => 
      this.isTransparencyRelatedURL(path)
    ).slice(0, 5) // Limit to 5 dynamic paths
  }

  /**
   * Analyze page content for transparency information
   */
  private async analyzePageForTransparency(url: string, content: string): Promise<ParsedTransparencyInfo | null> {
    const analysis = this.combineAnalysisResults([
      this.analyzeMetaTags(content),
      this.analyzeJavaScriptContent(content),
      this.analyzeTableContent(content),
      this.analyzeAPIReferences(content),
      this.analyzeStructuredData(content)
    ])
    
    if (analysis.confidence < 0.2) return null
    
    return {
      ...analysis,
      dashboardUrl: url,
      confidence: analysis.confidence + 0.1 // Page analysis confidence boost
    }
  }

  /**
   * 🔬 Analyze specific dashboard URL for live transparency data using Puppeteer
   * 
   * This method takes a curated URL from the mapping table and performs
   * comprehensive content analysis to extract real transparency metrics from
   * JavaScript-rendered content.
   */
  private async analyzeDashboardContent(url: string, symbol: string): Promise<TransparencyData | null> {
    console.log(`🔍 Analyzing dashboard content for ${symbol} at ${url} with Puppeteer`)
    
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
        timeout: 30000
      })
      
      page = await browser.newPage()
      
      // Set user agent to appear as regular browser
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      
      // Set viewport
      await page.setViewport({ width: 1366, height: 768 })
      
      // Navigate to the URL with timeout
      console.log(`🌐 Navigating to ${url}`)
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 15000
      })
      
      // Wait for content to load (especially for React/Vue apps)
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Get page content after JavaScript execution
      const html = await page.content()
      console.log(`📄 Fetched ${html.length} characters from rendered dashboard`)
      
      // Try to extract specific data points that might be dynamically loaded
      const dashboardData = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase()
        const html = document.documentElement.outerHTML.toLowerCase()
        
        // Look for proof of reserves indicators (more comprehensive)
        const hasProofOfReserves = (
          text.includes('proof of reserves') ||
          text.includes('proof of reserve') ||
          text.includes('reserves') ||
          text.includes('backing') ||
          text.includes('audit') ||
          text.includes('attestation') ||
          text.includes('verified') ||
          text.includes('collateral') ||
          text.includes('assets under management') ||
          text.includes('total supply') ||
          text.includes('backed by')
        )
        
        // Look for update frequency indicators
        let updateFrequency = 'unknown'
        if (text.includes('daily') || text.includes('24 hour') || text.includes('real-time') || text.includes('live')) updateFrequency = 'daily'
        else if (text.includes('weekly') || text.includes('week')) updateFrequency = 'weekly'
        else if (text.includes('monthly') || text.includes('month')) updateFrequency = 'monthly'
        
        // Look for verification status
        let verificationStatus = 'unknown'
        if (text.includes('verified') && !text.includes('unverified')) verificationStatus = 'verified'
        else if (text.includes('unverified')) verificationStatus = 'unverified'
        
        // Look for attestation providers (expanded list)
        let attestationProvider = 'unknown'
        const providers = [
          'deloitte', 'kpmg', 'pwc', 'ey', 'ernst & young', 'bdo', 'grant thornton', 
          'mazars', 'armanino', 'withum', 'rkco', 'top shelf', 'moore', 'moss adams',
          'anchin', 'crowe', 'baker tilly', 'cbiz', 'eisneramper'
        ]
        for (const provider of providers) {
          if (text.includes(provider)) {
            attestationProvider = provider
            break
          }
        }
        
        // Look for specific M0 dashboard indicators
        const isM0Dashboard = (
          text.includes('m0') ||
          text.includes('earnable') ||
          html.includes('dashboard.m0.org')
        )
        
        return {
          hasProofOfReserves,
          updateFrequency,
          verificationStatus,
          attestationProvider,
          isM0Dashboard,
          fullText: text.substring(0, 1000) // First 1000 chars for debugging
        }
      })
      
      console.log(`✅ Extracted dashboard data:`, {
        hasProofOfReserves: dashboardData.hasProofOfReserves,
        updateFrequency: dashboardData.updateFrequency,
        verificationStatus: dashboardData.verificationStatus,
        attestationProvider: dashboardData.attestationProvider,
        isM0Dashboard: dashboardData.isM0Dashboard
      })
      
      // Perform comprehensive content analysis on the rendered HTML
      const analyses = [
        this.analyzeMetaTags(html),
        this.analyzeJavaScriptContent(html),
        this.analyzeTableContent(html),
        this.analyzeAPIReferences(html),
        this.analyzeStructuredData(html),
        this.analyzeHTMLStructure(html)
      ]
      
      // Combine all analysis results
      const combinedAnalysis = this.combineAnalysisResults(analyses)
      console.log(`📊 Combined analysis confidence: ${combinedAnalysis.confidence.toFixed(2)}`)
      
      // Extract last update date from HTML
      const lastUpdated = combinedAnalysis.lastUpdateDate || this.extractLastUpdateDate(html)
      
      // Build transparency data combining Puppeteer extraction with traditional analysis
      const transparencyData: TransparencyData = {
        dashboard_url: url,
        update_frequency: (dashboardData.updateFrequency !== 'unknown' ? dashboardData.updateFrequency : 
                          (this.extractUpdateFrequency(html) || 'unknown')) as 'daily' | 'weekly' | 'monthly' | 'unknown',
        has_proof_of_reserves: dashboardData.hasProofOfReserves || 
                              combinedAnalysis.hasProofOfReserves || 
                              this.detectProofOfReserves(html),
        verification_status: (dashboardData.verificationStatus !== 'unknown' ? dashboardData.verificationStatus :
                             (this.extractVerificationStatus(html) || 'unverified')) as 'verified' | 'unverified' | 'unknown',
        attestation_provider: dashboardData.attestationProvider !== 'unknown' ? dashboardData.attestationProvider :
                             (combinedAnalysis.attestationProvider || this.extractAttestationProvider(html) || 'Not specified'),
        last_update_date: lastUpdated
      }
      
      // Validate that we found meaningful data
      const hasRealData = (
        (transparencyData.attestation_provider && transparencyData.attestation_provider !== 'Not specified') ||
        transparencyData.update_frequency !== 'unknown' ||
        transparencyData.verification_status !== 'unverified' ||
        transparencyData.has_proof_of_reserves ||
        transparencyData.last_update_date
      )
      
      if (hasRealData) {
        console.log(`✅ Extracted meaningful transparency data from dashboard using Puppeteer`)
        return transparencyData
      } else {
        console.warn(`⚠️ Dashboard analysis found minimal meaningful data even with Puppeteer`)
        return null
      }
      
    } catch (error) {
      console.error(`💥 Error analyzing dashboard content for ${symbol} with Puppeteer:`, error)
      return null
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
   * Extract update frequency from dashboard content
   */
  private extractUpdateFrequency(html: string): 'daily' | 'weekly' | 'monthly' | 'unknown' {
    const frequencyPatterns = [
      /updated?\s+(daily|hourly|weekly|monthly|real-?time|live)/gi,
      /refresh(?:ed)?\s+(every\s+\d+\s+(?:minute|hour|day)s?)/gi,
      /last\s+update[d]?\s*:?\s*(\d+\s+(?:minute|hour|day)s?\s+ago)/gi,
      /(real-?time|live)\s+data/gi
    ]
    
    for (const pattern of frequencyPatterns) {
      const match = html.match(pattern)
      if (match) {
        const frequency = match[0].toLowerCase()
        if (frequency.includes('daily')) return 'daily'
        if (frequency.includes('hourly')) return 'daily' // Map hourly to daily
        if (frequency.includes('weekly')) return 'weekly'
        if (frequency.includes('monthly')) return 'monthly'
        if (frequency.includes('real') || frequency.includes('live')) return 'daily' // Map real-time to daily
        // For other patterns, try to map to known values
        if (frequency.includes('minute') || frequency.includes('hour')) return 'daily'
        if (frequency.includes('day')) return 'daily'
        if (frequency.includes('week')) return 'weekly'
        if (frequency.includes('month')) return 'monthly'
      }
    }
    
    return 'unknown'
  }
  
  /**
   * Extract verification status from dashboard content
   */
  private extractVerificationStatus(html: string): 'verified' | 'unverified' | 'unknown' {
    const verificationPatterns = [
      /verif(?:ied|ication)\s*(?:by|from)?\s*([^<>\n]{1,50})/gi,
      /audit(?:ed)?\s*(?:by|from)?\s*([^<>\n]{1,50})/gi,
      /attested?\s*(?:by|from)?\s*([^<>\n]{1,50})/gi,
      /certified?\s*(?:by|from)?\s*([^<>\n]{1,50})/gi
    ]
    
    for (const pattern of verificationPatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        const verifier = match[1].trim().replace(/[<>]/g, '')
        if (verifier.length > 3 && verifier.length < 50) {
          return 'verified' // Return just 'verified' since we can't store the verifier name
        }
      }
    }
    
    // Check for simple verification indicators
    if (/verified/gi.test(html)) return 'verified'
    if (/unverified/gi.test(html)) return 'unverified'
    
    return 'unknown'
  }
}

// Export both the class and the singleton instance
export const transparencyService = new TransparencyService(); 