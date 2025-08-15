/**
 * Background Jobs General API Routes
 * 
 * POST /api/background-jobs - Submit new job
 * GET /api/background-jobs - Get queue statistics and job list
 */

import { NextRequest, NextResponse } from 'next/server'
import { backgroundJobsClient } from '@/lib/clients/background-jobs-client'
import { JobPriority } from '../../../background-jobs-service/src/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data, options = {} } = body

    if (!type || !data) {
      return NextResponse.json(
        { error: 'Job type and data are required' },
        { status: 400 }
      )
    }

    console.log(`[BackgroundJobsAPI] Submitting job of type: ${type}`)

    // Validate job type
    const allowedTypes = [
      'collect-stablecoin-data',
      'analyze-transparency', 
      'invalidate-cache',
      'aggregate-metrics'
    ]

    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        { 
          error: 'Invalid job type',
          allowedTypes
        },
        { status: 400 }
      )
    }

    // Submit job using appropriate convenience method
    let jobId: string

    switch (type) {
      case 'collect-stablecoin-data':
        jobId = await backgroundJobsClient.submitStablecoinDataJob(
          data.ticker,
          data.sources || ['coingecko'],
          data.urgent || false,
          options
        )
        break

      case 'analyze-transparency':
        jobId = await backgroundJobsClient.submitTransparencyAnalysisJob(
          data.ticker,
          data.url,
          data.schema,
          options
        )
        break

      case 'invalidate-cache':
        jobId = await backgroundJobsClient.submitCacheInvalidationJob(
          data.pattern,
          data.keys,
          options
        )
        break

      case 'aggregate-metrics':
        jobId = await backgroundJobsClient.submitMetricsAggregationJob(
          new Date(data.startTime),
          new Date(data.endTime),
          data.aggregationLevel || 'hour',
          options
        )
        break

      default:
        // Fallback to generic submission
        jobId = await backgroundJobsClient.submitJob(type, data, options)
    }

    console.log(`[BackgroundJobsAPI] Job submitted successfully: ${jobId}`)

    return NextResponse.json({
      success: true,
      jobId,
      type,
      message: 'Job submitted successfully'
    })

  } catch (error) {
    console.error('[BackgroundJobsAPI] Error submitting job:', error)
    
    return NextResponse.json(
      {
        error: 'Failed to submit job',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'stats'
    
    if (action === 'stats') {
      console.log('[BackgroundJobsAPI] Getting queue statistics')
      
      const statistics = await backgroundJobsClient.getQueueStatistics()
      
      return NextResponse.json({
        success: true,
        statistics: statistics || {
          pending: 0,
          processing: 0,
          delayed: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
          total: 0,
          processingRate: 0,
          averageProcessingTime: 0,
          errorRate: 0
        }
      })
      
    } else if (action === 'jobs') {
      // Query jobs with filters
      const type = searchParams.get('type')
      const status = searchParams.get('status')
      const limit = parseInt(searchParams.get('limit') || '20')
      const offset = parseInt(searchParams.get('offset') || '0')

      console.log(`[BackgroundJobsAPI] Querying jobs: type=${type}, status=${status}, limit=${limit}, offset=${offset}`)

      const jobs = await backgroundJobsClient.queryJobs({
        type: type || undefined,
        status: status ? [status as any] : undefined,
        limit,
        offset,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      })

      return NextResponse.json({
        success: true,
        jobs: jobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          createdAt: job.createdAt,
          scheduledFor: job.scheduledFor,
          processingStartedAt: job.processingStartedAt,
          completedAt: job.completedAt,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          error: job.error,
          processingTimeMs: job.processingTimeMs
        })),
        total: jobs.length,
        limit,
        offset
      })

    } else if (action === 'health') {
      console.log('[BackgroundJobsAPI] Checking background jobs service health')
      
      const healthResult = await backgroundJobsClient.healthCheck()
      
      return NextResponse.json({
        success: true,
        health: healthResult
      })

    } else {
      return NextResponse.json(
        { 
          error: 'Invalid action',
          allowedActions: ['stats', 'jobs', 'health']
        },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('[BackgroundJobsAPI] Error in GET request:', error)
    
    return NextResponse.json(
      {
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}