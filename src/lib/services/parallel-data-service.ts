import { StablecoinDataService } from './stablecoin-data'

interface ParallelDataResult {
  tier1Data?: any
  tier2Data?: any
  tier3Data?: any
  errors: string[]
}

// Rate limiting utility
class RateLimiter {
  private lastCall = 0
  private minInterval: number

  constructor(callsPerSecond: number = 2) {
    this.minInterval = 1000 / callsPerSecond // Convert to milliseconds
  }

  async throttle(): Promise<void> {
    const now = Date.now()
    const timeSinceLastCall = now - this.lastCall
    
    if (timeSinceLastCall < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastCall
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    
    this.lastCall = Date.now()
  }
}

export class ParallelDataService {
  private dataService: StablecoinDataService
  private rateLimiter: RateLimiter
  private isBuildTime: boolean

  constructor() {
    this.dataService = new StablecoinDataService()
    // More conservative rate limiting: 2 calls per second to avoid 429 errors
    this.rateLimiter = new RateLimiter(2)
    // Detect build time vs runtime
    this.isBuildTime = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === undefined
  }

  async getStablecoinDataParallel(ticker: string): Promise<ParallelDataResult> {
    const errors: string[] = []
    
    try {
      // Apply rate limiting before any API calls
      await this.rateLimiter.throttle()
      
      // Get Tier 1 data first (fastest)
      const tier1Data = await this.dataService.getTier1Data(ticker)
      
      if (!tier1Data) {
        return {
          tier1Data: null,
          tier2Data: null,
          tier3Data: null,
          errors: ['Failed to get basic stablecoin data']
        }
      }

      // For build time, be more conservative with parallel calls
      if (this.isBuildTime) {
        // Sequential execution during build to avoid rate limits
        await this.rateLimiter.throttle()
        const tier2Data = await this.dataService.getTier2Data(ticker, tier1Data).catch(err => {
          errors.push(`Tier 2 data: ${err}`)
          return null
        })
        
        await this.rateLimiter.throttle()
        const tier3Data = await this.dataService.getTier3Data(ticker, tier1Data, tier2Data || {} as any).catch(err => {
          errors.push(`Tier 3 data: ${err}`)
          return null
        })

        return {
          tier1Data,
          tier2Data,
          tier3Data,
          errors
        }
      } else {
        // Runtime: Execute Tier 2 and Tier 3 in parallel for better performance
        const [tier2Result, tier3Result] = await Promise.allSettled([
          this.dataService.getTier2Data(ticker, tier1Data),
          this.dataService.getTier3Data(ticker, tier1Data, {} as any) // We'll get tier2 data separately
        ])

        return {
          tier1Data,
          tier2Data: tier2Result.status === 'fulfilled' ? tier2Result.value : null,
          tier3Data: tier3Result.status === 'fulfilled' ? tier3Result.value : null,
          errors: [
            ...(tier2Result.status === 'rejected' ? [`Tier 2 data: ${tier2Result.reason}`] : []),
            ...(tier3Result.status === 'rejected' ? [`Tier 3 data: ${tier3Result.reason}`] : [])
          ]
        }
      }
    } catch (error) {
      return {
        tier1Data: null,
        tier2Data: null,
        tier3Data: null,
        errors: [`Critical error: ${error}`]
      }
    }
  }

  // Streaming data method for progressive loading using the actual tiered system
  async *getStablecoinDataStream(ticker: string) {
    try {
      // Apply rate limiting before any API calls
      await this.rateLimiter.throttle()
      
      // Yield Tier 1 data first (basic info, fastest)
      const tier1Data = await this.dataService.getTier1Data(ticker)
      if (tier1Data) {
        yield { tier: 1, type: 'basicInfo', data: tier1Data }
      } else {
        yield { tier: 1, type: 'error', error: 'Failed to get basic stablecoin data' }
        return
      }

      // Yield Tier 2 data (peg stability, transparency)
      try {
        await this.rateLimiter.throttle()
        const tier2Data = await this.dataService.getTier2Data(ticker, tier1Data)
        yield { tier: 2, type: 'coreAnalysis', data: tier2Data }
      } catch (error) {
        yield { tier: 2, type: 'error', error: `Tier 2 failed: ${error}` }
      }

      // Yield Tier 3 data (audits, liquidity - slowest)
      try {
        await this.rateLimiter.throttle()
        const tier2Data = await this.dataService.getTier2Data(ticker, tier1Data)
        const tier3Data = await this.dataService.getTier3Data(ticker, tier1Data, tier2Data)
        yield { tier: 3, type: 'comprehensiveAnalysis', data: tier3Data }
      } catch (error) {
        yield { tier: 3, type: 'error', error: `Tier 3 failed: ${error}` }
      }
    } catch (error) {
      yield { tier: 0, type: 'error', error: `Critical error: ${error}` }
    }
  }
} 