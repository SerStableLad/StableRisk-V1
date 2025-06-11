'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  TrendingUp, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  BarChart3,
  Waves,
  Building2,
  DollarSign,
  Zap,
  Target,
  Layers,
  PieChart,
  Activity,
  Globe,
  ArrowUpDown,
  RefreshCw
} from 'lucide-react'

interface Exchange {
  name: string
  type: 'CEX' | 'DEX'
  volume_24h: number
  volume_percentage: number
  spread: number
  market_depth_1_percent: number
  last_updated: string
  is_active: boolean
  trading_pairs: string[]
  website_url?: string
}

interface LiquidityPool {
  platform: string
  pool_address: string
  tvl: number
  volume_24h: number
  apr: number
  token_pair: string
  pool_composition: {
    token1_percentage: number
    token2_percentage: number
  }
  is_active: boolean
  risk_level: 'low' | 'medium' | 'high' | 'very_high'
}

interface LiquidityData {
  total_volume_24h: number
  total_volume_7d: number
  volume_change_24h: number
  market_cap: number
  liquidity_score: number
  exchanges: Exchange[]
  liquidity_pools: LiquidityPool[]
  market_depth_analysis: {
    depth_1_percent: number
    depth_5_percent: number
    depth_10_percent: number
    average_spread: number
  }
  exchange_distribution: {
    cex_percentage: number
    dex_percentage: number
    cex_volume: number
    dex_volume: number
  }
  liquidation_risk: {
    risk_level: 'low' | 'medium' | 'high' | 'critical'
    factors: string[]
    concentrated_holdings: number
    whale_concentration: number
  }
  liquidity_issues: string[]
  last_liquidity_crisis?: {
    date: string
    description: string
    impact_duration: string
    recovery_time: string
  }
}

interface LiquiditySectionProps {
  ticker: string
  data?: LiquidityData | null
}

// Generate mock data for development
function generateMockData(ticker: string): LiquidityData {
  const liquidityData: Record<string, Partial<LiquidityData>> = {
    'USDT': {
      total_volume_24h: 50800000000,
      total_volume_7d: 345600000000,
      volume_change_24h: 2.8,
      market_cap: 83200000000,
      liquidity_score: 95,
      exchanges: [
        {
          name: 'Binance',
          type: 'CEX',
          volume_24h: 18500000000,
          volume_percentage: 36.4,
          spread: 0.002,
          market_depth_1_percent: 125000000,
          last_updated: new Date(Date.now() - 120000).toISOString(),
          is_active: true,
          trading_pairs: ['USDT/USDC', 'BTC/USDT', 'ETH/USDT'],
          website_url: 'https://binance.com'
        },
        {
          name: 'Uniswap V3',
          type: 'DEX',
          volume_24h: 2800000000,
          volume_percentage: 5.5,
          spread: 0.005,
          market_depth_1_percent: 45000000,
          last_updated: new Date(Date.now() - 180000).toISOString(),
          is_active: true,
          trading_pairs: ['USDT/USDC', 'USDT/DAI', 'USDT/WETH']
        }
      ],
      liquidity_pools: [
        {
          platform: 'Uniswap V3',
          pool_address: '0xa0b86a33e6cad3e84932423e8b7b3',
          tvl: 185000000,
          volume_24h: 2800000000,
          apr: 0.8,
          token_pair: 'USDT/USDC',
          pool_composition: {
            token1_percentage: 52,
            token2_percentage: 48
          },
          is_active: true,
          risk_level: 'low'
        }
      ],
      market_depth_analysis: {
        depth_1_percent: 125000000,
        depth_5_percent: 480000000,
        depth_10_percent: 850000000,
        average_spread: 0.003
      },
      exchange_distribution: {
        cex_percentage: 85,
        dex_percentage: 15,
        cex_volume: 43180000000,
        dex_volume: 7620000000
      },
      liquidation_risk: {
        risk_level: 'low',
        factors: ['High liquidity across multiple venues', 'Strong market depth'],
        concentrated_holdings: 15,
        whale_concentration: 12
      },
      liquidity_issues: []
    },
    'USDC': {
      total_volume_24h: 8200000000,
      total_volume_7d: 57400000000,
      volume_change_24h: -1.2,
      market_cap: 35800000000,
      liquidity_score: 92,
      exchanges: [
        {
          name: 'Coinbase',
          type: 'CEX',
          volume_24h: 3800000000,
          volume_percentage: 46.3,
          spread: 0.001,
          market_depth_1_percent: 95000000,
          last_updated: new Date(Date.now() - 90000).toISOString(),
          is_active: true,
          trading_pairs: ['USDC/USD', 'BTC/USDC', 'ETH/USDC'],
          website_url: 'https://coinbase.com'
        }
      ],
      liquidity_pools: [
        {
          platform: 'Curve',
          pool_address: '0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7',
          tvl: 425000000,
          volume_24h: 180000000,
          apr: 1.2,
          token_pair: 'USDC/USDT/DAI',
          pool_composition: {
            token1_percentage: 33,
            token2_percentage: 67
          },
          is_active: true,
          risk_level: 'low'
        }
      ],
      market_depth_analysis: {
        depth_1_percent: 95000000,
        depth_5_percent: 320000000,
        depth_10_percent: 580000000,
        average_spread: 0.002
      },
      exchange_distribution: {
        cex_percentage: 78,
        dex_percentage: 22,
        cex_volume: 6396000000,
        dex_volume: 1804000000
      },
      liquidation_risk: {
        risk_level: 'low',
        factors: ['Regulated and transparent reserves', 'Strong institutional backing'],
        concentrated_holdings: 8,
        whale_concentration: 6
      },
      liquidity_issues: []
    },
    'DAI': {
      total_volume_24h: 425000000,
      total_volume_7d: 2975000000,
      volume_change_24h: 5.7,
      market_cap: 4800000000,
      liquidity_score: 78,
      exchanges: [
        {
          name: 'Uniswap V2',
          type: 'DEX',
          volume_24h: 185000000,
          volume_percentage: 43.5,
          spread: 0.008,
          market_depth_1_percent: 12000000,
          last_updated: new Date(Date.now() - 240000).toISOString(),
          is_active: true,
          trading_pairs: ['DAI/USDC', 'DAI/ETH', 'DAI/USDT']
        }
      ],
      liquidity_pools: [
        {
          platform: 'MakerDAO PSM',
          pool_address: '0x89b78cfa322f6c5de0abceecab66aee45393cc5a',
          tvl: 850000000,
          volume_24h: 125000000,
          apr: 0.1,
          token_pair: 'DAI/USDC',
          pool_composition: {
            token1_percentage: 95,
            token2_percentage: 5
          },
          is_active: true,
          risk_level: 'medium'
        }
      ],
      market_depth_analysis: {
        depth_1_percent: 12000000,
        depth_5_percent: 45000000,
        depth_10_percent: 85000000,
        average_spread: 0.012
      },
      exchange_distribution: {
        cex_percentage: 25,
        dex_percentage: 75,
        cex_volume: 106250000,
        dex_volume: 318750000
      },
      liquidation_risk: {
        risk_level: 'medium',
        factors: ['Lower overall liquidity', 'Collateral-dependent stability'],
        concentrated_holdings: 35,
        whale_concentration: 28
      },
      liquidity_issues: ['Lower volume compared to other major stablecoins']
    }
  }

  const baseData = liquidityData[ticker] || {}
  
  return {
    total_volume_24h: baseData.total_volume_24h ?? 100000000,
    total_volume_7d: baseData.total_volume_7d ?? 700000000,
    volume_change_24h: baseData.volume_change_24h ?? 0,
    market_cap: baseData.market_cap ?? 1000000000,
    liquidity_score: baseData.liquidity_score ?? 60,
    exchanges: baseData.exchanges ?? [
      {
        name: 'Unknown Exchange',
        type: 'CEX',
        volume_24h: 50000000,
        volume_percentage: 50,
        spread: 0.01,
        market_depth_1_percent: 5000000,
        last_updated: new Date().toISOString(),
        is_active: false,
        trading_pairs: []
      }
    ],
    liquidity_pools: baseData.liquidity_pools ?? [],
    market_depth_analysis: baseData.market_depth_analysis ?? {
      depth_1_percent: 5000000,
      depth_5_percent: 20000000,
      depth_10_percent: 35000000,
      average_spread: 0.01
    },
    exchange_distribution: baseData.exchange_distribution ?? {
      cex_percentage: 70,
      dex_percentage: 30,
      cex_volume: 70000000,
      dex_volume: 30000000
    },
    liquidation_risk: baseData.liquidation_risk ?? {
      risk_level: 'medium',
      factors: ['Limited trading data available'],
      concentrated_holdings: 50,
      whale_concentration: 40
    },
    liquidity_issues: baseData.liquidity_issues ?? ['Insufficient liquidity data available'],
    last_liquidity_crisis: baseData.last_liquidity_crisis
  }
}

const formatNumber = (num: number): string => {
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`
  return `$${num.toFixed(0)}`
}

const getVolumeChangeColor = (change: number) => {
  if (change > 0) return 'text-green-600'
  if (change < 0) return 'text-red-600'
  return 'text-gray-600'
}

const getVolumeChangeTrend = (change: number) => {
  if (change > 0) return <TrendingUp className="h-3 w-3 text-green-600" />
  if (change < 0) return <BarChart3 className="h-3 w-3 text-red-600 rotate-180" />
  return <ArrowUpDown className="h-3 w-3 text-gray-600" />
}

const getLiquidityScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

const getSpreadColor = (spread: number) => {
  if (spread <= 0.005) return 'text-green-600'
  if (spread <= 0.01) return 'text-yellow-600'
  return 'text-red-600'
}

const getExchangeTypeBadge = (type: string) => {
  if (type === 'CEX') {
    return (
      <Badge variant="default" className="bg-blue-100 text-blue-800">
        <Building2 className="h-3 w-3 mr-1" />
        CEX
      </Badge>
    )
  }
  return (
    <Badge variant="default" className="bg-purple-100 text-purple-800">
      <Layers className="h-3 w-3 mr-1" />
      DEX
    </Badge>
  )
}

const getRiskLevelBadge = (level: string) => {
  const riskMap = {
    'low': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
    'medium': { color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
    'high': { color: 'bg-orange-100 text-orange-800', icon: AlertTriangle },
    'very_high': { color: 'bg-red-100 text-red-800', icon: XCircle },
    'critical': { color: 'bg-red-100 text-red-800', icon: XCircle }
  }
  
  const config = riskMap[level as keyof typeof riskMap] || riskMap.medium
  const Icon = config.icon
  
  return (
    <Badge variant="outline" className={config.color}>
      <Icon className="h-3 w-3 mr-1" />
      {level.charAt(0).toUpperCase() + level.slice(1).replace('_', ' ')}
    </Badge>
  )
}

export function LiquiditySection({ ticker, data: propData }: LiquiditySectionProps) {
  // Use mock data for development
  const data = propData || generateMockData(ticker)
  
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Liquidity Analysis & Market Depth</h2>
        <p className="text-muted-foreground">
          Trading volume distribution, market depth, and liquidation risk assessment
        </p>
      </div>

      {/* Liquidity Issues Alert */}
      {data.liquidity_issues.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Liquidity Concerns</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {data.liquidity_issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Liquidity Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Waves className="h-5 w-5" />
              <span>Liquidity Overview</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="default" className={`${getLiquidityScoreColor(data.liquidity_score)} bg-opacity-10`}>
                <Target className="h-3 w-3 mr-1" />
                Score: {data.liquidity_score}/100
              </Badge>
              {getRiskLevelBadge(data.liquidation_risk.risk_level)}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">24h Volume</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatNumber(data.total_volume_24h)}
              </p>
              <div className="flex items-center justify-center space-x-1 mt-1">
                {getVolumeChangeTrend(data.volume_change_24h)}
                <span className={`text-sm ${getVolumeChangeColor(data.volume_change_24h)}`}>
                  {data.volume_change_24h > 0 ? '+' : ''}{data.volume_change_24h.toFixed(1)}%
                </span>
              </div>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">7d Volume</p>
              <p className="text-2xl font-bold text-purple-600">
                {formatNumber(data.total_volume_7d)}
              </p>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Market Cap</p>
              <p className="text-2xl font-bold text-green-600">
                {formatNumber(data.market_cap)}
              </p>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Avg Spread</p>
              <p className={`text-2xl font-bold ${getSpreadColor(data.market_depth_analysis.average_spread)}`}>
                {(data.market_depth_analysis.average_spread * 100).toFixed(3)}%
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Liquidity Score</p>
              <div className="flex items-center space-x-2">
                <p className={`font-medium ${getLiquidityScoreColor(data.liquidity_score)}`}>
                  {data.liquidity_score}/100
                </p>
                <Progress value={data.liquidity_score} className="flex-1 h-2" />
              </div>
            </div>
            
            <div>
              <p className="text-muted-foreground">Active Exchanges</p>
              <p className="font-medium">{data.exchanges.filter(e => e.is_active).length} venues</p>
            </div>
            
            <div>
              <p className="text-muted-foreground">Liquidation Risk</p>
              <p className={`font-medium ${
                data.liquidation_risk.risk_level === 'low' ? 'text-green-600' :
                data.liquidation_risk.risk_level === 'medium' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {data.liquidation_risk.risk_level.charAt(0).toUpperCase() + data.liquidation_risk.risk_level.slice(1)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exchange Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <PieChart className="h-5 w-5" />
            <span>Exchange Distribution</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium">Volume Distribution</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">Centralized Exchanges</span>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{data.exchange_distribution.cex_percentage}%</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(data.exchange_distribution.cex_volume)}</p>
                  </div>
                </div>
                <Progress value={data.exchange_distribution.cex_percentage} className="h-2" />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Layers className="h-4 w-4 text-purple-600" />
                    <span className="text-sm">Decentralized Exchanges</span>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{data.exchange_distribution.dex_percentage}%</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(data.exchange_distribution.dex_volume)}</p>
                  </div>
                </div>
                <Progress value={data.exchange_distribution.dex_percentage} className="h-2" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium">Market Depth Analysis</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">1% Depth</span>
                  <span className="font-medium">{formatNumber(data.market_depth_analysis.depth_1_percent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">5% Depth</span>
                  <span className="font-medium">{formatNumber(data.market_depth_analysis.depth_5_percent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">10% Depth</span>
                  <span className="font-medium">{formatNumber(data.market_depth_analysis.depth_10_percent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Average Spread</span>
                  <span className={`font-medium ${getSpreadColor(data.market_depth_analysis.average_spread)}`}>
                    {(data.market_depth_analysis.average_spread * 100).toFixed(3)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Major Exchanges */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building2 className="h-5 w-5" />
            <span>Major Trading Venues</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.exchanges.map((exchange, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium">{exchange.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {exchange.volume_percentage.toFixed(1)}% of total volume
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getExchangeTypeBadge(exchange.type)}
                    {exchange.is_active ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <Zap className="h-3 w-3 mr-1" />
                        Active
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
                    <p className="text-muted-foreground">24h Volume</p>
                    <p className="font-medium text-lg">{formatNumber(exchange.volume_24h)}</p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Spread</p>
                    <p className={`font-medium ${getSpreadColor(exchange.spread)}`}>
                      {(exchange.spread * 100).toFixed(3)}%
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Market Depth (1%)</p>
                    <p className="font-medium">{formatNumber(exchange.market_depth_1_percent)}</p>
                  </div>
                  
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <div className="flex items-center space-x-1">
                      <RefreshCw className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">
                        {Math.floor((Date.now() - new Date(exchange.last_updated).getTime()) / 60000)}m ago
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground mb-2">Trading Pairs</p>
                  <div className="flex flex-wrap gap-2">
                    {exchange.trading_pairs.map((pair, pairIndex) => (
                      <Badge key={pairIndex} variant="outline" className="text-xs">
                        {pair}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-3">
                  <div className="text-sm text-muted-foreground">
                    Market share: {exchange.volume_percentage.toFixed(1)}%
                  </div>
                  {exchange.website_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(exchange.website_url, '_blank', 'noopener,noreferrer')}
                      className="flex items-center space-x-2"
                    >
                      <Globe className="h-3 w-3" />
                      <span>Visit Exchange</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Liquidity Pools */}
      {data.liquidity_pools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Layers className="h-5 w-5" />
              <span>Liquidity Pools</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.liquidity_pools.map((pool, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <Waves className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h4 className="font-medium">{pool.platform}</h4>
                        <p className="text-sm text-muted-foreground font-mono">
                          {pool.pool_address.slice(0, 10)}...{pool.pool_address.slice(-8)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getRiskLevelBadge(pool.risk_level)}
                      {pool.is_active ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          <Activity className="h-3 w-3 mr-1" />
                          Active
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
                      <p className="text-muted-foreground">Total Value Locked</p>
                      <p className="font-medium text-lg">{formatNumber(pool.tvl)}</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">24h Volume</p>
                      <p className="font-medium">{formatNumber(pool.volume_24h)}</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">APR</p>
                      <p className="font-medium text-green-600">{pool.apr.toFixed(1)}%</p>
                    </div>
                    
                    <div>
                      <p className="text-muted-foreground">Token Pair</p>
                      <p className="font-medium">{pool.token_pair}</p>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground mb-2">Pool Composition</p>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-blue-500 rounded"></div>
                        <span className="text-sm">{pool.pool_composition.token1_percentage}%</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-purple-500 rounded"></div>
                        <span className="text-sm">{pool.pool_composition.token2_percentage}%</span>
                      </div>
                    </div>
                    <div className="mt-2 flex h-2 rounded overflow-hidden">
                      <div 
                        className="bg-blue-500" 
                        style={{ width: `${pool.pool_composition.token1_percentage}%` }}
                      ></div>
                      <div 
                        className="bg-purple-500" 
                        style={{ width: `${pool.pool_composition.token2_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liquidation Risk Assessment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5" />
            <span>Liquidation Risk Assessment</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium">Risk Level: {data.liquidation_risk.risk_level.toUpperCase()}</h4>
              {getRiskLevelBadge(data.liquidation_risk.risk_level)}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h5 className="font-medium mb-3">Risk Factors</h5>
                <ul className="space-y-2">
                  {data.liquidation_risk.factors.map((factor, index) => (
                    <li key={index} className="flex items-start space-x-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h5 className="font-medium mb-3">Concentration Metrics</h5>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Concentrated Holdings</span>
                      <span className="text-sm font-medium">{data.liquidation_risk.concentrated_holdings}%</span>
                    </div>
                    <Progress value={data.liquidation_risk.concentrated_holdings} className="h-2" />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-foreground">Whale Concentration</span>
                      <span className="text-sm font-medium">{data.liquidation_risk.whale_concentration}%</span>
                    </div>
                    <Progress value={data.liquidation_risk.whale_concentration} className="h-2" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Liquidity Crisis */}
      {data.last_liquidity_crisis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span>Recent Liquidity Crisis</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-4 bg-red-50 border-red-200">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium">Liquidity Event</p>
                <Badge variant="outline" className="bg-red-100 text-red-800">
                  CRISIS
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {data.last_liquidity_crisis.description}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Crisis Date</p>
                  <p className="font-medium">{new Date(data.last_liquidity_crisis.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Impact Duration</p>
                  <p className="font-medium">{data.last_liquidity_crisis.impact_duration}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recovery Time</p>
                  <p className="font-medium">{data.last_liquidity_crisis.recovery_time}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 