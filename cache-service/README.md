# StableRisk Cache Service - Test Suite

This directory contains comprehensive test cases for the Cache Manager component that will be extracted from the StableRisk AI monolith into a dedicated cache service.

## 🧪 Test Coverage

The test suite provides complete coverage for all Cache Manager functionality specified in the task requirements:

### Core Functionality Tests
- **Basic Operations**: `set()`, `get()`, `mget()`, `delete()` operations
- **TTL Management**: Intelligent TTL calculation based on access patterns, data size, and metadata
- **Compression**: Value compression for large data when enabled
- **Tag-based Operations**: Setting tags and invalidating by tags
- **Pattern-based Invalidation**: Invalidating cache keys by patterns
- **Access Pattern Recording**: Tracking reads/writes for optimization

### Advanced Features Tests
- **Metrics Collection**: Recording cache hits, misses, errors, and performance
- **Memory Management**: Configuration limits and cleanup tasks
- **Error Handling**: Graceful degradation and error recovery
- **Redis Integration**: Pipeline operations and cluster support

### Performance Tests
- **Get Operations**: < 10ms performance requirement validation
- **Set Operations**: < 50ms performance requirement validation
- **Concurrent Operations**: Race condition and thread safety testing
- **Memory Limits**: Compression thresholds and size limit enforcement

## 📁 Test Files

```
cache-service/src/__tests__/
├── cache-manager.test.ts                    # Main Cache Manager tests
├── ttl-calculator.test.ts                   # TTL calculation logic tests
├── access-pattern-analyzer.test.ts          # Access pattern analysis tests
└── cache-invalidation-strategy.test.ts     # Cache invalidation tests
```

## 🚀 Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Ensure TypeScript is compiled
npm run build
```

### Test Execution Options

#### 1. Run All Tests (Recommended)
```bash
# Using npm script
npm test

# Using custom test runner
node run-tests.js all
```

#### 2. Run Specific Test Types
```bash
# Unit tests only
npm run test:unit
node run-tests.js unit

# Integration tests only
npm run test:integration
node run-tests.js integration

# Performance tests only
npm run test:performance
node run-tests.js performance
```

#### 3. Development Testing
```bash
# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

#### 4. CI/CD Testing
```bash
# For continuous integration
npm run test:ci
```

## 📊 Test Results and Coverage

### Expected Coverage Targets
- **Overall Coverage**: > 90%
- **Cache Manager Core**: > 95%
- **TTL Calculator**: > 90%
- **Access Pattern Analyzer**: > 85%
- **Invalidation Strategy**: > 90%

### Performance Thresholds
The tests validate these performance requirements:
- Cache GET operations: < 10ms
- Cache SET operations: < 50ms
- MGET operations: < 100ms
- Invalidation operations: < 200ms

### Test Reports
After running tests, reports are available in:
- **Coverage Report**: `coverage/lcov-report/index.html`
- **JUnit Report**: `test-results/junit.xml`
- **Test Output**: Console and log files

## 🔧 Test Configuration

### Jest Configuration
Tests use Jest with custom configuration in `jest.config.js`:
- **Environment**: Node.js
- **TypeScript Support**: ts-jest preset
- **Coverage Thresholds**: Enforced per file
- **Test Timeout**: 10 seconds (configurable)

### Mock Dependencies
Tests use comprehensive mocks for:
- **Redis Cluster**: Full Redis operation simulation
- **Metrics Collector**: Performance and usage tracking
- **Compression Utils**: Data compression/decompression
- **Access Pattern Analyzer**: Pattern tracking and analysis

## 🏗️ Test Architecture

### Test Structure
Each test file follows this pattern:
```typescript
describe('Component Name', () => {
  describe('Feature Group', () => {
    test('should handle specific scenario', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Test Utilities
Global test utilities are available in `jest.setup.js`:
- `testUtils.createTestData()` - Generate test data
- `testUtils.measureTime()` - Performance measurement
- `testUtils.generateConcurrentOps()` - Concurrency helpers

### Custom Matchers
Extended Jest matchers for cache-specific assertions:
- `toBeValidTTL()` - Validates TTL values
- `toBeWithinPerformanceThreshold()` - Performance validation
- `toBeValidCacheEntry()` - Cache entry structure validation
- `toBeValidAccessPattern()` - Access pattern validation

## 🐛 Test Debugging

### Verbose Output
```bash
# Enable detailed test output
VERBOSE_TESTS=true npm test

# Debug specific test
npm test -- --testNamePattern="specific test name"
```

### Common Issues
1. **Memory Issues**: Increase Node.js memory limit
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm test
   ```

2. **Timeout Issues**: Increase test timeout
   ```bash
   npm test -- --testTimeout=30000
   ```

3. **Redis Mock Issues**: Check mock implementation in test files

## 🔍 Test Scenarios Covered

### Basic Operations
- ✅ Set and retrieve simple values
- ✅ Handle non-existent keys
- ✅ Delete cached values
- ✅ Batch operations (mget)
- ✅ Mixed existence results

### TTL Management
- ✅ Explicit TTL usage
- ✅ Intelligent TTL calculation
- ✅ Access pattern influence
- ✅ TTL bounds enforcement
- ✅ Stablecoin-specific TTL

### Compression
- ✅ Large value compression
- ✅ Small value passthrough
- ✅ Compression threshold respect
- ✅ Decompression accuracy

### Tag Operations
- ✅ Tag-based invalidation
- ✅ Multiple tag handling
- ✅ Non-existent tag handling
- ✅ Tag cleanup

### Pattern Invalidation
- ✅ Wildcard pattern matching
- ✅ Complex pattern support
- ✅ No-match scenarios
- ✅ Bulk invalidation

### Access Patterns
- ✅ Read pattern recording
- ✅ Write pattern tracking
- ✅ Frequency calculation
- ✅ Recency updates
- ✅ Volatility assessment

### Metrics Collection
- ✅ Hit/miss tracking
- ✅ Operation counting
- ✅ Error recording
- ✅ Performance timing

### Error Handling
- ✅ Redis connection failures
- ✅ Malformed data handling
- ✅ Size limit enforcement
- ✅ Graceful degradation

### Performance
- ✅ Speed requirements
- ✅ Concurrent operations
- ✅ Race condition safety
- ✅ Memory efficiency

## 📈 Continuous Integration

### GitHub Actions
```yaml
# Example CI configuration
- name: Run Cache Service Tests
  run: |
    cd cache-service
    npm ci
    npm run test:ci
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    directory: cache-service/coverage
```

### Test Quality Gates
- All tests must pass
- Coverage must meet thresholds
- Performance tests must validate requirements
- No linting errors
- TypeScript compilation success

## 🔄 Integration with Main Project

These tests are designed to validate the Cache Manager before extraction:

1. **Pre-extraction Validation**: Run tests against current monolith implementation
2. **Post-extraction Verification**: Validate extracted service matches behavior
3. **Regression Prevention**: Ensure no functionality loss during extraction
4. **Performance Baseline**: Establish performance benchmarks

## 📚 Additional Resources

- [Task Specification](../taskmaster/phase-2-service-extraction/task-07-cache-service-extraction.md)
- [Redis Documentation](https://redis.io/documentation)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [TypeScript Jest Setup](https://kulshekhar.github.io/ts-jest/)

## 🤝 Contributing

When adding new tests:
1. Follow existing test patterns
2. Include both positive and negative test cases
3. Add performance tests for new operations
4. Update coverage thresholds if needed
5. Document any new test utilities

---

**Note**: This test suite is specifically designed for the Cache Service extraction project. All tests use mocks to avoid external dependencies during testing. For integration testing with real Redis, see the integration test configuration.