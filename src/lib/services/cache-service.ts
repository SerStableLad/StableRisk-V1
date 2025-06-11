export class CacheService {
  private cache = new Map<string, { data: any; expiry: number }>()
  
  async get(key: string): Promise<any> {
    const cached = this.cache.get(key)
    if (cached && Date.now() < cached.expiry) {
      return cached.data
    }
    return null
  }
  
  async set(key: string, data: any, ttlMs: number = 86400000): Promise<void> {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    })
  }
  
  async has(key: string): Promise<boolean> {
    const cached = this.cache.get(key)
    return cached ? Date.now() < cached.expiry : false
  }
  
  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }
  
  async clear(): Promise<void> {
    this.cache.clear()
  }
}

// Export singleton instance
export const cacheService = new CacheService() 