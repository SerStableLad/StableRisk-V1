const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const { StablecoinMetadataService } = require('../../src/lib/services/metadata');

describe('Stablecoin Metadata Fetch Tests', () => {
  let metadataService;

  beforeEach(() => {
    metadataService = new StablecoinMetadataService();
  });

  describe('CoinGecko Primary Source', () => {
    it('should fetch basic metadata for USDC', async () => {
      const metadata = await metadataService.fetchMetadata('USDC');
      expect(metadata).toMatchObject({
        name: expect.any(String),
        symbol: expect.any(String),
        market_cap: expect.any(Number),
        total_supply: expect.any(Number),
      });
    });

    it('should handle rate limiting gracefully', async () => {
      // Make multiple rapid requests
      const promises = Array(10).fill().map(() => metadataService.fetchMetadata('USDC'));
      const results = await Promise.allSettled(promises);
      const hasRetries = results.some(r => r.status === 'fulfilled');
      expect(hasRetries).toBe(true);
    });

    it('should cache successful responses', async () => {
      const first = await metadataService.fetchMetadata('USDT');
      const second = await metadataService.fetchMetadata('USDT');
      expect(second._fromCache).toBe(true);
    });

    it('should respect cache TTL', async () => {
      const metadata = await metadataService.fetchMetadata('USDT');
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for cache to expire
      const refreshed = await metadataService.fetchMetadata('USDT');
      expect(refreshed._timestamp).toBeGreaterThan(metadata._timestamp);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tokens gracefully', async () => {
      const result = await metadataService.fetchMetadata('INVALID_TOKEN');
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/not found/i);
    });

    it('should handle network errors', async () => {
      metadataService.coingeckoFetch = jest.fn().mockRejectedValue(new Error('Network Error'));
      
      const result = await metadataService.fetchMetadata('USDC');
      expect(result.error).toBeDefined();
      expect(result.retries).toBeGreaterThan(0);
    });

    it('should handle API rate limits', async () => {
      metadataService.coingeckoFetch = jest.fn()
        .mockRejectedValueOnce(new Error('429 Too Many Requests'))
        .mockResolvedValueOnce({ id: 'usdc', name: 'USD Coin' });

      const result = await metadataService.fetchMetadata('USDC');
      expect(result.name).toBe('USD Coin');
      expect(result.retries).toBe(1);
    });
  });

  describe('Data Validation', () => {
    it('should validate required fields', async () => {
      const metadata = await metadataService.fetchMetadata('USDC');
      expect(metadata).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        symbol: expect.any(String),
        market_cap: expect.any(Number),
        total_supply: expect.any(Number),
        platforms: expect.any(Object),
      });
    });

    it('should handle missing fields gracefully', async () => {
      metadataService.coingeckoFetch = jest.fn().mockResolvedValue({
        id: 'usdc',
        name: 'USD Coin'
        // Missing other fields
      });

      const metadata = await metadataService.fetchMetadata('USDC');
      expect(metadata.symbol).toBe('USDC');
      expect(metadata.market_cap).toBe(0);
      expect(metadata.total_supply).toBe(0);
    });

    it('should normalize numerical values', async () => {
      metadataService.coingeckoFetch = jest.fn().mockResolvedValue({
        id: 'usdc',
        name: 'USD Coin',
        market_cap: '53000000000', // String number
        total_supply: null, // Null value
      });

      const metadata = await metadataService.fetchMetadata('USDC');
      expect(typeof metadata.market_cap).toBe('number');
      expect(typeof metadata.total_supply).toBe('number');
    });
  });

  describe('Performance', () => {
    it('should complete metadata fetch within timeout', async () => {
      const start = Date.now();
      await metadataService.fetchMetadata('USDC');
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent requests efficiently', async () => {
      const tokens = ['USDC', 'USDT', 'BUSD', 'DAI'];
      const start = Date.now();
      
      const results = await Promise.all(
        tokens.map(t => metadataService.fetchMetadata(t))
      );
      
      const duration = Date.now() - start;
      expect(results).toHaveLength(tokens.length);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
}); 