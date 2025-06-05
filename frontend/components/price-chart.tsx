import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PegAnalysis } from '@/lib/types'
import { format } from 'date-fns'

interface PriceChartProps {
  analysis: PegAnalysis
  symbol: string
}

export function PriceChart({ analysis, symbol }: PriceChartProps) {
  // Create chart data from complete price history
  const chartData = React.useMemo(() => {
    if (!analysis.price_history || analysis.price_history.length === 0) {
      return []
    }

    return analysis.price_history.map(point => ({
      timestamp: new Date(point.timestamp).getTime(),
      price: point.price,
      deviation: point.deviation_percent,
      date: format(new Date(point.timestamp), 'd. MMM'),
      fullDate: format(new Date(point.timestamp), 'PPP'),
      formattedPrice: `$${point.price.toFixed(4)}`,
      formattedDeviation: `${point.deviation_percent.toFixed(3)}%`
    })).sort((a, b) => a.timestamp - b.timestamp)
  }, [analysis.price_history])

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.fullDate}</p>
          <p className="text-blue-600">
            Price: <span className="font-medium">{data.formattedPrice}</span>
          </p>
          <p className="text-red-600">
            Deviation: <span className="font-medium">{data.formattedDeviation}</span>
          </p>
        </div>
      )
    }
    return null
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price Stability Chart</CardTitle>
          <CardDescription>Historical price movement for {symbol}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No price history data available
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Price Stability Chart</span>
          <div className="flex gap-2">
            <Badge variant="outline">
              Current: ${analysis.current_price.toFixed(4)}
            </Badge>
            <Badge 
              variant={analysis.current_deviation > 1 ? "destructive" : "secondary"}
            >
              {analysis.current_deviation.toFixed(3)}% deviation
            </Badge>
          </div>
        </CardTitle>
        <CardDescription>
          Historical price movement for {symbol} over the last year
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Price Chart */}
          <div>
            <h4 className="text-sm font-medium mb-3">Price Movement (USD)</h4>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    domain={['dataMin - 0.001', 'dataMax + 0.001']}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `$${value.toFixed(3)}`}
                  />
                  <ReferenceLine y={1.0} stroke="#22c55e" strokeDasharray="5 5" />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey="price" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-muted-foreground">
              {analysis.max_deviation_7d.toFixed(3)}%
            </div>
            <div className="text-sm text-muted-foreground">Max 7D</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-muted-foreground">
              {analysis.max_deviation_30d.toFixed(3)}%
            </div>
            <div className="text-sm text-muted-foreground">Max 30D</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-muted-foreground">
              {analysis.max_deviation_1y.toFixed(3)}%
            </div>
            <div className="text-sm text-muted-foreground">Max 1Y</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-muted-foreground">
              {analysis.depeg_events.length}
            </div>
            <div className="text-sm text-muted-foreground">Depeg Events</div>
          </div>
        </div>

        {/* Depeg Events */}
        {analysis.depeg_events.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-medium mb-3">Recent Depeg Events (&gt;5% deviation)</h4>
            <div className="space-y-2">
              {analysis.depeg_events.slice(0, 3).map((event, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <div className="font-medium">{format(new Date(event.timestamp), 'PPP')}</div>
                    <div className="text-sm text-muted-foreground">
                      Price: ${event.price.toFixed(4)} ({event.deviation_percent.toFixed(2)}% deviation)
                    </div>
                  </div>
                  <Badge variant={event.recovered ? "default" : "destructive"}>
                    {event.recovered ? 'Recovered' : 'Ongoing'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 