import { Request, Response, NextFunction } from 'express';
export interface ValidatedMetricRequest extends Request {
    body: {
        name: string;
        value: number;
        labels?: Record<string, string>;
        timestamp?: string;
    };
}
export interface ValidatedBatchMetricRequest extends Request {
    body: {
        metrics: Array<{
            name: string;
            value: number;
            labels?: Record<string, string>;
            timestamp?: string;
        }>;
    };
}
/**
 * Validate single metric recording request
 */
export declare const validateMetricRequest: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Validate batch metrics recording request
 */
export declare const validateBatchMetricRequest: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Validate query parameters for metric retrieval
 */
export declare const validateMetricQuery: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Validate aggregation operation
 */
export declare const validateAggregationQuery: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Generic error handler middleware
 */
export declare const errorHandler: (error: any, req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=validation.d.ts.map