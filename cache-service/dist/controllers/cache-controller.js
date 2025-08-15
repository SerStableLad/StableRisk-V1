"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheController = void 0;
const express_1 = require("express");
const cache_manager_1 = require("../cache/cache-manager");
class CacheController {
    static routes() {
        const router = (0, express_1.Router)();
        // Set cache entry
        router.post('/set', async (req, res) => {
            try {
                const { key, value, options = {} } = req.body;
                // Basic validation
                if (!key || value === undefined) {
                    return res.status(400).json({
                        error: 'Key and value are required'
                    });
                }
                if (typeof key !== 'string' || key.trim() === '') {
                    return res.status(400).json({
                        error: 'Key must be a non-empty string'
                    });
                }
                // Check for circular references by attempting JSON serialization
                try {
                    JSON.stringify(value);
                }
                catch (jsonError) {
                    if (jsonError.message.includes('circular') || jsonError.message.includes('Converting circular structure')) {
                        return res.status(400).json({
                            error: 'Value contains circular references and cannot be cached'
                        });
                    }
                    // Re-throw other JSON errors
                    throw jsonError;
                }
                const result = await cache_manager_1.CacheManager.getInstance().set(key, value, options);
                res.status(201).json({
                    success: result,
                    key,
                    message: result ? 'Cache entry set successfully' : 'Failed to set cache entry'
                });
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Get cache entry
        router.get('/get/:key', async (req, res) => {
            try {
                const { key } = req.params;
                const decodedKey = decodeURIComponent(key);
                const value = await cache_manager_1.CacheManager.getInstance().get(decodedKey);
                // The CacheManager API design issue: null could mean "not found" or "cached null value"
                // Since tests expect null to be a valid cached value with found: true,
                // we treat all returned values as "found", and rely on CacheManager 
                // to throw exceptions for truly missing keys
                res.json({
                    key: decodedKey,
                    value,
                    found: true
                });
            }
            catch (error) {
                // Check if this is a "not found" error and return 404
                if (error.message && error.message.includes('not found')) {
                    return res.status(404).json({
                        key: req.params.key,
                        found: false,
                        message: 'Cache entry not found'
                    });
                }
                res.status(500).json({ error: error.message });
            }
        });
        // Multi-get cache entries
        router.post('/mget', async (req, res) => {
            try {
                const { keys } = req.body;
                if (!Array.isArray(keys)) {
                    return res.status(400).json({ error: 'keys must be an array' });
                }
                const results = await cache_manager_1.CacheManager.getInstance().mget(keys);
                const found = results.filter(r => r.value !== null);
                const missing = results.filter(r => r.value === null).map(r => r.key);
                res.json({
                    results,
                    found: found.length,
                    missing: missing.length,
                    missingKeys: missing
                });
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Delete cache entry
        router.delete('/delete/:key', async (req, res) => {
            try {
                const { key } = req.params;
                const decodedKey = decodeURIComponent(key);
                const result = await cache_manager_1.CacheManager.getInstance().delete(decodedKey);
                res.json({
                    success: result,
                    key: decodedKey,
                    message: result ? 'Cache entry deleted' : 'Failed to delete cache entry'
                });
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Invalidate by tag
        router.post('/invalidate/tag', async (req, res) => {
            try {
                const { tag } = req.body;
                if (!tag || typeof tag !== 'string' || tag.trim() === '') {
                    return res.status(400).json({
                        error: 'Tag must be a non-empty string'
                    });
                }
                const invalidatedKeys = await cache_manager_1.CacheManager.getInstance().invalidateByTag(tag);
                res.json({
                    tag,
                    invalidatedCount: invalidatedKeys.length,
                    invalidatedKeys
                });
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Invalidate by pattern
        router.post('/invalidate/pattern', async (req, res) => {
            try {
                const { pattern } = req.body;
                if (!pattern || typeof pattern !== 'string' || pattern.trim() === '') {
                    return res.status(400).json({
                        error: 'Pattern must be a non-empty string'
                    });
                }
                const invalidatedKeys = await cache_manager_1.CacheManager.getInstance().invalidateByPattern(pattern);
                res.json({
                    pattern,
                    invalidatedCount: invalidatedKeys.length,
                    invalidatedKeys
                });
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Get cache statistics
        router.get('/stats', async (req, res) => {
            try {
                const stats = await cache_manager_1.CacheManager.getInstance().getStats();
                res.json(stats);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Bulk operations
        router.post('/bulk/set', async (req, res) => {
            try {
                const { entries } = req.body;
                if (!Array.isArray(entries)) {
                    return res.status(400).json({ error: 'entries must be an array' });
                }
                // If entries is empty, return immediately
                if (entries.length === 0) {
                    return res.json({
                        total: 0,
                        successful: 0,
                        failed: 0,
                        message: 'Bulk set completed: 0 successful, 0 failed'
                    });
                }
                const results = await Promise.allSettled(entries.map(entry => cache_manager_1.CacheManager.getInstance().set(entry.key, entry.value, entry.options)));
                const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
                const failed = results.length - successful;
                const rejectedResults = results.filter(r => r.status === 'rejected');
                // If all operations failed with the same error, treat as system error
                if (failed === entries.length && rejectedResults.length > 0) {
                    const firstError = rejectedResults[0];
                    if (firstError.status === 'rejected') {
                        throw new Error(firstError.reason?.message || 'Bulk operation failed');
                    }
                }
                res.json({
                    total: entries.length,
                    successful,
                    failed,
                    message: `Bulk set completed: ${successful} successful, ${failed} failed`
                });
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Add error handling middleware for JSON parsing errors
        router.use((error, req, res, next) => {
            if (error instanceof SyntaxError && 'body' in error) {
                return res.status(400).json({ error: 'Invalid JSON in request body' });
            }
            next(error);
        });
        return router;
    }
}
exports.CacheController = CacheController;
//# sourceMappingURL=cache-controller.js.map