/**
 * Background Jobs Service Main Application
 * 
 * Legacy entry point - now delegates to the enhanced server implementation
 * This file is maintained for backward compatibility
 */

// Import the new server implementation
import BackgroundJobsServer from './app/server';

// For backward compatibility, export the same interface
class BackgroundJobsService extends BackgroundJobsServer {
  // Maintain the same public interface
}

// Start the service if this file is run directly
if (require.main === module) {
  const service = new BackgroundJobsService();
  
  service.start().catch((error) => {
    console.error('Service startup failed', error);
    process.exit(1);
  });
}

export default BackgroundJobsService;