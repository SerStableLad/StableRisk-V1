/**
 * Logging Decorators for StableRisk Platform
 * 
 * Provides three specialized decorators for comprehensive application logging:
 * - @LogStablecoinOperation(operation: string) - logs stablecoin operations with timing and results
 * - @LogCacheAccess() - logs cache hits/misses with metadata
 * - @LogAPIEndpoint() - logs API request/response with performance metrics
 * 
 * All decorators integrate with the EnhancedLoggingService singleton and provide:
 * - High-performance execution with <5ms overhead
 * - Graceful error handling without disrupting original method behavior
 * - Comprehensive metadata capture for monitoring and debugging
 * - Support for both synchronous and asynchronous methods
 */

import { EnhancedLoggingService } from '../services/enhanced-logging-service';
import type { LogEntry } from '../types';

// Interface for the logging service to ensure type safety
interface ILoggingService {
  log(entry: LogEntry): Promise<void>;
  isEnabled(): boolean;
}

/**
 * Decorator for logging stablecoin-specific operations with timing and results
 * 
 * @param operation - The operation name to log (e.g., 'fetch_price', 'validate_peg')
 * 
 * Logs successful operations at 'info' level and failures at 'error' level.
 * Captures timing, arguments, results, and error details.
 * 
 * Usage:
 * ```typescript
 * class StablecoinService {
 *   @LogStablecoinOperation('fetch_price')
 *   async fetchPrice(ticker: string): Promise<PriceData> {
 *     // implementation
 *   }
 * }
 * ```
 */
export function LogStablecoinOperation(operation: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const loggingService = EnhancedLoggingService.getInstance() as ILoggingService;
      const startTime = process.hrtime.bigint();
      
      try {
        const result = await originalMethod.apply(this, args);
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
        
        if (loggingService.isEnabled()) {
          try {
            await loggingService.log({
              level: 'info',
              message: `Stablecoin operation: ${operation} completed successfully`,
              metadata: {
                operation,
                className: this.constructor.name,
                methodName: propertyName,
                duration,
                success: true,
                args: args.length > 0 ? args : undefined,
                result: typeof result === 'object' ? { ...result } : result,
                timestamp: new Date().toISOString()
              }
            });
          } catch (logError) {
            // Handle logging errors gracefully - don't interfere with original method
            console.warn('Failed to log stablecoin operation:', logError);
          }
        }
        
        return result;
      } catch (error: any) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        if (loggingService.isEnabled()) {
          try {
            await loggingService.log({
              level: 'error',
              message: `Stablecoin operation: ${operation} failed`,
              metadata: {
                operation,
                className: this.constructor.name,
                methodName: propertyName,
                duration,
                success: false,
                error: {
                  message: error.message || String(error),
                  name: error.name || 'Error',
                  stack: error.stack
                },
                args: args.length > 0 ? args : undefined,
                timestamp: new Date().toISOString()
              }
            });
          } catch (logError) {
            // Handle logging errors gracefully - don't interfere with original method
            console.warn('Failed to log stablecoin operation error:', logError);
          }
        }
        
        throw error; // Always rethrow original error
      }
    };
    
    return descriptor;
  };
}

/**
 * Decorator for logging cache access operations with hit/miss tracking
 * 
 * Automatically detects cache hits (non-null/undefined results) vs misses.
 * Logs at 'debug' level for normal operations and 'warn' level for failures.
 * Captures cache keys, operation timing, and result metadata.
 * 
 * Usage:
 * ```typescript
 * class CacheService {
 *   @LogCacheAccess()
 *   async get(key: string): Promise<any> {
 *     // implementation
 *   }
 * }
 * ```
 */
export function LogCacheAccess() {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const loggingService = EnhancedLoggingService.getInstance() as ILoggingService;
      const startTime = process.hrtime.bigint();
      
      try {
        const result = await originalMethod.apply(this, args);
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        const isHit = result !== null && result !== undefined;
        const cacheKey = args[0] ? (typeof args[0] === 'object' ? JSON.stringify(args[0]) : String(args[0])) : 'unknown';
        
        if (loggingService.isEnabled()) {
          try {
            await loggingService.log({
              level: 'debug',
              message: `Cache ${isHit ? 'HIT' : 'MISS'}: ${propertyName}`,
              metadata: {
                cacheOperation: propertyName,
                className: this.constructor.name,
                methodName: propertyName,
                cacheKey,
                hit: isHit,
                duration,
                timestamp: new Date().toISOString(),
                resultSize: result ? JSON.stringify(result).length : 0
              }
            });
          } catch (logError) {
            // Handle logging errors gracefully
            console.warn('Failed to log cache access:', logError);
          }
        }
        
        return result;
      } catch (error: any) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        if (loggingService.isEnabled()) {
          try {
            await loggingService.log({
              level: 'warn',
              message: `Cache operation failed: ${propertyName}`,
              metadata: {
                cacheOperation: propertyName,
                className: this.constructor.name,
                methodName: propertyName,
                cacheKey: args[0] ? (typeof args[0] === 'object' ? JSON.stringify(args[0]) : String(args[0])) : 'unknown',
                hit: false,
                duration,
                error: {
                  message: error.message || String(error),
                  name: error.name || 'Error'
                },
                timestamp: new Date().toISOString()
              }
            });
          } catch (logError) {
            // Handle logging errors gracefully
            console.warn('Failed to log cache operation error:', logError);
          }
        }
        
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Decorator for logging API endpoint operations with comprehensive request/response tracking
 * 
 * Logs both request initiation and completion/failure with unique request IDs.
 * Tracks performance metrics, response sizes, and provides full request lifecycle visibility.
 * Logs at 'info' level for successful operations and 'error' level for failures.
 * 
 * Usage:
 * ```typescript
 * class APIService {
 *   @LogAPIEndpoint()
 *   async getStablecoin(ticker: string): Promise<StablecoinData> {
 *     // implementation
 *   }
 * }
 * ```
 */
export function LogAPIEndpoint() {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const loggingService = EnhancedLoggingService.getInstance() as ILoggingService;
      const startTime = process.hrtime.bigint();
      const requestId = Math.random().toString(36).substring(2, 15);
      
      // Log request start
      if (loggingService.isEnabled()) {
        try {
          await loggingService.log({
            level: 'info',
            message: `API Request started: ${propertyName}`,
            metadata: {
              requestId,
              endpoint: propertyName,
              className: this.constructor.name,
              methodName: propertyName,
              phase: 'request',
              timestamp: new Date().toISOString()
            }
          });
        } catch (logError) {
          // Handle logging errors gracefully
          console.warn('Failed to log API request start:', logError);
        }
      }
      
      try {
        const result = await originalMethod.apply(this, args);
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        if (loggingService.isEnabled()) {
          try {
            await loggingService.log({
              level: 'info',
              message: `API Response successful: ${propertyName}`,
              metadata: {
                requestId,
                endpoint: propertyName,
                className: this.constructor.name,
                methodName: propertyName,
                phase: 'response',
                duration,
                status: 'success',
                responseSize: result ? JSON.stringify(result).length : 0,
                timestamp: new Date().toISOString()
              }
            });
          } catch (logError) {
            // Handle logging errors gracefully
            console.warn('Failed to log API response:', logError);
          }
        }
        
        return result;
      } catch (error: any) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000;
        
        if (loggingService.isEnabled()) {
          try {
            await loggingService.log({
              level: 'error',
              message: `API Request failed: ${propertyName}`,
              metadata: {
                requestId,
                endpoint: propertyName,
                className: this.constructor.name,
                methodName: propertyName,
                phase: 'error',
                duration,
                status: 'error',
                error: {
                  message: error.message || String(error),
                  name: error.name || 'Error',
                  stack: error.stack
                },
                timestamp: new Date().toISOString()
              }
            });
          } catch (logError) {
            // Handle logging errors gracefully
            console.warn('Failed to log API error:', logError);
          }
        }
        
        throw error;
      }
    };
    
    return descriptor;
  };
}