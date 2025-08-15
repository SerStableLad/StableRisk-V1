/**
 * Rate Limiting Middleware
 * 
 * Provides configurable rate limiting for API endpoints using Redis
 */

import { Request, Response, NextFunction } from 'express';
import { RedisConnection } from '../redis/connection';
import { logger } from './logger';

interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  keyGenerator?: (req: Request) => string;  // Custom key generator
  skipSuccessfulRequests?: boolean;         // Skip counting successful requests
  skipFailedRequests?: boolean;             // Skip counting failed requests
  message?: string;        // Custom error message
  headers?: boolean;       // Include rate limit headers
}

interface RateLimitInfo {
  totalHits: number;
  totalTime: number;
  resetTime: Date;
  remaining: number;
}

export class RateLimiter {
  private redis: RedisConnection;
  private keyPrefix: string = 'rate_limit:';

  constructor() {
    this.redis = RedisConnection.getInstance();
  }

  /**
   * Create rate limiting middleware
   */
  public createMiddleware(config: RateLimitConfig) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const correlationId = req.headers['x-correlation-id'] as string;
      
      try {
        const key = this.generateKey(req, config.keyGenerator);
        const windowStart = this.getWindowStart(config.windowMs);
        const windowKey = `${key}:${windowStart}`;

        // Get current request count
        const [current, ttl] = await Promise.all([
          this.redis.getClient().get(windowKey),
          this.redis.getClient().ttl(windowKey)
        ]);

        const currentCount = parseInt(current || '0');
        const resetTime = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : config.windowMs));

        // Check if limit exceeded
        if (currentCount >= config.maxRequests) {
          const rateLimitInfo: RateLimitInfo = {
            totalHits: currentCount,
            totalTime: config.windowMs,
            resetTime,
            remaining: 0
          };

          this.setRateLimitHeaders(res, rateLimitInfo, config.headers);

          logger.warning('Rate limit exceeded', {
            operation: 'rate_limit_exceeded',
            correlationId,
            metadata: {
              key,
              currentCount,
              maxRequests: config.maxRequests,
              windowMs: config.windowMs,
              ip: req.ip,
              userAgent: req.get('User-Agent')
            }
          });

          res.status(429).json({
            error: 'Too Many Requests',
            message: config.message || 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(ttl > 0 ? ttl : config.windowMs / 1000),
            limit: config.maxRequests,
            windowMs: config.windowMs,
            correlationId
          });
          return;
        }

        // Track the request
        await this.trackRequest(windowKey, config.windowMs);

        const remaining = Math.max(0, config.maxRequests - (currentCount + 1));
        const rateLimitInfo: RateLimitInfo = {
          totalHits: currentCount + 1,
          totalTime: config.windowMs,
          resetTime,
          remaining
        };

        this.setRateLimitHeaders(res, rateLimitInfo, config.headers);

        // Set up response tracking if needed
        if (config.skipSuccessfulRequests || config.skipFailedRequests) {
          this.setupResponseTracking(req, res, windowKey, config);
        }

        next();

      } catch (error) {
        logger.error('Rate limiter error', error as Error, {
          operation: 'rate_limiter_error',
          correlationId
        });
        
        // On rate limiter error, allow the request through to avoid breaking the service
        next();
      }
    };
  }

  /**
   * Create job submission rate limiter
   */
  public createJobSubmissionLimiter(maxJobsPerMinute: number = 100) {
    return this.createMiddleware({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: maxJobsPerMinute,
      keyGenerator: (req) => `job_submit:${this.getClientIdentifier(req)}`,
      message: 'Job submission rate limit exceeded. Please reduce submission rate.',
      headers: true
    });
  }

  /**
   * Create bulk job submission rate limiter
   */
  public createBulkJobSubmissionLimiter(maxBulkRequestsPerMinute: number = 10) {
    return this.createMiddleware({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: maxBulkRequestsPerMinute,
      keyGenerator: (req) => `bulk_job_submit:${this.getClientIdentifier(req)}`,
      message: 'Bulk job submission rate limit exceeded. Please reduce submission rate.',
      headers: true
    });
  }

  /**
   * Create admin operation rate limiter
   */
  public createAdminLimiter(maxOperationsPerMinute: number = 20) {
    return this.createMiddleware({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: maxOperationsPerMinute,
      keyGenerator: (req) => `admin:${this.getClientIdentifier(req)}`,
      message: 'Admin operation rate limit exceeded.',
      headers: true
    });
  }

  /**
   * Create general API rate limiter
   */
  public createGeneralLimiter(maxRequestsPerMinute: number = 1000) {
    return this.createMiddleware({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: maxRequestsPerMinute,
      keyGenerator: (req) => `api:${this.getClientIdentifier(req)}`,
      headers: true,
      skipSuccessfulRequests: false
    });
  }

  // Private helper methods

  private generateKey(req: Request, keyGenerator?: (req: Request) => string): string {
    if (keyGenerator) {
      return `${this.keyPrefix}${keyGenerator(req)}`;
    }
    return `${this.keyPrefix}${this.getClientIdentifier(req)}`;
  }

  private getClientIdentifier(req: Request): string {
    // Use API key if available, otherwise fall back to IP
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      // Use a hash of the API key to avoid exposing it in logs
      return `api_${this.hashString(apiKey)}`;
    }
    
    return `ip_${req.ip}`;
  }

  private hashString(str: string): string {
    // Simple hash function for API key anonymization
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private getWindowStart(windowMs: number): number {
    const now = Date.now();
    return Math.floor(now / windowMs) * windowMs;
  }

  private async trackRequest(key: string, windowMs: number): Promise<void> {
    const client = this.redis.getClient();
    const pipeline = client.pipeline();
    
    pipeline.incr(key);
    pipeline.pexpire(key, windowMs);
    
    await pipeline.exec();
  }

  private setRateLimitHeaders(res: Response, info: RateLimitInfo, includeHeaders: boolean = true): void {
    if (!includeHeaders) return;

    res.set({
      'X-RateLimit-Limit': info.totalTime.toString(),
      'X-RateLimit-Remaining': info.remaining.toString(),
      'X-RateLimit-Reset': info.resetTime.toISOString(),
      'X-RateLimit-Used': info.totalHits.toString()
    });
  }

  private setupResponseTracking(
    req: Request,
    res: Response,
    windowKey: string,
    config: RateLimitConfig
  ): void {
    const originalSend = res.send;
    const originalJson = res.json;

    const trackResponse = async () => {
      const shouldSkip = (
        (config.skipSuccessfulRequests && res.statusCode >= 200 && res.statusCode < 300) ||
        (config.skipFailedRequests && (res.statusCode >= 400 || res.statusCode >= 500))
      );

      if (shouldSkip) {
        try {
          await this.redis.getClient().decr(windowKey);
        } catch (error) {
          logger.error('Failed to decrement rate limit counter', error as Error, {
            operation: 'rate_limit_decr_error',
            metadata: { windowKey }
          });
        }
      }
    };

    res.send = function(body) {
      trackResponse().finally(() => {
        originalSend.call(this, body);
      });
      return this;
    };

    res.json = function(obj) {
      trackResponse().finally(() => {
        originalJson.call(this, obj);
      });
      return this;
    };
  }

  /**
   * Get current rate limit status for a key
   */
  public async getRateLimitStatus(req: Request, keyGenerator?: (req: Request) => string): Promise<RateLimitInfo | null> {
    try {
      const key = this.generateKey(req, keyGenerator);
      const windowStart = this.getWindowStart(60 * 1000); // Default 1 minute window
      const windowKey = `${key}:${windowStart}`;

      const [current, ttl] = await Promise.all([
        this.redis.getClient().get(windowKey),
        this.redis.getClient().ttl(windowKey)
      ]);

      const currentCount = parseInt(current || '0');
      const resetTime = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : 60 * 1000));

      return {
        totalHits: currentCount,
        totalTime: 60 * 1000,
        resetTime,
        remaining: Math.max(0, 100 - currentCount) // Default limit of 100
      };

    } catch (error) {
      logger.error('Failed to get rate limit status', error as Error);
      return null;
    }
  }

  /**
   * Clear rate limit for a specific key
   */
  public async clearRateLimit(req: Request, keyGenerator?: (req: Request) => string): Promise<void> {
    try {
      const key = this.generateKey(req, keyGenerator);
      const pattern = `${key}:*`;
      
      const keys = await this.redis.getClient().keys(pattern);
      if (keys.length > 0) {
        await this.redis.getClient().del(...keys);
      }
      
      logger.info('Rate limit cleared', {
        operation: 'rate_limit_cleared',
        metadata: { key, keysCleared: keys.length }
      });

    } catch (error) {
      logger.error('Failed to clear rate limit', error as Error);
      throw error;
    }
  }
}