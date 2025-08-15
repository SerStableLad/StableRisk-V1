/**
 * Job Handlers Integration Tests
 * 
 * Comprehensive tests for all job handlers including error handling,
 * timeout scenarios, and integration patterns
 */

import { Job, JobStatus } from '../types';
import { 
  BaseHandler, 
  HandlerRegistry,
  StablecoinDataCollector,
  TransparencyAnalyzer,
  CacheInvalidator,
  MetricsAggregator
} from '../processors/handlers';

// Mock logger to avoid console output in tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn()
  },
  withJobContext: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn()
  }))
}));

describe('Handler Infrastructure', () => {
  describe('HandlerRegistry', () => {
    let registry: HandlerRegistry;
    let mockHandler: any;

    beforeEach(() => {
      registry = new HandlerRegistry();
      mockHandler = {
        process: jest.fn().mockResolvedValue({ result: 'test' })
      };
    });

    test('should register and retrieve handlers', () => {
      registry.register('test-job', mockHandler);
      
      expect(registry.has('test-job')).toBe(true);
      expect(registry.get('test-job')).toBe(mockHandler);
      expect(registry.getRegisteredTypes()).toContain('test-job');
    });

    test('should unregister handlers', () => {
      registry.register('test-job', mockHandler);
      const removed = registry.unregister('test-job');
      
      expect(removed).toBe(true);
      expect(registry.has('test-job')).toBe(false);
      expect(registry.get('test-job')).toBeUndefined();
    });

    test('should provide registry status', () => {
      registry.register('job1', mockHandler);
      registry.register('job2', mockHandler);
      
      const status = registry.getStatus();
      
      expect(status.totalHandlers).toBe(2);
      expect(status.registeredTypes).toEqual(['job1', 'job2']);
    });
  });
});

describe('StablecoinDataCollector', () => {
  let handler: StablecoinDataCollector;
  let mockJob: Job;

  beforeEach(() => {
    handler = new StablecoinDataCollector({
      timeoutMs: 15000, // Increased timeout for tests
      retries: 1,
      enableMetrics: false // Disable for testing
    });

    mockJob = {
      id: 'test-job-1',
      type: 'collect-stablecoin-data',
      data: {
        ticker: 'USDC',
        sources: ['coingecko', 'transparency', 'dex'],
        urgent: false
      },
      options: {},
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      status: JobStatus.PENDING
    };
  });

  test('should process valid stablecoin data collection job', async () => {
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.ticker).toBe('USDC');
    expect(result.sources).toBeDefined();
    expect(result.metadata.handlerType).toBe('StablecoinDataCollector');
    expect(result.metadata.successfulSources).toBeGreaterThan(0);
  });

  test('should handle missing ticker', async () => {
    mockJob.data = { sources: ['coingecko'] };
    
    await expect(handler.process(mockJob)).rejects.toThrow('Missing required fields: ticker');
  });

  test('should handle invalid sources gracefully', async () => {
    mockJob.data.sources = ['invalid-source', 'coingecko'];
    
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.metadata.successfulSources).toBe(1); // Only coingecko should succeed
  });

  test('should handle empty sources array', async () => {
    mockJob.data.sources = [];
    
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.metadata.successfulSources).toBeGreaterThan(0); // Should use default sources
  });
});

describe('TransparencyAnalyzer', () => {
  let handler: TransparencyAnalyzer;
  let mockJob: Job;

  beforeEach(() => {
    handler = new TransparencyAnalyzer({
      timeoutMs: 15000, // Increased timeout for tests
      retries: 1,
      enableMetrics: false
    });

    mockJob = {
      id: 'test-job-2',
      type: 'analyze-transparency',
      data: {
        ticker: 'USDC',
        url: 'https://example.com/transparency-report',
        schema: { type: 'collateral' }
      },
      options: {},
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      status: JobStatus.PENDING
    };
  });

  test('should process valid transparency analysis job', async () => {
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.ticker).toBe('USDC');
    expect(result.url).toBe('https://example.com/transparency-report');
    expect(result.analysis).toBeDefined();
    expect(result.metadata.handlerType).toBe('TransparencyAnalyzer');
    expect(result.validation).toBeDefined();
  });

  test('should handle missing required fields', async () => {
    mockJob.data = { ticker: 'USDC' }; // Missing url
    
    await expect(handler.process(mockJob)).rejects.toThrow('Missing required fields: url');
  });

  test('should handle invalid URL format', async () => {
    mockJob.data.url = 'not-a-valid-url';
    
    await expect(handler.process(mockJob)).rejects.toThrow('Invalid URL format');
  });

  test('should default to general analysis for unknown schema type', async () => {
    mockJob.data.schema = { type: 'unknown-type' };
    
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.analysis).toBeDefined();
  });

  test('should handle different analysis types', async () => {
    const analysisTypes = ['collateral', 'attestation', 'reserves', 'general'];
    
    for (const type of analysisTypes) {
      mockJob.data.schema = { type };
      const result = await handler.process(mockJob);
      
      expect(result).toBeDefined();
      expect(result.analysis.confidence_score).toBeGreaterThan(0);
    }
  });
});

describe('CacheInvalidator', () => {
  let handler: CacheInvalidator;
  let mockJob: Job;

  beforeEach(() => {
    handler = new CacheInvalidator({
      timeoutMs: 10000, // Increased timeout for tests
      retries: 1,
      enableMetrics: false
    });

    mockJob = {
      id: 'test-job-3',
      type: 'invalidate-cache',
      data: {
        pattern: 'stablecoin:*',
        keys: ['stablecoin:USDC:price', 'stablecoin:USDC:market'],
        cascade: true
      },
      options: {},
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      status: JobStatus.PENDING
    };
  });

  test('should process cache invalidation with pattern', async () => {
    mockJob.data = { pattern: 'stablecoin:USDC:*' };
    
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.invalidated_keys).toBeDefined();
    expect(result.summary.successfulInvalidations).toBeGreaterThan(0);
    expect(result.metadata.handlerType).toBe('CacheInvalidator');
  });

  test('should process cache invalidation with specific keys', async () => {
    mockJob.data = { 
      keys: ['stablecoin:USDC:price', 'stablecoin:USDT:price'] 
    };
    
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.summary.totalKeysProcessed).toBeGreaterThan(0);
  });

  test('should handle cascade invalidation', async () => {
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.cascade_operations).toBeDefined();
    if (result.invalidated_keys.length > 0) {
      expect(result.cascade_operations.length).toBeGreaterThan(0);
    }
  });

  test('should reject job with no pattern or keys', async () => {
    mockJob.data = {};
    
    await expect(handler.process(mockJob)).rejects.toThrow('Either pattern or keys must be provided');
  });

  test('should handle too many keys', async () => {
    mockJob.data = { 
      keys: new Array(1000).fill(0).map((_, i) => `key-${i}`) 
    };
    
    await expect(handler.process(mockJob)).rejects.toThrow('Too many keys specified');
  });

  test('should filter invalid keys', async () => {
    mockJob.data = {
      keys: ['valid-key', '', 'another-valid-key', ' invalid key with spaces ']
    };
    
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.failed_keys).toContain('');
    expect(result.failed_keys).toContain(' invalid key with spaces ');
  });
});

describe('MetricsAggregator', () => {
  let handler: MetricsAggregator;
  let mockJob: Job;

  beforeEach(() => {
    handler = new MetricsAggregator({
      timeoutMs: 10000, // Increased timeout for tests
      retries: 1,
      enableMetrics: false
    });

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

    mockJob = {
      id: 'test-job-4',
      type: 'aggregate-metrics',
      data: {
        startTime,
        endTime,
        aggregationLevel: 'hour',
        metrics: ['api_response_time', 'cache_hit_rate'],
        sources: ['api', 'database']
      },
      options: {},
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      status: JobStatus.PENDING
    };
  });

  test('should process metrics aggregation job', async () => {
    const result = await handler.process(mockJob);
    
    expect(result).toBeDefined();
    expect(result.aggregatedMetrics).toBeDefined();
    expect(result.derivedMetrics).toBeDefined();
    expect(result.summaryStats).toBeDefined();
    expect(result.metadata.handlerType).toBe('MetricsAggregator');
  });

  test('should handle different aggregation levels', async () => {
    const levels = ['minute', 'hour', 'day'];
    
    for (const level of levels) {
      mockJob.data.aggregationLevel = level;
      const result = await handler.process(mockJob);
      
      expect(result).toBeDefined();
      expect(result.timeRange.aggregationLevel).toBe(level);
    }
  });

  test('should validate time range', async () => {
    // Invalid: end time before start time
    mockJob.data.endTime = new Date(mockJob.data.startTime.getTime() - 1000);
    
    await expect(handler.process(mockJob)).rejects.toThrow('End time must be after start time');
  });

  test('should reject time ranges that are too large', async () => {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 400 * 24 * 60 * 60 * 1000); // 400 days
    
    mockJob.data = {
      startTime,
      endTime,
      aggregationLevel: 'day'
    };
    
    await expect(handler.process(mockJob)).rejects.toThrow('Time range too large');
  });

  test('should handle missing required fields', async () => {
    mockJob.data = { aggregationLevel: 'hour' }; // Missing startTime, endTime
    
    await expect(handler.process(mockJob)).rejects.toThrow('Missing required fields');
  });

  test('should generate derived metrics when applicable', async () => {
    mockJob.data.metrics = ['error_rate', 'api_response_time', 'cache_hit_rate'];
    
    const result = await handler.process(mockJob);
    
    expect(result.derivedMetrics).toBeDefined();
    expect(result.derivedMetrics.length).toBeGreaterThan(0);
  });
});

describe('Error Handling and Circuit Breaker', () => {
  let handler: StablecoinDataCollector;

  beforeEach(() => {
    handler = new StablecoinDataCollector({
      timeoutMs: 5000, // Reasonable timeout for metrics test
      retries: 1,
      enableMetrics: true,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 0.5
    });
  });

  test('should track metrics correctly', async () => {
    const mockJob: Job = {
      id: 'test-job-metrics',
      type: 'collect-stablecoin-data',
      data: { ticker: 'USDC', sources: ['coingecko'] },
      options: {},
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      status: JobStatus.PENDING
    };

    // Process a successful job
    await handler.process(mockJob);

    const metrics = handler.getMetrics();
    expect(metrics.totalProcessed).toBe(1);
    expect(metrics.totalFailed).toBe(0);
    expect(metrics.averageProcessingTime).toBeGreaterThan(0);
  });

  test('should reset metrics', async () => {
    const mockJob: Job = {
      id: 'test-job-reset',
      type: 'collect-stablecoin-data',
      data: { ticker: 'USDC' },
      options: {},
      createdAt: new Date(),
      scheduledFor: new Date(),
      attempts: 0,
      maxAttempts: 3,
      status: JobStatus.PENDING
    };

    await handler.process(mockJob);
    handler.resetMetrics();

    const metrics = handler.getMetrics();
    expect(metrics.totalProcessed).toBe(0);
    expect(metrics.totalFailed).toBe(0);
    expect(metrics.averageProcessingTime).toBe(0);
  });
});

describe('Handler Integration', () => {
  test('should create and register all default handlers', () => {
    const registry = new HandlerRegistry();
    
    // Register all handlers
    registry.register('collect-stablecoin-data', new StablecoinDataCollector());
    registry.register('analyze-transparency', new TransparencyAnalyzer());
    registry.register('invalidate-cache', new CacheInvalidator());
    registry.register('aggregate-metrics', new MetricsAggregator());

    const status = registry.getStatus();
    expect(status.totalHandlers).toBe(4);
    expect(status.registeredTypes).toEqual([
      'collect-stablecoin-data',
      'analyze-transparency', 
      'invalidate-cache',
      'aggregate-metrics'
    ]);
  });
});