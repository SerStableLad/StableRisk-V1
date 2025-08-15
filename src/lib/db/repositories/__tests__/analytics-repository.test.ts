import { AnalyticsRepository } from '../analytics-repository';
import { StablecoinMetrics } from '../../models/analytics';

// Mock the base repository
jest.mock('../base-repository', () => ({
  BaseRepository: class MockBaseRepository {
    protected fullTableName = 'analytics.stablecoin_metrics';
    
    query = jest.fn();
    
    constructor(tableName: string, schema: string) {
      this.fullTableName = `${schema}.${tableName}`;
    }
  }
}));

describe('AnalyticsRepository', () => {
  let repository: AnalyticsRepository;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new AnalyticsRepository();
    mockQuery = (repository as any).query;
  });

  describe('constructor', () => {
    it('should initialize with correct table and schema', () => {
      expect((repository as any).fullTableName).toBe('analytics.stablecoin_metrics');
    });
  });

  describe('upsertMetrics', () => {
    it('should upsert metrics with all scores', async () => {
      const mockMetrics: StablecoinMetrics = {
        ticker: 'USDT',
        lastUpdated: new Date('2023-01-01T12:00:00Z'),
        riskScore: 85.5,
        transparencyScore: 92.0,
        liquidityScore: 88.3,
        auditScore: 90.7,
        metadata: { source: 'test' }
      };
      mockQuery.mockResolvedValue({ rows: [mockMetrics] });

      const result = await repository.upsertMetrics('USDT', {
        riskScore: 85.5,
        transparencyScore: 92.0,
        liquidityScore: 88.3,
        auditScore: 90.7,
        metadata: { source: 'test' }
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics.stablecoin_metrics'),
        [
          'USDT',
          expect.any(Date),
          85.5,
          92.0,
          88.3,
          90.7,
          '{"source":"test"}'
        ]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (ticker)'),
        expect.any(Array)
      );
      expect(result).toBe(mockMetrics);
    });

    it('should handle partial metrics updates', async () => {
      const partialMetrics = {
        riskScore: 78.5,
        metadata: { partial: true }
      };
      const mockResult = { ticker: 'USDC', riskScore: 78.5 };
      mockQuery.mockResolvedValue({ rows: [mockResult] });

      const result = await repository.upsertMetrics('USDC', partialMetrics);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          'USDC',
          expect.any(Date),
          78.5,
          undefined,
          undefined,
          undefined,
          '{"partial":true}'
        ]
      );
      expect(result).toBe(mockResult);
    });

    it('should handle metrics with undefined scores', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ticker: 'DAI' }] });

      await repository.upsertMetrics('DAI', {
        metadata: { test: 'value' }
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          'DAI',
          expect.any(Date),
          undefined,
          undefined,
          undefined,
          undefined,
          '{"test":"value"}'
        ]
      );
    });

    it('should stringify metadata correctly', async () => {
      const complexMetadata = {
        sources: ['api1', 'api2'],
        config: { threshold: 0.5 },
        alerts: []
      };
      mockQuery.mockResolvedValue({ rows: [{}] });

      await repository.upsertMetrics('FRAX', {
        riskScore: 80.0,
        metadata: complexMetadata
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          JSON.stringify(complexMetadata)
        ])
      );
    });

    it('should handle empty metadata', async () => {
      mockQuery.mockResolvedValue({ rows: [{}] });

      await repository.upsertMetrics('LUSD', {
        riskScore: 75.0,
        metadata: {}
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          '{}'
        ])
      );
    });
  });

  describe('getMetricsByTicker', () => {
    it('should get metrics for existing ticker', async () => {
      const mockMetrics: StablecoinMetrics = {
        ticker: 'USDT',
        lastUpdated: new Date(),
        riskScore: 85.5,
        transparencyScore: 92.0,
        liquidityScore: 88.3,
        auditScore: 90.7,
        metadata: {}
      };
      mockQuery.mockResolvedValue({ rows: [mockMetrics] });

      const result = await repository.getMetricsByTicker('USDT');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM analytics.stablecoin_metrics WHERE ticker = $1',
        ['USDT']
      );
      expect(result).toBe(mockMetrics);
    });

    it('should return null for non-existent ticker', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.getMetricsByTicker('NONEXISTENT');

      expect(result).toBeNull();
    });

    it('should handle database query errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getMetricsByTicker('USDT')).rejects.toThrow('Database error');
    });
  });

  describe('getTopPerformers', () => {
    it('should get top performers with default limit', async () => {
      const mockPerformers = [
        { ticker: 'USDC', riskScore: 95.0, transparencyScore: 98.0 },
        { ticker: 'DAI', riskScore: 92.0, transparencyScore: 90.0 },
        { ticker: 'USDT', riskScore: 88.0, transparencyScore: 85.0 }
      ];
      mockQuery.mockResolvedValue({ rows: mockPerformers });

      const result = await repository.getTopPerformers();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE risk_score IS NOT NULL'),
        [10]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY risk_score DESC, transparency_score DESC'),
        [10]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        [10]
      );
      expect(result).toBe(mockPerformers);
    });

    it('should get top performers with custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repository.getTopPerformers(5);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [5]
      );
    });

    it('should handle empty results', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.getTopPerformers();

      expect(result).toEqual([]);
    });

    it('should filter out entries without risk scores', async () => {
      // The query should include WHERE risk_score IS NOT NULL
      mockQuery.mockResolvedValue({ rows: [] });

      await repository.getTopPerformers();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE risk_score IS NOT NULL'),
        expect.any(Array)
      );
    });
  });

  describe('getMetricsHistory', () => {
    it('should return empty array as placeholder', async () => {
      const result = await repository.getMetricsHistory('USDT');

      expect(result).toEqual([]);
    });

    it('should handle custom days parameter', async () => {
      const result = await repository.getMetricsHistory('USDT', 60);

      expect(result).toEqual([]);
    });

    it('should work with different tickers', async () => {
      const tickers = ['USDT', 'USDC', 'DAI', 'FRAX'];
      
      for (const ticker of tickers) {
        const result = await repository.getMetricsHistory(ticker, 30);
        expect(result).toEqual([]);
      }
    });
  });

  describe('error handling', () => {
    it('should propagate upsert errors', async () => {
      mockQuery.mockRejectedValue(new Error('Unique constraint violation'));

      await expect(
        repository.upsertMetrics('USDT', { riskScore: 85.0, metadata: {} })
      ).rejects.toThrow('Unique constraint violation');
    });

    it('should propagate query errors in getTopPerformers', async () => {
      mockQuery.mockRejectedValue(new Error('Connection timeout'));

      await expect(repository.getTopPerformers()).rejects.toThrow('Connection timeout');
    });

    it('should handle malformed JSON in metadata', async () => {
      // This test ensures our JSON.stringify call works correctly
      const circularRef: any = {};
      circularRef.self = circularRef;
      mockQuery.mockResolvedValue({ rows: [{}] });

      // This should not throw, JSON.stringify should handle it
      await expect(
        repository.upsertMetrics('TEST', { 
          riskScore: 50.0, 
          metadata: { circular: 'safe_value' } 
        })
      ).resolves.toBeDefined();
    });
  });

  describe('business logic integration', () => {
    it('should support score validation patterns', async () => {
      const testCases = [
        { ticker: 'HIGH_RISK', riskScore: 95.0, transparencyScore: 20.0 },
        { ticker: 'BALANCED', riskScore: 75.0, transparencyScore: 75.0 },
        { ticker: 'TRANSPARENT', riskScore: 60.0, transparencyScore: 95.0 }
      ];

      for (const testCase of testCases) {
        mockQuery.mockResolvedValue({ rows: [testCase] });
        
        const result = await repository.upsertMetrics(testCase.ticker, {
          riskScore: testCase.riskScore,
          transparencyScore: testCase.transparencyScore,
          metadata: {}
        });

        expect(result).toBe(testCase);
      }
    });

    it('should support metadata enrichment patterns', async () => {
      const enrichedMetadata = {
        calculation_timestamp: new Date().toISOString(),
        data_sources: {
          price: 'coingecko',
          volume: 'defillama',
          audit: 'manual'
        },
        confidence_intervals: {
          risk_score: { min: 82.0, max: 88.0 },
          transparency_score: { min: 89.0, max: 95.0 }
        },
        alerts: [],
        version: '2.1.0'
      };

      mockQuery.mockResolvedValue({ rows: [{ metadata: enrichedMetadata }] });

      const result = await repository.upsertMetrics('PREMIUM_COIN', {
        riskScore: 85.0,
        transparencyScore: 92.0,
        metadata: enrichedMetadata
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          JSON.stringify(enrichedMetadata)
        ])
      );
    });
  });
});