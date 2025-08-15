"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCluster = void 0;
class RedisCluster {
    static instance;
    isConnected = false;
    config;
    connectionPool = new Map();
    data = new Map();
    expires = new Map();
    sets = new Map();
    constructor(config) {
        this.config = {
            nodes: [
                { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') }
            ],
            maxRetriesPerRequest: 3,
            retryDelayOnFailover: 100,
            enableReadyCheck: true,
            maxMemoryPolicy: 'allkeys-lru',
            connectTimeout: 10000,
            lazyConnect: false,
            ...config
        };
    }
    static getInstance(config) {
        if (!RedisCluster.instance) {
            RedisCluster.instance = new RedisCluster(config);
        }
        return RedisCluster.instance;
    }
    async connect() {
        try {
            console.log('Connecting to Redis cluster...');
            // In a real implementation, this would connect to actual Redis cluster
            // For testing and development, we use an in-memory implementation
            // Simulate connection delay
            await new Promise(resolve => setTimeout(resolve, 100));
            this.isConnected = true;
            console.log(`Redis cluster connected to ${this.config.nodes.length} nodes`);
            // Start cleanup interval for expired keys
            this.startExpirationCleanup();
        }
        catch (error) {
            console.error('Redis cluster connection failed:', error);
            throw error;
        }
    }
    async disconnect() {
        try {
            this.isConnected = false;
            this.data.clear();
            this.expires.clear();
            this.sets.clear();
            this.connectionPool.clear();
            console.log('Redis cluster disconnected');
        }
        catch (error) {
            console.error('Error disconnecting from Redis cluster:', error);
            throw error;
        }
    }
    ensureConnected() {
        if (!this.isConnected) {
            throw new Error('Redis cluster is not connected');
        }
    }
    async get(key) {
        this.ensureConnected();
        // Check if key is expired
        const expiry = this.expires.get(key);
        if (expiry && Date.now() > expiry) {
            this.data.delete(key);
            this.expires.delete(key);
            return null;
        }
        return this.data.get(key) || null;
    }
    async set(key, value) {
        this.ensureConnected();
        this.data.set(key, value);
        return 'OK';
    }
    async setex(key, ttl, value) {
        this.ensureConnected();
        this.data.set(key, value);
        this.expires.set(key, Date.now() + (ttl * 1000));
        return 'OK';
    }
    async del(key) {
        this.ensureConnected();
        const existed = this.data.has(key);
        this.data.delete(key);
        this.expires.delete(key);
        this.sets.delete(key);
        return existed ? 1 : 0;
    }
    async exists(key) {
        this.ensureConnected();
        // Check if key is expired
        const expiry = this.expires.get(key);
        if (expiry && Date.now() > expiry) {
            this.data.delete(key);
            this.expires.delete(key);
            return 0;
        }
        return this.data.has(key) ? 1 : 0;
    }
    async expire(key, ttl) {
        this.ensureConnected();
        if (this.data.has(key) || this.sets.has(key)) {
            this.expires.set(key, Date.now() + (ttl * 1000));
            return 1;
        }
        return 0;
    }
    async ttl(key) {
        this.ensureConnected();
        const expiry = this.expires.get(key);
        if (!expiry) {
            return this.data.has(key) || this.sets.has(key) ? -1 : -2;
        }
        const remaining = Math.ceil((expiry - Date.now()) / 1000);
        return remaining > 0 ? remaining : -2;
    }
    // Set operations
    async sadd(key, member) {
        this.ensureConnected();
        let set = this.sets.get(key);
        if (!set) {
            set = new Set();
            this.sets.set(key, set);
        }
        const sizeBefore = set.size;
        set.add(member);
        return set.size - sizeBefore;
    }
    async srem(key, member) {
        this.ensureConnected();
        const set = this.sets.get(key);
        if (!set) {
            return 0;
        }
        const removed = set.delete(member);
        if (set.size === 0) {
            this.sets.delete(key);
        }
        return removed ? 1 : 0;
    }
    async smembers(key) {
        this.ensureConnected();
        // Check if key is expired
        const expiry = this.expires.get(key);
        if (expiry && Date.now() > expiry) {
            this.sets.delete(key);
            this.expires.delete(key);
            return [];
        }
        const set = this.sets.get(key);
        return set ? Array.from(set) : [];
    }
    async scard(key) {
        this.ensureConnected();
        // Check if key is expired
        const expiry = this.expires.get(key);
        if (expiry && Date.now() > expiry) {
            this.sets.delete(key);
            this.expires.delete(key);
            return 0;
        }
        const set = this.sets.get(key);
        return set ? set.size : 0;
    }
    async scan(cursor, ...args) {
        this.ensureConnected();
        // Parse arguments
        let pattern;
        let count = 1000;
        for (let i = 0; i < args.length; i += 2) {
            const arg = args[i];
            if (arg === 'MATCH' && args[i + 1]) {
                pattern = args[i + 1];
            }
            else if (arg === 'COUNT' && args[i + 1]) {
                count = parseInt(args[i + 1]);
            }
        }
        // Get all keys (both regular data and sets)
        const allKeys = [
            ...Array.from(this.data.keys()),
            ...Array.from(this.sets.keys())
        ];
        // Filter by pattern if provided
        let keys = allKeys;
        if (pattern) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
            keys = allKeys.filter(key => regex.test(key));
        }
        // Apply count limit
        keys = keys.slice(0, count);
        return ['0', keys]; // Always return cursor '0' for simplicity in tests
    }
    // Information operations
    async info(section) {
        this.ensureConnected();
        const memoryInfo = `used_memory:${this.data.size * 100}\nused_memory_human:${(this.data.size * 100 / 1024).toFixed(2)}K\nmaxmemory:0`;
        if (section === 'memory') {
            return memoryInfo;
        }
        return `${memoryInfo}\nconnected_clients:1\ntotal_commands_processed:1000`;
    }
    async dbsize() {
        this.ensureConnected();
        return this.data.size + this.sets.size;
    }
    // Pipeline operations
    pipeline() {
        this.ensureConnected();
        const operations = [];
        const pipelineObj = {
            get: (key) => {
                operations.push({
                    command: 'get',
                    args: [key],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            set: (key, value) => {
                operations.push({
                    command: 'set',
                    args: [key, value],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            setex: (key, ttl, value) => {
                operations.push({
                    command: 'setex',
                    args: [key, ttl, value],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            del: (key) => {
                operations.push({
                    command: 'del',
                    args: [key],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            sadd: (key, member) => {
                operations.push({
                    command: 'sadd',
                    args: [key, member],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            srem: (key, member) => {
                operations.push({
                    command: 'srem',
                    args: [key, member],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            smembers: (key) => {
                operations.push({
                    command: 'smembers',
                    args: [key],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            scard: (key) => {
                operations.push({
                    command: 'scard',
                    args: [key],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            expire: (key, ttl) => {
                operations.push({
                    command: 'expire',
                    args: [key, ttl],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            scan: (cursor, ...args) => {
                operations.push({
                    command: 'scan',
                    args: [cursor, ...args],
                    resolve: () => { },
                    reject: () => { }
                });
                return pipelineObj;
            },
            exec: async () => {
                const results = [];
                for (const op of operations) {
                    try {
                        let result;
                        switch (op.command) {
                            case 'get':
                                result = await this.get(op.args[0]);
                                break;
                            case 'set':
                                result = await this.set(op.args[0], op.args[1]);
                                break;
                            case 'setex':
                                result = await this.setex(op.args[0], op.args[1], op.args[2]);
                                break;
                            case 'del':
                                result = await this.del(op.args[0]);
                                break;
                            case 'sadd':
                                result = await this.sadd(op.args[0], op.args[1]);
                                break;
                            case 'srem':
                                result = await this.srem(op.args[0], op.args[1]);
                                break;
                            case 'smembers':
                                result = await this.smembers(op.args[0]);
                                break;
                            case 'scard':
                                result = await this.scard(op.args[0]);
                                break;
                            case 'expire':
                                result = await this.expire(op.args[0], op.args[1]);
                                break;
                            case 'scan':
                                result = await this.scan(op.args[0], ...op.args.slice(1));
                                break;
                            default:
                                throw new Error(`Unknown command: ${op.command}`);
                        }
                        results.push([null, result]);
                    }
                    catch (error) {
                        results.push([error, null]);
                    }
                }
                return results;
            }
        };
        return pipelineObj;
    }
    // Health check operations
    async ping() {
        this.ensureConnected();
        return 'PONG';
    }
    async isHealthy() {
        try {
            const pong = await this.ping();
            return pong === 'PONG';
        }
        catch {
            return false;
        }
    }
    // Configuration
    getConfig() {
        return { ...this.config };
    }
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    // Connection status
    isConnectedStatus() {
        return this.isConnected;
    }
    getConnectionStats() {
        return {
            isConnected: this.isConnected,
            totalKeys: this.data.size,
            totalSets: this.sets.size,
            expiringKeys: this.expires.size,
            nodes: this.config.nodes.length
        };
    }
    // Private helper methods
    startExpirationCleanup() {
        // Clean up expired keys every 30 seconds
        setInterval(() => {
            this.cleanupExpiredKeys();
        }, 30000);
    }
    cleanupExpiredKeys() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, expiry] of this.expires.entries()) {
            if (expiry <= now) {
                expiredKeys.push(key);
            }
        }
        for (const key of expiredKeys) {
            this.data.delete(key);
            this.sets.delete(key);
            this.expires.delete(key);
        }
        if (expiredKeys.length > 0) {
            console.log(`Cleaned up ${expiredKeys.length} expired keys`);
        }
    }
}
exports.RedisCluster = RedisCluster;
//# sourceMappingURL=cluster-connection.js.map