import { Router, Request, Response } from 'express';
import { MetricsService, MetricRecord, MetricQueryOptions } from '../services/metrics-service';
import { 
  validateMetricRequest,
  validateBatchMetricRequest,
  validateMetricQuery,
  validateAggregationQuery,
  ValidatedMetricRequest,
  ValidatedBatchMetricRequest
} from '../middleware/validation';

export class MetricsController {
  private static metricsService = new MetricsService();

  static routes(): Router {
    const router = Router();

    // Record single metric
    router.post('/record', validateMetricRequest, async (req: ValidatedMetricRequest, res: Response) => {
      try {
        const { name, value, labels, timestamp } = req.body;
        const metricTimestamp = timestamp ? new Date(timestamp) : new Date();
        
        await this.metricsService.recordMetric(name, value, labels, metricTimestamp);
        
        res.status(201).json({ 
          success: true,
          message: 'Metric recorded successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error recording metric:', error);
        res.status(400).json({ 
          error: error.message,
          code: 'METRIC_RECORDING_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Record multiple metrics (batch operation)
    router.post('/batch', validateBatchMetricRequest, async (req: ValidatedBatchMetricRequest, res: Response) => {
      try {
        const { metrics } = req.body;
        
        const metricRecords: MetricRecord[] = metrics.map(metric => ({
          name: metric.name,
          value: metric.value,
          labels: metric.labels || undefined,
          timestamp: metric.timestamp ? new Date(metric.timestamp) : new Date()
        }));
        
        await this.metricsService.recordMetricsBatch(metricRecords);
        
        res.status(201).json({ 
          success: true,
          message: `${metrics.length} metrics recorded successfully`,
          count: metrics.length,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error recording batch metrics:', error);
        res.status(400).json({ 
          error: error.message,
          code: 'BATCH_RECORDING_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get metrics by name
    router.get('/:name', validateMetricQuery, async (req: Request, res: Response) => {
      try {
        const { name } = req.params;
        const { start, end, granularity, limit } = req.query;
        
        if (!name) {
          res.status(400).json({
            error: 'Metric name is required',
            code: 'MISSING_METRIC_NAME',
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        const queryOptions: MetricQueryOptions = {};
        if (start) queryOptions.start = start as string;
        if (end) queryOptions.end = end as string;
        if (granularity) queryOptions.granularity = granularity as string;
        if (limit) queryOptions.limit = parseInt(limit as string);
        
        const metrics = await this.metricsService.getMetrics(name, queryOptions);
        
        res.json({ 
          success: true,
          metrics,
          count: metrics.length,
          query: {
            name,
            ...queryOptions
          },
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ 
          error: error.message,
          code: 'METRICS_FETCH_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get aggregated metrics
    router.get('/aggregate/:name', [validateMetricQuery, validateAggregationQuery], async (req: Request, res: Response) => {
      try {
        const { name } = req.params;
        const { operation = 'avg', start, end } = req.query;
        
        if (!name) {
          res.status(400).json({
            error: 'Metric name is required',
            code: 'MISSING_METRIC_NAME',
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        const result = await this.metricsService.getAggregatedMetrics(
          name,
          operation as string,
          start as string | undefined,
          end as string | undefined
        );
        
        res.json({
          success: true,
          aggregation: result,
          query: {
            name,
            operation,
            start,
            end
          },
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error fetching aggregated metrics:', error);
        res.status(500).json({ 
          error: error.message,
          code: 'AGGREGATION_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get metrics by labels
    router.post('/query/labels', async (req: Request, res: Response): Promise<void> => {
      try {
        const { labels, start, end, limit } = req.body;
        
        if (!labels || typeof labels !== 'object' || Object.keys(labels).length === 0) {
          res.status(400).json({
            error: 'Labels object is required and cannot be empty',
            code: 'INVALID_LABELS_QUERY',
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        const queryOptions: MetricQueryOptions = {};
        if (start) queryOptions.start = start as string;
        if (end) queryOptions.end = end as string;
        if (limit) queryOptions.limit = parseInt(limit);
        
        const metrics = await this.metricsService.getMetricsByLabels(labels, queryOptions);
        
        res.json({ 
          success: true,
          metrics,
          count: metrics.length,
          query: {
            labels,
            ...queryOptions
          },
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error querying metrics by labels:', error);
        res.status(500).json({ 
          error: error.message,
          code: 'LABEL_QUERY_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get system metrics summary
    router.get('/system/summary', async (req: Request, res: Response) => {
      try {
        const summary = await this.metricsService.getSystemSummary();
        
        res.json({
          success: true,
          summary,
          count: summary.length,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error fetching system summary:', error);
        res.status(500).json({ 
          error: error.message,
          code: 'SYSTEM_SUMMARY_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get available metric names
    router.get('/system/names', async (req: Request, res: Response): Promise<void> => {
      try {
        const { limit } = req.query;
        const limitNum = limit ? parseInt(limit as string) : 100;
        
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
          res.status(400).json({
            error: 'Limit must be a number between 1 and 1000',
            code: 'INVALID_LIMIT',
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        const names = await this.metricsService.getMetricNames(limitNum);
        
        res.json({
          success: true,
          names,
          count: names.length,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error fetching metric names:', error);
        res.status(500).json({ 
          error: error.message,
          code: 'METRIC_NAMES_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Delete old metrics (cleanup endpoint)
    router.delete('/cleanup', async (req: Request, res: Response): Promise<void> => {
      try {
        const { olderThan = '30 days' } = req.query;
        
        // Validate cleanup interval
        const intervalRegex = /^\d+\s+(day|days|hour|hours|minute|minutes)$/i;
        if (!intervalRegex.test(olderThan as string)) {
          res.status(400).json({
            error: 'Invalid interval format. Use formats like "30 days", "24 hours", "60 minutes"',
            code: 'INVALID_CLEANUP_INTERVAL',
            timestamp: new Date().toISOString()
          });
          return;
        }
        
        const deletedCount = await this.metricsService.cleanupOldMetrics(olderThan as string);
        
        res.json({ 
          success: true,
          deletedCount,
          interval: olderThan,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error cleaning up metrics:', error);
        res.status(500).json({ 
          error: error.message,
          code: 'CLEANUP_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get health statistics
    router.get('/system/stats', async (req: Request, res: Response) => {
      try {
        const stats = await this.metricsService.getHealthStats();
        
        res.json({
          success: true,
          stats,
          timestamp: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error fetching health stats:', error);
        res.status(500).json({ 
          error: error.message,
          code: 'HEALTH_STATS_FAILED',
          timestamp: new Date().toISOString()
        });
      }
    });

    return router;
  }
}