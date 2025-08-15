import { EventRepository } from '../db/repositories/event-repository';
import { AnalyticsRepository } from '../db/repositories/analytics-repository';

export class DatabaseIntegrationService {
  private static instance: DatabaseIntegrationService;
  private eventRepo: EventRepository;
  private analyticsRepo: AnalyticsRepository;

  private constructor() {
    this.eventRepo = new EventRepository();
    this.analyticsRepo = new AnalyticsRepository();
  }

  public static getInstance(): DatabaseIntegrationService {
    if (!DatabaseIntegrationService.instance) {
      DatabaseIntegrationService.instance = new DatabaseIntegrationService();
    }
    return DatabaseIntegrationService.instance;
  }

  // Event logging methods
  async logStablecoinDataFetch(ticker: string, source: string, success: boolean, metadata: any = {}) {
    try {
      await this.eventRepo.logEvent(
        ticker,
        'stablecoin',
        'data_fetch',
        {
          source,
          success,
          ...metadata
        }
      );
    } catch (error) {
      console.error('Failed to log stablecoin data fetch event:', error);
      // Don't throw - this is supplementary logging
    }
  }

  async logCacheEvent(cacheKey: string, action: 'hit' | 'miss' | 'set' | 'invalidate', metadata: any = {}) {
    try {
      await this.eventRepo.logEvent(
        cacheKey,
        'cache',
        action,
        metadata
      );
    } catch (error) {
      console.error('Failed to log cache event:', error);
      // Don't throw - this is supplementary logging
    }
  }

  // Analytics methods
  async saveStablecoinMetrics(ticker: string, scores: {
    riskScore?: number;
    transparencyScore?: number;
    liquidityScore?: number;
    auditScore?: number;
  }, metadata: any = {}) {
    try {
      return await this.analyticsRepo.upsertMetrics(ticker, {
        ...scores,
        metadata
      });
    } catch (error) {
      console.error('Failed to save stablecoin metrics:', error);
      throw error; // This might be used for analytics, so throw
    }
  }

  async getHistoricalMetrics(ticker: string): Promise<any> {
    try {
      return await this.analyticsRepo.getMetricsByTicker(ticker);
    } catch (error) {
      console.error('Failed to get historical metrics:', error);
      return null;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const recentEvents = await this.eventRepo.getRecentEvents(1);
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}