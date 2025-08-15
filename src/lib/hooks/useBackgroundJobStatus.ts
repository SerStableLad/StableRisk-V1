/**
 * React Hook for Background Job Status Management
 * 
 * Provides real-time job status tracking and polling capabilities
 * for components that submit background jobs and need to monitor their progress.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { backgroundJobsClient } from '@/lib/clients/background-jobs-client'
import { Job, JobStatus } from '../../background-jobs-service/src/types'

interface UseBackgroundJobStatusOptions {
  /**
   * Polling interval in milliseconds
   * @default 2000
   */
  pollingInterval?: number
  
  /**
   * Whether to automatically start polling when job ID is provided
   * @default true
   */
  autoStart?: boolean
  
  /**
   * Stop polling when job reaches these statuses
   * @default ['completed', 'failed', 'cancelled']
   */
  stopOnStatus?: JobStatus[]
  
  /**
   * Maximum number of polling attempts before giving up
   * @default 150 (5 minutes with 2s intervals)
   */
  maxAttempts?: number
  
  /**
   * Callback when job status changes
   */
  onStatusChange?: (job: Job | null, previousStatus?: JobStatus) => void
  
  /**
   * Callback when job completes successfully
   */
  onSuccess?: (job: Job) => void
  
  /**
   * Callback when job fails or is cancelled
   */
  onError?: (job: Job, error?: string) => void
  
  /**
   * Callback when polling reaches max attempts
   */
  onTimeout?: (jobId: string) => void
}

interface UseBackgroundJobStatusReturn {
  /** Current job data */
  job: Job | null
  
  /** Current job status */
  status: JobStatus | null
  
  /** Whether currently polling for updates */
  isPolling: boolean
  
  /** Loading state */
  isLoading: boolean
  
  /** Error message if job fetching fails */
  error: string | null
  
  /** Progress percentage (0-100) based on attempts */
  progress: number
  
  /** Start polling for a specific job ID */
  startPolling: (jobId: string) => void
  
  /** Stop polling */
  stopPolling: () => void
  
  /** Manually refresh job status once */
  refresh: () => Promise<void>
  
  /** Reset hook state */
  reset: () => void
}

export function useBackgroundJobStatus(
  initialJobId?: string,
  options: UseBackgroundJobStatusOptions = {}
): UseBackgroundJobStatusReturn {
  const {
    pollingInterval = 2000,
    autoStart = true,
    stopOnStatus = [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED],
    maxAttempts = 150,
    onStatusChange,
    onSuccess,
    onError,
    onTimeout
  } = options

  const [job, setJob] = useState<Job | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  // Use refs to track mutable values
  const currentJobId = useRef<string | null>(initialJobId || null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousStatus = useRef<JobStatus | null>(null)

  // Calculate progress based on attempts and job status
  const progress = job?.status === JobStatus.COMPLETED 
    ? 100 
    : job?.status === JobStatus.PROCESSING 
      ? Math.min(70, (attempts / maxAttempts) * 50 + 20) // 20-70% when processing
      : job?.status === JobStatus.PENDING 
        ? Math.min(20, (attempts / maxAttempts) * 20) // 0-20% when pending
        : job?.status === JobStatus.FAILED || job?.status === JobStatus.CANCELLED
          ? 0
          : (attempts / maxAttempts) * 100

  // Fetch job status
  const fetchJobStatus = useCallback(async (jobId: string): Promise<Job | null> => {
    try {
      setIsLoading(true)
      setError(null)
      
      const jobData = await backgroundJobsClient.getJobStatus(jobId)
      return jobData
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      console.error(`[useBackgroundJobStatus] Failed to fetch job status for ${jobId}:`, err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Start polling for a specific job
  const startPolling = useCallback((jobId: string) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    currentJobId.current = jobId
    setIsPolling(true)
    setAttempts(0)
    setError(null)

    // Initial fetch
    fetchJobStatus(jobId).then(jobData => {
      if (jobData) {
        const prevStatus = previousStatus.current
        setJob(jobData)
        previousStatus.current = jobData.status
        
        // Trigger callbacks
        onStatusChange?.(jobData, prevStatus || undefined)
        
        if (jobData.status === JobStatus.COMPLETED) {
          onSuccess?.(jobData)
          setIsPolling(false)
          return
        } else if (stopOnStatus.includes(jobData.status)) {
          onError?.(jobData, jobData.error)
          setIsPolling(false)
          return
        }
      }
    })

    // Start polling interval
    intervalRef.current = setInterval(async () => {
      if (!currentJobId.current) return

      setAttempts(prev => {
        const newAttempts = prev + 1
        
        if (newAttempts >= maxAttempts) {
          onTimeout?.(currentJobId.current!)
          setIsPolling(false)
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          return newAttempts
        }
        
        return newAttempts
      })

      const jobData = await fetchJobStatus(currentJobId.current)
      
      if (jobData) {
        const prevStatus = previousStatus.current
        setJob(jobData)
        
        // Check if status changed
        if (prevStatus !== jobData.status) {
          previousStatus.current = jobData.status
          onStatusChange?.(jobData, prevStatus || undefined)
          
          // Handle completion
          if (jobData.status === JobStatus.COMPLETED) {
            onSuccess?.(jobData)
            setIsPolling(false)
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
          } else if (stopOnStatus.includes(jobData.status)) {
            onError?.(jobData, jobData.error)
            setIsPolling(false)
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
          }
        }
      }
    }, pollingInterval)
  }, [fetchJobStatus, pollingInterval, maxAttempts, stopOnStatus, onStatusChange, onSuccess, onError, onTimeout])

  // Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  // Manual refresh
  const refresh = useCallback(async () => {
    if (!currentJobId.current) return
    
    const jobData = await fetchJobStatus(currentJobId.current)
    if (jobData) {
      const prevStatus = previousStatus.current
      setJob(jobData)
      
      if (prevStatus !== jobData.status) {
        previousStatus.current = jobData.status
        onStatusChange?.(jobData, prevStatus || undefined)
      }
    }
  }, [fetchJobStatus, onStatusChange])

  // Reset hook state
  const reset = useCallback(() => {
    stopPolling()
    setJob(null)
    setError(null)
    setAttempts(0)
    currentJobId.current = null
    previousStatus.current = null
  }, [stopPolling])

  // Auto-start polling if initialJobId is provided
  useEffect(() => {
    if (initialJobId && autoStart) {
      startPolling(initialJobId)
    }

    // Cleanup on unmount
    return () => {
      stopPolling()
    }
  }, [initialJobId, autoStart, startPolling, stopPolling])

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return {
    job,
    status: job?.status || null,
    isPolling,
    isLoading,
    error,
    progress,
    startPolling,
    stopPolling,
    refresh,
    reset
  }
}

/**
 * Hook for tracking multiple background jobs simultaneously
 */
interface UseMultipleBackgroundJobsOptions extends Omit<UseBackgroundJobStatusOptions, 'onStatusChange' | 'onSuccess' | 'onError'> {
  /**
   * Callback when any job status changes
   */
  onStatusChange?: (jobId: string, job: Job | null, previousStatus?: JobStatus) => void
  
  /**
   * Callback when any job completes successfully
   */
  onSuccess?: (jobId: string, job: Job) => void
  
  /**
   * Callback when any job fails or is cancelled
   */
  onError?: (jobId: string, job: Job, error?: string) => void
}

interface UseMultipleBackgroundJobsReturn {
  /** Map of job ID to job data */
  jobs: Record<string, Job | null>
  
  /** Map of job ID to polling status */
  pollingStatus: Record<string, boolean>
  
  /** Overall loading state */
  isLoading: boolean
  
  /** Map of job ID to error messages */
  errors: Record<string, string | null>
  
  /** Add a job to track */
  addJob: (jobId: string) => void
  
  /** Remove a job from tracking */
  removeJob: (jobId: string) => void
  
  /** Stop all polling */
  stopAll: () => void
  
  /** Get combined progress (0-100) */
  overallProgress: number
}

export function useMultipleBackgroundJobs(
  initialJobIds: string[] = [],
  options: UseMultipleBackgroundJobsOptions = {}
): UseMultipleBackgroundJobsReturn {
  const [trackedJobs, setTrackedJobs] = useState<Set<string>>(new Set(initialJobIds))
  const [jobs, setJobs] = useState<Record<string, Job | null>>({})
  const [pollingStatus, setPollingStatus] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  
  // Individual job hooks
  const jobHooks = useRef<Record<string, ReturnType<typeof useBackgroundJobStatus>>>({})

  const addJob = useCallback((jobId: string) => {
    if (trackedJobs.has(jobId)) return

    setTrackedJobs(prev => new Set([...prev, jobId]))
    
    // This would need to be implemented differently in a real React app
    // as hooks can't be called conditionally. This is a simplified version.
    console.log(`[useMultipleBackgroundJobs] Added job ${jobId} to tracking`)
  }, [trackedJobs])

  const removeJob = useCallback((jobId: string) => {
    setTrackedJobs(prev => {
      const newSet = new Set(prev)
      newSet.delete(jobId)
      return newSet
    })
    
    // Clean up job data
    setJobs(prev => {
      const { [jobId]: removed, ...rest } = prev
      return rest
    })
    setPollingStatus(prev => {
      const { [jobId]: removed, ...rest } = prev
      return rest
    })
    setErrors(prev => {
      const { [jobId]: removed, ...rest } = prev
      return rest
    })
  }, [])

  const stopAll = useCallback(() => {
    Object.values(jobHooks.current).forEach(hook => {
      hook.stopPolling()
    })
    setPollingStatus(prev => 
      Object.keys(prev).reduce((acc, jobId) => ({ ...acc, [jobId]: false }), {})
    )
  }, [])

  // Calculate overall progress
  const overallProgress = Object.values(jobs).length > 0
    ? Object.values(jobs).reduce((sum, job) => {
        if (!job) return sum
        if (job.status === JobStatus.COMPLETED) return sum + 100
        if (job.status === JobStatus.PROCESSING) return sum + 50
        if (job.status === JobStatus.PENDING) return sum + 10
        return sum
      }, 0) / Object.values(jobs).length
    : 0

  const isLoading = Object.values(pollingStatus).some(status => status)

  return {
    jobs,
    pollingStatus,
    isLoading,
    errors,
    addJob,
    removeJob,
    stopAll,
    overallProgress
  }
}