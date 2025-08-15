module.exports = {
  displayName: 'Circuit Breaker Tests',
  testMatch: [
    '**/circuit-breaker*.test.ts'
  ],
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    '../circuit-breaker.ts',
    '!**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  testTimeout: 10000,
  verbose: true
};