import { CacheInvalidationLog } from '../cache';

describe('CacheInvalidationLog', () => {
  it('should have correct interface structure for complete entry', () => {
    const cacheLog: CacheInvalidationLog = {
      id: 'test-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      cacheKey: 'stablecoin:USDT:price',
      invalidatedAt: new Date(),
      reason: 'price_update',
      relatedTicker: 'USDT',
    };

    // Base entity properties
    expect(cacheLog).toHaveProperty('id');
    expect(cacheLog).toHaveProperty('createdAt');
    expect(cacheLog).toHaveProperty('updatedAt');

    // Cache-specific properties
    expect(cacheLog).toHaveProperty('cacheKey');
    expect(cacheLog).toHaveProperty('invalidatedAt');
    expect(cacheLog).toHaveProperty('reason');
    expect(cacheLog).toHaveProperty('relatedTicker');

    // Type validation
    expect(typeof cacheLog.cacheKey).toBe('string');
    expect(cacheLog.invalidatedAt).toBeInstanceOf(Date);
    expect(typeof cacheLog.reason).toBe('string');
    expect(typeof cacheLog.relatedTicker).toBe('string');
  });

  it('should allow minimal required properties', () => {
    const minimalLog: CacheInvalidationLog = {
      cacheKey: 'general:health_check',
      invalidatedAt: new Date(),
      reason: 'scheduled_refresh',
    };

    expect(minimalLog.cacheKey).toBe('general:health_check');
    expect(minimalLog.invalidatedAt).toBeInstanceOf(Date);
    expect(minimalLog.reason).toBe('scheduled_refresh');
    expect(minimalLog.relatedTicker).toBeUndefined();
  });

  it('should handle different cache key patterns', () => {
    const cacheKeys = [
      'stablecoin:USDT:price',
      'liquidity:DEX:uniswap_v3',
      'audit:report:2023_q1',
      'transparency:score:daily',
      'api:coingecko:market_data',
      'user:session:abc123'
    ];

    cacheKeys.forEach(key => {
      const log: CacheInvalidationLog = {
        cacheKey: key,
        invalidatedAt: new Date(),
        reason: 'test_invalidation',
      };

      expect(log.cacheKey).toBe(key);
    });
  });

  it('should handle different invalidation reasons', () => {
    const reasons = [
      'price_update',
      'scheduled_refresh',
      'manual_clear',
      'data_corruption',
      'system_restart',
      'memory_pressure',
      'ttl_expired',
      'dependency_change'
    ];

    reasons.forEach(reason => {
      const log: CacheInvalidationLog = {
        cacheKey: 'test:cache:key',
        invalidatedAt: new Date(),
        reason: reason,
        relatedTicker: 'USDT',
      };

      expect(log.reason).toBe(reason);
    });
  });

  it('should track invalidation timing', () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    const log: CacheInvalidationLog = {
      cacheKey: 'time:sensitive:data',
      invalidatedAt: fiveMinutesAgo,
      reason: 'data_stale',
      createdAt: now,
      relatedTicker: 'USDC',
    };

    expect(log.invalidatedAt.getTime()).toBeLessThan(log.createdAt!.getTime());
    expect(log.invalidatedAt).toBeInstanceOf(Date);
  });

  it('should handle cache entries without related tickers', () => {
    const systemCacheEntries = [
      { key: 'system:health', reason: 'health_check_refresh' },
      { key: 'api:rate_limits', reason: 'rate_limit_reset' },
      { key: 'config:settings', reason: 'configuration_update' },
      { key: 'user:preferences', reason: 'user_logout' }
    ];

    systemCacheEntries.forEach(({ key, reason }) => {
      const log: CacheInvalidationLog = {
        cacheKey: key,
        invalidatedAt: new Date(),
        reason: reason,
      };

      expect(log.cacheKey).toBe(key);
      expect(log.reason).toBe(reason);
      expect(log.relatedTicker).toBeUndefined();
    });
  });

  it('should handle ticker-specific cache entries', () => {
    const tickerCacheEntries = [
      { key: 'price:USDT', ticker: 'USDT' },
      { key: 'liquidity:USDC:analysis', ticker: 'USDC' },
      { key: 'audit:DAI:latest', ticker: 'DAI' },
      { key: 'transparency:BUSD:score', ticker: 'BUSD' }
    ];

    tickerCacheEntries.forEach(({ key, ticker }) => {
      const log: CacheInvalidationLog = {
        cacheKey: key,
        invalidatedAt: new Date(),
        reason: 'ticker_data_update',
        relatedTicker: ticker,
      };

      expect(log.cacheKey).toBe(key);
      expect(log.relatedTicker).toBe(ticker);
    });
  });

  it('should handle bulk invalidation scenarios', () => {
    const bulkInvalidationTime = new Date();
    const cacheKeys = [
      'stablecoin:USDT:all',
      'stablecoin:USDC:all',
      'stablecoin:DAI:all'
    ];

    const logs = cacheKeys.map(key => ({
      cacheKey: key,
      invalidatedAt: bulkInvalidationTime,
      reason: 'bulk_system_update',
      relatedTicker: key.split(':')[1],
    } as CacheInvalidationLog));

    logs.forEach(log => {
      expect(log.invalidatedAt).toBe(bulkInvalidationTime);
      expect(log.reason).toBe('bulk_system_update');
      expect(['USDT', 'USDC', 'DAI']).toContain(log.relatedTicker);
    });
  });
});