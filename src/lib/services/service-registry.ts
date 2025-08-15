/**
 * Service Registry - Task 8 Implementation
 * 
 * Provides centralized service discovery and health monitoring for:
 * - Metrics Service (port 3001)
 * - Cache Service (port 3002) 
 * - Background Jobs Service (port 3003)
 * 
 * Features:
 * - Singleton pattern for global access
 * - Automatic health checks every 30 seconds
 * - Service initialization from environment variables or defaults
 * - Health status management (healthy/degraded/unhealthy)
 * - Graceful shutdown and cleanup
 */

export interface ServiceInfo {
  name: string;
  url: string;
  health: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  lastCheck: Date;
  metadata: {
    timeout: number;
    retries: number;
    circuitBreakerThreshold: number;
    priority: number;
  };
}

export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services = new Map<string, ServiceInfo>();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.initializeServices();
    this.startHealthChecking();
  }

  public static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  private initializeServices(): void {
    const services: ServiceInfo[] = [
      {
        name: 'metrics-service',
        url: (process.env.METRICS_SERVICE_URL && process.env.METRICS_SERVICE_URL.trim()) || 'http://localhost:3001',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: new Date(),
        metadata: {
          timeout: 5000,
          retries: 3,
          circuitBreakerThreshold: 5,
          priority: 1
        }
      },
      {
        name: 'cache-service',
        url: (process.env.CACHE_SERVICE_URL && process.env.CACHE_SERVICE_URL.trim()) || 'http://localhost:3002',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: new Date(),
        metadata: {
          timeout: 2000,
          retries: 2,
          circuitBreakerThreshold: 3,
          priority: 2 // High priority
        }
      },
      {
        name: 'background-jobs-service',
        url: (process.env.BACKGROUND_JOBS_URL && process.env.BACKGROUND_JOBS_URL.trim()) || 'http://localhost:3003',
        health: 'healthy',
        version: '1.0.0',
        lastCheck: new Date(),
        metadata: {
          timeout: 10000,
          retries: 3,
          circuitBreakerThreshold: 5,
          priority: 3
        }
      }
    ];

    services.forEach(service => {
      this.services.set(service.name, service);
    });
  }

  getService(name: string): ServiceInfo | null {
    if (!name) {
      return null;
    }
    return this.services.get(name) || null;
  }

  getAllServices(): ServiceInfo[] {
    return Array.from(this.services.values());
  }

  updateServiceHealth(name: string, health: ServiceInfo['health']): void {
    const service = this.services.get(name);
    if (service) {
      service.health = health;
      service.lastCheck = new Date();
    }
  }

  isServiceHealthy(name: string): boolean {
    const service = this.services.get(name);
    return service ? service.health === 'healthy' : false;
  }

  private startHealthChecking(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000);
  }

  private async performHealthChecks(): Promise<void> {
    const healthChecks = Array.from(this.services.entries()).map(
      async ([name, service]) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), service.metadata.timeout);

          const response = await fetch(`${service.url}/health`, {
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            this.updateServiceHealth(name, 'healthy');
          } else {
            this.updateServiceHealth(name, 'degraded');
          }
        } catch (error) {
          console.error(`Health check failed for ${name}:`, (error as Error).message);
          this.updateServiceHealth(name, 'unhealthy');
        }
      }
    );

    await Promise.allSettled(healthChecks);
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}