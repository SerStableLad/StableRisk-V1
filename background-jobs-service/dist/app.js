"use strict";
/**
 * Background Jobs Service Main Application
 *
 * Legacy entry point - now delegates to the enhanced server implementation
 * This file is maintained for backward compatibility
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Import the new server implementation
const server_1 = __importDefault(require("./app/server"));
// For backward compatibility, export the same interface
class BackgroundJobsService extends server_1.default {
}
// Start the service if this file is run directly
if (require.main === module) {
    const service = new BackgroundJobsService();
    service.start().catch((error) => {
        console.error('Service startup failed', error);
        process.exit(1);
    });
}
exports.default = BackgroundJobsService;
//# sourceMappingURL=app.js.map