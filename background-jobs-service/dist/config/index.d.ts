/**
 * Configuration Management and Validation
 *
 * Features:
 * - Environment variable validation with Joi
 * - Default values and type conversion
 * - Development/production environment handling
 * - Configuration hot-reloading support
 */
import { ServiceConfig } from '../types';
declare class ConfigurationManager {
    private static instance;
    private config;
    private env;
    private constructor();
    static getInstance(): ConfigurationManager;
    private loadAndValidateConfig;
    getConfig(): ServiceConfig;
    getEnvironment(): string;
    isDevelopment(): boolean;
    isProduction(): boolean;
    isTest(): boolean;
    getRedisConfig(): import("../types").RedisConfig;
    getDatabaseConfig(): import("../types").DatabaseConfig;
    getProcessorConfig(): import("../types").ProcessorConfig;
    getLoggingConfig(): {
        level: string;
        format: string;
        enableConsole: boolean;
        enableFile: boolean;
        filename?: string;
    };
    getMonitoringConfig(): {
        enableMetrics: boolean;
        metricsPort: number;
        healthCheckInterval: number;
    };
    get<T>(key: string, defaultValue?: T): T;
    updateConfig(updates: Partial<ServiceConfig>): void;
    validateExternalServices(): Promise<boolean>;
    exportConfig(includeSecrets?: boolean): Record<string, any>;
}
export declare const configManager: ConfigurationManager;
export declare const config: ServiceConfig;
export declare function getEnvironment(): string;
export declare function isDevelopment(): boolean;
export declare function isProduction(): boolean;
export declare function isTest(): boolean;
export {};
//# sourceMappingURL=index.d.ts.map