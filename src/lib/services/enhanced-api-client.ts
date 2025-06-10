import { ApiClient, createApiClient } from './api-client';
import { cacheService } from './cache-service';
import { ApiError } from '@/lib/types';

/**
 * Enhanced API client with caching, rate limiting, and specialized endpoints
 * for common services used across Tier 3 analysis
 * 
 * How to use this service:
 * 
 * 1. Create a specialized client for common blockchain explorers:
 * ```typescript
 * // GitHub API (used in audit-discovery service)
 * const githubClient = EnhancedApiClient.createGitHubClient(process.env.GITHUB_API_KEY);
 * const repos = await githubClient.cachedGet('/search/repositories', { 
 *   q: 'org:tether',
 *   sort: 'stars',
 *   order: 'desc'
 * });
 * 
 * // Etherscan API (for blockchain analysis)
 * const etherscanClient = EnhancedApiClient.createEtherscanClient(process.env.ETHERSCAN_API_KEY);
 * const contractInfo = await etherscanClient.cachedGet('', { 
 *   module: 'contract',
 *   action: 'getabi',
 *   address: '0xdac17f958d2ee523a2206206994597c13d831ec7' // USDT
 * });
 * ```
 * 
 * 2. Create a custom client for any API:
 * ```typescript
 * const coinGeckoClient = new EnhancedApiClient(
 *   'https://api.coingecko.com/api/v3',
 *   process.env.COINGECKO_API_KEY,
 *   'x-cg-api-key',
 *   'coingecko',
 *   3600 // Cache for 1 hour
 * );
 * 
 * const coinData = await coinGeckoClient.cachedGet('/coins/tether', { 
 *   localization: 'false', 
 *   market_data: 'true' 
 * });
 * ```
 */
export class EnhancedApiClient {
  private apiClient: ApiClient;
  private cacheKeyPrefix: string;
  private cacheTTL: number;
  private service: string;
  
  constructor(
    baseUrl: string,
    apiKey?: string,
    keyHeaderName: string = 'X-API-Key',
    service: string = 'enhanced-api',
    cacheTTL: number = 86400 // 24 hours default
  ) {
    this.apiClient = createApiClient(baseUrl, apiKey, keyHeaderName);
    this.service = service;
    this.cacheKeyPrefix = `${service}:`;
    this.cacheTTL = cacheTTL;
  }
  
  /**
   * Make a GET request with caching
   */
  async cachedGet<T>(
    endpoint: string, 
    params?: Record<string, string | number>,
    cacheKey?: string,
    ttl?: number
  ): Promise<T> {
    const actualCacheKey = cacheKey || `${this.cacheKeyPrefix}${endpoint}:${JSON.stringify(params || {})}`;
    const actualTTL = ttl || this.cacheTTL;
    
    // Try to get from cache first
    const cached = await cacheService.get<T>(actualCacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      const result = await this.apiClient.get<T>(endpoint, { params });
      
      // Cache the successful result
      await cacheService.set(actualCacheKey, result, actualTTL);
      
      return result;
    } catch (error) {
      // Convert to ApiError if it's not already
      const apiError = error as ApiError;
      
      throw apiError;
    }
  }
  
  /**
   * Make a POST request with caching when appropriate
   * (Note: POST requests are only cached when explicitly enabled, as they can modify state)
   */
  async cachedPost<T>(
    endpoint: string,
    body: unknown,
    enableCache: boolean = false,
    cacheKey?: string,
    ttl?: number
  ): Promise<T> {
    // Only use cache for explicitly enabled endpoints
    if (enableCache) {
      const actualCacheKey = cacheKey || `${this.cacheKeyPrefix}${endpoint}:${JSON.stringify(body)}`;
      const actualTTL = ttl || this.cacheTTL;
      
      // Try to get from cache first
      const cached = await cacheService.get<T>(actualCacheKey);
      if (cached) {
        return cached;
      }
      
      try {
        const result = await this.apiClient.post<T>(endpoint, body);
        
        // Cache the successful result
        await cacheService.set(actualCacheKey, result, actualTTL);
        
        return result;
      } catch (error) {
        const apiError = error as ApiError;
        throw apiError;
      }
    } else {
      // No caching for normal POST requests
      return this.apiClient.post<T>(endpoint, body);
    }
  }
  
  /**
   * GitHub API specialized client (commonly used in Tier 3 services)
   */
  static createGitHubClient(apiKey?: string): EnhancedApiClient {
    return new EnhancedApiClient(
      'https://api.github.com',
      apiKey,
      'Authorization',
      'github',
      86400 * 7 // Cache GitHub results for 7 days
    );
  }
  
  /**
   * Etherscan API specialized client
   */
  static createEtherscanClient(apiKey?: string): EnhancedApiClient {
    return new EnhancedApiClient(
      'https://api.etherscan.io/api',
      apiKey,
      'apikey',
      'etherscan',
      86400 // Cache for 24 hours
    );
  }
  
  /**
   * BSCScan API specialized client
   */
  static createBscScanClient(apiKey?: string): EnhancedApiClient {
    return new EnhancedApiClient(
      'https://api.bscscan.com/api',
      apiKey,
      'apikey',
      'bscscan',
      86400 // Cache for 24 hours
    );
  }
  
  /**
   * PolygonScan API specialized client
   */
  static createPolygonScanClient(apiKey?: string): EnhancedApiClient {
    return new EnhancedApiClient(
      'https://api.polygonscan.com/api',
      apiKey,
      'apikey',
      'polygonscan',
      86400 // Cache for 24 hours
    );
  }
} 