/**
 * 🚀 Universal Transparency Scraper - Prototype Implementation
 * 
 * Dynamic, scalable transparency scraper that can handle 200+ stablecoins
 * without requiring custom code for each one.
 */

import { chromium, Browser, Page } from 'playwright'

// ============================================================================
// CORE INTERFACES
// ============================================================================

interface PageClassification {
  pageType: 'spa_dashboard' | 'static_html' | 'api_endpoint' | 'pdf_document' | 'hybrid'
  technology: 'react' | 'vue' | 'angular' | 'vanilla' | 'pdf' | 'api'
  dataFormat: 'tables' | 'charts' | 'json' | 'text' | 'mixed'
  confidence: number
  extractionStrategy: string[]
}

interface AssetClassification {
  originalName: string
  standardizedName: string
  category: AssetCategory
  subCategory?: string
  confidence: number
  context: string
}

interface ValidationResult {
  isValid: boolean
  confidence: number
  issues: ValidationIssue[]
  corrections: DataCorrection[]
  qualityScore: number
}

interface TransparencyResult {
  symbol: string
  url: string
  data: ExtractedData
  assets: AssetClassification[]
  validation: ValidationResult
  confidence: number
  extractedAt: Date
  processingTime: number
}

interface ExtractedData {
  totalAssets: number
  totalLiabilities: number
  collateralizationRatio: number
  allocations: AssetAllocation[]
  pageStructure: PageStructure
  successfulMethod: string
  qualityScore: number
}

interface AssetAllocation {
  asset: string
  amount: number
  percentage: number
  category: string
}

type AssetCategory = 'cash' | 'treasury' | 'repo' | 'crypto' | 'stablecoin' | 'tokenized_treasury' | 'liquid_staking' | 'fund' | 'other'

interface ValidationIssue {
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  suggestedFix?: string
  affectedAssets?: string[]
  externalSource?: string
}

interface DataCorrection {
  field: string
  originalValue: any
  correctedValue: any
  reason: string
}

interface PageStructure {
  hasFinancialTables: boolean
  hasCharts: boolean
  hasAPI: boolean
  hasDynamicContent: boolean
  detectedFramework: string
}

// ============================================================================
// COMPONENT 1: TRANSPARENCY PAGE CLASSIFIER
// ============================================================================

class TransparencyPageClassifier {
  async classifyPage(url: string): Promise<PageClassification> {
    console.log(`🔍 Classifying transparency page: ${url}`)
    
    // 1. URL Pattern Analysis
    const urlPatterns = this.analyzeUrlPatterns(url)
    
    // 2. Quick content analysis
    const contentAnalysis = await this.analyzeContentType(url)
    
    // 3. Technology stack detection
    const techStack = await this.detectTechnologyStack(url)
    
    // 4. Combine results
    return this.combineClassificationResults(urlPatterns, contentAnalysis, techStack)
  }

  private analyzeUrlPatterns(url: string): Partial<PageClassification> {
    const patterns = {
      dashboard: /dashboard|transparency|reserves?|attestation/i,
      api: /api|graphql|endpoint/i,
      pdf: /\.pdf|reports?|documents?/i,
      app: /app\.|dashboard\./i
    }
    
    let pageType: PageClassification['pageType'] = 'static_html'
    let confidence = 0.5
    
    if (patterns.dashboard.test(url)) {
      pageType = 'spa_dashboard'
      confidence = 0.8
    } else if (patterns.api.test(url)) {
      pageType = 'api_endpoint'
      confidence = 0.9
    } else if (patterns.pdf.test(url)) {
      pageType = 'pdf_document'
      confidence = 0.95
    }
    
    return { pageType, confidence }
  }

  private async analyzeContentType(url: string): Promise<Partial<PageClassification>> {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
      })
      
      const contentType = response.headers.get('content-type') || ''
      
      if (contentType.includes('application/pdf')) {
        return { pageType: 'pdf_document', confidence: 0.95 }
      } else if (contentType.includes('application/json')) {
        return { pageType: 'api_endpoint', confidence: 0.9 }
      }
      
      return { pageType: 'static_html', confidence: 0.6 }
    } catch (error) {
      console.warn(`Failed to analyze content type for ${url}:`, error)
      return { pageType: 'static_html', confidence: 0.3 }
    }
  }

  private async detectTechnologyStack(url: string): Promise<Partial<PageClassification>> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
      })
      const html = await response.text()
      
      // Look for framework indicators
      if (html.includes('__NEXT_DATA__') || html.includes('_next/')) {
        return { technology: 'react', dataFormat: 'mixed', confidence: 0.8 }
      } else if (html.includes('__nuxt') || html.includes('_nuxt/')) {
        return { technology: 'vue', dataFormat: 'mixed', confidence: 0.8 }
      } else if (html.includes('ng-version') || html.includes('angular')) {
        return { technology: 'angular', dataFormat: 'mixed', confidence: 0.8 }
      }
      
      // Check for data patterns
      const hasTable = /<table|<tbody|<tr|<td/i.test(html)
      const hasChart = /chart|graph|d3|plotly|recharts/i.test(html)
      
      let dataFormat: PageClassification['dataFormat'] = 'text'
      if (hasTable && hasChart) dataFormat = 'mixed'
      else if (hasTable) dataFormat = 'tables'
      else if (hasChart) dataFormat = 'charts'
      
      return { technology: 'vanilla', dataFormat, confidence: 0.6 }
    } catch (error) {
      console.warn(`Failed to detect technology stack for ${url}:`, error)
      return { technology: 'vanilla', dataFormat: 'text', confidence: 0.3 }
    }
  }

  private combineClassificationResults(
    urlPatterns: Partial<PageClassification>,
    contentAnalysis: Partial<PageClassification>,
    techStack: Partial<PageClassification>
  ): PageClassification {
    // Weighted combination of classification results
    const pageType = contentAnalysis.pageType || urlPatterns.pageType || 'static_html'
    const technology = techStack.technology || 'vanilla'
    const dataFormat = techStack.dataFormat || 'text'
    
    const confidence = Math.max(
      urlPatterns.confidence || 0,
      contentAnalysis.confidence || 0,
      techStack.confidence || 0
    )
    
    const extractionStrategy = this.selectExtractionStrategy(pageType, technology, dataFormat)
    
    return {
      pageType,
      technology,
      dataFormat,
      confidence,
      extractionStrategy
    }
  }

  private selectExtractionStrategy(
    pageType: PageClassification['pageType'],
    technology: PageClassification['technology'],
    dataFormat: PageClassification['dataFormat']
  ): string[] {
    const strategies: string[] = []
    
    if (pageType === 'spa_dashboard') {
      strategies.push('dynamic_content', 'api_discovery')
    }
    
    if (dataFormat === 'tables') {
      strategies.push('table_extraction')
    }
    
    if (dataFormat === 'charts') {
      strategies.push('chart_data_extraction')
    }
    
    if (technology === 'react' || technology === 'vue') {
      strategies.push('spa_extraction')
    }
    
    // Always include fallback strategies
    strategies.push('text_pattern_matching', 'html_parsing')
    
    return strategies
  }
}

// ============================================================================
// COMPONENT 2: MULTI-METHOD EXTRACTION ENGINE
// ============================================================================

abstract class ExtractionMethod {
  abstract name: string
  abstract priority: number
  abstract applicablePageTypes: PageClassification['pageType'][]
  
  abstract extract(url: string, classification: PageClassification): Promise<Partial<ExtractedData>>
}

class DynamicContentExtractor extends ExtractionMethod {
  name = 'dynamic_content'
  priority = 9
  applicablePageTypes: PageClassification['pageType'][] = ['spa_dashboard', 'hybrid']

  async extract(url: string, classification: PageClassification): Promise<Partial<ExtractedData>> {
    console.log(`   🔧 Using dynamic content extraction for ${url}`)
    
    let browser: Browser | null = null
    try {
      browser = await chromium.launch({ headless: true })
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        viewport: { width: 1920, height: 1080 }
      })
      const page = await context.newPage()
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      
      // Wait for financial data to load
      await this.waitForFinancialData(page)
      
      // Extract data using multiple strategies
      const data = await this.extractFromDynamicPage(page)
      
      return {
        ...data,
        successfulMethod: this.name,
        pageStructure: await this.analyzePageStructure(page)
      }
    } catch (error) {
      console.warn(`Dynamic extraction failed for ${url}:`, error)
      throw error
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  }

  private async waitForFinancialData(page: Page): Promise<void> {
    try {
      await page.waitForFunction(() => {
        const text = document.body.innerText.toLowerCase()
        const hasFinancialIndicators = text.includes('$') || text.includes('%') || 
                                     text.includes('billion') || text.includes('million') ||
                                     text.includes('reserve') || text.includes('collateral')
        return hasFinancialIndicators
      }, { timeout: 15000 })
    } catch (error) {
      console.warn('Timeout waiting for financial data indicators')
    }
  }

  private async extractFromDynamicPage(page: Page): Promise<Partial<ExtractedData>> {
    // Extract financial data using multiple strategies
    const strategies = [
      () => this.extractFromTables(page),
      () => this.extractFromText(page),
      () => this.extractFromCharts(page),
      () => this.extractFromAttributes(page)
    ]
    
    const results = await Promise.allSettled(strategies.map(strategy => strategy()))
    
    // Combine successful extractions
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<Partial<ExtractedData>> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value)
    
    return this.combineExtractionResults(successfulResults)
  }

  private async extractFromTables(page: Page): Promise<Partial<ExtractedData> | null> {
    try {
      const tableData = await page.evaluate(() => {
        const tables = document.querySelectorAll('table')
        const allocations: AssetAllocation[] = []
        
        // Define parsing functions within browser context
        const parseAmount = (text: string): number => {
          const match = text.match(/\$?([\d,]+(?:\.\d+)?)\s*(M|B|million|billion)?/i)
          if (!match) return 0
          
          const amount = parseFloat(match[1].replace(/,/g, ''))
          const unit = match[2]?.toLowerCase()
          
          if (unit?.includes('b')) return amount * 1e9
          if (unit?.includes('m')) return amount * 1e6
          return amount
        }
        
        const parsePercentage = (text: string): number | null => {
          const match = text.match(/([\d.]+)%/)
          return match ? parseFloat(match[1]) : null
        }
        
        tables.forEach(table => {
          const rows = table.querySelectorAll('tr')
          rows.forEach(row => {
            const cells = row.querySelectorAll('td, th')
            if (cells.length >= 2) {
              const text = Array.from(cells).map(cell => cell.textContent?.trim() || '')
              
              // Look for asset allocation patterns
              const assetMatch = text.find(t => /^[A-Z]{2,}|cash|treasury|repo/i.test(t))
              const amountMatch = text.find(t => /\$[\d,.]+(M|B|million|billion)?|\d+\.\d+%/i.test(t))
              
              if (assetMatch && amountMatch) {
                const amount = parseAmount(amountMatch)
                const percentage = parsePercentage(amountMatch) || 0
                
                allocations.push({
                  asset: assetMatch,
                  amount,
                  percentage,
                  category: 'other'
                })
              }
            }
          })
        })
        
        return allocations.length > 0 ? { allocations } : null
      })
      
      return tableData
    } catch (error) {
      console.warn('Table extraction failed:', error)
      return null
    }
  }

  private async extractFromText(page: Page): Promise<Partial<ExtractedData> | null> {
    try {
      const textData = await page.evaluate(() => {
        const text = document.body.innerText
        
        // Look for total assets/reserves patterns
        const totalAssetsMatch = text.match(/total\s+(assets|reserves?|collateral)[\s:]*\$?(\d+(?:\.\d+)?)\s*(billion|million|B|M)?/i)
        const collateralizationMatch = text.match(/collateraliz(?:ed|ation)[\s:]*(\d+(?:\.\d+)?)%/i)
        
        let totalAssets = 0
        if (totalAssetsMatch) {
          const amount = parseFloat(totalAssetsMatch[2])
          const unit = totalAssetsMatch[3]?.toLowerCase()
          if (unit?.includes('b')) totalAssets = amount * 1e9
          else if (unit?.includes('m')) totalAssets = amount * 1e6
          else totalAssets = amount
        }
        
        let collateralizationRatio = 100
        if (collateralizationMatch) {
          collateralizationRatio = parseFloat(collateralizationMatch[1])
        }
        
        return totalAssets > 0 ? { totalAssets, collateralizationRatio } : null
      })
      
      return textData
    } catch (error) {
      console.warn('Text extraction failed:', error)
      return null
    }
  }

  private async extractFromCharts(page: Page): Promise<Partial<ExtractedData> | null> {
    // This would extract data from chart libraries like D3, Chart.js, etc.
    // For now, return null as this requires complex implementation
    return null
  }

  private async extractFromAttributes(page: Page): Promise<Partial<ExtractedData> | null> {
    try {
      const attrData = await page.evaluate(() => {
        // Look for data attributes that might contain financial data
        const elements = document.querySelectorAll('[data-value], [data-amount], [data-percentage]')
        const allocations: AssetAllocation[] = []
        
        elements.forEach(el => {
          const value = el.getAttribute('data-value') || el.getAttribute('data-amount')
          const percentage = el.getAttribute('data-percentage')
          const label = el.textContent?.trim() || el.getAttribute('data-label') || ''
          
          if (value && label) {
            allocations.push({
              asset: label,
              amount: parseFloat(value) || 0,
              percentage: parseFloat(percentage || '0'),
              category: 'other'
            })
          }
        })
        
        return allocations.length > 0 ? { allocations } : null
      })
      
      return attrData
    } catch (error) {
      console.warn('Attribute extraction failed:', error)
      return null
    }
  }

  private async analyzePageStructure(page: Page): Promise<PageStructure> {
    return await page.evaluate(() => {
      const hasFinancialTables = document.querySelectorAll('table').length > 0
      const hasCharts = document.querySelectorAll('[class*="chart"], [id*="chart"], canvas, svg').length > 0
      const hasAPI = document.documentElement.innerHTML.includes('api') || 
                    document.documentElement.innerHTML.includes('fetch')
      const hasDynamicContent = document.querySelectorAll('[class*="react"], [class*="vue"], [data-reactroot]').length > 0
      
      let detectedFramework = 'vanilla'
      if (document.documentElement.innerHTML.includes('__NEXT_DATA__')) detectedFramework = 'next.js'
      else if (document.documentElement.innerHTML.includes('__nuxt')) detectedFramework = 'nuxt.js'
      else if (document.querySelector('[data-reactroot]')) detectedFramework = 'react'
      
      return {
        hasFinancialTables,
        hasCharts,
        hasAPI,
        hasDynamicContent,
        detectedFramework
      }
    })
  }

  private combineExtractionResults(results: Partial<ExtractedData>[]): Partial<ExtractedData> {
    if (results.length === 0) {
      throw new Error('No successful extraction results')
    }
    
    // Combine results with preference for more complete data
    const combined: Partial<ExtractedData> = {
      totalAssets: 0,
      totalLiabilities: 0,
      collateralizationRatio: 100,
      allocations: [],
      qualityScore: 0
    }
    
    // Take the highest totalAssets value
    const totalAssets = results
      .map(r => r.totalAssets || 0)
      .filter(a => a > 0)
      .sort((a, b) => b - a)[0] || 0
    
    // Combine all allocations
    const allAllocations = results
      .flatMap(r => r.allocations || [])
      .filter(a => a.amount > 0)
    
    // Take the most specific collateralization ratio
    const collateralizationRatio = results
      .map(r => r.collateralizationRatio)
      .filter(r => r && r !== 100)[0] || 100
    
    combined.totalAssets = totalAssets
    combined.allocations = allAllocations
    combined.collateralizationRatio = collateralizationRatio
    combined.qualityScore = this.calculateQualityScore(combined)
    
    return combined
  }

  private calculateQualityScore(data: Partial<ExtractedData>): number {
    let score = 0
    
    if (data.totalAssets && data.totalAssets > 0) score += 30
    if (data.allocations && data.allocations.length > 0) score += 40
    if (data.collateralizationRatio && data.collateralizationRatio !== 100) score += 20
    if (data.allocations && data.allocations.length >= 3) score += 10
    
    return Math.min(score, 100)
  }

  private parseAmount(text: string): number {
    const match = text.match(/\$?([\d,]+(?:\.\d+)?)\s*(M|B|million|billion)?/i)
    if (!match) return 0
    
    const amount = parseFloat(match[1].replace(/,/g, ''))
    const unit = match[2]?.toLowerCase()
    
    if (unit?.includes('b')) return amount * 1e9
    if (unit?.includes('m')) return amount * 1e6
    return amount
  }

  private parsePercentage(text: string): number | null {
    const match = text.match(/([\d.]+)%/)
    return match ? parseFloat(match[1]) : null
  }
}

class StaticHTMLExtractor extends ExtractionMethod {
  name = 'static_html'
  priority = 5
  applicablePageTypes: PageClassification['pageType'][] = ['static_html', 'hybrid']

  async extract(url: string, classification: PageClassification): Promise<Partial<ExtractedData>> {
    console.log(`   🔧 Using static HTML extraction for ${url}`)
    
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StableRisk/1.0)' }
      })
      const html = await response.text()
      
      // Parse HTML and extract financial data
      const data = this.parseHTMLForFinancialData(html)
      
      return {
        ...data,
        successfulMethod: this.name,
        qualityScore: this.calculateQualityScore(data)
      }
    } catch (error) {
      console.warn(`Static HTML extraction failed for ${url}:`, error)
      throw error
    }
  }

  private parseHTMLForFinancialData(html: string): Partial<ExtractedData> {
    // Basic HTML parsing for financial data
    const data: Partial<ExtractedData> = {
      allocations: [],
      totalAssets: 0,
      collateralizationRatio: 100
    }
    
    // Look for total assets in text
    const totalAssetsMatch = html.match(/total\s+(assets|reserves?)[\s:]*\$?([\d,]+(?:\.\d+)?)\s*(billion|million|B|M)?/i)
    if (totalAssetsMatch) {
      const amount = parseFloat(totalAssetsMatch[2].replace(/,/g, ''))
      const unit = totalAssetsMatch[3]?.toLowerCase()
      if (unit?.includes('b')) data.totalAssets = amount * 1e9
      else if (unit?.includes('m')) data.totalAssets = amount * 1e6
      else data.totalAssets = amount
    }
    
    // Look for collateralization ratio
    const collateralizationMatch = html.match(/collateraliz(?:ed|ation)[\s:]*(\d+(?:\.\d+)?)%/i)
    if (collateralizationMatch) {
      data.collateralizationRatio = parseFloat(collateralizationMatch[1])
    }
    
    return data
  }

  private calculateQualityScore(data: Partial<ExtractedData>): number {
    let score = 0
    if (data.totalAssets && data.totalAssets > 0) score += 40
    if (data.collateralizationRatio && data.collateralizationRatio !== 100) score += 30
    if (data.allocations && data.allocations.length > 0) score += 30
    return Math.min(score, 100)
  }
}

class MultiMethodExtractor {
  private methods: ExtractionMethod[] = [
    new DynamicContentExtractor(),
    new StaticHTMLExtractor()
  ]

  async extractData(url: string, classification: PageClassification): Promise<ExtractedData> {
    console.log(`🔧 Starting multi-method extraction for ${url}`)
    
    // Select applicable methods based on classification
    const applicableMethods = this.selectMethods(classification)
    
    // Try methods in order of priority
    for (const method of applicableMethods) {
      try {
        const result = await this.runExtractionWithTimeout(method, url, classification)
        if (result && this.isValidResult(result)) {
          console.log(`✅ Successfully extracted data using ${method.name}`)
          return this.normalizeResult(result)
        }
      } catch (error) {
        console.warn(`❌ Method ${method.name} failed:`, error)
      }
    }
    
    throw new Error('All extraction methods failed')
  }

  private selectMethods(classification: PageClassification): ExtractionMethod[] {
    return this.methods
      .filter(method => method.applicablePageTypes.includes(classification.pageType))
      .sort((a, b) => b.priority - a.priority)
  }

  private async runExtractionWithTimeout(
    method: ExtractionMethod,
    url: string,
    classification: PageClassification
  ): Promise<Partial<ExtractedData>> {
    return Promise.race([
      method.extract(url, classification),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Extraction timeout')), 60000)
      )
    ])
  }

  private isValidResult(result: Partial<ExtractedData>): boolean {
    return !!(result.totalAssets || result.allocations?.length || result.collateralizationRatio !== 100)
  }

  private normalizeResult(result: Partial<ExtractedData>): ExtractedData {
    return {
      totalAssets: result.totalAssets || 0,
      totalLiabilities: result.totalLiabilities || 0,
      collateralizationRatio: result.collateralizationRatio || 100,
      allocations: result.allocations || [],
      pageStructure: result.pageStructure || {
        hasFinancialTables: false,
        hasCharts: false,
        hasAPI: false,
        hasDynamicContent: false,
        detectedFramework: 'unknown'
      },
      successfulMethod: result.successfulMethod || 'unknown',
      qualityScore: result.qualityScore || 0
    }
  }
}

// ============================================================================
// COMPONENT 3: INTELLIGENT ASSET CLASSIFIER
// ============================================================================

class IntelligentAssetClassifier {
  private patterns = {
    cash: /\b(cash|money|deposit|bank|checking|savings)\b/i,
    treasury: /\b(treasury|t-bill|government|federal|municipal|ustb|buidl)\b/i,
    repo: /\b(repo|repurchase|agreement|overnight)\b/i,
    crypto: /\b(btc|eth|bitcoin|ethereum|crypto|coin|token)\b/i,
    stablecoin: /\b(usdc|usdt|dai|busd|stable|peg)\b/i,
    tokenized_treasury: /\b(ustb|buidl|ondo|mountain|backed|wtgxx|usdb)\b/i,
    liquid_staking: /\b(lst|liquid|staking|steth|reth)\b/i,
    fund: /\b(fund|reserve|pool|vault|portfolio)\b/i
  }

  async classifyAssets(allocations: AssetAllocation[]): Promise<AssetClassification[]> {
    return allocations.map(allocation => this.classifyAsset(allocation.asset))
  }

  private classifyAsset(assetName: string): AssetClassification {
    const normalized = this.normalizeAssetName(assetName)
    
    // Try pattern matching
    for (const [category, pattern] of Object.entries(this.patterns)) {
      if (pattern.test(normalized)) {
        return {
          originalName: assetName,
          standardizedName: this.standardizeName(assetName, category as AssetCategory),
          category: category as AssetCategory,
          confidence: 0.8,
          context: 'pattern_match'
        }
      }
    }
    
    // Fallback to 'other' category
    return {
      originalName: assetName,
      standardizedName: assetName,
      category: 'other',
      confidence: 0.3,
      context: 'no_match'
    }
  }

  private normalizeAssetName(name: string): string {
    return name
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
  }

  private standardizeName(name: string, category: AssetCategory): string {
    // Map common variations to standard names
    const standardNames: Record<string, string> = {
      'ustb': 'US Treasury Bills (Tokenized)',
      'buidl': 'BlackRock USD Institutional Digital Liquidity Fund',
      'usdc': 'USD Coin',
      'usdt': 'Tether USD',
      'wtgxx': 'Western Asset Treasury Fund',
      'usdb': 'USD Balance'
    }
    
    const normalized = name.toLowerCase().trim()
    return standardNames[normalized] || name
  }
}

// ============================================================================
// COMPONENT 4: DATA VALIDATOR
// ============================================================================

class DataValidator {
  async validate(
    data: ExtractedData,
    symbol: string,
    historicalData?: ExtractedData[]
  ): Promise<ValidationResult> {
    const validations = await Promise.all([
      this.validateFinancialConsistency(data),
      this.validateAssetAllocations(data),
      this.validateBusinessLogic(data, symbol)
    ])

    return this.combineValidationResults(validations)
  }

  private async validateFinancialConsistency(data: ExtractedData): Promise<Partial<ValidationResult>> {
    const issues: ValidationIssue[] = []
    
    // Check if allocations sum to reasonable percentage
    if (data.allocations.length > 0) {
      const totalAllocation = data.allocations.reduce((sum, alloc) => sum + alloc.percentage, 0)
      if (totalAllocation > 0 && Math.abs(totalAllocation - 100) > 10) {
        issues.push({
          type: 'allocation_sum_error',
          severity: 'medium',
          message: `Allocations sum to ${totalAllocation.toFixed(1)}%, expected ~100%`,
          suggestedFix: 'normalize_allocations'
        })
      }
    }
    
    // Check for negative values
    const negativeValues = data.allocations.filter(alloc => alloc.amount < 0)
    if (negativeValues.length > 0) {
      issues.push({
        type: 'negative_values',
        severity: 'critical',
        message: 'Found negative allocation amounts',
        affectedAssets: negativeValues.map(v => v.asset)
      })
    }
    
    return { issues, confidence: this.calculateConfidence(issues) }
  }

  private async validateAssetAllocations(data: ExtractedData): Promise<Partial<ValidationResult>> {
    const issues: ValidationIssue[] = []
    
    // Check if we have meaningful allocations
    if (data.allocations.length === 0) {
      issues.push({
        type: 'no_allocations',
        severity: 'high',
        message: 'No asset allocations found'
      })
    }
    
    return { issues, confidence: data.allocations.length > 0 ? 0.8 : 0.2 }
  }

  private async validateBusinessLogic(data: ExtractedData, symbol: string): Promise<Partial<ValidationResult>> {
    const issues: ValidationIssue[] = []
    
    // Check collateralization ratio reasonableness
    if (data.collateralizationRatio < 90 || data.collateralizationRatio > 150) {
      issues.push({
        type: 'unusual_collateralization',
        severity: 'medium',
        message: `Collateralization ratio of ${data.collateralizationRatio}% seems unusual`
      })
    }
    
    return { issues, confidence: 0.7 }
  }

  private combineValidationResults(validations: Partial<ValidationResult>[]): ValidationResult {
    const allIssues = validations.flatMap(v => v.issues || [])
    const avgConfidence = validations.reduce((sum, v) => sum + (v.confidence || 0), 0) / validations.length
    
    const criticalIssues = allIssues.filter(i => i.severity === 'critical').length
    const highIssues = allIssues.filter(i => i.severity === 'high').length
    
    const isValid = criticalIssues === 0 && highIssues <= 1
    const qualityScore = Math.max(0, avgConfidence * 100 - (criticalIssues * 30) - (highIssues * 15))
    
    return {
      isValid,
      confidence: avgConfidence,
      issues: allIssues,
      corrections: [],
      qualityScore
    }
  }

  private calculateConfidence(issues: ValidationIssue[]): number {
    const criticalCount = issues.filter(i => i.severity === 'critical').length
    const highCount = issues.filter(i => i.severity === 'high').length
    const mediumCount = issues.filter(i => i.severity === 'medium').length
    
    return Math.max(0.1, 1 - (criticalCount * 0.4) - (highCount * 0.2) - (mediumCount * 0.1))
  }
}

// ============================================================================
// MAIN UNIVERSAL TRANSPARENCY EXTRACTOR
// ============================================================================

export class UniversalTransparencyExtractor {
  private pageClassifier = new TransparencyPageClassifier()
  private extractionPipeline = new MultiMethodExtractor()
  private assetClassifier = new IntelligentAssetClassifier()
  private validator = new DataValidator()

  async extractTransparencyData(url: string, symbol: string): Promise<TransparencyResult> {
    const startTime = Date.now()
    console.log(`🚫 Collateral breakdown crawling is disabled for ${symbol}`)
    
    // Return empty result since collateral breakdown crawling is disabled
    return {
      symbol,
      url,
      data: {
        totalAssets: 0,
        totalLiabilities: 0,
        collateralizationRatio: 0,
        allocations: [],
        pageStructure: {
          hasFinancialTables: false,
          hasCharts: false,
          hasAPI: false,
          hasDynamicContent: false,
          detectedFramework: 'disabled'
        },
        successfulMethod: 'disabled',
        qualityScore: 0
      },
      assets: [],
      validation: {
        isValid: false,
        confidence: 0,
        issues: [{
          type: 'crawling_disabled',
          severity: 'low',
          message: 'Collateral breakdown crawling has been disabled'
        }],
        corrections: [],
        qualityScore: 0
      },
      confidence: 0,
      extractedAt: new Date(),
      processingTime: Date.now() - startTime
    }
  }

  // Batch processing for multiple stablecoins
  async extractMultipleStablecoins(
    stablecoins: { symbol: string; url: string }[]
  ): Promise<TransparencyResult[]> {
    console.log(`🔄 Starting batch extraction for ${stablecoins.length} stablecoins`)
    
    const results = await Promise.allSettled(
      stablecoins.map(({ symbol, url }) => 
        this.extractTransparencyData(url, symbol)
      )
    )
    
    const successful = results
      .filter((result): result is PromiseFulfilledResult<TransparencyResult> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value)
    
    const failed = results
      .filter((result): result is PromiseRejectedResult => 
        result.status === 'rejected'
      )
      .length
    
    console.log(`✅ Batch extraction complete: ${successful.length} successful, ${failed} failed`)
    
    return successful
  }
}

// Export the main class and types
export type {
  TransparencyResult,
  ExtractedData,
  AssetClassification,
  ValidationResult,
  PageClassification
} 