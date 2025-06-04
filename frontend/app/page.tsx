"use client"

import React, { useState } from 'react'
import { SearchBar } from '@/components/search-bar'
import { StablecoinAPI } from '@/lib/api'
import type { StablecoinAnalysis } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getRiskLevel, getRiskColor, formatMarketCap, formatPercentage } from '@/lib/utils'
import { AlertCircle, TrendingUp, Database, FileText, Users, Activity } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

export default function HomePage() {
  const [analysis, setAnalysis] = useState<StablecoinAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (ticker: string) => {
    setIsLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      const result = await StablecoinAPI.getComprehensiveAnalysis(ticker)
      setAnalysis(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsLoading(false)
    }
  }

  const getRiskBadgeVariant = (score: number) => {
    if (score >= 8) return 'success'    // High score = Low risk (green/success)
    if (score >= 6) return 'warning'    // Medium score = Medium risk (yellow/warning)  
    if (score >= 3) return 'danger'     // Low score = High risk (orange/danger)
    return 'destructive'                // Very low score = Critical risk (red/destructive)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto">
          {/* Header with Theme Toggle */}
          <div className="flex justify-end mb-8">
            <ThemeToggle />
          </div>
          
          {/* Main Content */}
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              StableRisk
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Comprehensive risk assessment for stablecoins. Analyze price stability, 
              liquidity, security, and more with our advanced AI-powered platform.
            </p>
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          </div>
        </div>
      </section>

      {/* Error Display */}
      {error && (
        <section className="py-8 px-4">
          <div className="container mx-auto">
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <p className="font-medium">Analysis Failed</p>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{error}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Analysis Results */}
      {analysis && (
        <section className="py-8 px-4">
          <div className="container mx-auto space-y-8">
            
            {/* Stablecoin Overview */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-3xl">
                      {analysis.basic_info.name} ({analysis.basic_info.symbol})
                    </CardTitle>
                    <CardDescription>
                      {analysis.basic_info.description || 'Stablecoin risk analysis'}
                    </CardDescription>
                  </div>
                  <Badge 
                    variant={getRiskBadgeVariant(analysis.risk_assessment.overall_score)}
                    className="text-lg px-4 py-2"
                  >
                    {getRiskLevel(analysis.risk_assessment.overall_score)} Risk
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Risk Score</p>
                    <p className={`text-2xl font-bold ${getRiskColor(analysis.risk_assessment.overall_score)}`}>
                      {analysis.risk_assessment.overall_score.toFixed(1)}/10
                    </p>
                  </div>
                  {analysis.basic_info.market_cap && (
                    <div>
                      <p className="text-sm text-muted-foreground">Market Cap</p>
                      <p className="text-2xl font-bold">
                        {formatMarketCap(analysis.basic_info.market_cap)}
                      </p>
                    </div>
                  )}
                  {analysis.basic_info.current_price && (
                    <div>
                      <p className="text-sm text-muted-foreground">Current Price</p>
                      <p className="text-2xl font-bold">
                        ${analysis.basic_info.current_price.toFixed(4)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-6">
                  <p className="text-sm text-muted-foreground mb-2">Risk Summary</p>
                  <p className="text-sm">{analysis.risk_assessment.summary}</p>
                </div>
              </CardContent>
            </Card>

            {/* Risk Factor Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { 
                  key: 'price_stability', 
                  label: 'Price Stability', 
                  icon: TrendingUp,
                  description: 'Peg maintenance and volatility'
                },
                { 
                  key: 'liquidity', 
                  label: 'Liquidity', 
                  icon: Activity,
                  description: 'Market depth and trading volume'
                },
                { 
                  key: 'oracle', 
                  label: 'Oracle Risk', 
                  icon: Database,
                  description: 'Price feed reliability and decentralization'
                },
                { 
                  key: 'audit', 
                  label: 'Audit Quality', 
                  icon: FileText,
                  description: 'Security audits and code reviews'
                },
                { 
                  key: 'centralization', 
                  label: 'Reserve Transparency', 
                  icon: FileText,
                  description: 'Reserve backing and transparency reporting'
                }
              ].map(({ key, label, icon: Icon, description }) => {
                const score = analysis.risk_assessment.factors[key as keyof typeof analysis.risk_assessment.factors]
                const details = analysis.risk_assessment.factor_details?.[key as keyof typeof analysis.risk_assessment.factor_details]
                
                return (
                  <Card key={key}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-lg">{label}</CardTitle>
                      </div>
                      <CardDescription>{description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className={`text-2xl font-bold ${getRiskColor(score)}`}>
                            {score.toFixed(1)}
                          </span>
                          <Badge variant={getRiskBadgeVariant(score)}>
                            {getRiskLevel(score)}
                          </Badge>
                        </div>
                        
                        {/* Detailed Analysis */}
                        {details && (
                          <div className="space-y-3 pt-3 border-t">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground mb-1">Analysis</p>
                              <p className="text-sm">{details.description}</p>
                            </div>
                            
                            {/* Source and Provider Information */}
                            <div className="space-y-2">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Data Source</p>
                                <p className="text-xs">{details.source}</p>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Service Provider</p>
                                <p className="text-xs">{details.provider}</p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <p className="text-muted-foreground">Data Quality</p>
                                <Badge variant={details.data_available ? 'success' : 'secondary'} className="text-xs">
                                  {details.data_available ? 'Available' : 'Limited'}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Confidence</p>
                                <span className={`font-medium ${
                                  details.confidence > 0.7 ? 'text-green-600 dark:text-green-400' :
                                  details.confidence > 0.4 ? 'text-yellow-600 dark:text-yellow-400' :
                                  'text-red-600 dark:text-red-400'
                                }`}>
                                  {(details.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Risk Warnings and Recommendations */}
            {((analysis.risk_assessment.warnings?.length ?? 0) > 0 || (analysis.risk_assessment.recommendations?.length ?? 0) > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Warnings */}
                {(analysis.risk_assessment.warnings?.length ?? 0) > 0 && (
                  <Card className="border-yellow-200 dark:border-yellow-800">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                        <CardTitle className="text-yellow-800 dark:text-yellow-200">Risk Warnings</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {analysis.risk_assessment.warnings?.map((warning, index) => (
                          <li key={index} className="text-sm flex items-start gap-2">
                            <span className="text-yellow-600 dark:text-yellow-400 mt-1">•</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                {(analysis.risk_assessment.recommendations?.length ?? 0) > 0 && (
                  <Card className="border-blue-200 dark:border-blue-800">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <CardTitle className="text-blue-800 dark:text-blue-200">Recommendations</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {analysis.risk_assessment.recommendations?.map((recommendation, index) => (
                          <li key={index} className="text-sm flex items-start gap-2">
                            <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                            <span>{recommendation}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Additional Analysis Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Price Stability Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Price Stability Analysis</CardTitle>
                  <CardDescription>Historical peg performance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Max Deviation</p>
                      <p className="font-semibold">
                        {formatPercentage(analysis.price_stability.max_deviation)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Deviation</p>
                      <p className="font-semibold">
                        {formatPercentage(analysis.price_stability.avg_deviation)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Depeg Events</p>
                      <p className="font-semibold">{analysis.price_stability.depeg_events}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Recovery Time</p>
                      <p className="font-semibold">{analysis.price_stability.recovery_time_avg}h</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Oracle Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Oracle Infrastructure</CardTitle>
                  <CardDescription>Price feed and data sources</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Oracle Type</p>
                    <p className="font-semibold">{analysis.oracle.oracle_type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Backup Oracle</p>
                    <Badge variant={analysis.oracle.has_backup ? 'success' : 'danger'}>
                      {analysis.oracle.has_backup ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Centralization Risk</p>
                      <p className={`font-semibold ${getRiskColor(analysis.oracle.centralization_risk)}`}>
                        {analysis.oracle.centralization_risk.toFixed(1)}/10
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Reliability Score</p>
                      <p className={`font-semibold ${getRiskColor(10 - analysis.oracle.reliability_score)}`}>
                        {analysis.oracle.reliability_score.toFixed(1)}/10
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Footer */}
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground text-center">
                  Analysis completed on {new Date(analysis.last_updated).toLocaleString()}
                  <br />
                  Confidence Score: {(analysis.risk_assessment.confidence * 100).toFixed(0)}%
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      )}
    </div>
  )
} 