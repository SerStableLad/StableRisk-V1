/**
 * Phase 2: Frontend Landing & Search UI Test Cases
 * Tests for: Landing page components, search functionality, validation, UI elements
 */

const fs = require('fs');
const path = require('path');

class Phase2Tests {
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

  // Test 1: Landing Page Structure
  testLandingPageStructure() {
    try {
      const pageExists = fs.existsSync('src/app/page.tsx');
      if (pageExists) {
        const pageContent = fs.readFileSync('src/app/page.tsx', 'utf8');
        const hasStableRiskTitle = pageContent.includes('StableRisk');
        const hasSearchComponent = pageContent.includes('SearchBar') || pageContent.includes('search');
        const hasShieldIcon = pageContent.includes('Shield') || pageContent.includes('shield');
        
        if (hasStableRiskTitle && hasSearchComponent && hasShieldIcon) {
          this.log('Landing Page Structure', true, 'Main page has title, search, and branding');
        } else {
          this.log('Landing Page Structure', false, `Missing: Title:${!hasStableRiskTitle}, Search:${!hasSearchComponent}, Icon:${!hasShieldIcon}`);
        }
      } else {
        this.log('Landing Page Structure', false, 'Main page file not found');
      }
    } catch (error) {
      this.log('Landing Page Structure', false, `Error reading page: ${error.message}`);
    }
  }

  // Test 2: Search Bar Component
  testSearchBarComponent() {
    try {
      const searchBarExists = fs.existsSync('src/components/SearchBar.tsx');
      if (searchBarExists) {
        const content = fs.readFileSync('src/components/SearchBar.tsx', 'utf8');
        const hasInput = content.includes('input') || content.includes('Input');
        const hasValidation = content.includes('validation') || content.includes('validate');
        const hasNavigation = content.includes('router') || content.includes('navigate');
        const hasPopularTickers = content.includes('USDC') || content.includes('USDT');
        
        if (hasInput && hasValidation && hasNavigation && hasPopularTickers) {
          this.log('Search Bar Component', true, 'Search component has input, validation, navigation, and popular tickers');
        } else {
          this.log('Search Bar Component', false, `Missing: Input:${!hasInput}, Validation:${!hasValidation}, Navigation:${!hasNavigation}, PopularTickers:${!hasPopularTickers}`);
        }
      } else {
        this.log('Search Bar Component', false, 'SearchBar component not found');
      }
    } catch (error) {
      this.log('Search Bar Component', false, `Error checking SearchBar: ${error.message}`);
    }
  }

  // Test 3: Logo and Branding
  testLogoAndBranding() {
    try {
      const pageContent = fs.readFileSync('src/app/page.tsx', 'utf8');
      const hasStableRiskLogo = pageContent.includes('StableRisk');
      const hasSerStableLad = pageContent.includes('SerStableLad') || pageContent.includes('by SerStableLad');
      const hasDisclaimer = pageContent.includes('financial advice') || pageContent.includes('disclaimer');
      
      if (hasStableRiskLogo && hasSerStableLad && hasDisclaimer) {
        this.log('Logo and Branding', true, 'Has StableRisk logo, SerStableLad attribution, and disclaimer');
      } else {
        this.log('Logo and Branding', false, `Missing: Logo:${!hasStableRiskLogo}, Attribution:${!hasSerStableLad}, Disclaimer:${!hasDisclaimer}`);
      }
    } catch (error) {
      this.log('Logo and Branding', false, `Error checking branding: ${error.message}`);
    }
  }

  // Test 4: Feature Cards Implementation
  testFeatureCards() {
    try {
      const pageContent = fs.readFileSync('src/app/page.tsx', 'utf8');
      const hasPegStability = pageContent.includes('Peg Stability') || pageContent.includes('peg');
      const hasTransparency = pageContent.includes('Transparency');
      const hasLiquidity = pageContent.includes('Liquidity');
      const hasOracle = pageContent.includes('Oracle');
      const hasAudit = pageContent.includes('Audit');
      
      if (hasPegStability && hasTransparency && hasLiquidity && hasOracle && hasAudit) {
        this.log('Feature Cards', true, 'All 5 risk factors displayed as feature cards');
      } else {
        this.log('Feature Cards', false, `Missing factors: Peg:${!hasPegStability}, Transparency:${!hasTransparency}, Liquidity:${!hasLiquidity}, Oracle:${!hasOracle}, Audit:${!hasAudit}`);
      }
    } catch (error) {
      this.log('Feature Cards', false, `Error checking feature cards: ${error.message}`);
    }
  }

  // Test 5: Responsive Design and Styling
  testResponsiveDesign() {
    try {
      const globalsExists = fs.existsSync('src/app/globals.css');
      const tailwindConfigExists = fs.existsSync('tailwind.config.ts') || fs.existsSync('tailwind.config.js');
      
      if (globalsExists && tailwindConfigExists) {
        const pageContent = fs.readFileSync('src/app/page.tsx', 'utf8');
        const hasResponsiveClasses = pageContent.includes('sm:') || pageContent.includes('md:') || pageContent.includes('lg:');
        const hasContainerClasses = pageContent.includes('container') || pageContent.includes('max-w-');
        
        if (hasResponsiveClasses && hasContainerClasses) {
          this.log('Responsive Design', true, 'Page uses responsive classes and proper containers');
        } else {
          this.log('Responsive Design', false, `Missing: Responsive:${!hasResponsiveClasses}, Containers:${!hasContainerClasses}`);
        }
      } else {
        this.log('Responsive Design', false, `Missing: globals.css:${!globalsExists}, tailwind.config:${!tailwindConfigExists}`);
      }
    } catch (error) {
      this.log('Responsive Design', false, `Error checking responsive design: ${error.message}`);
    }
  }

  // Test 6: Dynamic Routing Setup
  testDynamicRouting() {
    try {
      const dynamicPageExists = fs.existsSync('src/app/[ticker]/page.tsx');
      const loadingExists = fs.existsSync('src/app/[ticker]/loading.tsx');
      
      if (dynamicPageExists) {
        this.log('Dynamic Routing', true, `Dynamic [ticker] route exists${loadingExists ? ' with loading state' : ''}`);
      } else {
        this.log('Dynamic Routing', false, 'Dynamic [ticker] route not found');
      }
    } catch (error) {
      this.log('Dynamic Routing', false, `Error checking dynamic routing: ${error.message}`);
    }
  }

  // Run all tests
  async runAllTests() {
    console.log('\n🧪 Running Phase 2: Frontend Landing & Search UI Tests\n');
    console.log('=' * 50);
    
    this.testLandingPageStructure();
    this.testSearchBarComponent();
    this.testLogoAndBranding();
    this.testFeatureCards();
    this.testResponsiveDesign();
    this.testDynamicRouting();
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const success = passed === total;
    
    console.log('\n' + '=' * 50);
    console.log(`📊 Phase 2 Results: ${passed}/${total} tests passed`);
    
    if (success) {
      console.log('🎉 Phase 2: Frontend Landing & Search UI - ALL TESTS PASSED!');
    } else {
      console.log('⚠️  Phase 2: Frontend Landing & Search UI - Some tests failed');
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
  module.exports = Phase2Tests;
}

// Run tests if called directly
if (require.main === module) {
  const tests = new Phase2Tests();
  tests.runAllTests().then(result => {
    process.exit(result.success ? 0 : 1);
  });
} 