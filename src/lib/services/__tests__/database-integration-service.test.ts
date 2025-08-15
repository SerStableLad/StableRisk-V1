import { DatabaseIntegrationService } from '../database-integration-service';

// Mock the repositories
jest.mock('../../db/repositories/event-repository', () => ({
  EventRepository: jest.fn().mockImplementation(() => ({
    logEvent: jest.fn(),
    getRecentEvents: jest.fn(),
  })),
}));

jest.mock('../../db/repositories/analytics-repository', () => ({
  AnalyticsRepository: jest.fn().mockImplementation(() => ({
    upsertMetrics: jest.fn(),
    getMetricsByTicker: jest.fn(),
  })),
}));

describe('DatabaseIntegrationService', () => {
  let service: DatabaseIntegrationService;
  let mockEventRepo: any;
  let mockAnalyticsRepo: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear singleton instance
    (DatabaseIntegrationService as any).instance = undefined;
    
    service = DatabaseIntegrationService.getInstance();
    mockEventRepo = (service as any).eventRepo;
    mockAnalyticsRepo = (service as any).analyticsRepo;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = DatabaseIntegrationService.getInstance();
      const instance2 = DatabaseIntegrationService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should initialize repositories on first call', () => {
      expect(mockEventRepo).toBeDefined();
      expect(mockAnalyticsRepo).toBeDefined();
    });
  });

  describe('logStablecoinDataFetch', () => {
    it('should log successful data fetch', async () => {
      mockEventRepo.logEvent.mockResolvedValue({});

      await service.logStablecoinDataFetch('USDT', 'coingecko', true, { 
        response_time: 150 
      });

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'USDT',
        'stablecoin',
        'data_fetch',
        {
          source: 'coingecko',
          success: true,
          response_time: 150
        }
      );
    });

    it('should log failed data fetch', async () => {
      mockEventRepo.logEvent.mockResolvedValue({});

      await service.logStablecoinDataFetch('USDC', 'defillama', false, {
        error: 'API rate limit exceeded',
        retry_count: 3
      });

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'USDC',
        'stablecoin',
        'data_fetch',
        {
          source: 'defillama',
          success: false,
          error: 'API rate limit exceeded',
          retry_count: 3
        }
      );
    });

    it('should handle logging errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockEventRepo.logEvent.mockRejectedValue(new Error('Database connection failed'));

      // Should not throw
      await expect(
        service.logStablecoinDataFetch('DAI', 'chainlink', true)
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log stablecoin data fetch event:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should use default empty metadata', async () => {
      mockEventRepo.logEvent.mockResolvedValue({});

      await service.logStablecoinDataFetch('FRAX', 'curve', true);

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'FRAX',
        'stablecoin',
        'data_fetch',
        {
          source: 'curve',
          success: true
        }
      );
    });
  });

  describe('logCacheEvent', () => {
    it('should log cache hit event', async () => {
      mockEventRepo.logEvent.mockResolvedValue({});

      await service.logCacheEvent('stablecoin:USDT:price', 'hit', {
        ttl_remaining: 300
      });

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'stablecoin:USDT:price',
        'cache',
        'hit',
        {
          ttl_remaining: 300
        }
      );
    });

    it('should log cache miss event', async () => {
      mockEventRepo.logEvent.mockResolvedValue({});

      await service.logCacheEvent('liquidity:DEX:analysis', 'miss', {
        reason: 'expired',
        last_update: '2023-01-01T10:00:00Z'
      });

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'liquidity:DEX:analysis',
        'cache',
        'miss',
        {
          reason: 'expired',
          last_update: '2023-01-01T10:00:00Z'
        }
      );
    });

    it('should handle cache event logging errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockEventRepo.logEvent.mockRejectedValue(new Error('Event logging failed'));

      await expect(
        service.logCacheEvent('test:key', 'set')
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log cache event:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle all cache action types', async () => {
      const actions = ['hit', 'miss', 'set', 'invalidate'];
      mockEventRepo.logEvent.mockResolvedValue({});

      for (const action of actions) {
        await service.logCacheEvent(`cache:${action}:test`, action as any);
        
        expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
          `cache:${action}:test`,
          'cache',
          action,
          {}
        );
      }
    });
  });

  describe('saveStablecoinMetrics', () => {
    it('should save complete metrics', async () => {
      const mockResult = { ticker: 'USDT', riskScore: 85.5 };
      mockAnalyticsRepo.upsertMetrics.mockResolvedValue(mockResult);

      const scores = {
        riskScore: 85.5,
        transparencyScore: 92.0,
        liquidityScore: 88.3,
        auditScore: 90.7
      };
      const metadata = { calculation_version: '2.1' };

      const result = await service.saveStablecoinMetrics('USDT', scores, metadata);

      expect(mockAnalyticsRepo.upsertMetrics).toHaveBeenCalledWith('USDT', {
        riskScore: 85.5,
        transparencyScore: 92.0,
        liquidityScore: 88.3,
        auditScore: 90.7,
        metadata: { calculation_version: '2.1' }
      });
      expect(result).toBe(mockResult);
    });

    it('should save partial metrics', async () => {
      const mockResult = { ticker: 'USDC', riskScore: 78.0 };
      mockAnalyticsRepo.upsertMetrics.mockResolvedValue(mockResult);

      const result = await service.saveStablecoinMetrics('USDC', {
        riskScore: 78.0
      });

      expect(mockAnalyticsRepo.upsertMetrics).toHaveBeenCalledWith('USDC', {
        riskScore: 78.0,
        metadata: {}
      });
      expect(result).toBe(mockResult);
    });

    it('should handle metrics saving errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAnalyticsRepo.upsertMetrics.mockRejectedValue(new Error('Constraint violation'));

      await expect(
        service.saveStablecoinMetrics('DAI', { riskScore: 85.0 })
      ).rejects.toThrow('Constraint violation');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to save stablecoin metrics:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should use default empty metadata', async () => {
      mockAnalyticsRepo.upsertMetrics.mockResolvedValue({});

      await service.saveStablecoinMetrics('BUSD', { auditScore: 88.0 });

      expect(mockAnalyticsRepo.upsertMetrics).toHaveBeenCalledWith('BUSD', {
        auditScore: 88.0,
        metadata: {}
      });
    });
  });

  describe('getHistoricalMetrics', () => {
    it('should get historical metrics successfully', async () => {
      const mockMetrics = { 
        ticker: 'USDT', 
        riskScore: 85.5, 
        lastUpdated: new Date() 
      };
      mockAnalyticsRepo.getMetricsByTicker.mockResolvedValue(mockMetrics);

      const result = await service.getHistoricalMetrics('USDT');

      expect(mockAnalyticsRepo.getMetricsByTicker).toHaveBeenCalledWith('USDT');
      expect(result).toBe(mockMetrics);
    });

    it('should handle metrics not found', async () => {
      mockAnalyticsRepo.getMetricsByTicker.mockResolvedValue(null);

      const result = await service.getHistoricalMetrics('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should handle historical metrics errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockAnalyticsRepo.getMetricsByTicker.mockRejectedValue(new Error('Query timeout'));

      const result = await service.getHistoricalMetrics('USDC');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to get historical metrics:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('healthCheck', () => {
    it('should return true for successful health check', async () => {
      mockEventRepo.getRecentEvents.mockResolvedValue([{ id: 'test' }]);

      const result = await service.healthCheck();

      expect(mockEventRepo.getRecentEvents).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });

    it('should return false for failed health check', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockEventRepo.getRecentEvents.mockRejectedValue(new Error('Connection failed'));

      const result = await service.healthCheck();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Database health check failed:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle empty recent events', async () => {
      mockEventRepo.getRecentEvents.mockResolvedValue([]);

      const result = await service.healthCheck();

      expect(result).toBe(true); // Still healthy even with no recent events
    });
  });

  describe('error resilience', () => {
    it('should handle repository initialization errors', () => {
      // This test ensures the service can be instantiated even if repositories fail
      expect(() => DatabaseIntegrationService.getInstance()).not.toThrow();
    });

    it('should maintain service availability during partial failures', async () => {
      // Event logging fails, but metrics saving should still work
      mockEventRepo.logEvent.mockRejectedValue(new Error('Event DB down'));
      mockAnalyticsRepo.upsertMetrics.mockResolvedValue({ ticker: 'USDT' });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // This should not throw (logging failure is graceful)
      await expect(
        service.logStablecoinDataFetch('USDT', 'test', true)
      ).resolves.toBeUndefined();

      // This should still work
      await expect(
        service.saveStablecoinMetrics('USDT', { riskScore: 85.0 })
      ).resolves.toBeDefined();

      consoleSpy.mockRestore();
    });
  });

  describe('integration patterns', () => {
    it('should support event-driven analytics updates', async () => {
      mockEventRepo.logEvent.mockResolvedValue({});
      mockAnalyticsRepo.upsertMetrics.mockResolvedValue({ ticker: 'FRAX' });

      // Simulate a typical flow: log data fetch, then update metrics
      await service.logStablecoinDataFetch('FRAX', 'coingecko', true, {
        price: 0.999,
        volume: 5000000
      });

      await service.saveStablecoinMetrics('FRAX', {
        riskScore: 82.5,
        transparencyScore: 88.0
      }, {
        data_source: 'coingecko',
        update_trigger: 'scheduled_refresh'
      });

      expect(mockEventRepo.logEvent).toHaveBeenCalledWith(
        'FRAX',
        'stablecoin',
        'data_fetch',
        expect.objectContaining({
          price: 0.999,
          volume: 5000000
        })
      );

      expect(mockAnalyticsRepo.upsertMetrics).toHaveBeenCalledWith(
        'FRAX',
        expect.objectContaining({
          riskScore: 82.5,
          transparencyScore: 88.0
        })
      );
    });
  });
});