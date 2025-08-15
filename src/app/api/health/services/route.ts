/**
 * Health Services API Route - Task 8 Implementation
 * 
 * GET endpoint for retrieving comprehensive service health information.
 * Integrates with ServiceHealthMonitor and EnhancedServiceIntegration
 * to provide system health, services status, and timestamp information.
 * 
 * Features:
 * - Concurrent data fetching using Promise.all for optimal performance
 * - Comprehensive error handling with 500 status codes
 * - Proper JSON response structure following Next.js 13+ patterns
 * - TypeScript type safety with strict mode compliance
 * - Integration with monitoring services following singleton pattern
 */

import { NextRequest, NextResponse } from 'next/server';
import { ServiceHealthMonitor, SystemHealthStatus } from '@/lib/monitoring/service-health-monitor';
import { EnhancedServiceIntegration, ServicesStatus } from '@/lib/services/enhanced-service-integration';

export interface HealthServicesResponse {
  system: SystemHealthStatus;
  services: ServicesStatus;
  timestamp: string;
}

export interface HealthServicesErrorResponse {
  error: string;
  message: string;
  timestamp: string;
}

/**
 * GET /api/health/services
 * 
 * Returns comprehensive service health information including:
 * - System health status from ServiceHealthMonitor
 * - Individual services status from EnhancedServiceIntegration
 * - Current timestamp for response timing
 * 
 * Response format:
 * - 200: Success with health data
 * - 500: Internal server error with error details
 */
export async function GET(request: NextRequest): Promise<NextResponse<HealthServicesResponse | HealthServicesErrorResponse>> {
  try {
    // Get singleton instances for health monitoring services
    const healthMonitor = ServiceHealthMonitor.getInstance();
    const serviceIntegration = EnhancedServiceIntegration.getInstance();

    // Fetch system health and services status concurrently using Promise.all
    // This optimizes performance by running both operations in parallel
    const [systemHealth, servicesStatus] = await Promise.all([
      // ServiceHealthMonitor.getSystemHealth() is synchronous, so we wrap it in Promise.resolve
      Promise.resolve(healthMonitor.getSystemHealth()),
      // EnhancedServiceIntegration.getServicesStatus() is async
      serviceIntegration.getServicesStatus()
    ]);

    // Construct the successful response
    const response: HealthServicesResponse = {
      system: systemHealth,
      services: servicesStatus,
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    // Comprehensive error handling with logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = error instanceof Error ? error.stack : undefined;

    // Log the error for debugging and monitoring
    console.error('Health services API error:', {
      message: errorMessage,
      stack: errorDetails,
      timestamp: new Date().toISOString(),
      endpoint: '/api/health/services'
    });

    // Return structured error response with 500 status
    const errorResponse: HealthServicesErrorResponse = {
      error: 'Internal Server Error',
      message: `Failed to fetch health information: ${errorMessage}`,
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(errorResponse, {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}