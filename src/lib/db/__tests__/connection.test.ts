import DatabaseConnection from '../connection';
import { Pool } from 'pg';

// Mock pg module
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    totalCount: 10,
    idleCount: 5,
    waitingCount: 2,
  })),
}));

describe('DatabaseConnection', () => {
  let connection: DatabaseConnection;
  let mockPool: any;

  beforeEach(() => {
    // Clear any existing instances
    (DatabaseConnection as any).instance = undefined;
    jest.clearAllMocks();
    
    mockPool = {
      connect: jest.fn(),
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      totalCount: 10,
      idleCount: 5,
      waitingCount: 2,
    };
    
    (Pool as unknown as jest.Mock).mockImplementation(() => mockPool);
    connection = DatabaseConnection.getInstance();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create pool with correct configuration', () => {
      expect(Pool).toHaveBeenCalledWith({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'stablerisk',
        user: process.env.DB_USER || 'stablerisk_user',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        min: parseInt(process.env.DB_POOL_MIN || '5'),
        max: parseInt(process.env.DB_POOL_MAX || '20'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: parseInt(process.env.DB_QUERY_TIMEOUT || '10000'),
      });
    });

    it('should set up pool event listeners', () => {
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  describe('getPool', () => {
    it('should return the pool instance', () => {
      const pool = connection.getPool();
      expect(pool).toBe(mockPool);
    });
  });

  describe('query', () => {
    it('should execute query successfully', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      const result = await connection.query('SELECT * FROM test', ['param']);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM test', ['param']);
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({ rows: [{ id: 1 }] });
    });

    it('should release client even if query fails', async () => {
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Query failed')),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      await expect(connection.query('INVALID SQL')).rejects.toThrow('Query failed');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('transaction', () => {
    it('should execute transaction successfully', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // COMMIT
          .mockResolvedValue({ rows: [{ result: 'success' }] }),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      const callback = jest.fn().mockResolvedValue('transaction result');
      const result = await connection.transaction(callback);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(result).toBe('transaction result');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined), // ROLLBACK
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      const callback = jest.fn().mockRejectedValue(new Error('Transaction failed'));

      await expect(connection.transaction(callback)).rejects.toThrow('Transaction failed');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return true for successful health check', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ current_time: new Date() }] }),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      const result = await connection.healthCheck();

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT NOW() as current_time', undefined);
    });

    it('should return false for failed health check', async () => {
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Connection failed')),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      const result = await connection.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('getConnectionInfo', () => {
    it('should return pool connection information', async () => {
      const info = await connection.getConnectionInfo();

      expect(info).toEqual({
        totalCount: 10,
        idleCount: 5,
        waitingCount: 2,
      });
    });
  });

  describe('close', () => {
    it('should close the pool connection', async () => {
      mockPool.end.mockResolvedValue(undefined);

      await connection.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});