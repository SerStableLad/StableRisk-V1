"use strict";
/**
 * Enhanced Background Jobs Service Application
 *
 * Complete REST API server with:
 * - Job management endpoints
 * - Health monitoring endpoints
 * - Admin management endpoints
 * - Rate limiting and validation
 * - Comprehensive error handling
 * - Security middleware
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundJobsServer = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const dotenv_1 = require("dotenv");
// Load environment variables
(0, dotenv_1.config)();
const job_processor_1 = require("../processors/job-processor");
const job_queue_1 = require("../redis/job-queue");
const connection_1 = require("../db/connection");
const base_handler_1 = require("../processors/handlers/base-handler");
const logger_1 = require("../utils/logger");
const config_1 = require("../config");
class BackgroundJobsServer {
    constructor() {
        this.isShuttingDown = false;
        this.app = (0, express_1.default)();
        this.handlerRegistry = new base_handler_1.HandlerRegistry();
        this.jobQueue = new job_queue_1.JobQueue();
        this.database = connection_1.DatabaseConnection.getInstance();
        this.jobProcessor = new job_processor_1.JobProcessor(this.jobQueue, this.database, config_1.configManager.getProcessorConfig(), this.handlerRegistry);
        this.setupMiddleware();
        this.registerHandlers();
        this.setupRoutes();
        this.setupErrorHandlers();
        this.setupGracefulShutdown();
    }
    /**
     * Setup Express middleware stack
     */
    setupMiddleware() {
        // Trust proxy headers (important for rate limiting and client IP detection)
        this.app.set('trust proxy', true);
        // Security middleware
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: false, // Disable CSP for API service
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));
        // CORS configuration
        this.app.use((0, cors_1.default)({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Admin-API-Key', 'X-Correlation-ID'],
            exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
            credentials: false,
            maxAge: 86400 // 24 hours
        }));
        // Compression
        this.app.use((0, compression_1.default)({
            filter: (req, res) => {
                // Don't compress responses with this header
                if (req.headers['x-no-compression']) {
                    return false;
                }
                // Use compression for all other responses
                return compression_1.default.filter(req, res);
            },
            level: 6,
            threshold: 1024
        }));
        // Request parsing with size limits
        this.app.use(express_1.default.json({
            limit: '10mb',
            strict: true,
            type: ['application/json']
        }));
        this.app.use(express_1.default.urlencoded({
            extended: true,
            limit: '10mb',
            parameterLimit: 1000
        }));
        // Global request logging
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            const correlationId = req.get('X-Correlation-ID') || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            n;
            n;
            req.headers['x-correlation-id'] = correlationId;
            n;
            res.setHeader('X-Correlation-ID', correlationId);
            n;
            n;
            res.on('finish', () => { n; const duration = Date.now() - startTime; n; logger_1.logger.httpRequest(req.method, req.originalUrl, res.statusCode, duration, { n, correlationId, n, metadata: { n, userAgent: req.get('User-Agent'), n, ip: req.ip, n, contentLength: res.get('Content-Length'), n }, n }); n; });
            n;
            n;
            next();
            n;
        });
        n;
        n;
    }
} // Health check bypass (no auth required)\n    this.app.use('/health', (req, res, next) => next());\n  }\n\n  /**\n   * Register all job handlers\n   */\n  private registerHandlers(): void {\n    logger.info('Registering job handlers', {\n      operation: 'handler_registration'\n    });\n\n    try {\n      // Register stablecoin data collection handler\n      this.handlerRegistry.register(\n        'collect-stablecoin-data',\n        new StablecoinDataCollector({\n          timeoutMs: 180000,\n          retries: 2,\n          enableMetrics: true\n        })\n      );\n\n      // Register transparency analysis handler\n      this.handlerRegistry.register(\n        'analyze-transparency',\n        new TransparencyAnalyzer({\n          timeoutMs: 300000,\n          retries: 2,\n          enableMetrics: true\n        })\n      );\n\n      // Register cache invalidation handler\n      this.handlerRegistry.register(\n        'invalidate-cache',\n        new CacheInvalidator({\n          timeoutMs: 60000,\n          retries: 3,\n          enableMetrics: true\n        })\n      );\n\n      // Register metrics aggregation handler\n      this.handlerRegistry.register(\n        'aggregate-metrics',\n        new MetricsAggregator({\n          timeoutMs: 300000,\n          retries: 1,\n          enableMetrics: true\n        })\n      );\n\n      logger.info('All job handlers registered successfully', {\n        operation: 'handler_registration_complete',\n        metadata: {\n          registeredHandlers: this.handlerRegistry.getRegisteredTypes(),\n          totalHandlers: this.handlerRegistry.getRegisteredTypes().length\n        }\n      });\n\n    } catch (error) {\n      logger.error('Failed to register job handlers', error as Error, {\n        operation: 'handler_registration_failed'\n      });\n      throw error;\n    }\n  }\n\n  /**\n   * Setup API routes with controllers\n   */\n  private setupRoutes(): void {\n    // Initialize controllers\n    const healthController = new HealthController();\n    const jobController = new JobController(this.jobQueue, this.database);\n    const adminController = new AdminController(this.jobProcessor, this.jobQueue);\n\n    // Health check routes (public, no auth required)\n    this.app.use('/health', healthController.getRoutes());\n\n    // Job management routes (API key required)\n    this.app.use('/jobs', validateApiKey, jobController.getRoutes());\n\n    // Admin routes (admin API key required)\n    this.app.use('/admin', adminController.getRoutes());\n\n    // Root endpoint\n    this.app.get('/', (req, res) => {\n      res.json({\n        service: 'background-jobs-service',\n        version: '1.0.0',\n        status: 'running',\n        uptime: process.uptime(),\n        timestamp: new Date().toISOString(),\n        endpoints: {\n          health: '/health',\n          jobs: '/jobs',\n          admin: '/admin'\n        },\n        documentation: {\n          health: {\n            basic: 'GET /health',\n            detailed: 'GET /health/detailed',\n            readiness: 'GET /health/ready',\n            liveness: 'GET /health/live'\n          },\n          jobs: {\n            submit: 'POST /jobs/submit',\n            bulk: 'POST /jobs/bulk',\n            status: 'GET /jobs/:jobId',\n            list: 'GET /jobs',\n            cancel: 'DELETE /jobs/:jobId',\n            stats: 'GET /jobs/stats/queue'\n          },\n          admin: {\n            workers: 'GET /admin/workers',\n            scale: 'POST /admin/workers/scale',\n            pause: 'POST /admin/queue/pause',\n            resume: 'POST /admin/queue/resume'\n          }\n        }\n      });\n    });\n\n    // OpenAPI/Swagger documentation endpoint\n    this.app.get('/api-docs', (req, res) => {\n      res.json(this.generateOpenAPISpec());\n    });\n  }\n\n  /**\n   * Setup error handling middleware\n   */\n  private setupErrorHandlers(): void {\n    // 404 handler\n    this.app.use('*', (req: Request, res: Response) => {\n      const correlationId = req.headers['x-correlation-id'] as string;\n      \n      res.status(404).json({\n        error: 'Not Found',\n        message: `Route ${req.method} ${req.originalUrl} not found`,\n        timestamp: new Date().toISOString(),\n        correlationId\n      });\n    });\n\n    // Global error handler\n    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {\n      const correlationId = req.headers['x-correlation-id'] as string;\n      \n      logger.error('Unhandled API error', error, {\n        operation: 'api_error',\n        correlationId,\n        metadata: {\n          path: req.path,\n          method: req.method,\n          ip: req.ip,\n          userAgent: req.get('User-Agent')\n        }\n      });\n\n      // Handle different error types\n      let statusCode = 500;\n      let message = 'Internal Server Error';\n      \n      if (error.name === 'ValidationError') {\n        statusCode = 400;\n        message = 'Validation Error';\n      } else if (error.name === 'UnauthorizedError') {\n        statusCode = 401;\n        message = 'Unauthorized';\n      } else if (error.code === 'ECONNREFUSED') {\n        statusCode = 503;\n        message = 'Service Unavailable';\n      }\n\n      res.status(statusCode).json({\n        error: message,\n        message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',\n        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),\n        timestamp: new Date().toISOString(),\n        correlationId\n      });\n    });\n  }\n\n  /**\n   * Setup graceful shutdown handling\n   */\n  private setupGracefulShutdown(): void {\n    const shutdownHandler = async (signal: string) => {\n      if (this.isShuttingDown) {\n        logger.warn(`Received ${signal} signal while already shutting down`);\n        return;\n      }\n\n      this.isShuttingDown = true;\n      logger.info(`Received ${signal} signal, starting graceful shutdown`, {\n        operation: 'service_shutdown',\n        metadata: { signal }\n      });\n\n      try {\n        // Stop accepting new connections\n        if (this.server) {\n          this.server.close(() => {\n            logger.info('HTTP server closed');\n          });\n        }\n\n        // Set a timeout for forced shutdown\n        const forceShutdownTimer = setTimeout(() => {\n          logger.error('Forced shutdown due to timeout');\n          process.exit(1);\n        }, 30000);\n\n        // Stop job processor\n        await this.jobProcessor.stop(20000);\n\n        // Close database connections\n        await this.database.close();\n\n        // Close Redis connections\n        await this.jobQueue.close();\n\n        clearTimeout(forceShutdownTimer);\n\n        logger.info('Graceful shutdown completed', {\n          operation: 'service_shutdown_complete'\n        });\n\n        process.exit(0);\n      } catch (error) {\n        logger.error('Error during graceful shutdown', error as Error, {\n          operation: 'service_shutdown_error'\n        });\n        process.exit(1);\n      }\n    };\n\n    // Register shutdown handlers\n    process.on('SIGINT', () => shutdownHandler('SIGINT'));\n    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));\n\n    // Handle uncaught exceptions\n    process.on('uncaughtException', (error) => {\n      logger.error('Uncaught exception', error, {\n        operation: 'uncaught_exception'\n      });\n      \n      if (!this.isShuttingDown) {\n        shutdownHandler('UNCAUGHT_EXCEPTION').catch(() => {\n          process.exit(1);\n        });\n      }\n    });\n\n    // Handle unhandled promise rejections\n    process.on('unhandledRejection', (reason, promise) => {\n      logger.error('Unhandled promise rejection', reason as Error, {\n        operation: 'unhandled_rejection',\n        metadata: { promise: promise.toString() }\n      });\n    });\n  }\n\n  /**\n   * Generate OpenAPI specification\n   */\n  private generateOpenAPISpec(): any {\n    return {\n      openapi: '3.0.0',\n      info: {\n        title: 'Background Jobs Service API',\n        version: '1.0.0',\n        description: 'REST API for background job management and monitoring',\n        contact: {\n          name: 'API Support',\n          email: 'support@example.com'\n        }\n      },\n      servers: [\n        {\n          url: `http://localhost:${configManager.getServiceConfig().port}`,\n          description: 'Development server'\n        }\n      ],\n      paths: {\n        '/health': {\n          get: {\n            summary: 'Basic health check',\n            responses: {\n              '200': { description: 'Service is healthy' },\n              '503': { description: 'Service is unhealthy' }\n            }\n          }\n        },\n        '/jobs/submit': {\n          post: {\n            summary: 'Submit a new job',\n            security: [{ apiKey: [] }],\n            requestBody: {\n              required: true,\n              content: {\n                'application/json': {\n                  schema: {\n                    type: 'object',\n                    properties: {\n                      type: { type: 'string' },\n                      data: { type: 'object' },\n                      options: {\n                        type: 'object',\n                        properties: {\n                          priority: { type: 'string', enum: ['low', 'medium', 'high'] },\n                          delay: { type: 'number' },\n                          attempts: { type: 'number' }\n                        }\n                      }\n                    },\n                    required: ['type', 'data']\n                  }\n                }\n              }\n            },\n            responses: {\n              '201': { description: 'Job submitted successfully' },\n              '400': { description: 'Invalid request' },\n              '429': { description: 'Rate limit exceeded' }\n            }\n          }\n        }\n        // Add more endpoints as needed\n      },\n      components: {\n        securitySchemes: {\n          apiKey: {\n            type: 'apiKey',\n            in: 'header',\n            name: 'X-API-Key'\n          }\n        }\n      }\n    };\n  }\n\n  /**\n   * Start the background jobs service\n   */\n  public async start(): Promise<void> {\n    try {\n      // Test database connection\n      await this.database.testConnection();\n      logger.info('Database connection established');\n\n      // Test Redis connection\n      await this.jobQueue.testConnection();\n      logger.info('Redis connection established');\n\n      // Start job processor\n      await this.jobProcessor.start();\n      logger.info('Job processor started');\n\n      // Start HTTP server\n      const port = configManager.getServiceConfig().port;\n      this.server = this.app.listen(port, () => {\n        logger.info(`Background Jobs Service started on port ${port}`, {\n          operation: 'service_started',\n          metadata: {\n            port,\n            environment: process.env.NODE_ENV || 'development',\n            registeredHandlers: this.handlerRegistry.getRegisteredTypes().length,\n            maxWorkers: configManager.getProcessorConfig().maxWorkers,\n            endpoints: {\n              health: `http://localhost:${port}/health`,\n              jobs: `http://localhost:${port}/jobs`,\n              admin: `http://localhost:${port}/admin`,\n              docs: `http://localhost:${port}/api-docs`\n            }\n          }\n        });\n      });\n\n      // Handle server errors\n      this.server.on('error', (error: Error) => {\n        logger.error('Server error', error, {\n          operation: 'server_error'\n        });\n        throw error;\n      });\n\n      // Set keep-alive timeout\n      this.server.keepAliveTimeout = 65000;\n      this.server.headersTimeout = 66000;\n\n    } catch (error) {\n      logger.error('Failed to start Background Jobs Service', error as Error, {\n        operation: 'service_start_failed'\n      });\n      throw error;\n    }\n  }\n\n  /**\n   * Stop the service\n   */\n  public async stop(): Promise<void> {\n    if (this.isShuttingDown) return;\n    \n    this.isShuttingDown = true;\n    \n    if (this.server) {\n      this.server.close();\n    }\n    \n    await this.jobProcessor.stop();\n    await this.database.close();\n    await this.jobQueue.close();\n  }\n\n  /**\n   * Get the Express application (for testing)\n   */\n  public getApp(): express.Application {\n    return this.app;\n  }\n}\n\n// Start the service if this file is run directly\nif (require.main === module) {\n  const service = new BackgroundJobsServer();\n  \n  service.start().catch((error) => {\n    logger.error('Service startup failed', error);\n    process.exit(1);\n  });\n}\n\nexport default BackgroundJobsServer;
exports.BackgroundJobsServer = BackgroundJobsServer;
//# sourceMappingURL=server.js.map