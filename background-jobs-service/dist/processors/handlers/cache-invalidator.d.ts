/**
 * Cache Invalidation Job Handler
 *
 * Handles cache invalidation jobs to maintain data consistency
 * across the application when underlying data changes with enhanced
 * error handling, batch processing, and monitoring
 */
import { Job } from '../../types';
import { BaseHandler, HandlerConfig } from './base-handler';
export declare class CacheInvalidator extends BaseHandler {
    private readonly maxKeysPerBatch;
    private readonly maxPatternMatches;
    constructor(config?: HandlerConfig);
    protected executeJob(job: Job, logger: any): Promise<any>;
    private invalidateByPattern;
    private invalidateSpecificKeys;
    private performCascadeInvalidation;
    private findKeysByPattern;
    private invalidateSingleKey;
    private determineCascadeKeys;
    /**
     * Validate cache key format
     */
    private isValidCacheKey;
    /**
     * Sanitize cache keys
     */
    private sanitizeCacheKeys;
    /**
     * Estimate invalidation impact
     */
    private estimateInvalidationImpact;
}
//# sourceMappingURL=cache-invalidator.d.ts.map