/**
 * Cache Service Client
 * 
 * A robust client for communicating with the cache service.
 * Provides graceful degradation when the service is unavailable.
 */

export interface CacheConfig {
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enableFallback?: boolean;
}

export interface CacheItem {
  key: string;
  value: any;
  ttl?: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface CacheStats {
  totalKeys: number;
  totalMemoryUsage: number;
  hitRate: number;
  missRate: number;
  evictions: number;
}

export class CacheServiceClient {
  private static instance: CacheServiceClient;
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;
  private enableFallback: boolean;
  private isServiceHealthy: boolean = true;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 60000; // 1 minute
  private localCache = new Map<string, { value: any; expiresAt?: number }>();

  private constructor(config: CacheConfig = {}) {
    this.baseUrl = config.baseUrl || process.env.CACHE_SERVICE_URL || 'http://localhost:3002';
    this.timeout = config.timeout || parseInt(process.env.CACHE_SERVICE_TIMEOUT || '2000');
    this.retryAttempts = config.retryAttempts || 2;
    this.retryDelay = config.retryDelay || 500;
    this.enableFallback = config.enableFallback !== false;
  }

  public static getInstance(config?: CacheConfig): CacheServiceClient {
    if (!CacheServiceClient.instance) {
      CacheServiceClient.instance = new CacheServiceClient(config);
    }
    return CacheServiceClient.instance;
  }

  async get(key: string): Promise<any> {
    if (!this.enableFallback || await this.checkServiceHealth()) {
      try {
        const response = await this.makeRequest('GET', `/cache/${encodeURIComponent(key)}`);
        return response.value;
      } catch (error) {
        console.error('Failed to get from remote cache:', error);
        if (!this.enableFallback) {
          throw error;
        }
      }
    }

    // Fallback to local cache
    if (this.enableFallback) {
      const item = this.localCache.get(key);
      if (item && (!item.expiresAt || Date.now() < item.expiresAt)) {
        return item.value;
      }
      if (item && item.expiresAt && Date.now() >= item.expiresAt) {
        this.localCache.delete(key);
      }
    }

    return null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.enableFallback || await this.checkServiceHealth()) {
      try {
        await this.makeRequest('POST', '/cache', { key, value, ttl });
        return;
      } catch (error) {
        console.error('Failed to set in remote cache:', error);
        if (!this.enableFallback) {
          throw error;
        }
      }
    }

    // Fallback to local cache
    if (this.enableFallback) {
      const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
      this.localCache.set(key, { value, expiresAt });
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.enableFallback || await this.checkServiceHealth()) {
      try {
        await this.makeRequest('DELETE', `/cache/${encodeURIComponent(key)}`);
        return;
      } catch (error) {
        console.error('Failed to delete from remote cache:', error);
        if (!this.enableFallback) {
          throw error;
        }
      }
    }

    // Fallback to local cache
    if (this.enableFallback) {
      this.localCache.delete(key);
    }
  }

  async clear(): Promise<void> {
    if (!this.enableFallback || await this.checkServiceHealth()) {
      try {
        await this.makeRequest('DELETE', '/cache');
        return;
      } catch (error) {
        console.error('Failed to clear remote cache:', error);
        if (!this.enableFallback) {
          throw error;
        }
      }
    }

    // Fallback to local cache
    if (this.enableFallback) {
      this.localCache.clear();
    }
  }

  async getStats(): Promise<CacheStats | null> {
    try {
      const response = await this.makeRequest('GET', '/cache/stats');
      return response.stats;
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      if (!this.enableFallback) {
        throw error;
      }
      return {
        totalKeys: this.localCache.size,
        totalMemoryUsage: 0,
        hitRate: 0,
        missRate: 0,
        evictions: 0
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest('GET', '/health/live', undefined, 2000);
      this.isServiceHealthy = response.status === 'alive';
      this.lastHealthCheck = Date.now();
      return this.isServiceHealthy;
    } catch (error) {
      this.isServiceHealthy = false;
      this.lastHealthCheck = Date.now();
      return false;
    }
  }

  private async checkServiceHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastHealthCheck > this.healthCheckInterval) {
      return await this.healthCheck();
    }
    return this.isServiceHealthy;
  }

  private async makeRequest(
    method: string,
    endpoint: string,
    data?: any,
    timeoutOverride?: number
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const timeout = timeoutOverride || this.timeout;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const config: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'StableRisk-CacheClient/1.0.0'
          },
          signal: controller.signal
        };

        if (data) {
          config.body = JSON.stringify(data);
        }

        const response = await fetch(url, config);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        } else {
          return {};
        }

      } catch (error: any) {
        console.warn(`Cache service request attempt ${attempt}/${this.retryAttempts} failed:`, error.message);

        if (attempt === this.retryAttempts) {
          throw error;
        }

        // Exponential backoff for retries
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('All retry attempts failed');
  }

  updateConfig(config: Partial<CacheConfig>): void {
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.timeout) this.timeout = config.timeout;
    if (config.retryAttempts) this.retryAttempts = config.retryAttempts;
    if (config.retryDelay) this.retryDelay = config.retryDelay;
    if (config.enableFallback !== undefined) this.enableFallback = config.enableFallback;
  }

  getConfig(): CacheConfig {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
      enableFallback: this.enableFallback
    };
  }

  getStatus(): {
    isHealthy: boolean;
    lastHealthCheck: Date;
    baseUrl: string;
    localCacheSize: number;
  } {
    return {
      isHealthy: this.isServiceHealthy,
      lastHealthCheck: new Date(this.lastHealthCheck),
      baseUrl: this.baseUrl,
      localCacheSize: this.localCache.size
    };
  }
}