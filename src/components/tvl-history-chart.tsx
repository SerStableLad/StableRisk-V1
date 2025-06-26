"use client"

import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface TVLHistoryData {
  timestamp: number
  date: string
  tvl: number
  chain: string
}

interface ChainTVLHistory {
  chain: string
  data: TVLHistoryData[]
  color: string
}

interface TVLHistoryChartProps {
  data: ChainTVLHistory[]
  title?: string
}

// Blockchain color mapping for consistency
const BLOCKCHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA',
  bsc: '#F3BA2F',
  polygon: '#8247E5',
  arbitrum: '#28A0F0',
  optimism: '#FF0420',
  avalanche: '#E84142',
  solana: '#9945FF',
  base: '#0052FF',
  tron: '#FF060A',
  fantom: '#1969FF',
  // Fallback colors for other chains
  default: '#8B5CF6'
}

const TIME_RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 }
]

export function TVLHistoryChart({ data, title = "TVL History by Blockchain" }: TVLHistoryChartProps) {
  const [selectedRange, setSelectedRange] = useState(30)

  // Transform data for Recharts format
  const transformedData = React.useMemo(() => {
    if (!data || data.length === 0) return []

    // Get all unique timestamps across all chains
    const allTimestamps = new Set<number>()
    data.forEach(chain => {
      chain.data.forEach(point => allTimestamps.add(point.timestamp))
    })

    // Convert to array and sort
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b)

    // Filter by selected time range
    const cutoffDate = Date.now() - (selectedRange * 24 * 60 * 60 * 1000)
    const filteredTimestamps = sortedTimestamps.filter(ts => ts * 1000 >= cutoffDate)

    // Create chart data points
    return filteredTimestamps.map(timestamp => {
      const dataPoint: any = {
        timestamp,
        date: new Date(timestamp * 1000).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      }

      // Add TVL for each chain at this timestamp
      data.forEach(chain => {
        const chainData = chain.data.find(point => point.timestamp === timestamp)
        dataPoint[chain.chain] = chainData ? chainData.tvl : null
      })

      return dataPoint
    })
  }, [data, selectedRange])

  // Custom tooltip formatter
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-gray-700 capitalize">
              {entry.dataKey}: ${entry.value ? (entry.value / 1_000_000).toFixed(2) : '0'}M
            </span>
          </div>
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500 py-8">
            No historical TVL data available
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <div className="flex gap-1">
            {TIME_RANGES.map(range => (
              <Button
                key={range.days}
                variant={selectedRange === range.days ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedRange(range.days)}
                className="text-xs px-3 py-1"
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={transformedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="date" 
                stroke="#666"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="#666"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${(value / 1_000_000).toFixed(0)}M`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="line"
              />
              {data.map(chain => (
                <Line
                  key={chain.chain}
                  type="monotone"
                  dataKey={chain.chain}
                  stroke={BLOCKCHAIN_COLORS[chain.chain.toLowerCase()] || BLOCKCHAIN_COLORS.default}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  name={chain.chain.charAt(0).toUpperCase() + chain.chain.slice(1)}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
} 