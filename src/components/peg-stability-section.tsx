'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Brush, ComposedChart, Bar } from 'recharts'
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface PriceDataPoint {
  date: string
  price: number
  timestamp: number
  isDepeg?: boolean
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
  const basePrice = 1.0
  const now = new Date()
  
  // Define depeg periods based on actual events
  const depegPeriods = ticker === 'USDT0' ? [
    { start: '2024-10-15', end: '2024-10-16' },
    { start: '2024-03-11', end: '2024-03-12' }
  ] : ticker === 'DAI' ? [
    { start: '2024-08-20', end: '2024-08-21' }
  ] : []
  
  for (let i = days; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    // Check if this date is within a depeg period
    const isDepegPeriod = depegPeriods.some(period => 
      dateStr >= period.start && dateStr <= period.end
    )
    
    // Add some volatility but mostly stay near $1
    let price = basePrice
    
    if (isDepegPeriod) {
      // Simulate depeg events with more significant deviation
      if (ticker === 'USDT0') {
        price = 0.985 + Math.random() * 0.02 // 1.5-3.5% below peg
      } else if (ticker === 'DAI') {
        price = 1.012 + Math.random() * 0.008 // 1.2-2.0% above peg
      }
    } else {
      // Normal fluctuation ±0.5%
      price = basePrice + (Math.random() - 0.5) * 0.01
    }
    
    priceHistory.push({
      date: dateStr,
      price: Math.max(0.95, Math.min(1.05, price)),
      timestamp: date.getTime(),
      isDepeg: isDepegPeriod
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
      depeg_incidents_count: ticker === 'USDT0' ? 2 : ticker === 'DAI' ? 1 : 0,
      max_deviation_percent: maxDeviation * 100,
              recovery_speed_hours: ticker === 'USDT0' ? 12 : ticker === 'DAI' ? 6 : undefined,
      current_deviation_percent: currentDeviation * 100
    },
          depeg_events: ticker === 'USDT0' ? [
      {
        start_date: '2024-10-15',
        end_date: '2024-10-16',
        max_deviation: 1.5,
        duration_days: 1,
        recovery_speed: '12 hours'
      },
      {
        start_date: '2024-03-11',
        end_date: '2024-03-12',
        max_deviation: 0.8,
        duration_days: 1,
        recovery_speed: '8 hours'
      }
    ] : ticker === 'DAI' ? [
      {
        start_date: '2024-08-20',
        end_date: '2024-08-21',
        max_deviation: 1.2,
        duration_days: 1,
        recovery_speed: '6 hours'
      }
    ] : [],
    is_currently_depegged: false,
          days_since_depeg: ticker === 'USDT0' ? 45 : undefined
  }
}

// Custom tooltip for the chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    // Debug logging to understand payload structure
    if (process.env.NODE_ENV === 'development') {
      console.log('Tooltip payload:', payload.map((p: any) => ({
        dataKey: p.dataKey,
        value: p.value,
        name: p.name
      })))
    }
    
    // Find the price data in the payload (filter out background bar data)
    const priceData = payload.find((entry: any) => entry.dataKey === 'price')
    
    if (!priceData) {
      console.warn('No price data found in tooltip payload')
      return null
    }
    
    const price = priceData.value
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
  // Use real data only - no fallback to mock data
  if (!propData) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Peg Stability Analysis</h2>
          <p className="text-muted-foreground">No peg stability data available</p>
        </div>
      </div>
    )
  }
  
  const data = propData
  
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
  
  // Get depeg periods for reference areas
  const getDepegPeriods = (): { start: number; end: number }[] => {
    const periods: { start: number; end: number }[] = []
    
    // Use the actual depeg events from the data if available
    data.depeg_events.forEach(event => {
      const startIndex = data.price_history.findIndex(p => p.date === event.start_date)
      const endIndex = event.end_date 
        ? data.price_history.findIndex(p => p.date === event.end_date)
        : startIndex
      
      if (startIndex !== -1 && endIndex !== -1) {
        periods.push({
          start: startIndex,
          end: endIndex
        })
      }
    })
    
    // If no depeg events are provided, analyze price history to detect depeg periods
    if (periods.length === 0 && data.price_history.length > 0) {
      const DEPEG_THRESHOLD = 0.01 // 1% deviation from $1.00
      let depegStart: number | null = null
      
      data.price_history.forEach((point, index) => {
        const isDepegged = Math.abs(point.price - 1.0) > DEPEG_THRESHOLD
        
        if (isDepegged && depegStart === null) {
          // Start of depeg period
          depegStart = index
        } else if (!isDepegged && depegStart !== null) {
          // End of depeg period
          periods.push({
            start: depegStart,
            end: index - 1
          })
          depegStart = null
        }
      })
      
      // Handle case where depeg period extends to the end of data
      if (depegStart !== null) {
        periods.push({
          start: depegStart,
          end: data.price_history.length - 1
        })
      }
    }
    
    return periods
  }
  
  const depegPeriods = getDepegPeriods()
  
  // Calculate detailed depeg incident stats
  const getDepegIncidentDetails = () => {
    return depegPeriods.map((period, index) => {
      const startPoint = data.price_history[period.start]
      const endPoint = data.price_history[period.end]
      
      // Find the maximum deviation during this period
      let maxDeviation = 0
      let maxDeviationPrice = startPoint.price
      
      for (let i = period.start; i <= period.end; i++) {
        const point = data.price_history[i]
        const deviation = Math.abs(point.price - 1.0)
        if (deviation > maxDeviation) {
          maxDeviation = deviation
          maxDeviationPrice = point.price
        }
      }
      
      // Calculate duration
      const startDate = new Date(startPoint.date)
      const endDate = new Date(endPoint.date)
      const durationMs = endDate.getTime() - startDate.getTime()
      const durationHours = Math.ceil(durationMs / (1000 * 60 * 60)) // Round up to nearest hour
      const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24)) // Round up to nearest day
      
      // For recovery time, we need to check if data granularity supports it
      // Since we only have daily data, we can only estimate recovery time in days
      const recoveryTimeEstimate = durationDays === 1 ? "< 24 hours" : `${durationDays} days`
      
      return {
        id: index + 1,
        startDate: startPoint.date,
        endDate: endPoint.date,
        startPrice: startPoint.price,
        endPrice: endPoint.price,
        maxDeviation: maxDeviation,
        maxDeviationPrice: maxDeviationPrice,
        deviationPercent: (maxDeviation * 100),
        duration: {
          days: durationDays,
          hours: durationHours,
          display: recoveryTimeEstimate
        },
        direction: maxDeviationPrice > 1.0 ? 'above' : 'below'
      }
    })
  }
  
  const depegIncidents = getDepegIncidentDetails()
  
  // Enhance price history data with depeg indicators for chart rendering
  const enhancedPriceHistory = data.price_history.map((point, index) => {
    const isInDepegPeriod = depegPeriods.some(period => 
      index >= period.start && index <= period.end
    )
    return {
      ...point,
      isDepeg: isInDepegPeriod,
      depegBackground: isInDepegPeriod ? 1 : 0 // For bar chart overlay
    }
  })
  
  // Debug log to help verify depeg detection
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${ticker}] Depeg periods detected:`, depegPeriods.length)
    console.log(`[${ticker}] Depeg events from API:`, data.depeg_events.length)
    console.log(`[${ticker}] Detailed depeg incidents:`, depegIncidents)
    if (depegPeriods.length > 0) {
      console.log(`[${ticker}] Depeg periods:`, depegPeriods.map(p => ({
        start: data.price_history[p.start]?.date,
        end: data.price_history[p.end]?.date,
        startPrice: data.price_history[p.start]?.price,
        endPrice: data.price_history[p.end]?.price
      })))
    }
    console.log(`[${ticker}] Enhanced data points with depeg:`, enhancedPriceHistory.filter(p => p.isDepeg).length)
    console.log(`[${ticker}] Data granularity check:`, {
      totalDataPoints: data.price_history.length,
      dateRange: {
        first: data.price_history[0]?.date,
        last: data.price_history[data.price_history.length - 1]?.date
      },
      hasTimestamps: data.price_history[0]?.timestamp !== undefined
    })
  }
  
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
              <ComposedChart
                data={enhancedPriceHistory}
                margin={{ top: 20, right: 30, left: 20, bottom: 70 }}
                barCategoryGap={0}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  yAxisId="price"
                  domain={['dataMin - 0.01', 'dataMax + 0.01']}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${value.toFixed(4)}`}
                />
                <YAxis 
                  yAxisId="background"
                  domain={[0, 1]}
                  hide
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Background bars for depeg periods */}
                <Bar
                  yAxisId="background"
                  dataKey="depegBackground"
                  fill="#7f1d1d"
                  fillOpacity={0.8}
                  stroke="none"
                />
                
                {/* $1.00 reference line */}
                <ReferenceLine yAxisId="price" y={1.0} stroke="#666" strokeDasharray="2 2" />
                
                {/* Price line */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </ComposedChart>
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

      {/* Detailed Depeg Incidents Analysis */}
      {depegIncidents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span>Depeg Incidents Analysis ({depegIncidents.length} events)</span>
            </CardTitle>
            <div className="space-y-2 mt-2">
              <p className="text-sm text-muted-foreground">
                Detailed breakdown of when {ticker} deviated more than 1% from the $1.00 peg
              </p>
              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  📊 <strong>Data Granularity:</strong> Recovery times are calculated based on daily price data. 
                  Actual recovery may have occurred faster than reported if intraday corrections happened.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {depegIncidents.map((incident) => (
                <div key={incident.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg">Incident #{incident.id}</h4>
                    <Badge variant={incident.direction === 'above' ? 'default' : 'destructive'}>
                      {incident.direction === 'above' ? 'Above Peg' : 'Below Peg'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    {/* Date Range */}
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">📅 Date</p>
                      <p className="text-sm font-medium">
                        {new Date(incident.startDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })} - {new Date(incident.endDate).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </p>
                    </div>
                    
                    {/* Maximum Deviation */}
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">📊 Maximum Deviation</p>
                      <p className="text-lg font-bold text-red-600">
                        {incident.direction === 'above' ? '+' : '-'}{incident.deviationPercent.toFixed(2)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${incident.maxDeviationPrice.toFixed(4)}
                      </p>
                    </div>
                    
                    {/* Recovery Time */}
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-muted-foreground">⏱️ Recovery Time</p>
                      <p className="text-lg font-bold text-blue-600">
                        {incident.duration.days === 0 ? 'Intraday' : incident.duration.display}
                      </p>
                    </div>
                  </div>
                  
                  {/* Additional details */}
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Start Price:</span> ${incident.startPrice.toFixed(4)} • 
                      <span className="font-medium"> End Price:</span> ${incident.endPrice.toFixed(4)}
                      {incident.duration.hours > 0 && (
                        <>
                          {' • '}
                          <span className="font-medium"> Duration:</span> {incident.duration.hours} hours
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            {depegIncidents.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No depeg incidents detected in the last 365 days</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {ticker} has maintained its peg within ±1% throughout the period
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
} 