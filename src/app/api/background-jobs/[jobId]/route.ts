/**
 * Background Jobs Status API Route
 * 
 * GET /api/background-jobs/[jobId] - Get job status
 * DELETE /api/background-jobs/[jobId] - Cancel job
 */

import { NextRequest, NextResponse } from 'next/server'
import { backgroundJobsClient } from '@/lib/clients/background-jobs-client'

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    console.log(`[BackgroundJobsAPI] Getting status for job ${jobId}`)

    const job = await backgroundJobsClient.getJobStatus(jobId)

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      job: {
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
        result: job.result,
        cost: job.cost,
        processingTimeMs: job.processingTimeMs
      }
    })
  } catch (error) {
    console.error('[BackgroundJobsAPI] Error getting job status:', error)
    
    return NextResponse.json(
      {
        error: 'Failed to get job status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    console.log(`[BackgroundJobsAPI] Cancelling job ${jobId}`)

    const success = await backgroundJobsClient.cancelJob(jobId)

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to cancel job or job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Job ${jobId} cancelled successfully`
    })
  } catch (error) {
    console.error('[BackgroundJobsAPI] Error cancelling job:', error)
    
    return NextResponse.json(
      {
        error: 'Failed to cancel job',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}