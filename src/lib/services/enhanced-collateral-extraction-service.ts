/**
 * Enhanced Collateral Extraction Service
 * 
 * Implements a 3-tier extraction system replacing manual mapping:
 * Tier 1: Firecrawl MCP (Primary) - Dynamic structured extraction
 * Tier 2: Gemini AI (Enhancement) - Confidence boosting and validation  
 * Tier 3: Manual Mapping (Fallback) - Safety net for reliability
 * 
 * Features:
 * - Intelligent method selection based on confidence scores
 * - A/B testing framework with gradual rollout
 * - Performance monitoring and cost tracking
 * - Graceful degradation and error handling
 */

import { firecrawlMcpService, TransparencyData, FirecrawlExtractionSchema } from './firecrawl-mcp-service'
import { geminiService } from './gemini-service'
import { config } from '@/lib/config'

export interface CollateralExtractionResult {
  data: TransparencyData | null
  extraction_method: 'firecrawl_mcp' | 'gemini_enhanced' | 'manual_mapping'
  confidence_score: number
  cost_usd: number
  processing_time_ms: number
  fallback_reason?: string
  error?: string
}

export interface StablecoinDashboardConfig {
  ticker: string
  dashboard_url: string
  schema: FirecrawlExtractionSchema
  manual_fallback_data?: any
}

// Predefined extraction schemas for major stablecoins
export const DASHBOARD_SCHEMAS: Record<string, StablecoinDashboardConfig> = {
  USDC: {
    ticker: 'USDC',
    dashboard_url: 'https://www.centre.io/usdc-transparency',
    schema: {
      fields: {
        total_supply: {
          type: 'number',
          description: 'Total USDC tokens in circulation'
        },
        backing_ratio: {
          type: 'number', 
          description: 'Percentage of tokens backed by reserves (should be ~100%)'
        },
        collateral_allocations: {
          type: 'array',
          description: 'Breakdown of reserve assets backing USDC',
          items: {
            asset: { type: 'string' },
            percentage: { type: 'number' },
            value_usd: { type: 'number' }
          }
        },
        proof_of_reserves_url: {
          type: 'string',
          description: 'URL to detailed reserve attestation'
        },
        audit_firm: {
          type: 'string', 
          description: 'Name of auditing firm (e.g., Grant Thornton)'
        },
        last_audit_date: {
          type: 'string',
          description: 'Most recent audit date in ISO format'
        }
      }
    }
  },
  USDT: {
    ticker: 'USDT',
    dashboard_url: 'https://tether.to/en/transparency/',
    schema: {
      fields: {
        total_supply: {
          type: 'number',
          description: 'Total USDT tokens in circulation across all chains'
        },
        backing_ratio: {
          type: 'number',
          description: 'Percentage backing ratio from reserve reports'
        },
        collateral_allocations: {
          type: 'array',
          description: 'Tether reserve composition (cash, treasury bills, etc.)',
          items: {
            asset: { type: 'string' },
            percentage: { type: 'number' },
            value_usd: { type: 'number' }
          }
        },
        proof_of_reserves_url: {
          type: 'string',
          description: 'Link to latest attestation report'
        },
        audit_firm: {
          type: 'string',
          description: 'Attestation firm name'
        },
        last_audit_date: {
          type: 'string', 
          description: 'Latest attestation date'
        }
      }
    }
  },
  DAI: {
    ticker: 'DAI',
    dashboard_url: 'https://daistats.com',
    schema: {
      fields: {
        total_supply: {
          type: 'number',
          description: 'Total DAI supply from MakerDAO'
        },
        backing_ratio: {
          type: 'number',
          description: 'Collateralization ratio of DAI system'
        },
        collateral_allocations: {
          type: 'array',
          description: 'MakerDAO collateral types backing DAI',
          items: {
            asset: { type: 'string' },
            percentage: { type: 'number' },
            value_usd: { type: 'number' }
          }
        }
      }
    }
  }
}

export class EnhancedCollateralExtractionService {
  private readonly rolloutPercentage: number

  constructor() {
    this.rolloutPercentage = config.firecrawlMcp.rolloutPercentage
  }

  /**
   * Main extraction method with intelligent tier selection
   */
  async extractCollateralData(ticker: string): Promise<CollateralExtractionResult> {
    const startTime = Date.now()
    const shouldUseFirecrawl = this.shouldUseFirecrawlForTicker(ticker)

    try {
      if (shouldUseFirecrawl && config.firecrawlMcp.enabled) {
        console.log(`[${ticker}] Attempting Tier 1: Firecrawl MCP extraction`)
        const result = await this.attemptFirecrawlExtraction(ticker)
        
        if (result && result.confidence_score >= 70) {
          return {
            ...result,
            processing_time_ms: Date.now() - startTime
          }
        } else {
          console.log(`[${ticker}] Firecrawl confidence too low (${result?.confidence_score || 0}), falling back`)
        }
      }

      // Tier 2: Gemini AI Enhancement
      console.log(`[${ticker}] Attempting Tier 2: Gemini AI enhancement`)
      const geminiResult = await this.attemptGeminiExtraction(ticker)
      
      if (geminiResult && geminiResult.confidence_score >= 60) {
        return {
          ...geminiResult,
          processing_time_ms: Date.now() - startTime
        }
      }

      // Tier 3: Manual mapping fallback
      console.log(`[${ticker}] Falling back to Tier 3: Manual mapping`)
      return await this.attemptManualFallback(ticker, startTime)

    } catch (error) {
      console.error(`[${ticker}] All extraction methods failed:`, error)
      return await this.attemptManualFallback(ticker, startTime, String(error))
    }
  }

  /**
   * Tier 1: Firecrawl MCP extraction
   */
  private async attemptFirecrawlExtraction(ticker: string): Promise<CollateralExtractionResult | null> {
    const config = DASHBOARD_SCHEMAS[ticker]
    if (!config) {
      return null
    }

    try {
      const data = await firecrawlMcpService.extractTransparencyData(
        config.dashboard_url,
        ticker,
        config.schema
      )

      if (!data) return null

      return {
        data,
        extraction_method: 'firecrawl_mcp',
        confidence_score: data.confidence_score,
        cost_usd: data.cost_usd,
        processing_time_ms: 0 // Will be set by caller
      }
    } catch (error) {
      console.warn(`Firecrawl extraction failed for ${ticker}:`, error)
      return null
    }
  }

  /**
   * Tier 2: Gemini AI enhancement and validation
   */
  private async attemptGeminiExtraction(ticker: string): Promise<CollateralExtractionResult | null> {
    const config = DASHBOARD_SCHEMAS[ticker]
    if (!config || !geminiService) {
      return null
    }

    try {
      // Use Gemini to extract and validate transparency data
      const prompt = this.buildGeminiExtractionPrompt(ticker, config.dashboard_url)
      
      // Use the private generateContent method (it's not exposed publicly)
      // Instead, use the extractCollateralData method which is designed for this purpose
      const response = await geminiService.extractCollateralData(
        `Visit ${config.dashboard_url} and extract transparency data`,
        config.dashboard_url,
        ticker
      )

      if (!response?.content) return null

      const parsedData = this.parseGeminiResponse(response.content, ticker)
      
      if (!parsedData) return null

      return {
        data: parsedData,
        extraction_method: 'gemini_enhanced',
        confidence_score: parsedData.confidence_score,
        cost_usd: geminiService.calculateOperationCost(response.tokensUsed),
        processing_time_ms: 0
      }
    } catch (error) {
      console.warn(`Gemini extraction failed for ${ticker}:`, error)
      return null
    }
  }

  /**
   * Tier 3: Manual mapping fallback
   */
  private async attemptManualFallback(
    ticker: string, 
    startTime: number, 
    errorReason?: string
  ): Promise<CollateralExtractionResult> {
    const config = DASHBOARD_SCHEMAS[ticker]
    const fallbackData = config?.manual_fallback_data

    const data: TransparencyData = {
      stablecoin_ticker: ticker,
      collateral_allocations: fallbackData?.collateral_allocations || [
        { asset: 'USD Cash', percentage: 100 }
      ],
      extraction_method: 'manual_mapping' as any,
      confidence_score: 50, // Lower confidence for static data
      timestamp: new Date().toISOString(),
      cost_usd: 0
    }

    return {
      data,
      extraction_method: 'manual_mapping',
      confidence_score: 50,
      cost_usd: 0,
      processing_time_ms: Date.now() - startTime,
      fallback_reason: errorReason || 'Primary methods unavailable',
      error: errorReason
    }
  }

  /**
   * A/B testing: Determine if ticker should use Firecrawl
   */
  private shouldUseFirecrawlForTicker(ticker: string): boolean {
    if (this.rolloutPercentage === 0) return false
    if (this.rolloutPercentage === 100) return true

    // Consistent hash-based assignment for A/B testing
    const hash = this.hashString(ticker) % 100
    return hash < this.rolloutPercentage
  }

  /**
   * Build Gemini extraction prompt
   */
  private buildGeminiExtractionPrompt(ticker: string, url: string): string {
    return `Extract structured transparency data for ${ticker} stablecoin from ${url}.

Please provide a JSON response with the following structure:
{
  "total_supply": number_or_null,
  "backing_ratio": number_or_null,
  "collateral_allocations": [
    {"asset": "asset_name", "percentage": number, "value_usd": number_or_null}
  ],
  "proof_of_reserves_url": "url_or_null",
  "audit_firm": "firm_name_or_null", 
  "last_audit_date": "iso_date_or_null"
}

Focus on:
1. Reserve composition and percentages
2. Total supply and backing ratios
3. Recent audit information
4. Official attestation links

Return only valid JSON. Use null for unavailable data.`
  }

  /**
   * Parse Gemini AI response into TransparencyData
   */
  private parseGeminiResponse(content: string, ticker: string): TransparencyData | null {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed = JSON.parse(jsonMatch[0])
      
      return {
        stablecoin_ticker: ticker,
        total_supply: parsed.total_supply || undefined,
        backing_ratio: parsed.backing_ratio || undefined,
        collateral_allocations: parsed.collateral_allocations || [],
        proof_of_reserves_url: parsed.proof_of_reserves_url || undefined,
        audit_firm: parsed.audit_firm || undefined,
        last_audit_date: parsed.last_audit_date || undefined,
        extraction_method: 'gemini_enhanced' as any,
        confidence_score: this.calculateGeminiConfidence(parsed),
        timestamp: new Date().toISOString(),
        cost_usd: 0.05
      }
    } catch (error) {
      console.warn('Failed to parse Gemini response:', error)
      return null
    }
  }

  /**
   * Calculate confidence score for Gemini-extracted data
   */
  private calculateGeminiConfidence(data: any): number {
    let score = 0

    if (data.collateral_allocations?.length > 0) score += 30
    if (data.total_supply) score += 20
    if (data.backing_ratio) score += 20
    if (data.audit_firm) score += 15
    if (data.last_audit_date) score += 15

    return Math.min(score, 90) // Cap at 90% for AI-extracted data
  }

  /**
   * Simple string hashing for consistent A/B testing
   */
  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Get extraction service status and metrics
   */
  public getServiceStatus() {
    return {
      firecrawl: firecrawlMcpService.getServiceStatus(),
      rolloutPercentage: this.rolloutPercentage,
      availableTickers: Object.keys(DASHBOARD_SCHEMAS),
      geminiEnabled: !!geminiService
    }
  }
}

// Export singleton instance
export const enhancedCollateralExtractionService = new EnhancedCollateralExtractionService()