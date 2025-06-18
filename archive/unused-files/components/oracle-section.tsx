'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  Wifi, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Clock,
  Building,
  Shield,
  Activity,
  Zap,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw
} from 'lucide-react'

interface OracleProvider {
  name: string
  type: 'centralized' | 'decentralized' | 'hybrid'
  reliability_score: number
  update_frequency: string // e.g., "30s", "1m", "5m"
  last_update: string
  is_primary: boolean
  endpoint_url?: string
  data_source: string
  geographical_distribution: string[]
  uptime_percentage: number
}

interface PriceFeed {
  pair: string // e.g., "USD/USD", "ETH/USD"
  current_price: number
  price_deviation: number // percentage
  last_updated: string
  confidence_interval: number
  source_count: number
  is_active: boolean
}

interface OracleData {
  oracle_providers: OracleProvider[]
  price_feeds: PriceFeed[]
  redundancy_level: 'none' | 'basic' | 'moderate' | 'high' | 'maximum'
  decentralization_score: number
  oracle_attack_resistance: number
  median_update_frequency: string
  total_data_sources: number
  geographical_coverage: number
  has_failover_mechanisms: boolean
  oracle_issues: string[]
  last_oracle_incident?: {
    date: string
    description: string
    resolution_time: string
    impact: 'low' | 'medium' | 'high' | 'critical'
  }
}

interface OracleSectionProps {
  ticker: string
  data?: OracleData | null
}

// Generate mock data for development
function generateMockData(ticker: string): OracleData {
  const oracleData: Record<string, Partial<OracleData>> = {
    'USDT': {
      oracle_providers: [
        {
          name: 'Chainlink',
          type: 'decentralized',
          reliability_score: 9.5,
          update_frequency: '1m',
          last_update: new Date(Date.now() - 60000).toISOString(),
          is_primary: true,
          endpoint_url: 'https://feeds.chain.link',
          data_source: 'Multiple CEX/DEX',
          geographical_distribution: ['US', 'EU', 'APAC'],
          uptime_percentage: 99.9
        },
        {
          name: 'Band Protocol',
          type: 'decentralized',
          reliability_score: 8.7,
          update_frequency: '30s',
          last_update: new Date(Date.now() - 30000).toISOString(),
          is_primary: false,
          data_source: 'Multiple CEX',
          geographical_distribution: ['US', 'APAC'],
          uptime_percentage: 99.7
        }
      ],
      price_feeds: [
        {
          pair: 'USDT/USD',
          current_price: 1.0001,
          price_deviation: 0.01,
          last_updated: new Date(Date.now() - 60000).toISOString(),
          confidence_interval: 99.8,
          source_count: 12,
          is_active: true
        }
      ],
      redundancy_level: 'high',
      decentralization_score: 85,
      oracle_attack_resistance: 90,
      median_update_frequency: '45s',
      total_data_sources: 15,
      geographical_coverage: 85,
      has_failover_mechanisms: true,
      oracle_issues: []
    },
    'USDC': {
      oracle_providers: [
        {
          name: 'Chainlink',
          type: 'decentralized',
          reliability_score: 9.8,
          update_frequency: '1m',
          last_update: new Date(Date.now() - 45000).toISOString(),
          is_primary: true,
          endpoint_url: 'https://feeds.chain.link',
          data_source: 'Multiple CEX/DEX',
          geographical_distribution: ['US', 'EU', 'APAC'],
          uptime_percentage: 99.95
        }
      ],
      price_feeds: [
        {
          pair: 'USDC/USD',
          current_price: 0.9999,
          price_deviation: -0.01,
          last_updated: new Date(Date.now() - 45000).toISOString(),
          confidence_interval: 99.9,
          source_count: 15,
          is_active: true
        }
      ],
      redundancy_level: 'moderate',
      decentralization_score: 90,
      oracle_attack_resistance: 95,
      median_update_frequency: '1m',
      total_data_sources: 18,
      geographical_coverage: 90,
      has_failover_mechanisms: true,
      oracle_issues: []
    },
    'DAI': {
      oracle_providers: [
        {
          name: 'MakerDAO Oracle',
          type: 'decentralized',
          reliability_score: 9.2,
          update_frequency: '1h',
          last_update: new Date(Date.now() - 1800000).toISOString(),
          is_primary: true,
          data_source: 'Multiple CEX/DEX',
          geographical_distribution: ['Global'],
          uptime_percentage: 99.8
        }
      ],
      price_feeds: [
        {
          pair: 'DAI/USD',
          current_price: 1.0008,
          price_deviation: 0.08,
          last_updated: new Date(Date.now() - 1800000).toISOString(),
          confidence_interval: 99.5,
          source_count: 10,
          is_active: true
        }
      ],
      redundancy_level: 'moderate',
      decentralization_score: 88,
      oracle_attack_resistance: 85,
      median_update_frequency: '1h',
      total_data_sources: 12,
      geographical_coverage: 75,
      has_failover_mechanisms: true,
      oracle_issues: []
    }
  }

  const baseData = oracleData[ticker] || {}
  
  return {
    oracle_providers: baseData.oracle_providers ?? [
      {
        name: 'Unknown Oracle',
        type: 'centralized',
        reliability_score: 6.0,
        update_frequency: '10m',
        last_update: new Date(Date.now() - 600000).toISOString(),
        is_primary: true,
        data_source: 'Single Source',
        geographical_distribution: ['US'],
        uptime_percentage: 95.0
      }
    ],
    price_feeds: baseData.price_feeds ?? [
      {
        pair: `${ticker}/USD`,
        current_price: 1.0,
        price_deviation: 0.0,
        last_updated: new Date(Date.now() - 600000).toISOString(),
        confidence_interval: 90.0,
        source_count: 3,
        is_active: true
      }
    ],
    redundancy_level: baseData.redundancy_level ?? 'basic',
    decentralization_score: baseData.decentralization_score ?? 60,
    oracle_attack_resistance: baseData.oracle_attack_resistance ?? 65,
    median_update_frequency: baseData.median_update_frequency ?? '10m',
    total_data_sources: baseData.total_data_sources ?? 5,
    geographical_coverage: baseData.geographical_coverage ?? 40,
    has_failover_mechanisms: baseData.has_failover_mechanisms ?? false,
    oracle_issues: baseData.oracle_issues ?? ['Limited oracle diversity', 'Infrequent updates']
  }
}

const getRedundancyColor = (level: string) => {
  switch (level) {
    case 'maximum':
      return 'text-green-600'
    case 'high':
      return 'text-green-600'
    case 'moderate':
      return 'text-yellow-600'
    case 'basic':
      return 'text-orange-600'
    case 'none':
      return 'text-red-600'
    default:
      return 'text-gray-600'
  }
}

const getRedundancyBadge = (level: string) => {
  switch (level) {
    case 'maximum':
      return <Badge variant="default" className="bg-green-100 text-green-800">Maximum</Badge>
    case 'high':
      return <Badge variant="default" className="bg-green-100 text-green-800">High</Badge>
    case 'moderate':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Moderate</Badge>
    case 'basic':
      return <Badge variant="default" className="bg-orange-100 text-orange-800">Basic</Badge>
    case 'none':
      return <Badge variant="destructive">None</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

const getOracleTypeBadge = (type: string) => {
  switch (type) {
    case 'decentralized':
      return <Badge variant="default" className="bg-green-100 text-green-800">Decentralized</Badge>
    case 'hybrid':
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Hybrid</Badge>
    case 'centralized':
      return <Badge variant="default" className="bg-orange-100 text-orange-800">Centralized</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

const getScoreColor = (score: number) => {
  if (score >= 85) return 'text-green-600'
  if (score >= 70) return 'text-yellow-600'
  return 'text-red-600'
}

const getScoreTrend = (score: number) => {
  if (score >= 85) return <TrendingUp className="h-4 w-4 text-green-600" />
  if (score >= 70) return <Minus className="h-4 w-4 text-yellow-600" />
  return <TrendingDown className="h-4 w-4 text-red-600" />
}

const getDeviationColor = (deviation: number) => {
  const abs = Math.abs(deviation)
  if (abs <= 0.05) return 'text-green-600'
  if (abs <= 0.2) return 'text-yellow-600'
  return 'text-red-600'
}

const formatUpdateFrequency = (frequency: string) => {
  if (frequency.endsWith('s')) return `${frequency} seconds`
  if (frequency.endsWith('m')) return `${frequency} minutes`
  if (frequency.endsWith('h')) return `${frequency} hours`
  return frequency
}

export function OracleSection({ ticker, data: propData }: OracleSectionProps) {
  // Use mock data for development
  const data = propData || generateMockData(ticker)
  
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Oracle Infrastructure & Price Feeds</h2>
        <p className="text-muted-foreground">
          Decentralized price oracle setup and data feed reliability
        </p>
      </div>

      {/* Oracle Issues Alert */}
      {data.oracle_issues.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Oracle Concerns</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {data.oracle_issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Oracle Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Wifi className="h-5 w-5" />
              <span>Oracle Infrastructure</span>
            </div>
            <div className="flex items-center space-x-2">
              {getRedundancyBadge(data.redundancy_level)}
              {data.has_failover_mechanisms && (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <Shield className="h-3 w-3 mr-1" />
                  Failover Ready
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Decentralization</p>
              <div className="flex items-center justify-center space-x-2">
                <p className={`text-2xl font-bold ${getScoreColor(data.decentralization_score)}`}>
                  {data.decentralization_score}%
                </p>
                {getScoreTrend(data.decentralization_score)}
              </div>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Attack Resistance</p>
              <div className="flex items-center justify-center space-x-2">
                <p className={`text-2xl font-bold ${getScoreColor(data.oracle_attack_resistance)}`}>
                  {data.oracle_attack_resistance}%
                </p>
                {getScoreTrend(data.oracle_attack_resistance)}
              </div>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Data Sources</p>
              <p className="text-2xl font-bold text-blue-600">
                {data.total_data_sources}
              </p>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Geo Coverage</p>
              <p className="text-2xl font-bold text-purple-600">
                {data.geographical_coverage}%
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Update Frequency</p>
              <p className="font-medium">{formatUpdateFrequency(data.median_update_frequency)}</p>
            </div>
            
            <div>
              <p className="text-muted-foreground">Redundancy Level</p>
              <p className={`font-medium ${getRedundancyColor(data.redundancy_level)}`}>
                {data.redundancy_level.charAt(0).toUpperCase() + data.redundancy_level.slice(1)}
              </p>
            </div>
            
            <div>
              <p className="text-muted-foreground">Oracle Providers</p>
              <p className="font-medium">{data.oracle_providers.length} active</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Price Feeds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Active Price Feeds</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.price_feeds.map((feed, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <Activity className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium">{feed.pair}</h4>
                      <p className="text-sm text-muted-foreground">
                        {feed.source_count} data sources
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {feed.is_active ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <Zap className="h-3 w-3 mr-1" />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Current Price</p>
                    <p className="font-medium text-lg">${feed.current_price.toFixed(4)}</p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Deviation</p>
                    <p className={`font-medium ${getDeviationColor(feed.price_deviation)}`}>
                      {feed.price_deviation > 0 ? '+' : ''}{feed.price_deviation.toFixed(2)}%
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Confidence</p>
                    <div className="flex items-center space-x-2">
                      <p className="font-medium">{feed.confidence_interval.toFixed(1)}%</p>
                      <Progress value={feed.confidence_interval} className="flex-1 h-2" />
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <div className="flex items-center space-x-1">
                      <RefreshCw className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">
                        {Math.floor((Date.now() - new Date(feed.last_updated).getTime()) / 60000)}m ago
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Oracle Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building className="h-5 w-5" />
            <span>Oracle Providers</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.oracle_providers.map((provider, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Building className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium">{provider.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Reliability: {provider.reliability_score.toFixed(1)}/10
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getOracleTypeBadge(provider.type)}
                    {provider.is_primary && (
                      <Badge variant="default" className="bg-blue-100 text-blue-800">
                        Primary
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Update Frequency</p>
                    <p className="font-medium">{formatUpdateFrequency(provider.update_frequency)}</p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Uptime</p>
                    <div className="flex items-center space-x-2">
                      <p className={`font-medium ${provider.uptime_percentage >= 99 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {provider.uptime_percentage.toFixed(1)}%
                      </p>
                      <Progress value={provider.uptime_percentage} className="flex-1 h-2" />
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Data Source</p>
                    <p className="font-medium">{provider.data_source}</p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Last Update</p>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">
                        {Math.floor((Date.now() - new Date(provider.last_update).getTime()) / 60000)}m ago
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground mb-2">Geographic Distribution</p>
                  <div className="flex flex-wrap gap-2">
                    {provider.geographical_distribution.map((region, regionIndex) => (
                      <Badge key={regionIndex} variant="outline" className="text-xs">
                        {region}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-3">
                  <div className="text-sm text-muted-foreground">
                    {Math.floor((Date.now() - new Date(provider.last_update).getTime()) / 60000)} minutes since last update
                  </div>
                  {provider.endpoint_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(provider.endpoint_url, '_blank', 'noopener,noreferrer')}
                      className="flex items-center space-x-2"
                    >
                      <Wifi className="h-3 w-3" />
                      <span>View Feed</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Last Oracle Incident */}
      {data.last_oracle_incident && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span>Recent Oracle Incident</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium">Oracle Service Disruption</p>
                <Badge variant="outline" className={
                  data.last_oracle_incident.impact === 'critical' ? 'bg-red-100 text-red-800' :
                  data.last_oracle_incident.impact === 'high' ? 'bg-orange-100 text-orange-800' :
                  data.last_oracle_incident.impact === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }>
                  {data.last_oracle_incident.impact.toUpperCase()} IMPACT
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {data.last_oracle_incident.description}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Incident Date</p>
                  <p className="font-medium">{new Date(data.last_oracle_incident.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Resolution Time</p>
                  <p className="font-medium">{data.last_oracle_incident.resolution_time}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 