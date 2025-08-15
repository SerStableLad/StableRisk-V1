"use strict";
/**
 * Database Connection Management for Job Result Persistence
 *
 * Features:
 * - PostgreSQL connection pooling
 * - Health monitoring and recovery
 * - Transaction support for job operations
 * - Prepared statements for performance
 * - Connection retry logic
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseConnection = void 0;
const pg_1 = require("pg");
class DatabaseConnection {
    constructor(config) {
        this.pool = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.lastError = null;
        this.config = config;
    }
    static getInstance(config) {
        if (!DatabaseConnection.instance) {
            if (!config) {
                throw new Error('DatabaseConnection configuration required for initial instance creation');
            }
            DatabaseConnection.instance = new DatabaseConnection(config);
        }
        return DatabaseConnection.instance;
    }
    async connect() {
        if (this.isConnected && this.pool) {
            return;
        }
        try {
            this.pool = new pg_1.Pool({
                host: this.config.host,
                port: this.config.port,
                database: this.config.database,
                user: this.config.username,
                password: this.config.password,
                ssl: this.config.ssl,
                max: this.config.poolSize,
                connectionTimeoutMillis: this.config.connectionTimeout,
                query_timeout: this.config.queryTimeout,
                idle_timeout_millis: 30000,
                idleTimeoutMillis: 30000,
                allowExitOnIdle: true
            });
            this.setupEventHandlers();
            // Test connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            this.isConnected = true;
            this.connectionAttempts = 0;
            this.lastError = null;
            console.log('[Database] Connected successfully');
        }
        catch (error) {
            this.isConnected = false;
            this.lastError = error;
            this.connectionAttempts++;
            console.error(`[Database] Connection failed (attempt ${this.connectionAttempts}):`, error.message);
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts - 1), 10000);
                console.log(`[Database] Retrying connection in ${delay}ms`);
                setTimeout(() => {
                    this.connect().catch(console.error);
                }, delay);
            }
            throw error;
        }
    }
    setupEventHandlers() {
        if (!this.pool)
            return;
        this.pool.on('connect', (client) => {
            console.log('[Database] New client connected');
        });
        this.pool.on('error', (error) => {
            console.error('[Database] Pool error:', error.message);
            this.lastError = error;
        });
        this.pool.on('remove', (client) => {
            console.log('[Database] Client removed from pool');
        });
    }
    async disconnect() {
        if (this.pool) {
            try {
                await this.pool.end();
                console.log('[Database] Connection pool closed');
            }
            catch (error) {
                console.error('[Database] Error closing pool:', error.message);
            }
            this.pool = null;
        }
        this.isConnected = false;
    }
    async query(text, params) {
        if (!this.pool) {
            throw new Error('Database not connected');
        }
        try {
            const result = await this.pool.query(text, params);
            return result;
        }
        catch (error) {
            console.error('[Database] Query error:', error.message);
            throw error;
        }
    }
    async getClient() {
        if (!this.pool) {
            throw new Error('Database not connected');
        }
        return await this.pool.connect();
    }
    async transaction(callback) {
        if (!this.pool) {
            throw new Error('Database not connected');
        }
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async healthCheck() {
        const result = {
            service: 'database',
            status: 'unhealthy',
            timestamp: new Date()
        };
        try {
            if (!this.pool || !this.isConnected) {
                result.error = 'Database pool not available';
                result.details = {
                    connected: this.isConnected,
                    connectionAttempts: this.connectionAttempts,
                    lastError: this.lastError?.message
                };
                return result;
            }
            const startTime = Date.now();
            const testResult = await this.pool.query('SELECT NOW(), version()');
            const responseTime = Date.now() - startTime;
            result.status = responseTime < 1000 ? 'healthy' : 'degraded';
            result.details = {
                responseTime,
                totalConnections: this.pool.totalCount,
                idleConnections: this.pool.idleCount,
                waitingCount: this.pool.waitingCount,
                version: testResult.rows[0]?.version,
                serverTime: testResult.rows[0]?.now
            };
        }
        catch (error) {
            result.error = error.message;
            result.details = {
                lastError: this.lastError?.message,
                connectionAttempts: this.connectionAttempts
            };
        }
        return result;
    }
    // Job persistence methods
    async persistJobResult(jobId, result, completedAt) {
        const query = `
      INSERT INTO job_results (job_id, result, completed_at, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (job_id) 
      DO UPDATE SET 
        result = EXCLUDED.result,
        completed_at = EXCLUDED.completed_at,
        updated_at = NOW()
    `;
        await this.query(query, [jobId, JSON.stringify(result), completedAt]);
    }
    async getJobResult(jobId) {
        const query = 'SELECT result FROM job_results WHERE job_id = $1';
        const result = await this.query(query, [jobId]);
        return result.rows.length > 0 ? JSON.parse(result.rows[0].result) : null;
    }
    async persistJobMetrics(jobId, jobType, processingTimeMs, success, error) {
        const query = `
      INSERT INTO job_metrics (
        job_id, job_type, processing_time_ms, success, error, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `;
        await this.query(query, [jobId, jobType, processingTimeMs, success, error]);
    }
    async getJobMetrics(startDate, endDate, jobType) {
        let query = `
      SELECT 
        job_type,
        COUNT(*) as total_jobs,
        COUNT(*) FILTER (WHERE success = true) as successful_jobs,
        COUNT(*) FILTER (WHERE success = false) as failed_jobs,
        AVG(processing_time_ms) as avg_processing_time,
        MAX(processing_time_ms) as max_processing_time,
        MIN(processing_time_ms) as min_processing_time
      FROM job_metrics
      WHERE created_at BETWEEN $1 AND $2
    `;
        const params = [startDate, endDate];
        if (jobType) {
            query += ' AND job_type = $3';
            params.push(jobType);
        }
        query += ' GROUP BY job_type ORDER BY total_jobs DESC';
        const result = await this.query(query, params);
        return result.rows;
    }
    async cleanupOldJobResults(maxAge = 30 * 24 * 60 * 60 * 1000) {
        const cutoffDate = new Date(Date.now() - maxAge);
        const query = `
      DELETE FROM job_results 
      WHERE completed_at < $1
      RETURNING job_id
    `;
        const result = await this.query(query, [cutoffDate]);
        if (result.rows.length > 0) {
            console.log(`[Database] Cleaned up ${result.rows.length} old job results`);
        }
        return result.rows.length;
    }
    async cleanupOldJobMetrics(maxAge = 90 * 24 * 60 * 60 * 1000) {
        const cutoffDate = new Date(Date.now() - maxAge);
        const query = `
      DELETE FROM job_metrics 
      WHERE created_at < $1
      RETURNING job_id
    `;
        const result = await this.query(query, [cutoffDate]);
        if (result.rows.length > 0) {
            console.log(`[Database] Cleaned up ${result.rows.length} old job metrics`);
        }
        return result.rows.length;
    }
    // Database schema initialization
    async initializeSchema() {
        const schemas = [
            `
      CREATE TABLE IF NOT EXISTS job_results (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) UNIQUE NOT NULL,
        result JSONB NOT NULL,
        completed_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
      `,
            `
      CREATE TABLE IF NOT EXISTS job_metrics (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) NOT NULL,
        job_type VARCHAR(255) NOT NULL,
        processing_time_ms INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
      `,
            `
      CREATE INDEX IF NOT EXISTS idx_job_results_job_id ON job_results(job_id)
      `,
            `
      CREATE INDEX IF NOT EXISTS idx_job_results_completed_at ON job_results(completed_at)
      `,
            `
      CREATE INDEX IF NOT EXISTS idx_job_metrics_job_type ON job_metrics(job_type)
      `,
            `
      CREATE INDEX IF NOT EXISTS idx_job_metrics_created_at ON job_metrics(created_at)
      `,
            `
      CREATE INDEX IF NOT EXISTS idx_job_metrics_success ON job_metrics(success)
      `
        ];
        for (const schema of schemas) {
            try {
                await this.query(schema);
            }
            catch (error) {
                console.error('[Database] Schema initialization error:', error.message);
                throw error;
            }
        }
        console.log('[Database] Schema initialized successfully');
    }
    getConnectionInfo() {
        return {
            connected: this.isConnected,
            poolSize: this.config.poolSize,
            totalCount: this.pool?.totalCount || 0,
            idleCount: this.pool?.idleCount || 0,
            waitingCount: this.pool?.waitingCount || 0,
            attempts: this.connectionAttempts,
            lastError: this.lastError?.message || null
        };
    }
    // Test connection method for compatibility
    async testConnection() {
        try {
            if (!this.pool || !this.isConnected) {
                await this.connect();
            }
            await this.query('SELECT 1');
            return true;
        }
        catch (error) {
            console.error('[Database] Test connection failed:', error.message);
            return false;
        }
    }
    // Close method for compatibility
    async close() {
        return this.disconnect();
    }
}
exports.DatabaseConnection = DatabaseConnection;
//# sourceMappingURL=connection.js.map