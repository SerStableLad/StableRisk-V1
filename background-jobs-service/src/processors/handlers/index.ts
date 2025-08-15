/**
 * Handler Registry Exports
 * 
 * Central export point for all job handlers and handler infrastructure
 */

// Base handler infrastructure
export { BaseHandler, HandlerRegistry } from './base-handler';
export type { HandlerMetrics, HandlerConfig } from './base-handler';

// Specific job handlers
export { StablecoinDataCollector } from './stablecoin-data-collector';
export { TransparencyAnalyzer } from './transparency-analyzer';
export { CacheInvalidator } from './cache-invalidator';
export { MetricsAggregator } from './metrics-aggregator';

// Import handlers for local use in factory functions
import { StablecoinDataCollector } from './stablecoin-data-collector';
import { TransparencyAnalyzer } from './transparency-analyzer';
import { CacheInvalidator } from './cache-invalidator';
import { MetricsAggregator } from './metrics-aggregator';
import { HandlerRegistry } from './base-handler';

// Handler factory function for easy instantiation
export function createDefaultHandlers(): Record<string, any> {
  return {
    'collect-stablecoin-data': new StablecoinDataCollector({
      timeoutMs: 180000,
      retries: 2,
      enableMetrics: true
    }),
    'analyze-transparency': new TransparencyAnalyzer({
      timeoutMs: 300000,
      retries: 2,
      enableMetrics: true
    }),
    'invalidate-cache': new CacheInvalidator({
      timeoutMs: 60000,
      retries: 3,
      enableMetrics: true
    }),
    'aggregate-metrics': new MetricsAggregator({
      timeoutMs: 300000,
      retries: 1,
      enableMetrics: true
    })
  };
}

// Helper function to register all default handlers
export function registerDefaultHandlers(registry: HandlerRegistry): void {
  const handlers = createDefaultHandlers();
  
  Object.entries(handlers).forEach(([jobType, handler]) => {
    registry.register(jobType, handler);
  });
}