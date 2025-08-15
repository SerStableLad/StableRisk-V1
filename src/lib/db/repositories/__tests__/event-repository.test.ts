import { EventRepository } from '../event-repository';
import { EventLogEntry } from '../../models/event';

// Mock the base repository
jest.mock('../base-repository', () => ({
  BaseRepository: class MockBaseRepository {
    protected fullTableName = 'events.event_log';
    
    query = jest.fn();
    create = jest.fn();
    
    constructor(tableName: string, schema: string) {
      this.fullTableName = `${schema}.${tableName}`;
    }
  }
}));

describe('EventRepository', () => {
  let repository: EventRepository;
  let mockQuery: jest.Mock;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new EventRepository();
    mockQuery = (repository as any).query;
    mockCreate = (repository as any).create;
  });

  describe('constructor', () => {
    it('should initialize with correct table and schema', () => {
      expect((repository as any).fullTableName).toBe('events.event_log');
    });
  });

  describe('logEvent', () => {
    it('should log event with correct parameters', async () => {
      const mockEvent: EventLogEntry = {
        id: '123',
        aggregateId: 'USDT',
        aggregateType: 'stablecoin',
        eventType: 'data_fetch',
        eventData: { source: 'coingecko', success: true },
        metadata: {
          timestamp: '2023-01-01T00:00:00Z',
          source: 'stablerisk-api'
        },
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock getNextVersion to return 1
      const getNextVersionSpy = jest.spyOn(repository as any, 'getNextVersion').mockResolvedValue(1);
      mockCreate.mockResolvedValue(mockEvent);

      const result = await repository.logEvent(
        'USDT',
        'stablecoin',
        'data_fetch',
        { source: 'coingecko', success: true },
        { custom: 'metadata' }
      );

      expect(getNextVersionSpy).toHaveBeenCalledWith('USDT', 'stablecoin');
      expect(mockCreate).toHaveBeenCalledWith({
        aggregateId: 'USDT',
        aggregateType: 'stablecoin',
        eventType: 'data_fetch',
        eventData: { source: 'coingecko', success: true },
        metadata: expect.objectContaining({
          custom: 'metadata',
          timestamp: expect.any(String),
          source: 'stablerisk-api'
        }),
        version: 1
      });
      expect(result).toBe(mockEvent);
    });

    it('should use default empty metadata when none provided', async () => {
      jest.spyOn(repository as any, 'getNextVersion').mockResolvedValue(2);
      mockCreate.mockResolvedValue({});

      await repository.logEvent('USDC', 'stablecoin', 'price_update', { price: 1.0001 });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({
          timestamp: expect.any(String),
          source: 'stablerisk-api'
        })
      }));
    });

    it('should handle different aggregate types', async () => {
      const aggregateTypes = [
        { type: 'transparency', id: 'transparency-check' },
        { type: 'audit', id: 'audit-report-123' },
        { type: 'liquidity', id: 'liquidity-pool-xyz' }
      ];

      jest.spyOn(repository as any, 'getNextVersion').mockResolvedValue(1);
      mockCreate.mockResolvedValue({});

      for (const { type, id } of aggregateTypes) {
        await repository.logEvent(id, type as any, 'test_event', {});
        
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
          aggregateId: id,
          aggregateType: type,
        }));
      }
    });
  });

  describe('getEventHistory', () => {
    it('should get all events for aggregate without version filter', async () => {
      const mockEvents = [
        { version: 1, eventType: 'created' },
        { version: 2, eventType: 'updated' }
      ];
      mockQuery.mockResolvedValue({ rows: mockEvents });

      const result = await repository.getEventHistory('USDT', 'stablecoin');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE aggregate_id = $1 AND aggregate_type = $2'),
        ['USDT', 'stablecoin']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY version ASC'),
        ['USDT', 'stablecoin']
      );
      expect(result).toEqual(mockEvents);
    });

    it('should get events from specific version', async () => {
      const mockEvents = [{ version: 3, eventType: 'updated' }];
      mockQuery.mockResolvedValue({ rows: mockEvents });

      const result = await repository.getEventHistory('USDT', 'stablecoin', 3);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND version >= $3 ORDER BY version ASC'),
        ['USDT', 'stablecoin', 3]
      );
      expect(result).toEqual(mockEvents);
    });

    it('should handle empty event history', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.getEventHistory('NONEXISTENT', 'stablecoin');

      expect(result).toEqual([]);
    });

    it('should work with different aggregate types', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repository.getEventHistory('audit-123', 'audit');
      
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['audit-123', 'audit']
      );
    });
  });

  describe('getNextVersion', () => {
    it('should return next version number', async () => {
      mockQuery.mockResolvedValue({ rows: [{ next_version: 5 }] });

      const nextVersion = await (repository as any).getNextVersion('USDT', 'stablecoin');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE(MAX(version), 0) + 1 as next_version'),
        ['USDT', 'stablecoin']
      );
      expect(nextVersion).toBe(5);
    });

    it('should return 1 for new aggregate', async () => {
      mockQuery.mockResolvedValue({ rows: [{ next_version: 1 }] });

      const nextVersion = await (repository as any).getNextVersion('NEW_COIN', 'stablecoin');

      expect(nextVersion).toBe(1);
    });
  });

  describe('getRecentEvents', () => {
    it('should get recent events with default limit', async () => {
      const mockEvents = [
        { eventType: 'latest', createdAt: new Date() },
        { eventType: 'previous', createdAt: new Date() }
      ];
      mockQuery.mockResolvedValue({ rows: mockEvents });

      const result = await repository.getRecentEvents();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [100]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $1'),
        [100]
      );
      expect(result).toEqual(mockEvents);
    });

    it('should get recent events with custom limit', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await repository.getRecentEvents(50);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [50]
      );
    });

    it('should handle empty recent events', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.getRecentEvents();

      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should propagate query errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(repository.getRecentEvents()).rejects.toThrow('Database connection failed');
    });

    it('should propagate create errors', async () => {
      jest.spyOn(repository as any, 'getNextVersion').mockResolvedValue(1);
      mockCreate.mockRejectedValue(new Error('Constraint violation'));

      await expect(
        repository.logEvent('USDT', 'stablecoin', 'test', {})
      ).rejects.toThrow('Constraint violation');
    });

    it('should propagate version calculation errors', async () => {
      jest.spyOn(repository as any, 'getNextVersion').mockRejectedValue(new Error('Version calculation failed'));

      await expect(
        repository.logEvent('USDT', 'stablecoin', 'test', {})
      ).rejects.toThrow('Version calculation failed');
    });
  });

  describe('integration scenarios', () => {
    it('should handle concurrent event logging', async () => {
      // Mock different version numbers for concurrent calls
      jest.spyOn(repository as any, 'getNextVersion')
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3);
      
      mockCreate.mockResolvedValue({});

      const promises = [
        repository.logEvent('USDT', 'stablecoin', 'event1', {}),
        repository.logEvent('USDT', 'stablecoin', 'event2', {}),
        repository.logEvent('USDT', 'stablecoin', 'event3', {})
      ];

      await Promise.all(promises);

      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should support event replay scenarios', async () => {
      // Mock the filtered result (version >= 2)
      const filteredEvents = [
        { version: 2, eventType: 'updated', eventData: { price: 1.0 } },
        { version: 3, eventType: 'updated', eventData: { price: 1.001 } }
      ];
      mockQuery.mockResolvedValue({ rows: filteredEvents });

      const history = await repository.getEventHistory('USDT', 'stablecoin', 2);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND version >= $3'),
        ['USDT', 'stablecoin', 2]
      );
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(2);
      expect(history[1].version).toBe(3);
    });
  });
});