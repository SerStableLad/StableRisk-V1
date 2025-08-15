import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from 'dotenv';

import { MetricsController } from './controllers/metrics-controller';
import { HealthCheckController } from './controllers/health-controller';
import { DatabaseConnection } from './db/connection';
import { errorHandler } from './middleware/validation';

// Load environment variables
config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize database connection
const db = DatabaseConnection.getInstance();

// Security middleware
app.use(helmet({
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
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression middleware
app.use(compression());

// Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing middleware
app.use(express.json({ 
  limit: '1mb',
  type: 'application/json'
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '1mb' 
}));

// Request timeout middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  // Set timeout for all requests (30 seconds)
  const timeout = parseInt(process.env.REQUEST_TIMEOUT || '30000');
  req.setTimeout(timeout);
  res.setTimeout(timeout);
  next();
});

// Request ID middleware for tracking
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] || 
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// Rate limiting information (for monitoring)
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.headers['x-request-id']}`);
  });
  
  next();
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
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
app.use('/health', HealthCheckController.routes());

// Metrics endpoints
app.use('/metrics', MetricsController.routes());

// API documentation endpoint
app.get('/docs', (req: Request, res: Response) => {
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
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Global error handling middleware
app.use(errorHandler);

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
const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close database connections
    await db.close();
    console.log('Database connections closed');
    
    // Exit process
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
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
    server.on('error', (error: any) => {
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

  } catch (error) {
    console.error('Failed to start metrics service:', error);
    process.exit(1);
  }
};

// Only start server if this file is run directly
if (require.main === module) {
  startServer();
}

export default app;