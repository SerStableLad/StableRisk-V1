"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheckController = void 0;
const express_1 = require("express");
const connection_1 = require("../db/connection");
const metrics_service_1 = require("../services/metrics-service");
class HealthCheckController {
    static metricsService = new metrics_service_1.MetricsService();
    static db = connection_1.DatabaseConnection.getInstance();
    static routes() {
        const router = (0, express_1.Router)();
        // Basic health check
        router.get('/', async (req, res) => {
            try {
                const startTime = Date.now();
                // Check database connectivity
                const dbHealth = await this.db.healthCheck();
                const dbConnectionInfo = await this.db.getConnectionInfo();
                const responseTime = Date.now() - startTime;
                const health = {
                    status: dbHealth ? 'healthy' : 'unhealthy',
                    service: 'metrics-service',
                    version: process.env.npm_package_version || '1.0.0',
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString(),
                    responseTime: `${responseTime}ms`,
                    database: {
                        connected: dbHealth,
                        connectionPool: dbConnectionInfo
                    }
                };
                // Set status code based on health
                const statusCode = dbHealth ? 200 : 503;
                res.status(statusCode).json(health);
            }
            catch (error) {
                console.error('Health check error:', error);
                res.status(503).json({
                    status: 'unhealthy',
                    service: 'metrics-service',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Detailed health check
        router.get('/detailed', async (req, res) => {
            try {
                const startTime = Date.now();
                // Get database health and metrics statistics
                const healthStats = await this.metricsService.getHealthStats();
                const dbConnectionInfo = await this.db.getConnectionInfo();
                const responseTime = Date.now() - startTime;
                // Get system metrics
                const memoryUsage = process.memoryUsage();
                const cpuUsage = process.cpuUsage();
                const detailedHealth = {
                    status: healthStats.isHealthy ? 'healthy' : 'unhealthy',
                    service: 'metrics-service',
                    version: process.env.npm_package_version || '1.0.0',
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString(),
                    responseTime: `${responseTime}ms`,
                    database: {
                        connected: healthStats.isHealthy,
                        connectionPool: dbConnectionInfo,
                        metrics: {
                            totalMetrics: healthStats.totalMetrics,
                            recentMetrics: healthStats.recentMetrics,
                            uniqueMetricNames: healthStats.uniqueMetricNames,
                            oldestMetric: healthStats.oldestMetric,
                            newestMetric: healthStats.newestMetric
                        }
                    },
                    system: {
                        memory: {
                            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
                            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                            external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
                        },
                        cpu: {
                            user: cpuUsage.user,
                            system: cpuUsage.system
                        },
                        nodeVersion: process.version,
                        platform: process.platform,
                        arch: process.arch
                    }
                };
                // Set status code based on health
                const statusCode = healthStats.isHealthy ? 200 : 503;
                res.status(statusCode).json(detailedHealth);
            }
            catch (error) {
                console.error('Detailed health check error:', error);
                res.status(503).json({
                    status: 'unhealthy',
                    service: 'metrics-service',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Database-specific health check
        router.get('/database', async (req, res) => {
            try {
                const startTime = Date.now();
                const dbHealth = await this.db.healthCheck();
                const dbConnectionInfo = await this.db.getConnectionInfo();
                // Try a simple query to test database functionality
                const testQuery = await this.db.query('SELECT COUNT(*) as count FROM metrics.metric_data LIMIT 1');
                const responseTime = Date.now() - startTime;
                const dbHealthInfo = {
                    status: dbHealth ? 'healthy' : 'unhealthy',
                    connected: dbHealth,
                    responseTime: `${responseTime}ms`,
                    connectionPool: dbConnectionInfo,
                    testQuery: {
                        executed: true,
                        result: testQuery.rows[0]
                    },
                    timestamp: new Date().toISOString()
                };
                const statusCode = dbHealth ? 200 : 503;
                res.status(statusCode).json(dbHealthInfo);
            }
            catch (error) {
                console.error('Database health check error:', error);
                res.status(503).json({
                    status: 'unhealthy',
                    connected: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Readiness probe (for Kubernetes)
        router.get('/ready', async (req, res) => {
            try {
                // Check if service is ready to accept requests
                const dbHealth = await this.db.healthCheck();
                if (dbHealth) {
                    res.status(200).json({
                        status: 'ready',
                        timestamp: new Date().toISOString()
                    });
                }
                else {
                    res.status(503).json({
                        status: 'not ready',
                        reason: 'Database not available',
                        timestamp: new Date().toISOString()
                    });
                }
            }
            catch (error) {
                console.error('Readiness check error:', error);
                res.status(503).json({
                    status: 'not ready',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        // Liveness probe (for Kubernetes)
        router.get('/live', (req, res) => {
            // Simple liveness check - if this endpoint responds, the service is alive
            res.status(200).json({
                status: 'alive',
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            });
        });
        // Service version and info
        router.get('/info', (req, res) => {
            const info = {
                service: 'metrics-service',
                version: process.env.npm_package_version || '1.0.0',
                description: 'Metrics collection and aggregation service for StableRisk AI',
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                environment: process.env.NODE_ENV || 'development',
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            };
            res.json(info);
        });
        return router;
    }
}
exports.HealthCheckController = HealthCheckController;
//# sourceMappingURL=health-controller.js.map