/**
 * Service Health Monitor - Task 8 Implementation
 * 
 * Provides comprehensive system health monitoring with:
 * - Singleton pattern for global access
 * - Integration with ServiceRegistry, ServiceCommunicationClient, and MetricsServiceClient
 * - Automatic health checks every 60 seconds
 * - System health reporting and critical alerting
 * - Circuit breaker monitoring and failure tracking
 * - Graceful error handling and recovery
 */

import { ServiceRegistry } from '../services/service-registry';
import { ServiceCommunicationClient, HealthCheckResult, CircuitBreakerState } from '../clients/service-communication-client';
import { MetricsServiceClient } from '../clients/metrics-service-client';

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  services: {
    healthy: string[];
    unhealthy: string[];
    total: number;
  };
  healthScore: number; // 0-1 ratio of healthy/total services
  circuitBreakers: Record<string, CircuitBreakerState>;
  timestamp: Date;
}

interface HealthResult {
  healthy: string[];
  unhealthy: string[];
  circuitBreakerStatus: Record<string, CircuitBreakerState>;
  lastCheck: Date;
}

export class ServiceHealthMonitor {
  private static instance: ServiceHealthMonitor;
  private static isConstructing = false;
  private serviceRegistry: ServiceRegistry | null = null;
  private serviceClient: ServiceCommunicationClient | null = null;
  private metricsClient: MetricsServiceClient | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastHealthResult: HealthResult | null = null;
  private readonly MONITORING_INTERVAL = 60000; // 60 seconds

  private constructor() {
    // Prevent direct instantiation
    if (!ServiceHealthMonitor.isConstructing) {
      throw new Error('Use ServiceHealthMonitor.getInstance() instead of new ServiceHealthMonitor()');
    }
    this.initializeDependencies();
  }

  public static getInstance(): ServiceHealthMonitor {
    if (!ServiceHealthMonitor.instance) {
      ServiceHealthMonitor.isConstructing = true;
      ServiceHealthMonitor.instance = new ServiceHealthMonitor();
      ServiceHealthMonitor.isConstructing = false;
    }
    return ServiceHealthMonitor.instance;
  }

  private initializeDependencies(): void {
    try {
      this.serviceRegistry = ServiceRegistry.getInstance();
      this.serviceClient = ServiceCommunicationClient.getInstance();
      this.metricsClient = MetricsServiceClient.getInstance();
    } catch (error) {
      console.error('Failed to initialize ServiceHealthMonitor dependencies:', error);
      // Continue with null dependencies - methods will handle gracefully
    }
  }

  /**
   * Start automatic health monitoring every 60 seconds
   */
  startMonitoring(): void {
    // Perform initial health check even if already monitoring
    this.performHealthCheck().catch(error => {
      console.error('Initial health check failed:', error);
    });

    // Prevent multiple intervals
    if (this.monitoringInterval) {
      return;
    }

    // Set up recurring health checks
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('Scheduled health check failed:', error);
      });
    }, this.MONITORING_INTERVAL);
  }

  /**
   * Stop automatic health monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Get current system health status
   */
  getSystemHealth(): SystemHealthStatus {
    if (!this.lastHealthResult) {
      // No health data available yet - default to healthy
      return {
        status: 'healthy',
        services: {
          healthy: [],
          unhealthy: [],
          total: 0,
        },
        healthScore: 1.0,
        circuitBreakers: {},
        timestamp: new Date(),
      };
    }

    const healthyCount = this.lastHealthResult.healthy.length;
    const unhealthyCount = this.lastHealthResult.unhealthy.length;
    const totalServices = healthyCount + unhealthyCount;
    const healthScore = totalServices > 0 ? healthyCount / totalServices : 1.0;

    // Determine overall status based on health score
    let status: 'healthy' | 'degraded' | 'critical';
    if (healthScore === 0) {
      status = 'critical';
    } else if (healthScore < 0.5) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      services: {
        healthy: [...this.lastHealthResult.healthy],
        unhealthy: [...this.lastHealthResult.unhealthy],
        total: totalServices,
      },
      healthScore,
      circuitBreakers: { ...this.lastHealthResult.circuitBreakerStatus },
      timestamp: this.lastHealthResult.lastCheck,
    };
  }

  /**
   * Perform comprehensive health check of all services
   */
  private async performHealthCheck(): Promise<void> {
    try {
      if (!this.serviceClient) {
        throw new Error('ServiceCommunicationClient not available');
      }

      // Check health of all services
      const healthResults = await this.serviceClient.checkAllServices();
      if (!Array.isArray(healthResults)) {
        throw new Error('Invalid health check results');
      }

      // Separate healthy and unhealthy services
      const healthy: string[] = [];
      const unhealthy: string[] = [];

      for (const result of healthResults) {
        if (result.healthy) {
          healthy.push(result.service);
        } else {
          unhealthy.push(result.service);
          
          // Log warning for unhealthy services
          const errorMsg = result.error || 'Unknown error';
          console.warn(`Service ${result.service} is unhealthy:`, errorMsg);
        }
      }

      // Get circuit breaker status
      const circuitBreakerStatus = this.serviceClient.getCircuitBreakerStatus() || {};

      // Update last health result
      this.lastHealthResult = {
        healthy,
        unhealthy,
        circuitBreakerStatus,
        lastCheck: new Date(),
      };

      // Record metrics
      await this.recordHealthMetrics(healthy, unhealthy, circuitBreakerStatus);

      // Send critical alert if all services are unhealthy
      if (healthy.length === 0 && unhealthy.length > 0) {
        await this.sendCriticalAlert('All services are unhealthy', {
          unhealthyServices: unhealthy,
          timestamp: new Date(),
        });
      }

    } catch (error) {
      console.error('Failed to perform health check:', error);
    }
  }

  /**
   * Record health metrics for monitoring
   */
  private async recordHealthMetrics(
    healthy: string[],
    unhealthy: string[],
    circuitBreakerStatus: Record<string, CircuitBreakerState>
  ): Promise<void> {
    try {
      if (!this.metricsClient) {
        return;
      }

      const totalServices = healthy.length + unhealthy.length;
      const healthScore = totalServices > 0 ? healthy.length / totalServices : 1.0;

      // Record overall system health score
      await this.metricsClient.recordMetric(
        'system.health.overall_score',
        healthScore,
        {}
      );

      // Record individual service health metrics
      for (const serviceName of healthy) {
        await this.metricsClient.recordMetric(
          'system.health.service_status',
          1, // Healthy = 1
          { service: serviceName }
        );
      }

      for (const serviceName of unhealthy) {
        await this.metricsClient.recordMetric(
          'system.health.service_status',
          0, // Unhealthy = 0
          { service: serviceName }
        );
      }

      // Record circuit breaker metrics
      for (const [serviceName, cbState] of Object.entries(circuitBreakerStatus)) {
        await this.metricsClient.recordMetric(
          'system.circuit_breaker.failures',
          cbState.failures,
          {
            service: serviceName,
            state: cbState.state,
          }
        );
      }

    } catch (error) {
      console.error('Failed to record health metrics:', error);
    }
  }

  /**
   * Send critical alert when system is in critical state
   */
  private async sendCriticalAlert(message: string, data?: any): Promise<void> {
    try {
      // Log critical alert
      if (data) {
        console.error(`CRITICAL ALERT: ${message}`, data);
      } else {
        console.error(`CRITICAL ALERT: ${message}`);
      }

      // Record critical alert metric
      if (this.metricsClient) {
        const labels: Record<string, string> = { message };
        
        if (data && data.unhealthyServices) {
          labels.unhealthy_services = JSON.stringify(data.unhealthyServices);
        }

        await this.metricsClient.recordMetric(
          'system.health.critical_alert',
          1,
          labels
        );
      }

    } catch (error) {
      console.error('Failed to record critical alert metric:', error);
    }
  }
}