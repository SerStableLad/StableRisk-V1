import { BaseRepository } from './base-repository';
import { StablecoinMetrics } from '../models/analytics';

export class AnalyticsRepository extends BaseRepository<StablecoinMetrics> {
  constructor() {
    super('stablecoin_metrics', 'analytics');
  }

  async upsertMetrics(ticker: string, metrics: Partial<StablecoinMetrics>): Promise<StablecoinMetrics> {
    const result = await this.query(
      `INSERT INTO ${this.fullTableName} 
       (ticker, last_updated, risk_score, transparency_score, liquidity_score, audit_score, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (ticker) 
       DO UPDATE SET 
         last_updated = EXCLUDED.last_updated,
         risk_score = EXCLUDED.risk_score,
         transparency_score = EXCLUDED.transparency_score,
         liquidity_score = EXCLUDED.liquidity_score,
         audit_score = EXCLUDED.audit_score,
         metadata = EXCLUDED.metadata
       RETURNING *`,
      [
        ticker,
        new Date(),
        metrics.riskScore,
        metrics.transparencyScore,
        metrics.liquidityScore,
        metrics.auditScore,
        JSON.stringify(metrics.metadata || {})
      ]
    );
    return result.rows[0];
  }

  async getMetricsByTicker(ticker: string): Promise<StablecoinMetrics | null> {
    const result = await this.query(
      `SELECT * FROM ${this.fullTableName} WHERE ticker = $1`,
      [ticker]
    );
    return result.rows[0] || null;
  }

  async getTopPerformers(limit: number = 10): Promise<StablecoinMetrics[]> {
    const result = await this.query(
      `SELECT * FROM ${this.fullTableName} 
       WHERE risk_score IS NOT NULL 
       ORDER BY risk_score DESC, transparency_score DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async getMetricsHistory(ticker: string, days: number = 30): Promise<any[]> {
    // This would require a separate time-series table in a real implementation
    // For now, return empty array as placeholder
    return [];
  }
}