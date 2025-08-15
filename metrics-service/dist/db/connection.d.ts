import { Pool, PoolClient, QueryResult } from 'pg';
export declare class DatabaseConnection {
    private static instance;
    private pool;
    private config;
    private constructor();
    static getInstance(): DatabaseConnection;
    getPool(): Pool;
    query<T extends Record<string, any> = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>;
    healthCheck(): Promise<boolean>;
    getConnectionInfo(): Promise<{
        totalCount: number;
        idleCount: number;
        waitingCount: number;
    }>;
    initializeSchema(): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=connection.d.ts.map