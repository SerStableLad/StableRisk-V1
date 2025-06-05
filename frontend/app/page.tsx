"use client"

import React, { useState } from 'react'
import { SearchBar } from '@/components/search-bar'
import { StablecoinAPI } from '@/lib/api'
import type { StablecoinAnalysis } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getRiskLevel, getRiskColor, formatMarketCap, formatPercentage, generateCriticalIssueSummary, generateOutstandingIssueSummary } from '@/lib/utils'
import { AlertCircle, TrendingUp, Database, FileText, Users, Activity, AlertTriangle, Clock } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { PriceChart } from '@/components/price-chart'
import { ReserveTransparencyReport } from '@/components/reserve-transparency-report'
import DetailedLiquidityReport from '@/components/detailed-liquidity-report'

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
            <div className="flex flex-col items-center justify-center mb-6">
              <h1 className="text-4xl md:text-6xl font-bold">
                StableRisk
              </h1>
              <a 
                href="https://x.com/SerStableLad" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-primary transition-colors mt-2"
              >
                by SerStableLad
              </a>
            </div>
            <p className="text-xl md:text-2xl text-muted-foreground mb-4 max-w-3xl mx-auto">
              Comprehensive risk assessment for stablecoins. Analyze price stability, 
              liquidity, security, and more with our advanced AI-powered platform. NFA
            </p>
            <p className="text-xs text-muted-foreground/80 mb-8 max-w-2xl mx-auto">
              * Not financial advice. This platform provides educational analysis only. Always conduct your own research and consult with financial professionals before making investment decisions.
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
            <div className="space-y-6">
              
              {/* Price Stability Chart */}
              {analysis.price_stability.detailed_analysis ? (
                <PriceChart 
                  analysis={analysis.price_stability.detailed_analysis} 
                  symbol={analysis.basic_info.symbol}
                />
              ) : (
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
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Price stability data not available. This may indicate limited price history or 
                        insufficient data points for analysis.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Oracle Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Oracle Infrastructure</CardTitle>
                  <CardDescription>Price feed and data sources</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Primary Oracle Type</p>
                    <p className="font-semibold">{analysis.oracle.oracle_type}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Backup Oracle</p>
                      <Badge variant={analysis.oracle.has_backup ? 'success' : 'danger'}>
                        {analysis.oracle.has_backup ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Primary Update Interval</p>
                      <p className="text-sm font-medium">
                        {analysis.oracle.oracle_types_available && 
                         analysis.oracle.oracle_types_available['Chainlink'] ? 
                         analysis.oracle.oracle_types_available['Chainlink'].update_interval : 
                         analysis.oracle.update_interval || 'Variable'}
                      </p>
                    </div>
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

                  {/* Oracle Summary Information */}
                  {analysis.oracle.oracle_summary && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-3">Oracle Analysis Summary</h4>
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Total Oracles</p>
                            <p className="font-medium">{analysis.oracle.oracle_summary.oracle_summary?.total_oracles || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Oracle Health</p>
                            <Badge variant={
                              analysis.oracle.oracle_summary.oracle_summary?.oracle_health === 'Excellent' ? 'success' :
                              analysis.oracle.oracle_summary.oracle_summary?.oracle_health === 'Good' ? 'warning' : 'danger'
                            }>
                              {analysis.oracle.oracle_summary.oracle_summary?.oracle_health || 'Unknown'}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Risk Level</p>
                            <Badge variant={
                              analysis.oracle.oracle_summary.oracle_summary?.risk_level === 'Low' ? 'success' :
                              analysis.oracle.oracle_summary.oracle_summary?.risk_level === 'Medium' ? 'warning' : 'danger'
                            }>
                              {analysis.oracle.oracle_summary.oracle_summary?.risk_level || 'Unknown'}
                            </Badge>
                          </div>
                        </div>
                        
                        {analysis.oracle.oracle_summary.key_insights && (
                          <div>
                            <p className="text-sm font-medium text-muted-foreground mb-2">Key Insights</p>
                            <ul className="space-y-1">
                              {analysis.oracle.oracle_summary.key_insights.map((insight: string, index: number) => (
                                <li key={index} className="text-sm flex items-start gap-2">
                                  <span className="text-blue-500 mt-1">•</span>
                                  <span>{insight}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Available Oracle Types */}
                  {analysis.oracle.oracle_types_available && Object.keys(analysis.oracle.oracle_types_available).length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-3">Available Oracle Providers</h4>
                      <div className="space-y-3">
                        {Object.entries(analysis.oracle.oracle_types_available).map(([oracleType, details]: [string, any]) => (
                          <div key={oracleType} className="p-3 border rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <h5 className="font-medium">{oracleType}</h5>
                              <div className="flex gap-2">
                                <Badge variant={
                                  details.reliability === 'High' ? 'success' :
                                  details.reliability === 'Medium' ? 'warning' : 'danger'
                                }>
                                  {details.reliability} Reliability
                                </Badge>
                                <Badge variant={
                                  details.centralization === 'Low' ? 'success' :
                                  details.centralization === 'Medium' ? 'warning' : 'danger'
                                }>
                                  {details.centralization} Centralization
                                </Badge>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {details.description}
                            </p>
                            <div className="text-xs space-y-1">
                              {details.update_interval && (
                                <p><strong>Update Interval:</strong> {details.update_interval}</p>
                              )}
                              {details.security_features && (
                                <p><strong>Security Features:</strong> {details.security_features.join(', ')}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risk Levels Information */}
                  {analysis.oracle.risk_levels_info && Object.keys(analysis.oracle.risk_levels_info).length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-3">Oracle Risk Levels</h4>
                      <div className="space-y-2">
                        {Object.entries(analysis.oracle.risk_levels_info).map(([level, description]: [string, string]) => (
                          <div key={level} className="flex items-start gap-3">
                            <Badge variant={
                              level === 'Low' ? 'success' :
                              level === 'Medium' ? 'warning' :
                              level === 'High' ? 'danger' : 'destructive'
                            } className="mt-0.5">
                              {level}
                            </Badge>
                            <p className="text-sm text-muted-foreground flex-1">{description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Detailed Liquidity Analysis */}
              <div className="col-span-full">
                <DetailedLiquidityReport ticker={analysis.basic_info.symbol} />
              </div>

              {/* Reserve Transparency Report */}
              <div className="col-span-full">
                <ReserveTransparencyReport 
                  transparencyData={analysis.transparency}
                  stablecoinName={analysis.basic_info.name}
                  symbol={analysis.basic_info.symbol}
                />
              </div>

              {/* Security Audits */}
              <Card>
                <CardHeader>
                  <CardTitle>🔍 Security Audits</CardTitle>
                  <CardDescription>Comprehensive audit history and security assessments</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analysis.audits && analysis.audits.length > 0 ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Total Audits</p>
                          <p className="text-2xl font-bold">{analysis.audits.length}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Critical Issues</p>
                          <p className="text-2xl font-bold text-red-600">
                            {analysis.audits.reduce((sum, audit) => sum + audit.critical_issues, 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Outstanding Issues</p>
                          <p className="text-2xl font-bold text-yellow-600">
                            {analysis.audits.reduce((sum, audit) => sum + audit.outstanding_issues, 0)}
                          </p>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="text-sm font-medium mb-3">Audit History</h4>
                        <div className="space-y-3">
                          {analysis.audits
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((audit, index) => {
                              const auditDate = new Date(audit.date)
                              const sixMonthsAgo = new Date()
                              sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
                              const isOlderThan6Months = auditDate < sixMonthsAgo
                              
                              // Generate issue summaries for this audit
                              const criticalSummaries = generateCriticalIssueSummary(audit.auditor, audit.critical_issues, audit.resolved_issues)
                              const outstandingSummaries = generateOutstandingIssueSummary(audit.auditor, audit.outstanding_issues)
                              
                              return (
                                <div 
                                  key={index} 
                                  className={`p-4 border rounded-lg ${isOlderThan6Months ? 'opacity-60' : ''}`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                      <h5 className={`font-medium ${isOlderThan6Months ? 'text-gray-500' : ''}`}>
                                        {audit.auditor}
                                      </h5>
                                      {isOlderThan6Months && (
                                        <Badge variant="secondary" className="text-xs">
                                          Older than 6 months
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-sm font-medium ${isOlderThan6Months ? 'text-gray-500' : ''}`}>
                                        {auditDate.toLocaleDateString()}
                                      </p>
                                      {audit.report_url && (
                                        <a 
                                          href={audit.report_url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className={`text-xs hover:underline ${isOlderThan6Months ? 'text-gray-400' : 'text-blue-600'}`}
                                        >
                                          View Report
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                                    <div>
                                      <p className={`text-muted-foreground ${isOlderThan6Months ? 'text-gray-400' : ''}`}>
                                        Critical Issues
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <span className={`font-medium ${
                                          audit.critical_issues > 0 ? 'text-red-600' : 'text-green-600'
                                        } ${isOlderThan6Months ? 'opacity-60' : ''}`}>
                                          {audit.critical_issues}
                                        </span>
                                        {audit.critical_issues === 0 && (
                                          <Badge variant="success" className="text-xs">None</Badge>
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <p className={`text-muted-foreground ${isOlderThan6Months ? 'text-gray-400' : ''}`}>
                                        Resolved
                                      </p>
                                      <span className={`font-medium text-green-600 ${isOlderThan6Months ? 'opacity-60' : ''}`}>
                                        {audit.resolved_issues}
                                      </span>
                                    </div>
                                    <div>
                                      <p className={`text-muted-foreground ${isOlderThan6Months ? 'text-gray-400' : ''}`}>
                                        Outstanding
                                      </p>
                                      <div className="flex items-center gap-2">
                                        <span className={`font-medium ${
                                          audit.outstanding_issues > 0 ? 'text-yellow-600' : 'text-green-600'
                                        } ${isOlderThan6Months ? 'opacity-60' : ''}`}>
                                          {audit.outstanding_issues}
                                        </span>
                                        {audit.outstanding_issues === 0 && (
                                          <Badge variant="success" className="text-xs">All resolved</Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Critical Issues Summary */}
                                  {criticalSummaries.length > 0 && (
                                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                                      <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                        <h6 className="text-sm font-medium text-red-800 dark:text-red-200">
                                          Critical Issues Summary
                                        </h6>
                                      </div>
                                      <ul className="space-y-1">
                                        {criticalSummaries.map((issueObj, issueIndex) => (
                                          <li key={issueIndex} className="flex items-start gap-2 text-xs">
                                            <span className="text-red-500 mt-1">•</span>
                                            <div className="flex-1">
                                              <span className={`${issueObj.isResolved ? 'line-through text-red-500 dark:text-red-400' : 'text-red-700 dark:text-red-300'}`}>
                                                {issueObj.description}
                                              </span>
                                              {issueObj.isResolved && (
                                                <span className="ml-2 text-green-600 dark:text-green-400 font-medium">
                                                  ✓ Resolved
                                                </span>
                                              )}
                                            </div>
                                          </li>
                                        ))}
                                      </ul>
                                      {audit.critical_issues > criticalSummaries.length && (
                                        <p className="text-xs text-red-600 dark:text-red-400 italic mt-2">
                                          +{audit.critical_issues - criticalSummaries.length} additional critical issue(s)
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Outstanding Issues Summary */}
                                  {outstandingSummaries.length > 0 && (
                                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                                        <h6 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                          Outstanding Recommendations
                                        </h6>
                                      </div>
                                      <ul className="space-y-1">
                                        {outstandingSummaries.map((issue, issueIndex) => (
                                          <li key={issueIndex} className="flex items-start gap-2 text-xs">
                                            <span className="text-yellow-500 mt-1">•</span>
                                            <span className="text-yellow-700 dark:text-yellow-300">{issue}</span>
                                          </li>
                                        ))}
                                      </ul>
                                      {audit.outstanding_issues > outstandingSummaries.length && (
                                        <p className="text-xs text-yellow-600 dark:text-yellow-400 italic mt-2">
                                          +{audit.outstanding_issues - outstandingSummaries.length} additional recommendation(s)
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-2">⚠️ No audit information available</p>
                      <p className="text-sm text-muted-foreground">
                        This stablecoin may not have undergone public security audits or audit data is not publicly available.
                      </p>
                    </div>
                  )}
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