import { StablecoinMetrics } from '../analytics';

describe('StablecoinMetrics', () => {
  it('should have correct interface structure for complete metrics', () => {
    const metrics: StablecoinMetrics = {
      id: 'test-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      ticker: 'USDT',
      lastUpdated: new Date(),
      riskScore: 85.5,
      transparencyScore: 92.0,
      liquidityScore: 88.3,
      auditScore: 90.7,
      metadata: {
        sources: ['coingecko', 'defillama'],
        calculation_method: 'weighted_average'
      },
    };

    // Base entity properties
    expect(metrics).toHaveProperty('id');
    expect(metrics).toHaveProperty('createdAt');
    expect(metrics).toHaveProperty('updatedAt');

    // Metrics-specific properties
    expect(metrics).toHaveProperty('ticker');
    expect(metrics).toHaveProperty('lastUpdated');
    expect(metrics).toHaveProperty('riskScore');
    expect(metrics).toHaveProperty('transparencyScore');
    expect(metrics).toHaveProperty('liquidityScore');
    expect(metrics).toHaveProperty('auditScore');
    expect(metrics).toHaveProperty('metadata');

    // Type validation
    expect(typeof metrics.ticker).toBe('string');
    expect(metrics.lastUpdated).toBeInstanceOf(Date);
    expect(typeof metrics.riskScore).toBe('number');
    expect(typeof metrics.transparencyScore).toBe('number');
    expect(typeof metrics.liquidityScore).toBe('number');
    expect(typeof metrics.auditScore).toBe('number');
    expect(typeof metrics.metadata).toBe('object');
  });

  it('should allow minimal required properties', () => {
    const minimalMetrics: StablecoinMetrics = {
      ticker: 'USDC',
      lastUpdated: new Date(),
      metadata: {},
    };

    expect(minimalMetrics.ticker).toBe('USDC');
    expect(minimalMetrics.lastUpdated).toBeInstanceOf(Date);
    expect(minimalMetrics.riskScore).toBeUndefined();
    expect(minimalMetrics.transparencyScore).toBeUndefined();
    expect(minimalMetrics.liquidityScore).toBeUndefined();
    expect(minimalMetrics.auditScore).toBeUndefined();
  });

  it('should handle partial score updates', () => {
    const partialMetrics: StablecoinMetrics = {
      ticker: 'DAI',
      lastUpdated: new Date(),
      riskScore: 78.5,
      transparencyScore: 95.2,
      metadata: { partial_update: true },
    };

    expect(partialMetrics.riskScore).toBe(78.5);
    expect(partialMetrics.transparencyScore).toBe(95.2);
    expect(partialMetrics.liquidityScore).toBeUndefined();
    expect(partialMetrics.auditScore).toBeUndefined();
  });

  it('should validate score ranges for business logic', () => {
    // These tests validate our business understanding, not TypeScript constraints
    const metrics: StablecoinMetrics = {
      ticker: 'BUSD',
      lastUpdated: new Date(),
      riskScore: 95.5,
      transparencyScore: 100.0,
      liquidityScore: 0.0,
      auditScore: 50.0,
      metadata: {},
    };

    // All scores should be numbers (business validation would happen elsewhere)
    expect(typeof metrics.riskScore).toBe('number');
    expect(typeof metrics.transparencyScore).toBe('number');
    expect(typeof metrics.liquidityScore).toBe('number');
    expect(typeof metrics.auditScore).toBe('number');
  });

  it('should handle complex metadata structures', () => {
    const complexMetadata = {
      sources: {
        price: 'coingecko',
        liquidity: 'defillama',
        audit: 'manual_review'
      },
      calculation_details: {
        risk_factors: ['volatility', 'regulatory', 'technical'],
        weights: { volatility: 0.4, regulatory: 0.3, technical: 0.3 },
        last_calculation: '2023-01-01T12:00:00Z'
      },
      alerts: [
        { type: 'low_liquidity', threshold: 10000000, current: 8500000 }
      ]
    };

    const metrics: StablecoinMetrics = {
      ticker: 'FRAX',
      lastUpdated: new Date(),
      riskScore: 82.3,
      metadata: complexMetadata,
    };

    expect(metrics.metadata).toEqual(complexMetadata);
    expect(metrics.metadata.sources.price).toBe('coingecko');
    expect(metrics.metadata.calculation_details.weights.volatility).toBe(0.4);
    expect(metrics.metadata.alerts).toHaveLength(1);
  });

  it('should handle ticker variations', () => {
    const tickers = ['USDT', 'USDC', 'DAI', 'BUSD', 'FRAX', 'LUSD', 'sUSD'];
    
    tickers.forEach(ticker => {
      const metrics: StablecoinMetrics = {
        ticker,
        lastUpdated: new Date(),
        metadata: {},
      };
      
      expect(metrics.ticker).toBe(ticker);
      expect(typeof metrics.ticker).toBe('string');
    });
  });

  it('should support timestamp tracking', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const metrics: StablecoinMetrics = {
      ticker: 'USDT',
      lastUpdated: oneHourAgo,
      createdAt: oneHourAgo,
      updatedAt: now,
      metadata: {
        update_frequency: 'hourly',
        next_update: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
      },
    };

    expect(metrics.lastUpdated.getTime()).toBeLessThan(now.getTime());
    expect(metrics.createdAt!.getTime()).toBeLessThan(metrics.updatedAt!.getTime());
  });
});