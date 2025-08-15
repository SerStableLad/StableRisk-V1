import { BaseEntity } from './base';

export interface CacheInvalidationLog extends BaseEntity {
  cacheKey: string;
  invalidatedAt: Date;
  reason: string;
  relatedTicker?: string;
}