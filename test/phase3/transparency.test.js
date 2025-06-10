const { describe, it, expect, beforeEach } = require('@jest/globals');
const { TransparencyService } = require('../../src/lib/services/transparency');

describe('Transparency & Proof of Reserves Tests', () => {
  let transparencyService;

  beforeEach(() => {
    transparencyService = new TransparencyService();
  });

  describe('Dashboard Discovery', () => {
    it('should discover transparency dashboards for major stablecoins', async () => {
      const tokens = ['USDC', 'USDT', 'BUSD'];
      const results = await Promise.all(
        tokens.map(t => transparencyService.discoverDashboard(t))
      );
      expect(results.every(r => r.dashboard_url)).toBe(true);
    });

    it('should validate dashboard accessibility', async () => {
      const dashboard = await transparencyService.discoverDashboard('USDC');
      const isAccessible = await transparencyService.validateDashboard(dashboard.dashboard_url);
      expect(isAccessible).toBe(true);
    });

    it('should handle tokens without dashboards', async () => {
      const result = await transparencyService.discoverDashboard('UNKNOWN_TOKEN');
      expect(result.error).toBeDefined();
    });
  });

  describe('Proof of Reserves Detection', () => {
    it('should detect on-chain proof of reserves', async () => {
      const reserves = await transparencyService.detectProofOfReserves('USDC');
      expect(reserves).toMatchObject({
        has_proof: expect.any(Boolean),
        verification_method: expect.any(String),
        last_verification: expect.any(String),
      });
    });

    it('should validate proof of reserves data', async () => {
      const reserves = await transparencyService.detectProofOfReserves('USDT');
      const isValid = await transparencyService.validateReservesData(reserves);
      expect(isValid).toBe(true);
    });

    it('should detect real-time vs delayed verification', async () => {
      const reserves = await transparencyService.detectProofOfReserves('BUSD');
      expect(reserves.verification_frequency).toMatch(/real-time|daily|monthly/);
    });
  });

  describe('Verification Status', () => {
    it('should track verification status over time', async () => {
      const history = await transparencyService.getVerificationHistory('USDC', '30d');
      expect(history).toHaveLength(expect.any(Number));
      expect(history[0]).toMatchObject({
        date: expect.any(String),
        status: expect.any(String),
      });
    });

    it('should detect verification gaps', async () => {
      const history = await transparencyService.getVerificationHistory('USDT', '30d');
      const gaps = transparencyService.detectVerificationGaps(history);
      expect(Array.isArray(gaps)).toBe(true);
    });

    it('should calculate verification reliability score', async () => {
      const score = await transparencyService.calculateReliabilityScore('USDC');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('Data Freshness', () => {
    it('should check data freshness', async () => {
      const freshness = await transparencyService.checkDataFreshness('USDC');
      expect(freshness).toMatchObject({
        last_update: expect.any(String),
        is_fresh: expect.any(Boolean),
      });
    });

    it('should handle stale data gracefully', async () => {
      const staleData = {
        last_update: '2020-01-01',
        data: { /* ... */ }
      };
      const result = await transparencyService.handleStaleData(staleData);
      expect(result.warning).toBeDefined();
    });
  });

  describe('Source Verification', () => {
    it('should verify official data sources', async () => {
      const sources = await transparencyService.verifyDataSources('USDC');
      expect(sources.every(s => s.verified)).toBe(true);
    });

    it('should detect unofficial sources', async () => {
      const sources = await transparencyService.verifyDataSources('UNKNOWN_TOKEN');
      expect(sources.some(s => !s.verified)).toBe(true);
    });

    it('should validate source authenticity', async () => {
      const source = {
        url: 'https://example.com/transparency',
        claimed_issuer: 'Circle'
      };
      const isAuthentic = await transparencyService.validateSourceAuthenticity(source);
      expect(typeof isAuthentic).toBe('boolean');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      transparencyService.fetch = jest.fn().mockRejectedValue(new Error('Network Error'));
      const result = await transparencyService.discoverDashboard('USDC');
      expect(result.error).toBeDefined();
    });

    it('should handle malformed dashboard data', async () => {
      const malformedData = { /* incomplete data */ };
      const result = await transparencyService.validateDashboard(malformedData);
      expect(result.error).toBeDefined();
    });

    it('should handle API rate limits', async () => {
      const promises = Array(10).fill().map(() => 
        transparencyService.discoverDashboard('USDC')
      );
      const results = await Promise.allSettled(promises);
      expect(results.some(r => r.status === 'fulfilled')).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should perform full transparency check', async () => {
      const result = await transparencyService.fullTransparencyCheck('USDC');
      expect(result).toMatchObject({
        has_dashboard: expect.any(Boolean),
        has_proof_of_reserves: expect.any(Boolean),
        verification_status: expect.any(String),
        reliability_score: expect.any(Number),
        data_freshness: expect.any(Object),
      });
    });

    it('should handle multiple concurrent checks', async () => {
      const tokens = ['USDC', 'USDT', 'BUSD'];
      const results = await Promise.all(
        tokens.map(t => transparencyService.fullTransparencyCheck(t))
      );
      expect(results).toHaveLength(tokens.length);
    });
  });
}); 