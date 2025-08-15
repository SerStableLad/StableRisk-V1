import { 
  CollateralData, 
  ExtractionStrategy, 
  WebsiteFormat, 
  HybridExtractionResult,
  CollateralAllocation 
} from '@/lib/types'
import { websiteFormatHandler } from './website-format-handler'
import { geminiService } from './gemini-service'
import { metricsService } from './metrics-service'
import { chromium, Browser, Page } from 'playwright'

/**
 * Hybrid Extraction Pipeline
 * Orchestrates multiple extraction strategies and combines results
 * Handles DOM parsing, AI extraction, and hybrid approaches
 */
export class HybridExtractionPipeline {
  private readonly COST_THRESHOLD = 0.50 // Maximum cost per extraction
  private readonly CONFIDENCE_THRESHOLD = 0.7 // Minimum confidence for acceptable results
  private readonly DOM_TIMEOUT = 10000 // 10 seconds for DOM extraction
  private readonly AI_TIMEOUT = 30000 // 30 seconds for AI extraction

  /**
   * Execute hybrid extraction strategy
   */
  async executeExtraction(
    url: string,
    symbol?: string,
    maxCost?: number
  ): Promise<HybridExtractionResult> {
    const startTime = Date.now()
    const costLimit = maxCost || this.COST_THRESHOLD
    
    console.log(`[HybridPipeline] Starting extraction for ${url} (symbol: ${symbol}, max cost: $${costLimit})`)

    try {
      // Step 1: Detect website format
      const format = await websiteFormatHandler.detectWebsiteFormat(url)
      console.log(`[HybridPipeline] Detected format: ${format.type} (JS: ${format.hasJavaScript}, complexity: ${format.estimatedComplexity})`)

      // Step 2: Select extraction strategies
      const strategies = this.selectStrategies(format, costLimit)
      console.log(`[HybridPipeline] Selected strategies: ${strategies.map(s => s.name).join(', ')}`)

      // Step 3: Execute strategies in parallel or sequence based on cost
      let domResult: Partial<CollateralData> | undefined
      let aiResult: Partial<CollateralData> | undefined
      let totalCost = 0
      const usedStrategies: string[] = []

      // Try DOM-based extraction first (cheap/free)
      const domStrategy = strategies.find(s => s.name === 'dom_parsing')
      if (domStrategy) {
        try {
          console.log(`[HybridPipeline] Attempting DOM parsing...`)
          domResult = await this.executeDOMExtraction(url, format)
          usedStrategies.push('dom_parsing')
          
          if (domResult && this.calculateConfidence(domResult) >= this.CONFIDENCE_THRESHOLD) {
            console.log(`[HybridPipeline] DOM extraction succeeded with high confidence`)
            const combinedResult = this.combineResults(domResult, undefined)
            
            return {
              domResult,
              aiResult: undefined,
              combinedResult,
              confidence: this.calculateConfidence(combinedResult),
              totalCost: 0,
              strategies: usedStrategies
            }
          }
        } catch (error) {
          console.warn(`[HybridPipeline] DOM extraction failed:`, error)
        }
      }

      // If DOM extraction failed or has low confidence, try AI extraction
      const aiStrategy = strategies.find(s => s.name === 'ai_extraction')
      if (aiStrategy && totalCost + aiStrategy.estimatedCost <= costLimit) {
        try {
          console.log(`[HybridPipeline] Attempting AI extraction...`)
          const { result, cost } = await this.executeAIExtraction(url, symbol)
          aiResult = result
          totalCost += cost
          usedStrategies.push('ai_extraction')
        } catch (error) {
          console.warn(`[HybridPipeline] AI extraction failed:`, error)
        }
      }

      // Combine results
      const combinedResult = this.combineResults(domResult, aiResult)
      const finalConfidence = this.calculateConfidence(combinedResult)

      console.log(`[HybridPipeline] Extraction completed in ${Date.now() - startTime}ms, cost: $${totalCost.toFixed(4)}, confidence: ${finalConfidence.toFixed(2)}`)

      // Record metrics
      metricsService.recordApiDuration(`hybrid_extraction:${symbol || 'unknown'}`, Date.now() - startTime)
      metricsService.recordCostMetric('collateral_extraction', totalCost)

      return {
        domResult,
        aiResult,
        combinedResult,
        confidence: finalConfidence,
        totalCost,
        strategies: usedStrategies
      }

    } catch (error) {
      console.error(`[HybridPipeline] Extraction pipeline failed:`, error)
      metricsService.recordApiError(`hybrid_extraction:${symbol || 'unknown'}`, error)
      
      // Return empty result on failure
      return {
        domResult: undefined,
        aiResult: undefined,
        combinedResult: {
          total_assets: 0,
          total_liabilities: 0,
          overcollateralization_ratio: 1.0,
          collateral_allocations: [],
          confidence: 0,
          extraction_method: 'hybrid'
        },
        confidence: 0,
        totalCost: 0,
        strategies: []
      }
    }
  }

  /**
   * Select appropriate extraction strategies based on format and cost constraints
   */
  private selectStrategies(format: WebsiteFormat, maxCost: number): ExtractionStrategy[] {
    const strategies: ExtractionStrategy[] = []

    // Always try DOM parsing first (free/cheap)
    strategies.push({
      name: 'dom_parsing',
      priority: 10,
      estimatedCost: 0,
      estimatedLatency: format.hasJavaScript ? 5000 : 2000,
      supportedFormats: ['html', 'spa']
    })

    // Add AI extraction if budget allows
    const aiCost = this.estimateAICost(format)
    if (aiCost <= maxCost) {
      strategies.push({
        name: 'ai_extraction',
        priority: 8,
        estimatedCost: aiCost,
        estimatedLatency: this.AI_TIMEOUT,
        supportedFormats: ['html', 'spa', 'pdf']
      })
    }

    // Add specialized strategies based on format
    if (format.type === 'pdf' && maxCost >= 0.05) {
      strategies.push({
        name: 'pdf_parsing',
        priority: 9,
        estimatedCost: 0.05,
        estimatedLatency: 3000,
        supportedFormats: ['pdf']
      })
    }

    // Sort by priority (higher first) and filter by supported formats
    return strategies
      .filter(s => s.supportedFormats.includes(format.type))
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * Execute DOM-based extraction
   */
  private async executeDOMExtraction(
    url: string,
    format: WebsiteFormat
  ): Promise<Partial<CollateralData>> {
    const startTime = Date.now()
    
    try {
      // Get website content based on format
      const { content, success } = await websiteFormatHandler.extractContent(url, format)
      
      if (!success || !content) {
        throw new Error('Failed to extract website content')
      }

      // Parse content for collateral data
      if (format.hasJavaScript || format.type === 'spa') {
        return await this.parseJavaScriptContent(content, url)
      } else {
        return this.parseStaticHTML(content)
      }

    } catch (error) {
      console.error(`[HybridPipeline] DOM extraction error:`, error)
      throw error
    } finally {
      const duration = Date.now() - startTime
      metricsService.recordApiDuration('dom_extraction', duration)
    }
  }

  /**
   * Execute AI-based extraction
   */
  private async executeAIExtraction(
    url: string,
    symbol?: string
  ): Promise<{ result: Partial<CollateralData>, cost: number }> {
    const startTime = Date.now()
    
    try {
      // Get website content for AI analysis
      const { content, success } = await websiteFormatHandler.extractContent(url)
      
      if (!success || !content) {
        throw new Error('Failed to extract website content for AI analysis')
      }

      // Use Gemini to extract collateral data
      const aiResponse = await geminiService.extractCollateralData(content, url, symbol)
      
      if (!aiResponse) {
        throw new Error('AI extraction returned no results')
      }

      // Parse AI response
      const cost = geminiService.calculateOperationCost(aiResponse.tokensUsed)
      let extractedData: Partial<CollateralData>

      try {
        // Try to parse JSON response
        const jsonResponse = JSON.parse(aiResponse.content)
        extractedData = this.parseAIResponse(jsonResponse)
      } catch (parseError) {
        // If JSON parsing fails, try text parsing
        extractedData = this.parseAITextResponse(aiResponse.content)
      }

      // Add extraction metadata
      extractedData.extraction_method = 'ai_extraction'
      extractedData.confidence = aiResponse.confidence / 100 // Convert to 0-1 scale

      return { result: extractedData, cost }

    } catch (error) {
      console.error(`[HybridPipeline] AI extraction error:`, error)
      throw error
    } finally {
      const duration = Date.now() - startTime
      metricsService.recordApiDuration('ai_extraction', duration)
    }
  }

  /**
   * Parse JavaScript-rendered content using Playwright
   */
  private async parseJavaScriptContent(html: string, url: string): Promise<Partial<CollateralData>> {
    let browser: Browser | null = null
    let page: Page | null = null

    try {
      browser = await chromium.launch({ headless: true })
      page = await browser.newPage()
      
      // Set content instead of navigating (we already have the content)
      await page.setContent(html, { waitUntil: 'networkidle' })

      // Extract financial data using JavaScript
      const extractedData = await page.evaluate(() => {
        const results: any = {
          collateral_allocations: [],
          total_assets: 0,
          total_liabilities: 0,
          overcollateralization_ratio: 1.0
        }

        // Look for financial tables
        const tables = document.querySelectorAll('table')
        tables.forEach(table => {
          const rows = table.querySelectorAll('tr')
          rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th'))
            const cellTexts = cells.map(cell => cell.textContent?.trim() || '')
            
            // Look for asset allocation patterns
            const assetMatch = cellTexts.find(text => /^[A-Z\s]+$/.test(text) && text.length > 2)
            const valueMatch = cellTexts.find(text => /\$[\d,]+(\.\d+)?[KMB]?|\d+(\.\d+)?%/.test(text))
            
            if (assetMatch && valueMatch) {
              const allocation: any = {
                asset_type: assetMatch,
                percentage: 0,
                value_usd: 0
              }
              
              // Parse value
              if (valueMatch.includes('$')) {
                const match = valueMatch.match(/\$([0-9,]+(?:\.[0-9]+)?)([KMB])?/)
                if (match) {
                  let value = parseFloat(match[1].replace(/,/g, ''))
                  const unit = match[2]
                  if (unit === 'K') value *= 1000
                  else if (unit === 'M') value *= 1000000
                  else if (unit === 'B') value *= 1000000000
                  allocation.value_usd = value
                }
              }
              
              // Parse percentage
              if (valueMatch.includes('%')) {
                const match = valueMatch.match(/([0-9.]+)%/)
                if (match) {
                  allocation.percentage = parseFloat(match[1])
                }
              }
              
              if (allocation.value_usd > 0 || allocation.percentage > 0) {
                results.collateral_allocations.push(allocation)
              }
            }
          })
        })

        // Look for total assets
        const bodyText = document.body.innerText
        const totalAssetsMatch = bodyText.match(/total\s+assets?\s*:?\s*\$?([0-9,]+(?:\.[0-9]+)?)\s*([KMB])?/i)
        if (totalAssetsMatch) {
          let value = parseFloat(totalAssetsMatch[1].replace(/,/g, ''))
          const unit = totalAssetsMatch[2]
          if (unit === 'K') value *= 1000
          else if (unit === 'M') value *= 1000000
          else if (unit === 'B') value *= 1000000000
          results.total_assets = value
        }

        return results
      })

      // Calculate confidence based on extracted data quality
      const confidence = this.calculateExtractionConfidence(extractedData)
      extractedData.confidence = confidence
      extractedData.extraction_method = 'dom_parsing'

      return extractedData

    } finally {
      if (page) await page.close().catch(() => {})
      if (browser) await browser.close().catch(() => {})
    }
  }

  /**
   * Parse static HTML content
   */
  private parseStaticHTML(html: string): Partial<CollateralData> {
    const results: Partial<CollateralData> = {
      collateral_allocations: [],
      total_assets: 0,
      extraction_method: 'dom_parsing'
    }

    // Enhanced patterns for total assets extraction
    const totalAssetPatterns = [
      /total\s+assets?\s*:?\s*\$?([0-9,]+(?:\.[0-9]+)?)\s*([KMB]?)/i,
      /assets?\s+under\s+management\s*:?\s*\$?([0-9,]+(?:\.[0-9]+)?)\s*([KMB]?)/i,
      /total\s+reserves?\s*:?\s*\$?([0-9,]+(?:\.[0-9]+)?)\s*([KMB]?)/i,
      /backing\s+assets?\s*:?\s*\$?([0-9,]+(?:\.[0-9]+)?)\s*([KMB]?)/i,
      /collateral\s+value\s*:?\s*\$?([0-9,]+(?:\.[0-9]+)?)\s*([KMB]?)/i
    ]

    for (const pattern of totalAssetPatterns) {
      const match = html.match(pattern)
      if (match) {
        let value = parseFloat(match[1].replace(/,/g, ''))
        const unit = match[2]
        if (unit === 'K') value *= 1000
        else if (unit === 'M') value *= 1000000
        else if (unit === 'B') value *= 1000000000
        results.total_assets = Math.max(results.total_assets || 0, value)
        break
      }
    }

    // Extract table data using regex
    const tableMatches = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)
    if (tableMatches) {
      tableMatches.forEach(tableHtml => {
        const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
        if (rowMatches) {
          rowMatches.forEach(rowHtml => {
            const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)
            if (cellMatches) {
              const cellTexts = cellMatches.map(cell => 
                cell.replace(/<[^>]*>/g, '').trim()
              )
              
              // Enhanced asset allocation parsing
              const assetMatch = cellTexts.find(text => 
                /^[A-Za-z\s&\-\(\)]+$/.test(text) && 
                text.length > 2 && 
                !text.match(/^\d+(\.\d+)?%?$/) // Exclude pure numbers
              )
              const valueMatch = cellTexts.find(text => /\$[\d,]+(\.\d+)?[KMB]?|\d+(\.\d+)?%/.test(text))
              
              if (assetMatch && valueMatch && results.collateral_allocations) {
                const allocation: CollateralAllocation = {
                  asset_type: this.standardizeAssetName(assetMatch),
                  percentage: 0
                }
                
                // Parse percentage
                if (valueMatch.includes('%')) {
                  const match = valueMatch.match(/([0-9.]+)%/)
                  if (match) {
                    allocation.percentage = parseFloat(match[1])
                  }
                }
                
                // Parse USD value
                if (valueMatch.includes('$')) {
                  const match = valueMatch.match(/\$([0-9,]+(?:\.[0-9]+)?)([KMB])?/)
                  if (match) {
                    let value = parseFloat(match[1].replace(/,/g, ''))
                    const unit = match[2]
                    if (unit === 'K') value *= 1000
                    else if (unit === 'M') value *= 1000000
                    else if (unit === 'B') value *= 1000000000
                    allocation.value_usd = value
                  }
                }
                
                // Only add if we have meaningful data
                if ((allocation.percentage && allocation.percentage > 0) || (allocation.value_usd && allocation.value_usd > 0)) {
                  results.collateral_allocations.push(allocation)
                }
              }
            }
          })
        }
      })
    }

    // Calculate confidence
    results.confidence = this.calculateExtractionConfidence(results)

    return results
  }

  /**
   * Parse AI JSON response
   */
  private parseAIResponse(jsonResponse: any): Partial<CollateralData> {
    return {
      total_assets: jsonResponse.total_assets || 0,
      total_liabilities: jsonResponse.total_liabilities || 0,
      overcollateralization_ratio: jsonResponse.overcollateralization_ratio || 1.0,
      collateral_allocations: jsonResponse.collateral_allocations || [],
      last_updated: jsonResponse.last_updated,
      confidence: jsonResponse.confidence_score || 0.5,
      extraction_method: 'ai_extraction'
    }
  }

  /**
   * Parse AI text response when JSON parsing fails
   */
  private parseAITextResponse(textResponse: string): Partial<CollateralData> {
    // Basic text parsing fallback
    return {
      total_assets: 0,
      collateral_allocations: [],
      confidence: 0.3, // Low confidence for text parsing
      extraction_method: 'ai_extraction'
    }
  }

  /**
   * Combine DOM and AI extraction results
   */
  private combineResults(
    domResult?: Partial<CollateralData>,
    aiResult?: Partial<CollateralData>
  ): CollateralData {
    // If only one result, use it
    if (domResult && !aiResult) {
      return this.normalizeCollateralData(domResult)
    }
    if (aiResult && !domResult) {
      return this.normalizeCollateralData(aiResult)
    }

    // If both results, combine intelligently
    if (domResult && aiResult) {
      const combined: CollateralData = {
        total_assets: aiResult.total_assets || domResult.total_assets || 0,
        total_liabilities: aiResult.total_liabilities || domResult.total_liabilities || 0,
        overcollateralization_ratio: aiResult.overcollateralization_ratio || domResult.overcollateralization_ratio || 1.0,
        collateral_allocations: [
          ...(domResult.collateral_allocations || []),
          ...(aiResult.collateral_allocations || [])
        ],
        last_updated: aiResult.last_updated || domResult.last_updated,
        confidence: this.calculateCrossVerificationConfidence(domResult, aiResult),
        extraction_method: 'hybrid'
      }

      // Remove duplicate allocations
      combined.collateral_allocations = this.deduplicateAllocations(combined.collateral_allocations)

      return combined
    }

    // Fallback: empty result
    return {
      total_assets: 0,
      total_liabilities: 0,
      overcollateralization_ratio: 1.0,
      collateral_allocations: [],
      confidence: 0,
      extraction_method: 'hybrid'
    }
  }

  /**
   * Normalize partial collateral data to full CollateralData
   */
  private normalizeCollateralData(partial: Partial<CollateralData>): CollateralData {
    return {
      total_assets: partial.total_assets || 0,
      total_liabilities: partial.total_liabilities || 0,
      overcollateralization_ratio: partial.overcollateralization_ratio || 1.0,
      collateral_allocations: partial.collateral_allocations || [],
      last_updated: partial.last_updated,
      confidence: partial.confidence || 0,
      extraction_method: partial.extraction_method || 'hybrid'
    }
  }

  /**
   * Calculate confidence when both DOM and AI results are available
   */
  private calculateCrossVerificationConfidence(
    domResult: Partial<CollateralData>, 
    aiResult: Partial<CollateralData>
  ): number {
    const domConfidence = domResult.confidence || 0
    const aiConfidence = aiResult.confidence || 0
    
    // Base confidence is the higher of the two
    let confidence = Math.max(domConfidence, aiConfidence)
    
    // Cross-verification bonuses
    const domAssets = domResult.total_assets || 0
    const aiAssets = aiResult.total_assets || 0
    
    // Bonus if both methods found similar total assets
    if (domAssets > 0 && aiAssets > 0) {
      const ratio = Math.min(domAssets, aiAssets) / Math.max(domAssets, aiAssets)
      if (ratio >= 0.9) confidence += 0.1 // Very similar values
      else if (ratio >= 0.8) confidence += 0.05 // Reasonably similar
    }
    
    // Bonus if both methods found asset allocations
    const domAllocations = domResult.collateral_allocations?.length || 0
    const aiAllocations = aiResult.collateral_allocations?.length || 0
    if (domAllocations > 0 && aiAllocations > 0) {
      confidence += 0.05
      
      // Additional bonus if they found similar number of allocations
      const allocRatio = Math.min(domAllocations, aiAllocations) / Math.max(domAllocations, aiAllocations)
      if (allocRatio >= 0.5) confidence += 0.05
    }
    
    // Bonus for finding consistent asset types
    if (this.hasConsistentAssetTypes(domResult, aiResult)) {
      confidence += 0.05
    }
    
    return Math.min(confidence, 1.0)
  }

  /**
   * Check if both results have consistent asset types
   */
  private hasConsistentAssetTypes(
    domResult: Partial<CollateralData>, 
    aiResult: Partial<CollateralData>
  ): boolean {
    const domAssets = domResult.collateral_allocations?.map(a => a.asset_type.toLowerCase()) || []
    const aiAssets = aiResult.collateral_allocations?.map(a => a.asset_type.toLowerCase()) || []
    
    if (domAssets.length === 0 || aiAssets.length === 0) return false
    
    // Check if there's any overlap in asset types
    return domAssets.some(asset => 
      aiAssets.some(aiAsset => 
        asset.includes(aiAsset) || aiAsset.includes(asset) || 
        this.areRelatedAssetTypes(asset, aiAsset)
      )
    )
  }

  /**
   * Check if two asset types are related (e.g., "cash" and "cash equivalents")
   */
  private areRelatedAssetTypes(asset1: string, asset2: string): boolean {
    const relatedTerms = [
      ['cash', 'money market', 'liquid'],
      ['treasury', 'government', 'bills', 'bonds'],
      ['corporate', 'commercial', 'paper'],
      ['deposit', 'cd', 'certificate']
    ]
    
    return relatedTerms.some(group => 
      group.some(term => asset1.includes(term)) && 
      group.some(term => asset2.includes(term))
    )
  }

  /**
   * Remove duplicate allocations
   */
  private deduplicateAllocations(allocations: CollateralAllocation[]): CollateralAllocation[] {
    const seen = new Set<string>()
    return allocations.filter(allocation => {
      const key = allocation.asset_type.toLowerCase()
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  /**
   * Standardize asset names for consistency
   */
  private standardizeAssetName(rawName: string): string {
    const standardizations: Record<string, string> = {
      'cash & cash equivalents': 'USD Cash',
      'cash and cash equivalents': 'USD Cash',
      'cash equivalents': 'USD Cash',
      'treasury bills': 'US Treasury Bills',
      'us treasury': 'US Treasury Securities',
      'government bonds': 'Government Bonds',
      'corporate bonds': 'Corporate Bonds',
      'commercial paper': 'Commercial Paper',
      'money market': 'Money Market Funds',
      'certificates of deposit': 'Certificates of Deposit',
      'cd': 'Certificates of Deposit',
      'repos': 'Repurchase Agreements',
      'reverse repos': 'Reverse Repurchase Agreements'
    }

    const normalized = rawName.toLowerCase().trim()
    return standardizations[normalized] || rawName.trim()
  }

  /**
   * Calculate confidence score for extracted data
   */
  private calculateConfidence(data: Partial<CollateralData>): number {
    let score = 0

    // Base scores for data presence (40% of total)
    if (data.total_assets && data.total_assets > 0) {
      score += 0.25
      // Bonus for reasonable asset values (indicates real data, not errors)
      if (data.total_assets > 1000000 && data.total_assets < 1000000000000) {
        score += 0.05
      }
    }

    if (data.collateral_allocations && data.collateral_allocations.length > 0) {
      score += 0.25
      
      // Quality bonuses for allocations (30% of total)
      const allocations = data.collateral_allocations
      
      // Bonus for multiple allocations
      if (allocations.length >= 3) score += 0.1
      if (allocations.length >= 5) score += 0.05
      
      // Bonus for having both percentages and USD values
      const hasPercentages = allocations.some(a => a.percentage && a.percentage > 0)
      const hasValues = allocations.some(a => a.value_usd && a.value_usd > 0)
      if (hasPercentages && hasValues) score += 0.1
      
      // Bonus for percentage consistency (adds up to ~100%)
      const totalPercentage = allocations.reduce((sum, a) => sum + (a.percentage || 0), 0)
      if (totalPercentage >= 90 && totalPercentage <= 110) score += 0.05
    }

    // Data completeness bonuses (20% of total)
    if (data.overcollateralization_ratio && data.overcollateralization_ratio !== 1.0) score += 0.1
    if (data.last_updated) score += 0.05
    if (data.total_liabilities && data.total_liabilities > 0) score += 0.05

    // Data validation bonuses (10% of total)
    if (this.validateDataConsistency(data)) score += 0.05
    if (this.hasStandardizedAssetNames(data)) score += 0.05

    // Use existing confidence if it's higher (from AI)
    if (data.confidence && data.confidence > score) {
      // Blend AI confidence with our calculated score for better accuracy  
      const blendedScore = (data.confidence * 0.7) + (score * 0.3)
      return Math.min(blendedScore, 1.0)
    }

    return Math.min(score, 1.0)
  }

  /**
   * Validate data consistency across fields
   */
  private validateDataConsistency(data: Partial<CollateralData>): boolean {
    if (!data.collateral_allocations || !data.total_assets) return false

    // Check if allocation values sum up reasonably close to total assets
    const totalAllocations = data.collateral_allocations.reduce((sum, a) => {
      return sum + (a.value_usd || 0)
    }, 0)

    if (totalAllocations > 0 && data.total_assets > 0) {
      const ratio = totalAllocations / data.total_assets
      return ratio >= 0.8 && ratio <= 1.2 // Allow 20% variance
    }

    return true // If we can't validate, assume it's consistent
  }

  /**
   * Check if asset names are standardized
   */
  private hasStandardizedAssetNames(data: Partial<CollateralData>): boolean {
    if (!data.collateral_allocations || data.collateral_allocations.length === 0) return false

    const standardNames = [
      'USD Cash', 'US Treasury Bills', 'US Treasury Securities', 
      'Government Bonds', 'Corporate Bonds', 'Commercial Paper',
      'Money Market Funds', 'Certificates of Deposit', 'Repurchase Agreements'
    ]

    return data.collateral_allocations.some(allocation => 
      standardNames.includes(allocation.asset_type)
    )
  }

  /**
   * Calculate confidence for extraction results
   */
  private calculateExtractionConfidence(data: any): number {
    let confidence = 0

    if (data.total_assets > 0) confidence += 0.3
    if (data.collateral_allocations && data.collateral_allocations.length > 0) confidence += 0.4
    if (data.collateral_allocations && data.collateral_allocations.length >= 3) confidence += 0.2
    if (data.overcollateralization_ratio && data.overcollateralization_ratio !== 1.0) confidence += 0.1

    return Math.min(confidence, 1.0)
  }

  /**
   * Estimate AI extraction cost based on website format
   */
  private estimateAICost(format: WebsiteFormat): number {
    let baseCost = 0.10 // Base cost for AI analysis

    // Adjust based on complexity
    switch (format.estimatedComplexity) {
      case 'low':
        baseCost *= 0.5
        break
      case 'medium':
        baseCost *= 1.0
        break
      case 'high':
        baseCost *= 2.0
        break
    }

    // Adjust based on format type
    switch (format.type) {
      case 'pdf':
        baseCost *= 1.5 // PDF processing is more expensive
        break
      case 'spa':
        baseCost *= 1.3 // SPA content is more complex
        break
    }

    return Math.min(baseCost, this.COST_THRESHOLD)
  }
}

// Export singleton instance
export const hybridExtractionPipeline = new HybridExtractionPipeline()