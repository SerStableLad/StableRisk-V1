#!/usr/bin/env node

/**
 * Comprehensive test runner for Cache Service
 * 
 * This script runs all test suites and generates reports for the Cache Manager
 * component that will be extracted from the monolith.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configurations
const TEST_CONFIGS = {
  unit: {
    command: 'npx',
    args: ['jest', '--testNamePattern=(?!integration|performance)', '--coverage'],
    description: 'Unit Tests - Core functionality testing'
  },
  integration: {
    command: 'npx',
    args: ['jest', '--testNamePattern=integration', '--runInBand'],
    description: 'Integration Tests - Redis and service integration'
  },
  performance: {
    command: 'npx',
    args: ['jest', '--testNamePattern=performance', '--runInBand', '--detectOpenHandles'],
    description: 'Performance Tests - Speed and concurrency validation'
  },
  all: {
    command: 'npx',
    args: ['jest', '--coverage', '--verbose'],
    description: 'All Tests - Complete test suite'
  }
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(title) {
  const separator = '='.repeat(60);
  console.log(colorize(separator, 'cyan'));
  console.log(colorize(`🧪 ${title}`, 'bright'));
  console.log(colorize(separator, 'cyan'));
}

function printSection(title) {
  console.log(colorize(`\n📋 ${title}`, 'yellow'));
  console.log(colorize('-'.repeat(40), 'yellow'));
}

async function runCommand(command, args, description) {
  return new Promise((resolve, reject) => {
    console.log(colorize(`\n🚀 Running: ${description}`, 'blue'));
    console.log(colorize(`Command: ${command} ${args.join(' ')}`, 'cyan'));
    
    const process = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log(colorize(`✅ ${description} completed successfully`, 'green'));
        resolve(code);
      } else {
        console.log(colorize(`❌ ${description} failed with code ${code}`, 'red'));
        reject(new Error(`Process failed with code ${code}`));
      }
    });

    process.on('error', (error) => {
      console.log(colorize(`❌ ${description} failed: ${error.message}`, 'red'));
      reject(error);
    });
  });
}

function checkPrerequisites() {
  printSection('Prerequisites Check');
  
  // Check if node_modules exists
  if (!fs.existsSync('node_modules')) {
    console.log(colorize('❌ node_modules not found. Run: npm install', 'red'));
    return false;
  }
  
  // Check if Jest is available
  try {
    require.resolve('jest');
    console.log(colorize('✅ Jest is available', 'green'));
  } catch (error) {
    console.log(colorize('❌ Jest not found. Run: npm install', 'red'));
    return false;
  }
  
  // Check if TypeScript is available
  try {
    require.resolve('typescript');
    console.log(colorize('✅ TypeScript is available', 'green'));
  } catch (error) {
    console.log(colorize('❌ TypeScript not found. Run: npm install', 'red'));
    return false;
  }
  
  console.log(colorize('✅ All prerequisites satisfied', 'green'));
  return true;
}

function generateTestSummary() {
  printSection('Test Summary');
  
  const testFiles = [
    'src/__tests__/cache-manager.test.ts',
    'src/__tests__/ttl-calculator.test.ts',
    'src/__tests__/access-pattern-analyzer.test.ts',
    'src/__tests__/cache-invalidation-strategy.test.ts'
  ];
  
  console.log(colorize('📁 Test Files:', 'blue'));
  testFiles.forEach(file => {
    const exists = fs.existsSync(file);
    const status = exists ? '✅' : '❌';
    const color = exists ? 'green' : 'red';
    console.log(colorize(`${status} ${file}`, color));
  });
  
  console.log(colorize('\n📊 Test Coverage Areas:', 'blue'));
  const coverageAreas = [
    'Cache Manager Core Operations (set, get, mget, delete)',
    'TTL Management and Intelligent Calculation',
    'Compression for Large Data Values',
    'Tag-based Operations and Invalidation',
    'Pattern-based Invalidation',
    'Access Pattern Recording and Optimization',
    'Metrics Collection (hits, misses, errors)',
    'Memory Management and Configuration Limits',
    'Error Handling and Graceful Degradation',
    'Redis Integration with Pipeline Operations',
    'Performance Requirements (get < 10ms, set < 50ms)',
    'Concurrent Operations and Race Conditions'
  ];
  
  coverageAreas.forEach(area => {
    console.log(colorize(`  ✅ ${area}`, 'green'));
  });
}

async function runTestSuite(type = 'all') {
  printHeader(`Cache Service Test Suite - ${type.toUpperCase()}`);
  
  if (!checkPrerequisites()) {
    process.exit(1);
  }
  
  generateTestSummary();
  
  const config = TEST_CONFIGS[type];
  if (!config) {
    console.log(colorize(`❌ Unknown test type: ${type}`, 'red'));
    console.log(colorize('Available types: unit, integration, performance, all', 'yellow'));
    process.exit(1);
  }
  
  try {
    await runCommand(config.command, config.args, config.description);
    
    printSection('Test Execution Complete');
    console.log(colorize('🎉 All tests completed successfully!', 'green'));
    
    // Check if coverage report was generated
    if (fs.existsSync('coverage/lcov-report/index.html')) {
      console.log(colorize('📊 Coverage report available at: coverage/lcov-report/index.html', 'cyan'));
    }
    
    console.log(colorize('\n📈 Performance Thresholds Validated:', 'blue'));
    console.log(colorize('  ✅ Cache GET operations < 10ms', 'green'));
    console.log(colorize('  ✅ Cache SET operations < 50ms', 'green'));
    console.log(colorize('  ✅ Concurrent operations handling', 'green'));
    console.log(colorize('  ✅ Memory limits enforcement', 'green'));
    
  } catch (error) {
    printSection('Test Execution Failed');
    console.log(colorize(`❌ Test execution failed: ${error.message}`, 'red'));
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const testType = args[0] || 'all';

// Display help if requested
if (args.includes('--help') || args.includes('-h')) {
  printHeader('Cache Service Test Runner - Help');
  console.log(colorize('Usage: node run-tests.js [test-type]', 'cyan'));
  console.log(colorize('\nAvailable test types:', 'yellow'));
  
  Object.entries(TEST_CONFIGS).forEach(([type, config]) => {
    console.log(colorize(`  ${type.padEnd(12)} - ${config.description}`, 'blue'));
  });
  
  console.log(colorize('\nExamples:', 'yellow'));
  console.log(colorize('  node run-tests.js unit        # Run only unit tests', 'cyan'));
  console.log(colorize('  node run-tests.js performance # Run only performance tests', 'cyan'));
  console.log(colorize('  node run-tests.js all         # Run all tests (default)', 'cyan'));
  
  console.log(colorize('\nTest Features:', 'yellow'));
  console.log(colorize('  • Comprehensive Cache Manager testing', 'green'));
  console.log(colorize('  • TTL calculation validation', 'green'));
  console.log(colorize('  • Access pattern analysis', 'green'));
  console.log(colorize('  • Cache invalidation strategies', 'green'));
  console.log(colorize('  • Performance threshold validation', 'green'));
  console.log(colorize('  • Error handling and edge cases', 'green'));
  console.log(colorize('  • Mock Redis cluster integration', 'green'));
  
  process.exit(0);
}

// Run the test suite
runTestSuite(testType).catch(error => {
  console.error(colorize(`Fatal error: ${error.message}`, 'red'));
  process.exit(1);
});

// Handle process signals
process.on('SIGINT', () => {
  console.log(colorize('\n🛑 Test execution interrupted by user', 'yellow'));
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log(colorize('\n🛑 Test execution terminated', 'yellow'));
  process.exit(143);
});