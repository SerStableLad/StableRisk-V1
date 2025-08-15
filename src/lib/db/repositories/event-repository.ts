import { BaseRepository } from './base-repository';
import { EventLogEntry } from '../models/event';

export class EventRepository extends BaseRepository<EventLogEntry> {
  constructor() {
    super('event_log', 'events');
  }

  async logEvent(
    aggregateId: string,
    aggregateType: string,
    eventType: string,
    eventData: Record<string, any>,
    metadata: Record<string, any> = {}
  ): Promise<EventLogEntry> {
    const version = await this.getNextVersion(aggregateId, aggregateType);
    
    return this.create({
      aggregateId,
      aggregateType: aggregateType as any,
      eventType,
      eventData,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        source: 'stablerisk-api'
      },
      version
    });
  }

  async getEventHistory(
    aggregateId: string,
    aggregateType: string,
    fromVersion?: number
  ): Promise<EventLogEntry[]> {
    const baseQuery = `
      SELECT * FROM ${this.fullTableName} 
      WHERE aggregate_id = $1 AND aggregate_type = $2
    `;
    
    if (fromVersion !== undefined) {
      const result = await this.query(
        `${baseQuery} AND version >= $3 ORDER BY version ASC`,
        [aggregateId, aggregateType, fromVersion]
      );
      return result.rows;
    }
    
    const result = await this.query(
      `${baseQuery} ORDER BY version ASC`,
      [aggregateId, aggregateType]
    );
    return result.rows;
  }

  private async getNextVersion(aggregateId: string, aggregateType: string): Promise<number> {
    const result = await this.query(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version 
       FROM ${this.fullTableName} 
       WHERE aggregate_id = $1 AND aggregate_type = $2`,
      [aggregateId, aggregateType]
    );
    return result.rows[0].next_version;
  }

  async getRecentEvents(limit: number = 100): Promise<EventLogEntry[]> {
    const result = await this.query(
      `SELECT * FROM ${this.fullTableName} 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}