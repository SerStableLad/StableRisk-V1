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

export class RedisCluster {
  private static instance: RedisCluster;
  private isConnected: boolean = false;
  private config: RedisClusterConfig;
  private connectionPool: Map<string, any> = new Map();
  private data: Map<string, string> = new Map();
  private expires: Map<string, number> = new Map();
  private sets: Map<string, Set<string>> = new Map();

  private constructor(config?: Partial<RedisClusterConfig>) {
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

  public static getInstance(config?: Partial<RedisClusterConfig>): RedisCluster {
    if (!RedisCluster.instance) {
      RedisCluster.instance = new RedisCluster(config);
    }
    return RedisCluster.instance;
  }

  async connect(): Promise<void> {
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
    } catch (error) {
      console.error('Redis cluster connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.isConnected = false;
      this.data.clear();
      this.expires.clear();
      this.sets.clear();
      this.connectionPool.clear();
      
      console.log('Redis cluster disconnected');
    } catch (error) {
      console.error('Error disconnecting from Redis cluster:', error);
      throw error;
    }
  }

  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('Redis cluster is not connected');
    }
  }

  async get(key: string): Promise<string | null> {
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

  async set(key: string, value: string): Promise<string> {
    this.ensureConnected();
    this.data.set(key, value);
    return 'OK';
  }

  async setex(key: string, ttl: number, value: string): Promise<string> {
    this.ensureConnected();
    this.data.set(key, value);
    this.expires.set(key, Date.now() + (ttl * 1000));
    return 'OK';
  }

  async del(key: string): Promise<number> {
    this.ensureConnected();
    const existed = this.data.has(key);
    this.data.delete(key);
    this.expires.delete(key);
    this.sets.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
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

  async expire(key: string, ttl: number): Promise<number> {
    this.ensureConnected();
    
    if (this.data.has(key) || this.sets.has(key)) {
      this.expires.set(key, Date.now() + (ttl * 1000));
      return 1;
    }
    return 0;
  }

  async ttl(key: string): Promise<number> {
    this.ensureConnected();
    
    const expiry = this.expires.get(key);
    if (!expiry) {
      return this.data.has(key) || this.sets.has(key) ? -1 : -2;
    }
    
    const remaining = Math.ceil((expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  // Set operations
  async sadd(key: string, member: string): Promise<number> {
    this.ensureConnected();
    
    let set = this.sets.get(key);
    if (!set) {
      set = new Set<string>();
      this.sets.set(key, set);
    }
    
    const sizeBefore = set.size;
    set.add(member);
    return set.size - sizeBefore;
  }

  async srem(key: string, member: string): Promise<number> {
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

  async smembers(key: string): Promise<string[]> {
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

  async scard(key: string): Promise<number> {
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

  // Scanning operations
  async scan(
    cursor: number, 
    matchPattern?: string, 
    count?: number
  ): Promise<[string, string[]]>;
  async scan(
    cursor: number,
    type: 'MATCH',
    pattern: string,
    countType: 'COUNT',
    count: number
  ): Promise<[string, string[]]>;
  async scan(
    cursor: number,
    ...args: any[]
  ): Promise<[string, string[]]> {
    this.ensureConnected();
    
    // Parse arguments
    let pattern: string | undefined;
    let count = 1000;
    
    for (let i = 0; i < args.length; i += 2) {
      const arg = args[i];
      if (arg === 'MATCH' && args[i + 1]) {
        pattern = args[i + 1];
      } else if (arg === 'COUNT' && args[i + 1]) {
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
  async info(section?: string): Promise<string> {
    this.ensureConnected();
    
    const memoryInfo = `used_memory:${this.data.size * 100}\nused_memory_human:${(this.data.size * 100 / 1024).toFixed(2)}K\nmaxmemory:0`;
    
    if (section === 'memory') {
      return memoryInfo;
    }
    
    return `${memoryInfo}\nconnected_clients:1\ntotal_commands_processed:1000`;
  }

  async dbsize(): Promise<number> {
    this.ensureConnected();
    return this.data.size + this.sets.size;
  }

  // Pipeline operations
  pipeline(): Pipeline {
    this.ensureConnected();
    
    const operations: PipelineOperation[] = [];
    
    const pipelineObj: Pipeline = {
      get: (key: string) => {
        operations.push({
          command: 'get',
          args: [key],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      set: (key: string, value: string) => {
        operations.push({
          command: 'set',
          args: [key, value],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      setex: (key: string, ttl: number, value: string) => {
        operations.push({
          command: 'setex',
          args: [key, ttl, value],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      del: (key: string) => {
        operations.push({
          command: 'del',
          args: [key],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      sadd: (key: string, member: string) => {
        operations.push({
          command: 'sadd',
          args: [key, member],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      srem: (key: string, member: string) => {
        operations.push({
          command: 'srem',
          args: [key, member],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      smembers: (key: string) => {
        operations.push({
          command: 'smembers',
          args: [key],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      scard: (key: string) => {
        operations.push({
          command: 'scard',
          args: [key],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      expire: (key: string, ttl: number) => {
        operations.push({
          command: 'expire',
          args: [key, ttl],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      scan: (cursor: number, ...args: any[]) => {
        operations.push({
          command: 'scan',
          args: [cursor, ...args],
          resolve: () => {},
          reject: () => {}
        });
        return pipelineObj;
      },
      
      exec: async () => {
        const results: Array<[Error | null, any]> = [];
        
        for (const op of operations) {
          try {
            let result: any;
            
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
          } catch (error) {
            results.push([error as Error, null]);
          }
        }
        
        return results;
      }
    };
    
    return pipelineObj;
  }

  // Health check operations
  async ping(): Promise<string> {
    this.ensureConnected();
    return 'PONG';
  }

  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  // Configuration
  getConfig(): RedisClusterConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RedisClusterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Connection status
  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  getConnectionStats(): {
    isConnected: boolean;
    totalKeys: number;
    totalSets: number;
    expiringKeys: number;
    nodes: number;
  } {
    return {
      isConnected: this.isConnected,
      totalKeys: this.data.size,
      totalSets: this.sets.size,
      expiringKeys: this.expires.size,
      nodes: this.config.nodes.length
    };
  }

  // Private helper methods
  private startExpirationCleanup(): void {
    // Clean up expired keys every 30 seconds
    setInterval(() => {
      this.cleanupExpiredKeys();
    }, 30000);
  }

  private cleanupExpiredKeys(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
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