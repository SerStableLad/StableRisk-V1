"use strict";
/**
 * Cache Invalidation Job Handler
 *
 * Handles cache invalidation jobs to maintain data consistency
 * across the application when underlying data changes with enhanced
 * error handling, batch processing, and monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheInvalidator = void 0;
const base_handler_1 = require("./base-handler");
class CacheInvalidator extends base_handler_1.BaseHandler {
    constructor(config = {}) {
        super({
            timeoutMs: 60000, // 1 minute for cache operations
            retries: 3, // Cache operations should be retryable
            enableMetrics: true,
            enableCircuitBreaker: true,
            circuitBreakerThreshold: 0.2, // Be strict about cache failures
            ...config
        });
        this.maxKeysPerBatch = 50;
        this.maxPatternMatches = 1000;
    }
    async executeJob(job, logger) {
        const { pattern, keys = [], cascade = false } = job.data;
        // Validate input parameters
        if (!pattern && keys.length === 0) {
            throw new Error('Either pattern or keys must be provided');
        }
        if (keys.length > this.maxKeysPerBatch * 10) {
            throw new Error(`Too many keys specified. Maximum: ${this.maxKeysPerBatch * 10}`);
        }
        logger.info('Starting cache invalidation', {
            operation: 'cache_invalidation',
            metadata: {
                hasPattern: !!pattern,
                explicitKeyCount: keys.length,
                cascadeEnabled: cascade
            }
        });
        const results = {
            invalidated_keys: [],
            failed_keys: [],
            errors: [],
            cascade_operations: [],
            performance: {
                patternProcessingMs: 0,
                keyProcessingMs: 0,
                cascadeProcessingMs: 0
            }
        };
        // Process pattern-based invalidation
        if (pattern) {
            const patternStart = Date.now();
            try {
                const patternResults = await this.invalidateByPattern(pattern, logger);
                results.invalidated_keys.push(...patternResults.invalidated);
                results.failed_keys.push(...patternResults.failed);
                results.errors.push(...patternResults.errors);
                results.performance.patternProcessingMs = Date.now() - patternStart;
            }
            catch (error) {
                results.errors.push(`Pattern invalidation failed: ${error.message}`);
                results.performance.patternProcessingMs = Date.now() - patternStart;
            }
        }
        // Process specific key invalidations
        if (keys.length > 0) {
            const keyStart = Date.now();
            try {
                const keyResults = await this.invalidateSpecificKeys(keys, logger);
                results.invalidated_keys.push(...keyResults.invalidated);
                results.failed_keys.push(...keyResults.failed);
                results.errors.push(...keyResults.errors);
                results.performance.keyProcessingMs = Date.now() - keyStart;
            }
            catch (error) {
                results.errors.push(`Key invalidation failed: ${error.message}`);
                results.performance.keyProcessingMs = Date.now() - keyStart;
            }
        }
        // Process cascade operations
        if (cascade && results.invalidated_keys.length > 0) {
            const cascadeStart = Date.now();
            try {
                const cascadeResults = await this.performCascadeInvalidation([...results.invalidated_keys], logger);
                results.cascade_operations.push(...cascadeResults.operations);
                results.invalidated_keys.push(...cascadeResults.additional_invalidated);
                results.performance.cascadeProcessingMs = Date.now() - cascadeStart;
            }
            catch (error) {
                results.errors.push(`Cascade invalidation failed: ${error.message}`);
                results.performance.cascadeProcessingMs = Date.now() - cascadeStart;
            }
        }
        const finalResults = {
            ...results,
            summary: {
                totalKeysProcessed: results.invalidated_keys.length + results.failed_keys.length,
                successfulInvalidations: results.invalidated_keys.length,
                failedInvalidations: results.failed_keys.length,
                cascadeOperations: results.cascade_operations.length,
                successRate: results.invalidated_keys.length /
                    (results.invalidated_keys.length + results.failed_keys.length) || 0
            }
        };
        logger.info('Cache invalidation completed', {
            operation: 'cache_invalidation_complete',
            metadata: {
                successful: finalResults.summary.successfulInvalidations,
                failed: finalResults.summary.failedInvalidations,
                cascadeOps: finalResults.summary.cascadeOperations,
                successRate: Math.round(finalResults.summary.successRate * 100)
            }
        });
        return this.createResult(finalResults, {
            invalidationStrategy: pattern ? 'pattern-based' : 'key-specific',
            batchProcessed: keys.length > this.maxKeysPerBatch,
            cascadeEnabled: cascade
        });
    }
    async invalidateByPattern(pattern, logger) {
        logger.debug(`Invalidating cache by pattern: ${pattern}`);
        const results = {
            invalidated: [],
            failed: [],
            errors: []
        };
        try {
            // Simulate pattern matching and key discovery
            await this.delay(Math.random() * 1000 + 500);
            const matchingKeys = await this.findKeysByPattern(pattern);
            logger.debug(`Found ${matchingKeys.length} keys matching pattern: ${pattern}`);
            // Invalidate each matching key
            for (const key of matchingKeys) {
                try {
                    const success = await this.invalidateSingleKey(key, logger);
                    if (success) {
                        results.invalidated.push(key);
                    }
                    else {
                        results.failed.push(key);
                        results.errors.push(`Failed to invalidate key: ${key}`);
                    }
                }
                catch (error) {
                    results.failed.push(key);
                    results.errors.push(`Error invalidating ${key}: ${error.message}`);
                }
            }
        }
        catch (error) {
            results.errors.push(`Pattern matching failed: ${error.message}`);
        }
        return results;
    }
    async invalidateSpecificKeys(keys, logger) {
        logger.debug(`Invalidating ${keys.length} specific keys`);
        // Sanitize input keys
        const { valid: validKeys, invalid: invalidKeys } = this.sanitizeCacheKeys(keys);
        const results = {
            invalidated: [],
            failed: [...invalidKeys], // Invalid keys are automatically failed
            errors: invalidKeys.map(key => `Invalid key format: ${key}`)
        };
        if (validKeys.length === 0) {
            return results;
        }
        // Estimate impact and adjust batch size
        const impact = this.estimateInvalidationImpact(validKeys);
        const batchSize = Math.min(impact.recommendedBatchSize, this.maxKeysPerBatch);
        logger.info(`Processing ${validKeys.length} valid keys in batches of ${batchSize}`, {
            metadata: {
                riskLevel: impact.riskLevel,
                affectedSystems: impact.estimatedAffectedSystems,
                totalBatches: Math.ceil(validKeys.length / batchSize)
            }
        });
        // Process keys in optimized batches
        for (let i = 0; i < validKeys.length; i += batchSize) {
            const batch = validKeys.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(validKeys.length / batchSize);
            logger.debug(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} keys)`);
            const batchOperations = batch.map(key => () => this.invalidateSingleKey(key, logger));
            const batchResults = await this.executeInParallel(batchOperations, batch);
            // Process successful results
            batchResults.results.forEach((_, index) => {
                results.invalidated.push(batch[index]);
            });
            // Process errors
            batchResults.errors.forEach(error => {
                results.failed.push(error.operation);
                results.errors.push(`${error.operation}: ${error.error}`);
            });
            // Add small delay between batches for high-risk operations
            if (impact.riskLevel === 'high' && i + batchSize < validKeys.length) {
                await this.delay(100); // 100ms delay
            }
        }
        return results;
    }
    async performCascadeInvalidation(invalidatedKeys, logger) {
        logger.debug(`Performing cascade invalidation for ${invalidatedKeys.length} keys`);
        const results = {
            operations: [],
            additional_invalidated: []
        };
        // Simulate cascade logic based on key patterns
        for (const key of invalidatedKeys) {
            const cascadeKeys = await this.determineCascadeKeys(key);
            if (cascadeKeys.length > 0) {
                results.operations.push(`Cascade from ${key} -> ${cascadeKeys.length} dependent keys`);
                // Invalidate cascade keys
                for (const cascadeKey of cascadeKeys) {
                    try {
                        const success = await this.invalidateSingleKey(cascadeKey, logger);
                        if (success) {
                            results.additional_invalidated.push(cascadeKey);
                        }
                    }
                    catch (error) {
                        logger.warn(`Cascade invalidation failed for ${cascadeKey}`, {
                            metadata: { originalKey: key, error: error.message }
                        });
                    }
                }
            }
        }
        return results;
    }
    async findKeysByPattern(pattern) {
        // Simulate Redis SCAN or similar pattern matching
        await this.delay(Math.random() * 500 + 200);
        const mockKeys = [
            `stablecoin:${pattern}:price`,
            `stablecoin:${pattern}:market_data`,
            `stablecoin:${pattern}:transparency`,
            `stablecoin:${pattern}:liquidity`,
            `api:${pattern}:response`,
            `metrics:${pattern}:daily`,
            `metrics:${pattern}:weekly`
        ];
        // Filter keys based on pattern (simple simulation)
        return mockKeys.filter(key => {
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(key);
            }
            return key.includes(pattern);
        });
    }
    async invalidateSingleKey(key, logger) {
        // Simulate cache invalidation operation
        await this.delay(Math.random() * 100 + 50);
        // Simulate 95% success rate
        const success = Math.random() > 0.05;
        if (success) {
            logger.trace(`Invalidated cache key: ${key}`);
        }
        else {
            logger.warn(`Failed to invalidate cache key: ${key}`);
        }
        return success;
    }
    async determineCascadeKeys(originalKey) {
        await this.delay(50); // Quick operation
        const cascadeRules = {
            // If price data changes, invalidate summary and chart data
            'price': ['summary', 'chart', 'api_response'],
            // If transparency data changes, invalidate risk scores and analysis
            'transparency': ['risk_score', 'analysis', 'dashboard'],
            // If market data changes, invalidate aggregated metrics
            'market_data': ['metrics', 'rankings', 'comparisons'],
            // If liquidity data changes, invalidate trading related caches
            'liquidity': ['trading', 'dex_data', 'arbitrage']
        };
        const cascadeKeys = [];
        // Extract key components to determine cascade rules
        for (const [trigger, targets] of Object.entries(cascadeRules)) {
            if (originalKey.includes(trigger)) {
                // Extract ticker/identifier from original key
                const parts = originalKey.split(':');
                const identifier = parts[1] || 'unknown';
                // Generate cascade keys
                for (const target of targets) {
                    cascadeKeys.push(`${identifier}:${target}:cache`);
                }
            }
        }
        return cascadeKeys;
    }
    /**
     * Validate cache key format
     */
    isValidCacheKey(key) {
        // Basic validation for cache key format
        return key.length > 0 && key.length <= 250 && !/[\s\n\r\t]/.test(key);
    }
    /**
     * Sanitize cache keys
     */
    sanitizeCacheKeys(keys) {
        const valid = [];
        const invalid = [];
        keys.forEach(key => {
            if (this.isValidCacheKey(key)) {
                valid.push(key);
            }
            else {
                invalid.push(key);
            }
        });
        return { valid, invalid };
    }
    /**
     * Estimate invalidation impact
     */
    estimateInvalidationImpact(keys) {
        const affectedSystems = new Set();
        // Analyze key patterns to determine affected systems
        keys.forEach(key => {
            const parts = key.split(':');
            if (parts.length > 1) {
                affectedSystems.add(parts[0]); // System prefix
            }
        });
        const systemCount = affectedSystems.size;
        let riskLevel;
        let recommendedBatchSize;
        if (keys.length > 100 || systemCount > 5) {
            riskLevel = 'high';
            recommendedBatchSize = 10;
        }
        else if (keys.length > 50 || systemCount > 2) {
            riskLevel = 'medium';
            recommendedBatchSize = 25;
        }
        else {
            riskLevel = 'low';
            recommendedBatchSize = 50;
        }
        return {
            estimatedAffectedSystems: Array.from(affectedSystems),
            riskLevel,
            recommendedBatchSize
        };
    }
}
exports.CacheInvalidator = CacheInvalidator;
//# sourceMappingURL=cache-invalidator.js.map