"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = void 0;
class MetricsCollector {
    static instance;
    startTime;
    metrics;
    constructor() {
        this.startTime = Date.now();
        this.metrics = {
            cache: {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
                errors: 0,
                responseTimes: []
            },
            api: {
                requests: 0,
                errors: 0,
                responseTimes: [],
                statusCodes: new Map(),
                endpoints: new Map()
            },
            system: {
                memoryUsage: 0,
                keyCount: 0,
                dataSize: 0,
                connectionCount: 0
            },
            performance: {
                operationTimes: [],
                concurrentOps: 0
            }
        };
        // Start periodic cleanup of response times arrays
        this.startCleanup();
    }
    static getInstance() {
        if (!MetricsCollector.instance) {
            MetricsCollector.instance = new MetricsCollector();
        }
        return MetricsCollector.instance;
    }
    // Cache Metrics
    recordCacheHit(key, dataSize, responseTime) {
        this.metrics.cache.hits++;
        this.metrics.cache.responseTimes.push(responseTime);
        this.trimResponseTimes(this.metrics.cache.responseTimes);
    }
    recordCacheMiss(key) {
        this.metrics.cache.misses++;
    }
    recordCacheSet(key, dataSize, ttl) {
        this.metrics.cache.sets++;
        this.metrics.system.dataSize += dataSize;
        this.metrics.system.keyCount++;
    }
    recordCacheDelete(key) {
        this.metrics.cache.deletes++;
        this.metrics.system.keyCount = Math.max(0, this.metrics.system.keyCount - 1);
    }
    recordCacheError(operation, key, error) {
        this.metrics.cache.errors++;
        console.error(`Cache error in ${operation} for key ${key}: ${error}`);
    }
    // API Metrics
    recordAPICall(method, path, statusCode, responseTime) {
        this.metrics.api.requests++;
        this.metrics.api.responseTimes.push(responseTime);
        // Record status code
        const currentCount = this.metrics.api.statusCodes.get(statusCode) || 0;
        this.metrics.api.statusCodes.set(statusCode, currentCount + 1);
        // Record endpoint metrics
        const endpoint = `${method} ${path}`;
        const endpointStats = this.metrics.api.endpoints.get(endpoint) || {
            count: 0,
            totalTime: 0,
            errors: 0
        };
        endpointStats.count++;
        endpointStats.totalTime += responseTime;
        if (statusCode >= 400) {
            endpointStats.errors++;
            this.metrics.api.errors++;
        }
        this.metrics.api.endpoints.set(endpoint, endpointStats);
        // Trim response times array
        this.trimResponseTimes(this.metrics.api.responseTimes);
    }
    recordApiError(errorType, error) {
        this.metrics.api.errors++;
        console.error(`API error (${errorType}):`, error);
    }
    // System Metrics
    recordSystemStats(stats) {
        if (stats.memory && stats.memory.used_memory) {
            this.metrics.system.memoryUsage = parseInt(stats.memory.used_memory) || 0;
        }
        if (stats.keyCount !== undefined) {
            this.metrics.system.keyCount = stats.keyCount;
        }
        if (stats.connectionCount !== undefined) {
            this.metrics.system.connectionCount = stats.connectionCount;
        }
    }
    // Performance Metrics
    recordOperationTime(operationType, duration) {
        this.metrics.performance.operationTimes.push(duration);
        this.trimResponseTimes(this.metrics.performance.operationTimes);
    }
    incrementConcurrentOperations() {
        this.metrics.performance.concurrentOps++;
    }
    decrementConcurrentOperations() {
        this.metrics.performance.concurrentOps = Math.max(0, this.metrics.performance.concurrentOps - 1);
    }
    // Metric Retrieval
    getCacheMetrics() {
        const totalOps = this.metrics.cache.hits + this.metrics.cache.misses;
        const hitRate = totalOps > 0 ? this.metrics.cache.hits / totalOps : 0;
        const missRate = totalOps > 0 ? this.metrics.cache.misses / totalOps : 0;
        const avgResponseTime = this.calculateAverage(this.metrics.cache.responseTimes);
        return {
            hits: this.metrics.cache.hits,
            misses: this.metrics.cache.misses,
            sets: this.metrics.cache.sets,
            deletes: this.metrics.cache.deletes,
            errors: this.metrics.cache.errors,
            hitRate,
            missRate,
            totalOperations: totalOps,
            averageResponseTime: avgResponseTime
        };
    }
    getPerformanceMetrics() {
        const uptime = (Date.now() - this.startTime) / 1000; // seconds
        const totalOps = this.metrics.cache.hits + this.metrics.cache.misses + this.metrics.cache.sets;
        const opsPerSecond = uptime > 0 ? totalOps / uptime : 0;
        const allTimes = this.metrics.performance.operationTimes;
        const avgTime = this.calculateAverage(allTimes);
        const p50 = this.calculatePercentile(allTimes, 0.5);
        const p95 = this.calculatePercentile(allTimes, 0.95);
        const p99 = this.calculatePercentile(allTimes, 0.99);
        return {
            operationsPerSecond: opsPerSecond,
            averageOperationTime: avgTime,
            p50ResponseTime: p50,
            p95ResponseTime: p95,
            p99ResponseTime: p99,
            concurrentOperations: this.metrics.performance.concurrentOps
        };
    }
    getSystemMetrics() {
        const uptime = (Date.now() - this.startTime) / 1000; // seconds
        const memoryUtilization = this.metrics.system.memoryUsage > 0 ?
            (this.metrics.system.dataSize / this.metrics.system.memoryUsage) : 0;
        return {
            memoryUsage: this.metrics.system.memoryUsage,
            memoryUtilization,
            keyCount: this.metrics.system.keyCount,
            dataSize: this.metrics.system.dataSize,
            connectionCount: this.metrics.system.connectionCount,
            uptime
        };
    }
    getAPIMetrics() {
        const uptime = (Date.now() - this.startTime) / 1000; // seconds
        const requestsPerSecond = uptime > 0 ? this.metrics.api.requests / uptime : 0;
        const avgResponseTime = this.calculateAverage(this.metrics.api.responseTimes);
        const statusCodes = {};
        for (const [code, count] of this.metrics.api.statusCodes.entries()) {
            statusCodes[code] = count;
        }
        const endpoints = {};
        for (const [endpoint, stats] of this.metrics.api.endpoints.entries()) {
            endpoints[endpoint] = {
                count: stats.count,
                avgTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
                errors: stats.errors
            };
        }
        return {
            requestCount: this.metrics.api.requests,
            errorCount: this.metrics.api.errors,
            averageResponseTime: avgResponseTime,
            requestsPerSecond,
            statusCodes,
            endpoints
        };
    }
    getFullMetrics() {
        return {
            timestamp: Date.now(),
            cache: this.getCacheMetrics(),
            performance: this.getPerformanceMetrics(),
            system: this.getSystemMetrics(),
            api: this.getAPIMetrics()
        };
    }
    // Health and Status
    getHealthStatus() {
        const uptime = (Date.now() - this.startTime) / 1000;
        const totalRequests = this.metrics.api.requests;
        const errorRate = totalRequests > 0 ? this.metrics.api.errors / totalRequests : 0;
        const responseTime = this.calculateAverage(this.metrics.api.responseTimes);
        const healthy = errorRate < 0.1 && responseTime < 1000; // Less than 10% errors and 1s response time
        return {
            healthy,
            uptime,
            errorRate,
            responseTime,
            memoryUsage: this.metrics.system.memoryUsage
        };
    }
    // Reset and Maintenance
    reset() {
        this.startTime = Date.now();
        this.metrics = {
            cache: {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
                errors: 0,
                responseTimes: []
            },
            api: {
                requests: 0,
                errors: 0,
                responseTimes: [],
                statusCodes: new Map(),
                endpoints: new Map()
            },
            system: {
                memoryUsage: 0,
                keyCount: 0,
                dataSize: 0,
                connectionCount: 0
            },
            performance: {
                operationTimes: [],
                concurrentOps: 0
            }
        };
    }
    exportMetrics() {
        const metrics = this.getFullMetrics();
        return JSON.stringify(metrics, null, 2);
    }
    // Private helper methods
    calculateAverage(numbers) {
        if (numbers.length === 0)
            return 0;
        return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    }
    calculatePercentile(numbers, percentile) {
        if (numbers.length === 0)
            return 0;
        const sorted = [...numbers].sort((a, b) => a - b);
        const index = Math.floor(percentile * (sorted.length - 1));
        return sorted[index] || 0;
    }
    trimResponseTimes(array, maxSize = 1000) {
        if (array.length > maxSize) {
            array.splice(0, array.length - maxSize);
        }
    }
    startCleanup() {
        // Clean up response times arrays every 5 minutes
        setInterval(() => {
            this.trimResponseTimes(this.metrics.cache.responseTimes);
            this.trimResponseTimes(this.metrics.api.responseTimes);
            this.trimResponseTimes(this.metrics.performance.operationTimes);
        }, 5 * 60 * 1000);
    }
    // Additional utility methods for monitoring
    getTopEndpoints(limit = 10) {
        const endpoints = Array.from(this.metrics.api.endpoints.entries())
            .map(([endpoint, stats]) => ({
            endpoint,
            count: stats.count,
            avgTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
            errorRate: stats.count > 0 ? stats.errors / stats.count : 0
        }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
        return endpoints;
    }
    getErrorSummary() {
        const totalOps = this.metrics.cache.hits + this.metrics.cache.misses + this.metrics.cache.sets;
        const totalErrors = this.metrics.cache.errors + this.metrics.api.errors;
        const errorRate = totalOps > 0 ? totalErrors / totalOps : 0;
        return {
            totalErrors,
            errorRate,
            cacheErrors: this.metrics.cache.errors,
            apiErrors: this.metrics.api.errors,
            recentErrors: totalErrors // Simplified - would track recent window in production
        };
    }
}
exports.MetricsCollector = MetricsCollector;
//# sourceMappingURL=metrics-collector.js.map