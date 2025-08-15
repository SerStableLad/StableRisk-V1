export interface AccessPattern {
  frequency: number; // Access per hour
  recency: number; // Hours since last access
  volatility: number; // How often the data changes (0-1)
  dataSize: number; // Size of the data in bytes
  importance: number; // Business importance (0-1)
}

export interface AccessStats {
  totalReads: number;
  totalWrites: number;
  lastRead: number;
  lastWrite: number;
  readTimes: number[]; // Timestamps of recent reads (last 100)
  writeTimes: number[]; // Timestamps of recent writes (last 100)
  averageDataSize: number;
}

export interface GlobalStats {
  totalKeys: number;
  averageFrequency: number;
  totalReads: number;
  totalWrites: number;
  hotKeys: string[];
  coldKeys: string[];
  avgAccessTime: number;
}

export class AccessPatternAnalyzer {
  private accessStats: Map<string, AccessStats> = new Map();
  private maxHistorySize = 100; // Keep last 100 access times for each key
  private cleanupInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    // Start periodic cleanup of old access patterns
    this.startCleanup();
    console.log('Access Pattern Analyzer initialized');
  }

  /**
   * Record a read access for a key
   */
  async recordRead(key: string, dataSize: number): Promise<void> {
    const now = Date.now();
    const stats = this.getOrCreateStats(key);
    
    stats.totalReads++;
    stats.lastRead = now;
    stats.readTimes.push(now);
    
    // Keep only recent read times
    if (stats.readTimes.length > this.maxHistorySize) {
      stats.readTimes = stats.readTimes.slice(-this.maxHistorySize);
    }
    
    // Update average data size
    stats.averageDataSize = (stats.averageDataSize + dataSize) / 2;
    
    this.accessStats.set(key, stats);
  }

  /**
   * Record a write access for a key
   */
  async recordWrite(key: string, dataSize: number): Promise<void> {
    const now = Date.now();
    const stats = this.getOrCreateStats(key);
    
    stats.totalWrites++;
    stats.lastWrite = now;
    stats.writeTimes.push(now);
    
    // Keep only recent write times
    if (stats.writeTimes.length > this.maxHistorySize) {
      stats.writeTimes = stats.writeTimes.slice(-this.maxHistorySize);
    }
    
    // Update average data size
    stats.averageDataSize = (stats.averageDataSize + dataSize) / 2;
    
    this.accessStats.set(key, stats);
  }

  /**
   * Get access pattern for a key
   */
  async getPattern(key: string): Promise<AccessPattern | undefined> {
    const stats = this.accessStats.get(key);
    if (!stats) {
      return undefined;
    }

    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    
    // Calculate frequency (accesses per hour)
    const recentReads = this.countRecentAccesses(stats.readTimes, now, hourInMs);
    const recentWrites = this.countRecentAccesses(stats.writeTimes, now, hourInMs);
    const frequency = recentReads + recentWrites;

    // Calculate recency (hours since last access)
    const lastAccess = Math.max(stats.lastRead, stats.lastWrite);
    const recency = (now - lastAccess) / hourInMs;

    // Calculate volatility based on write frequency
    const writeFrequency = this.countRecentAccesses(stats.writeTimes, now, hourInMs * 24); // Last 24 hours
    const volatility = Math.min(1.0, writeFrequency / 10); // Normalize to 0-1

    // Calculate importance based on access frequency and data size
    const totalAccesses = stats.totalReads + stats.totalWrites;
    const importance = Math.min(1.0, (totalAccesses * stats.averageDataSize) / (1024 * 1024)); // Normalize by 1MB

    return {
      frequency,
      recency,
      volatility,
      dataSize: stats.averageDataSize,
      importance
    };
  }

  /**
   * Get global access statistics
   */
  async getGlobalStats(): Promise<GlobalStats> {
    const totalKeys = this.accessStats.size;
    let totalReads = 0;
    let totalWrites = 0;
    let totalFrequency = 0;
    let totalAccessTime = 0;
    
    const keyFrequencies: Array<{ key: string; frequency: number }> = [];

    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;

    for (const [key, stats] of this.accessStats.entries()) {
      totalReads += stats.totalReads;
      totalWrites += stats.totalWrites;
      
      const recentAccesses = this.countRecentAccesses([...stats.readTimes, ...stats.writeTimes], now, hourInMs);
      totalFrequency += recentAccesses;
      
      keyFrequencies.push({ key, frequency: recentAccesses });
      
      // Calculate average access time (simplified)
      const avgAccessTime = stats.readTimes.length > 0 ? 
        (stats.readTimes[stats.readTimes.length - 1] - stats.readTimes[0]) / stats.readTimes.length : 0;
      totalAccessTime += avgAccessTime;
    }

    // Sort by frequency to identify hot and cold keys
    keyFrequencies.sort((a, b) => b.frequency - a.frequency);
    
    const hotKeys = keyFrequencies.slice(0, Math.ceil(totalKeys * 0.1)).map(item => item.key); // Top 10%
    const coldKeys = keyFrequencies.slice(-Math.ceil(totalKeys * 0.1)).map(item => item.key); // Bottom 10%

    return {
      totalKeys,
      averageFrequency: totalKeys > 0 ? totalFrequency / totalKeys : 0,
      totalReads,
      totalWrites,
      hotKeys,
      coldKeys,
      avgAccessTime: totalKeys > 0 ? totalAccessTime / totalKeys : 0
    };
  }

  /**
   * Get access recommendations for optimization
   */
  async getOptimizationRecommendations(): Promise<{
    preloadCandidates: string[];
    evictionCandidates: string[];
    ttlAdjustments: Array<{ key: string; recommendedMultiplier: number; reason: string }>;
  }> {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    
    const preloadCandidates: string[] = [];
    const evictionCandidates: string[] = [];
    const ttlAdjustments: Array<{ key: string; recommendedMultiplier: number; reason: string }> = [];

    for (const [key, stats] of this.accessStats.entries()) {
      const recentAccesses = this.countRecentAccesses([...stats.readTimes, ...stats.writeTimes], now, hourInMs);
      const lastAccess = Math.max(stats.lastRead, stats.lastWrite);
      const hoursSinceLastAccess = (now - lastAccess) / hourInMs;

      // High frequency access patterns suggest preloading
      if (recentAccesses > 20) {
        preloadCandidates.push(key);
        ttlAdjustments.push({
          key,
          recommendedMultiplier: 1.5,
          reason: 'High access frequency detected'
        });
      }
      // Low frequency and old data suggest eviction
      else if (recentAccesses < 2 && hoursSinceLastAccess > 24) {
        evictionCandidates.push(key);
        ttlAdjustments.push({
          key,
          recommendedMultiplier: 0.5,
          reason: 'Low access frequency and stale data'
        });
      }
      // Normal patterns
      else {
        ttlAdjustments.push({
          key,
          recommendedMultiplier: 1.0,
          reason: 'Normal access pattern'
        });
      }
    }

    return {
      preloadCandidates,
      evictionCandidates,
      ttlAdjustments
    };
  }

  /**
   * Clear access patterns for a key
   */
  async clearPattern(key: string): Promise<void> {
    this.accessStats.delete(key);
  }

  /**
   * Clear all access patterns
   */
  async clearAllPatterns(): Promise<void> {
    this.accessStats.clear();
  }

  /**
   * Shutdown the analyzer
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log('Access Pattern Analyzer shut down');
  }

  /**
   * Private helper methods
   */
  
  private getOrCreateStats(key: string): AccessStats {
    let stats = this.accessStats.get(key);
    if (!stats) {
      stats = {
        totalReads: 0,
        totalWrites: 0,
        lastRead: 0,
        lastWrite: 0,
        readTimes: [],
        writeTimes: [],
        averageDataSize: 0
      };
    }
    return stats;
  }

  private countRecentAccesses(accessTimes: number[], now: number, timeWindow: number): number {
    return accessTimes.filter(time => now - time <= timeWindow).length;
  }

  private startCleanup(): void {
    // Clean up old access patterns every hour
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60 * 60 * 1000);
  }

  private performCleanup(): void {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const keysToRemove: string[] = [];

    for (const [key, stats] of this.accessStats.entries()) {
      const lastAccess = Math.max(stats.lastRead, stats.lastWrite);
      
      // Remove patterns for keys not accessed in 7 days
      if (now - lastAccess > 7 * dayInMs) {
        keysToRemove.push(key);
      } else {
        // Clean up old access times within the pattern
        stats.readTimes = stats.readTimes.filter(time => now - time <= dayInMs);
        stats.writeTimes = stats.writeTimes.filter(time => now - time <= dayInMs);
      }
    }

    // Remove old patterns
    keysToRemove.forEach(key => this.accessStats.delete(key));

    if (keysToRemove.length > 0) {
      console.log(`Cleaned up ${keysToRemove.length} old access patterns`);
    }
  }
}