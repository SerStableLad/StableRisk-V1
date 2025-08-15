"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = require("dotenv");
const metrics_controller_1 = require("./controllers/metrics-controller");
const health_controller_1 = require("./controllers/health-controller");
const connection_1 = require("./db/connection");
const validation_1 = require("./middleware/validation");
// Load environment variables
(0, dotenv_1.config)();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// Initialize database connection
const db = connection_1.DatabaseConnection.getInstance();
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
// CORS configuration
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
// Compression middleware
app.use((0, compression_1.default)());
// Request logging
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// Body parsing middleware
app.use(express_1.default.json({
    limit: '1mb',
    type: 'application/json'
}));
app.use(express_1.default.urlencoded({
    extended: true,
    limit: '1mb'
}));
// Request timeout middleware
app.use((req, res, next) => {
    // Set timeout for all requests (30 seconds)
    const timeout = parseInt(process.env.REQUEST_TIMEOUT || '30000');
    req.setTimeout(timeout);
    res.setTimeout(timeout);
    next();
});
// Request ID middleware for tracking
app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] ||
        `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);
    next();
});
// Rate limiting information (for monitoring)
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.headers['x-request-id']}`);
    });
    next();
});
// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'metrics-service',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            metrics: '/metrics',
            documentation: '/docs'
        }
    });
});
// Health check endpoints
app.use('/health', health_controller_1.HealthCheckController.routes());
// Metrics endpoints
app.use('/metrics', metrics_controller_1.MetricsController.routes());
// API documentation endpoint
app.get('/docs', (req, res) => {
    res.json({
        service: 'metrics-service',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Metrics collection and aggregation service for StableRisk AI',
        endpoints: {
            health: {
                'GET /health': 'Basic health check',
                'GET /health/detailed': 'Detailed health information',
                'GET /health/database': 'Database health check',
                'GET /health/ready': 'Readiness probe',
                'GET /health/live': 'Liveness probe',
                'GET /health/info': 'Service information'
            },
            metrics: {
                'POST /metrics/record': 'Record a single metric',
                'POST /metrics/batch': 'Record multiple metrics',
                'GET /metrics/:name': 'Get metrics by name',
                'GET /metrics/aggregate/:name': 'Get aggregated metrics',
                'POST /metrics/query/labels': 'Query metrics by labels',
                'GET /metrics/system/summary': 'Get system metrics summary',
                'GET /metrics/system/names': 'Get available metric names',
                'GET /metrics/system/stats': 'Get health statistics',
                'DELETE /metrics/cleanup': 'Cleanup old metrics'
            }
        },
        timestamp: new Date().toISOString()
    });
});
// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        method: req.method,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});
// Global error handling middleware
app.use(validation_1.errorHandler);
// Global uncaught exception handler
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
// Global unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
    console.log(`Received ${signal}. Starting graceful shutdown...`);
    try {
        // Close database connections
        await db.close();
        console.log('Database connections closed');
        // Exit process
        console.log('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Initialize database schema and start server
const startServer = async () => {
    try {
        console.log('Initializing metrics service...');
        // Initialize database schema
        await db.initializeSchema();
        console.log('Database schema initialized');
        // Start the server
        const server = app.listen(port, () => {
            console.log(`Metrics service listening on port ${port}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`Process ID: ${process.pid}`);
            console.log(`Available endpoints:`);
            console.log(`  - Health: http://localhost:${port}/health`);
            console.log(`  - Metrics: http://localhost:${port}/metrics`);
            console.log(`  - Documentation: http://localhost:${port}/docs`);
        });
        // Handle server errors
        server.on('error', (error) => {
            if (error.syscall !== 'listen') {
                throw error;
            }
            switch (error.code) {
                case 'EACCES':
                    console.error(`Port ${port} requires elevated privileges`);
                    process.exit(1);
                    break;
                case 'EADDRINUSE':
                    console.error(`Port ${port} is already in use`);
                    process.exit(1);
                    break;
                default:
                    throw error;
            }
        });
    }
    catch (error) {
        console.error('Failed to start metrics service:', error);
        process.exit(1);
    }
};
// Only start server if this file is run directly
if (require.main === module) {
    startServer();
}
exports.default = app;
//# sourceMappingURL=app.js.map