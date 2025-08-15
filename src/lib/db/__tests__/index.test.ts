import { DatabaseService } from '../index';
import DatabaseConnection from '../connection';

// Mock the database connection
jest.mock('../connection', () => {
  const mockConnection = {
    query: jest.fn(),
    transaction: jest.fn(),
    healthCheck: jest.fn(),
    getConnectionInfo: jest.fn(),
    close: jest.fn(),
  };

  return {
    __esModule: true,
    default: {
      getInstance: jest.fn(() => mockConnection),
    },
  };
});

describe('DatabaseService', () => {
  let mockConnection: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection = (DatabaseConnection.getInstance as jest.Mock)();
  });

  describe('query', () => {
    it('should delegate to connection query method', async () => {
      const expectedResult = { rows: [{ id: 1 }] };
      mockConnection.query.mockResolvedValue(expectedResult);

      const result = await DatabaseService.query('SELECT * FROM test', ['param']);

      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM test', ['param']);
      expect(result).toBe(expectedResult);
    });

    it('should handle query without parameters', async () => {
      const expectedResult = { rows: [] };
      mockConnection.query.mockResolvedValue(expectedResult);

      const result = await DatabaseService.query('SELECT NOW()');

      expect(mockConnection.query).toHaveBeenCalledWith('SELECT NOW()', undefined);
      expect(result).toBe(expectedResult);
    });
  });

  describe('transaction', () => {
    it('should delegate to connection transaction method', async () => {
      const callback = jest.fn().mockResolvedValue('transaction result');
      mockConnection.transaction.mockResolvedValue('transaction result');

      const result = await DatabaseService.transaction(callback);

      expect(mockConnection.transaction).toHaveBeenCalledWith(callback);
      expect(result).toBe('transaction result');
    });
  });

  describe('healthCheck', () => {
    it('should delegate to connection healthCheck method', async () => {
      mockConnection.healthCheck.mockResolvedValue(true);

      const result = await DatabaseService.healthCheck();

      expect(mockConnection.healthCheck).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('getConnectionInfo', () => {
    it('should delegate to connection getConnectionInfo method', async () => {
      const expectedInfo = { totalCount: 10, idleCount: 5, waitingCount: 2 };
      mockConnection.getConnectionInfo.mockResolvedValue(expectedInfo);

      const result = await DatabaseService.getConnectionInfo();

      expect(mockConnection.getConnectionInfo).toHaveBeenCalled();
      expect(result).toBe(expectedInfo);
    });
  });

  describe('close', () => {
    it('should delegate to connection close method', async () => {
      mockConnection.close.mockResolvedValue(undefined);

      await DatabaseService.close();

      expect(mockConnection.close).toHaveBeenCalled();
    });
  });
});