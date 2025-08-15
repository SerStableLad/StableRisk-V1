/**
 * Request Validation Utilities
 * 
 * Provides validation middleware and schemas for API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { JobPriority, BackoffStrategy } from '../types';

// Validation schemas
export const schemas = {
  jobSubmission: Joi.object({
    type: Joi.string().required().min(1).max(100),
    data: Joi.object().required(),
    options: Joi.object({
      priority: Joi.string().valid(...Object.values(JobPriority)).default(JobPriority.MEDIUM),
      delay: Joi.number().integer().min(0).max(24 * 60 * 60 * 1000).default(0),
      attempts: Joi.number().integer().min(1).max(10).default(3),
      timeout: Joi.number().integer().min(1000).max(10 * 60 * 1000).default(300000),
      backoff: Joi.object({
        type: Joi.string().valid(...Object.values(BackoffStrategy)).required(),
        delay: Joi.number().integer().min(100).max(60000).required()
      }).optional(),
      retryDelays: Joi.array().items(Joi.number().integer().min(100)).max(10).optional()
    }).optional()
  }),

  bulkJobSubmission: Joi.object({
    jobs: Joi.array()
      .items(Joi.object({
        type: Joi.string().required().min(1).max(100),
        data: Joi.object().required(),
        options: Joi.object({
          priority: Joi.string().valid(...Object.values(JobPriority)).default(JobPriority.MEDIUM),
          delay: Joi.number().integer().min(0).max(24 * 60 * 60 * 1000).default(0),
          attempts: Joi.number().integer().min(1).max(10).default(3),
          timeout: Joi.number().integer().min(1000).max(10 * 60 * 1000).default(300000)
        }).optional()
      }))
      .min(1)
      .max(100)
      .required()
  }),

  jobQuery: Joi.object({
    status: Joi.alternatives().try(
      Joi.string().valid('pending', 'processing', 'completed', 'failed', 'delayed', 'cancelled'),
      Joi.string().pattern(/^(pending|processing|completed|failed|delayed|cancelled)(,(pending|processing|completed|failed|delayed|cancelled))*$/)
    ).optional(),
    type: Joi.alternatives().try(
      Joi.string().min(1).max(100),
      Joi.string().pattern(/^[^,]+(,[^,]+)*$/)
    ).optional(),
    limit: Joi.number().integer().min(1).max(1000).default(50),
    offset: Joi.number().integer().min(0).default(0),
    sortBy: Joi.string().valid('createdAt', 'priority', 'attempts').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    dateFrom: Joi.date().iso().optional(),
    dateTo: Joi.date().iso().optional()
  }),

  jobCleanup: Joi.object({
    maxAge: Joi.number().integer().min(60000).max(365 * 24 * 60 * 60 * 1000).default(7 * 24 * 60 * 60 * 1000),
    dryRun: Joi.boolean().default(false)
  }),

  workerScaling: Joi.object({
    targetWorkers: Joi.number().integer().min(0).max(50).required(),
    reason: Joi.string().max(200).optional()
  }),

  workerRestart: Joi.object({
    graceful: Joi.boolean().default(true),
    timeout: Joi.number().integer().min(1000).max(300000).default(30000)
  }),

  queueOperation: Joi.object({
    reason: Joi.string().max(200).optional()
  }),

  queueClear: Joi.object({
    statuses: Joi.array().items(
      Joi.string().valid('pending', 'processing', 'completed', 'failed', 'delayed', 'cancelled')
    ).min(1).default(['failed']),
    confirm: Joi.boolean().required()
  }),

  maintenanceMode: Joi.object({
    message: Joi.string().max(500).optional(),
    allowNewJobs: Joi.boolean().default(false)
  })
};

/**
 * Validation middleware factory
 */
export function validateRequest(schema: Joi.Schema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const correlationId = req.headers['x-correlation-id'] as string;
    
    let dataToValidate;
    switch (target) {
      case 'body':
        dataToValidate = req.body;
        break;
      case 'query':
        dataToValidate = req.query;
        break;
      case 'params':
        dataToValidate = req.params;
        break;
    }

    const { error, value } = schema.validate(dataToValidate, {
      allowUnknown: false,
      stripUnknown: true,
      abortEarly: false
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      res.status(400).json({
        error: 'Validation failed',
        details: validationErrors,
        correlationId
      });
      return;
    }

    // Replace the original data with validated/sanitized data
    switch (target) {
      case 'body':
        req.body = value;
        break;
      case 'query':
        req.query = value;
        break;
      case 'params':
        req.params = value;
        break;
    }

    next();
  };
}

/**
 * Job ID parameter validation
 */
export function validateJobId(req: Request, res: Response, next: NextFunction) {
  const correlationId = req.headers['x-correlation-id'] as string;
  const { jobId } = req.params;

  if (!jobId || typeof jobId !== 'string') {
    res.status(400).json({
      error: 'Invalid job ID',
      details: 'Job ID must be a non-empty string',
      correlationId
    });
    return;
  }

  // Basic job ID format validation (adjust based on your ID generation strategy)
  const jobIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!jobIdPattern.test(jobId) || jobId.length > 100) {
    res.status(400).json({
      error: 'Invalid job ID format',
      details: 'Job ID must contain only alphanumeric characters, underscores, and hyphens',
      correlationId
    });
    return;
  }

  next();
}

/**
 * Content-Type validation middleware
 */
export function requireJsonContent(req: Request, res: Response, next: NextFunction) {
  const correlationId = req.headers['x-correlation-id'] as string;
  
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes('application/json')) {
      res.status(415).json({
        error: 'Unsupported Media Type',
        details: 'Content-Type must be application/json',
        correlationId
      });
      return;
    }
  }

  next();
}

/**
 * Request size validation middleware
 */
export function validateRequestSize(maxSizeBytes: number = 10 * 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction) => {
    const correlationId = req.headers['x-correlation-id'] as string;
    const contentLength = req.get('Content-Length');
    
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      res.status(413).json({
        error: 'Payload Too Large',
        details: `Request size exceeds maximum allowed size of ${maxSizeBytes} bytes`,
        maxSize: maxSizeBytes,
        correlationId
      });
      return;
    }

    next();
  };
}

/**
 * API key validation middleware
 */
export function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const correlationId = req.headers['x-correlation-id'] as string;
  const apiKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.API_KEY;

  // Skip in development if no key is configured
  if (!expectedKey && process.env.NODE_ENV !== 'production') {
    next();
    return;
  }

  if (!expectedKey) {
    res.status(500).json({
      error: 'API key not configured',
      correlationId
    });
    return;
  }

  if (!apiKey || apiKey !== expectedKey) {
    res.status(401).json({
      error: 'Unauthorized - Invalid or missing API key',
      correlationId
    });
    return;
  }

  next();
}