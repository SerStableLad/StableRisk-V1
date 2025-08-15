"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisConnection = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
class RedisConnection {
    constructor(config) {
        this.client = null;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 10;
        this.reconnectTimeout = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.lastError = null;
        this.circuitBreakerOpen = false;
        this.circuitBreakerResetTime = 0;
        this.circuitBreakerTimeout = 60000; // 1 minute
        this.config = config;
    }
    static getInstance(config) {
        if (!RedisConnection.instance) {
            if (!config) {
                throw new Error('RedisConnection configuration required for initial instance creation');
            }
            RedisConnection.instance = new RedisConnection(config);
        }
        return RedisConnection.instance;
    }
    async connect() {
        if (this.isConnected || this.isConnecting) {
            return;
        }
        if (this.circuitBreakerOpen) {
            if (Date.now() < this.circuitBreakerResetTime) {
                throw new Error('Circuit breaker is open - Redis connection temporarily disabled');
            }
            else {
                this.circuitBreakerOpen = false;
                console.log('[Redis] Circuit breaker reset - attempting reconnection');
            }
        }
        this.isConnecting = true;
        try {
            await this.establishConnection();
            this.isConnected = true;
            this.connectionAttempts = 0;
            this.lastError = null;
            console.log('[Redis] Connected successfully');
        }
        catch (error) {
            this.isConnected = false;
            this.lastError = error;
            this.handleConnectionError(error);
            throw error;
        }
        finally {
            this.isConnecting = false;
        }
    }
    async establishConnection() {
        this.client = new ioredis_1.default({
            host: this.config.host,
            port: this.config.port,
            password: this.config.password,
            db: this.config.db,
            keyPrefix: this.config.keyPrefix,
            retryDelayOnFailover: this.config.retryDelayOnFailover,
            maxRetriesPerRequest: this.config.maxRetriesPerRequest,
            lazyConnect: this.config.lazyConnect,
            keepAlive: this.config.keepAlive,
            connectTimeout: this.config.connectTimeout,
            commandTimeout: this.config.commandTimeout,
            retryDelayOnClusterDown: 300,
            retryDelayOnError: (times) => Math.min(times * 50, 2000), // Exponential backoff
            maxLoadingTimeout: 30000,
            enableReadyCheck: true,
            autoResubscribe: true,
            autoResendUnfulfilledCommands: true,
        });
        this.setupEventHandlers();
        // Test connection
        await this.client.ping();
    }
    setupEventHandlers() {
        if (!this.client)
            return;
        this.client.on('connect', () => {
            console.log('[Redis] Connection established');
            this.isConnected = true;
            this.connectionAttempts = 0;
        });
        this.client.on('ready', () => {
            console.log('[Redis] Client ready');
        });
        this.client.on('error', (error) => {
            console.error('[Redis] Connection error:', error.message);
            this.isConnected = false;
            this.lastError = error;
            this.handleConnectionError(error);
        });
        this.client.on('close', () => {
            console.log('[Redis] Connection closed');
            this.isConnected = false;
        });
        this.client.on('reconnecting', (delay) => {
            console.log(`[Redis] Reconnecting in ${delay}ms`);
        });
        this.client.on('end', () => {
            console.log('[Redis] Connection ended');
            this.isConnected = false;
        });
    }
    handleConnectionError(error) {
        this.connectionAttempts++;
        if (this.connectionAttempts >= this.maxConnectionAttempts) {
            console.error(`[Redis] Max connection attempts (${this.maxConnectionAttempts}) reached. Opening circuit breaker.`);
            this.circuitBreakerOpen = true;
            this.circuitBreakerResetTime = Date.now() + this.circuitBreakerTimeout;
            return;
        }
        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts - 1), 30000); // Exponential backoff, max 30s
        console.log(`[Redis] Scheduling reconnection attempt ${this.connectionAttempts} in ${delay}ms`);
        this.reconnectTimeout = setTimeout(() => {
            this.attemptReconnection();
        }, delay);
    }
    async attemptReconnection() {
        if (this.isConnected || this.isConnecting) {
            return;
        }
        console.log(`[Redis] Reconnection attempt ${this.connectionAttempts + 1}`);
        try {
            await this.connect();
        }
        catch (error) {
            console.error('[Redis] Reconnection failed:', error.message);
        }
    }
    getClient() {
        if (!this.client || !this.isConnected) {
            throw new Error('Redis client not connected. Call connect() first.');
        }
        return this.client;
    }
    async disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.client) {
            try {
                await this.client.quit();
            }
            catch (error) {
                console.error('[Redis] Error during disconnect:', error.message);
            }
            this.client = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        console.log('[Redis] Disconnected');
    }
    async healthCheck() {
        const result = {
            service: 'redis',
            status: 'unhealthy',
            timestamp: new Date()
        };
        try {
            if (!this.client || !this.isConnected) {
                result.error = 'Redis client not connected';
                result.details = {
                    connected: this.isConnected,
                    connecting: this.isConnecting,
                    connectionAttempts: this.connectionAttempts,
                    circuitBreakerOpen: this.circuitBreakerOpen
                };
                return result;
            }
            // Test basic operations
            const startTime = Date.now();
            await this.client.ping();
            const responseTime = Date.now() - startTime;
            // Get basic info
            const info = await this.client.info('memory');
            const memoryUsage = this.parseMemoryUsage(info);
            result.status = responseTime < 100 ? 'healthy' : 'degraded';
            result.details = {
                responseTime,
                memoryUsage,
                connectionAttempts: this.connectionAttempts,
                uptime: this.isConnected ? Date.now() - (this.circuitBreakerResetTime || Date.now()) : 0
            };
        }
        catch (error) {
            result.error = error.message;
            result.details = {
                lastError: this.lastError?.message,
                connectionAttempts: this.connectionAttempts,
                circuitBreakerOpen: this.circuitBreakerOpen
            };
        }
        return result;
    }
    parseMemoryUsage(info) {
        const lines = info.split('\r\n');
        const memory = {};
        lines.forEach(line => {
            if (line.includes(':')) {
                const [key, value] = line.split(':');
                if (key.startsWith('used_memory')) {
                    memory[key] = parseInt(value) || value;
                }
            }
        });
        return memory;
    }
    getConnectionInfo() {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            attempts: this.connectionAttempts,
            circuitBreakerOpen: this.circuitBreakerOpen,
            lastError: this.lastError?.message || null
        };
    }
    // Utility methods for common operations
    async safeExecute(operation) {
        if (!this.isConnected) {
            await this.connect();
        }
        try {
            return await operation();
        }
        catch (error) {
            if (this.isConnectionError(error)) {
                this.isConnected = false;
                throw new Error(`Redis operation failed: ${error.message}`);
            }
            throw error;
        }
    }
    isConnectionError(error) {
        const connectionErrors = [
            'ECONNREFUSED',
            'ENOTFOUND',
            'ETIMEDOUT',
            'EPIPE',
            'ECONNRESET'
        ];
        return connectionErrors.some(errorCode => error.code === errorCode || error.message.includes(errorCode));
    }
    // Pipeline operations for batch processing
    createPipeline() {
        if (!this.client || !this.isConnected) {
            throw new Error('Redis client not connected');
        }
        return this.client.pipeline();
    }
    async executePipeline(pipeline) {
        return this.safeExecute(() => pipeline.exec());
    }
    // Transaction support
    createTransaction() {
        if (!this.client || !this.isConnected) {
            throw new Error('Redis client not connected');
        }
        return this.client.multi();
    }
    async executeTransaction(transaction) {
        return this.safeExecute(() => transaction.exec());
    }
    // Test connection method for compatibility
    async testConnection() {
        try {
            if (!this.client || !this.isConnected) {
                await this.connect();
            }
            await this.client.ping();
            return true;
        }
        catch (error) {
            console.error('[Redis] Test connection failed:', error.message);
            return false;
        }
    }
    // Close method for compatibility
    async close() {
        return this.disconnect();
    }
}
exports.RedisConnection = RedisConnection;
//# sourceMappingURL=connection.js.map