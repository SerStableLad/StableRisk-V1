'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { TransparencyData } from '@/lib/types'

import { 
  Eye, 
  ExternalLink, 
  Shield, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  FileText,
  Calendar,
  Building,
  PieChart as PieChartIcon,
  TrendingUp,
  DollarSign,
  Info,
  Layers
} from 'lucide-react'

interface AttestationProvider {
  name: string
  type: 'audit_firm' | 'blockchain_analytics' | 'self_reported'
  reputation_score: number
  last_report_date: string
  report_url?: string
  is_verified: boolean
}



// Remove local TransparencyData interface - use global one from types.ts
// The global TransparencyData interface includes collateral_data which we need

interface TransparencySectionProps {
  ticker: string
  data?: (TransparencyData & {
    proof_of_reserves_score: number
    attestation_providers: AttestationProvider[]
    transparency_issues: string[]
    reserve_composition?: {
      cash_and_equivalents: number
      treasury_bills: number
      other_investments: number
      crypto_assets?: number
    }
    is_verified_source: boolean
  }) | null
}

const getUpdateFrequencyBadge = (frequency: string) => {
  switch (frequency) {
    case 'real-time':
      return <Badge variant="default" className="bg-green-100 text-green-800">Real-time</Badge>
    case 'daily':
      return <Badge variant="default" className="bg-green-100 text-green-800">Daily</Badge>
    case 'weekly':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Weekly</Badge>
    case 'monthly':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Monthly</Badge>
    case 'none':
      return <Badge variant="destructive">No Updates</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

const getProviderTypeBadge = (type: string) => {
  switch (type) {
    case 'audit_firm':
      return null // Remove audit firm badge
    case 'blockchain_analytics':
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Blockchain Analytics</Badge>
    case 'self_reported':
      return <Badge variant="outline">Self-reported</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

const getReputationColor = (score: number) => {
  if (score >= 8.0) return 'text-green-600'
  if (score >= 6.0) return 'text-yellow-600'
  return 'text-red-600'
}

const getAssetTypeColor = (assetType: string) => {
  const type = assetType.toLowerCase()
  if (type.includes('cash') || type.includes('money market')) return 'bg-green-100 text-green-800'
  if (type.includes('treasury') || type.includes('government')) return 'bg-blue-100 text-blue-800'
  if (type.includes('commercial') || type.includes('corporate')) return 'bg-purple-100 text-purple-800'
  if (type.includes('crypto') || type.includes('usdc') || type.includes('usdt')) return 'bg-orange-100 text-orange-800'
  return 'bg-gray-100 text-gray-800'
}

const formatCurrency = (amount: number) => {
  if (amount >= 1e9) {
    return `$${(amount / 1e9).toFixed(1)}B`
  } else if (amount >= 1e6) {
    return `$${(amount / 1e6).toFixed(1)}M`
  } else if (amount >= 1e3) {
    return `$${(amount / 1e3).toFixed(1)}K`
  }
  return `$${amount.toLocaleString()}`
}

const formatPercentage = (value: number) => {
  return `${value.toFixed(1)}%`
}

// Collateral Loading Skeleton Component
const CollateralSkeleton = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center space-x-2">
        <Layers className="h-5 w-5" />
        <span>Collateral Breakdown</span>
        <Skeleton className="h-6 w-20 rounded-full ml-2" />
      </CardTitle>
      <Skeleton className="h-4 w-72 mt-2" />
    </CardHeader>
    <CardContent className="space-y-6">
      {/* Total Assets Overview Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
        <div className="text-center space-y-2">
          <Skeleton className="h-4 w-20 mx-auto" />
          <Skeleton className="h-8 w-16 mx-auto" />
        </div>
        <div className="text-center space-y-2">
          <Skeleton className="h-4 w-24 mx-auto" />
          <Skeleton className="h-8 w-16 mx-auto" />
        </div>
        <div className="text-center space-y-2">
          <Skeleton className="h-4 w-28 mx-auto" />
          <Skeleton className="h-8 w-16 mx-auto" />
        </div>
      </div>

      {/* Asset Allocation List Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
        </div>
        
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="text-right space-y-1">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Extraction Metadata Skeleton */}
      <div className="p-4 bg-muted/20 rounded-lg space-y-2">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
    </CardContent>
  </Card>
)





export function TransparencySection({ ticker, data: propData }: TransparencySectionProps) {

  // Use real data only - no fallback to mock data
  if (!propData) {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold">Transparency & Proof of Reserves</h2>
          <p className="text-sm text-muted-foreground">Unable to retrieve transparency data</p>
        </div>
        
        <Card>
          <CardContent className="text-center py-6">
            <Eye className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No transparency data available</p>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  const data = propData
  
  return (
    <div className="space-y-4">
      {/* Compact Section Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold">Transparency & Proof of Reserves</h2>
      </div>

      {/* Transparency Issues Alert */}
      {data.transparency_issues.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50 py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm">Transparency Concerns</AlertTitle>
          <AlertDescription className="text-xs mt-1">
            {data.transparency_issues.join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {/* Single Consolidated Card */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Top Row: Score + Key Metrics */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Proof of Reserves Score</p>
              <p className="text-2xl font-bold">{data.proof_of_reserves_score}/100</p>
            </div>
            
            {/* Key Metrics in Horizontal Layout */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="text-center">
                <p className="text-muted-foreground">Updated</p>
                <p className="font-medium">{new Date(data.last_update_date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Status</p>
                <p className={`font-medium ${data.is_verified_source ? 'text-green-600' : 'text-red-600'}`}>
                  {data.is_verified_source ? 'Verified' : 'Unverified'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">Providers</p>
                <p className="font-medium">{data.attestation_providers.length}</p>
              </div>
            </div>
            
            {data.dashboard_url && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(data.dashboard_url, '_blank', 'noopener,noreferrer')}
                className="flex items-center space-x-1 h-8 px-2"
              >
                <ExternalLink className="h-3 w-3" />
                <span className="text-xs">Dashboard</span>
              </Button>
            )}
          </div>

          {/* Collateral Data - Comprehensive but Compact */}
          {data.collateral_data && (data.collateral_data.total_assets || data.collateral_data.collateral_allocations?.length > 0 || data.collateral_data.confidence) && (
            <div className="space-y-3 border-t pt-3">
              {/* Financial Overview - Horizontal Layout */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                {data.collateral_data.total_assets && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Total Assets</p>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(data.collateral_data.total_assets)}
                    </p>
                  </div>
                )}
                {data.collateral_data.total_liabilities && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Tokens Minted</p>
                    <p className="text-lg font-bold text-blue-600">
                      {formatCurrency(data.collateral_data.total_liabilities)}
                    </p>
                  </div>
                )}
                {data.collateral_data.overcollateralization_ratio && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Collat. Rate</p>
                    <p className={`text-lg font-bold ${data.collateral_data.overcollateralization_ratio >= 1.0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(data.collateral_data.overcollateralization_ratio * 100).toFixed(1)}%
                    </p>
                  </div>
                )}
                {data.collateral_data.confidence !== undefined && data.collateral_data.confidence !== null && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(data.collateral_data.confidence * 100)}% confidence
                  </Badge>
                )}
              </div>

              {/* Asset Allocation - Compact List */}
              {data.collateral_data.collateral_allocations && data.collateral_data.collateral_allocations.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center space-x-1">
                      <PieChartIcon className="h-4 w-4" />
                      <span>Asset Allocation</span>
                    </h4>
                    <span className="text-xs text-muted-foreground">{data.collateral_data.collateral_allocations.length} types</span>
                  </div>
                  
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {data.collateral_data.collateral_allocations.map((allocation, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="flex items-center space-x-2 flex-1">
                        <Badge 
                          variant="outline" 
                          className={`${getAssetTypeColor(allocation.asset_type)} text-xs py-0 px-1`}
                        >
                          {allocation.asset_type}
                        </Badge>
                        {allocation.percentage && (
                          <div className="flex items-center space-x-2 flex-1">
                            <div className="flex-1 bg-muted rounded-full h-1.5 max-w-20">
                              <div 
                                className="bg-primary h-1.5 rounded-full"
                                style={{ width: `${Math.min(allocation.percentage, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-medium w-10 text-right">
                              {formatPercentage(allocation.percentage)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {(allocation.market_value || allocation.value_usd) && (
                        <div className="text-right">
                          <p className="text-sm font-bold">
                            {formatCurrency(allocation.market_value || allocation.value_usd || 0)}
                          </p>
                        </div>
                      )}
                    </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center space-x-1">
                    <PieChartIcon className="h-4 w-4" />
                    <span>Asset Allocation</span>
                  </h4>
                  <div className="p-3 border rounded-lg text-center text-sm text-muted-foreground">
                    Asset allocation data is being processed...
                  </div>
                </div>
              )}

              {/* Attestation Providers - Horizontal Compact */}
              {data.attestation_providers && data.attestation_providers.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <h4 className="text-sm font-semibold flex items-center space-x-1">
                    <Shield className="h-4 w-4 text-blue-600" />
                    <span>Third-Party Verification</span>
                  </h4>
                  
                  <div className="space-y-1">
                    {data.attestation_providers.map((provider, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">{provider.name}</span>
                          {getProviderTypeBadge(provider.type)}
                          {provider.is_verified && (
                            <CheckCircle className="h-3 w-3 text-green-600" />
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                          <span className={`font-medium ${getReputationColor(provider.reputation_score)}`}>
                            {provider.reputation_score.toFixed(1)}/10
                          </span>
                          <span>{new Date(provider.last_report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          {provider.report_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(provider.report_url, '_blank', 'noopener,noreferrer')}
                              className="h-6 px-1 text-xs"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reserve Composition - Inline if available */}
              {data.reserve_composition && (
                <div className="flex items-center justify-between text-xs border-t pt-3">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <span className="text-muted-foreground">Cash:</span>
                      <span className="font-medium text-green-600">{data.reserve_composition.cash_and_equivalents}%</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-muted-foreground">Treasury:</span>
                      <span className="font-medium text-blue-600">{data.reserve_composition.treasury_bills}%</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-muted-foreground">Other:</span>
                      <span className="font-medium text-purple-600">{data.reserve_composition.other_investments}%</span>
                    </div>
                    {data.reserve_composition.crypto_assets !== undefined && (
                      <div className="flex items-center space-x-1">
                        <span className="text-muted-foreground">Crypto:</span>
                        <span className="font-medium text-orange-600">{data.reserve_composition.crypto_assets}%</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Footer Info - Inline */}
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                <div className="flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>Updated: {data.collateral_data.last_updated ? new Date(data.collateral_data.last_updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}</span>
                </div>
                {data.collateral_data.report_url && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => window.open(data.collateral_data!.report_url, '_blank', 'noopener,noreferrer')}
                    className="h-6 px-2 text-xs"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Source Report
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}