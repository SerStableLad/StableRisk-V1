import { NextRequest, NextResponse } from 'next/server';
import DatabaseService from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    
    // Test basic connection
    const isHealthy = await DatabaseService.healthCheck();
    
    if (!isHealthy) {
      return NextResponse.json(
        { 
          status: 'unhealthy', 
          message: 'Database connection failed',
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      );
    }

    // Get connection pool information
    const connectionInfo = await DatabaseService.getConnectionInfo();
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'healthy',
      database: {
        connected: true,
        responseTime: `${responseTime}ms`,
        connectionPool: {
          total: connectionInfo.totalCount,
          idle: connectionInfo.idleCount,
          waiting: connectionInfo.waitingCount,
          active: connectionInfo.totalCount - connectionInfo.idleCount
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database health check error:', error);
    
    return NextResponse.json(
      { 
        status: 'unhealthy', 
        message: error instanceof Error ? error.message : 'Unknown database error',
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}