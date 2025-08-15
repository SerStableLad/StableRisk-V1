import { EventLogEntry } from '../event';

describe('EventLogEntry', () => {
  it('should have correct interface structure for complete entry', () => {
    const eventEntry: EventLogEntry = {
      id: 'test-id',
      createdAt: new Date(),
      updatedAt: new Date(),
      aggregateId: 'stablecoin-usdt',
      aggregateType: 'stablecoin',
      eventType: 'data_fetch',
      eventData: { source: 'coingecko', success: true },
      metadata: { timestamp: '2023-01-01T00:00:00Z' },
      version: 1,
    };

    // Base entity properties
    expect(eventEntry).toHaveProperty('id');
    expect(eventEntry).toHaveProperty('createdAt');
    expect(eventEntry).toHaveProperty('updatedAt');

    // Event-specific properties
    expect(eventEntry).toHaveProperty('aggregateId');
    expect(eventEntry).toHaveProperty('aggregateType');
    expect(eventEntry).toHaveProperty('eventType');
    expect(eventEntry).toHaveProperty('eventData');
    expect(eventEntry).toHaveProperty('metadata');
    expect(eventEntry).toHaveProperty('version');

    // Type validation
    expect(typeof eventEntry.aggregateId).toBe('string');
    expect(typeof eventEntry.eventType).toBe('string');
    expect(typeof eventEntry.eventData).toBe('object');
    expect(typeof eventEntry.metadata).toBe('object');
    expect(typeof eventEntry.version).toBe('number');
  });

  it('should validate aggregateType values', () => {
    const validTypes = ['stablecoin', 'transparency', 'audit', 'liquidity'];
    
    validTypes.forEach(type => {
      const eventEntry: EventLogEntry = {
        aggregateId: 'test-id',
        aggregateType: type as any,
        eventType: 'test_event',
        eventData: {},
        metadata: {},
        version: 1,
      };
      
      expect(['stablecoin', 'transparency', 'audit', 'liquidity']).toContain(eventEntry.aggregateType);
    });
  });

  it('should allow minimal required properties', () => {
    const minimalEvent: EventLogEntry = {
      aggregateId: 'test-aggregate',
      aggregateType: 'stablecoin',
      eventType: 'test_event',
      eventData: {},
      metadata: {},
      version: 1,
    };

    expect(minimalEvent.aggregateId).toBe('test-aggregate');
    expect(minimalEvent.aggregateType).toBe('stablecoin');
    expect(minimalEvent.eventType).toBe('test_event');
    expect(minimalEvent.version).toBe(1);
    expect(minimalEvent.id).toBeUndefined();
  });

  it('should handle complex event data structures', () => {
    const complexEventData = {
      api_response: {
        status: 200,
        data: { price: 1.0001, volume: 1000000 },
        headers: { 'x-rate-limit': '100' }
      },
      processing_time: 150,
      cache_hit: false,
    };

    const eventEntry: EventLogEntry = {
      aggregateId: 'usdt',
      aggregateType: 'stablecoin',
      eventType: 'price_fetch',
      eventData: complexEventData,
      metadata: {
        source: 'api_integration_test',
        environment: 'test'
      },
      version: 5,
    };

    expect(eventEntry.eventData).toEqual(complexEventData);
    expect(eventEntry.eventData.api_response.status).toBe(200);
    expect(eventEntry.metadata.source).toBe('api_integration_test');
  });

  it('should handle different aggregate types correctly', () => {
    const aggregateTypes = [
      { type: 'stablecoin', id: 'USDT' },
      { type: 'transparency', id: 'transparency-check-123' },
      { type: 'audit', id: 'audit-report-456' },
      { type: 'liquidity', id: 'liquidity-analysis-789' }
    ];

    aggregateTypes.forEach(({ type, id }) => {
      const event: EventLogEntry = {
        aggregateId: id,
        aggregateType: type as any,
        eventType: 'status_update',
        eventData: { status: 'completed' },
        metadata: {},
        version: 1,
      };

      expect(event.aggregateType).toBe(type);
      expect(event.aggregateId).toBe(id);
    });
  });
});