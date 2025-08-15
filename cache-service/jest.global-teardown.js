// Global teardown for cache service tests
module.exports = async () => {
  console.log('🧹 Cleaning up cache service test environment...');
  
  // Clean up any global test resources
  if (global.testRedisCluster) {
    await global.testRedisCluster.disconnect();
  }
  
  // Report test execution time
  if (global.testStartTime) {
    const duration = Date.now() - global.testStartTime;
    console.log(`⏱️  Total test execution time: ${duration}ms`);
  }
  
  // Clear environment variables
  delete process.env.CACHE_TEST_MODE;
  delete global.REDIS_MOCK_ENABLED;
  
  console.log('✅ Cache service test cleanup complete');
};