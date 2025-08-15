import '@testing-library/jest-dom'

// Add fetch polyfill for Node.js
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Polyfill fetch for integration tests
if (typeof global.fetch === 'undefined') {
  const fetch = require('node-fetch')
  global.fetch = fetch
}

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.GEMINI_API_KEY = 'test-api-key-AIzaSyBYsNlxhc3fAvRYyT-IzXkq7nJFOxk3eCM'
process.env.COINGECKO_MCP_ENABLED = 'true'

// Mock console methods to reduce noise in tests (except for integration tests)
if (!process.env.INTEGRATION_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}