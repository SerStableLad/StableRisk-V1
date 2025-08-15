import { BaseRepository } from '../base-repository';
import { BaseEntity } from '../../models/base';
import { Pool } from 'pg';

// Test implementation
interface TestEntity extends BaseEntity {
  name: string;
  value: number;
}

class TestRepository extends BaseRepository<TestEntity> {
  constructor() {
    super('test_table', 'test_schema');
  }

  // Expose protected methods for testing
  public getFullTableNameTest(): string {
    return this.fullTableName;
  }

  public async queryTest(sql: string, params?: any[]) {
    return this.query(sql, params);
  }
}

// Mock pg module
jest.mock('pg');

// Mock DatabaseConnection
jest.mock('../../connection', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      getPool: jest.fn(() => mockPool),
    })),
  },
}));

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

describe('BaseRepository', () => {
  let repository: TestRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.connect.mockResolvedValue(mockClient);
    repository = new TestRepository();
  });

  describe('constructor', () => {
    it('should initialize with table name and schema', () => {
      expect(repository.getFullTableNameTest()).toBe('test_schema.test_table');
    });

    it('should default to public schema', () => {
      class DefaultSchemaRepo extends BaseRepository<TestEntity> {
        constructor() {
          super('default_table');
        }
        getFullTableName() { return this.fullTableName; }
      }
      
      const defaultRepo = new DefaultSchemaRepo();
      expect(defaultRepo.getFullTableName()).toBe('public.default_table');
    });
  });

  describe('query', () => {
    it('should execute query successfully', async () => {
      const expectedResult = { rows: [{ id: '1', name: 'test' }] };
      mockClient.query.mockResolvedValue(expectedResult);

      const result = await repository.queryTest('SELECT * FROM test', ['param']);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test', ['param']);
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe(expectedResult);
    });

    it('should handle query errors and release client', async () => {
      const queryError = new Error('Query failed');
      mockClient.query.mockRejectedValue(queryError);

      await expect(repository.queryTest('INVALID SQL')).rejects.toThrow('Query failed');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should log query errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(repository.queryTest('SELECT 1')).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Query error in test_schema.test_table:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('findById', () => {
    it('should find entity by id', async () => {
      const testEntity = { id: '123', name: 'test', value: 42 };
      mockClient.query.mockResolvedValue({ rows: [testEntity] });

      const result = await repository.findById('123');

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM test_schema.test_table WHERE id = $1',
        ['123']
      );
      expect(result).toEqual(testEntity);
    });

    it('should return null when entity not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create new entity', async () => {
      const newEntity = { name: 'new test', value: 100 };
      const createdEntity = { id: '456', ...newEntity };
      mockClient.query.mockResolvedValue({ rows: [createdEntity] });

      const result = await repository.create(newEntity);

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO test_schema.test_table (name, value) \n       VALUES ($1, $2) \n       RETURNING *',
        ['new test', 100]
      );
      expect(result).toEqual(createdEntity);
    });

    it('should filter out undefined values', async () => {
      const entityWithUndefined = { name: 'test', value: undefined, extra: 'data' };
      const createdEntity = { id: '789', name: 'test', extra: 'data' };
      mockClient.query.mockResolvedValue({ rows: [createdEntity] });

      const result = await repository.create(entityWithUndefined as any);

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO test_schema.test_table (name, extra) \n       VALUES ($1, $2) \n       RETURNING *',
        ['test', 'data']
      );
      expect(result).toEqual(createdEntity);
    });

    it('should handle empty entity', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 'empty' }] });

      await repository.create({});

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO test_schema.test_table () \n       VALUES () \n       RETURNING *',
        []
      );
    });
  });

  describe('update', () => {
    it('should update existing entity', async () => {
      const updates = { name: 'updated name', value: 200 };
      const updatedEntity = { id: '123', ...updates };
      mockClient.query.mockResolvedValue({ rows: [updatedEntity] });

      const result = await repository.update('123', updates);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE test_schema.test_table \n       SET name = $2, value = $3, updated_at = NOW()\n       WHERE id = $1 \n       RETURNING *',
        ['123', 'updated name', 200]
      );
      expect(result).toEqual(updatedEntity);
    });

    it('should return null when entity not found', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await repository.update('nonexistent', { name: 'test' });

      expect(result).toBeNull();
    });

    it('should filter out undefined values in updates', async () => {
      const updates = { name: 'test', value: undefined };
      const updatedEntity = { id: '123', name: 'test' };
      mockClient.query.mockResolvedValue({ rows: [updatedEntity] });

      const result = await repository.update('123', updates as any);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE test_schema.test_table \n       SET name = $2, updated_at = NOW()\n       WHERE id = $1 \n       RETURNING *',
        ['123', 'test']
      );
    });

    it('should return current entity when no updates provided', async () => {
      const currentEntity = { id: '123', name: 'current', value: 50 };
      
      // Mock findById to return the current entity
      const findByIdSpy = jest.spyOn(repository, 'findById').mockResolvedValue(currentEntity);

      const result = await repository.update('123', {});

      expect(findByIdSpy).toHaveBeenCalledWith('123');
      expect(result).toEqual(currentEntity);
      expect(mockClient.query).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle connection errors', async () => {
      mockPool.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(repository.findById('123')).rejects.toThrow('Connection failed');
    });

    it('should handle transaction rollback scenarios', async () => {
      mockClient.query.mockRejectedValue(new Error('Constraint violation'));

      await expect(repository.create({ name: 'test', value: 42 })).rejects.toThrow('Constraint violation');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('integration with database schemas', () => {
    it('should work with different schema configurations', () => {
      const analyticsRepo = new (class extends BaseRepository<any> {
        constructor() { super('metrics', 'analytics'); }
        getTableName() { return this.fullTableName; }
      })();
      
      const eventsRepo = new (class extends BaseRepository<any> {
        constructor() { super('event_log', 'events'); }
        getTableName() { return this.fullTableName; }
      })();

      expect(analyticsRepo.getTableName()).toBe('analytics.metrics');
      expect(eventsRepo.getTableName()).toBe('events.event_log');
    });
  });
});