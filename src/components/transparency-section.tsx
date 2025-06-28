'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
  DollarSign
} from 'lucide-react'

interface AttestationProvider {
  name: string
  type: 'audit_firm' | 'blockchain_analytics' | 'self_reported'
  reputation_score: number
  last_report_date: string
  report_url?: string
  is_verified: boolean
}



interface TransparencyData {
  dashboard_url?: string
  has_proof_of_reserves: boolean
  proof_of_reserves_score: number
  attestation_providers: AttestationProvider[]
  update_frequency: 'real-time' | 'daily' | 'weekly' | 'monthly' | 'none' | 'unknown'
  last_updated: string
  transparency_issues: string[]
  reserve_composition?: {
    cash_and_equivalents: number
    treasury_bills: number
    other_investments: number
    crypto_assets?: number
  }
  is_verified_source: boolean
}

interface TransparencySectionProps {
  ticker: string
  data?: TransparencyData | null
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
      return <Badge variant="default" className="bg-green-100 text-green-800">Audit Firm</Badge>
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





export function TransparencySection({ ticker, data: propData }: TransparencySectionProps) {
  // Debug logging to see what data we're receiving
  console.log('🔍 TransparencySection Debug:', {
    ticker,
    hasData: !!propData
  })

  // Use real data only - no fallback to mock data
  if (!propData) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold">Transparency & Proof of Reserves</h2>
          <p className="text-muted-foreground">Unable to retrieve transparency data</p>
        </div>
        
        {/* Show placeholder card when no data is available */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>Transparency Dashboard</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
              <p>No transparency dashboard data available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  const data = propData
  
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Transparency & Proof of Reserves</h2>
        <p className="text-muted-foreground">
          Verification of stablecoin backing and reserve transparency
        </p>
      </div>

      {/* Transparency Issues Alert */}
      {data.transparency_issues.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Transparency Concerns</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {data.transparency_issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Transparency Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Eye className="h-5 w-5" />
            <span>Transparency Dashboard</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Proof of Reserves Score</p>
              <p className="text-2xl font-bold">
                {data.proof_of_reserves_score}/100
              </p>
            </div>
            
            {data.dashboard_url && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(data.dashboard_url, '_blank', 'noopener,noreferrer')}
                className="flex items-center space-x-2"
              >
                <ExternalLink className="h-4 w-4" />
                <span>View Dashboard</span>
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Last Updated</p>
              <p className="font-medium">{new Date(data.last_updated).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Update Frequency</p>
              <p className="font-medium capitalize">{data.update_frequency.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Source Status</p>
              <p className={`font-medium ${data.is_verified_source ? 'text-green-600' : 'text-red-600'}`}>
                {data.is_verified_source ? 'Verified' : 'Unverified'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Providers</p>
              <p className="font-medium">{data.attestation_providers.length} active</p>
            </div>
          </div>
        </CardContent>
      </Card>



      {/* Attestation Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Attestation Providers</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.attestation_providers.map((provider, index) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-medium">{provider.name}</h4>
                    {getProviderTypeBadge(provider.type)}
                    {provider.is_verified && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <Building className="h-4 w-4" />
                      <span>Reputation: </span>
                      <span className={`font-medium ${getReputationColor(provider.reputation_score)}`}>
                        {provider.reputation_score.toFixed(1)}/10
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span>Last Report: {new Date(provider.last_report_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                
                {provider.report_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(provider.report_url, '_blank', 'noopener,noreferrer')}
                    className="flex items-center space-x-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>View Report</span>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reserve Composition (if available) */}
      {data.reserve_composition && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Reserve Composition</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Cash & Equivalents</p>
                <p className="text-xl font-bold text-green-600">
                  {data.reserve_composition.cash_and_equivalents}%
                </p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Treasury Bills</p>
                <p className="text-xl font-bold text-blue-600">
                  {data.reserve_composition.treasury_bills}%
                </p>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Other Investments</p>
                <p className="text-xl font-bold text-purple-600">
                  {data.reserve_composition.other_investments}%
                </p>
              </div>
              {data.reserve_composition.crypto_assets !== undefined && (
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Crypto Assets</p>
                  <p className="text-xl font-bold text-orange-600">
                    {data.reserve_composition.crypto_assets}%
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}