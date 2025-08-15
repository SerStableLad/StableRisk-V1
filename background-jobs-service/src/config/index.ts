/**
 * Configuration Management and Validation
 * 
 * Features:
 * - Environment variable validation with Joi
 * - Default values and type conversion
 * - Development/production environment handling
 * - Configuration hot-reloading support
 */

import Joi from 'joi';
import { ServiceConfig } from '../types';

// Configuration schema validation
const configSchema = Joi.object({
  // Service configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3003),
  
  // Redis configuration
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().min(1).max(65535).default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),
  REDIS_KEY_PREFIX: Joi.string().default('stablerisk:jobs:'),
  REDIS_RETRY_DELAY: Joi.number().integer().min(100).max(30000).default(5000),
  REDIS_MAX_RETRIES: Joi.number().integer().min(1).max(10).default(3),
  REDIS_CONNECT_TIMEOUT: Joi.number().integer().min(1000).max(60000).default(10000),
  REDIS_COMMAND_TIMEOUT: Joi.number().integer().min(1000).max(60000).default(5000),
  REDIS_KEEP_ALIVE: Joi.number().integer().min(1000).max(300000).default(30000),
  
  // Database configuration
  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().integer().min(1).max(65535).default(5432),
  DB_NAME: Joi.string().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_POOL_SIZE: Joi.number().integer().min(1).max(50).default(10),
  DB_CONNECTION_TIMEOUT: Joi.number().integer().min(1000).max(60000).default(30000),
  DB_QUERY_TIMEOUT: Joi.number().integer().min(1000).max(300000).default(60000),
  
  // Job processor configuration
  MAX_WORKERS: Joi.number().integer().min(1).max(50).default(5),
  POLLING_INTERVAL: Joi.number().integer().min(100).max(60000).default(1000),
  STALE_JOB_TIMEOUT: Joi.number().integer().min(60000).max(3600000).default(1800000), // 30 minutes
  MAX_CONCURRENT_JOBS: Joi.number().integer().min(1).max(100).default(20),
  
  // Logging configuration
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'text').default('json'),
  LOG_ENABLE_CONSOLE: Joi.boolean().default(true),
  LOG_ENABLE_FILE: Joi.boolean().default(false),
  LOG_FILENAME: Joi.string().optional(),
  
  // Monitoring configuration
  ENABLE_METRICS: Joi.boolean().default(true),
  METRICS_PORT: Joi.number().integer().min(1).max(65535).default(9090),
  HEALTH_CHECK_INTERVAL: Joi.number().integer().min(5000).max(300000).default(30000),
  
  // External service URLs (for job handlers)
  MAIN_APP_URL: Joi.string().uri().default('http://localhost:3000'),
  METRICS_SERVICE_URL: Joi.string().uri().default('http://localhost:3002'),
  
  // Job-specific configuration
  FIRECRAWL_API_KEY: Joi.string().optional(),
  COINGECKO_API_KEY: Joi.string().optional(),
  DEFAULT_JOB_TIMEOUT: Joi.number().integer().min(10000).max(3600000).default(300000), // 5 minutes
  MAX_JOB_RETRIES: Joi.number().integer().min(1).max(10).default(3),
  
  // Cleanup configuration
  CLEANUP_INTERVAL: Joi.number().integer().min(60000).max(86400000).default(3600000), // 1 hour
  JOB_RESULT_MAX_AGE: Joi.number().integer().min(86400000).max(2592000000).default(2592000000), // 30 days
  JOB_METRICS_MAX_AGE: Joi.number().integer().min(604800000).max(7776000000).default(7776000000), // 90 days
}).unknown();

class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: ServiceConfig;
  private env: string;

  private constructor() {
    this.loadAndValidateConfig();
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private loadAndValidateConfig(): void {
    // Load environment variables
    require('dotenv').config();

    // Validate configuration
    const { error, value } = configSchema.validate(process.env, {
      allowUnknown: true,
      stripUnknown: false
    });

    if (error) {
      throw new Error(`Configuration validation failed: ${error.details.map(d => d.message).join(', ')}`);
    }

    this.env = value.NODE_ENV;

    // Build typed configuration object
    this.config = {
      port: value.PORT,
      redis: {
        host: value.REDIS_HOST,
        port: value.REDIS_PORT,
        password: value.REDIS_PASSWORD || undefined,
        db: value.REDIS_DB,
        keyPrefix: value.REDIS_KEY_PREFIX,
        retryDelayOnFailover: value.REDIS_RETRY_DELAY,
        maxRetriesPerRequest: value.REDIS_MAX_RETRIES,
        lazyConnect: true,
        keepAlive: value.REDIS_KEEP_ALIVE,
        connectTimeout: value.REDIS_CONNECT_TIMEOUT,
        commandTimeout: value.REDIS_COMMAND_TIMEOUT
      },
      database: {
        host: value.DB_HOST,
        port: value.DB_PORT,
        database: value.DB_NAME,
        username: value.DB_USERNAME,
        password: value.DB_PASSWORD,
        ssl: value.DB_SSL,
        poolSize: value.DB_POOL_SIZE,
        connectionTimeout: value.DB_CONNECTION_TIMEOUT,
        queryTimeout: value.DB_QUERY_TIMEOUT
      },
      processor: {
        maxWorkers: value.MAX_WORKERS,
        pollingInterval: value.POLLING_INTERVAL,
        staleJobTimeout: value.STALE_JOB_TIMEOUT,
        enableMetrics: value.ENABLE_METRICS,
        concurrency: {
          maxConcurrentJobs: value.MAX_CONCURRENT_JOBS
        }
      },
      logging: {
        level: value.LOG_LEVEL,
        format: value.LOG_FORMAT,
        enableConsole: value.LOG_ENABLE_CONSOLE,
        enableFile: value.LOG_ENABLE_FILE,
        filename: value.LOG_FILENAME
      },
      monitoring: {
        enableMetrics: value.ENABLE_METRICS,
        metricsPort: value.METRICS_PORT,
        healthCheckInterval: value.HEALTH_CHECK_INTERVAL
      }
    };

    console.log(`[Config] Configuration loaded for environment: ${this.env}`);
    
    if (this.env === 'development') {
      console.log('[Config] Development mode - detailed logging enabled');
    }
  }

  public getConfig(): ServiceConfig {
    return this.config;
  }

  public getEnvironment(): string {
    return this.env;
  }

  public isDevelopment(): boolean {
    return this.env === 'development';
  }

  public isProduction(): boolean {
    return this.env === 'production';
  }

  public isTest(): boolean {
    return this.env === 'test';
  }

  // Configuration getters for specific sections
  public getRedisConfig() {
    return this.config.redis;
  }

  public getDatabaseConfig() {
    return this.config.database;
  }

  public getProcessorConfig() {
    return this.config.processor;
  }

  public getLoggingConfig() {
    return this.config.logging;
  }

  public getMonitoringConfig() {
    return this.config.monitoring;
  }

  // Environment-specific values
  public get<T>(key: string, defaultValue?: T): T {
    const value = process.env[key];
    
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Environment variable ${key} is required but not set`);
    }

    // Type conversion based on default value type
    if (typeof defaultValue === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
      }
      return numValue as unknown as T;
    }

    if (typeof defaultValue === 'boolean') {
      return (value.toLowerCase() === 'true') as unknown as T;
    }

    return value as unknown as T;
  }

  // Dynamic configuration updates (for development)
  public updateConfig(updates: Partial<ServiceConfig>): void {
    if (!this.isDevelopment()) {
      throw new Error('Configuration updates are only allowed in development mode');
    }

    this.config = { ...this.config, ...updates };
    console.log('[Config] Configuration updated:', Object.keys(updates));
  }

  // Validation helpers
  public validateExternalServices(): Promise<boolean> {
    return new Promise((resolve) => {
      // In a real implementation, this would test connections to external services
      // For now, we'll just validate that required API keys are present if needed
      
      const warnings: string[] = [];
      
      if (!process.env.FIRECRAWL_API_KEY) {
        warnings.push('FIRECRAWL_API_KEY not set - Firecrawl jobs will fail');
      }
      
      if (!process.env.COINGECKO_API_KEY) {
        warnings.push('COINGECKO_API_KEY not set - CoinGecko jobs may be rate limited');
      }

      if (warnings.length > 0) {
        console.warn('[Config] External service warnings:');
        warnings.forEach(warning => console.warn(`[Config] - ${warning}`));
      }

      resolve(true);
    });
  }

  // Configuration export for debugging
  public exportConfig(includeSecrets: boolean = false): Record<string, any> {
    const exported = JSON.parse(JSON.stringify(this.config));
    
    if (!includeSecrets) {
      // Remove sensitive information
      if (exported.redis?.password) {
        exported.redis.password = '[REDACTED]';
      }
      if (exported.database?.password) {
        exported.database.password = '[REDACTED]';
      }
    }

    return {
      environment: this.env,
      config: exported,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const configManager = ConfigurationManager.getInstance();
export const config = configManager.getConfig();

// Helper functions
export function getEnvironment(): string {
  return configManager.getEnvironment();
}

export function isDevelopment(): boolean {
  return configManager.isDevelopment();
}

export function isProduction(): boolean {
  return configManager.isProduction();
}

export function isTest(): boolean {
  return configManager.isTest();
}