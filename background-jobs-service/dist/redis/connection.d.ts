/**
 * Redis Connection Management with Health Monitoring
 *
 * Features:
 * - Singleton pattern for connection management
 * - Automatic reconnection with exponential backoff
 * - Health monitoring and circuit breaker pattern
 * - Connection pooling and cleanup
 * - Comprehensive error handling
 */
import { Redis as RedisInstance } from 'ioredis';
import { RedisConfig, HealthCheckResult } from '../types';
export declare class RedisConnection {
    private static instance;
    private client;
    private config;
    private connectionAttempts;
    private maxConnectionAttempts;
    private reconnectTimeout;
    private isConnected;
    private isConnecting;
    private lastError;
    private circuitBreakerOpen;
    private circuitBreakerResetTime;
    private readonly circuitBreakerTimeout;
    private constructor();
    static getInstance(config?: RedisConfig): RedisConnection;
    connect(): Promise<void>;
    private establishConnection;
    private setupEventHandlers;
    private handleConnectionError;
    private attemptReconnection;
    getClient(): RedisInstance;
    disconnect(): Promise<void>;
    healthCheck(): Promise<HealthCheckResult>;
    private parseMemoryUsage;
    getConnectionInfo(): {
        connected: boolean;
        connecting: boolean;
        attempts: number;
        circuitBreakerOpen: boolean;
        lastError: string | null;
    };
    safeExecute<T>(operation: () => Promise<T>): Promise<T>;
    private isConnectionError;
    createPipeline(): any;
    executePipeline(pipeline: any): Promise<any>;
    createTransaction(): any;
    executeTransaction(transaction: any): Promise<any>;
    testConnection(): Promise<boolean>;
    close(): Promise<void>;
}
//# sourceMappingURL=connection.d.ts.map