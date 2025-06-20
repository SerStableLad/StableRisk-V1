/**
 * Phase 1: Project Setup Test Cases
 * Tests for: Next.js project, API service, environment setup, shadcn/ui, theming
 */

const fs = require('fs');
const path = require('path');

class Phase1Tests {
  constructor() {
    this.results = [];
    this.projectRoot = process.cwd();
  }

  log(test, passed, message) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const result = `${status}: ${test} - ${message}`;
    console.log(result);
    this.results.push({ test, passed, message });
  }

  // Test 1: Next.js 15 with TypeScript setup
  testNextJsSetup() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const hasNext = packageJson.dependencies?.next || packageJson.devDependencies?.next;
      const hasTypeScript = packageJson.devDependencies?.typescript;
      const hasNextConfig = fs.existsSync('next.config.js') || fs.existsSync('next.config.mjs');
      const hasTsConfig = fs.existsSync('tsconfig.json');
      
      if (hasNext && hasTypeScript && hasNextConfig && hasTsConfig) {
        this.log('Next.js 15 with TypeScript', true, `Next.js ${hasNext}, TypeScript configured`);
      } else {
        this.log('Next.js 15 with TypeScript', false, `Missing: Next.js:${!hasNext}, TS:${!hasTypeScript}, Config:${!hasNextConfig}, TSConfig:${!hasTsConfig}`);
      }
    } catch (error) {
      this.log('Next.js 15 with TypeScript', false, `Error reading config: ${error.message}`);
    }
  }

  // Test 2: API Routes (Next.js API service)
  testApiRoutes() {
    try {
      const apiDir = 'src/app/api';
      const hasApiDir = fs.existsSync(apiDir);
      const hasStablecoinRoute = fs.existsSync(path.join(apiDir, 'stablecoin/[ticker]/route.ts'));
      const hasSearchRoute = fs.existsSync(path.join(apiDir, 'search/route.ts'));
      
      if (hasApiDir && hasStablecoinRoute && hasSearchRoute) {
        this.log('API Routes Setup', true, 'All required API routes exist');
      } else {
        this.log('API Routes Setup', false, `Missing: API dir:${!hasApiDir}, Stablecoin:${!hasStablecoinRoute}, Search:${!hasSearchRoute}`);
      }
    } catch (error) {
      this.log('API Routes Setup', false, `Error checking API routes: ${error.message}`);
    }
  }

  // Test 3: Environment and API Configuration
  testEnvironmentSetup() {
    try {
      const configExists = fs.existsSync('src/lib/config.ts');
      if (configExists) {
        const configContent = fs.readFileSync('src/lib/config.ts', 'utf8');
        const hasCoingecko = configContent.includes('coingecko');
        const hasCMC = configContent.includes('coinmarketcap');
        const hasGeckoTerminal = configContent.includes('geckoterminal');
        const hasDefillama = configContent.includes('defillama');
        
        if (hasCoingecko && hasCMC && hasGeckoTerminal && hasDefillama) {
          this.log('Environment & API Keys', true, 'All API configurations present');
        } else {
          this.log('Environment & API Keys', false, `Missing API configs: CG:${!hasCoingecko}, CMC:${!hasCMC}, GT:${!hasGeckoTerminal}, DL:${!hasDefillama}`);
        }
      } else {
        this.log('Environment & API Keys', false, 'Config file not found');
      }
    } catch (error) {
      this.log('Environment & API Keys', false, `Error checking config: ${error.message}`);
    }
  }

  // Test 4: shadcn/ui Integration
  testShadcnIntegration() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const hasLucideReact = packageJson.dependencies?.['lucide-react'];
      const hasClassVarianceAuthority = packageJson.dependencies?.['class-variance-authority'];
      const hasTailwind = packageJson.devDependencies?.tailwindcss;
      const hasComponentsJson = fs.existsSync('components.json');
      const hasUtilsFile = fs.existsSync('src/lib/utils.ts');
      
      if (hasLucideReact && hasClassVarianceAuthority && hasTailwind && hasComponentsJson && hasUtilsFile) {
        this.log('shadcn/ui Integration', true, 'All shadcn/ui dependencies and config present');
      } else {
        this.log('shadcn/ui Integration', false, `Missing: Lucide:${!hasLucideReact}, CVA:${!hasClassVarianceAuthority}, Tailwind:${!hasTailwind}, Config:${!hasComponentsJson}, Utils:${!hasUtilsFile}`);
      }
    } catch (error) {
      this.log('shadcn/ui Integration', false, `Error checking shadcn/ui: ${error.message}`);
    }
  }

  // Test 5: Dark/Light Theme Support
  testThemeSupport() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const hasNextThemes = packageJson.dependencies?.['next-themes'];
      const hasGlobalsCSS = fs.existsSync('src/app/globals.css');
      const hasTailwindConfig = fs.existsSync('tailwind.config.ts') || fs.existsSync('tailwind.config.js');
      
      if (hasNextThemes && hasGlobalsCSS && hasTailwindConfig) {
        const tailwindContent = fs.readFileSync(hasTailwindConfig ? 'tailwind.config.ts' : 'tailwind.config.js', 'utf8');
        const hasDarkMode = tailwindContent.includes('darkMode');
        
        if (hasDarkMode) {
          this.log('Dark/Light Theme Support', true, 'Theme system configured with next-themes and Tailwind');
        } else {
          this.log('Dark/Light Theme Support', false, 'Dark mode not configured in Tailwind');
        }
      } else {
        this.log('Dark/Light Theme Support', false, `Missing: next-themes:${!hasNextThemes}, globals.css:${!hasGlobalsCSS}, tailwind.config:${!hasTailwindConfig}`);
      }
    } catch (error) {
      this.log('Dark/Light Theme Support', false, `Error checking theme support: ${error.message}`);
    }
  }

  // Run all tests
  async runAllTests() {
    console.log('\n🧪 Running Phase 1: Project Setup Tests\n');
    console.log('=' * 50);
    
    this.testNextJsSetup();
    this.testApiRoutes();
    this.testEnvironmentSetup();
    this.testShadcnIntegration();
    this.testThemeSupport();
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const success = passed === total;
    
    console.log('\n' + '=' * 50);
    console.log(`📊 Phase 1 Results: ${passed}/${total} tests passed`);
    
    if (success) {
      console.log('🎉 Phase 1: Project Setup - ALL TESTS PASSED!');
    } else {
      console.log('⚠️  Phase 1: Project Setup - Some tests failed');
      console.log('\nFailed tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`   • ${r.test}: ${r.message}`);
      });
    }
    
    return { success, passed, total, results: this.results };
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Phase1Tests;
}

// Run tests if called directly
if (require.main === module) {
  const tests = new Phase1Tests();
  tests.runAllTests().then(result => {
    process.exit(result.success ? 0 : 1);
  });
} 