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
import { PoolClient } from 'pg';
import { DatabaseConfig, HealthCheckResult } from '../types';
export declare class DatabaseConnection {
    private static instance;
    private pool;
    private config;
    private isConnected;
    private connectionAttempts;
    private maxConnectionAttempts;
    private lastError;
    private constructor();
    static getInstance(config?: DatabaseConfig): DatabaseConnection;
    connect(): Promise<void>;
    private setupEventHandlers;
    disconnect(): Promise<void>;
    query(text: string, params?: any[]): Promise<any>;
    getClient(): Promise<PoolClient>;
    transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
    healthCheck(): Promise<HealthCheckResult>;
    persistJobResult(jobId: string, result: any, completedAt: Date): Promise<void>;
    getJobResult(jobId: string): Promise<any>;
    persistJobMetrics(jobId: string, jobType: string, processingTimeMs: number, success: boolean, error?: string): Promise<void>;
    getJobMetrics(startDate: Date, endDate: Date, jobType?: string): Promise<any[]>;
    cleanupOldJobResults(maxAge?: number): Promise<number>;
    cleanupOldJobMetrics(maxAge?: number): Promise<number>;
    initializeSchema(): Promise<void>;
    getConnectionInfo(): {
        connected: boolean;
        poolSize: number;
        totalCount: number;
        idleCount: number;
        waitingCount: number;
        attempts: number;
        lastError: string | null;
    };
    testConnection(): Promise<boolean>;
    close(): Promise<void>;
}
//# sourceMappingURL=connection.d.ts.map