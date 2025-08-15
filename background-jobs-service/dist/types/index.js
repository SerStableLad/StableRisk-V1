"use strict";
/**
 * Background Jobs Service - Core Type Definitions
 *
 * Comprehensive TypeScript interfaces for job management,
 * queue operations, and service configuration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerError = exports.QueueError = exports.JobError = exports.BackoffStrategy = exports.JobPriority = exports.JobStatus = void 0;
var JobStatus;
(function (JobStatus) {
    JobStatus["PENDING"] = "pending";
    JobStatus["PROCESSING"] = "processing";
    JobStatus["COMPLETED"] = "completed";
    JobStatus["FAILED"] = "failed";
    JobStatus["DELAYED"] = "delayed";
    JobStatus["CANCELLED"] = "cancelled";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
var JobPriority;
(function (JobPriority) {
    JobPriority["LOW"] = "low";
    JobPriority["MEDIUM"] = "medium";
    JobPriority["HIGH"] = "high";
})(JobPriority || (exports.JobPriority = JobPriority = {}));
var BackoffStrategy;
(function (BackoffStrategy) {
    BackoffStrategy["FIXED"] = "fixed";
    BackoffStrategy["EXPONENTIAL"] = "exponential";
})(BackoffStrategy || (exports.BackoffStrategy = BackoffStrategy = {}));
// Error types
class JobError extends Error {
    constructor(message, jobId, cause) {
        super(message);
        this.jobId = jobId;
        this.cause = cause;
        this.name = 'JobError';
    }
}
exports.JobError = JobError;
class QueueError extends Error {
    constructor(message, operation, cause) {
        super(message);
        this.operation = operation;
        this.cause = cause;
        this.name = 'QueueError';
    }
}
exports.QueueError = QueueError;
class WorkerError extends Error {
    constructor(message, workerId, cause) {
        super(message);
        this.workerId = workerId;
        this.cause = cause;
        this.name = 'WorkerError';
    }
}
exports.WorkerError = WorkerError;
//# sourceMappingURL=index.js.map