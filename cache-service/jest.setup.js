// Jest setup for cache service tests

// Add fetch polyfill for Node.js if needed
if (typeof global.fetch === 'undefined') {
  const { fetch, Headers, Request, Response } = require('undici');
  global.fetch = fetch;
  global.Headers = Headers;
  global.Request = Request;
  global.Response = Response;
}

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.CACHE_MAX_MEMORY = '1073741824'; // 1GB
process.env.CACHE_DEFAULT_TTL = '3600'; // 1 hour
process.env.CACHE_MAX_VALUE_SIZE = '10485760'; // 10MB
process.env.CACHE_COMPRESSION_THRESHOLD = '1024'; // 1KB
process.env.CACHE_ENABLE_COMPRESSION = 'true';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.REDIS_CLUSTER_NODES = 'localhost:6379,localhost:6380,localhost:6381';

// Global test utilities
global.testUtils = {
  // Helper to create test data
  createTestData: (size = 1000) => {
    return {
      id: Math.random().toString(36).substring(7),
      data: 'x'.repeat(size),
      timestamp: Date.now(),
      metadata: {
        source: 'test',
        version: '1.0.0'
      }
    };
  },
  
  // Helper to create large test data
  createLargeTestData: (sizeInKB = 100) => {
    return {
      id: Math.random().toString(36).substring(7),
      data: 'x'.repeat(sizeInKB * 1024),
      timestamp: Date.now(),
      type: 'large-data'
    };
  },
  
  // Helper to wait for async operations
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to generate access patterns
  generateAccessPattern: (overrides = {}) => {
    return {
      frequency: 10,
      recency: 1,
      volatility: 0.5,
      dataSize: 1000,
      importance: 0.5,
      ...overrides
    };
  },
  
  // Helper to measure execution time
  measureTime: async (fn) => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },
  
  // Helper to generate concurrent operations
  generateConcurrentOps: (count, operation) => {
    return Array.from({ length: count }, (_, i) => operation(i));
  }
};

// Global test constants
global.testConstants = {
  PERFORMANCE_THRESHOLDS: {
    GET_OPERATION_MS: 10,
    SET_OPERATION_MS: 50,
    DELETE_OPERATION_MS: 20,
    MGET_OPERATION_MS: 100,
    INVALIDATION_OPERATION_MS: 200
  },
  
  SIZE_LIMITS: {
    MAX_VALUE_SIZE: 10 * 1024 * 1024, // 10MB
    COMPRESSION_THRESHOLD: 1024, // 1KB
    MAX_KEY_LENGTH: 512
  },
  
  TTL_BOUNDS: {
    MIN_TTL: 300, // 5 minutes
    MAX_TTL: 86400, // 24 hours
    DEFAULT_TTL: 3600 // 1 hour
  }
};

// Mock console for cleaner test output (can be overridden per test)
if (!process.env.VERBOSE_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error for debugging test failures
    error: console.error,
  };
}

// Global beforeEach for all tests
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset timers if using fake timers
  if (jest.isMockFunction(setTimeout)) {
    jest.clearAllTimers();
  }
});

// Global afterEach for cleanup
afterEach(() => {
  // Restore all mocks after each test
  jest.restoreAllMocks();
  
  // Clear any remaining timers
  if (jest.isMockFunction(setTimeout)) {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  }
});

// Extend Jest matchers for cache-specific assertions
expect.extend({
  // Custom matcher for TTL values
  toBeValidTTL(received) {
    const isValid = typeof received === 'number' && 
                   received >= global.testConstants.TTL_BOUNDS.MIN_TTL && 
                   received <= global.testConstants.TTL_BOUNDS.MAX_TTL;
    
    return {
      message: () => 
        `expected ${received} to be a valid TTL between ${global.testConstants.TTL_BOUNDS.MIN_TTL} and ${global.testConstants.TTL_BOUNDS.MAX_TTL}`,
      pass: isValid,
    };
  },
  
  // Custom matcher for performance timing
  toBeWithinPerformanceThreshold(received, operation) {
    const threshold = global.testConstants.PERFORMANCE_THRESHOLDS[operation];
    const isWithin = threshold ? received <= threshold : true;
    
    return {
      message: () => 
        `expected ${received}ms to be within ${threshold}ms threshold for ${operation}`,
      pass: isWithin,
    };
  },
  
  // Custom matcher for cache entries
  toBeValidCacheEntry(received) {
    const hasRequiredFields = received &&
                             typeof received.key === 'string' &&
                             received.value !== undefined &&
                             typeof received.ttl === 'number' &&
                             received.createdAt instanceof Date &&
                             Array.isArray(received.tags) &&
                             typeof received.metadata === 'object';
    
    return {
      message: () => 
        `expected ${JSON.stringify(received)} to be a valid cache entry with required fields`,
      pass: hasRequiredFields,
    };
  },
  
  // Custom matcher for access patterns
  toBeValidAccessPattern(received) {
    const isValid = received &&
                   typeof received.frequency === 'number' &&
                   typeof received.recency === 'number' &&
                   typeof received.volatility === 'number' &&
                   typeof received.dataSize === 'number' &&
                   typeof received.importance === 'number' &&
                   received.frequency >= 0 &&
                   received.recency >= 0 &&
                   received.volatility >= 0 && received.volatility <= 1 &&
                   received.dataSize >= 0 &&
                   received.importance >= 0 && received.importance <= 1;
    
    return {
      message: () => 
        `expected ${JSON.stringify(received)} to be a valid access pattern`,
      pass: isValid,
    };
  }
});

// Error handling for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, but log the error
});

// Warning suppression for test environment
const originalWarn = console.warn;
console.warn = (...args) => {
  // Suppress specific warnings that are expected in test environment
  const message = args.join(' ');
  if (message.includes('experimental') || 
      message.includes('deprecated') ||
      message.includes('cache warning')) {
    return;
  }
  originalWarn.apply(console, args);
};