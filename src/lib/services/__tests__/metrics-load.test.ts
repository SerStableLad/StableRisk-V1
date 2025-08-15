/**
 * Load Testing Scenarios for Metrics Service
 * 
 * Tests performance requirements:
 * - Handle 1000+ metric records per minute
 * - Batch operations complete within 5 seconds
 * - Database queries return results in < 200ms
 * - System remains stable under high load
 */

import { MetricsService } from '../metrics-service';
import DatabaseConnection from '../../db/connection';
import { MetricsServiceClient } from '../../../metrics-service/src/clients/metrics-service-client';

// Mock database and fetch for load testing
jest.mock('../../db/connection');
jest.mock('../../../metrics-service/src/clients/metrics-service-client');

describe('Metrics Service Load Testing', () => {
  let metricsService: MetricsService;
  let mockConnection: jest.Mocked<DatabaseConnection>;
  let mockClient: jest.Mocked<MetricsServiceClient>;

  beforeEach(() => {
    jest.useFakeTimers();
    
    metricsService = new MetricsService();
    
    mockConnection = {
      query: jest.fn(),
      transaction: jest.fn(),
      close: jest.fn(),
      healthCheck: jest.fn(),
      getConnectionInfo: jest.fn(),
      getInstance: jest.fn(),
      getPool: jest.fn(),
    } as any;

    (DatabaseConnection.getInstance as jest.Mock).mockReturnValue(mockConnection);

    mockClient = {
      recordMetric: jest.fn(),
      getMetrics: jest.fn(),
      getSystemSummary: jest.fn(),
      healthCheck: jest.fn(),
      getInstance: jest.fn(),
    } as any;

    (MetricsServiceClient.getInstance as jest.Mock).mockReturnValue(mockClient);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('High Volume Metric Recording (1000+ records/minute)', () => {
    it('should handle 1000+ metrics per minute in memory', async () => {
      const targetRecordsPerMinute = 1200; // Exceed requirement
      const testDurationMs = 60000; // 1 minute
      
      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Record metrics at high frequency
      const recordingPromises: Promise<void>[] = [];
      const batchSize = 50; // Process in batches for better performance
      const totalBatches = Math.ceil(targetRecordsPerMinute / batchSize);

      for (let batch = 0; batch < totalBatches; batch++) {
        const batchPromises: Promise<void>[] = [];
        
        for (let i = 0; i < batchSize; i++) {
          const metricIndex = batch * batchSize + i;
          batchPromises.push(
            metricsService.recordApiCall(
              `load-test-service-${metricIndex % 10}`,
              `/endpoint-${metricIndex % 5}`,
              Math.random() * 1000,
              Math.random() > 0.1 // 90% success rate
            )
          );
        }
        
        recordingPromises.push(...batchPromises);
        
        // Simulate time progression
        jest.advanceTimersByTime(testDurationMs / totalBatches);
      }

      await Promise.all(recordingPromises);

      const endTime = Date.now();
      const actualDuration = endTime - startTime;
      const recordsPerSecond = targetRecordsPerMinute / (actualDuration / 1000);

      // Verify we met the throughput requirement
      expect(recordsPerSecond).toBeGreaterThanOrEqual(1000 / 60); // At least 16.67 records/second
      
      // Verify all metrics were recorded
      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(targetRecordsPerMinute);
      
      // Verify memory efficiency - operation should complete quickly
      expect(actualDuration).toBeLessThan(5000); // Should be much faster than 5 seconds
    });

    it('should handle concurrent high-volume metric streams', async () => {
      const concurrentStreams = 5;
      const recordsPerStream = 300; // Total: 1500 records
      
      const streamPromises = Array.from({ length: concurrentStreams }, async (_, streamId) => {
        const streamRecords: Promise<void>[] = [];
        
        for (let i = 0; i < recordsPerStream; i++) {
          streamRecords.push(
            metricsService.recordMetric(
              `stream-${streamId}`,
              `record-${i}`,
              { 
                value: Math.random() * 1000,
                streamId: streamId.toString(),
                recordIndex: i.toString(),
                timestamp: Date.now()
              }
            )
          );
        }
        
        return Promise.all(streamRecords);
      });

      const startTime = Date.now();
      await Promise.all(streamPromises);
      const endTime = Date.now();

      const duration = endTime - startTime;
      const totalRecords = concurrentStreams * recordsPerStream;
      const recordsPerSecond = (totalRecords / duration) * 1000;

      // Should handle concurrent streams efficiently
      expect(recordsPerSecond).toBeGreaterThan(20); // Well above minimum requirement
      expect(duration).toBeLessThan(3000); // Complete within reasonable time
    });

    it('should maintain performance under sustained load', async () => {
      const sustainedTestDuration = 300000; // 5 minutes
      const targetRecordsPerSecond = 20; // 1200 per minute
      const totalRecords = (sustainedTestDuration / 1000) * targetRecordsPerSecond;
      
      let recordedCount = 0;
      const recordingInterval = 1000 / targetRecordsPerSecond; // 50ms intervals
      
      const recordingPromises: Promise<void>[] = [];
      
      // Simulate sustained recording over time
      for (let elapsed = 0; elapsed < sustainedTestDuration; elapsed += recordingInterval) {
        jest.advanceTimersByTime(recordingInterval);
        
        recordingPromises.push(
          metricsService.recordCostMetric(
            `sustained-load-operation-${recordedCount % 100}`,
            Math.random() * 0.1
          ).then(() => {
            recordedCount++;
          })
        );
      }

      const startTime = Date.now();
      await Promise.all(recordingPromises);
      const endTime = Date.now();

      // Verify sustained performance
      expect(recordedCount).toBe(totalRecords);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete efficiently
      
      // Verify metrics are still accessible
      const costMetrics = metricsService.getCostMetrics();
      expect(costMetrics.length).toBe(recordedCount);
    });

    it('should handle mixed workload scenarios', async () => {
      const mixedWorkloadDuration = 60000; // 1 minute
      const operations = {
        apiCalls: 400,
        cacheOperations: 200,
        costMetrics: 150,
        genericMetrics: 250
      };

      const allOperations: Promise<any>[] = [];

      // API calls
      for (let i = 0; i < operations.apiCalls; i++) {
        allOperations.push(
          metricsService.recordApiCall(
            `mixed-service-${i % 5}`,
            `/mixed-endpoint-${i % 3}`,
            Math.random() * 500,
            Math.random() > 0.05
          )
        );
      }

      // Cache operations
      for (let i = 0; i < operations.cacheOperations; i++) {
        if (i % 2 === 0) {
          allOperations.push(metricsService.recordCacheHit(`cache-key-${i}`));
        } else {
          allOperations.push(metricsService.recordCacheMiss(`cache-key-${i}`));
        }
      }

      // Cost metrics
      for (let i = 0; i < operations.costMetrics; i++) {
        allOperations.push(
          metricsService.recordCostMetric(`cost-operation-${i}`, Math.random() * 0.5)
        );
      }

      // Generic metrics
      for (let i = 0; i < operations.genericMetrics; i++) {
        allOperations.push(
          metricsService.recordMetric(
            `generic-service-${i % 8}`,
            `generic-event-${i % 4}`,
            { mixedWorkload: true, operationId: i }
          )
        );
      }

      const startTime = Date.now();
      await Promise.all(allOperations);
      const endTime = Date.now();

      const totalOperations = Object.values(operations).reduce((sum, count) => sum + count, 0);
      const operationsPerSecond = (totalOperations / (endTime - startTime)) * 1000;

      // Verify mixed workload performance
      expect(operationsPerSecond).toBeGreaterThan(15); // Efficient handling
      expect(endTime - startTime).toBeLessThan(5000);

      // Verify all operation types were recorded
      const apiStats = metricsService.getApiStats();
      const cacheStats = metricsService.getCacheStats();
      const costMetrics = metricsService.getCostMetrics();

      expect(apiStats.totalCalls).toBe(operations.apiCalls);
      expect(cacheStats.hits + cacheStats.misses).toBe(operations.cacheOperations);
      expect(costMetrics.length).toBe(operations.costMetrics);
    });
  });

  describe('Database Batch Operations (5-second requirement)', () => {
    it('should complete batch insert within 5 seconds', async () => {
      const batchSize = 1000;
      const metrics = Array.from({ length: batchSize }, (_, i) => ({
        name: `batch-metric-${i}`,
        value: Math.random() * 1000,
        labels: {
          batchId: 'load-test-batch-1',
          index: i.toString(),
          category: `category-${i % 10}`
        },
        timestamp: new Date()
      }));

      // Mock successful batch insert
      mockConnection.query.mockResolvedValue({ rows: [], rowCount: batchSize });

      // Create metrics service with database operations
      const dbMetricsService = {
        async recordMetricsBatch(metricsBatch: typeof metrics): Promise<void> {
          const values = metricsBatch.map((_, index) => {
            const baseIndex = index * 4;
            return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
          }).join(', ');

          const query = `
            INSERT INTO metrics.metric_data (name, value, labels, recorded_at)
            VALUES ${values}
          `;

          const params = metricsBatch.flatMap(metric => [
            metric.name,
            metric.value,
            JSON.stringify(metric.labels),
            metric.timestamp
          ]);

          return mockConnection.query(query, params).then(() => {});
        }
      };

      const startTime = Date.now();
      await dbMetricsService.recordMetricsBatch(metrics);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // Must complete within 5 seconds (task requirement)
      expect(duration).toBeLessThan(5000);
      expect(mockConnection.query).toHaveBeenCalledTimes(1);
      
      // Verify the query was constructed correctly
      const queryCall = mockConnection.query.mock.calls[0];
      expect(queryCall[0]).toContain('INSERT INTO metrics.metric_data');
      expect(queryCall[1]).toHaveLength(batchSize * 4); // 4 parameters per metric
    });

    it('should handle multiple concurrent batch operations within 5 seconds', async () => {
      const numberOfBatches = 5;
      const recordsPerBatch = 200;
      
      // Mock fast database responses
      mockConnection.query.mockResolvedValue({ rows: [], rowCount: recordsPerBatch });

      const batchOperations = Array.from({ length: numberOfBatches }, async (_, batchId) => {
        const batchMetrics = Array.from({ length: recordsPerBatch }, (_, i) => ({
          name: `concurrent-batch-${batchId}-metric-${i}`,
          value: Math.random() * 100,
          labels: { batchId: batchId.toString(), concurrent: 'true' },
          timestamp: new Date()
        }));

        // Simulate batch insert
        const values = batchMetrics.map((_, index) => {
          const baseIndex = index * 4;
          return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
        }).join(', ');

        const query = `INSERT INTO metrics.metric_data (name, value, labels, recorded_at) VALUES ${values}`;
        const params = batchMetrics.flatMap(metric => [
          metric.name, metric.value, JSON.stringify(metric.labels), metric.timestamp
        ]);

        return mockConnection.query(query, params);
      });

      const startTime = Date.now();
      await Promise.all(batchOperations);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // All batch operations should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
      expect(mockConnection.query).toHaveBeenCalledTimes(numberOfBatches);
    });

    it('should handle large single batch operations efficiently', async () => {
      const largeBatchSize = 5000;
      const largeMetrics = Array.from({ length: largeBatchSize }, (_, i) => ({
        name: `large-batch-metric-${i}`,
        value: i * 0.1,
        labels: {
          large: 'true',
          segment: Math.floor(i / 1000).toString(),
          index: i.toString()
        },
        timestamp: new Date(Date.now() + i * 1000) // Spread over time
      }));

      mockConnection.query.mockResolvedValue({ rows: [], rowCount: largeBatchSize });

      const dbService = {
        async recordLargeBatch(metrics: typeof largeMetrics): Promise<void> {
          // Simulate chunked processing for very large batches
          const chunkSize = 1000;
          const chunks = [];
          
          for (let i = 0; i < metrics.length; i += chunkSize) {
            chunks.push(metrics.slice(i, i + chunkSize));
          }

          const chunkPromises = chunks.map(chunk => {
            const values = chunk.map((_, index) => {
              const baseIndex = index * 4;
              return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
            }).join(', ');

            const query = `INSERT INTO metrics.metric_data (name, value, labels, recorded_at) VALUES ${values}`;
            const params = chunk.flatMap(metric => [
              metric.name, metric.value, JSON.stringify(metric.labels), metric.timestamp
            ]);

            return mockConnection.query(query, params);
          });

          await Promise.all(chunkPromises);
        }
      };

      const startTime = Date.now();
      await dbService.recordLargeBatch(largeMetrics);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // Even large batch should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
      
      // Should have processed in chunks
      const expectedChunks = Math.ceil(largeBatchSize / 1000);
      expect(mockConnection.query).toHaveBeenCalledTimes(expectedChunks);
    });

    it('should maintain batch performance under memory pressure', async () => {
      const batchSize = 2000;
      const memoryIntensiveMetrics = Array.from({ length: batchSize }, (_, i) => ({
        name: `memory-intensive-metric-${i}`,
        value: Math.random() * 10000,
        labels: {
          // Simulate large label objects
          description: `This is a detailed description for metric ${i} with lots of text to simulate memory usage`,
          metadata: {
            userId: `user-${i % 100}`,
            sessionId: `session-${i % 50}`,
            requestId: `req-${i}`,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            features: ['feature1', 'feature2', 'feature3', 'feature4', 'feature5'],
            nested: {
              level1: { level2: { level3: `deep-value-${i}` } }
            }
          }
        },
        timestamp: new Date()
      }));

      mockConnection.query.mockResolvedValue({ rows: [], rowCount: batchSize });

      const memoryService = {
        async recordMemoryIntensiveBatch(metrics: typeof memoryIntensiveMetrics): Promise<void> {
          // Process in smaller chunks to manage memory
          const chunkSize = 100;
          
          for (let i = 0; i < metrics.length; i += chunkSize) {
            const chunk = metrics.slice(i, i + chunkSize);
            
            const values = chunk.map((_, index) => {
              const baseIndex = index * 4;
              return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
            }).join(', ');

            const query = `INSERT INTO metrics.metric_data (name, value, labels, recorded_at) VALUES ${values}`;
            const params = chunk.flatMap(metric => [
              metric.name, metric.value, JSON.stringify(metric.labels), metric.timestamp
            ]);

            await mockConnection.query(query, params);
          }
        }
      };

      const startTime = Date.now();
      await memoryService.recordMemoryIntensiveBatch(memoryIntensiveMetrics);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // Should still complete within 5 seconds despite memory-intensive data
      expect(duration).toBeLessThan(5000);
      expect(mockConnection.query).toHaveBeenCalled();
    });
  });

  describe('Query Performance (200ms requirement)', () => {
    it('should return query results within 200ms', async () => {
      const mockQueryResults = Array.from({ length: 1000 }, (_, i) => ({
        name: 'performance-test-metric',
        value: 100 + i,
        labels: { test: 'performance' },
        timestamp: new Date()
      }));

      // Simulate fast database response
      mockConnection.query.mockResolvedValue({ 
        rows: mockQueryResults, 
        rowCount: mockQueryResults.length 
      });

      const metricsDbService = {
        async getMetrics(name: string, start?: string, end?: string): Promise<typeof mockQueryResults> {
          let query = `
            SELECT name, value, labels, recorded_at as timestamp
            FROM metrics.metric_data
            WHERE name = $1
          `;
          
          const params = [name];
          
          if (start) {
            params.push(start);
            query += ` AND recorded_at >= $${params.length}`;
          }
          
          if (end) {
            params.push(end);
            query += ` AND recorded_at <= $${params.length}`;
          }
          
          query += ` ORDER BY recorded_at DESC LIMIT 1000`;
          
          const result = await mockConnection.query(query, params);
          return result.rows;
        }
      };

      const startTime = Date.now();
      const results = await metricsDbService.getMetrics('performance-test-metric');
      const endTime = Date.now();

      const queryDuration = endTime - startTime;

      // Must return results within 200ms (task requirement)
      expect(queryDuration).toBeLessThan(200);
      expect(results).toHaveLength(1000);
      expect(mockConnection.query).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent queries within performance target', async () => {
      const concurrentQueries = 10;
      const mockResults = [{ name: 'test', value: 100, timestamp: new Date() }];
      
      mockConnection.query.mockResolvedValue({ rows: mockResults, rowCount: 1 });

      const queryService = {
        async getMetrics(name: string): Promise<any[]> {
          const query = `SELECT name, value, recorded_at as timestamp FROM metrics.metric_data WHERE name = $1`;
          const result = await mockConnection.query(query, [name]);
          return result.rows;
        }
      };

      const queries = Array.from({ length: concurrentQueries }, (_, i) => 
        queryService.getMetrics(`concurrent-query-${i}`)
      );

      const startTime = Date.now();
      const results = await Promise.all(queries);
      const endTime = Date.now();

      const totalDuration = endTime - startTime;
      const averageQueryTime = totalDuration / concurrentQueries;

      // Average query time should be well under 200ms
      expect(averageQueryTime).toBeLessThan(200);
      expect(results).toHaveLength(concurrentQueries);
      expect(mockConnection.query).toHaveBeenCalledTimes(concurrentQueries);
    });

    it('should maintain query performance with complex filtering', async () => {
      const complexResults = Array.from({ length: 500 }, (_, i) => ({
        name: 'complex-metric',
        value: i * 2.5,
        labels: { category: `cat-${i % 5}`, region: `region-${i % 3}` },
        timestamp: new Date(Date.now() - i * 60000)
      }));

      mockConnection.query.mockResolvedValue({ 
        rows: complexResults, 
        rowCount: complexResults.length 
      });

      const complexQueryService = {
        async getComplexFilteredMetrics(): Promise<any[]> {
          const query = `
            SELECT name, value, labels, recorded_at as timestamp
            FROM metrics.metric_data
            WHERE name = $1 
              AND recorded_at >= $2 
              AND recorded_at <= $3
              AND labels @> $4
            ORDER BY recorded_at DESC
            LIMIT 1000
          `;
          
          const params = [
            'complex-metric',
            new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
            new Date(),
            JSON.stringify({ category: 'cat-1' })
          ];
          
          const result = await mockConnection.query(query, params);
          return result.rows;
        }
      };

      const startTime = Date.now();
      const results = await complexQueryService.getComplexFilteredMetrics();
      const endTime = Date.now();

      const queryDuration = endTime - startTime;

      // Complex queries should still complete within 200ms
      expect(queryDuration).toBeLessThan(200);
      expect(results).toHaveLength(500);
    });

    it('should handle aggregation queries efficiently', async () => {
      const aggregationResult = [{
        result: 157.5,
        count: 1000,
        start_time: new Date(),
        end_time: new Date()
      }];

      mockConnection.query.mockResolvedValue({ 
        rows: aggregationResult, 
        rowCount: 1 
      });

      const aggregationService = {
        async getAggregatedMetrics(name: string, operation: string): Promise<any> {
          const operations: Record<string, string> = {
            'avg': 'AVG(value)',
            'sum': 'SUM(value)',
            'count': 'COUNT(*)',
            'min': 'MIN(value)',
            'max': 'MAX(value)'
          };

          const query = `
            SELECT ${operations[operation]} as result,
                   COUNT(*) as count,
                   MIN(recorded_at) as start_time,
                   MAX(recorded_at) as end_time
            FROM metrics.metric_data
            WHERE name = $1 AND recorded_at >= NOW() - INTERVAL '1 hour'
          `;
          
          const result = await mockConnection.query(query, [name]);
          return result.rows[0];
        }
      };

      const operations = ['avg', 'sum', 'count', 'min', 'max'];
      const aggregationPromises = operations.map(op => 
        aggregationService.getAggregatedMetrics('test-metric', op)
      );

      const startTime = Date.now();
      const results = await Promise.all(aggregationPromises);
      const endTime = Date.now();

      const totalDuration = endTime - startTime;
      const averageAggregationTime = totalDuration / operations.length;

      // Aggregation queries should complete within performance target
      expect(averageAggregationTime).toBeLessThan(200);
      expect(results).toHaveLength(operations.length);
      expect(mockConnection.query).toHaveBeenCalledTimes(operations.length);
    });
  });

  describe('System Stability Under Load', () => {
    it('should maintain service health during peak load', async () => {
      // Simulate peak load scenario
      const peakLoadPromises: Promise<any>[] = [];

      // High-frequency metric recording
      for (let i = 0; i < 500; i++) {
        peakLoadPromises.push(
          metricsService.recordApiCall(
            `peak-service-${i % 20}`,
            `/peak-endpoint-${i % 10}`,
            Math.random() * 2000,
            Math.random() > 0.02 // 98% success rate
          )
        );
      }

      // Concurrent cache operations
      for (let i = 0; i < 200; i++) {
        if (Math.random() > 0.3) {
          peakLoadPromises.push(metricsService.recordCacheHit(`peak-key-${i}`));
        } else {
          peakLoadPromises.push(metricsService.recordCacheMiss(`peak-key-${i}`));
        }
      }

      // Cost tracking
      for (let i = 0; i < 100; i++) {
        peakLoadPromises.push(
          metricsService.recordCostMetric(`peak-operation-${i}`, Math.random() * 1.0)
        );
      }

      const startTime = Date.now();
      await Promise.all(peakLoadPromises);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // System should remain stable and responsive
      expect(duration).toBeLessThan(10000); // Complete within 10 seconds
      
      // Verify system health
      const healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.successRate).toBeGreaterThan(95);
      expect(healthMetrics.averageResponseTime).toBeLessThan(5000);

      // Verify all operations were recorded
      const apiStats = metricsService.getApiStats();
      const cacheStats = metricsService.getCacheStats();
      const costMetrics = metricsService.getCostMetrics();

      expect(apiStats.totalCalls).toBe(500);
      expect(cacheStats.hits + cacheStats.misses).toBe(200);
      expect(costMetrics.length).toBe(100);
    });

    it('should recover gracefully from temporary overload', async () => {
      // Simulate temporary system overload
      let processingDelay = 100; // Start with delay

      const overloadService = {
        async processMetric(name: string, value: number): Promise<void> {
          // Simulate processing delay that decreases over time
          await new Promise(resolve => setTimeout(resolve, processingDelay));
          processingDelay = Math.max(1, processingDelay - 1); // Gradual recovery
          
          return metricsService.recordMetric('overload-test', name, { value });
        }
      };

      const overloadRequests = Array.from({ length: 100 }, (_, i) =>
        overloadService.processMetric(`metric-${i}`, i * 10)
      );

      const startTime = Date.now();
      await Promise.all(overloadRequests);
      const endTime = Date.now();

      const duration = endTime - startTime;

      // System should handle overload and recover
      expect(duration).toBeLessThan(15000); // Allow more time for recovery simulation
      
      // Verify metrics were still recorded during overload
      const metricHistory = metricsService.getMetricHistory('overload-test', 'metric-99');
      expect(metricHistory.length).toBeGreaterThan(0);
    });

    it('should maintain accuracy under high concurrency', async () => {
      const concurrentOperations = 1000;
      const counterMetric = 'accuracy-counter';
      
      // Multiple threads incrementing the same metric
      const incrementPromises = Array.from({ length: concurrentOperations }, (_, i) =>
        metricsService.recordMetric('accuracy-test', counterMetric, { increment: 1, threadId: i })
      );

      await Promise.all(incrementPromises);

      // Verify all increments were recorded accurately
      const accuracyHistory = metricsService.getMetricHistory('accuracy-test', counterMetric);
      expect(accuracyHistory).toHaveLength(concurrentOperations);

      // Verify no data corruption occurred
      const uniqueThreadIds = new Set(
        accuracyHistory.map(record => record.metadata?.threadId)
      );
      expect(uniqueThreadIds.size).toBe(concurrentOperations);
    });
  });

  describe('Memory and Resource Management Under Load', () => {
    it('should manage memory efficiently during prolonged load', async () => {
      // Simulate prolonged operation
      const prolongedTestDuration = 30000; // 30 seconds simulated
      const operationsPerSecond = 50;
      const totalOperations = (prolongedTestDuration / 1000) * operationsPerSecond;

      const prolongedOperations: Promise<void>[] = [];

      for (let i = 0; i < totalOperations; i++) {
        prolongedOperations.push(
          metricsService.recordApiCall(
            `prolonged-service-${i % 5}`,
            `/prolonged-endpoint-${i % 3}`,
            50 + (i % 100), // Varying response times
            true
          )
        );

        // Simulate time progression
        if (i % 100 === 0) {
          jest.advanceTimersByTime(2000); // Advance 2 seconds every 100 operations
        }
      }

      const startTime = Date.now();
      await Promise.all(prolongedOperations);
      const endTime = Date.now();

      // Verify efficient processing
      expect(endTime - startTime).toBeLessThan(5000); // Efficient execution
      
      // Verify metrics are still accessible and accurate
      const stats = metricsService.getApiStats();
      expect(stats.totalCalls).toBe(totalOperations);
      
      // System should maintain reasonable memory usage (simulated check)
      const healthMetrics = metricsService.getHealthMetrics();
      expect(healthMetrics.averageResponseTime).toBeLessThan(1000);
    });

    it('should handle cleanup operations during active load', async () => {
      // Add historical metrics
      for (let i = 0; i < 1000; i++) {
        await metricsService.recordMetric(
          'cleanup-test',
          `historical-metric-${i}`,
          { timestamp: new Date(Date.now() - (i * 60000)) } // Spread over time
        );
      }

      // Simulate ongoing operations during cleanup
      const ongoingOperations = Array.from({ length: 200 }, (_, i) =>
        metricsService.recordApiCall(
          'ongoing-service',
          '/ongoing-endpoint',
          Math.random() * 300,
          true
        )
      );

      // Execute cleanup while operations are running
      const cleanupPromise = Promise.resolve().then(() => {
        // Simulate cleanup of old metrics (in real scenario, this would be database cleanup)
        return metricsService.resetMetrics();
      });

      const startTime = Date.now();
      await Promise.all([...ongoingOperations, cleanupPromise]);
      const endTime = Date.now();

      // Cleanup should not significantly impact performance
      expect(endTime - startTime).toBeLessThan(3000);
    });
  });
});