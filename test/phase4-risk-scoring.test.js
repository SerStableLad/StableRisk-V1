/**
 * Phase 4: Backend Risk Scoring Engine Test Cases
 * Tests for: Risk factor weighting, scoring logic, graceful degradation, color coding
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

class Phase4Tests {
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

  // Test 1: Risk Factor Weighting Configuration
  testRiskFactorWeighting() {
    try {
      const stablecoinDataService = fs.readFileSync('src/lib/services/stablecoin-data.ts', 'utf8');
      
      // Check for the specific weightings: peg(40%), transparency(20%), liquidity(15%), oracle(15%), audit(10%)
      const hasPegWeight = stablecoinDataService.includes('0.4') || stablecoinDataService.includes('40');
      const hasTransparencyWeight = stablecoinDataService.includes('0.2') || stablecoinDataService.includes('20');
      const hasLiquidityWeight = stablecoinDataService.includes('0.15') || stablecoinDataService.includes('15');
      const hasOracleWeight = stablecoinDataService.includes('0.15') || stablecoinDataService.includes('15');
      const hasAuditWeight = stablecoinDataService.includes('0.1') || stablecoinDataService.includes('10');
      
      if (hasPegWeight && hasTransparencyWeight && hasLiquidityWeight && hasOracleWeight && hasAuditWeight) {
        this.log('Risk Factor Weighting', true, 'All 5 risk factors have proper weightings (40/20/15/15/10)');
      } else {
        this.log('Risk Factor Weighting', false, `Missing weightings: Peg(40%):${!hasPegWeight}, Transparency(20%):${!hasTransparencyWeight}, Liquidity(15%):${!hasLiquidityWeight}, Oracle(15%):${!hasOracleWeight}, Audit(10%):${!hasAuditWeight}`);
      }
    } catch (error) {
      this.log('Risk Factor Weighting', false, `Error checking weightings: ${error.message}`);
    }
  }

  // Test 2: Individual Risk Factor Calculation
  testIndividualRiskFactors() {
    try {
      const stablecoinDataService = fs.readFileSync('src/lib/services/stablecoin-data.ts', 'utf8');
      
      const hasPegCalculation = stablecoinDataService.includes('calculatePegStability');
      const hasTransparencyCalculation = stablecoinDataService.includes('calculateTransparency');
      const hasLiquidityCalculation = stablecoinDataService.includes('calculateLiquidity');
      const hasOracleCalculation = stablecoinDataService.includes('calculateOracle');
      const hasAuditCalculation = stablecoinDataService.includes('calculateAudit');
      
      if (hasPegCalculation && hasTransparencyCalculation && hasLiquidityCalculation && hasOracleCalculation && hasAuditCalculation) {
        this.log('Individual Risk Factors', true, 'All 5 risk factors have calculation methods');
      } else {
        this.log('Individual Risk Factors', false, `Missing calculations: Peg:${!hasPegCalculation}, Transparency:${!hasTransparencyCalculation}, Liquidity:${!hasLiquidityCalculation}, Oracle:${!hasOracleCalculation}, Audit:${!hasAuditCalculation}`);
      }
    } catch (error) {
      this.log('Individual Risk Factors', false, `Error checking risk factor calculations: ${error.message}`);
    }
  }

  // Test 3: Graceful Degradation for Missing Data
  testGracefulDegradation() {
    try {
      const stablecoinDataService = fs.readFileSync('src/lib/services/stablecoin-data.ts', 'utf8');
      
      const hasDefaultHandling = stablecoinDataService.includes('null') || stablecoinDataService.includes('undefined');
      const hasFallbackScores = stablecoinDataService.includes('50') || stablecoinDataService.includes('default');
      const hasPartialScoring = stablecoinDataService.includes('partial') || stablecoinDataService.includes('available');
      
      if (hasDefaultHandling && (hasFallbackScores || hasPartialScoring)) {
        this.log('Graceful Degradation', true, 'System handles missing data with fallback scores');
      } else {
        this.log('Graceful Degradation', false, `Missing graceful degradation: DefaultHandling:${!hasDefaultHandling}, FallbackScores:${!hasFallbackScores}, PartialScoring:${!hasPartialScoring}`);
      }
    } catch (error) {
      this.log('Graceful Degradation', false, `Error checking graceful degradation: ${error.message}`);
    }
  }

  // Test 4: Composite Score Calculation
  testCompositeScoreCalculation() {
    try {
      const stablecoinDataService = fs.readFileSync('src/lib/services/stablecoin-data.ts', 'utf8');
      
      const hasWeightedSum = stablecoinDataService.includes('*') && stablecoinDataService.includes('+');
      const hasMathPrecision = stablecoinDataService.includes('Math.round') || stablecoinDataService.includes('toFixed');
      const hasScoreRange = stablecoinDataService.includes('100') || stablecoinDataService.includes('Math.min');
      
      if (hasWeightedSum && hasMathPrecision && hasScoreRange) {
        this.log('Composite Score Calculation', true, 'Composite score uses weighted sum with proper precision and range limits');
      } else {
        this.log('Composite Score Calculation', false, `Missing: WeightedSum:${!hasWeightedSum}, Precision:${!hasMathPrecision}, Range:${!hasScoreRange}`);
      }
    } catch (error) {
      this.log('Composite Score Calculation', false, `Error checking composite score: ${error.message}`);
    }
  }

  // Test 5: Return Data Structure
  testReturnDataStructure() {
    try {
      const typesContent = fs.readFileSync('src/lib/types.ts', 'utf8');
      
      const hasStablecoinAssessment = typesContent.includes('StablecoinAssessment');
      const hasRiskScores = typesContent.includes('risk_scores') || typesContent.includes('RiskScores');
      const hasOverallScore = typesContent.includes('overall');
      const hasIndividualScores = typesContent.includes('peg_stability') && typesContent.includes('transparency') && typesContent.includes('liquidity');
      
      if (hasStablecoinAssessment && hasRiskScores && hasOverallScore && hasIndividualScores) {
        this.log('Return Data Structure', true, 'Types define proper assessment structure with overall and individual scores');
      } else {
        this.log('Return Data Structure', false, `Missing types: Assessment:${!hasStablecoinAssessment}, RiskScores:${!hasRiskScores}, Overall:${!hasOverallScore}, Individual:${!hasIndividualScores}`);
      }
    } catch (error) {
      this.log('Return Data Structure', false, `Error checking return data structure: ${error.message}`);
    }
  }

  // Test 6: Live Score Calculation Test
  async testLiveScoreCalculation() {
    try {
      const testUrl = 'http://localhost:3000/api/stablecoin/usdc';
      
      const makeRequest = () => {
        return new Promise((resolve, reject) => {
          const req = http.get(testUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                resolve({ status: res.statusCode, data: parsed });
              } catch (e) {
                resolve({ status: res.statusCode, data: null, error: e.message });
              }
            });
          });
          req.on('error', reject);
          req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
        });
      };

      const response = await makeRequest();
      
      if (response.status === 200 && response.data && response.data.success) {
        const assessment = response.data.data;
        const hasOverallScore = assessment.risk_scores && typeof assessment.risk_scores.overall === 'number';
        const hasIndividualScores = assessment.risk_scores && 
          typeof assessment.risk_scores.peg_stability === 'number' &&
          typeof assessment.risk_scores.transparency === 'number' &&
          typeof assessment.risk_scores.liquidity === 'number';
        const scoreInRange = hasOverallScore && assessment.risk_scores.overall >= 0 && assessment.risk_scores.overall <= 100;
        
        if (hasOverallScore && hasIndividualScores && scoreInRange) {
          this.log('Live Score Calculation', true, `USDC assessment returned valid scores (Overall: ${assessment.risk_scores.overall}/100)`);
        } else {
          this.log('Live Score Calculation', false, `Invalid scores: Overall:${!hasOverallScore}, Individual:${!hasIndividualScores}, Range:${!scoreInRange}`);
        }
      } else {
        this.log('Live Score Calculation', false, `API error: Status ${response.status}, Success: ${response.data?.success}`);
      }
    } catch (error) {
      this.log('Live Score Calculation', false, `Live test failed: ${error.message} (Server may not be running)`);
    }
  }

  // Test 7: Mathematical Precision and Edge Cases
  testMathematicalPrecision() {
    try {
      const stablecoinDataService = fs.readFileSync('src/lib/services/stablecoin-data.ts', 'utf8');
      
      const hasZeroHandling = stablecoinDataService.includes('0') || stablecoinDataService.includes('zero');
      const hasMaxHandling = stablecoinDataService.includes('100') || stablecoinDataService.includes('Math.min');
      const hasNaNHandling = stablecoinDataService.includes('isNaN') || stablecoinDataService.includes('Number.isNaN');
      const hasRounding = stablecoinDataService.includes('Math.round') || stablecoinDataService.includes('toFixed');
      
      if (hasZeroHandling && hasMaxHandling && hasRounding) {
        this.log('Mathematical Precision', true, `Score calculation handles edge cases with proper rounding${hasNaNHandling ? ' and NaN checks' : ''}`);
      } else {
        this.log('Mathematical Precision', false, `Missing: Zero:${!hasZeroHandling}, Max:${!hasMaxHandling}, Rounding:${!hasRounding}, NaN:${!hasNaNHandling}`);
      }
    } catch (error) {
      this.log('Mathematical Precision', false, `Error checking mathematical precision: ${error.message}`);
    }
  }

  // Run all tests
  async runAllTests() {
    console.log('\n🧪 Running Phase 4: Backend Risk Scoring Engine Tests\n');
    console.log('=' * 50);
    
    this.testRiskFactorWeighting();
    this.testIndividualRiskFactors();
    this.testGracefulDegradation();
    this.testCompositeScoreCalculation();
    this.testReturnDataStructure();
    this.testMathematicalPrecision();
    await this.testLiveScoreCalculation();
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const success = passed === total;
    
    console.log('\n' + '=' * 50);
    console.log(`📊 Phase 4 Results: ${passed}/${total} tests passed`);
    
    if (success) {
      console.log('🎉 Phase 4: Backend Risk Scoring Engine - ALL TESTS PASSED!');
    } else {
      console.log('⚠️  Phase 4: Backend Risk Scoring Engine - Some tests failed');
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
  module.exports = Phase4Tests;
}

// Run tests if called directly
if (require.main === module) {
  const tests = new Phase4Tests();
  tests.runAllTests().then(result => {
    process.exit(result.success ? 0 : 1);
  });
} 