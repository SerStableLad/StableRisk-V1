/**
 * Integration Test for Service Health Monitor
 * 
 * Tests the Service Health Monitor's integration with the actual project architecture
 * and ensures it works correctly with the existing services.
 */

import { ServiceHealthMonitor } from '../service-health-monitor';

describe('ServiceHealthMonitor Integration', () => {
  let monitor: ServiceHealthMonitor;

  beforeEach(() => {
    // Clear singleton
    (ServiceHealthMonitor as any).instance = null;
    monitor = ServiceHealthMonitor.getInstance();
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  test('can be instantiated using getInstance', () => {
    expect(monitor).toBeInstanceOf(ServiceHealthMonitor);
  });

  test('singleton pattern works correctly', () => {
    const monitor2 = ServiceHealthMonitor.getInstance();
    expect(monitor).toBe(monitor2);
  });

  test('provides getSystemHealth method', () => {
    expect(typeof monitor.getSystemHealth).toBe('function');
    
    const health = monitor.getSystemHealth();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('services');
    expect(health).toHaveProperty('healthScore');
    expect(health).toHaveProperty('circuitBreakers');
    expect(health).toHaveProperty('timestamp');
    
    expect(['healthy', 'degraded', 'critical']).toContain(health.status);
    expect(typeof health.healthScore).toBe('number');
    expect(health.healthScore).toBeGreaterThanOrEqual(0);
    expect(health.healthScore).toBeLessThanOrEqual(1);
  });

  test('provides monitoring lifecycle methods', () => {
    expect(typeof monitor.startMonitoring).toBe('function');
    expect(typeof monitor.stopMonitoring).toBe('function');
    
    // Should not throw when called
    expect(() => monitor.startMonitoring()).not.toThrow();
    expect(() => monitor.stopMonitoring()).not.toThrow();
  });

  test('exports expected interfaces and types', () => {
    // The SystemHealthStatus interface should be available for import
    const health = monitor.getSystemHealth();
    
    // Verify the structure matches our expected interface
    expect(health.services).toHaveProperty('healthy');
    expect(health.services).toHaveProperty('unhealthy');
    expect(health.services).toHaveProperty('total');
    
    expect(Array.isArray(health.services.healthy)).toBe(true);
    expect(Array.isArray(health.services.unhealthy)).toBe(true);
    expect(typeof health.services.total).toBe('number');
  });

  test('integrates with project TypeScript configuration', () => {
    // This test ensures our interfaces are compatible
    const health = monitor.getSystemHealth();
    
    // Type assertions should pass without compilation errors
    const status: 'healthy' | 'degraded' | 'critical' = health.status;
    const score: number = health.healthScore;
    const timestamp: Date = health.timestamp;
    
    expect(status).toBeDefined();
    expect(score).toBeDefined();
    expect(timestamp).toBeDefined();
  });
});