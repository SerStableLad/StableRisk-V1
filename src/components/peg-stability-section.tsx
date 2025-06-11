'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface PriceDataPoint {
  date: string
  price: number
  timestamp: number
}

interface DepegEvent {
  start_date: string
  end_date?: string
  max_deviation: number
  duration_days: number
  recovery_speed?: string
}

interface PegStabilityData {
  price_history: PriceDataPoint[]
  statistics: {
    average_deviation_percent: number
    depeg_incidents_count: number
    max_deviation_percent: number
    recovery_speed_hours?: number
    current_deviation_percent: number
  }
  depeg_events: DepegEvent[]
  is_currently_depegged: boolean
  days_since_depeg?: number
}

interface PegStabilitySectionProps {
  ticker: string
  data?: PegStabilityData | null
}

// Generate mock data for development
function generateMockData(ticker: string): PegStabilityData {
  const days = 365
  const priceHistory: PriceDataPoint[] = []
  
  // Generate realistic price data with occasional depeg events
  let basePrice = 1.0
  const now = new Date()
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    
    // Add some volatility but mostly stay near $1
    let price = basePrice
    
    // Simulate occasional depeg events
    if (ticker === 'USDT' && i < 50 && i > 40) {
      // USDT depeg simulation
      price = 0.985 + Math.random() * 0.02
    } else if (ticker === 'DAI' && i < 100 && i > 90) {
      // DAI depeg simulation  
      price = 1.015 + Math.random() * 0.01
    } else {
      // Normal fluctuation ±0.5%
      price = basePrice + (Math.random() - 0.5) * 0.01
    }
    
    priceHistory.push({
      date: date.toISOString().split('T')[0],
      price: Math.max(0.95, Math.min(1.05, price)),
      timestamp: date.getTime()
    })
  }
  
  // Calculate statistics
  const deviations = priceHistory.map(p => Math.abs(p.price - 1.0))
  const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length
  const maxDeviation = Math.max(...deviations)
  const currentDeviation = Math.abs(priceHistory[priceHistory.length - 1].price - 1.0)
  
  return {
    price_history: priceHistory,
    statistics: {
      average_deviation_percent: avgDeviation * 100,
      depeg_incidents_count: ticker === 'USDT' ? 2 : ticker === 'DAI' ? 1 : 0,
      max_deviation_percent: maxDeviation * 100,
      recovery_speed_hours: ticker === 'USDT' ? 12 : ticker === 'DAI' ? 6 : undefined,
      current_deviation_percent: currentDeviation * 100
    },
    depeg_events: ticker === 'USDT' ? [
      {
        start_date: '2024-10-15',
        end_date: '2024-10-16',
        max_deviation: 1.5,
        duration_days: 1,
        recovery_speed: '12 hours'
      }
    ] : [],
    is_currently_depegged: false,
    days_since_depeg: ticker === 'USDT' ? 45 : undefined
  }
}

// Custom tooltip for the chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const price = payload[0].value
    const deviation = ((price - 1.0) * 100).toFixed(3)
    const date = new Date(label).toLocaleDateString()
    
    return (
      <div className="bg-background border rounded-lg p-3 shadow-lg">
        <p className="font-medium">{date}</p>
        <p className="text-sm">
          <span className="text-muted-foreground">Price: </span>
          <span className={price > 1.005 || price < 0.995 ? 'text-yellow-600' : 'text-green-600'}>
            ${price.toFixed(4)}
          </span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Deviation: </span>
          <span className={Math.abs(parseFloat(deviation)) > 0.5 ? 'text-yellow-600' : 'text-green-600'}>
            {parseFloat(deviation) > 0 ? '+' : ''}{deviation}%
          </span>
        </p>
      </div>
    )
  }
  return null
}

export function PegStabilitySection({ ticker, data: propData }: PegStabilitySectionProps) {
  // Use mock data for development
  const data = propData || generateMockData(ticker)
  
  const formatDeviation = (deviation: number) => {
    return `${deviation >= 0 ? '+' : ''}${deviation.toFixed(3)}%`
  }
  
  const getDeviationColor = (deviation: number) => {
    const abs = Math.abs(deviation)
    if (abs > 1.0) return 'text-red-600'
    if (abs > 0.5) return 'text-yellow-600'
    return 'text-green-600'
  }
  
  const currentPrice = data.price_history[data.price_history.length - 1]?.price || 1.0
  
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Peg Stability Analysis</h2>
        <p className="text-muted-foreground">
          365-day price tracking and deviation analysis from $1.00 USD peg
        </p>
      </div>

      {/* Depeg Alert Banner */}
      {data.is_currently_depegged && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Depeg Alert</AlertTitle>
          <AlertDescription>
            {ticker} has been depegged for {data.days_since_depeg} days. 
            Monitor closely before using this stablecoin.
          </AlertDescription>
        </Alert>
      )}

      {/* Price Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>365-Day Price History</span>
            <Badge variant={Math.abs(currentPrice - 1.0) > 0.01 ? 'warning' : 'success'}>
              Current: ${currentPrice.toFixed(4)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.price_history}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis 
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value)
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  domain={['dataMin - 0.01', 'dataMax + 0.01']}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${value.toFixed(3)}`}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Reference line at $1.00 */}
                <ReferenceLine y={1.0} stroke="#10b981" strokeDasharray="2 2" />
                
                {/* Price line */}
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Current Deviation</p>
                <p className={`text-lg font-bold ${getDeviationColor(data.statistics.current_deviation_percent)}`}>
                  {formatDeviation(data.statistics.current_deviation_percent)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Deviation (365d)</p>
                <p className={`text-lg font-bold ${getDeviationColor(data.statistics.average_deviation_percent)}`}>
                  {formatDeviation(data.statistics.average_deviation_percent)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Depeg Incidents</p>
                <p className="text-lg font-bold">
                  {data.statistics.depeg_incidents_count}
                  <span className="text-sm text-muted-foreground ml-1">events</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Max Deviation</p>
                <p className={`text-lg font-bold ${getDeviationColor(data.statistics.max_deviation_percent)}`}>
                  {formatDeviation(data.statistics.max_deviation_percent)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Depeg Events History */}
      {data.depeg_events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Depeg Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.depeg_events.map((event, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">
                      {new Date(event.start_date).toLocaleDateString()} 
                      {event.end_date && ` - ${new Date(event.end_date).toLocaleDateString()}`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Max deviation: {event.max_deviation.toFixed(2)}% • Duration: {event.duration_days} days
                    </p>
                  </div>
                  {event.recovery_speed && (
                    <Badge variant="outline">
                      Recovered in {event.recovery_speed}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 