const { describe, it, expect, beforeEach } = require('@jest/globals');
const { LiquidityAnalysisService } = require('../../src/lib/services/liquidity-analysis');

describe('Liquidity Analysis Tests', () => {
  let liquidityService;

  beforeEach(() => {
    liquidityService = new LiquidityAnalysisService();
  });

  describe('Data Fetching', () => {
    it('should fetch GeckoTerminal pool data', async () => {
      const pools = await liquidityService.fetchPoolData('USDC');
      expect(pools).toHaveLength(expect.any(Number));
      expect(pools[0]).toMatchObject({
        chain: expect.any(String),
        dex: expect.any(String),
        liquidity: expect.any(Number),
      });
    });

    it('should handle rate limiting gracefully', async () => {
      const promises = Array(10).fill().map(() => 
        liquidityService.fetchPoolData('USDT')
      );
      const results = await Promise.allSettled(promises);
      expect(results.some(r => r.status === 'fulfilled')).toBe(true);
    });

    it('should validate pool data integrity', async () => {
      const pools = await liquidityService.fetchPoolData('USDC');
      const validPools = liquidityService.validatePoolData(pools);
      expect(validPools.length).toBeLessThanOrEqual(pools.length);
      expect(validPools.every(p => p.liquidity > 0)).toBe(true);
    });
  });

  describe('Chain Distribution Analysis', () => {
    it('should calculate chain-wise distribution', async () => {
      const distribution = await liquidityService.analyzeChainDistribution('USDC');
      expect(distribution).toMatchObject({
        ethereum: expect.any(Number),
        polygon: expect.any(Number),
        // ... other chains
      });
      expect(Object.values(distribution).reduce((a, b) => a + b)).toBeCloseTo(100);
    });

    it('should identify dominant chains', async () => {
      const analysis = await liquidityService.identifyDominantChains('USDT');
      expect(analysis).toMatchObject({
        dominant_chains: expect.any(Array),
        concentration_risk: expect.any(String),
      });
    });

    it('should calculate chain diversity score', async () => {
      const score = await liquidityService.calculateChainDiversityScore('USDC');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('DEX Distribution Analysis', () => {
    it('should calculate DEX-wise distribution', async () => {
      const distribution = await liquidityService.analyzeDexDistribution('USDC');
      expect(distribution).toMatchObject({
        uniswap_v3: expect.any(Number),
        curve: expect.any(Number),
        // ... other DEXes
      });
      expect(Object.values(distribution).reduce((a, b) => a + b)).toBeCloseTo(100);
    });

    it('should identify dominant DEXes', async () => {
      const analysis = await liquidityService.identifyDominantDexes('USDT');
      expect(analysis).toMatchObject({
        dominant_dexes: expect.any(Array),
        concentration_risk: expect.any(String),
      });
    });

    it('should calculate DEX diversity score', async () => {
      const score = await liquidityService.calculateDexDiversityScore('USDC');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('Concentration Risk Assessment', () => {
    it('should assess pool concentration risk', async () => {
      const risk = await liquidityService.assessConcentrationRisk('USDC');
      expect(risk).toMatch(/High|Medium|Low/);
    });

    it('should calculate Herfindahl-Hirschman Index', async () => {
      const pools = await liquidityService.fetchPoolData('USDT');
      const hhi = liquidityService.calculateHHI(pools);
      expect(hhi).toBeGreaterThanOrEqual(0);
      expect(hhi).toBeLessThanOrEqual(10000);
    });

    it('should detect liquidity imbalances', async () => {
      const imbalances = await liquidityService.detectLiquidityImbalances('USDC');
      expect(imbalances).toMatchObject({
        has_imbalances: expect.any(Boolean),
        details: expect.any(Array),
      });
    });
  });

  describe('Historical Analysis', () => {
    it('should analyze liquidity trends', async () => {
      const trends = await liquidityService.analyzeLiquidityTrends('USDC', '30d');
      expect(trends).toMatchObject({
        trend: expect.any(String),
        growth_rate: expect.any(Number),
        volatility: expect.any(Number),
      });
    });

    it('should detect significant changes', async () => {
      const changes = await liquidityService.detectSignificantChanges('USDT', '7d');
      expect(changes).toMatchObject({
        has_significant_changes: expect.any(Boolean),
        changes: expect.any(Array),
      });
    });

    it('should calculate stability metrics', async () => {
      const metrics = await liquidityService.calculateStabilityMetrics('USDC', '30d');
      expect(metrics).toMatchObject({
        average_daily_change: expect.any(Number),
        max_drawdown: expect.any(Number),
        recovery_time: expect.any(Number),
      });
    });
  });

  describe('Scoring System', () => {
    it('should calculate overall liquidity score', async () => {
      const score = await liquidityService.calculateLiquidityScore('USDC');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should apply concentration penalties', async () => {
      const baseScore = await liquidityService.calculateBaseScore('USDT');
      const finalScore = await liquidityService.calculateLiquidityScore('USDT');
      expect(finalScore).toBeLessThanOrEqual(baseScore);
    });

    it('should reward diversity', async () => {
      const diverseScore = await liquidityService.calculateLiquidityScore('USDC');
      const concentratedScore = await liquidityService.calculateLiquidityScore('CONCENTRATED_TOKEN');
      expect(diverseScore).toBeGreaterThan(concentratedScore);
    });
  });

  describe('Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      liquidityService.fetch = jest.fn().mockRejectedValue(new Error('API Error'));
      const result = await liquidityService.fetchPoolData('USDC');
      expect(result.error).toBeDefined();
    });

    it('should handle missing pool data', async () => {
      const result = await liquidityService.fetchPoolData('UNKNOWN_TOKEN');
      expect(result.error).toBeDefined();
    });

    it('should validate numerical calculations', async () => {
      const invalidPools = [
        { liquidity: 'invalid' },
        { liquidity: null }
      ];
      const score = liquidityService.calculateHHI(invalidPools);
      expect(score).toBe(0);
    });
  });

  describe('Integration Tests', () => {
    it('should perform full liquidity analysis', async () => {
      const analysis = await liquidityService.analyzeLiquidity('USDC');
      expect(analysis).toMatchObject({
        total_liquidity: expect.any(Number),
        chain_distribution: expect.any(Object),
        dex_distribution: expect.any(Object),
        concentration_risk: expect.any(String),
        liquidity_score: expect.any(Number),
      });
    });

    it('should handle multiple concurrent analyses', async () => {
      const tokens = ['USDC', 'USDT', 'BUSD'];
      const results = await Promise.all(
        tokens.map(t => liquidityService.analyzeLiquidity(t))
      );
      expect(results).toHaveLength(tokens.length);
    });

    it('should maintain consistent scores across runs', async () => {
      const firstRun = await liquidityService.analyzeLiquidity('USDC');
      const secondRun = await liquidityService.analyzeLiquidity('USDC');
      expect(firstRun.liquidity_score).toBe(secondRun.liquidity_score);
    });
  });
}); 