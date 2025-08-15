import { withDatabaseLogging } from '../database-hooks';

// Create shared mock
const mockLogEvent = jest.fn().mockResolvedValue({});

// Mock the event repository
jest.mock('../../db/repositories/event-repository', () => ({
  EventRepository: jest.fn().mockImplementation(() => ({
    logEvent: mockLogEvent,
  })),
}));

describe('withDatabaseLogging', () => {
  let mockEventRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventRepo = { logEvent: mockLogEvent };
  });

  describe('sync functions', () => {
    it('should wrap sync function and log success', () => {
      const originalFn = jest.fn((x: number, y: number) => x + y);
      const eventConfig = {
        aggregateType: 'test',
        eventType: 'calculation',
        getAggregateId: (x: number, y: number) => `calc_${x}_${y}`,
        getMetadata: (x: number, y: number) => ({ operation: 'add', inputs: [x, y] }),
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      const result = wrappedFn(5, 3);

      expect(originalFn).toHaveBeenCalledWith(5, 3);
      expect(result).toBe(8);
      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'calc_5_3',
        'test',
        'calculation',
        {
          success: true,
          result: 8,
          operation: 'add',
          inputs: [5, 3],
        }
      );
    });

    it('should log object result keys for complex returns', () => {
      const originalFn = jest.fn(() => ({ price: 1.001, volume: 1000000 }));
      const eventConfig = {
        aggregateType: 'stablecoin',
        eventType: 'price_fetch',
        getAggregateId: () => 'USDT',
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      wrappedFn();

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'USDT',
        'stablecoin',
        'price_fetch',
        {
          success: true,
          result: ['price', 'volume'],
        }
      );
    });

    it('should handle sync functions without metadata getter', () => {
      const originalFn = jest.fn(() => 'test result');
      const eventConfig = {
        aggregateType: 'test',
        eventType: 'simple_test',
        getAggregateId: () => 'test_id',
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      wrappedFn();

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'test_id',
        'test',
        'simple_test',
        {
          success: true,
          result: 'test result',
        }
      );
    });

    it('should handle logging errors gracefully for sync functions', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockLogEvent.mockRejectedValueOnce(new Error('Logging failed'));
      
      const originalFn = jest.fn(() => 'result');
      const eventConfig = {
        aggregateType: 'test',
        eventType: 'test',
        getAggregateId: () => 'test',
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      const result = wrappedFn();

      expect(result).toBe('result');
      
      // Wait for async error handling
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log database event:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('async functions', () => {
    it('should wrap async function and log success', async () => {
      const originalFn = jest.fn(async (ticker: string) => ({ 
        price: 1.001, 
        ticker 
      }));
      const eventConfig = {
        aggregateType: 'stablecoin',
        eventType: 'price_fetch',
        getAggregateId: (ticker: string) => ticker,
        getMetadata: (ticker: string) => ({ source: 'test', ticker }),
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      const result = await wrappedFn('USDT');

      expect(originalFn).toHaveBeenCalledWith('USDT');
      expect(result).toEqual({ price: 1.001, ticker: 'USDT' });
      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'USDT',
        'stablecoin',
        'price_fetch',
        {
          success: true,
          result: ['price', 'ticker'],
          source: 'test',
          ticker: 'USDT',
        }
      );
    });

    it('should log async function errors', async () => {
      const originalError = new Error('API failed');
      const originalFn = jest.fn(async () => {
        throw originalError;
      });
      const eventConfig = {
        aggregateType: 'api',
        eventType: 'request',
        getAggregateId: () => 'api_call',
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      
      await expect(wrappedFn()).rejects.toThrow('API failed');
      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'api_call',
        'api',
        'request',
        {
          success: false,
          error: 'API failed',
        }
      );
    });

    it('should handle async logging errors gracefully', async () => {
      mockEventRepo.logEvent.mockRejectedValue(new Error('Logging service down'));
      
      const originalFn = jest.fn(async () => 'success');
      const eventConfig = {
        aggregateType: 'test',
        eventType: 'async_test',
        getAggregateId: () => 'test_id',
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      const result = await wrappedFn();

      expect(result).toBe('success');
      // The logging error should be handled internally
    });

    it('should preserve async function rejection with original error', async () => {
      const originalError = new Error('Business logic error');
      const originalFn = jest.fn(async () => {
        throw originalError;
      });
      const eventConfig = {
        aggregateType: 'business',
        eventType: 'operation',
        getAggregateId: () => 'operation_id',
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      
      await expect(wrappedFn()).rejects.toBe(originalError);
    });
  });

  describe('function signature preservation', () => {
    it('should preserve function parameters and return types', () => {
      const originalFn = (a: string, b: number, c: boolean): { result: string } => ({
        result: `${a}-${b}-${c}`,
      });
      
      const eventConfig = {
        aggregateType: 'test',
        eventType: 'signature_test',
        getAggregateId: () => 'test',
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      const result = wrappedFn('hello', 42, true);

      expect(result).toEqual({ result: 'hello-42-true' });
    });

    it('should work with functions that have no parameters', () => {
      const originalFn = jest.fn(() => 'no params');
      const eventConfig = {
        aggregateType: 'test',
        eventType: 'no_params',
        getAggregateId: () => 'test',
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      const result = wrappedFn();

      expect(result).toBe('no params');
      expect(originalFn).toHaveBeenCalledWith();
    });
  });

  describe('eventConfig variations', () => {
    it('should handle dynamic aggregate IDs', () => {
      const originalFn = jest.fn((ticker: string, action: string) => 'done');
      const eventConfig = {
        aggregateType: 'stablecoin',
        eventType: 'dynamic_operation',
        getAggregateId: (ticker: string, action: string) => `${ticker}_${action}`,
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      wrappedFn('USDT', 'update');

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'USDT_update',
        'stablecoin',
        'dynamic_operation',
        expect.objectContaining({ success: true })
      );
    });

    it('should handle complex metadata extraction', () => {
      const originalFn = jest.fn((config: { ticker: string; options: any }) => 'processed');
      const eventConfig = {
        aggregateType: 'processing',
        eventType: 'complex_process',
        getAggregateId: (config: any) => config.ticker,
        getMetadata: (config: any) => ({
          options_count: Object.keys(config.options).length,
          has_cache: !!config.options.cache,
          processing_mode: config.options.mode || 'default',
        }),
      };

      const wrappedFn = withDatabaseLogging(originalFn, eventConfig);
      wrappedFn({
        ticker: 'FRAX',
        options: { cache: true, mode: 'fast', timeout: 5000 }
      });

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'FRAX',
        'processing',
        'complex_process',
        {
          success: true,
          result: 'processed',
          options_count: 3,
          has_cache: true,
          processing_mode: 'fast',
        }
      );
    });
  });

  describe('promise detection', () => {
    it('should correctly detect promises', async () => {
      const asyncFn = jest.fn(async () => 'async result');
      const eventConfig = {
        aggregateType: 'test',
        eventType: 'promise_test',
        getAggregateId: () => 'test',
      };

      const wrappedFn = withDatabaseLogging(asyncFn, eventConfig);
      const result = await wrappedFn();

      expect(result).toBe('async result');
      expect(mockEventRepo.logEvent).toHaveBeenCalled();
    });

    it('should handle functions that return promise-like objects', async () => {
      const thenable: any = {
        then: jest.fn((resolve: any): any => {
          resolve('thenable result');
          return thenable;
        }),
        catch: jest.fn((reject: any): any => thenable),
      };
      
      const promiseLikeFn = jest.fn(() => thenable);
      
      const eventConfig = {
        aggregateType: 'test',
        eventType: 'thenable_test',
        getAggregateId: () => 'test',
      };

      const wrappedFn = withDatabaseLogging(promiseLikeFn, eventConfig);
      const result = wrappedFn();

      expect(result).toHaveProperty('then');
      expect(typeof result.then).toBe('function');
    });
  });

  describe('integration scenarios', () => {
    it('should support typical stablecoin data fetching pattern', async () => {
      const fetchStablecoinData = jest.fn(async (ticker: string, sources: string[]) => ({
        ticker,
        price: 1.001,
        volume_24h: 1000000000,
        sources_used: sources,
        timestamp: new Date().toISOString(),
      }));

      const eventConfig = {
        aggregateType: 'stablecoin' as const,
        eventType: 'data_aggregation',
        getAggregateId: (ticker: string) => ticker,
        getMetadata: (ticker: string, sources: string[]) => ({
          source_count: sources.length,
          sources: sources.join(','),
          operation_type: 'multi_source_fetch',
        }),
      };

      const wrappedFetch = withDatabaseLogging(fetchStablecoinData, eventConfig);
      const result = await wrappedFetch('USDT', ['coingecko', 'defillama']);

      expect(result.ticker).toBe('USDT');
      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'USDT',
        'stablecoin',
        'data_aggregation',
        expect.objectContaining({
          success: true,
          source_count: 2,
          sources: 'coingecko,defillama',
          operation_type: 'multi_source_fetch',
        })
      );
    });
  });
});