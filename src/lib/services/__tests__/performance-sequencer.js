/**
 * Custom Jest test sequencer for performance-sensitive tests
 * Ensures load tests run in isolation to avoid interference
 */

const Sequencer = require('@jest/test-sequencer').default;
const path = require('path');

class PerformanceSequencer extends Sequencer {
  sort(tests) {
    const testGroups = {
      unit: [],
      integration: [],
      load: [],
      health: [],
      database: [],
      client: []
    };

    // Categorize tests
    tests.forEach(test => {
      const testPath = test.path;
      const filename = path.basename(testPath);
      
      if (filename.includes('metrics-service.test')) {
        testGroups.unit.push(test);
      } else if (filename.includes('metrics-controller.test')) {
        testGroups.integration.push(test);
      } else if (filename.includes('metrics-database.test')) {
        testGroups.database.push(test);
      } else if (filename.includes('metrics-service-client.test')) {
        testGroups.client.push(test);
      } else if (filename.includes('metrics-load.test')) {
        testGroups.load.push(test);
      } else if (filename.includes('metrics-health.test')) {
        testGroups.health.push(test);
      }
    });

    // Sort within each group by path for consistency
    Object.keys(testGroups).forEach(group => {
      testGroups[group].sort((a, b) => a.path.localeCompare(b.path));
    });

    // Return tests in optimal order:
    // 1. Unit tests first (fastest)
    // 2. Database tests (setup database state)
    // 3. Integration tests (API endpoints)
    // 4. Client tests (service integration)
    // 5. Health tests (service health)
    // 6. Load tests last (most resource intensive)
    return [
      ...testGroups.unit,
      ...testGroups.database,
      ...testGroups.integration,
      ...testGroups.client,
      ...testGroups.health,
      ...testGroups.load
    ];
  }
}

module.exports = PerformanceSequencer;