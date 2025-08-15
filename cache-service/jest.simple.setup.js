// Simple Jest setup for cache service tests

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.CACHE_MAX_MEMORY = '1073741824'; // 1GB
process.env.CACHE_DEFAULT_TTL = '3600'; // 1 hour
process.env.CACHE_MAX_VALUE_SIZE = '10485760'; // 10MB
process.env.CACHE_COMPRESSION_THRESHOLD = '1024'; // 1KB
process.env.CACHE_ENABLE_COMPRESSION = 'true';

// Global test utilities
global.testUtils = {
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
  
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
  
  measureTime: async (fn) => {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  },
  
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
  }
};

// Extend Jest matchers
expect.extend({
  toBeWithinPerformanceThreshold(received, operation) {
    const threshold = global.testConstants.PERFORMANCE_THRESHOLDS[operation];
    const isWithin = threshold ? received <= threshold : true;
    
    return {
      message: () => 
        `expected ${received}ms to be within ${threshold}ms threshold for ${operation}`,
      pass: isWithin,
    };
  }
});