'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

export interface JobStatus {
  id: string
  type: string
  ticker: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout'
  priority: 'low' | 'normal' | 'high'
  createdAt: string
  startedAt?: string
  completedAt?: string
  duration: number
  retryCount: number
  maxRetries: number
  costEstimate?: number
  timeoutMs?: number
}

export interface JobStatusResponse {
  success: boolean
  job: JobStatus
  data?: any
  error?: string
  timestamp: number
}

export interface UseJobStatusOptions {
  pollingInterval?: number // ms, default 2000
  maxPollingDuration?: number // ms, default 60000 (1 minute)
  onComplete?: (data: any) => void
  onError?: (error: string) => void
  onTimeout?: () => void
  enablePolling?: boolean // default true
}

export interface UseJobStatusReturn {
  status: JobStatus | null
  data: any
  error: string | null
  isPolling: boolean
  isCompleted: boolean
  isFailed: boolean
  isTimeout: boolean
  progress: number // 0-100 based on duration vs expected completion
  retry: () => void
  stopPolling: () => void
  startPolling: () => void
}

export function useJobStatus(
  jobId: string | null,
  options: UseJobStatusOptions = {}
): UseJobStatusReturn {
  const {
    pollingInterval = 2000,
    maxPollingDuration = 60000,
    onComplete,
    onError,
    onTimeout,
    enablePolling = true
  } = options

  const [status, setStatus] = useState<JobStatus | null>(null)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [consecutiveErrors, setConsecutiveErrors] = useState(0)

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsPolling(false)
  }, [])

  const fetchJobStatus = useCallback(async () => {
    if (!jobId) return

    try {
      const response = await fetch(`/api/jobs/${jobId}`)
      
      // Handle 404 errors specifically to prevent infinite polling
      if (response.status === 404) {
        setConsecutiveErrors(prev => prev + 1)
        setError('Job not found or expired')
        onError?.('Job not found or expired')
        stopPolling()
        return
      }

      const result: JobStatusResponse = await response.json()

      if (result.success) {
        setStatus(result.job)
        setError(null)
        setConsecutiveErrors(0) // Reset error counter on success

        // If job completed, store data and stop polling
        if (result.job.status === 'completed') {
          if (result.data) {
            setData(result.data)
            onComplete?.(result.data)
          }
          stopPolling()
        } else if (result.job.status === 'failed') {
          setError(result.error || 'Job failed')
          onError?.(result.error || 'Job failed')
          stopPolling()
        } else if (result.job.status === 'timeout') {
          setError('Job timed out')
          onTimeout?.()
          stopPolling()
        }
      } else {
        setConsecutiveErrors(prev => prev + 1)
        setError(result.error || 'Failed to fetch job status')
        onError?.(result.error || 'Failed to fetch job status')
        stopPolling()
      }
    } catch (err: any) {
      setConsecutiveErrors(prev => prev + 1)
      setError(err.message)
      onError?.(err.message)
      stopPolling()
    }
  }, [jobId, onComplete, onError, onTimeout, stopPolling])

  const startPolling = useCallback(() => {
    if (!jobId || !enablePolling) return

    setIsPolling(true)
    setStartTime(Date.now())
    setError(null)
    setConsecutiveErrors(0)

    // Initial fetch
    fetchJobStatus()

    // Set up polling interval
    pollingIntervalRef.current = setInterval(fetchJobStatus, pollingInterval)

    // Set up max polling timeout
    timeoutRef.current = setTimeout(() => {
      setError('Polling timeout exceeded')
      onTimeout?.()
      stopPolling()
    }, maxPollingDuration)
  }, [jobId, enablePolling, fetchJobStatus, pollingInterval, maxPollingDuration, onTimeout, stopPolling])

  const retry = useCallback(() => {
    setError(null)
    setData(null)
    setStatus(null)
    setConsecutiveErrors(0)
    startPolling()
  }, [startPolling])

  // Auto-start polling when jobId changes
  useEffect(() => {
    if (jobId && enablePolling) {
      startPolling()
    } else {
      stopPolling()
    }

    return () => stopPolling()
  }, [jobId, enablePolling, startPolling, stopPolling])

  // Calculate progress based on duration and status
  const progress = useMemo(() => {
    if (!status || !startTime) return 0

    const now = Date.now()
    const elapsed = now - startTime

    // Estimate completion times based on job type
    const estimatedDuration = {
      'audit_discovery': 10000, // 10s
      'transparency_discovery': 5000, // 5s  
      'detailed_analysis': 15000, // 15s
      'ai_analysis': 20000, // 20s
    }[status.type] || 10000

    if (status.status === 'completed') return 100
    if (status.status === 'failed' || status.status === 'timeout') return 0

    const progressPercent = Math.min((elapsed / estimatedDuration) * 100, 95)
    return Math.max(progressPercent, 5) // Always show at least 5% progress
  }, [status, startTime])

  return {
    status,
    data,
    error,
    isPolling,
    isCompleted: status?.status === 'completed',
    isFailed: status?.status === 'failed',
    isTimeout: status?.status === 'timeout',
    progress,
    retry,
    stopPolling,
    startPolling
  }
}

// Hook for managing multiple job statuses
export interface UseMultipleJobsOptions {
  pollingInterval?: number
  maxPollingDuration?: number
  onAllComplete?: (results: Record<string, any>) => void
  onAnyError?: (jobId: string, error: string) => void
}

export interface UseMultipleJobsReturn {
  jobStatuses: Record<string, JobStatus | null>
  jobData: Record<string, any>
  jobErrors: Record<string, string | null>
  completedCount: number
  totalCount: number
  overallProgress: number
  allCompleted: boolean
  hasErrors: boolean
  retry: (jobId?: string) => void
  stopAll: () => void
}

export function useMultipleJobs(
  jobIds: string[],
  options: UseMultipleJobsOptions = {}
): UseMultipleJobsReturn {
  const {
    pollingInterval = 2000,
    maxPollingDuration = 60000,
    onAllComplete,
    onAnyError
  } = options

  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus | null>>({})
  const [jobData, setJobData] = useState<Record<string, any>>({})
  const [jobErrors, setJobErrors] = useState<Record<string, string | null>>({})
  const [isPolling, setIsPolling] = useState(false)

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const completedCount = Object.values(jobStatuses).filter(
    status => status?.status === 'completed'
  ).length

  const totalCount = jobIds.length
  const overallProgress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const allCompleted = completedCount === totalCount && totalCount > 0
  const hasErrors = Object.values(jobErrors).some(error => error !== null)

  const fetchAllJobStatuses = useCallback(async () => {
    if (jobIds.length === 0) return

    const promises = jobIds.map(async (jobId) => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`)
        
        // Handle 404 errors specifically to prevent infinite polling
        if (response.status === 404) {
          return { jobId, error: 'Job not found or expired' }
        }

        const result: JobStatusResponse = await response.json()
        return { jobId, result }
      } catch (error: any) {
        return { jobId, error: error.message }
      }
    })

    const results = await Promise.allSettled(promises)
    const newStatuses: Record<string, JobStatus | null> = {}
    const newData: Record<string, any> = {}
    const newErrors: Record<string, string | null> = {}

    results.forEach((result, index) => {
      const jobId = jobIds[index]
      
      if (result.status === 'fulfilled') {
        const { result: jobResult, error } = result.value
        
        if (error) {
          newErrors[jobId] = error
          onAnyError?.(jobId, error)
        } else if (jobResult && jobResult.success) {
          newStatuses[jobId] = jobResult.job
          newErrors[jobId] = null

          if (jobResult.job.status === 'completed' && jobResult.data) {
            newData[jobId] = jobResult.data
          } else if (jobResult.job.status === 'failed') {
            newErrors[jobId] = jobResult.error || 'Job failed'
            onAnyError?.(jobId, jobResult.error || 'Job failed')
          } else if (jobResult.job.status === 'timeout') {
            newErrors[jobId] = 'Job timed out'
            onAnyError?.(jobId, 'Job timed out')
          }
        } else if (jobResult) {
          newErrors[jobId] = jobResult.error || 'Failed to fetch job status'
          onAnyError?.(jobId, jobResult.error || 'Failed to fetch job status')
        } else {
          newErrors[jobId] = 'Failed to fetch job status'
          onAnyError?.(jobId, 'Failed to fetch job status')
        }
      } else {
        newErrors[jobId] = result.reason?.message || 'Unknown error'
        onAnyError?.(jobId, result.reason?.message || 'Unknown error')
      }
    })

    setJobStatuses(prev => ({ ...prev, ...newStatuses }))
    setJobData(prev => ({ ...prev, ...newData }))
    setJobErrors(prev => ({ ...prev, ...newErrors }))
  }, [jobIds, onAnyError])

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsPolling(false)
  }, [])

  const startPolling = useCallback(() => {
    if (jobIds.length === 0) return

    setIsPolling(true)
    
    // Initial fetch
    fetchAllJobStatuses()

    // Set up polling interval
    pollingIntervalRef.current = setInterval(() => {
      fetchAllJobStatuses()
    }, pollingInterval)

    // Set up max polling timeout
    timeoutRef.current = setTimeout(() => {
      stopPolling()
    }, maxPollingDuration)
  }, [jobIds.length, fetchAllJobStatuses, pollingInterval, maxPollingDuration, stopPolling])

  const retry = useCallback((jobId?: string) => {
    if (jobId) {
      setJobErrors(prev => ({ ...prev, [jobId]: null }))
      setJobData(prev => ({ ...prev, [jobId]: null }))
      setJobStatuses(prev => ({ ...prev, [jobId]: null }))
    } else {
      // Reset all failed jobs
      setJobErrors({})
      setJobData({})
      setJobStatuses({})
    }
    
    if (!isPolling) {
      startPolling()
    }
  }, [isPolling, startPolling])

  const stopAll = useCallback(() => {
    stopPolling()
  }, [stopPolling])

  // Start polling when jobIds change
  useEffect(() => {
    if (jobIds.length > 0) {
      startPolling()
    } else {
      stopPolling()
    }

    return () => stopPolling()
  }, [jobIds.length, startPolling, stopPolling])

  // Check if all jobs completed and stop polling
  useEffect(() => {
    if (allCompleted && isPolling) {
      stopPolling()
      onAllComplete?.(jobData)
    }
  }, [allCompleted, isPolling, jobData, onAllComplete, stopPolling])

  // Clean up on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  return {
    jobStatuses,
    jobData,
    jobErrors,
    completedCount,
    totalCount,
    overallProgress,
    allCompleted,
    hasErrors,
    retry,
    stopAll
  }
}