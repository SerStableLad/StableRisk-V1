"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.validateAggregationQuery = exports.validateMetricQuery = exports.validateBatchMetricRequest = exports.validateMetricRequest = void 0;
/**
 * Validate single metric recording request
 */
const validateMetricRequest = (req, res, next) => {
    const { name, value, labels, timestamp } = req.body;
    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({
            error: 'Metric name is required and must be a non-empty string',
            code: 'INVALID_METRIC_NAME'
        });
        return;
    }
    if (value === undefined || value === null || typeof value !== 'number' || isNaN(value)) {
        res.status(400).json({
            error: 'Metric value is required and must be a valid number',
            code: 'INVALID_METRIC_VALUE'
        });
        return;
    }
    // Validate optional fields
    if (labels !== undefined) {
        if (typeof labels !== 'object' || labels === null || Array.isArray(labels)) {
            res.status(400).json({
                error: 'Labels must be an object with string key-value pairs',
                code: 'INVALID_LABELS_FORMAT'
            });
            return;
        }
        // Validate all label values are strings
        for (const [key, val] of Object.entries(labels)) {
            if (typeof key !== 'string' || typeof val !== 'string') {
                res.status(400).json({
                    error: 'All label keys and values must be strings',
                    code: 'INVALID_LABEL_TYPE'
                });
                return;
            }
        }
    }
    if (timestamp !== undefined) {
        const parsedTimestamp = new Date(timestamp);
        if (isNaN(parsedTimestamp.getTime())) {
            res.status(400).json({
                error: 'Timestamp must be a valid ISO date string',
                code: 'INVALID_TIMESTAMP'
            });
            return;
        }
    }
    // Validate metric name format (alphanumeric, dots, hyphens, underscores)
    const namePattern = /^[a-zA-Z0-9._-]+$/;
    if (!namePattern.test(name.trim())) {
        res.status(400).json({
            error: 'Metric name can only contain alphanumeric characters, dots, hyphens, and underscores',
            code: 'INVALID_METRIC_NAME_FORMAT'
        });
        return;
    }
    // Validate metric name length
    if (name.trim().length > 255) {
        res.status(400).json({
            error: 'Metric name cannot exceed 255 characters',
            code: 'METRIC_NAME_TOO_LONG'
        });
        return;
    }
    next();
};
exports.validateMetricRequest = validateMetricRequest;
/**
 * Validate batch metrics recording request
 */
const validateBatchMetricRequest = (req, res, next) => {
    const { metrics } = req.body;
    if (!metrics || !Array.isArray(metrics)) {
        res.status(400).json({
            error: 'Metrics must be provided as an array',
            code: 'INVALID_METRICS_FORMAT'
        });
        return;
    }
    if (metrics.length === 0) {
        res.status(400).json({
            error: 'At least one metric must be provided',
            code: 'EMPTY_METRICS_ARRAY'
        });
        return;
    }
    if (metrics.length > 1000) {
        res.status(400).json({
            error: 'Cannot process more than 1000 metrics in a single batch',
            code: 'BATCH_SIZE_EXCEEDED'
        });
        return;
    }
    // Validate each metric in the batch
    for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i];
        const context = `metrics[${i}]`;
        if (!metric || typeof metric !== 'object') {
            res.status(400).json({
                error: `${context}: Metric must be an object`,
                code: 'INVALID_METRIC_OBJECT'
            });
            return;
        }
        const { name, value, labels, timestamp } = metric;
        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            res.status(400).json({
                error: `${context}: Metric name is required and must be a non-empty string`,
                code: 'INVALID_METRIC_NAME'
            });
            return;
        }
        // Validate value
        if (value === undefined || value === null || typeof value !== 'number' || isNaN(value)) {
            res.status(400).json({
                error: `${context}: Metric value is required and must be a valid number`,
                code: 'INVALID_METRIC_VALUE'
            });
            return;
        }
        // Validate labels
        if (labels !== undefined) {
            if (typeof labels !== 'object' || labels === null || Array.isArray(labels)) {
                res.status(400).json({
                    error: `${context}: Labels must be an object with string key-value pairs`,
                    code: 'INVALID_LABELS_FORMAT'
                });
                return;
            }
            for (const [key, val] of Object.entries(labels)) {
                if (typeof key !== 'string' || typeof val !== 'string') {
                    res.status(400).json({
                        error: `${context}: All label keys and values must be strings`,
                        code: 'INVALID_LABEL_TYPE'
                    });
                    return;
                }
            }
        }
        // Validate timestamp
        if (timestamp !== undefined) {
            const parsedTimestamp = new Date(timestamp);
            if (isNaN(parsedTimestamp.getTime())) {
                res.status(400).json({
                    error: `${context}: Timestamp must be a valid ISO date string`,
                    code: 'INVALID_TIMESTAMP'
                });
                return;
            }
        }
        // Validate metric name format
        const namePattern = /^[a-zA-Z0-9._-]+$/;
        if (!namePattern.test(name.trim())) {
            res.status(400).json({
                error: `${context}: Metric name can only contain alphanumeric characters, dots, hyphens, and underscores`,
                code: 'INVALID_METRIC_NAME_FORMAT'
            });
            return;
        }
        // Validate metric name length
        if (name.trim().length > 255) {
            res.status(400).json({
                error: `${context}: Metric name cannot exceed 255 characters`,
                code: 'METRIC_NAME_TOO_LONG'
            });
            return;
        }
    }
    next();
};
exports.validateBatchMetricRequest = validateBatchMetricRequest;
/**
 * Validate query parameters for metric retrieval
 */
const validateMetricQuery = (req, res, next) => {
    const { start, end, granularity, limit } = req.query;
    // Validate start date
    if (start) {
        const startDate = new Date(start);
        if (isNaN(startDate.getTime())) {
            res.status(400).json({
                error: 'Start date must be a valid ISO date string',
                code: 'INVALID_START_DATE'
            });
            return;
        }
    }
    // Validate end date
    if (end) {
        const endDate = new Date(end);
        if (isNaN(endDate.getTime())) {
            res.status(400).json({
                error: 'End date must be a valid ISO date string',
                code: 'INVALID_END_DATE'
            });
            return;
        }
    }
    // Validate date range
    if (start && end) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (startDate >= endDate) {
            res.status(400).json({
                error: 'Start date must be before end date',
                code: 'INVALID_DATE_RANGE'
            });
            return;
        }
    }
    // Validate granularity
    if (granularity) {
        const validGranularities = ['1m', '5m', '15m', '30m', '1h', '6h', '12h', '1d', '1w'];
        if (!validGranularities.includes(granularity)) {
            res.status(400).json({
                error: `Invalid granularity. Must be one of: ${validGranularities.join(', ')}`,
                code: 'INVALID_GRANULARITY'
            });
            return;
        }
    }
    // Validate limit
    if (limit) {
        const limitNum = parseInt(limit);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
            res.status(400).json({
                error: 'Limit must be a number between 1 and 10000',
                code: 'INVALID_LIMIT'
            });
            return;
        }
    }
    next();
};
exports.validateMetricQuery = validateMetricQuery;
/**
 * Validate aggregation operation
 */
const validateAggregationQuery = (req, res, next) => {
    const { operation } = req.query;
    if (operation) {
        const validOperations = ['avg', 'sum', 'count', 'min', 'max', 'stddev'];
        if (!validOperations.includes(operation.toLowerCase())) {
            res.status(400).json({
                error: `Invalid aggregation operation. Must be one of: ${validOperations.join(', ')}`,
                code: 'INVALID_AGGREGATION_OPERATION'
            });
            return;
        }
    }
    next();
};
exports.validateAggregationQuery = validateAggregationQuery;
/**
 * Generic error handler middleware
 */
const errorHandler = (error, req, res, next) => {
    console.error('Metrics service error:', error);
    // Handle specific error types
    if (error.code === '23505') { // PostgreSQL unique constraint violation
        res.status(409).json({
            error: 'Duplicate metric entry',
            code: 'DUPLICATE_METRIC',
            timestamp: new Date().toISOString()
        });
        return;
    }
    if (error.code === '22P02') { // PostgreSQL invalid input syntax
        res.status(400).json({
            error: 'Invalid data format',
            code: 'INVALID_DATA_FORMAT',
            timestamp: new Date().toISOString()
        });
        return;
    }
    if (error.code === '08006' || error.code === '08003') { // PostgreSQL connection errors
        res.status(503).json({
            error: 'Database connection error',
            code: 'DATABASE_UNAVAILABLE',
            timestamp: new Date().toISOString()
        });
        return;
    }
    // Handle validation errors
    if (error.name === 'ValidationError') {
        res.status(400).json({
            error: error.message,
            code: 'VALIDATION_ERROR',
            timestamp: new Date().toISOString()
        });
        return;
    }
    // Default error response
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
    });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=validation.js.map