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
  Building
} from 'lucide-react'

interface AttestationProvider {
  name: string
  type: 'accounting_firm' | 'audit_firm' | 'blockchain_analytics' | 'self_reported'
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
  update_frequency: 'real_time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'unknown'
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

// Generate mock data for development
function generateMockData(ticker: string): TransparencyData {
  const providerData: Record<string, Partial<TransparencyData>> = {
    'USDT': {
      dashboard_url: 'https://wallet.tether.to/transparency',
      has_proof_of_reserves: true,
      proof_of_reserves_score: 85,
      attestation_providers: [
        {
          name: 'BDO Italia',
          type: 'accounting_firm',
          reputation_score: 8.5,
          last_report_date: '2024-09-30',
          report_url: 'https://tether.to/en/transparency/',
          is_verified: true
        }
      ],
      update_frequency: 'daily',
      is_verified_source: true,
      transparency_issues: []
    },
    'USDC': {
      dashboard_url: 'https://www.centre.io/usdc-transparency',
      has_proof_of_reserves: true,
      proof_of_reserves_score: 95,
      attestation_providers: [
        {
          name: 'Grant Thornton LLP',
          type: 'accounting_firm',
          reputation_score: 9.2,
          last_report_date: '2024-10-31',
          report_url: 'https://www.centre.io/usdc-transparency',
          is_verified: true
        }
      ],
      update_frequency: 'monthly',
      is_verified_source: true,
      transparency_issues: []
    },
    'DAI': {
      dashboard_url: 'https://daistats.com/',
      has_proof_of_reserves: true,
      proof_of_reserves_score: 90,
      attestation_providers: [
        {
          name: 'On-chain Verification',
          type: 'blockchain_analytics',
          reputation_score: 9.8,
          last_report_date: '2024-12-11',
          is_verified: true
        }
      ],
      update_frequency: 'real_time',
      is_verified_source: true,
      transparency_issues: []
    }
  }

  const baseData = providerData[ticker] || {}
  
  return {
    dashboard_url: baseData.dashboard_url,
    has_proof_of_reserves: baseData.has_proof_of_reserves ?? false,
    proof_of_reserves_score: baseData.proof_of_reserves_score ?? 50,
    attestation_providers: baseData.attestation_providers ?? [
      {
        name: 'Self-reported',
        type: 'self_reported',
        reputation_score: 3.0,
        last_report_date: '2024-06-01',
        is_verified: false
      }
    ],
    update_frequency: baseData.update_frequency ?? 'unknown',
    last_updated: new Date().toISOString().split('T')[0],
    transparency_issues: baseData.transparency_issues ?? ['Limited transparency information available'],
    reserve_composition: {
      cash_and_equivalents: 85,
      treasury_bills: 10,
      other_investments: 5,
      crypto_assets: 0
    },
    is_verified_source: baseData.is_verified_source ?? false
  }
}

const getUpdateFrequencyBadge = (frequency: string) => {
  switch (frequency) {
    case 'real_time':
      return <Badge variant="default" className="bg-green-100 text-green-800">Real-time</Badge>
    case 'daily':
      return <Badge variant="default" className="bg-green-100 text-green-800">Daily</Badge>
    case 'weekly':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Weekly</Badge>
    case 'monthly':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Monthly</Badge>
    case 'quarterly':
      return <Badge variant="destructive">Quarterly</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

const getProviderTypeBadge = (type: string) => {
  switch (type) {
    case 'accounting_firm':
      return <Badge variant="default" className="bg-green-100 text-green-800">Accounting Firm</Badge>
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

export function TransparencySection({ ticker, data: propData }: TransparencySectionProps) {
  // Use mock data for development
  const data = propData || generateMockData(ticker)
  
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
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>Transparency Dashboard</span>
            </div>
            <div className="flex items-center space-x-2">
              {data.has_proof_of_reserves ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Verified Reserves
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <XCircle className="h-3 w-3 mr-1" />
                  Unverified
                </Badge>
              )}
              {getUpdateFrequencyBadge(data.update_frequency)}
            </div>
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
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <Building className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium">{provider.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Reputation: <span className={getReputationColor(provider.reputation_score)}>
                          {provider.reputation_score.toFixed(1)}/10
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getProviderTypeBadge(provider.type)}
                    {provider.is_verified ? (
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Unverified
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Last Report: {new Date(provider.last_report_date).toLocaleDateString()}</span>
                  </div>
                  
                  {provider.report_url && (
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-blue-600 hover:text-blue-800"
                        onClick={() => window.open(provider.report_url, '_blank', 'noopener,noreferrer')}
                      >
                        View Report <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {Math.floor((Date.now() - new Date(provider.last_report_date).getTime()) / (1000 * 60 * 60 * 24))} days ago
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reserve Composition */}
      {data.reserve_composition && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Reserve Composition</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Cash & Equivalents</p>
                <p className="text-2xl font-bold text-green-600">
                  {data.reserve_composition.cash_and_equivalents}%
                </p>
              </div>
              
              <div className="text-center p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Treasury Bills</p>
                <p className="text-2xl font-bold text-blue-600">
                  {data.reserve_composition.treasury_bills}%
                </p>
              </div>
              
              <div className="text-center p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Other Investments</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {data.reserve_composition.other_investments}%
                </p>
              </div>
              
              {data.reserve_composition.crypto_assets !== undefined && (
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Crypto Assets</p>
                  <p className="text-2xl font-bold text-purple-600">
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