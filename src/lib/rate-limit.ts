import { NextRequest } from 'next/server'
import { RateLimitInfo } from './types'

interface RateLimitEntry {
  count: number
  resetTime: number
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>()
  private maxRequests: number
  private windowMs: number

  constructor(maxRequests: number = 10, windowMs: number = 24 * 60 * 60 * 1000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  check(identifier: string): RateLimitInfo {
    const now = Date.now()
    const entry = this.store.get(identifier)

    // If no entry exists or the window has expired, create a new one
    if (!entry || now > entry.resetTime) {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + this.windowMs
      }
      this.store.set(identifier, newEntry)
      
      return {
        remaining: this.maxRequests - 1,
        reset_time: newEntry.resetTime,
        limit: this.maxRequests
      }
    }

    // Increment the count
    entry.count++
    this.store.set(identifier, entry)

    return {
      remaining: Math.max(0, this.maxRequests - entry.count),
      reset_time: entry.resetTime,
      limit: this.maxRequests
    }
  }

  isAllowed(identifier: string): boolean {
    const info = this.check(identifier)
    return info.remaining >= 0
  }

  reset(identifier: string): void {
    this.store.delete(identifier)
  }

  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key)
      }
    }
  }

  getStats(): { totalEntries: number; activeUsers: string[] } {
    return {
      totalEntries: this.store.size,
      activeUsers: Array.from(this.store.keys())
    }
  }
}

// Create rate limiter instance
const rateLimiter = new RateLimiter(10, 24 * 60 * 60 * 1000) // 10 requests per 24 hours

// Cleanup expired entries every hour
if (typeof window === 'undefined') {
  setInterval(() => {
    rateLimiter.cleanup()
  }, 60 * 60 * 1000)
}

// Helper function to get client identifier
export function getClientIdentifier(request: NextRequest): string {
  // Try to get real IP from headers (for deployed environments)
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  if (realIp) {
    return realIp
  }
  
  // Fallback for development
  return 'localhost'
}

// Main rate limiting function
export function checkRateLimit(request: NextRequest): {
  allowed: boolean
  info: RateLimitInfo
} {
  const identifier = getClientIdentifier(request)
  const info = rateLimiter.check(identifier)
  
  return {
    allowed: info.remaining >= 0,
    info
  }
}

// Middleware helper for API routes
export function withRateLimit<T extends (...args: any[]) => any>(
  handler: T,
  customLimiter?: RateLimiter
): T {
  return (async (request: NextRequest, ...args: any[]) => {
    const limiter = customLimiter || rateLimiter
    const identifier = getClientIdentifier(request)
    
    if (!limiter.isAllowed(identifier)) {
      const info = limiter.check(identifier)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Rate limit exceeded',
          message: `You have exceeded the rate limit of ${info.limit} requests per day. Try again later.`,
          rate_limit: info
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': info.limit.toString(),
            'X-RateLimit-Remaining': info.remaining.toString(),
            'X-RateLimit-Reset': info.reset_time.toString(),
            'Retry-After': Math.ceil((info.reset_time - Date.now()) / 1000).toString()
          }
        }
      )
    }

    return handler(request, ...args)
  }) as T
}

export default rateLimiter 