import DatabaseConnection from '../connection';
import { Pool } from 'pg';

export abstract class BaseRepository<T> {
  protected pool: Pool;
  protected tableName: string;
  protected schema: string;

  constructor(tableName: string, schema: string = 'public') {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.tableName = tableName;
    this.schema = schema;
  }

  protected get fullTableName(): string {
    return `${this.schema}.${this.tableName}`;
  }

  protected async query(sql: string, params?: any[]): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result;
    } catch (error) {
      console.error(`Query error in ${this.fullTableName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<T | null> {
    const result = await this.query(
      `SELECT * FROM ${this.fullTableName} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async create(entity: Partial<T>): Promise<T> {
    const keys = Object.keys(entity).filter(key => (entity as any)[key] !== undefined);
    const values = keys.map(key => (entity as any)[key]);
    const placeholders = keys.map((_, index) => `$${index + 1}`);

    const result = await this.query(
      `INSERT INTO ${this.fullTableName} (${keys.join(', ')}) 
       VALUES (${placeholders.join(', ')}) 
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const keys = Object.keys(updates).filter(key => (updates as any)[key] !== undefined);
    const values = keys.map(key => (updates as any)[key]);
    const setClause = keys.map((key, index) => `${key} = $${index + 2}`);

    if (keys.length === 0) return this.findById(id);

    const result = await this.query(
      `UPDATE ${this.fullTableName} 
       SET ${setClause.join(', ')}, updated_at = NOW()
       WHERE id = $1 
       RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] || null;
  }
}