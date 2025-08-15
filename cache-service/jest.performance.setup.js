// Performance test setup for cache service
require('./jest.setup');

// Additional setup for performance tests
beforeAll(async () => {
  console.log('⚡ Setting up performance test environment...');
  
  // Set very long timeout for performance tests
  jest.setTimeout(60000);
  
  // Enable performance monitoring
  process.env.PERFORMANCE_MONITORING = 'true';
  
  // Warm up the system
  await warmUpSystem();
});

afterAll(async () => {
  console.log('⚡ Cleaning up performance test environment...');
  
  // Generate performance report
  if (global.performanceResults) {
    generatePerformanceReport();
  }
  
  // Reset timeout
  jest.setTimeout(5000);
});

// Performance test utilities
global.performanceUtils = {
  // Measure operation performance
  measurePerformance: async (operation, iterations = 1000) => {
    const results = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await operation();
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      results.push(duration);
    }
    
    return {
      min: Math.min(...results),
      max: Math.max(...results),
      avg: results.reduce((sum, r) => sum + r, 0) / results.length,
      p95: percentile(results, 0.95),
      p99: percentile(results, 0.99),
      iterations,
      results
    };
  },
  
  // Measure concurrent performance
  measureConcurrentPerformance: async (operation, concurrency = 100) => {
    const promises = Array.from({ length: concurrency }, () => {
      const start = process.hrtime.bigint();
      return operation().then(() => {
        const end = process.hrtime.bigint();
        return Number(end - start) / 1000000;
      });
    });
    
    const start = process.hrtime.bigint();
    const results = await Promise.all(promises);
    const totalTime = Number(process.hrtime.bigint() - start) / 1000000;
    
    return {
      totalTime,
      individualResults: results,
      avgIndividual: results.reduce((sum, r) => sum + r, 0) / results.length,
      throughput: concurrency / (totalTime / 1000), // ops per second
      concurrency
    };
  },
  
  // Memory usage measurement
  measureMemoryUsage: () => {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
    };
  },
  
  // Load test with sustained operations
  loadTest: async (operation, { duration = 10000, targetRPS = 100 }) => {
    const results = [];
    const startTime = Date.now();
    const interval = 1000 / targetRPS; // ms between operations
    
    while (Date.now() - startTime < duration) {
      const opStart = process.hrtime.bigint();
      await operation();
      const opEnd = process.hrtime.bigint();
      const opDuration = Number(opEnd - opStart) / 1000000;
      
      results.push({
        timestamp: Date.now() - startTime,
        duration: opDuration
      });
      
      // Wait for next operation
      const waitTime = Math.max(0, interval - opDuration);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    const actualRPS = results.length / (duration / 1000);
    const avgLatency = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    
    return {
      duration,
      targetRPS,
      actualRPS,
      totalOperations: results.length,
      avgLatency,
      p95Latency: percentile(results.map(r => r.duration), 0.95),
      p99Latency: percentile(results.map(r => r.duration), 0.99),
      results
    };
  }
};

// Initialize performance tracking
global.performanceResults = {
  testSuites: [],
  systemInfo: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpus: require('os').cpus().length,
    memory: Math.round(require('os').totalmem() / 1024 / 1024 / 1024) + 'GB'
  }
};

// Helper functions
function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * p) - 1;
  return sorted[index];
}

async function warmUpSystem() {
  console.log('🔥 Warming up system...');
  
  // Perform some operations to warm up JIT and caches
  for (let i = 0; i < 100; i++) {
    JSON.stringify({ data: 'warmup', iteration: i });
    JSON.parse('{"data":"warmup","iteration":' + i + '}');
  }
  
  // Trigger garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  console.log('🔥 System warm-up complete');
}

function generatePerformanceReport() {
  const report = {
    timestamp: new Date().toISOString(),
    systemInfo: global.performanceResults.systemInfo,
    testSuites: global.performanceResults.testSuites,
    summary: {
      totalTests: global.performanceResults.testSuites.length,
      // Add more summary statistics as needed
    }
  };
  
  // In a real implementation, this would write to a file or send to a monitoring system
  console.log('📊 Performance Report Generated');
  console.log(JSON.stringify(report, null, 2));
}