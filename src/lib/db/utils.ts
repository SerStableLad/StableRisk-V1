import DatabaseService from './index';

export interface DatabaseStats {
  schemas: string[];
  tables: Array<{
    schema: string;
    table: string;
    rowCount: number;
  }>;
  indexes: Array<{
    schema: string;
    table: string;
    index: string;
  }>;
  connectionInfo: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    activeCount: number;
  };
}

export class DatabaseUtils {
  static async getStats(): Promise<DatabaseStats> {
    const [schemasResult, tablesResult, indexesResult, connectionInfo] = await Promise.all([
      // Get all schemas
      DatabaseService.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
        ORDER BY schema_name
      `),
      
      // Get all tables with row counts
      DatabaseService.query(`
        SELECT 
          schemaname as schema,
          tablename as table,
          n_tup_ins as row_count
        FROM pg_stat_user_tables 
        ORDER BY schemaname, tablename
      `),
      
      // Get all indexes
      DatabaseService.query(`
        SELECT 
          schemaname as schema,
          tablename as table,
          indexname as index
        FROM pg_indexes 
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
        ORDER BY schemaname, tablename, indexname
      `),
      
      // Get connection info
      DatabaseService.getConnectionInfo()
    ]);

    return {
      schemas: schemasResult.rows.map(row => row.schema_name),
      tables: tablesResult.rows,
      indexes: indexesResult.rows,
      connectionInfo: {
        ...connectionInfo,
        activeCount: connectionInfo.totalCount - connectionInfo.idleCount
      }
    };
  }

  static async verifySchemas(): Promise<{
    valid: boolean;
    missing: string[];
    present: string[];
  }> {
    const expectedSchemas = ['events', 'analytics', 'cache_metadata'];
    
    const result = await DatabaseService.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = ANY($1)
    `, [expectedSchemas]);
    
    const presentSchemas = result.rows.map(row => row.schema_name);
    const missingSchemas = expectedSchemas.filter(
      schema => !presentSchemas.includes(schema)
    );
    
    return {
      valid: missingSchemas.length === 0,
      missing: missingSchemas,
      present: presentSchemas
    };
  }

  static async verifyTables(): Promise<{
    valid: boolean;
    missing: Array<{ schema: string; table: string }>;
    present: Array<{ schema: string; table: string }>;
  }> {
    const expectedTables = [
      { schema: 'events', table: 'event_log' },
      { schema: 'analytics', table: 'stablecoin_metrics' },
      { schema: 'cache_metadata', table: 'invalidation_log' }
    ];
    
    const result = await DatabaseService.query(`
      SELECT schemaname as schema, tablename as table
      FROM pg_tables 
      WHERE (schemaname, tablename) = ANY($1)
    `, [expectedTables.map(t => [t.schema, t.table])]);
    
    const presentTables = result.rows;
    const missingTables = expectedTables.filter(expected =>
      !presentTables.some(present => 
        present.schema === expected.schema && present.table === expected.table
      )
    );
    
    return {
      valid: missingTables.length === 0,
      missing: missingTables,
      present: presentTables
    };
  }

  static async logEvent(
    aggregateId: string,
    aggregateType: string,
    eventType: string,
    eventData: any,
    metadata: any = {},
    version: number = 1
  ): Promise<void> {
    await DatabaseService.query(`
      INSERT INTO events.event_log 
      (aggregate_id, aggregate_type, event_type, event_data, metadata, version)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [aggregateId, aggregateType, eventType, JSON.stringify(eventData), JSON.stringify(metadata), version]);
  }

  static async updateStablecoinMetrics(
    ticker: string,
    riskScore?: number,
    transparencyScore?: number,
    liquidityScore?: number,
    auditScore?: number,
    metadata: any = {}
  ): Promise<void> {
    await DatabaseService.query(`
      INSERT INTO analytics.stablecoin_metrics 
      (ticker, last_updated, risk_score, transparency_score, liquidity_score, audit_score, metadata)
      VALUES ($1, NOW(), $2, $3, $4, $5, $6)
      ON CONFLICT (ticker) 
      DO UPDATE SET 
        last_updated = EXCLUDED.last_updated,
        risk_score = COALESCE(EXCLUDED.risk_score, analytics.stablecoin_metrics.risk_score),
        transparency_score = COALESCE(EXCLUDED.transparency_score, analytics.stablecoin_metrics.transparency_score),
        liquidity_score = COALESCE(EXCLUDED.liquidity_score, analytics.stablecoin_metrics.liquidity_score),
        audit_score = COALESCE(EXCLUDED.audit_score, analytics.stablecoin_metrics.audit_score),
        metadata = EXCLUDED.metadata
    `, [ticker, riskScore, transparencyScore, liquidityScore, auditScore, JSON.stringify(metadata)]);
  }

  static async logCacheInvalidation(
    cacheKey: string,
    reason: string,
    relatedTicker?: string
  ): Promise<void> {
    await DatabaseService.query(`
      INSERT INTO cache_metadata.invalidation_log 
      (cache_key, reason, related_ticker)
      VALUES ($1, $2, $3)
    `, [cacheKey, reason, relatedTicker]);
  }
}

export default DatabaseUtils;