export interface RedisNode {
    host: string;
    port: number;
    password?: string;
}
export interface RedisClusterConfig {
    nodes: RedisNode[];
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
    enableReadyCheck: boolean;
    maxMemoryPolicy: string;
    keyPrefix?: string;
    connectTimeout: number;
    lazyConnect: boolean;
}
export interface PipelineOperation {
    command: string;
    args: any[];
    resolve: (value: any) => void;
    reject: (error: any) => void;
}
export interface Pipeline {
    get(key: string): Pipeline;
    set(key: string, value: string): Pipeline;
    setex(key: string, ttl: number, value: string): Pipeline;
    del(key: string): Pipeline;
    sadd(key: string, member: string): Pipeline;
    srem(key: string, member: string): Pipeline;
    smembers(key: string): Pipeline;
    scard(key: string): Pipeline;
    expire(key: string, ttl: number): Pipeline;
    scan(cursor: number, ...args: any[]): Pipeline;
    exec(): Promise<Array<[Error | null, any]>>;
}
export declare class RedisCluster {
    private static instance;
    private isConnected;
    private config;
    private connectionPool;
    private data;
    private expires;
    private sets;
    private constructor();
    static getInstance(config?: Partial<RedisClusterConfig>): RedisCluster;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private ensureConnected;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<string>;
    setex(key: string, ttl: number, value: string): Promise<string>;
    del(key: string): Promise<number>;
    exists(key: string): Promise<number>;
    expire(key: string, ttl: number): Promise<number>;
    ttl(key: string): Promise<number>;
    sadd(key: string, member: string): Promise<number>;
    srem(key: string, member: string): Promise<number>;
    smembers(key: string): Promise<string[]>;
    scard(key: string): Promise<number>;
    scan(cursor: number, matchPattern?: string, count?: number): Promise<[string, string[]]>;
    scan(cursor: number, type: 'MATCH', pattern: string, countType: 'COUNT', count: number): Promise<[string, string[]]>;
    info(section?: string): Promise<string>;
    dbsize(): Promise<number>;
    pipeline(): Pipeline;
    ping(): Promise<string>;
    isHealthy(): Promise<boolean>;
    getConfig(): RedisClusterConfig;
    updateConfig(config: Partial<RedisClusterConfig>): void;
    isConnectedStatus(): boolean;
    getConnectionStats(): {
        isConnected: boolean;
        totalKeys: number;
        totalSets: number;
        expiringKeys: number;
        nodes: number;
    };
    private startExpirationCleanup;
    private cleanupExpiredKeys;
}
//# sourceMappingURL=cluster-connection.d.ts.map