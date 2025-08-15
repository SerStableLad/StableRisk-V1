/**
 * Enhanced Service Integration - Task 8 Implementation
 * 
 * Provides high-level orchestration and coordination across multiple services:
 * - ServiceCommunicationClient for inter-service communication
 * - CacheServiceClient for caching operations
 * - MetricsServiceClient for metrics recording
 * - BackgroundJobsClient for job submission
 * 
 * Features:
 * - Singleton pattern for global access
 * - Enhanced cache operations with fallback factory functions
 * - Background job management with retry logic
 * - Bulk cache invalidation with pattern and tag support
 * - Service status monitoring and health aggregation
 * - Comprehensive error handling and metrics recording
 * - Fire-and-forget operations support
 */

import { ServiceCommunicationClient } from '../clients/service-communication-client';
import { CacheServiceClient } from '../clients/cache-service-client';
import { MetricsServiceClient } from '../clients/metrics-service-client';
import { BackgroundJobsClient } from '../clients/background-jobs-client';
import { JobPriority, JobOptions } from '../../../background-jobs-service/src/types';

export interface CacheOperationOptions {
  ttl?: number;
  fallbackFactory?: () => Promise<any>;
}

export interface JobSubmissionOptions {
  priority?: JobPriority;
  delay?: number;
  maxAttempts?: number;
}

export interface CacheInvalidationOptions {
  patterns?: string[];
  tags?: string[];
}

export interface CacheInvalidationResult {
  success: boolean;
  operations: string[];
  errors: Array<{
    operation: string;
    error: string;
  }>;
}

export interface ServiceStatusInfo {
  name: string;
  healthy: boolean;
  responseTime?: number;
  lastCheck: Date;
  circuitBreakerState: string;
  details?: any;
  error?: string;
}

export interface ServicesStatus {
  healthy: ServiceStatusInfo[];
  degraded: ServiceStatusInfo[];
  unhealthy: ServiceStatusInfo[];
}

export class EnhancedServiceIntegration {
  private static instance: EnhancedServiceIntegration;
  private serviceComm: ServiceCommunicationClient;
  private cacheClient: CacheServiceClient;
  private metricsClient: MetricsServiceClient;
  private jobsClient: BackgroundJobsClient;

  private constructor() {
    this.serviceComm = ServiceCommunicationClient.getInstance();
    this.cacheClient = CacheServiceClient.getInstance();
    this.metricsClient = MetricsServiceClient.getInstance();
    this.jobsClient = BackgroundJobsClient.getInstance();
  }

  public static getInstance(): EnhancedServiceIntegration {
    if (!EnhancedServiceIntegration.instance) {
      EnhancedServiceIntegration.instance = new EnhancedServiceIntegration();
    }
    return EnhancedServiceIntegration.instance;
  }

  // Method to reset singleton for testing
  public static resetInstance(): void {
    EnhancedServiceIntegration.instance = undefined as any;
  }

  /**
   * Enhanced cache operations with fallback factory function support
   * Handles cache misses with automatic data generation and caching
   * Records cache hit/miss metrics and provides graceful fallback
   */
  async getCachedData<T>(
    key: string,
    fallbackFactory?: () => Promise<T>,
    ttl?: number
  ): Promise<T | null> {
    try {
      // Attempt to get data from cache
      const cachedData = await this.cacheClient.get(key);
      
      if (cachedData !== null) {
        // Cache hit - record metric and return data
        await this.recordMetric(
          'enhanced_service_integration.cache.hit',
          1,
          { key }
        );
        return cachedData;
      }

      // Cache miss - record metric
      await this.recordMetric(
        'enhanced_service_integration.cache.miss',
        1,
        { key }
      );

      // Use fallback factory if provided
      if (fallbackFactory) {
        try {
          const freshData = await fallbackFactory();
          
          // Cache the fresh data
          if (ttl !== undefined) {
            await this.cacheClient.set(key, freshData, ttl);
          } else {
            await this.cacheClient.set(key, freshData);
          }
          
          return freshData;
        } catch (factoryError) {
          await this.recordMetric(
            'enhanced_service_integration.cache.factory_error',
            1,
            { key, error: (factoryError as Error).message }
          );
          throw factoryError;
        }
      }

      return null;

    } catch (error) {
      // Handle cache service failure
      await this.recordMetric(
        'enhanced_service_integration.cache.error',
        1,
        { key, error: (error as Error).message }
      );

      // If cache service fails but we have a fallback factory, use it
      if (fallbackFactory) {
        try {
          return await fallbackFactory();
        } catch (factoryError) {
          await this.recordMetric(
            'enhanced_service_integration.cache.factory_error',
            1,
            { key, error: (factoryError as Error).message }
          );
          throw factoryError;
        }
      }

      throw error;
    }
  }

  /**
   * Background job submission with retry logic and configurable options
   * Provides retry logic for job submission failures
   * Records job submission metrics (success and failure)
   * Returns job ID or null on failure
   */
  async submitJobWithRetry(
    type: string,
    data: any,
    options: JobSubmissionOptions = {}
  ): Promise<string | null> {
    const {
      priority = JobPriority.MEDIUM,
      delay,
      maxAttempts = 3
    } = options;

    const jobOptions: JobOptions = {
      priority,
      ...(delay && { delay })
    };

    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const jobId = await this.jobsClient.submitJob(type, data, jobOptions);
        
        // Record success metric
        await this.recordMetric(
          'enhanced_service_integration.job.submit_success',
          1,
          { type, attempts: attempt.toString() }
        );
        
        return jobId;
        
      } catch (error) {
        lastError = error as Error;
        
        // If not the last attempt, wait before retrying
        if (attempt < maxAttempts) {
          // Simple linear backoff for job submission retries
          const retryDelay = 1000 * attempt; // 1s, 2s, 3s...
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // Record failure metric after all attempts exhausted
    await this.recordMetric(
      'enhanced_service_integration.job.submit_failure',
      1,
      { type, attempts: maxAttempts.toString(), error: lastError.message }
    );

    return null;
  }

  /**
   * Cache invalidation supporting patterns and tags
   * Bulk cache invalidation across multiple patterns/tags
   * Tracks invalidation success/failure with detailed error reporting
   * Records bulk invalidation metrics
   */
  async invalidateRelatedCache(options: CacheInvalidationOptions): Promise<CacheInvalidationResult> {
    const { patterns = [], tags = [] } = options;
    const operations: string[] = [];
    const errors: Array<{ operation: string; error: string }> = [];

    // Combine patterns and tags into operations list
    const allOperations = [...patterns, ...tags];

    if (allOperations.length === 0) {
      return {
        success: true,
        operations: [],
        errors: []
      };
    }

    let successfulOperations = 0;

    // Process each pattern/tag
    for (const operation of allOperations) {
      operations.push(operation);
      try {
        await this.cacheClient.delete(operation);
        successfulOperations++;
      } catch (error) {
        errors.push({
          operation,
          error: (error as Error).message
        });
      }
    }

    const success = errors.length === 0;

    // Record bulk invalidation metrics
    await this.recordMetric(
      'enhanced_service_integration.cache.bulk_invalidation',
      1,
      {
        operations: allOperations.length.toString(),
        success: successfulOperations.toString(),
        errors: errors.length.toString()
      }
    );

    return {
      success,
      operations,
      errors
    };
  }

  /**
   * Service status monitoring returning organized service health data
   * Categorizes services as healthy, degraded, or unhealthy
   * Includes circuit breaker states in health determination
   * Considers both service health and circuit breaker status
   */
  async getServicesStatus(): Promise<ServicesStatus> {
    const result: ServicesStatus = {
      healthy: [],
      degraded: [],
      unhealthy: []
    };

    try {
      // Get health checks from service communication client
      const healthChecks = await this.serviceComm.checkAllServices();
      const circuitBreakerStates = this.serviceComm.getCircuitBreakerStatus();

      // Get individual service status as fallback
      const individualStatuses = this.getIndividualServiceStatuses();

      // Process health check results
      for (const healthCheck of healthChecks) {
        const serviceInfo = this.buildServiceStatusInfo(
          healthCheck.service,
          healthCheck,
          circuitBreakerStates[healthCheck.service],
          individualStatuses[healthCheck.service]
        );

        this.categorizeService(serviceInfo, result);
      }

      // Handle services not in health check results (fallback to individual status)
      for (const [serviceName, individualStatus] of Object.entries(individualStatuses)) {
        const existsInHealthCheck = healthChecks.some(hc => hc.service === serviceName);
        
        if (!existsInHealthCheck) {
          const serviceInfo = this.buildServiceStatusInfo(
            serviceName,
            {
              service: serviceName,
              healthy: individualStatus.isHealthy,
              responseTime: 0,
              timestamp: individualStatus.lastHealthCheck
            },
            circuitBreakerStates[serviceName] || { state: 'closed', failures: 0, lastFailureTime: null, nextRetryTime: null },
            individualStatus
          );

          this.categorizeService(serviceInfo, result);
        }
      }

    } catch (error) {
      // Fallback to individual service status if service communication fails
      const individualStatuses = this.getIndividualServiceStatuses();
      
      for (const [serviceName, individualStatus] of Object.entries(individualStatuses)) {
        const serviceInfo: ServiceStatusInfo = {
          name: serviceName,
          healthy: individualStatus.isHealthy,
          responseTime: 0,
          lastCheck: individualStatus.lastHealthCheck,
          circuitBreakerState: this.getCircuitBreakerStateForService(serviceName, individualStatus),
          details: individualStatus,
          error: error instanceof Error ? error.message : undefined
        };

        this.categorizeService(serviceInfo, result);
      }
    }

    return result;
  }

  /**
   * Helper method to record metrics with error handling
   */
  private async recordMetric(
    name: string,
    value: number,
    labels: Record<string, string> = {}
  ): Promise<void> {
    try {
      await this.metricsClient.recordMetric(name, value, labels);
    } catch (error) {
      // Silently handle metrics recording failures
      // In production, you might want to log this to a fallback system
      console.debug('Failed to record metric:', error);
    }
  }

  /**
   * Get individual service statuses as fallback
   */
  private getIndividualServiceStatuses(): Record<string, any> {
    return {
      'cache-service': this.cacheClient.getStatus(),
      'metrics-service': this.metricsClient.getStatus(),
      'background-jobs-service': this.jobsClient.getStatus()
    };
  }

  /**
   * Build comprehensive service status information
   */
  private buildServiceStatusInfo(
    serviceName: string,
    healthCheck: any,
    circuitBreakerState: any,
    individualStatus: any
  ): ServiceStatusInfo {
    return {
      name: serviceName,
      healthy: healthCheck.healthy,
      responseTime: healthCheck.responseTime,
      lastCheck: healthCheck.timestamp,
      circuitBreakerState: circuitBreakerState?.state || 'unknown',
      details: {
        healthCheck,
        circuitBreakerState,
        individualStatus
      },
      error: healthCheck.error
    };
  }

  /**
   * Categorize service based on health and circuit breaker status
   */
  private categorizeService(serviceInfo: ServiceStatusInfo, result: ServicesStatus): void {
    const { healthy, circuitBreakerState } = serviceInfo;

    if (!healthy || circuitBreakerState === 'open') {
      result.unhealthy.push(serviceInfo);
    } else if (circuitBreakerState === 'half-open') {
      result.degraded.push(serviceInfo);
    } else {
      result.healthy.push(serviceInfo);
    }
  }

  /**
   * Get circuit breaker state for a service from individual status
   */
  private getCircuitBreakerStateForService(serviceName: string, individualStatus: any): string {
    // Background jobs client has circuit breaker state
    if (serviceName === 'background-jobs-service' && individualStatus.circuitBreakerState) {
      return individualStatus.circuitBreakerState.state;
    }
    
    // For other services, assume closed if healthy
    return individualStatus.isHealthy ? 'closed' : 'unknown';
  }
}