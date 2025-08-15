/**
 * Request Validation Utilities
 *
 * Provides validation middleware and schemas for API endpoints
 */
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
export declare const schemas: {
    jobSubmission: Joi.ObjectSchema<any>;
    bulkJobSubmission: Joi.ObjectSchema<any>;
    jobQuery: Joi.ObjectSchema<any>;
    jobCleanup: Joi.ObjectSchema<any>;
    workerScaling: Joi.ObjectSchema<any>;
    workerRestart: Joi.ObjectSchema<any>;
    queueOperation: Joi.ObjectSchema<any>;
    queueClear: Joi.ObjectSchema<any>;
    maintenanceMode: Joi.ObjectSchema<any>;
};
/**
 * Validation middleware factory
 */
export declare function validateRequest(schema: Joi.Schema, target?: 'body' | 'query' | 'params'): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Job ID parameter validation
 */
export declare function validateJobId(req: Request, res: Response, next: NextFunction): void;
/**
 * Content-Type validation middleware
 */
export declare function requireJsonContent(req: Request, res: Response, next: NextFunction): void;
/**
 * Request size validation middleware
 */
export declare function validateRequestSize(maxSizeBytes?: number): (req: Request, res: Response, next: NextFunction) => void;
/**
 * API key validation middleware
 */
export declare function validateApiKey(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=validation.d.ts.map