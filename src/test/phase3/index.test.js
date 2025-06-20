/**
 * Phase 3: Backend Data Aggregation & APIs Test Runner
 */

const { describe, it, beforeAll } = require('@jest/globals');

describe('Phase 3: Backend Data Aggregation & APIs', () => {
  beforeAll(() => {
    console.log('\n🧪 Running Phase 3 Test Suite\n');
  });

  // Import and run all test suites
  require('./metadata-fetch.test.js');
  require('./audit-discovery.test.js');
  require('./transparency.test.js');
  require('./peg-stability.test.js');
  require('./oracle-detection.test.js');
  require('./liquidity-analysis.test.js');
  require('./caching-ratelimit.test.js');
}); 