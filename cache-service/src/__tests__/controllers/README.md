# Cache Controller API Tests

This directory contains comprehensive test cases for the Cache Controller REST API endpoints that are part of the extracted cache service.

## Test Files

### 1. `cache-controller.test.ts`
**Unit Tests with Mocking**

Comprehensive unit tests for all Cache Controller API endpoints with mocked CacheManager dependency.

**Endpoints Tested:**
- `POST /cache/set` - Set cache entry with options
- `GET /cache/get/:key` - Get cache entry by key
- `POST /cache/mget` - Multi-get cache entries
- `DELETE /cache/delete/:key` - Delete cache entry
- `POST /cache/invalidate/tag` - Invalidate by tag
- `POST /cache/invalidate/pattern` - Invalidate by pattern
- `GET /cache/stats` - Get cache statistics
- `POST /cache/bulk/set` - Bulk set operations

**Test Categories:**
- ✅ **Success scenarios** - Valid requests with different data types
- ✅ **Error handling** - Invalid requests, malformed JSON, missing fields
- ✅ **Edge cases** - Large payloads, special characters, concurrent requests
- ✅ **Validation** - Request parameter validation and sanitization
- ✅ **Response schemas** - Consistent response format validation
- ✅ **Data types** - Testing various JavaScript data types (string, number, object, array, null)
- ✅ **URL encoding** - Special characters in keys and proper encoding/decoding

### 2. `cache-controller.integration.test.ts`
**Integration Tests**

Integration tests that test the actual HTTP endpoints without extensive mocking, focusing on real API behavior.

**Test Scenarios:**
- Complete cache lifecycle operations (set → get → delete)
- Batch operations with mixed data types
- Tag-based and pattern-based invalidation workflows
- Error handling with malformed requests
- Response schema consistency across all endpoints
- Special character handling in keys and values
- Large payload processing
- Concurrent request handling

### 3. `cache-controller.performance.test.ts`
**Performance & Load Tests**

Performance tests for validating API throughput, latency, and behavior under load.

**Performance Metrics:**
- **Throughput**: Operations per second for different endpoint types
- **Latency**: Response time measurements (average, max, 95th percentile)
- **Concurrent Load**: Multi-user simulation with mixed operations
- **Memory Pressure**: Large payload handling and memory efficiency
- **Bulk Operations**: Scalability testing for batch operations
- **Invalidation Performance**: Tag/pattern invalidation at scale

**Performance Benchmarks:**
- SET operations: > 100 ops/sec, < 50ms average latency
- GET operations: > 200 ops/sec, < 25ms average latency  
- Mixed workload: > 150 ops/sec overall throughput
- Bulk operations: Efficient batch processing at scale
- Concurrent load: > 95% success rate under 50 concurrent users

## Running the Tests

### Unit Tests (Mocked)
```bash
# Run all controller unit tests
npm run test:unit -- cache-controller.test.ts

# Run with coverage
npm run test:coverage -- cache-controller.test.ts

# Watch mode for development
npm run test:watch -- cache-controller.test.ts
```

### Integration Tests
```bash
# Run integration tests
npm run test:integration -- cache-controller.integration.test.ts

# With verbose output
npm test -- cache-controller.integration.test.ts --verbose
```

### Performance Tests
```bash
# Run performance tests
npm run test:performance -- cache-controller.performance.test.ts

# Note: Performance tests have longer timeouts (30-90 seconds)
```

### All Controller Tests
```bash
# Run all cache controller tests
npm test -- __tests__/controllers/

# Run with detailed reporting
npm run test:ci -- __tests__/controllers/
```

## Test Configuration

### Dependencies Required
- `supertest` - HTTP integration testing
- `@types/supertest` - TypeScript definitions
- `jest` - Test framework
- `ts-jest` - TypeScript support for Jest

### Timeouts
- **Unit tests**: 10 seconds (default)
- **Integration tests**: 15-30 seconds
- **Performance tests**: 30-90 seconds

### Mock Strategy
- **Unit tests**: Full CacheManager mocking for isolated testing
- **Integration tests**: Minimal mocking, real HTTP requests
- **Performance tests**: Real HTTP with placeholder cache backend

## API Endpoint Specifications

### POST /cache/set
**Request:**
```json
{
  "key": "string (required)",
  "value": "any (required)",
  "options": {
    "ttl": "number (optional)",
    "tags": "string[] (optional)",
    "dependencies": "string[] (optional)",
    "source": "string (optional)",
    "version": "string (optional)",
    "metadata": "object (optional)"
  }
}
```

**Response (201):**
```json
{
  "success": "boolean",
  "key": "string",
  "message": "string"
}
```

### GET /cache/get/:key
**Parameters:**
- `key`: URL-encoded cache key

**Response (200):**
```json
{
  "key": "string",
  "value": "any",
  "found": true
}
```

**Response (404):**
```json
{
  "key": "string",
  "found": false,
  "message": "string"
}
```

### POST /cache/mget
**Request:**
```json
{
  "keys": "string[] (required)"
}
```

**Response (200):**
```json
{
  "results": [{"key": "string", "value": "any"}],
  "found": "number",
  "missing": "number", 
  "missingKeys": "string[]"
}
```

### DELETE /cache/delete/:key
**Parameters:**
- `key`: URL-encoded cache key

**Response (200):**
```json
{
  "success": "boolean",
  "key": "string",
  "message": "string"
}
```

### POST /cache/invalidate/tag
**Request:**
```json
{
  "tag": "string (required)"
}
```

**Response (200):**
```json
{
  "tag": "string",
  "invalidatedCount": "number",
  "invalidatedKeys": "string[]"
}
```

### POST /cache/invalidate/pattern
**Request:**
```json
{
  "pattern": "string (required)"
}
```

**Response (200):**
```json
{
  "pattern": "string",
  "invalidatedCount": "number", 
  "invalidatedKeys": "string[]"
}
```

### GET /cache/stats
**Response (200):**
```json
{
  "memory": "object",
  "keyCount": "number",
  "accessPatterns": "object",
  "config": "object"
}
```

### POST /cache/bulk/set
**Request:**
```json
{
  "entries": [
    {
      "key": "string",
      "value": "any",
      "options": "object (optional)"
    }
  ]
}
```

**Response (200):**
```json
{
  "total": "number",
  "successful": "number",
  "failed": "number",
  "message": "string"
}
```

## Error Responses

All endpoints return consistent error responses:

**HTTP 400 (Bad Request):**
```json
{
  "error": "string"
}
```

**HTTP 500 (Internal Server Error):**
```json
{
  "error": "string"
}
```

## Test Coverage Requirements

The tests ensure comprehensive coverage of:

### Functional Requirements
- ✅ All 8 API endpoints working correctly
- ✅ Request validation and error handling
- ✅ Response format consistency
- ✅ Data type support (string, number, boolean, object, array, null)
- ✅ URL encoding/decoding for special characters
- ✅ Tag-based and pattern-based operations

### Performance Requirements  
- ✅ Individual operation latency < 50ms (SET), < 25ms (GET)
- ✅ Throughput > 100 ops/sec (SET), > 200 ops/sec (GET)
- ✅ Concurrent request handling (50+ users)
- ✅ Large payload processing (up to 50MB limit)
- ✅ Bulk operation efficiency

### Quality Requirements
- ✅ > 95% success rate under load
- ✅ Graceful error handling and recovery
- ✅ Memory efficiency under pressure
- ✅ Consistent response schemas
- ✅ Input validation and sanitization

## Contributing

When adding new tests:

1. **Unit tests**: Mock all external dependencies, focus on controller logic
2. **Integration tests**: Test real HTTP behavior, minimal mocking
3. **Performance tests**: Measure and assert performance benchmarks
4. **Documentation**: Update this README with new test scenarios
5. **Coverage**: Ensure new endpoints/features have comprehensive test coverage

## Notes

- Tests use the placeholder CacheManager implementation for basic functionality
- Performance benchmarks are based on typical cache service requirements
- Real Redis integration would be tested separately in full integration tests
- All tests are designed to run independently and can be executed in parallel
- Error scenarios include network timeouts, malformed JSON, and cache service failures