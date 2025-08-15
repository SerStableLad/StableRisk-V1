/**
 * Rate Limiting Middleware
 *
 * Provides configurable rate limiting for API endpoints using Redis
 */
import { Request, Response, NextFunction } from 'express';
interface RateLimitConfig {
    windowMs: number;
    maxRequests: number;
    keyGenerator?: (req: Request) => string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    message?: string;
    headers?: boolean;
}
interface RateLimitInfo {
    totalHits: number;
    totalTime: number;
    resetTime: Date;
    remaining: number;
}
export declare class RateLimiter {
    private redis;
    private keyPrefix;
    constructor();
    /**
     * Create rate limiting middleware
     */
    createMiddleware(config: RateLimitConfig): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * Create job submission rate limiter
     */
    createJobSubmissionLimiter(maxJobsPerMinute?: number): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * Create bulk job submission rate limiter
     */
    createBulkJobSubmissionLimiter(maxBulkRequestsPerMinute?: number): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * Create admin operation rate limiter
     */
    createAdminLimiter(maxOperationsPerMinute?: number): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * Create general API rate limiter
     */
    createGeneralLimiter(maxRequestsPerMinute?: number): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    private generateKey;
    private getClientIdentifier;
    private hashString;
    private getWindowStart;
    private trackRequest;
    private setRateLimitHeaders;
    private setupResponseTracking;
    /**
     * Get current rate limit status for a key
     */
    getRateLimitStatus(req: Request, keyGenerator?: (req: Request) => string): Promise<RateLimitInfo | null>;
    /**
     * Clear rate limit for a specific key
     */
    clearRateLimit(req: Request, keyGenerator?: (req: Request) => string): Promise<void>;
}
export {};
//# sourceMappingURL=rate-limiter.d.ts.map