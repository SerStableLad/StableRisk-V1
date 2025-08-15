"use strict";
/**
 * Request Validation Utilities
 *
 * Provides validation middleware and schemas for API endpoints
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemas = void 0;
exports.validateRequest = validateRequest;
exports.validateJobId = validateJobId;
exports.requireJsonContent = requireJsonContent;
exports.validateRequestSize = validateRequestSize;
exports.validateApiKey = validateApiKey;
const joi_1 = __importDefault(require("joi"));
const types_1 = require("../types");
// Validation schemas
exports.schemas = {
    jobSubmission: joi_1.default.object({
        type: joi_1.default.string().required().min(1).max(100),
        data: joi_1.default.object().required(),
        options: joi_1.default.object({
            priority: joi_1.default.string().valid(...Object.values(types_1.JobPriority)).default(types_1.JobPriority.MEDIUM),
            delay: joi_1.default.number().integer().min(0).max(24 * 60 * 60 * 1000).default(0),
            attempts: joi_1.default.number().integer().min(1).max(10).default(3),
            timeout: joi_1.default.number().integer().min(1000).max(10 * 60 * 1000).default(300000),
            backoff: joi_1.default.object({
                type: joi_1.default.string().valid(...Object.values(types_1.BackoffStrategy)).required(),
                delay: joi_1.default.number().integer().min(100).max(60000).required()
            }).optional(),
            retryDelays: joi_1.default.array().items(joi_1.default.number().integer().min(100)).max(10).optional()
        }).optional()
    }),
    bulkJobSubmission: joi_1.default.object({
        jobs: joi_1.default.array()
            .items(joi_1.default.object({
            type: joi_1.default.string().required().min(1).max(100),
            data: joi_1.default.object().required(),
            options: joi_1.default.object({
                priority: joi_1.default.string().valid(...Object.values(types_1.JobPriority)).default(types_1.JobPriority.MEDIUM),
                delay: joi_1.default.number().integer().min(0).max(24 * 60 * 60 * 1000).default(0),
                attempts: joi_1.default.number().integer().min(1).max(10).default(3),
                timeout: joi_1.default.number().integer().min(1000).max(10 * 60 * 1000).default(300000)
            }).optional()
        }))
            .min(1)
            .max(100)
            .required()
    }),
    jobQuery: joi_1.default.object({
        status: joi_1.default.alternatives().try(joi_1.default.string().valid('pending', 'processing', 'completed', 'failed', 'delayed', 'cancelled'), joi_1.default.string().pattern(/^(pending|processing|completed|failed|delayed|cancelled)(,(pending|processing|completed|failed|delayed|cancelled))*$/)).optional(),
        type: joi_1.default.alternatives().try(joi_1.default.string().min(1).max(100), joi_1.default.string().pattern(/^[^,]+(,[^,]+)*$/)).optional(),
        limit: joi_1.default.number().integer().min(1).max(1000).default(50),
        offset: joi_1.default.number().integer().min(0).default(0),
        sortBy: joi_1.default.string().valid('createdAt', 'priority', 'attempts').default('createdAt'),
        sortOrder: joi_1.default.string().valid('asc', 'desc').default('desc'),
        dateFrom: joi_1.default.date().iso().optional(),
        dateTo: joi_1.default.date().iso().optional()
    }),
    jobCleanup: joi_1.default.object({
        maxAge: joi_1.default.number().integer().min(60000).max(365 * 24 * 60 * 60 * 1000).default(7 * 24 * 60 * 60 * 1000),
        dryRun: joi_1.default.boolean().default(false)
    }),
    workerScaling: joi_1.default.object({
        targetWorkers: joi_1.default.number().integer().min(0).max(50).required(),
        reason: joi_1.default.string().max(200).optional()
    }),
    workerRestart: joi_1.default.object({
        graceful: joi_1.default.boolean().default(true),
        timeout: joi_1.default.number().integer().min(1000).max(300000).default(30000)
    }),
    queueOperation: joi_1.default.object({
        reason: joi_1.default.string().max(200).optional()
    }),
    queueClear: joi_1.default.object({
        statuses: joi_1.default.array().items(joi_1.default.string().valid('pending', 'processing', 'completed', 'failed', 'delayed', 'cancelled')).min(1).default(['failed']),
        confirm: joi_1.default.boolean().required()
    }),
    maintenanceMode: joi_1.default.object({
        message: joi_1.default.string().max(500).optional(),
        allowNewJobs: joi_1.default.boolean().default(false)
    })
};
/**
 * Validation middleware factory
 */
function validateRequest(schema, target = 'body') {
    return (req, res, next) => {
        const correlationId = req.headers['x-correlation-id'];
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
function validateJobId(req, res, next) {
    const correlationId = req.headers['x-correlation-id'];
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
function requireJsonContent(req, res, next) {
    const correlationId = req.headers['x-correlation-id'];
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
function validateRequestSize(maxSizeBytes = 10 * 1024 * 1024) {
    return (req, res, next) => {
        const correlationId = req.headers['x-correlation-id'];
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
function validateApiKey(req, res, next) {
    const correlationId = req.headers['x-correlation-id'];
    const apiKey = req.headers['x-api-key'];
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
//# sourceMappingURL=validation.js.map