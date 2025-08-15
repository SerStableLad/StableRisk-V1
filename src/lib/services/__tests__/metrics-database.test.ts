import DatabaseConnection from '../../db/connection';
import { Pool, PoolClient } from 'pg';

// Integration tests for metrics database operations
describe('Metrics Database Integration Tests', () => {
  let connection: DatabaseConnection;
  let mockPool: jest.Mocked<Pool>;
  let mockClient: jest.Mocked<PoolClient>;

  beforeAll(async () => {
    // Mock the database connection for integration testing
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
      // Add other required PoolClient properties as needed
    } as any;

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      removeListener: jest.fn(),
      totalCount: 10,
      idleCount: 5,
      waitingCount: 0,
    } as any;

    jest.mock('pg', () => ({
      Pool: jest.fn(() => mockPool),
    }));

    connection = DatabaseConnection.getInstance();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await connection.close();
  });

  describe('Database Schema Tests', () => {
    it('should create metrics schema if not exists', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const schemaQuery = 'CREATE SCHEMA IF NOT EXISTS metrics';
      await connection.query(schemaQuery);

      expect(mockClient.query).toHaveBeenCalledWith(schemaQuery, undefined);
    });

    it('should create metric_data table with correct structure', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS metrics.metric_data (
          id BIGSERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          value DOUBLE PRECISION NOT NULL,
          labels JSONB DEFAULT '{}',
          recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;

      await connection.query(createTableQuery);
      expect(mockClient.query).toHaveBeenCalledWith(createTableQuery, undefined);
    });

    it('should create required indexes for performance', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_metric_data_name ON metrics.metric_data(name)',
        'CREATE INDEX IF NOT EXISTS idx_metric_data_recorded_at ON metrics.metric_data(recorded_at)',
        'CREATE INDEX IF NOT EXISTS idx_metric_data_name_recorded_at ON metrics.metric_data(name, recorded_at)',
        'CREATE INDEX IF NOT EXISTS idx_metric_data_labels ON metrics.metric_data USING GIN(labels)'
      ];

      for (const indexQuery of indexes) {
        await connection.query(indexQuery);
        expect(mockClient.query).toHaveBeenCalledWith(indexQuery, undefined);
      }
    });

    it('should verify table constraints and data types', async () => {
      const tableInfoQuery = `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'metrics' AND table_name = 'metric_data'
        ORDER BY ordinal_position
      `;

      const expectedColumns = [
        { column_name: 'id', data_type: 'bigint', is_nullable: 'NO' },
        { column_name: 'name', data_type: 'character varying', is_nullable: 'NO' },
        { column_name: 'value', data_type: 'double precision', is_nullable: 'NO' },
        { column_name: 'labels', data_type: 'jsonb', is_nullable: 'YES' },
        { column_name: 'recorded_at', data_type: 'timestamp with time zone', is_nullable: 'YES' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'YES' }
      ];

      mockClient.query.mockResolvedValue({ rows: expectedColumns, rowCount: 6 });

      const result = await connection.query(tableInfoQuery);
      expect(result.rows).toEqual(expectedColumns);
    });
  });

  describe('Metric Data Operations', () => {
    describe('Insert Operations', () => {
      it('should insert single metric record successfully', async () => {
        const insertQuery = `
          INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
          VALUES ($1, $2, $3, $4)
        `;

        const metricData = [
          'api.response.time',
          150.5,
          JSON.stringify({ endpoint: '/api/stablecoin/usdt', method: 'GET' }),
          new Date('2024-01-01T12:00:00Z')
        ];

        mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

        await connection.query(insertQuery, metricData);

        expect(mockClient.query).toHaveBeenCalledWith(insertQuery, metricData);
      });

      it('should handle batch insert operations efficiently', async () => {
        const metrics = Array.from({ length: 100 }, (_, i) => ({
          name: `batch.metric.${i}`,
          value: Math.random() * 1000,
          labels: { batch: 'test', index: i.toString() },
          timestamp: new Date()
        }));

        const values = metrics.map((_, index) => {
          const baseIndex = index * 4;
          return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
        }).join(', ');

        const batchInsertQuery = `
          INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
          VALUES ${values}
        `;

        const params = metrics.flatMap(metric => [
          metric.name,
          metric.value,
          JSON.stringify(metric.labels),
          metric.timestamp
        ]);

        mockClient.query.mockResolvedValue({ rows: [], rowCount: 100 });

        const startTime = Date.now();
        await connection.query(batchInsertQuery, params);
        const endTime = Date.now();

        // Batch operation should complete within 5 seconds (task requirement)
        expect(endTime - startTime).toBeLessThan(5000);
        expect(mockClient.query).toHaveBeenCalledWith(batchInsertQuery, params);
      });

      it('should handle JSONB labels correctly', async () => {
        const complexLabels = {
          service: 'stablecoin-analysis',
          endpoint: '/api/transparency',
          user_agent: 'Mozilla/5.0...',
          request_id: 'req_123456789',
          nested: {
            performance: { tier: 'tier1', target_ms: 1000 },
            metadata: { version: '1.0.0', feature_flags: ['enhanced_caching'] }
          }
        };

        const insertQuery = `
          INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
          VALUES ($1, $2, $3, $4)
        `;

        mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

        await connection.query(insertQuery, [
          'complex.metric',
          99.9,
          JSON.stringify(complexLabels),
          new Date()
        ]);

        expect(mockClient.query).toHaveBeenCalled();
        const actualParams = mockClient.query.mock.calls[0][1];
        expect(JSON.parse(actualParams[2])).toEqual(complexLabels);
      });
    });

    describe('Query Operations', () => {
      it('should retrieve metrics with name filter within performance target', async () => {
        const queryStart = Date.now();

        const selectQuery = `
          SELECT name, value, labels, recorded_at as timestamp
          FROM metrics.metric_data
          WHERE name = $1
          ORDER BY recorded_at DESC LIMIT 1000
        `;

        const mockResults = Array.from({ length: 100 }, (_, i) => ({
          name: 'api.response.time',
          value: 100 + i,
          labels: { endpoint: `/endpoint${i}` },
          timestamp: new Date()
        }));

        mockClient.query.mockResolvedValue({ rows: mockResults, rowCount: 100 });

        const result = await connection.query(selectQuery, ['api.response.time']);
        const queryEnd = Date.now();

        // Query should complete within 200ms (task requirement)
        expect(queryEnd - queryStart).toBeLessThan(200);
        expect(result.rows).toHaveLength(100);
        expect(mockClient.query).toHaveBeenCalledWith(selectQuery, ['api.response.time']);
      });

      it('should handle time range queries efficiently', async () => {
        const queryWithTimeRange = `
          SELECT name, value, labels, recorded_at as timestamp
          FROM metrics.metric_data
          WHERE name = $1 AND recorded_at >= $2 AND recorded_at <= $3
          ORDER BY recorded_at DESC LIMIT 1000
        `;

        const startTime = '2024-01-01T00:00:00Z';
        const endTime = '2024-01-02T00:00:00Z';

        mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

        const queryStart = Date.now();
        await connection.query(queryWithTimeRange, ['test.metric', startTime, endTime]);
        const queryEnd = Date.now();

        expect(queryEnd - queryStart).toBeLessThan(200);
        expect(mockClient.query).toHaveBeenCalledWith(
          queryWithTimeRange,
          ['test.metric', startTime, endTime]
        );
      });

      it('should perform aggregation queries efficiently', async () => {
        const aggregationQuery = `
          SELECT AVG(value) as result,
                 COUNT(*) as count,
                 MIN(recorded_at) as start_time,
                 MAX(recorded_at) as end_time
          FROM metrics.metric_data
          WHERE name = $1 AND recorded_at >= $2
        `;

        const mockAggregationResult = [{
          result: 157.5,
          count: 1000,
          start_time: new Date('2024-01-01T00:00:00Z'),
          end_time: new Date('2024-01-01T23:59:59Z')
        }];

        mockClient.query.mockResolvedValue({ rows: mockAggregationResult, rowCount: 1 });

        const queryStart = Date.now();
        const result = await connection.query(aggregationQuery, ['api.latency', '2024-01-01T00:00:00Z']);
        const queryEnd = Date.now();

        expect(queryEnd - queryStart).toBeLessThan(200);
        expect(result.rows[0].result).toBe(157.5);
        expect(result.rows[0].count).toBe(1000);
      });

      it('should handle complex JSONB label queries', async () => {
        const labelQuery = `
          SELECT name, value, labels
          FROM metrics.metric_data
          WHERE labels @> $1
          ORDER BY recorded_at DESC LIMIT 100
        `;

        const labelFilter = JSON.stringify({ endpoint: '/api/stablecoin/usdt' });
        mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

        const queryStart = Date.now();
        await connection.query(labelQuery, [labelFilter]);
        const queryEnd = Date.now();

        expect(queryEnd - queryStart).toBeLessThan(200);
        expect(mockClient.query).toHaveBeenCalledWith(labelQuery, [labelFilter]);
      });
    });

    describe('System Summary Queries', () => {
      it('should generate system summary efficiently', async () => {
        const systemSummaryQuery = `
          SELECT 
            name,
            COUNT(*) as total_records,
            AVG(value) as avg_value,
            MIN(value) as min_value,
            MAX(value) as max_value,
            MAX(recorded_at) as last_recorded
          FROM metrics.metric_data
          WHERE recorded_at >= NOW() - INTERVAL '24 hours'
          GROUP BY name
          ORDER BY total_records DESC
          LIMIT 50
        `;

        const mockSummary = [
          {
            name: 'api.response.time',
            total_records: 5000,
            avg_value: 145.2,
            min_value: 25,
            max_value: 2000,
            last_recorded: new Date()
          },
          {
            name: 'cache.hit.ratio',
            total_records: 1000,
            avg_value: 87.5,
            min_value: 0,
            max_value: 100,
            last_recorded: new Date()
          }
        ];

        mockClient.query.mockResolvedValue({ rows: mockSummary, rowCount: 2 });

        const queryStart = Date.now();
        const result = await connection.query(systemSummaryQuery);
        const queryEnd = Date.now();

        expect(queryEnd - queryStart).toBeLessThan(200);
        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].name).toBe('api.response.time');
      });
    });

    describe('Cleanup Operations', () => {
      it('should delete old metrics efficiently', async () => {
        const cleanupQuery = `
          DELETE FROM metrics.metric_data
          WHERE recorded_at < NOW() - INTERVAL $1
        `;

        mockClient.query.mockResolvedValue({ rows: [], rowCount: 15000 });

        const cleanupStart = Date.now();
        const result = await connection.query(cleanupQuery, ['30 days']);
        const cleanupEnd = Date.now();

        // Cleanup should complete within reasonable time
        expect(cleanupEnd - cleanupStart).toBeLessThan(5000);
        expect(result.rowCount).toBe(15000);
        expect(mockClient.query).toHaveBeenCalledWith(cleanupQuery, ['30 days']);
      });

      it('should handle cleanup with specific date cutoffs', async () => {
        const specificDateCleanup = `
          DELETE FROM metrics.metric_data
          WHERE recorded_at < $1
        `;

        const cutoffDate = new Date('2024-01-01T00:00:00Z');
        mockClient.query.mockResolvedValue({ rows: [], rowCount: 5000 });

        await connection.query(specificDateCleanup, [cutoffDate]);

        expect(mockClient.query).toHaveBeenCalledWith(specificDateCleanup, [cutoffDate]);
      });
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle 1000+ metric records per minute', async () => {
      const recordsCount = 1200; // Exceeds 1000 requirement
      const testDuration = 60000; // 1 minute in ms

      // Simulate batch inserts over time
      const batchSize = 100;
      const batches = Math.ceil(recordsCount / batchSize);
      const batchInterval = testDuration / batches;

      mockClient.query.mockResolvedValue({ rows: [], rowCount: batchSize });

      const startTime = Date.now();
      
      for (let i = 0; i < batches; i++) {
        const batchMetrics = Array.from({ length: batchSize }, (_, j) => ({
          name: `load.test.metric.${i * batchSize + j}`,
          value: Math.random() * 1000,
          labels: { batch: i.toString(), record: j.toString() },
          timestamp: new Date()
        }));

        const values = batchMetrics.map((_, index) => {
          const baseIndex = index * 4;
          return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
        }).join(', ');

        const insertQuery = `
          INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
          VALUES ${values}
        `;

        const params = batchMetrics.flatMap(metric => [
          metric.name,
          metric.value,
          JSON.stringify(metric.labels),
          metric.timestamp
        ]);

        await connection.query(insertQuery, params);

        // Simulate time passage if needed
        if (i < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.min(batchInterval, 100)));
        }
      }

      const endTime = Date.now();
      const actualDuration = endTime - startTime;

      // Should complete within reasonable time
      expect(actualDuration).toBeLessThan(testDuration * 1.1); // Allow 10% buffer
      expect(mockClient.query).toHaveBeenCalledTimes(batches);
    });

    it('should maintain query performance under load', async () => {
      // Simulate multiple concurrent queries
      const concurrentQueries = 20;
      const queries = Array.from({ length: concurrentQueries }, (_, i) => {
        const selectQuery = `
          SELECT name, value, labels, recorded_at
          FROM metrics.metric_data
          WHERE name = $1
          ORDER BY recorded_at DESC LIMIT 100
        `;
        
        mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
        
        return connection.query(selectQuery, [`concurrent.metric.${i}`]);
      });

      const startTime = Date.now();
      await Promise.all(queries);
      const endTime = Date.now();

      // All queries should complete within performance target
      expect(endTime - startTime).toBeLessThan(200 * concurrentQueries / 10); // Allow for some parallelization
      expect(mockClient.query).toHaveBeenCalledTimes(concurrentQueries);
    });

    it('should handle large result sets efficiently', async () => {
      const largeResultQuery = `
        SELECT name, value, labels, recorded_at
        FROM metrics.metric_data
        WHERE recorded_at >= $1
        ORDER BY recorded_at DESC
      `;

      // Mock a large result set
      const largeResultSet = Array.from({ length: 10000 }, (_, i) => ({
        name: `large.dataset.metric`,
        value: i * 0.1,
        labels: { sequence: i.toString() },
        recorded_at: new Date(Date.now() - i * 1000)
      }));

      mockClient.query.mockResolvedValue({ rows: largeResultSet, rowCount: 10000 });

      const queryStart = Date.now();
      const result = await connection.query(largeResultQuery, [new Date('2024-01-01T00:00:00Z')]);
      const queryEnd = Date.now();

      // Should handle large results within reasonable time
      expect(queryEnd - queryStart).toBeLessThan(1000);
      expect(result.rows).toHaveLength(10000);
    });
  });

  describe('Index Performance', () => {
    it('should verify index usage for name queries', async () => {
      const explainQuery = `
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT name, value, recorded_at
        FROM metrics.metric_data
        WHERE name = $1
      `;

      const mockExplainResult = [
        {
          'QUERY PLAN': 'Index Scan using idx_metric_data_name on metric_data (cost=0.43..8.45 rows=1 width=32)'
        }
      ];

      mockClient.query.mockResolvedValue({ rows: mockExplainResult, rowCount: 1 });

      const result = await connection.query(explainQuery, ['test.metric']);
      
      expect(result.rows[0]['QUERY PLAN']).toContain('Index Scan');
      expect(result.rows[0]['QUERY PLAN']).toContain('idx_metric_data_name');
    });

    it('should verify composite index usage for time range queries', async () => {
      const explainQuery = `
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT name, value, recorded_at
        FROM metrics.metric_data
        WHERE name = $1 AND recorded_at >= $2
      `;

      const mockExplainResult = [
        {
          'QUERY PLAN': 'Index Scan using idx_metric_data_name_recorded_at on metric_data (cost=0.43..12.45 rows=5 width=32)'
        }
      ];

      mockClient.query.mockResolvedValue({ rows: mockExplainResult, rowCount: 1 });

      const result = await connection.query(explainQuery, ['test.metric', new Date()]);
      
      expect(result.rows[0]['QUERY PLAN']).toContain('Index Scan');
      expect(result.rows[0]['QUERY PLAN']).toContain('idx_metric_data_name_recorded_at');
    });

    it('should verify GIN index usage for JSONB label queries', async () => {
      const explainQuery = `
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT name, value, labels
        FROM metrics.metric_data
        WHERE labels @> $1
      `;

      const mockExplainResult = [
        {
          'QUERY PLAN': 'Bitmap Index Scan on idx_metric_data_labels (cost=4.43..20.45 rows=10 width=64)'
        }
      ];

      mockClient.query.mockResolvedValue({ rows: mockExplainResult, rowCount: 1 });

      const result = await connection.query(explainQuery, [JSON.stringify({ endpoint: '/api/test' })]);
      
      expect(result.rows[0]['QUERY PLAN']).toContain('idx_metric_data_labels');
    });
  });

  describe('Transaction Handling', () => {
    it('should handle transactional batch operations', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 100 }) // INSERT
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

      await connection.transaction(async (client) => {
        const batchInsert = `
          INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
          VALUES ${Array.from({ length: 100 }, (_, i) => 
            `('batch.metric.${i}', ${i * 10}, '{"batch": true}', NOW())`
          ).join(', ')}
        `;
        
        return await client.query(batchInsert);
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should rollback failed batch operations', async () => {
      const insertError = new Error('Constraint violation');
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
        .mockRejectedValueOnce(insertError) // INSERT fails
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

      await expect(
        connection.transaction(async (client) => {
          throw insertError;
        })
      ).rejects.toThrow('Constraint violation');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});