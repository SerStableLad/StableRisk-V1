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
  official_links?: {
    homepage?: string[]
    github_repos?: string[]
  }
}

interface RiskScores {
  overall: number
  peg_stability: number
  transparency: number
  liquidity: number
  audit: number
}

interface MainSummaryCardProps {
  info: StablecoinInfo
  overallScore: number
  riskScores: RiskScores
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
  // Handle special cases
  if (!dateString || dateString === 'Unknown' || dateString === 'null') {
    return 'Unknown'
  }
  
  try {
    const date = new Date(dateString)
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return 'Unknown'
    }
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  } catch {
    return 'Unknown'
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
  riskScores,
  confidenceScore, 
  summary 
}: MainSummaryCardProps) {
  const [imageError, setImageError] = useState(false)

  const handleImageError = () => {
    setImageError(true)
  }

  // Calculate weighted contributions for score breakdown
  const calculateScoreBreakdown = () => {
    const weights = {
      peg_stability: 0.40,    // 40%
      transparency: 0.20,     // 20%
      liquidity: 0.15,        // 15%
      audit: 0.10,            // 10%
      // Note: Oracle is disabled, so we redistribute its 15% weight
    }

    return {
      pegStability: Math.round(riskScores.peg_stability * weights.peg_stability),
      transparency: Math.round(riskScores.transparency * weights.transparency),
      liquidity: Math.round(riskScores.liquidity * weights.liquidity),
      audit: Math.round(riskScores.audit * weights.audit),
      maxPegStability: Math.round(100 * weights.peg_stability),
      maxTransparency: Math.round(100 * weights.transparency),
      maxLiquidity: Math.round(100 * weights.liquidity),
      maxAudit: Math.round(100 * weights.audit)
    }
  }

  const scoreBreakdown = calculateScoreBreakdown()

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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

          {/* Middle Column - Key Info & Links */}
          <div className="space-y-6">
            {/* Key Metrics Grid */}
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Genesis Date</div>
                <div className="font-medium">{formatDate(info.genesis_date)}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Blockchain</div>
                <div className="font-medium">{info.blockchain}</div>
              </div>
              
              {/* Website Link */}
              {info.official_links?.homepage && info.official_links.homepage.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Website</div>
                  <a 
                    href={info.official_links.homepage[0]} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:text-blue-800 text-sm break-all"
                  >
                    {info.official_links.homepage[0].replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </div>
              )}
              
              {/* GitHub Link */}
              {info.official_links?.github_repos && info.official_links.github_repos.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">GitHub</div>
                  <a 
                    href={info.official_links.github_repos[0]} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:text-blue-800 text-sm break-all"
                  >
                    {info.official_links.github_repos[0].replace('https://github.com/', '')}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Assessment Confidence & Methodology */}
          <div className="space-y-6">
            {/* Score Breakdown */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                Score Breakdown
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between items-center">
                  <span>Peg Stability (40%)</span>
                  <span className="font-medium">{scoreBreakdown.pegStability}/{scoreBreakdown.maxPegStability}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Transparency (20%)</span>
                  <span className="font-medium">{scoreBreakdown.transparency}/{scoreBreakdown.maxTransparency}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Liquidity (15%)</span>
                  <span className="font-medium">{scoreBreakdown.liquidity}/{scoreBreakdown.maxLiquidity}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Audit Status (10%)</span>
                  <span className="font-medium">{scoreBreakdown.audit}/{scoreBreakdown.maxAudit}</span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-medium">
                    <span>Total Score</span>
                    <span>{overallScore}/100</span>
                  </div>
                </div>
              </div>
            </div>



            {/* Assessment Confidence */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Assessment Confidence</span>
                <Badge variant="outline">{confidenceScore}%</Badge>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                How reliable our risk assessment is based on data quality and availability
              </div>
              <Progress value={confidenceScore} className="h-2" />
            </div>

            {/* Risk Summary */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                Risk Summary
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {summary}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 