import { BaseEntity } from './base';

export interface EventLogEntry extends BaseEntity {
  aggregateId: string;
  aggregateType: 'stablecoin' | 'transparency' | 'audit' | 'liquidity';
  eventType: string;
  eventData: Record<string, any>;
  metadata: Record<string, any>;
  version: number;
}