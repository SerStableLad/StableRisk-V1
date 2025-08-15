/**
 * Specialized Jest configuration for Metrics Service testing
 * Optimized for performance testing and integration scenarios
 */

const baseConfig = require('../../../../jest.config.js');

module.exports = {
  ...baseConfig,
  displayName: 'Metrics Service Tests',
  testMatch: [
    '<rootDir>/src/lib/services/__tests__/metrics-*.test.ts'
  ],
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/src/lib/services/__tests__/test-setup.ts'
  ],
  testTimeout: 30000, // Extended timeout for load testing
  maxWorkers: 4, // Limit workers for consistent performance testing
  collectCoverageFrom: [
    'src/lib/services/metrics-service.ts',
    'src/metrics-service/src/**/*.ts',
    '!src/metrics-service/src/**/*.d.ts',
    '!src/metrics-service/src/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  testEnvironment: 'node', // Use Node environment for service testing
  globals: {
    'ts-jest': {
      useESM: false,
      isolatedModules: true
    }
  },
  // Performance testing specific configurations
  testSequencer: '<rootDir>/src/lib/services/__tests__/performance-sequencer.js',
  // Retry flaky tests up to 2 times
  jest: {
    retryTimes: 2,
    retryTimesForTests: {
      'metrics-load.test.ts': 3 // Load tests can be more flaky
    }
  }
};