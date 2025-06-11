'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { RiskScoreMeter } from '@/components/risk-score-meter'

interface StablecoinInfo {
  name: string
  symbol: string
  logo: string
  market_cap: number
  genesis_date: string
  pegging_type: string
  blockchain: string
  current_price: number
}

interface MainSummaryCardProps {
  info: StablecoinInfo
  overallScore: number
  confidenceScore: number
  summary: string
}

// Helper function to format market cap
function formatMarketCap(value: number): string {
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(1)}B`
  } else if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`
  } else if (value >= 1e3) {
    return `$${(value / 1e3).toFixed(1)}K`
  }
  return `$${value.toLocaleString()}`
}

// Helper function to format date
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  } catch {
    return dateString
  }
}

// Badge color mapping for pegging types
function getPeggingBadgeVariant(peggingType: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' {
  switch (peggingType.toLowerCase()) {
    case 'fiat-backed':
    case 'fiat-collateralized':
      return 'success'
    case 'crypto-backed':
    case 'crypto-collateralized':
      return 'warning'
    case 'algorithmic':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function MainSummaryCard({ 
  info, 
  overallScore, 
  confidenceScore, 
  summary 
}: MainSummaryCardProps) {
  const [imageError, setImageError] = useState(false)

  const handleImageError = () => {
    setImageError(true)
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {!imageError ? (
              <img
                src={info.logo}
                alt={`${info.name} logo`}
                className="h-8 w-8 rounded-full"
                onError={handleImageError}
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {info.symbol.charAt(0)}
                </span>
              </div>
            )}
            <div className="space-y-2">
              <h1 className="text-xl font-bold">{info.name}</h1>
              <div className="text-sm text-muted-foreground">
                {info.symbol} • {formatMarketCap(info.market_cap)} Market Cap
              </div>
            </div>
          </div>
          <Badge variant={getPeggingBadgeVariant(info.pegging_type)}>
            {info.pegging_type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Risk Score */}
          <div className="flex justify-center lg:justify-start">
            <div className="flex flex-col items-center space-y-4">
              <RiskScoreMeter score={overallScore} size="lg" />
              <div className="space-y-2 text-center">
                <div className="text-sm font-medium text-muted-foreground">
                  Overall Risk Score
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated daily
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Genesis Date</div>
                <div className="font-medium">{formatDate(info.genesis_date)}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Blockchain</div>
                <div className="font-medium">{info.blockchain}</div>
              </div>
            </div>

            {/* Confidence & Summary */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Assessment Confidence</span>
                <Badge variant="outline">{confidenceScore}%</Badge>
              </div>
              <Progress value={confidenceScore} className="h-2" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Risk Summary</span>
                <span className="text-xs text-muted-foreground">Last updated: 24h ago</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {summary}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 