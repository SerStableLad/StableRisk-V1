/**
 * AI Timeout Wrapper Service
 * Provides timeout wrappers for AI operations to prevent hanging
 */

export interface TimeoutResult<T> {
  success: boolean
  data?: T
  error?: string
  timedOut: boolean
  duration: number
}

export class AiTimeoutWrapper {
  private static instance: AiTimeoutWrapper

  public static getInstance(): AiTimeoutWrapper {
    if (!AiTimeoutWrapper.instance) {
      AiTimeoutWrapper.instance = new AiTimeoutWrapper()
    }
    return AiTimeoutWrapper.instance
  }

  /**
   * Wrap any async AI operation with a timeout
   */
  async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number = 10000,
    operationName: string = 'AI operation'
  ): Promise<TimeoutResult<T>> {
    const startTime = Date.now()
    console.log(`⏱️ Starting timed ${operationName} with ${timeoutMs}ms timeout`)

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${operationName} timeout`)), timeoutMs)
        )
      ])

      const duration = Date.now() - startTime
      console.log(`✅ ${operationName} completed in ${duration}ms`)

      return {
        success: true,
        data: result,
        timedOut: false,
        duration
      }
    } catch (error: any) {
      const duration = Date.now() - startTime
      const isTimeout = error.message.includes('timeout')

      if (isTimeout) {
        console.error(`⏰ ${operationName} timed out after ${timeoutMs}ms`)
      } else {
        console.error(`❌ ${operationName} failed after ${duration}ms:`, error)
      }

      return {
        success: false,
        error: error.message,
        timedOut: isTimeout,
        duration
      }
    }
  }

  /**
   * Wrap Gemini service calls with standard 10s timeout
   */
  async wrapGeminiCall<T>(
    geminiOperation: () => Promise<T>,
    operationName: string
  ): Promise<TimeoutResult<T>> {
    return this.withTimeout(geminiOperation, 10000, `Gemini ${operationName}`)
  }

  /**
   * Wrap AI collateral extraction with budget-aware timeout
   */
  async wrapCollateralExtraction<T>(
    extractionOperation: () => Promise<T>,
    symbol: string,
    budgetRemaining: number
  ): Promise<TimeoutResult<T>> {
    // Reduce timeout if budget is low to avoid expensive operations
    const timeout = budgetRemaining > 5 ? 10000 : 5000
    const operationName = `AI collateral extraction for ${symbol}`
    
    console.log(`💰 Budget-aware timeout: ${timeout}ms (remaining budget: $${budgetRemaining.toFixed(2)})`)
    
    return this.withTimeout(extractionOperation, timeout, operationName)
  }

  /**
   * Wrap transparency analysis with confidence-based timeout
   */
  async wrapTransparencyAnalysis<T>(
    analysisOperation: () => Promise<T>,
    symbol: string,
    expectedConfidence: number = 0.7
  ): Promise<TimeoutResult<T>> {
    // Lower expected confidence = shorter timeout to avoid wasting resources
    const timeout = expectedConfidence > 0.8 ? 12000 : 8000
    const operationName = `AI transparency analysis for ${symbol}`
    
    return this.withTimeout(analysisOperation, timeout, operationName)
  }

  /**
   * Create a timeout promise that can be used in Promise.race
   */
  createTimeoutPromise<T>(timeoutMs: number, errorMessage: string): Promise<T> {
    return new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  }

  /**
   * Batch multiple AI operations with individual timeouts
   */
  async batchWithTimeouts<T>(
    operations: Array<{
      operation: () => Promise<T>
      name: string
      timeout?: number
    }>,
    maxConcurrent: number = 3
  ): Promise<Array<TimeoutResult<T>>> {
    console.log(`🔄 Starting batch of ${operations.length} AI operations (max ${maxConcurrent} concurrent)`)

    const results: Array<TimeoutResult<T>> = []
    
    // Process operations in batches
    for (let i = 0; i < operations.length; i += maxConcurrent) {
      const batch = operations.slice(i, i + maxConcurrent)
      
      const batchPromises = batch.map(({ operation, name, timeout = 10000 }) =>
        this.withTimeout(operation, timeout, name)
      )
      
      const batchResults = await Promise.allSettled(batchPromises)
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({
            success: false,
            error: result.reason?.message || 'Unknown batch error',
            timedOut: false,
            duration: 0
          })
        }
      }
    }

    const successful = results.filter(r => r.success).length
    const timedOut = results.filter(r => r.timedOut).length
    
    console.log(`📊 Batch complete: ${successful}/${operations.length} successful, ${timedOut} timed out`)
    
    return results
  }
}

// Export singleton instance
export const aiTimeoutWrapper = AiTimeoutWrapper.getInstance()