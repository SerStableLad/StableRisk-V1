'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertTriangle, Shield, TrendingDown, TrendingUp, Info, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { StablecoinAPI } from '@/lib/api'
import type { EnhancedLiquidityData, ChainLiquidityScore } from '@/lib/types'

interface DetailedLiquidityReportProps {
  ticker: string
}

const DetailedLiquidityReport: React.FC<DetailedLiquidityReportProps> = ({ ticker }) => {
  const [liquidityData, setLiquidityData] = useState<EnhancedLiquidityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  
  // Ref to track current request and enable cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentTickerRef = useRef<string>('')

  const fetchLiquidityData = useCallback(async (tickerToFetch: string, retryAttempt: number = 0) => {
    try {
      // Cancel previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController()
      const { signal } = abortControllerRef.current

      setLoading(true)
      setError(null)
      
      // Check if this request is still relevant
      if (currentTickerRef.current !== tickerToFetch) {
        return // Component has moved on to a different ticker
      }

      const coinId = await StablecoinAPI.searchCoinId(tickerToFetch)
      
      // Check again before making the expensive API call
      if (currentTickerRef.current !== tickerToFetch || signal.aborted) {
        return
      }

      const data = await StablecoinAPI.getComprehensiveLiquidityAnalysis(coinId)
      
      // Final check before setting state
      if (currentTickerRef.current === tickerToFetch && !signal.aborted) {
        setLiquidityData(data)
        setRetryCount(0) // Reset retry count on success
      }
    } catch (err: any) {
      // Only set error if this request is still relevant and wasn't aborted
      if (currentTickerRef.current === tickerToFetch && !abortControllerRef.current?.signal.aborted) {
        console.error('Error fetching liquidity data:', err)
        
        // Implement exponential backoff for retries
        if (retryAttempt < 2 && !err.message?.includes('aborted')) {
          const retryDelay = Math.pow(2, retryAttempt) * 1000 // 1s, 2s, 4s
          setTimeout(() => {
            if (currentTickerRef.current === tickerToFetch) {
              setRetryCount(retryAttempt + 1)
              fetchLiquidityData(tickerToFetch, retryAttempt + 1)
            }
          }, retryDelay)
        } else {
          setError(`Failed to load liquidity data${retryAttempt > 0 ? ` (${retryAttempt + 1} attempts)` : ''}`)
        }
      }
    } finally {
      // Only set loading to false if this request is still relevant
      if (currentTickerRef.current === tickerToFetch && !abortControllerRef.current?.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  const handleRetry = useCallback(() => {
    setRetryCount(0)
    fetchLiquidityData(ticker)
  }, [ticker, fetchLiquidityData])

  useEffect(() => {
    // Update current ticker ref
    currentTickerRef.current = ticker
    
    // Reset state for new ticker
    setLiquidityData(null)
    setError(null)
    setRetryCount(0)
    
    // Debounce rapid ticker changes
    const timeoutId = setTimeout(() => {
      if (currentTickerRef.current === ticker) {
        fetchLiquidityData(ticker)
      }
    }, 100)

    // Cleanup function
    return () => {
      clearTimeout(timeoutId)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [ticker, fetchLiquidityData])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Detailed Liquidity Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !liquidityData) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Liquidity Analysis Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-gray-600">{error || 'No liquidity data available'}</p>
            {retryCount > 0 && (
              <p className="text-sm text-orange-600">
                Retry attempt {retryCount} of 3...
              </p>
            )}
            <button
              onClick={handleRetry}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getRiskColor = (score: number) => {
    if (score >= 7) return 'text-green-600'
    if (score >= 5) return 'text-yellow-600'
    if (score >= 3) return 'text-orange-600'
    return 'text-red-600'
  }

  const getRiskIcon = (level: string) => {
    switch (level.toLowerCase()) {
      case 'excellent':
      case 'strong':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'moderate':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'high':
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Info className="h-4 w-4 text-gray-500" />
    }
  }

  const formatCurrency = (amount: number) => {
    if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`
    if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`
    if (amount >= 1e3) return `$${(amount / 1e3).toFixed(1)}K`
    return `$${amount.toFixed(0)}`
  }

  const GlobalAggregationSection = () => (
    <div className="space-y-6">
      {/* Global Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Liquidity</p>
                <p className="text-2xl font-bold">{formatCurrency(liquidityData.total_liquidity_usd)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Global Risk Score</p>
                <p className={`text-2xl font-bold ${getRiskColor(liquidityData.global_risk_score)}`}>
                  {liquidityData.global_risk_score.toFixed(1)}/10
                </p>
              </div>
              <Shield className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Chains Analyzed</p>
                <p className="text-2xl font-bold">{liquidityData.chain_count}</p>
              </div>
              <Info className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Assessment Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Risk Assessment Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Global Risk Level</span>
                <Badge variant={liquidityData.global_risk_level === 'excellent' ? 'default' : 'secondary'}>
                  {liquidityData.global_risk_level}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Average Score per Chain</span>
                <span className={`font-semibold ${getRiskColor(liquidityData.avg_score_per_chain)}`}>
                  {liquidityData.avg_score_per_chain.toFixed(1)}/10
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Score Variance</span>
                <span className="font-semibold">{liquidityData.score_variance.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Critical Warnings</span>
                {liquidityData.has_critical_warnings ? (
                  <Badge variant="destructive">
                    {liquidityData.chains_with_critical_risk} chains
                  </Badge>
                ) : (
                  <Badge variant="default">None</Badge>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Concentration Risk</span>
                <Badge variant={liquidityData.concentration_risk ? 'destructive' : 'default'}>
                  {liquidityData.concentration_risk ? 'High' : 'Low'}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Diversification</span>
                <Badge variant={liquidityData.diversification_good ? 'default' : 'secondary'}>
                  {liquidityData.diversification_good ? 'Good' : 'Needs Improvement'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const ChainDiversitySection = () => (
    <div className="space-y-6">
      {liquidityData.chain_scores.map((chain: ChainLiquidityScore) => (
        <Card key={chain.chain_id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getRiskIcon(chain.risk_level)}
                {chain.chain_name}
                {chain.critical_warning && (
                  <Badge variant="destructive" className="ml-2">
                    Critical
                  </Badge>
                )}
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${getRiskColor(chain.final_score)}`}>
                  {chain.final_score.toFixed(1)}/10
                </div>
                <div className="text-sm text-gray-500 capitalize">{chain.risk_level}</div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Chain Overview */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Total Value Locked</span>
                    <span className="font-semibold">{formatCurrency(chain.tvl_usd)}</span>
                  </div>
                  <Progress 
                    value={(chain.tvl_usd / liquidityData.total_liquidity_usd) * 100} 
                    className="h-2" 
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {((chain.tvl_usd / liquidityData.total_liquidity_usd) * 100).toFixed(1)}% of total liquidity
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Base Score</span>
                    <span className="font-medium">{chain.base_score.toFixed(1)}/10</span>
                  </div>
                  {Object.entries(chain.adjustments).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {value >= 0 ? '+' : ''}{value.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DEX Analysis */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2 text-sm">DEX Distribution</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total DEXs</span>
                      <span className="font-medium">{chain.dex_analysis.total_dex_count}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>DEXs &gt;$100k</span>
                      <span className="font-medium">{chain.dex_analysis.dexs_over_100k}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Largest DEX Share</span>
                      <span className={`font-medium ${chain.dex_analysis.largest_dex_percent > 80 ? 'text-red-600' : 'text-green-600'}`}>
                        {chain.dex_analysis.largest_dex_percent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2 text-sm">Top DEXs</h4>
                  <div className="space-y-1">
                    {chain.dex_analysis.top_dexs.slice(0, 3).map((dex, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="truncate">{dex.name}</span>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(dex.liquidity_usd)}</div>
                          <div className="text-xs text-gray-500">{dex.percent.toFixed(1)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Pool Composition */}
            <div className="mt-6 pt-6 border-t">
              <h4 className="font-semibold mb-4">Pool Composition</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Stable/Stable Pairs</span>
                    <span className="font-medium text-green-600">
                      {chain.pool_composition.stable_stable_percent.toFixed(1)}%
                    </span>
                  </div>
                  <Progress 
                    value={chain.pool_composition.stable_stable_percent} 
                    className="h-2"
                  />
                  <div className="text-xs text-gray-500">Lower slippage risk</div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Volatile/Stable Pairs</span>
                    <span className={`font-medium ${chain.pool_composition.volatile_stable_percent > 50 ? 'text-red-600' : 'text-yellow-600'}`}>
                      {chain.pool_composition.volatile_stable_percent.toFixed(1)}%
                    </span>
                  </div>
                  <Progress 
                    value={chain.pool_composition.volatile_stable_percent} 
                    className="h-2"
                  />
                  <div className="text-xs text-gray-500">Higher slippage risk</div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Unknown Pairs</span>
                    <span className="font-medium text-gray-600">
                      {chain.pool_composition.unknown_percent.toFixed(1)}%
                    </span>
                  </div>
                  <Progress 
                    value={chain.pool_composition.unknown_percent} 
                    className="h-2"
                  />
                  <div className="text-xs text-gray-500">Unclassified pools</div>
                </div>
              </div>

              {/* Token Lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-2">Stable Tokens</div>
                  <div className="flex flex-wrap gap-1">
                    {chain.pool_composition.stable_tokens.map((token, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {token.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-600 mb-2">Volatile Tokens</div>
                  <div className="flex flex-wrap gap-1">
                    {chain.pool_composition.volatile_tokens.map((token, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {token.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )

  const RiskFactorsSection = () => (
    <div className="space-y-6">
      {liquidityData.chain_scores.map((chain: ChainLiquidityScore) => (
        <Card key={chain.chain_id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getRiskIcon(chain.risk_level)}
              {chain.chain_name} Risk Factors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Concentration Risks */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm">Concentration Risks</h4>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      {chain.risk_factors.high_lp_centralization ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium">LP Centralization</span>
                    </div>
                    <Badge variant={chain.risk_factors.high_lp_centralization ? 'destructive' : 'default'}>
                      {chain.risk_factors.high_lp_centralization ? 'High Risk' : 'Low Risk'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      {chain.risk_factors.concentration_risk ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium">DEX Concentration</span>
                    </div>
                    <Badge variant={chain.risk_factors.concentration_risk ? 'destructive' : 'default'}>
                      {chain.risk_factors.concentration_risk ? 'High Risk' : 'Distributed'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Security Risks */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm">Security Risks</h4>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      {chain.risk_factors.flash_loan_vulnerability ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium">Flash Loan Risk</span>
                    </div>
                    <Badge variant={chain.risk_factors.flash_loan_vulnerability ? 'destructive' : 'default'}>
                      {chain.risk_factors.flash_loan_vulnerability ? 'Vulnerable' : 'Protected'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      {chain.risk_factors.no_monitoring_controls ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium">Monitoring Controls</span>
                    </div>
                    <Badge variant={chain.risk_factors.no_monitoring_controls ? 'destructive' : 'default'}>
                      {chain.risk_factors.no_monitoring_controls ? 'No Controls' : 'Active'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Events */}
            {chain.risk_factors.recent_drain_events.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h4 className="font-semibold text-sm mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Recent Drain Events
                </h4>
                <div className="space-y-2">
                  {chain.risk_factors.recent_drain_events.map((event, index) => (
                    <div key={index} className="p-3 rounded-lg bg-red-50 border border-red-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-sm text-red-800">{event.type}</div>
                          <div className="text-sm text-red-600">{event.description}</div>
                        </div>
                        <Badge variant="destructive" className="text-xs">
                          {formatCurrency(event.liquidity_usd)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Confidence */}
            <div className="mt-6 pt-6 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Data Confidence</span>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {(chain.data_confidence * 100).toFixed(0)}%
                  </div>
                  <Progress value={chain.data_confidence * 100} className="w-20 h-2 mt-1" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Detailed Liquidity Analysis - {ticker.toUpperCase()}
        </CardTitle>
        <p className="text-sm text-gray-600">
          Comprehensive multi-chain liquidity assessment based on {liquidityData.data_sources.join(', ')} data
        </p>
        <p className="text-xs text-gray-500">
          Last updated: {new Date(liquidityData.analysis_timestamp).toLocaleString()}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="global" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="global">Global Aggregation</TabsTrigger>
            <TabsTrigger value="chains">DEX Diversity</TabsTrigger>
            <TabsTrigger value="risks">Risk Factors</TabsTrigger>
          </TabsList>
          
          <TabsContent value="global" className="mt-6">
            <GlobalAggregationSection />
          </TabsContent>
          
          <TabsContent value="chains" className="mt-6">
            <ChainDiversitySection />
          </TabsContent>
          
          <TabsContent value="risks" className="mt-6">
            <RiskFactorsSection />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default DetailedLiquidityReport 