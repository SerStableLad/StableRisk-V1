const { describe, it, expect, beforeEach } = require('@jest/globals');
const { PegStabilityService } = require('../../src/lib/services/peg-stability');

describe('Peg Stability Analysis Tests', () => {
  let pegService;

  beforeEach(() => {
    pegService = new PegStabilityService();
  });

  describe('Price Data Fetching', () => {
    it('should fetch 365-day price data from CoinGecko', async () => {
      const data = await pegService.fetchPriceHistory('USDC', 365);
      expect(data).toHaveLength(365);
      expect(data[0]).toMatchObject({
        timestamp: expect.any(Number),
        price: expect.any(Number),
      });
    });

    it('should fallback to CoinMarketCap on CoinGecko failure', async () => {
      pegService.coingeckoFetch = jest.fn().mockRejectedValue(new Error('API Error'));
      const data = await pegService.fetchPriceHistory('USDT', 365);
      expect(data).toHaveLength(365);
      expect(data[0].source).toBe('coinmarketcap');
    });

    it('should handle missing data points', async () => {
      const data = await pegService.fetchPriceHistory('USDC', 365);
      const filledData = pegService.handleMissingDataPoints(data);
      expect(filledData).toHaveLength(365);
      expect(filledData.every(d => d.price > 0)).toBe(true);
    });
  });

  describe('Depeg Detection', () => {
    it('should detect depeg incidents beyond 4% threshold', async () => {
      const mockData = [
        { timestamp: 1, price: 1.00 },
        { timestamp: 2, price: 1.05 }, // +5% deviation
        { timestamp: 3, price: 1.00 }
      ];
      const incidents = pegService.detectDepegIncidents(mockData);
      expect(incidents).toHaveLength(1);
      expect(incidents[0]).toMatchObject({
        start_time: expect.any(Number),
        end_time: expect.any(Number),
        max_deviation: expect.any(Number),
      });
    });

    it('should calculate recovery times', async () => {
      const mockIncident = {
        start_time: Date.now() - 86400000, // 1 day ago
        end_time: Date.now(),
        max_deviation: 0.05
      };
      const recovery = pegService.calculateRecoveryTime(mockIncident);
      expect(recovery).toBe(24); // hours
    });

    it('should mark as depegged if no recovery within 1 month', async () => {
      const mockIncident = {
        start_time: Date.now() - (31 * 86400000), // 31 days ago
        end_time: null,
        max_deviation: 0.05
      };
      const status = pegService.checkDepegStatus(mockIncident);
      expect(status.depegged).toBe(true);
      expect(status.score).toBe(0);
    });
  });

  describe('Statistical Analysis', () => {
    it('should calculate average deviation percentage', async () => {
      const mockData = [
        { price: 1.01 }, // +1%
        { price: 0.99 }, // -1%
        { price: 1.00 }  // 0%
      ];
      const avgDeviation = pegService.calculateAverageDeviation(mockData);
      expect(avgDeviation).toBe(0.67); // ~0.67%
    });

    it('should calculate volatility metrics', async () => {
      const data = await pegService.fetchPriceHistory('USDC', 30);
      const metrics = pegService.calculateVolatilityMetrics(data);
      expect(metrics).toMatchObject({
        stdDev: expect.any(Number),
        maxDrawdown: expect.any(Number),
        sharpeRatio: expect.any(Number),
      });
    });

    it('should identify trend patterns', async () => {
      const data = await pegService.fetchPriceHistory('USDT', 30);
      const trends = pegService.identifyTrendPatterns(data);
      expect(trends).toMatchObject({
        uptrend_days: expect.any(Number),
        downtrend_days: expect.any(Number),
        stability_score: expect.any(Number),
      });
    });
  });

  describe('Risk Scoring', () => {
    it('should calculate peg stability score', async () => {
      const mockData = {
        average_deviation: 0.001,
        depeg_incidents: [],
        recovery_times: [],
        volatility: 0.0005
      };
      const score = pegService.calculatePegStabilityScore(mockData);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should apply penalties for recent depegs', async () => {
      const mockData = {
        average_deviation: 0.001,
        depeg_incidents: [{
          start_time: Date.now() - (7 * 86400000), // 7 days ago
          max_deviation: 0.05
        }],
        recovery_times: [24], // hours
        volatility: 0.0005
      };
      const score = pegService.calculatePegStabilityScore(mockData);
      expect(score).toBeLessThan(90); // Should have penalty
    });
  });

  describe('Error Handling', () => {
    it('should handle API failures gracefully', async () => {
      pegService.coingeckoFetch = jest.fn().mockRejectedValue(new Error('API Error'));
      pegService.cmcFetch = jest.fn().mockRejectedValue(new Error('API Error'));
      
      const result = await pegService.fetchPriceHistory('USDC', 365);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid time ranges', async () => {
      const result = await pegService.fetchPriceHistory('USDC', -1);
      expect(result.error).toBeDefined();
    });

    it('should validate price data integrity', async () => {
      const mockData = [
        { timestamp: 1, price: 'invalid' },
        { timestamp: 2, price: null }
      ];
      const isValid = pegService.validatePriceData(mockData);
      expect(isValid).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should perform full stability analysis', async () => {
      const analysis = await pegService.analyzeStability('USDC');
      expect(analysis).toMatchObject({
        peg_score: expect.any(Number),
        average_deviation: expect.any(Number),
        depeg_incidents: expect.any(Array),
        volatility_metrics: expect.any(Object),
        is_currently_depegged: expect.any(Boolean),
      });
    });

    it('should handle multiple concurrent analyses', async () => {
      const tokens = ['USDC', 'USDT', 'BUSD'];
      const results = await Promise.all(
        tokens.map(t => pegService.analyzeStability(t))
      );
      expect(results).toHaveLength(tokens.length);
    });
  });
}); 