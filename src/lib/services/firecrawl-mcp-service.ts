/**
 * Firecrawl MCP Service
 * 
 * Provides dynamic web scraping capabilities using Firecrawl API with MCP integration.
 * Replaces manual mapping approach with AI-powered structured data extraction.
 * 
 * Features:
 * - Schema-based extraction for transparency dashboards
 * - Cost tracking and budget controls
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern for reliability
 * - Confidence scoring for extracted data
 */

import { config } from '@/lib/config'
import { costControlService } from './cost-control-service'

// Types for structured data extraction
export interface CollateralAllocation {
  asset: string
  percentage: number
  value_usd?: number
  last_updated?: string
}

export interface TransparencyData {
  stablecoin_ticker: string
  total_supply?: number
  backing_ratio?: number
  collateral_allocations: CollateralAllocation[]
  proof_of_reserves_url?: string
  audit_firm?: string
  last_audit_date?: string
  extraction_method: 'firecrawl_mcp'
  confidence_score: number
  timestamp: string
  cost_usd: number
}

export interface FirecrawlExtractionSchema {
  fields: {
    total_supply?: { type: 'number', description: string }
    backing_ratio?: { type: 'number', description: string }
    collateral_allocations: { 
      type: 'array', 
      description: string,
      items: {
        asset: { type: 'string' }
        percentage: { type: 'number' }
        value_usd?: { type: 'number' }
      }
    }
    proof_of_reserves_url?: { type: 'string', description: string }
    audit_firm?: { type: 'string', description: string }
    last_audit_date?: { type: 'string', description: string }
  }
}

// Circuit breaker states
enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN', 
  HALF_OPEN = 'HALF_OPEN'
}

class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED
  private failureCount = 0
  private lastFailureTime = 0
  private readonly failureThreshold = 5
  private readonly recoveryTimeout = 300000 // 5 minutes

  canExecute(): boolean {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = CircuitBreakerState.HALF_OPEN
        return true
      }
      return false
    }
    return true
  }

  recordSuccess(): void {
    this.failureCount = 0
    this.state = CircuitBreakerState.CLOSED
  }

  recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitBreakerState.OPEN
    }
  }
}

export class FirecrawlMCPService {
  private readonly apiKey: string
  private readonly endpoint: string
  private readonly timeout: number
  private readonly retryAttempts: number
  private readonly retryDelay: number
  private dailySpent = 0
  private readonly dailyBudgetLimit: number
  private readonly costPerExtraction: number
  private circuitBreaker = new CircuitBreaker()

  constructor() {
    this.apiKey = config.firecrawlMcp.apiKey
    this.endpoint = config.firecrawlMcp.endpoint
    this.timeout = config.firecrawlMcp.timeout
    this.retryAttempts = config.firecrawlMcp.retryAttempts
    this.retryDelay = config.firecrawlMcp.retryDelay
    this.dailyBudgetLimit = config.firecrawlMcp.dailyBudgetLimit
    this.costPerExtraction = config.firecrawlMcp.costPerExtraction
  }

  /**
   * Extract structured transparency data from stablecoin dashboard
   */
  async extractTransparencyData(
    url: string, 
    ticker: string, 
    schema: FirecrawlExtractionSchema
  ): Promise<TransparencyData | null> {
    if (!config.firecrawlMcp.enabled) {
      throw new Error('Firecrawl MCP service is disabled')
    }

    if (!this.canProceedWithExtraction()) {
      throw new Error('Daily budget limit reached or circuit breaker open')
    }

    if (!this.circuitBreaker.canExecute()) {
      throw new Error('Service circuit breaker is open')
    }

    const startTime = Date.now()

    try {
      const result = await this.performExtractionWithRetry(url, ticker, schema)
      
      if (result) {
        this.circuitBreaker.recordSuccess()
        this.dailySpent += this.costPerExtraction

        // Record successful cost
        costControlService.recordCost({
          service: 'firecrawl_mcp',
          operation_type: 'transparency_extraction',
          symbol: ticker,
          cost_usd: this.costPerExtraction,
          success: true,
          confidence_score: result.confidence_score,
          metadata: {
            url,
            processing_time_ms: Date.now() - startTime
          }
        })
      }

      return result
    } catch (error) {
      this.circuitBreaker.recordFailure()
      
      // Record failed cost (still costs money even if failed)
      costControlService.recordCost({
        service: 'firecrawl_mcp',
        operation_type: 'transparency_extraction',
        symbol: ticker,
        cost_usd: this.costPerExtraction,
        success: false,
        metadata: {
          url,
          error: String(error),
          processing_time_ms: Date.now() - startTime
        }
      })

      console.error(`Firecrawl extraction failed for ${ticker}:`, error)
      throw error
    }
  }

  /**
   * Perform extraction with retry logic
   */
  private async performExtractionWithRetry(
    url: string,
    ticker: string, 
    schema: FirecrawlExtractionSchema
  ): Promise<TransparencyData | null> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(this.retryDelay * Math.pow(2, attempt - 1)) // Exponential backoff
        }

        const data = await this.callFirecrawlAPI(url, schema)
        
        if (data) {
          return this.formatTransparencyData(data, ticker, url)
        }
      } catch (error) {
        lastError = error as Error
        console.warn(`Firecrawl extraction attempt ${attempt + 1} failed:`, error)
      }
    }

    throw lastError || new Error('All extraction attempts failed')
  }

  /**
   * Call Firecrawl API with structured extraction
   */
  private async callFirecrawlAPI(url: string, schema: FirecrawlExtractionSchema): Promise<any> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.endpoint}/v1/scrape`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          formats: ['extract'],
          extract: {
            schema: schema.fields,
            systemPrompt: `Extract structured financial data from stablecoin transparency dashboard. Focus on collateral allocations, backing ratios, and reserve information. Return null for unavailable data.`
          },
          timeout: this.timeout / 1000 // Convert to seconds
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Firecrawl API error: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      
      if (!result.success) {
        throw new Error(`Firecrawl extraction failed: ${result.error || 'Unknown error'}`)
      }

      return result.data?.extract
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Format extracted data into standardized TransparencyData structure
   */
  private formatTransparencyData(
    extractedData: any, 
    ticker: string, 
    sourceUrl: string
  ): TransparencyData {
    const confidence = this.calculateConfidenceScore(extractedData)
    
    return {
      stablecoin_ticker: ticker,
      total_supply: extractedData.total_supply || undefined,
      backing_ratio: extractedData.backing_ratio || undefined,
      collateral_allocations: this.normalizeCollateralAllocations(extractedData.collateral_allocations || []),
      proof_of_reserves_url: extractedData.proof_of_reserves_url || sourceUrl,
      audit_firm: extractedData.audit_firm || undefined,
      last_audit_date: extractedData.last_audit_date || undefined,
      extraction_method: 'firecrawl_mcp',
      confidence_score: confidence,
      timestamp: new Date().toISOString(),
      cost_usd: this.costPerExtraction
    }
  }

  /**
   * Normalize collateral allocation data
   */
  private normalizeCollateralAllocations(allocations: any[]): CollateralAllocation[] {
    if (!Array.isArray(allocations)) return []

    return allocations
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        asset: String(item.asset || 'Unknown').trim(),
        percentage: this.parseNumber(item.percentage) || 0,
        value_usd: this.parseNumber(item.value_usd),
        last_updated: item.last_updated || new Date().toISOString()
      }))
      .filter(item => item.asset !== 'Unknown' && item.percentage > 0)
  }

  /**
   * Calculate confidence score based on data completeness and quality
   */
  private calculateConfidenceScore(data: any): number {
    if (!data || typeof data !== 'object') return 0

    let score = 0
    const maxScore = 100

    // Basic data presence (40 points)
    if (data.collateral_allocations?.length > 0) score += 20
    if (data.total_supply && data.total_supply > 0) score += 10
    if (data.backing_ratio && data.backing_ratio >= 0) score += 10

    // Data quality (30 points)
    if (data.collateral_allocations?.length >= 2) score += 15 // Multiple allocations
    if (data.backing_ratio >= 95 && data.backing_ratio <= 105) score += 15 // Reasonable backing ratio

    // Verification data (30 points)
    if (data.proof_of_reserves_url) score += 10
    if (data.audit_firm) score += 10
    if (data.last_audit_date) score += 10

    return Math.min(score, maxScore)
  }

  /**
   * Check if extraction can proceed based on budget and service health
   */
  private canProceedWithExtraction(): boolean {
    // Use cost control service for comprehensive checking
    const costCheck = costControlService.canProceedWithCost(
      this.costPerExtraction,
      'firecrawl_mcp',
      'transparency_extraction'
    )

    return costCheck.allowed
  }

  /**
   * Get current service status
   */
  public getServiceStatus() {
    return {
      enabled: config.firecrawlMcp.enabled,
      dailySpent: this.dailySpent,
      remainingBudget: this.dailyBudgetLimit - this.dailySpent,
      circuitBreakerOpen: !this.circuitBreaker.canExecute()
    }
  }

  /**
   * Reset daily budget tracking (should be called daily via cron)
   */
  public resetDailyBudget(): void {
    this.dailySpent = 0
  }

  // Utility methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private parseNumber(value: any): number | undefined {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[,$%]/g, ''))
      return isNaN(parsed) ? undefined : parsed
    }
    return undefined
  }
}

// Export singleton instance
export const firecrawlMcpService = new FirecrawlMCPService()