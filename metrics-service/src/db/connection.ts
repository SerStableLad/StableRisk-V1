import { Pool, PoolClient, QueryResult } from 'pg';

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  min: number;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: Pool;
  private config: DatabaseConfig;

  private constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'stablerisk',
      user: process.env.DB_USER || 'stablerisk_user',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
      min: parseInt(process.env.DB_POOL_MIN || '5'),
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: parseInt(process.env.DB_QUERY_TIMEOUT || '10000'),
    };

    this.pool = new Pool(this.config);
    
    this.pool.on('error', (err) => {
      console.error('Metrics Service - PostgreSQL pool error:', err);
    });

    this.pool.on('connect', () => {
      console.log('Metrics Service - PostgreSQL client connected');
    });

    this.pool.on('remove', () => {
      console.log('Metrics Service - PostgreSQL client removed');
    });
  }

  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async query<T extends Record<string, any> = any>(
    text: string, 
    params?: any[]
  ): Promise<QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } catch (error) {
      console.error('Metrics Service - Database query error:', error);
      console.error('Query:', text);
      console.error('Params:', params);
      throw error;
    } finally {
      client.release();
    }
  }

  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Metrics Service - Transaction error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW() as current_time');
      return result.rows.length > 0;
    } catch (error) {
      console.error('Metrics Service - Database health check failed:', error);
      return false;
    }
  }

  public async getConnectionInfo(): Promise<{
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  }> {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  public async initializeSchema(): Promise<void> {
    try {
      // Check if metrics schema exists
      const schemaCheck = await this.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name = 'metrics'
      `);

      if (schemaCheck.rows.length === 0) {
        console.log('Metrics Service - Creating metrics schema...');
        await this.query('CREATE SCHEMA IF NOT EXISTS metrics');
      }

      // Check if metrics table exists
      const tableCheck = await this.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'metrics' AND table_name = 'metric_data'
      `);

      if (tableCheck.rows.length === 0) {
        console.log('Metrics Service - Creating metric_data table...');
        
        // Create the table
        await this.query(`
          CREATE TABLE metrics.metric_data (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            value DOUBLE PRECISION NOT NULL,
            labels JSONB DEFAULT '{}',
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);

        // Create indexes
        await this.query(`
          CREATE INDEX idx_metric_data_name ON metrics.metric_data(name)
        `);
        
        await this.query(`
          CREATE INDEX idx_metric_data_recorded_at ON metrics.metric_data(recorded_at)
        `);
        
        await this.query(`
          CREATE INDEX idx_metric_data_name_recorded_at ON metrics.metric_data(name, recorded_at)
        `);
        
        await this.query(`
          CREATE INDEX idx_metric_data_labels ON metrics.metric_data USING GIN(labels)
        `);

        console.log('Metrics Service - Schema initialization completed');
      }
    } catch (error) {
      console.error('Metrics Service - Schema initialization failed:', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
    console.log('Metrics Service - Database connection pool closed');
  }
}