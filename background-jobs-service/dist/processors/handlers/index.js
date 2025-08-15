"use strict";
/**
 * Handler Registry Exports
 *
 * Central export point for all job handlers and handler infrastructure
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsAggregator = exports.CacheInvalidator = exports.TransparencyAnalyzer = exports.StablecoinDataCollector = exports.HandlerRegistry = exports.BaseHandler = void 0;
exports.createDefaultHandlers = createDefaultHandlers;
exports.registerDefaultHandlers = registerDefaultHandlers;
// Base handler infrastructure
var base_handler_1 = require("./base-handler");
Object.defineProperty(exports, "BaseHandler", { enumerable: true, get: function () { return base_handler_1.BaseHandler; } });
Object.defineProperty(exports, "HandlerRegistry", { enumerable: true, get: function () { return base_handler_1.HandlerRegistry; } });
// Specific job handlers
var stablecoin_data_collector_1 = require("./stablecoin-data-collector");
Object.defineProperty(exports, "StablecoinDataCollector", { enumerable: true, get: function () { return stablecoin_data_collector_1.StablecoinDataCollector; } });
var transparency_analyzer_1 = require("./transparency-analyzer");
Object.defineProperty(exports, "TransparencyAnalyzer", { enumerable: true, get: function () { return transparency_analyzer_1.TransparencyAnalyzer; } });
var cache_invalidator_1 = require("./cache-invalidator");
Object.defineProperty(exports, "CacheInvalidator", { enumerable: true, get: function () { return cache_invalidator_1.CacheInvalidator; } });
var metrics_aggregator_1 = require("./metrics-aggregator");
Object.defineProperty(exports, "MetricsAggregator", { enumerable: true, get: function () { return metrics_aggregator_1.MetricsAggregator; } });
// Import handlers for local use in factory functions
const stablecoin_data_collector_2 = require("./stablecoin-data-collector");
const transparency_analyzer_2 = require("./transparency-analyzer");
const cache_invalidator_2 = require("./cache-invalidator");
const metrics_aggregator_2 = require("./metrics-aggregator");
// Handler factory function for easy instantiation
function createDefaultHandlers() {
    return {
        'collect-stablecoin-data': new stablecoin_data_collector_2.StablecoinDataCollector({
            timeoutMs: 180000,
            retries: 2,
            enableMetrics: true
        }),
        'analyze-transparency': new transparency_analyzer_2.TransparencyAnalyzer({
            timeoutMs: 300000,
            retries: 2,
            enableMetrics: true
        }),
        'invalidate-cache': new cache_invalidator_2.CacheInvalidator({
            timeoutMs: 60000,
            retries: 3,
            enableMetrics: true
        }),
        'aggregate-metrics': new metrics_aggregator_2.MetricsAggregator({
            timeoutMs: 300000,
            retries: 1,
            enableMetrics: true
        })
    };
}
// Helper function to register all default handlers
function registerDefaultHandlers(registry) {
    const handlers = createDefaultHandlers();
    Object.entries(handlers).forEach(([jobType, handler]) => {
        registry.register(jobType, handler);
    });
}
//# sourceMappingURL=index.js.map