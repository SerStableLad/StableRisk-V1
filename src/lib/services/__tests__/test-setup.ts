/**
 * Test setup for Metrics Service tests
 * Provides common mocks, utilities, and performance testing helpers
 */

import '@testing-library/jest-dom';

// Performance testing utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toCompleteWithinMs(maxMs: number): R;
      toHandleLoad(operations: number, timeMs: number): R;
    }
  }
}

// Custom Jest matchers for performance testing
expect.extend({
  toCompleteWithinMs(received: Promise<any>, maxMs: number) {
    const startTime = Date.now();
    
    return received.then(() => {
      const endTime = Date.now();
      const actualMs = endTime - startTime;
      
      const pass = actualMs <= maxMs;
      
      return {
        message: () => 
          pass 
            ? `Expected operation to take more than ${maxMs}ms but completed in ${actualMs}ms`
            : `Expected operation to complete within ${maxMs}ms but took ${actualMs}ms`,
        pass
      };
    }).catch((error) => {
      return {
        message: () => `Operation failed with error: ${error.message}`,
        pass: false
      };
    });
  },

  async toHandleLoad(received: () => Promise<any>[], operations: number, timeMs: number) {
    const promises = received();
    const startTime = Date.now();
    
    try {
      await Promise.all(promises);
      const endTime = Date.now();
      const actualTime = endTime - startTime;
      const operationsPerSecond = (operations / actualTime) * 1000;
      const expectedRate = operations / (timeMs / 1000);
      
      const pass = operationsPerSecond >= expectedRate * 0.8; // Allow 20% margin
      
      return {
        message: () => 
          pass
            ? `Expected load handling to be slower than ${expectedRate} ops/sec but achieved ${operationsPerSecond.toFixed(2)} ops/sec`
            : `Expected to handle ${expectedRate} ops/sec but only achieved ${operationsPerSecond.toFixed(2)} ops/sec`,
        pass
      };
    } catch (error) {
      return {
        message: () => `Load test failed with error: ${error}`,
        pass: false
      };
    }
  }
});

// Mock console for cleaner test output
const originalConsole = global.console;
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  // Keep some methods for test debugging
  group: originalConsole.group,
  groupEnd: originalConsole.groupEnd,
  time: originalConsole.time,
  timeEnd: originalConsole.timeEnd
};

// Global test configuration
process.env.NODE_ENV = 'test';
process.env.METRICS_SERVICE_URL = 'http://localhost:3001';
process.env.METRICS_SERVICE_TIMEOUT = '5000';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'stablerisk_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

// Performance testing helpers
export const performanceHelpers = {
  /**
   * Measure execution time of a function
   */
  measureTime: async <T>(fn: () => Promise<T>): Promise<{ result: T; timeMs: number }> => {
    const startTime = Date.now();
    const result = await fn();
    const endTime = Date.now();
    return { result, timeMs: endTime - startTime };
  },

  /**
   * Create a delay for testing timeouts
   */
  delay: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generate test metrics data
   */
  generateMetrics: (count: number) => Array.from({ length: count }, (_, i) => ({
    name: `test.metric.${i}`,
    value: Math.random() * 1000,
    labels: {
      test: 'true',
      index: i.toString(),
      category: `cat-${i % 5}`,
      timestamp: Date.now()
    },
    timestamp: new Date(Date.now() - i * 1000)
  })),

  /**
   * Simulate network delay
   */
  networkDelay: (minMs: number = 10, maxMs: number = 100): Promise<void> => {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return new Promise(resolve => setTimeout(resolve, delay));
  },

  /**
   * Create mock responses for different scenarios
   */
  mockResponses: {
    success: (data: any = {}) => new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }),

    error: (status: number = 500, message: string = 'Internal Server Error') => 
      new Response(message, { status }),

    timeout: () => new Promise(() => {}), // Never resolves

    slow: (data: any = {}, delayMs: number = 1000) => 
      new Promise(resolve => 
        setTimeout(() => resolve(new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })), delayMs)
      )
  }
};

// Database mock helpers
export const databaseMockHelpers = {
  /**
   * Create mock database query result
   */
  createQueryResult: (rows: any[], rowCount?: number) => ({
    rows,
    rowCount: rowCount ?? rows.length,
    fields: [],
    command: 'SELECT',
    oid: 0
  }),

  /**
   * Create mock database client
   */
  createMockClient: () => ({
    query: jest.fn(),
    release: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    removeListener: jest.fn()
  }),

  /**
   * Simulate database performance
   */
  simulateDbPerformance: (mockQuery: jest.Mock, responseTimeMs: number = 50) => {
    mockQuery.mockImplementation(async () => {
      await performanceHelpers.delay(responseTimeMs);
      return databaseMockHelpers.createQueryResult([]);
    });
  }
};

// Load testing utilities
export const loadTestHelpers = {
  /**
   * Execute operations in batches
   */
  executeBatched: async <T>(
    operations: (() => Promise<T>)[],
    batchSize: number = 10,
    batchDelayMs: number = 100
  ): Promise<T[]> => {
    const results: T[] = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(op => op()));
      results.push(...batchResults);
      
      if (i + batchSize < operations.length) {
        await performanceHelpers.delay(batchDelayMs);
      }
    }
    
    return results;
  },

  /**
   * Validate throughput requirements
   */
  validateThroughput: (
    actualCount: number,
    actualTimeMs: number,
    requiredPerSecond: number
  ): { passed: boolean; actualRate: number; requiredRate: number } => {
    const actualRate = (actualCount / actualTimeMs) * 1000;
    const passed = actualRate >= requiredPerSecond;
    
    return {
      passed,
      actualRate,
      requiredRate: requiredPerSecond
    };
  },

  /**
   * Simulate concurrent users
   */
  simulateConcurrentUsers: async <T>(
    userCount: number,
    operationsPerUser: number,
    operationFn: () => Promise<T>
  ): Promise<T[][]> => {
    const userOperations = Array.from({ length: userCount }, () =>
      Array.from({ length: operationsPerUser }, operationFn)
    );
    
    return Promise.all(
      userOperations.map(operations => Promise.all(operations))
    );
  }
};

// Test data factories
export const testDataFactory = {
  /**
   * Create realistic API call data
   */
  apiCall: (overrides: Partial<{
    service: string;
    endpoint: string;
    duration: number;
    success: boolean;
    timestamp: Date;
  }> = {}) => ({
    service: 'test-service',
    endpoint: '/api/test',
    duration: 150,
    success: true,
    timestamp: new Date(),
    ...overrides
  }),

  /**
   * Create realistic metric data
   */
  metric: (overrides: Partial<{
    name: string;
    value: number;
    labels: Record<string, string>;
    timestamp: Date;
  }> = {}) => ({
    name: 'test.metric',
    value: 100,
    labels: { test: 'true' },
    timestamp: new Date(),
    ...overrides
  }),

  /**
   * Create batch of metrics for load testing
   */
  metricBatch: (count: number, namePrefix: string = 'batch.metric') =>
    Array.from({ length: count }, (_, i) => testDataFactory.metric({
      name: `${namePrefix}.${i}`,
      value: i * 10 + Math.random() * 100,
      labels: {
        batchIndex: i.toString(),
        batchId: 'test-batch',
        category: `category-${i % 5}`
      }
    }))
};

// Cleanup helpers
afterEach(() => {
  // Clear all timers
  jest.clearAllTimers();
  
  // Reset all mocks
  jest.clearAllMocks();
  
  // Clear performance measurements
  if ((performance as any).clearMarks) {
    (performance as any).clearMarks();
  }
  if ((performance as any).clearMeasures) {
    (performance as any).clearMeasures();
  }
});

beforeAll(() => {
  // Setup global test environment
  jest.setTimeout(30000); // 30 second timeout for load tests
});

afterAll(() => {
  // Cleanup global resources
  jest.restoreAllMocks();
});