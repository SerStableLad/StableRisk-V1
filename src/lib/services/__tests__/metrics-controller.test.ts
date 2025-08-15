import request from 'supertest';
import express from 'express';
import { MetricsController } from '../../../metrics-service/src/controllers/metrics-controller';
import { MetricsService } from '../../../metrics-service/src/services/metrics-service';

// Mock the MetricsService
jest.mock('../../../metrics-service/src/services/metrics-service');

describe('MetricsController Integration Tests', () => {
  let app: express.Application;
  let mockMetricsService: jest.Mocked<MetricsService>;

  beforeEach(() => {
    // Create Express app with metrics routes
    app = express();
    app.use(express.json());
    app.use('/metrics', MetricsController.routes());

    // Get the mocked instance
    mockMetricsService = MetricsService.prototype as jest.Mocked<MetricsService>;
    jest.clearAllMocks();
  });

  describe('POST /metrics/record', () => {
    it('should successfully record a metric', async () => {
      mockMetricsService.recordMetric.mockResolvedValue();

      const metricData = {
        name: 'api.response.time',
        value: 150.5,
        labels: { endpoint: '/api/stablecoin/usdt', method: 'GET' },
        timestamp: new Date().toISOString()
      };

      const response = await request(app)
        .post('/metrics/record')
        .send(metricData)
        .expect(201);

      expect(response.body).toEqual({ success: true });
      expect(mockMetricsService.recordMetric).toHaveBeenCalledWith(
        metricData.name,
        metricData.value,
        metricData.labels,
        metricData.timestamp
      );
    });

    it('should handle missing optional fields', async () => {
      mockMetricsService.recordMetric.mockResolvedValue();

      const minimalMetric = {
        name: 'simple.counter',
        value: 1
      };

      await request(app)
        .post('/metrics/record')
        .send(minimalMetric)
        .expect(201);

      expect(mockMetricsService.recordMetric).toHaveBeenCalledWith(
        minimalMetric.name,
        minimalMetric.value,
        undefined,
        undefined
      );
    });

    it('should return 400 for invalid metric data', async () => {
      const invalidMetric = {
        // Missing required fields
        labels: { test: 'value' }
      };

      const response = await request(app)
        .post('/metrics/record')
        .send(invalidMetric)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(mockMetricsService.recordMetric).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      const serviceError = new Error('Database connection failed');
      mockMetricsService.recordMetric.mockRejectedValue(serviceError);

      const metricData = {
        name: 'test.metric',
        value: 100
      };

      const response = await request(app)
        .post('/metrics/record')
        .send(metricData)
        .expect(400);

      expect(response.body.error).toBe(serviceError.message);
    });

    it('should complete within performance requirement (< 100ms)', async () => {
      mockMetricsService.recordMetric.mockResolvedValue();

      const metricData = {
        name: 'performance.test',
        value: 42
      };

      const startTime = Date.now();
      await request(app)
        .post('/metrics/record')
        .send(metricData)
        .expect(201);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('GET /metrics/:name', () => {
    it('should retrieve metrics by name', async () => {
      const mockMetrics = [
        { name: 'api.calls', value: 100, timestamp: new Date(), labels: {} },
        { name: 'api.calls', value: 150, timestamp: new Date(), labels: {} }
      ];
      mockMetricsService.getMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/metrics/api.calls')
        .expect(200);

      expect(response.body.metrics).toEqual(mockMetrics);
      expect(mockMetricsService.getMetrics).toHaveBeenCalledWith(
        'api.calls',
        undefined,
        undefined,
        undefined
      );
    });

    it('should handle query parameters for filtering', async () => {
      const mockMetrics = [
        { name: 'filtered.metric', value: 75, timestamp: new Date(), labels: {} }
      ];
      mockMetricsService.getMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/metrics/filtered.metric')
        .query({
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-02T00:00:00Z',
          granularity: '1h'
        })
        .expect(200);

      expect(response.body.metrics).toEqual(mockMetrics);
      expect(mockMetricsService.getMetrics).toHaveBeenCalledWith(
        'filtered.metric',
        '2024-01-01T00:00:00Z',
        '2024-01-02T00:00:00Z',
        '1h'
      );
    });

    it('should handle service errors in metric retrieval', async () => {
      const serviceError = new Error('Query timeout');
      mockMetricsService.getMetrics.mockRejectedValue(serviceError);

      const response = await request(app)
        .get('/metrics/error.metric')
        .expect(500);

      expect(response.body.error).toBe(serviceError.message);
    });

    it('should return empty array for non-existent metrics', async () => {
      mockMetricsService.getMetrics.mockResolvedValue([]);

      const response = await request(app)
        .get('/metrics/non.existent')
        .expect(200);

      expect(response.body.metrics).toEqual([]);
    });

    it('should respond within performance requirement (< 200ms)', async () => {
      mockMetricsService.getMetrics.mockResolvedValue([]);

      const startTime = Date.now();
      await request(app)
        .get('/metrics/performance.test')
        .expect(200);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('GET /metrics/aggregate/:name', () => {
    it('should return aggregated metrics', async () => {
      const mockAggregation = {
        result: 125.5,
        count: 10,
        start_time: new Date(),
        end_time: new Date()
      };
      mockMetricsService.getAggregatedMetrics.mockResolvedValue(mockAggregation);

      const response = await request(app)
        .get('/metrics/aggregate/response.time')
        .query({ operation: 'avg' })
        .expect(200);

      expect(response.body).toEqual(mockAggregation);
      expect(mockMetricsService.getAggregatedMetrics).toHaveBeenCalledWith(
        'response.time',
        'avg',
        undefined,
        undefined
      );
    });

    it('should handle different aggregation operations', async () => {
      const operations = ['avg', 'sum', 'count', 'min', 'max'];
      
      for (const operation of operations) {
        mockMetricsService.getAggregatedMetrics.mockResolvedValue({ result: 100 });

        await request(app)
          .get('/metrics/aggregate/test.metric')
          .query({ operation })
          .expect(200);

        expect(mockMetricsService.getAggregatedMetrics).toHaveBeenCalledWith(
          'test.metric',
          operation,
          undefined,
          undefined
        );
      }
    });

    it('should handle time range filtering in aggregations', async () => {
      const mockAggregation = { result: 200, count: 5 };
      mockMetricsService.getAggregatedMetrics.mockResolvedValue(mockAggregation);

      await request(app)
        .get('/metrics/aggregate/filtered.metric')
        .query({
          operation: 'sum',
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-01T23:59:59Z'
        })
        .expect(200);

      expect(mockMetricsService.getAggregatedMetrics).toHaveBeenCalledWith(
        'filtered.metric',
        'sum',
        '2024-01-01T00:00:00Z',
        '2024-01-01T23:59:59Z'
      );
    });

    it('should handle aggregation service errors', async () => {
      const serviceError = new Error('Unsupported operation: invalid');
      mockMetricsService.getAggregatedMetrics.mockRejectedValue(serviceError);

      const response = await request(app)
        .get('/metrics/aggregate/test.metric')
        .query({ operation: 'invalid' })
        .expect(500);

      expect(response.body.error).toBe(serviceError.message);
    });
  });

  describe('GET /metrics/system/summary', () => {
    it('should return system metrics summary', async () => {
      const mockSummary = [
        {
          name: 'api.response.time',
          total_records: 1000,
          avg_value: 150.5,
          min_value: 50,
          max_value: 500,
          last_recorded: new Date()
        },
        {
          name: 'cache.hit.ratio',
          total_records: 500,
          avg_value: 85.2,
          min_value: 0,
          max_value: 100,
          last_recorded: new Date()
        }
      ];
      mockMetricsService.getSystemSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/metrics/system/summary')
        .expect(200);

      expect(response.body).toEqual(mockSummary);
      expect(mockMetricsService.getSystemSummary).toHaveBeenCalled();
    });

    it('should handle empty system summary', async () => {
      mockMetricsService.getSystemSummary.mockResolvedValue([]);

      const response = await request(app)
        .get('/metrics/system/summary')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should handle system summary service errors', async () => {
      const serviceError = new Error('Database connection lost');
      mockMetricsService.getSystemSummary.mockRejectedValue(serviceError);

      const response = await request(app)
        .get('/metrics/system/summary')
        .expect(500);

      expect(response.body.error).toBe(serviceError.message);
    });

    it('should complete within performance target', async () => {
      mockMetricsService.getSystemSummary.mockResolvedValue([]);

      const startTime = Date.now();
      await request(app)
        .get('/metrics/system/summary')
        .expect(200);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('DELETE /metrics/cleanup', () => {
    it('should cleanup old metrics successfully', async () => {
      const deletedCount = 1500;
      mockMetricsService.cleanupOldMetrics.mockResolvedValue(deletedCount);

      const response = await request(app)
        .delete('/metrics/cleanup')
        .query({ olderThan: '30 days' })
        .expect(200);

      expect(response.body.deletedCount).toBe(deletedCount);
      expect(mockMetricsService.cleanupOldMetrics).toHaveBeenCalledWith('30 days');
    });

    it('should use default cleanup period when not specified', async () => {
      mockMetricsService.cleanupOldMetrics.mockResolvedValue(0);

      await request(app)
        .delete('/metrics/cleanup')
        .expect(200);

      expect(mockMetricsService.cleanupOldMetrics).toHaveBeenCalledWith(undefined);
    });

    it('should handle cleanup service errors', async () => {
      const serviceError = new Error('Cleanup operation failed');
      mockMetricsService.cleanupOldMetrics.mockRejectedValue(serviceError);

      const response = await request(app)
        .delete('/metrics/cleanup')
        .expect(500);

      expect(response.body.error).toBe(serviceError.message);
    });

    it('should return zero when no metrics deleted', async () => {
      mockMetricsService.cleanupOldMetrics.mockResolvedValue(0);

      const response = await request(app)
        .delete('/metrics/cleanup')
        .expect(200);

      expect(response.body.deletedCount).toBe(0);
    });
  });

  describe('load testing and performance', () => {
    it('should handle concurrent metric recording requests', async () => {
      mockMetricsService.recordMetric.mockResolvedValue();

      const concurrentRequests = Array.from({ length: 100 }, (_, i) => 
        request(app)
          .post('/metrics/record')
          .send({
            name: `concurrent.metric.${i}`,
            value: i * 10
          })
      );

      const startTime = Date.now();
      const responses = await Promise.all(concurrentRequests);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Should complete within reasonable time (< 2 seconds for 100 concurrent requests)
      expect(endTime - startTime).toBeLessThan(2000);
      expect(mockMetricsService.recordMetric).toHaveBeenCalledTimes(100);
    });

    it('should handle concurrent metric retrieval requests', async () => {
      mockMetricsService.getMetrics.mockResolvedValue([]);

      const concurrentRequests = Array.from({ length: 50 }, () => 
        request(app).get('/metrics/test.metric')
      );

      const startTime = Date.now();
      const responses = await Promise.all(concurrentRequests);
      const endTime = Date.now();

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should maintain performance under 1000+ requests per minute simulation', async () => {
      mockMetricsService.recordMetric.mockResolvedValue();

      // Simulate ~17 requests per second (1000+ per minute)
      const batchSize = 20;
      const batches = 5;
      
      for (let batch = 0; batch < batches; batch++) {
        const batchRequests = Array.from({ length: batchSize }, (_, i) =>
          request(app)
            .post('/metrics/record')
            .send({
              name: `batch.${batch}.metric.${i}`,
              value: Math.random() * 1000
            })
        );

        const batchStart = Date.now();
        await Promise.all(batchRequests);
        const batchEnd = Date.now();

        // Each batch should complete quickly
        expect(batchEnd - batchStart).toBeLessThan(1000);
      }

      expect(mockMetricsService.recordMetric).toHaveBeenCalledTimes(batchSize * batches);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/metrics/record')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle very large metric values', async () => {
      mockMetricsService.recordMetric.mockResolvedValue();

      const largeValue = Number.MAX_SAFE_INTEGER;
      await request(app)
        .post('/metrics/record')
        .send({
          name: 'large.value.metric',
          value: largeValue
        })
        .expect(201);

      expect(mockMetricsService.recordMetric).toHaveBeenCalledWith(
        'large.value.metric',
        largeValue,
        undefined,
        undefined
      );
    });

    it('should handle special characters in metric names', async () => {
      mockMetricsService.getMetrics.mockResolvedValue([]);

      const specialName = 'metric-with_special@chars#123';
      await request(app)
        .get(`/metrics/${encodeURIComponent(specialName)}`)
        .expect(200);

      expect(mockMetricsService.getMetrics).toHaveBeenCalledWith(
        specialName,
        undefined,
        undefined,
        undefined
      );
    });

    it('should handle empty request bodies gracefully', async () => {
      await request(app)
        .post('/metrics/record')
        .send({})
        .expect(400);

      expect(mockMetricsService.recordMetric).not.toHaveBeenCalled();
    });

    it('should validate request content type', async () => {
      await request(app)
        .post('/metrics/record')
        .set('Content-Type', 'text/plain')
        .send('not json')
        .expect(400);
    });
  });

  describe('HTTP method validation', () => {
    it('should reject unsupported HTTP methods', async () => {
      await request(app)
        .patch('/metrics/record')
        .expect(404);

      await request(app)
        .put('/metrics/system/summary')
        .expect(404);
    });

    it('should handle OPTIONS requests for CORS preflight', async () => {
      await request(app)
        .options('/metrics/record')
        .expect(404); // Express default behavior without CORS middleware
    });
  });
});