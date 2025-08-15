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
export declare class BackgroundJobsServer {
    private app;
    private jobProcessor;
    private jobQueue;
    private database;
    private handlerRegistry;
    private isShuttingDown;
    private server;
    constructor();
    /**
     * Setup Express middleware stack
     */
    private setupMiddleware;
}
//# sourceMappingURL=server.d.ts.map