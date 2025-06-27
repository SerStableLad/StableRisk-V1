'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'


interface ProgressiveDashboardProps {
  ticker: string
}

export default function ProgressiveDashboard({ ticker }: ProgressiveDashboardProps) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadTime, setLoadTime] = useState<number | null>(null)

  useEffect(() => {
    const abortController = new AbortController()

    const fetchData = async () => {
      try {
        const start = performance.now()
        const response = await fetch(`/api/stablecoin/${ticker}/progressive`, {
          signal: abortController.signal
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        const time = performance.now() - start
        setLoadTime(time)

        if (result.success) {
          setData(result.data)
        } else {
          setError(result.error || 'Failed to load data')
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return // Request was cancelled
        }
        setError(err.message)
      }
    }

    fetchData()

    return () => {
      abortController.abort()
    }
  }, [ticker])

  if (error) {
    return (
      <Alert>
        <AlertDescription>Error: {error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {data.basic_info?.name} ({data.basic_info?.symbol?.toUpperCase()})
        </h1>
        {loadTime && (
          <Badge variant="outline">
            Loaded in {loadTime.toFixed(0)}ms
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Price Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Current Price</p>
              <p className="text-2xl font-bold">
                ${data.basic_info?.current_price?.toFixed(4) || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">24h Change</p>
              <p className="text-lg font-semibold">
                {data.basic_info?.price_change_percentage_24h?.toFixed(2) || 'N/A'}%
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Peg Status</p>
              <Badge variant={data.risk_summary?.peg_stability === 'stable' ? 'default' : 'destructive'}>
                {data.risk_summary?.peg_stability || 'Unknown'}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Risk Level</p>
              <p className="text-lg font-semibold">
                {data.risk_summary?.overall_risk || 'Calculating...'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 