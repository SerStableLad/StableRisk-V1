import { 
  AICollateralExtractionConfig,
  ExtractionResult,
  CollateralData, 
  CircuitBreakerStatus,
  AIExtractionMetrics
} from '@/lib/types'
/**
 * AI-Powered Collateral Extraction Service
 * Main orchestrator for hybrid extraction combining DOM parsing and AI fallback
 * Implements cost optimization, confidence-based caching, and circuit breaker patterns
 */
export class AICollateralExtractionService {
  private config: AICollateralExtractionConfig
  private circuitBreakers: Map<string, CircuitBreakerStatus> = new Map()
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5 // Failures before opening circuit
  private readonly CIRCUIT_BREAKER_TIMEOUT = 5 * 60 * 1000 // 5 minutes
  
  // Injected dependencies
  private confidenceBasedCachingService: any
  private hybridExtractionPipeline: any
  private websiteFormatHandler: any
  private geminiService: any
  private metricsService: any

  constructor(
    config: AICollateralExtractionConfig,
    dependencies?: {
      confidenceBasedCachingService?: any
      hybridExtractionPipeline?: any
      websiteFormatHandler?: any
      geminiService?: any
      metricsService?: any
    }
  ) {
    this.config = config
    
    // Use injected dependencies or fallback to default imports
    if (dependencies) {
      this.confidenceBasedCachingService = dependencies.confidenceBasedCachingService
      this.hybridExtractionPipeline = dependencies.hybridExtractionPipeline
      this.websiteFormatHandler = dependencies.websiteFormatHandler
      this.geminiService = dependencies.geminiService
      this.metricsService = dependencies.metricsService
    } else {
      // Lazy load defaults to avoid circular dependencies in tests
      this.loadDefaultDependencies()
    }
    console.log(`[AICollateralExtraction] Initialized with config:`, {
      maxCost: config.maxCostPerExtraction,
      confidenceThreshold: config.confidenceThreshold,
      fallbackToAI: config.fallbackToAI,
      cacheBasedOnConfidence: config.cacheBasedOnConfidence
    })
  }

  private async loadDefaultDependencies() {
    try {
      console.log(`[AICollateralExtraction] Loading default dependencies...`)
      
      const { confidenceBasedCachingService } = await import('./confidence-based-caching')
      const { hybridExtractionPipeline } = await import('./hybrid-extraction-pipeline')
      const { websiteFormatHandler } = await import('./website-format-handler')
      const { geminiService } = await import('./gemini-service')
      const { metricsService } = await import('./metrics-service')
      
      this.confidenceBasedCachingService = confidenceBasedCachingService
      this.hybridExtractionPipeline = hybridExtractionPipeline
      this.websiteFormatHandler = websiteFormatHandler
      this.geminiService = geminiService
      this.metricsService = metricsService
      
      console.log(`[AICollateralExtraction] Dependencies loaded successfully`)
    } catch (error) {
      console.error(`[AICollateralExtraction] Failed to load dependencies:`, error)
      throw new Error(`Failed to load AI collateral extraction dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Main extraction method - attempts DOM parsing first, then AI fallback
   */
  async extractCollateralData(url: string, symbol?: string): Promise<ExtractionResult> {
    const startTime = Date.now()
    const extractionKey = symbol || new URL(url).hostname

    console.log(`[AICollateralExtraction] Starting extraction for ${url} (${symbol || 'unknown'})`)

    try {
      // Ensure dependencies are loaded
      if (!this.hybridExtractionPipeline || !this.geminiService) {
        console.log(`[AICollateralExtraction] Loading dependencies for ${extractionKey}...`)
        await this.loadDefaultDependencies()
      }

      // Check circuit breaker
      if (this.isCircuitBreakerOpen(extractionKey)) {
        return {
          success: false,
          error: 'Extraction circuit breaker is open due to repeated failures',
          cost_usd: 0,
          extraction_time_ms: Date.now() - startTime,
          method_used: 'dom_parsing',
          confidence: 0
        }
      }

      // Check cache first if enabled
      if (this.config.cacheBasedOnConfidence) {
        const cachedData = await this.confidenceBasedCachingService?.getCachedCollateralData(extractionKey)
        if (cachedData) {
          console.log(`[AICollateralExtraction] Using cached data for ${extractionKey}`)
          this.metricsService?.recordCacheHit('ai_collateral_extraction')
          return {
            success: true,
            data: cachedData,
            cost_usd: 0,
            extraction_time_ms: Date.now() - startTime,
            method_used: 'dom_parsing', // Cached data is treated as free
            confidence: cachedData.confidence || 0
          }
        } else {
          // Record cache miss
          this.metricsService?.recordCacheMiss('ai_collateral_extraction')
        }
      }

      // Execute hybrid extraction
      const extractionResult = await this.hybridExtractionPipeline?.executeExtraction(
        url,
        symbol,
        this.config.maxCostPerExtraction
      )

      // Check if extraction was successful
      if (!extractionResult) {
        throw new Error('Hybrid extraction pipeline returned no result')
      }

      const isSuccessful = extractionResult.confidence >= this.config.confidenceThreshold
      
      if (isSuccessful) {
        // Cache successful results if enabled
        if (this.config.cacheBasedOnConfidence) {
          await this.confidenceBasedCachingService?.cacheCollateralData(
            extractionKey,
            extractionResult.combinedResult,
            extractionResult.confidence
          )
        }

        // Reset circuit breaker on success
        this.resetCircuitBreaker(extractionKey)

        // Record cost and metrics
        this.confidenceBasedCachingService?.recordExtractionCost(extractionResult.totalCost)
        this.confidenceBasedCachingService?.recordExtractionLatency(Date.now() - startTime)
        this.metricsService?.recordCostMetric('ai_collateral_extraction', extractionResult.totalCost)

        console.log(`[AICollateralExtraction] Extraction successful for ${extractionKey} - confidence: ${extractionResult.confidence.toFixed(2)}, cost: $${extractionResult.totalCost.toFixed(4)}`)

        return {
          success: true,
          data: extractionResult.combinedResult,
          cost_usd: extractionResult.totalCost,
          extraction_time_ms: Date.now() - startTime,
          method_used: this.determineMethodUsed(extractionResult.strategies),
          confidence: extractionResult.confidence
        }
      } else {
        // Low confidence result
        this.recordCircuitBreakerFailure(extractionKey)
        this.confidenceBasedCachingService?.recordExtractionFailure()

        console.warn(`[AICollateralExtraction] Low confidence extraction for ${extractionKey} - confidence: ${extractionResult.confidence.toFixed(2)}`)

        return {
          success: false,
          error: `Extraction confidence ${extractionResult.confidence.toFixed(2)} below threshold ${this.config.confidenceThreshold}`,
          cost_usd: extractionResult.totalCost,
          extraction_time_ms: Date.now() - startTime,
          method_used: this.determineMethodUsed(extractionResult.strategies),
          confidence: extractionResult.confidence
        }
      }

    } catch (error) {
      console.error(`[AICollateralExtraction] Extraction failed for ${extractionKey}:`, error)
      
      // Record failure
      this.recordCircuitBreakerFailure(extractionKey)
      this.confidenceBasedCachingService?.recordExtractionFailure()
      this.metricsService?.recordApiError(`ai_collateral_extraction:${extractionKey}`, error)

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
        cost_usd: 0,
        extraction_time_ms: Date.now() - startTime,
        method_used: 'dom_parsing',
        confidence: 0
      }
    }
  }

  /**
   * Parse collateral data from DOM content (used by tests)
   */
  async parseCollateralFromDOM(html: string): Promise<CollateralData> {
    console.log(`[AICollateralExtraction] Parsing collateral from DOM content (${html.length} chars)`)
    
    try {
      // Use a simplified DOM parsing approach
      const results: CollateralData = {
        total_assets: 0,
        total_liabilities: 0,
        overcollateralization_ratio: 1.0,
        collateral_allocations: [],
        confidence: 0,
        extraction_method: 'dom_parsing'
      }

      // Extract total assets
      const totalAssetsMatch = html.match(/total[\s_]+assets?[\s]*:?[\s]*\$?([0-9,]+(?:\.[0-9]+)?)\s*([KMB])?/i)
      if (totalAssetsMatch) {
        let value = parseFloat(totalAssetsMatch[1].replace(/,/g, ''))
        const unit = totalAssetsMatch[2]
        if (unit === 'K') value *= 1000
        else if (unit === 'M') value *= 1000000
        else if (unit === 'B') value *= 1000000000
        results.total_assets = value
      }

      // Extract table data for allocations
      const tableMatches = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)
      if (tableMatches) {
        tableMatches.forEach(tableHtml => {
          const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
          if (rowMatches) {
            rowMatches.forEach(rowHtml => {
              const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)
              if (cellMatches && cellMatches.length >= 2) {
                const cellTexts = cellMatches.map(cell => 
                  cell.replace(/<[^>]*>/g, '').trim()
                )
                
                // Look for asset allocation patterns
                const assetMatch = cellTexts.find(text => /^[A-Za-z\s]+$/.test(text) && text.length > 2)
                const valueMatch = cellTexts.find(text => /\$[\d,]+(\.\d+)?[KMB]?|\d+(\.\d+)?%/.test(text))
                
                if (assetMatch && valueMatch) {
                  let percentage = 0
                  let value_usd = 0
                  
                  // Parse percentage
                  const percentMatch = valueMatch.match(/([0-9.]+)%/)
                  if (percentMatch) {
                    percentage = parseFloat(percentMatch[1])
                  }
                  
                  // Parse dollar value
                  const dollarMatch = valueMatch.match(/\\$([0-9,]+(?:\\.[0-9]+)?)([KMB])?/)
                  if (dollarMatch) {
                    value_usd = parseFloat(dollarMatch[1].replace(/,/g, ''))
                    const unit = dollarMatch[2]
                    if (unit === 'K') value_usd *= 1000
                    else if (unit === 'M') value_usd *= 1000000
                    else if (unit === 'B') value_usd *= 1000000000
                  }
                  
                  if (percentage > 0 || value_usd > 0) {
                    results.collateral_allocations.push({
                      asset_type: assetMatch,
                      percentage,
                      value_usd
                    })
                  }
                }
              }
            })
          }
        })
      }

      // Calculate confidence based on extracted data
      let confidence = 0
      if ((results.total_assets || 0) > 0) confidence += 0.4
      if (results.collateral_allocations.length > 0) confidence += 0.4
      if (results.collateral_allocations.length >= 3) confidence += 0.2
      
      results.confidence = Math.min(confidence, 1.0)

      return results

    } catch (error) {
      console.error(`[AICollateralExtraction] DOM parsing error:`, error)
      
      // Return empty result on error
      return {
        total_assets: 0,
        total_liabilities: 0,
        overcollateralization_ratio: 1.0,
        collateral_allocations: [],
        confidence: 0,
        extraction_method: 'dom_parsing'
      }
    }
  }

  /**
   * Cache extraction result with confidence-based TTL
   */
  async cacheExtractionResult(symbol: string, data: CollateralData): Promise<void> {
    if (!this.config.cacheBasedOnConfidence) {
      return
    }

    await this.confidenceBasedCachingService?.cacheCollateralData(symbol, data, data.confidence)
  }

  /**
   * Handle extraction result (for testing)
   */
  async handleExtractionResult(symbol: string, result: ExtractionResult): Promise<void> {
    if (result.success && result.data && this.config.cacheBasedOnConfidence) {
      await this.cacheExtractionResult(symbol, result.data)
    }
    
    // Record metrics
    if (result.cost_usd > 0) {
      this.confidenceBasedCachingService?.recordExtractionCost(result.cost_usd)
    }
    
    this.confidenceBasedCachingService?.recordExtractionLatency(result.extraction_time_ms)
    
    if (!result.success) {
      this.confidenceBasedCachingService?.recordExtractionFailure()
    }
  }

  /**
   * Extract collateral data for multiple URLs in batch
   */
  async extractCollateralDataBatch(urls: string[]): Promise<ExtractionResult[]> {
    console.log(`[AICollateralExtraction] Starting batch extraction for ${urls.length} URLs`)
    
    // Sort URLs by estimated cost (cheapest first for optimization)
    const urlsWithEstimates = await Promise.all(
      urls.map(async url => ({
        url,
        format: await this.websiteFormatHandler?.detectWebsiteFormat(url),
        estimatedCost: 0 // Will be calculated
      }))
    )

    // Sort by estimated cost (static HTML first, then SPA, then complex formats)
    urlsWithEstimates.sort((a, b) => {
      const aCost = a.format.estimatedComplexity === 'low' ? 0 : 
                   a.format.estimatedComplexity === 'medium' ? 1 : 2
      const bCost = b.format.estimatedComplexity === 'low' ? 0 : 
                   b.format.estimatedComplexity === 'medium' ? 1 : 2
      return aCost - bCost
    })

    // Process URLs sequentially to respect cost limits
    const results: ExtractionResult[] = []
    let totalCost = 0

    for (const { url } of urlsWithEstimates) {
      if (totalCost >= this.config.maxCostPerExtraction * urls.length) {
        // Cost limit reached, return remaining as failures
        results.push({
          success: false,
          error: 'Batch cost limit exceeded',
          cost_usd: 0,
          extraction_time_ms: 0,
          method_used: 'dom_parsing',
          confidence: 0
        })
        continue
      }

      const result = await this.extractCollateralData(url)
      results.push(result)
      totalCost += result.cost_usd
    }

    console.log(`[AICollateralExtraction] Batch extraction completed: ${results.filter(r => r.success).length}/${urls.length} successful, total cost: $${totalCost.toFixed(4)}`)

    return results
  }

  /**
   * Get circuit breaker status for a symbol
   */
  getCircuitBreakerStatus(symbol: string): CircuitBreakerStatus {
    return this.circuitBreakers.get(symbol) || {
      isOpen: false,
      failureCount: 0
    }
  }

  /**
   * Get extraction metrics
   */
  getExtractionMetrics(): AIExtractionMetrics {
    return this.confidenceBasedCachingService?.getMetrics()
  }

  /**
   * Reset extraction metrics
   */
  resetExtractionMetrics(): void {
    this.confidenceBasedCachingService?.resetMetrics()
  }

  /**
   * Check if circuit breaker is open for a key
   */
  private isCircuitBreakerOpen(key: string): boolean {
    const breaker = this.circuitBreakers.get(key)
    if (!breaker || !breaker.isOpen) {
      return false
    }

    // Check if timeout has passed
    if (breaker.nextRetry && Date.now() >= breaker.nextRetry) {
      // Half-open the circuit
      breaker.isOpen = false
      breaker.nextRetry = undefined
      return false
    }

    return breaker.isOpen
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordCircuitBreakerFailure(key: string): void {
    const breaker = this.circuitBreakers.get(key) || {
      isOpen: false,
      failureCount: 0
    }

    breaker.failureCount++
    breaker.lastFailure = Date.now()

    if (breaker.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
      breaker.isOpen = true
      breaker.nextRetry = Date.now() + this.CIRCUIT_BREAKER_TIMEOUT
      console.warn(`[AICollateralExtraction] Circuit breaker opened for ${key} after ${breaker.failureCount} failures`)
    }

    this.circuitBreakers.set(key, breaker)
  }

  /**
   * Reset circuit breaker on successful extraction
   */
  private resetCircuitBreaker(key: string): void {
    const breaker = this.circuitBreakers.get(key)
    if (breaker) {
      breaker.failureCount = 0
      breaker.isOpen = false
      breaker.lastFailure = undefined
      breaker.nextRetry = undefined
    }
  }

  /**
   * Determine the method used based on strategies
   */
  private determineMethodUsed(strategies: string[]): 'dom_parsing' | 'ai_extraction' | 'hybrid' {
    if (strategies.length === 0) return 'dom_parsing'
    if (strategies.length === 1) {
      return strategies[0] === 'ai_extraction' ? 'ai_extraction' : 'dom_parsing'
    }
    return 'hybrid'
  }
}

// Class is already exported in the class declaration above