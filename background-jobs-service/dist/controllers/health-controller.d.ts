/**
 * Health Check Controller
 *
 * Provides comprehensive health monitoring endpoints:
 * - Overall service health
 * - Component-specific health checks
 * - Readiness and liveness probes
 * - Performance metrics
 */
import { Router } from 'express';
export declare class HealthController {
    private redisConnection;
    private databaseConnection;
    private jobQueue;
    constructor();
    getRoutes(): Router;
    private healthCheck;
    private detailedHealthCheck;
    private readinessCheck;
    private livenessCheck;
    private redisHealth;
    private databaseHealth;
    private queueHealth;
    private systemInfo;
    private healthMetrics;
    private performQueueHealthCheck;
    private performLivenessChecks;
    private checkMemoryUsage;
    private checkEventLoop;
    private checkBasicFunctionality;
    private gatherSystemMetrics;
    private getHealthResult;
    private getResultValue;
    private isComponentReady;
    private determineOverallHealth;
    private getServiceStatus;
}
//# sourceMappingURL=health-controller.d.ts.map