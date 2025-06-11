export class MetricsService {
  async recordApiCall(service: string, endpoint: string, duration: number): Promise<void> {
    // In development, just log to console
    console.log(`API Call: ${service}/${endpoint} took ${duration}ms`)
  }
  
  async recordApiError(service: string, endpoint: string, error: any): Promise<void> {
    // In development, just log to console
    console.error(`API Error: ${service}/${endpoint}`, error)
  }
  
  async recordCacheHit(key: string): Promise<void> {
    console.log(`Cache Hit: ${key}`)
  }
  
  async recordCacheMiss(key: string): Promise<void> {
    console.log(`Cache Miss: ${key}`)
  }
}

// Export singleton instance
export const metricsService = new MetricsService() 