const { describe, it, expect, beforeEach } = require('@jest/globals');
const { OracleDetectionService } = require('../../src/lib/services/oracle-detection');

describe('Oracle Setup Detection Tests', () => {
  let oracleService;

  beforeEach(() => {
    oracleService = new OracleDetectionService();
  });

  describe('Oracle Configuration Detection', () => {
    it('should detect Chainlink oracle usage', async () => {
      const config = await oracleService.detectOracleConfig('USDC');
      expect(config.providers).toContain('chainlink');
      expect(config.feeds).toHaveLength(expect.any(Number));
    });

    it('should detect multi-oracle setups', async () => {
      const config = await oracleService.detectOracleConfig('USDT');
      expect(config.providers.length).toBeGreaterThan(1);
      expect(config.is_multi_oracle).toBe(true);
    });

    it('should identify oracle update frequency', async () => {
      const config = await oracleService.detectOracleConfig('USDC');
      expect(config.update_frequency).toMatch(/realtime|heartbeat|threshold/);
    });
  });

  describe('Provider Analysis', () => {
    it('should score provider reputation', async () => {
      const providers = ['chainlink', 'pyth', 'band'];
      const scores = await oracleService.scoreProviderReputation(providers);
      expect(scores.chainlink).toBeGreaterThan(90);
    });

    it('should analyze provider decentralization', async () => {
      const provider = 'chainlink';
      const analysis = await oracleService.analyzeProviderDecentralization(provider);
      expect(analysis).toMatchObject({
        node_count: expect.any(Number),
        unique_operators: expect.any(Number),
        decentralization_score: expect.any(Number),
      });
    });

    it('should detect provider uptime', async () => {
      const provider = 'chainlink';
      const uptime = await oracleService.checkProviderUptime(provider, '30d');
      expect(uptime).toBeGreaterThan(99.9);
    });
  });

  describe('Chain Diversity', () => {
    it('should analyze oracle deployment across chains', async () => {
      const analysis = await oracleService.analyzeChainDiversity('USDC');
      expect(analysis).toMatchObject({
        chain_count: expect.any(Number),
        chains: expect.any(Array),
        diversity_score: expect.any(Number),
      });
    });

    it('should detect cross-chain oracle consistency', async () => {
      const consistency = await oracleService.checkCrossChainConsistency('USDT');
      expect(consistency).toMatchObject({
        is_consistent: expect.any(Boolean),
        deviation_percentage: expect.any(Number),
      });
    });
  });

  describe('Feed Analysis', () => {
    it('should validate feed health', async () => {
      const feed = {
        address: '0x123...',
        chain: 'ethereum',
        provider: 'chainlink'
      };
      const health = await oracleService.checkFeedHealth(feed);
      expect(health).toMatchObject({
        is_active: expect.any(Boolean),
        last_update: expect.any(String),
        deviation: expect.any(Number),
      });
    });

    it('should detect stale feeds', async () => {
      const feeds = await oracleService.getOracleFeeds('USDC');
      const staleFeeds = oracleService.detectStaleFeeds(feeds);
      expect(Array.isArray(staleFeeds)).toBe(true);
    });

    it('should analyze feed deviation patterns', async () => {
      const feed = {
        address: '0x123...',
        chain: 'ethereum',
        provider: 'chainlink'
      };
      const patterns = await oracleService.analyzeFeedDeviations(feed, '7d');
      expect(patterns).toMatchObject({
        max_deviation: expect.any(Number),
        average_deviation: expect.any(Number),
        outliers: expect.any(Array),
      });
    });
  });

  describe('Scoring System', () => {
    it('should calculate overall oracle score', async () => {
      const config = {
        providers: ['chainlink', 'pyth'],
        is_multi_oracle: true,
        feeds: [/* mock feeds */],
        update_frequency: 'realtime'
      };
      const score = await oracleService.calculateOracleScore(config);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should apply multi-oracle bonus', async () => {
      const singleOracleScore = await oracleService.calculateOracleScore({
        providers: ['chainlink'],
        is_multi_oracle: false
      });
      const multiOracleScore = await oracleService.calculateOracleScore({
        providers: ['chainlink', 'pyth'],
        is_multi_oracle: true
      });
      expect(multiOracleScore).toBeGreaterThan(singleOracleScore);
    });

    it('should penalize for stale feeds', async () => {
      const config = {
        providers: ['chainlink'],
        feeds: [{
          last_update: new Date(Date.now() - 86400000 * 2).toISOString() // 2 days old
        }]
      };
      const score = await oracleService.calculateOracleScore(config);
      expect(score).toBeLessThan(90);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown oracle providers', async () => {
      const result = await oracleService.detectOracleConfig('UNKNOWN_TOKEN');
      expect(result.error).toBeDefined();
    });

    it('should handle network errors gracefully', async () => {
      oracleService.fetch = jest.fn().mockRejectedValue(new Error('Network Error'));
      const result = await oracleService.detectOracleConfig('USDC');
      expect(result.error).toBeDefined();
    });

    it('should validate oracle addresses', async () => {
      const invalidAddress = '0xinvalid';
      const isValid = await oracleService.validateOracleAddress(invalidAddress);
      expect(isValid).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should perform full oracle analysis', async () => {
      const analysis = await oracleService.analyzeOracleSetup('USDC');
      expect(analysis).toMatchObject({
        oracle_score: expect.any(Number),
        provider_analysis: expect.any(Object),
        chain_diversity: expect.any(Object),
        feed_health: expect.any(Object),
        recommendations: expect.any(Array),
      });
    });

    it('should handle multiple concurrent analyses', async () => {
      const tokens = ['USDC', 'USDT', 'BUSD'];
      const results = await Promise.all(
        tokens.map(t => oracleService.analyzeOracleSetup(t))
      );
      expect(results).toHaveLength(tokens.length);
    });

    it('should maintain consistent scores across runs', async () => {
      const firstRun = await oracleService.analyzeOracleSetup('USDC');
      const secondRun = await oracleService.analyzeOracleSetup('USDC');
      expect(firstRun.oracle_score).toBe(secondRun.oracle_score);
    });
  });
}); 