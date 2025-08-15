import { BaseEntity } from './base';

export interface StablecoinMetrics extends BaseEntity {
  ticker: string;
  lastUpdated: Date;
  riskScore?: number;
  transparencyScore?: number;
  liquidityScore?: number;
  auditScore?: number;
  metadata: Record<string, any>;
}