import { config, endpoints } from '@/lib/config'
import { ApiClient } from './api-client'

// Gemini API request/response interfaces
interface GeminiContent {
  parts: Array<{
    text: string
  }>
}

interface GeminiGenerationConfig {
  temperature?: number
  topP?: number
  topK?: number
  maxOutputTokens?: number
  stopSequences?: string[]
}

interface GeminiSafetySettings {
  category: 'HARM_CATEGORY_HARASSMENT' | 'HARM_CATEGORY_HATE_SPEECH' | 'HARM_CATEGORY_SEXUALLY_EXPLICIT' | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  threshold: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE'
}

interface GeminiRequest {
  contents: GeminiContent[]
  generationConfig?: GeminiGenerationConfig
  safetySettings?: GeminiSafetySettings[]
}

interface GeminiCandidate {
  content: {
    parts: Array<{
      text: string
    }>
    role: string
  }
  finishReason: 'FINISH_REASON_STOP' | 'FINISH_REASON_MAX_TOKENS' | 'FINISH_REASON_SAFETY' | 'FINISH_REASON_RECITATION' | 'FINISH_REASON_OTHER'
  index: number
  safetyRatings: Array<{
    category: string
    probability: string
  }>
}

interface GeminiResponse {
  candidates: GeminiCandidate[]
  promptFeedback?: {
    safetyRatings: Array<{
      category: string
      probability: string
    }>
  }
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

interface GeminiAnalysisResult {
  content: string
  tokensUsed: number
  finishReason: string
  confidence: number
  metadata?: Record<string, unknown>
}

interface GeminiError {
  code: number
  message: string
  status: string
}

/**
 * Rate limiter for Gemini API calls
 */
class RateLimiter {
  private requests: number[] = []
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  async waitForAvailableSlot(): Promise<void> {
    const now = Date.now()
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs)
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests)
      const waitTime = this.windowMs - (now - oldestRequest) + 100 // Add 100ms buffer
      
      if (waitTime > 0) {
        console.log(`[Gemini] Rate limit reached, waiting ${waitTime}ms`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    
    this.requests.push(now)
  }
}

/**
 * Gemini Flash 2.5 Service
 * Provides AI analysis capabilities for financial data interpretation,
 * risk assessment insights, and stablecoin analysis enhancement
 */
export class GeminiService {
  private client: ApiClient | null = null
  private rateLimiter: RateLimiter
  private readonly model: string
  private readonly defaultConfig: GeminiGenerationConfig

  constructor() {
    this.model = config.gemini.model
    this.rateLimiter = new RateLimiter(
      config.gemini.rateLimitPerMinute,
      60 * 1000 // 1 minute window
    )
    
    this.defaultConfig = {
      temperature: config.gemini.temperature,
      maxOutputTokens: config.gemini.maxTokens,
      topP: 0.8,
      topK: 40,
    }
  }

  private getClient(): ApiClient {
    if (!this.client) {
      this.client = new ApiClient(
        config.gemini.baseUrl,
        {
          'Content-Type': 'application/json',
          'User-Agent': 'StableRisk/1.0',
        },
        30000 // 30 second timeout for AI operations
      )
    }
    return this.client
  }

  /**
   * Analyze stablecoin risk factors using Gemini Flash 2.5
   */
  async analyzeStablecoinRisk(
    stablecoinData: {
      symbol: string
      name: string
      pegging_type: string
      current_price: number
      market_cap: number
      blockchain: string
      genesis_date: string
      categories: string[]
    },
    priceHistory: Array<{ timestamp: number; price: number; deviation_percent: number }>,
    additionalContext?: string
  ): Promise<GeminiAnalysisResult | null> {
    try {
      await this.rateLimiter.waitForAvailableSlot()

      const analysisPrompt = this.buildRiskAnalysisPrompt(stablecoinData, priceHistory, additionalContext)
      
      const response = await this.generateContent(analysisPrompt, {
        temperature: 0.1, // Low temperature for consistent financial analysis
        maxOutputTokens: 2048,
      })

      if (!response) {
        return null
      }

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        finishReason: response.finishReason,
        confidence: this.calculateConfidence(response),
        metadata: {
          model: this.model,
          analysis_type: 'stablecoin_risk',
          stablecoin: stablecoinData.symbol,
          timestamp: Date.now(),
        }
      }

    } catch (error) {
      console.error('[Gemini] Stablecoin risk analysis error:', error)
      return null
    }
  }

  /**
   * Analyze transparency and audit findings
   */
  async analyzeTransparencyData(
    stablecoinSymbol: string,
    transparencyData: {
      score: number
      findings: string[]
      proofOfReserves: boolean
      auditDate?: string
      auditFirm?: string
    }
  ): Promise<GeminiAnalysisResult | null> {
    try {
      await this.rateLimiter.waitForAvailableSlot()

      const prompt = this.buildTransparencyAnalysisPrompt(stablecoinSymbol, transparencyData)
      
      const response = await this.generateContent(prompt, {
        temperature: 0.2,
        maxOutputTokens: 1536,
      })

      if (!response) {
        return null
      }

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        finishReason: response.finishReason,
        confidence: this.calculateConfidence(response),
        metadata: {
          model: this.model,
          analysis_type: 'transparency_audit',
          stablecoin: stablecoinSymbol,
          timestamp: Date.now(),
        }
      }

    } catch (error) {
      console.error('[Gemini] Transparency analysis error:', error)
      return null
    }
  }

  /**
   * Generate market insights and risk recommendations
   */
  async generateMarketInsights(
    marketData: {
      totalVolume: number
      cexPercentage: number
      dexPercentage: number
      topExchanges: Array<{ name: string; volume: number }>
      priceVolatility: number
    },
    contextualData?: {
      marketConditions?: string
      recentEvents?: string[]
      peerComparison?: Record<string, number>
    }
  ): Promise<GeminiAnalysisResult | null> {
    try {
      await this.rateLimiter.waitForAvailableSlot()

      const prompt = this.buildMarketInsightsPrompt(marketData, contextualData)
      
      const response = await this.generateContent(prompt, {
        temperature: 0.3,
        maxOutputTokens: 2048,
      })

      if (!response) {
        return null
      }

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        finishReason: response.finishReason,
        confidence: this.calculateConfidence(response),
        metadata: {
          model: this.model,
          analysis_type: 'market_insights',
          timestamp: Date.now(),
        }
      }

    } catch (error) {
      console.error('[Gemini] Market insights error:', error)
      return null
    }
  }

  /**
   * Core method to generate content using Gemini API
   */
  private async generateContent(
    prompt: string,
    generationConfig?: Partial<GeminiGenerationConfig>
  ): Promise<{ content: string; tokensUsed: number; finishReason: string } | null> {
    try {
      const request: GeminiRequest = {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          ...this.defaultConfig,
          ...generationConfig,
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      }

      console.log(`[Gemini] Generating content with model: ${this.model}`)
      
      const response = await this.getClient().post<GeminiResponse>(
        endpoints.gemini.generateContent(this.model),
        request,
        {
          params: {
            key: config.gemini.apiKey
          }
        }
      )

      if (!response.candidates || response.candidates.length === 0) {
        console.warn('[Gemini] No candidates returned')
        return null
      }

      const candidate = response.candidates[0]
      
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        console.warn('[Gemini] No content in candidate')
        return null
      }

      const content = candidate.content.parts[0].text
      const tokensUsed = response.usageMetadata?.totalTokenCount || 0

      console.log(`[Gemini] Generated ${content.length} characters using ${tokensUsed} tokens`)

      return {
        content,
        tokensUsed,
        finishReason: candidate.finishReason
      }

    } catch (error) {
      console.error('[Gemini] Content generation error:', error)
      
      if (this.isGeminiError(error)) {
        console.error(`[Gemini] API Error: ${error.message} (${error.code})`)
      }
      
      return null
    }
  }

  /**
   * Build comprehensive risk analysis prompt
   */
  private buildRiskAnalysisPrompt(
    stablecoinData: {
      symbol: string
      name: string
      pegging_type: string
      current_price: number
      market_cap: number
      blockchain: string
      genesis_date: string
      categories: string[]
    },
    priceHistory: Array<{ timestamp: number; price: number; deviation_percent: number }>,
    additionalContext?: string
  ): string {
    const recentDeviations = priceHistory
      .slice(-30) // Last 30 data points
      .map(p => Math.abs(p.deviation_percent))
    
    const avgDeviation = recentDeviations.reduce((a, b) => a + b, 0) / recentDeviations.length
    const maxDeviation = Math.max(...recentDeviations)

    return `As a financial risk analyst specializing in cryptocurrency and stablecoins, analyze the following stablecoin data and provide insights:

STABLECOIN DATA:
- Name: ${stablecoinData.name} (${stablecoinData.symbol})
- Type: ${stablecoinData.pegging_type}
- Current Price: $${stablecoinData.current_price.toFixed(6)}
- Market Cap: $${stablecoinData.market_cap.toLocaleString()}
- Blockchain: ${stablecoinData.blockchain}
- Launch Date: ${stablecoinData.genesis_date}
- Categories: ${stablecoinData.categories.join(', ')}

PRICE STABILITY METRICS:
- Average Deviation (30 days): ${avgDeviation.toFixed(4)}%
- Maximum Deviation (30 days): ${maxDeviation.toFixed(4)}%
- Price History Points: ${priceHistory.length}

${additionalContext ? `ADDITIONAL CONTEXT:\n${additionalContext}\n` : ''}

Please provide a comprehensive risk analysis focusing on:

1. **Peg Stability Assessment**: Evaluate price stability based on the deviation metrics
2. **Collateral Type Risks**: Analyze risks specific to the ${stablecoinData.pegging_type} backing mechanism
3. **Market Factors**: Consider market capitalization and liquidity implications
4. **Blockchain Risks**: Assess risks related to the ${stablecoinData.blockchain} ecosystem
5. **Regulatory Considerations**: Potential regulatory impacts for this stablecoin type
6. **Risk Score Rationale**: Explain factors that would contribute to a 0-100 risk score

Keep the analysis concise (under 500 words), professional, and focus on actionable insights. Use specific data points from the provided metrics to support your analysis.`
  }

  /**
   * Build transparency analysis prompt
   */
  private buildTransparencyAnalysisPrompt(
    stablecoinSymbol: string,
    transparencyData: {
      score: number
      findings: string[]
      proofOfReserves: boolean
      auditDate?: string
      auditFirm?: string
    }
  ): string {
    return `Analyze the transparency and audit status of ${stablecoinSymbol} stablecoin:

TRANSPARENCY DATA:
- Transparency Score: ${transparencyData.score}/100
- Proof of Reserves: ${transparencyData.proofOfReserves ? 'Available' : 'Not Available'}
- Audit Date: ${transparencyData.auditDate || 'Unknown'}
- Audit Firm: ${transparencyData.auditFirm || 'Unknown'}
- Key Findings: ${transparencyData.findings.join('; ')}

Provide analysis covering:

1. **Transparency Assessment**: Interpret the score and proof of reserves status
2. **Audit Quality**: Evaluate the audit firm and recency of audits
3. **Risk Implications**: How these factors affect overall trust and stability
4. **Recommendations**: What improvements could enhance transparency

Keep analysis under 400 words, focusing on specific transparency concerns and their impact on user confidence.`
  }

  /**
   * Build market insights prompt
   */
  private buildMarketInsightsPrompt(
    marketData: {
      totalVolume: number
      cexPercentage: number
      dexPercentage: number
      topExchanges: Array<{ name: string; volume: number }>
      priceVolatility: number
    },
    contextualData?: {
      marketConditions?: string
      recentEvents?: string[]
      peerComparison?: Record<string, number>
    }
  ): string {
    const topExchangesList = marketData.topExchanges
      .slice(0, 5)
      .map(ex => `${ex.name}: $${ex.volume.toLocaleString()}`)
      .join(', ')

    return `Analyze the market structure and liquidity profile:

MARKET DATA:
- Total Volume (24h): $${marketData.totalVolume.toLocaleString()}
- CEX Volume: ${marketData.cexPercentage.toFixed(1)}%
- DEX Volume: ${marketData.dexPercentage.toFixed(1)}%
- Top Exchanges: ${topExchangesList}
- Price Volatility: ${marketData.priceVolatility.toFixed(4)}%

${contextualData?.marketConditions ? `Market Conditions: ${contextualData.marketConditions}\n` : ''}
${contextualData?.recentEvents ? `Recent Events: ${contextualData.recentEvents.join('; ')}\n` : ''}

Provide insights on:

1. **Liquidity Analysis**: Assess volume distribution and exchange diversity
2. **Market Structure**: CEX vs DEX balance and implications
3. **Volatility Assessment**: Price stability in current market context
4. **Risk Factors**: Market-related risks and concentrations

Keep analysis under 350 words with actionable market insights.`
  }

  /**
   * Calculate confidence score based on response quality
   */
  private calculateConfidence(response: { finishReason: string; tokensUsed: number }): number {
    let confidence = 100

    // Reduce confidence for incomplete responses
    if (response.finishReason !== 'FINISH_REASON_STOP') {
      confidence -= 30
    }

    // Reduce confidence for very short responses (likely incomplete)
    if (response.tokensUsed < 100) {
      confidence -= 20
    }

    // Reduce confidence for very long responses (might be unfocused)
    if (response.tokensUsed > 3000) {
      confidence -= 10
    }

    return Math.max(0, Math.min(100, confidence))
  }

  /**
   * Type guard for Gemini API errors
   */
  private isGeminiError(error: unknown): error is GeminiError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'status' in error
    )
  }

  /**
   * Extract collateral data from website content using AI interpretation
   */
  async extractCollateralData(
    websiteContent: string,
    url: string,
    symbol?: string
  ): Promise<GeminiAnalysisResult | null> {
    try {
      await this.rateLimiter.waitForAvailableSlot()

      const extractionPrompt = this.buildCollateralExtractionPrompt(websiteContent, url, symbol)
      
      const response = await this.generateContent(extractionPrompt, {
        temperature: 0.05, // Very low temperature for precise financial data extraction
        maxOutputTokens: 2048,
      })

      if (!response) {
        return null
      }

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        finishReason: response.finishReason,
        confidence: this.calculateConfidence(response),
        metadata: {
          model: this.model,
          analysis_type: 'collateral_extraction',
          symbol: symbol || 'unknown',
          url,
          timestamp: Date.now(),
        }
      }

    } catch (error) {
      console.error('[Gemini] Collateral extraction error:', error)
      return null
    }
  }

  /**
   * Interpret and standardize asset names using AI
   */
  async interpretAssetNames(
    rawAssetNames: string[],
    context?: string
  ): Promise<GeminiAnalysisResult | null> {
    try {
      await this.rateLimiter.waitForAvailableSlot()

      const interpretationPrompt = this.buildAssetInterpretationPrompt(rawAssetNames, context)
      
      const response = await this.generateContent(interpretationPrompt, {
        temperature: 0.1,
        maxOutputTokens: 1024,
      })

      if (!response) {
        return null
      }

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        finishReason: response.finishReason,
        confidence: this.calculateConfidence(response),
        metadata: {
          model: this.model,
          analysis_type: 'asset_interpretation',
          assetCount: rawAssetNames.length,
          timestamp: Date.now(),
        }
      }

    } catch (error) {
      console.error('[Gemini] Asset interpretation error:', error)
      return null
    }
  }

  /**
   * Validate financial data consistency using AI
   */
  async validateFinancialData(
    collateralData: any,
    symbol?: string
  ): Promise<GeminiAnalysisResult | null> {
    try {
      await this.rateLimiter.waitForAvailableSlot()

      const validationPrompt = this.buildFinancialValidationPrompt(collateralData, symbol)
      
      const response = await this.generateContent(validationPrompt, {
        temperature: 0.1,
        maxOutputTokens: 1024,
      })

      if (!response) {
        return null
      }

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        finishReason: response.finishReason,
        confidence: this.calculateConfidence(response),
        metadata: {
          model: this.model,
          analysis_type: 'financial_validation',
          symbol: symbol || 'unknown',
          timestamp: Date.now(),
        }
      }

    } catch (error) {
      console.error('[Gemini] Financial validation error:', error)
      return null
    }
  }

  /**
   * Build collateral extraction prompt
   */
  private buildCollateralExtractionPrompt(content: string, url: string, symbol?: string): string {
    const contentPreview = content.length > 8000 ? content.substring(0, 8000) + '...' : content

    return `As a financial analyst specializing in stablecoin collateral analysis, extract structured collateral data from the following website content.

WEBSITE: ${url}
${symbol ? `STABLECOIN: ${symbol}` : ''}

WEBSITE CONTENT:
${contentPreview}

Extract the following information in JSON format:
{
  "total_assets": <number in USD>,
  "total_liabilities": <number in USD>,
  "overcollateralization_ratio": <decimal ratio, e.g., 1.05 for 105%>,
  "collateral_allocations": [
    {
      "asset_type": "<standardized asset name>",
      "percentage": <percentage of total, 0-100>,
      "value_usd": <value in USD>,
      "description": "<brief description>"
    }
  ],
  "last_updated": "<ISO date string if available>",
  "confidence_score": <your confidence in this extraction, 0.0-1.0>
}

EXTRACTION GUIDELINES:
1. Convert all amounts to USD if not already
2. Standardize asset names using these mappings:
   - "Cash & Cash Equivalents" → "USD Cash"
   - "Treasury Bills/Notes/Bonds" → "US Treasury Securities"
   - "Government Securities" → "Government Bonds"
   - "Commercial Paper" → "Commercial Paper"
   - "Money Market Funds" → "Money Market Funds"
   - "Certificates of Deposit" → "Certificates of Deposit"
3. Calculate percentages if not provided (ensure they sum to ~100%)
4. Include both percentage AND USD value when possible
5. Only include data you can identify with high confidence
6. Set confidence_score based on these criteria:
   - 0.9-1.0: Clear tables with exact numbers, multiple asset types, percentages sum to 100%
   - 0.7-0.9: Good data quality, some missing details but core info is clear
   - 0.5-0.7: Partial data, some ambiguity but meaningful information extracted
   - 0.3-0.5: Limited data, high uncertainty
   - 0.0-0.3: Poor quality extraction, mostly guesswork

CONFIDENCE SCORING FACTORS:
- +0.3: Clear total assets figure found
- +0.3: Multiple specific asset allocations found
- +0.2: Percentages provided and sum to 90-110%
- +0.1: Both USD values AND percentages provided
- +0.1: Recent timestamp/date found
- -0.2: Data seems outdated (>1 year old)
- -0.3: Numbers seem inconsistent or unrealistic

Focus on finding these priority assets:
- Cash and cash equivalents (highest priority)
- US Treasury securities (T-Bills, T-Notes, T-Bonds)
- Corporate bonds and commercial paper
- Money market instruments
- Total asset values and backing ratios

Return only the JSON object or null if no collateral data is found.`
  }

  /**
   * Build asset interpretation prompt
   */
  private buildAssetInterpretationPrompt(assetNames: string[], context?: string): string {
    return `As a financial asset specialist, standardize and categorize the following asset names from a stablecoin transparency report.

ASSET NAMES TO INTERPRET:
${assetNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

${context ? `CONTEXT: ${context}` : ''}

For each asset, provide standardized information in JSON format:
{
  "interpretations": [
    {
      "original_name": "<original asset name>",
      "standardized_name": "<clear, standardized name>",
      "category": "<cash|treasury|corporate_bonds|government_bonds|money_market|crypto|other>",
      "subcategory": "<more specific classification if applicable>",
      "risk_level": "<low|medium|high>",
      "liquidity": "<high|medium|low>",
      "confidence": <confidence in interpretation, 0.0-1.0>
    }
  ]
}

STANDARDIZATION RULES:
- "Cash and Cash Equivalents" → "USD Cash"
- "US Treasury Bills" → "US Treasury Bills"
- "T-Bills" → "US Treasury Bills"
- "Repurchase Agreements" → "Repo Agreements"
- "Commercial Paper" → "Commercial Paper"
- "Government MMF" → "Government Money Market Fund"

Focus on clarity and consistency. If unsure about an asset, set confidence < 0.7.`
  }

  /**
   * Build financial validation prompt
   */
  private buildFinancialValidationPrompt(collateralData: any, symbol?: string): string {
    return `As a financial auditor, validate the consistency and reasonableness of this collateral data for ${symbol || 'a stablecoin'}.

COLLATERAL DATA:
${JSON.stringify(collateralData, null, 2)}

Analyze and return validation results in JSON format:
{
  "validation_results": {
    "mathematical_consistency": {
      "percentages_sum_to_100": <boolean>,
      "values_match_percentages": <boolean>,
      "total_assets_reasonable": <boolean>
    },
    "business_logic": {
      "overcollateralization_reasonable": <boolean>,
      "asset_mix_appropriate": <boolean>,
      "liquidity_profile_adequate": <boolean>
    },
    "data_quality": {
      "completeness_score": <0.0-1.0>,
      "precision_score": <0.0-1.0>,
      "consistency_score": <0.0-1.0>
    },
    "red_flags": [
      "<list any concerning inconsistencies>"
    ],
    "recommendations": [
      "<list specific improvements needed>"
    ],
    "overall_confidence": <0.0-1.0>,
    "validation_notes": "<brief explanation of findings>"
  }
}

Key validation checks:
1. Do percentages sum to ~100%?
2. Do individual values match their stated percentages of total?
3. Is overcollateralization ratio reasonable (typically 100-110%)?
4. Are asset allocations appropriate for a stablecoin?
5. Are there any mathematical inconsistencies?
6. Does the data appear complete and accurate?

Be thorough but concise in your analysis.`
  }

  /**
   * Calculate cost for AI operations based on tokens used
   */
  calculateOperationCost(tokensUsed: number): number {
    // Gemini 2.0 Flash pricing (estimated)
    const costPerToken = 0.00001 // $0.01 per 1K tokens
    return tokensUsed * costPerToken
  }

  /**
   * Health check for Gemini service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.generateContent(
        'Health check: Please respond with "OK" if you are functioning correctly.',
        { maxOutputTokens: 10, temperature: 0 }
      )
      
      return response?.content.toLowerCase().includes('ok') || false
    } catch {
      return false
    }
  }

  /**
   * Get service usage statistics
   */
  getUsageStats(): {
    rateLimitRequests: number
    rateLimitWindow: number
    model: string
    maxTokens: number
  } {
    return {
      rateLimitRequests: this.rateLimiter['requests'].length,
      rateLimitWindow: config.gemini.rateLimitPerMinute,
      model: this.model,
      maxTokens: config.gemini.maxTokens,
    }
  }
}

// Export singleton instance
export const geminiService = new GeminiService()