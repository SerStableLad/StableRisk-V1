// Jest setup file for background jobs service
// Global test configuration and mocks

// Set up test environment
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  // Uncomment below to silence console.log/info during tests
  // log: jest.fn(),
  // info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  warn: console.warn,
  error: console.error,
};

// Set up global test timeout
jest.setTimeout(30000); // 30 seconds