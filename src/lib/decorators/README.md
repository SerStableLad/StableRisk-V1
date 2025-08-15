# Logging Decorators

This module provides three specialized TypeScript decorators for comprehensive application logging in the StableRisk platform:

## Available Decorators

### @LogStablecoinOperation(operation: string)
Logs stablecoin-specific operations with timing and results.

**Features:**
- Logs successful operations at 'info' level
- Logs failures at 'error' level  
- Captures timing, arguments, results, and error details
- Includes operation name in metadata

**Usage:**
```typescript
import { LogStablecoinOperation } from '@/lib/decorators/logging-decorators';

class StablecoinService {
  @LogStablecoinOperation('fetch_price')
  async fetchPrice(ticker: string): Promise<PriceData> {
    // Your implementation
    return { price: 1.0, timestamp: new Date() };
  }

  @LogStablecoinOperation('validate_peg')
  async validatePeg(ticker: string, targetPrice: number): Promise<boolean> {
    // Your implementation
    return Math.abs(price - targetPrice) < 0.01;
  }
}
```

### @LogCacheAccess()
Logs cache access operations with hit/miss tracking.

**Features:**
- Automatically detects cache hits vs misses
- Logs at 'debug' level for normal operations
- Logs at 'warn' level for failures
- Captures cache keys, timing, and result sizes
- Handles complex object keys via JSON serialization

**Usage:**
```typescript
import { LogCacheAccess } from '@/lib/decorators/logging-decorators';

class CacheService {
  @LogCacheAccess()
  async get(key: string): Promise<any> {
    // Your implementation
    return this.cache.get(key);
  }

  @LogCacheAccess()
  async set(key: string, value: any): Promise<void> {
    // Your implementation
    this.cache.set(key, value);
  }

  @LogCacheAccess()
  async invalidate(pattern: string): Promise<number> {
    // Your implementation
    return keysInvalidated;
  }
}
```

### @LogAPIEndpoint()
Logs API endpoint operations with comprehensive request/response tracking.

**Features:**
- Logs request initiation and completion/failure
- Generates unique request IDs for tracing
- Tracks performance metrics and response sizes
- Logs at 'info' level for success, 'error' level for failures
- Provides full request lifecycle visibility

**Usage:**
```typescript
import { LogAPIEndpoint } from '@/lib/decorators/logging-decorators';

class APIService {
  @LogAPIEndpoint()
  async getStablecoin(ticker: string): Promise<StablecoinData> {
    // Your implementation
    return await this.fetchFromProvider(ticker);
  }

  @LogAPIEndpoint()
  async searchStablecoins(query: string): Promise<string[]> {
    // Your implementation
    return this.performSearch(query);
  }
}
```

## Performance Requirements

All decorators are designed with minimal overhead:

- **Execution overhead:** < 5ms per method call
- **Graceful error handling:** Logging failures don't affect original method behavior
- **Efficient processing:** Uses high-resolution timers for accurate measurements
- **Memory efficient:** Uses structured metadata to avoid memory leaks

## Integration with EnhancedLoggingService

The decorators integrate seamlessly with the `EnhancedLoggingService` singleton:

- **Automatic batching:** Logs are batched and processed asynchronously
- **Database persistence:** All logs are stored via the DatabaseIntegrationService
- **Health monitoring:** Respects service enabled/disabled state
- **Error isolation:** Logging failures are handled gracefully without disrupting application flow

## Error Handling

All decorators follow these error handling principles:

1. **Non-intrusive:** Logging errors never affect the original method's behavior
2. **Always rethrow:** Original errors are always re-thrown to preserve application flow
3. **Graceful degradation:** If logging fails, the original method continues normally
4. **Console fallback:** Critical logging errors are logged to console as warnings

## Metadata Structure

Each decorator captures specific metadata relevant to its purpose:

### StablecoinOperation Metadata
```typescript
{
  operation: string,           // The operation name provided
  className: string,           // The class containing the method
  methodName: string,          // The decorated method name
  duration: number,            // Execution time in milliseconds
  success: boolean,            // Whether the operation succeeded
  args?: any[],               // Method arguments (if any)
  result?: any,               // Method result (on success)
  error?: {                   // Error details (on failure)
    message: string,
    name: string,
    stack?: string
  },
  timestamp: string           // ISO timestamp
}
```

### CacheAccess Metadata
```typescript
{
  cacheOperation: string,     // The method name
  className: string,          // The class containing the method
  methodName: string,         // The decorated method name
  cacheKey: string,          // Serialized cache key
  hit: boolean,              // Whether it was a cache hit
  duration: number,          // Execution time in milliseconds
  resultSize: number,        // Size of result in bytes
  timestamp: string,         // ISO timestamp
  error?: {                  // Error details (on failure)
    message: string,
    name: string
  }
}
```

### APIEndpoint Metadata
```typescript
{
  requestId: string,         // Unique request identifier
  endpoint: string,          // The method name
  className: string,         // The class containing the method
  methodName: string,        // The decorated method name
  phase: 'request' | 'response' | 'error', // Request lifecycle phase
  duration?: number,         // Execution time (for response/error)
  status: 'success' | 'error', // Final status (for response/error)
  responseSize?: number,     // Response size in bytes (for response)
  timestamp: string,         // ISO timestamp
  error?: {                  // Error details (on error)
    message: string,
    name: string,
    stack?: string
  }
}
```

## TypeScript Configuration

To use these decorators with the `@` syntax, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Note: The current project configuration may require manual decorator application for testing purposes until decorator support is fully configured.