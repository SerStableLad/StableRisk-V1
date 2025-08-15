'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  Shield, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  FileText,
  Calendar,
  Building,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react'

interface AuditFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  title: string
  description: string
  status: 'resolved' | 'in_progress' | 'acknowledged' | 'open'
  date_found: string
  date_resolved?: string
}

interface AuditReport {
  firm_name: string
  audit_type: 'smart_contract' | 'financial' | 'operational' | 'comprehensive'
  audit_date: string
  report_url?: string
  findings: AuditFinding[]
  overall_score: number
  is_verified: boolean
  coverage_areas: string[]
  methodology: string
}

interface AuditData {
  recent_audits: AuditReport[]
  audit_frequency: 'quarterly' | 'semi_annual' | 'annual' | 'irregular' | 'none'
  last_audit_date: string
  critical_issues_count: number
  high_issues_count: number
  total_issues_resolved: number
  audit_coverage_score: number
  has_continuous_monitoring: boolean
  next_scheduled_audit?: string
  audit_issues: string[]
}

interface AuditSectionProps {
  ticker: string
  data?: AuditData | null
}

// Generate mock data for development
function generateMockData(ticker: string): AuditData {
  const auditData: Record<string, Partial<AuditData>> = {
    'USDT0': {
      recent_audits: [
        {
          firm_name: 'Moore Cayman',
          audit_type: 'financial',
          audit_date: '2024-06-30',
          report_url: 'https://tether.to/en/transparency/',
          findings: [
            {
              severity: 'medium',
              title: 'Reserve Composition Disclosure',
              description: 'Improved disclosure of investment portfolio composition recommended',
              status: 'resolved',
              date_found: '2024-06-30',
              date_resolved: '2024-08-15'
            }
          ],
          overall_score: 85,
          is_verified: true,
          coverage_areas: ['Reserve Management', 'Financial Controls', 'Compliance'],
          methodology: 'AICPA Standards'
        }
      ],
      audit_frequency: 'quarterly',
      last_audit_date: '2024-06-30',
      critical_issues_count: 0,
      high_issues_count: 0,
      total_issues_resolved: 5,
      audit_coverage_score: 85,
      has_continuous_monitoring: true,
      next_scheduled_audit: '2024-12-31',
      audit_issues: []
    },
    'USDC': {
      recent_audits: [
        {
          firm_name: 'Grant Thornton LLP',
          audit_type: 'comprehensive',
          audit_date: '2024-10-31',
          report_url: 'https://www.centre.io/usdc-transparency',
          findings: [],
          overall_score: 95,
          is_verified: true,
          coverage_areas: ['Smart Contracts', 'Reserve Management', 'Operational Security', 'Compliance'],
          methodology: 'SOC 2 Type II'
        }
      ],
      audit_frequency: 'quarterly',
      last_audit_date: '2024-10-31',
      critical_issues_count: 0,
      high_issues_count: 0,
      total_issues_resolved: 2,
      audit_coverage_score: 95,
      has_continuous_monitoring: true,
      next_scheduled_audit: '2025-01-31',
      audit_issues: []
    },
    'DAI': {
      recent_audits: [
        {
          firm_name: 'Trail of Bits',
          audit_type: 'smart_contract',
          audit_date: '2024-09-15',
          report_url: 'https://github.com/makerdao/mcd-security',
          findings: [
            {
              severity: 'low',
              title: 'Gas Optimization',
              description: 'Minor gas optimization opportunities identified',
              status: 'resolved',
              date_found: '2024-09-15',
              date_resolved: '2024-10-01'
            }
          ],
          overall_score: 90,
          is_verified: true,
          coverage_areas: ['Smart Contract Security', 'Governance Mechanisms', 'Oracle Security'],
          methodology: 'Custom Security Framework'
        }
      ],
      audit_frequency: 'semi_annual',
      last_audit_date: '2024-09-15',
      critical_issues_count: 0,
      high_issues_count: 0,
      total_issues_resolved: 8,
      audit_coverage_score: 90,
      has_continuous_monitoring: true,
      next_scheduled_audit: '2025-03-15',
      audit_issues: []
    }
  }

  const baseData = auditData[ticker] || {}
  
  return {
    recent_audits: baseData.recent_audits ?? [
      {
        firm_name: 'Unknown',
        audit_type: 'operational',
        audit_date: '2023-12-01',
        findings: [
          {
            severity: 'high',
            title: 'Outdated Security Practices',
            description: 'Security practices require updating to current standards',
            status: 'open',
            date_found: '2023-12-01'
          }
        ],
        overall_score: 60,
        is_verified: false,
        coverage_areas: ['Basic Operations'],
        methodology: 'Limited Review'
      }
    ],
    audit_frequency: baseData.audit_frequency ?? 'irregular',
    last_audit_date: baseData.last_audit_date ?? '2023-12-01',
    critical_issues_count: baseData.critical_issues_count ?? 1,
    high_issues_count: baseData.high_issues_count ?? 2,
    total_issues_resolved: baseData.total_issues_resolved ?? 3,
    audit_coverage_score: baseData.audit_coverage_score ?? 60,
    has_continuous_monitoring: baseData.has_continuous_monitoring ?? false,
    next_scheduled_audit: baseData.next_scheduled_audit,
    audit_issues: baseData.audit_issues ?? ['Limited audit coverage', 'Infrequent audit schedule']
  }
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'low':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'informational':
      return 'bg-gray-100 text-gray-800 border-gray-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'resolved':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'in_progress':
      return <Clock className="h-4 w-4 text-yellow-600" />
    case 'acknowledged':
      return <AlertCircle className="h-4 w-4 text-blue-600" />
    case 'open':
      return <XCircle className="h-4 w-4 text-red-600" />
    default:
      return <Minus className="h-4 w-4 text-gray-600" />
  }
}

const getAuditTypeBadge = (type: string) => {
  switch (type) {
    case 'smart_contract':
      return <Badge variant="default" className="bg-purple-100 text-purple-800">Smart Contract</Badge>
    case 'financial':
      return <Badge variant="default" className="bg-green-100 text-green-800">Financial</Badge>
    case 'operational':
      return <Badge variant="default" className="bg-blue-100 text-blue-800">Operational</Badge>
    case 'comprehensive':
      return <Badge variant="default" className="bg-indigo-100 text-indigo-800">Comprehensive</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

const getFrequencyBadge = (frequency: string) => {
  switch (frequency) {
    case 'quarterly':
      return <Badge variant="default" className="bg-green-100 text-green-800">Quarterly</Badge>
    case 'semi_annual':
      return <Badge variant="default" className="bg-green-100 text-green-800">Semi-Annual</Badge>
    case 'annual':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Annual</Badge>
    case 'irregular':
      return <Badge variant="destructive">Irregular</Badge>
    case 'none':
      return <Badge variant="destructive">None</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

const getScoreColor = (score: number) => {
  if (score >= 90) return 'text-green-600'
  if (score >= 75) return 'text-yellow-600'
  return 'text-red-600'
}

const getScoreTrend = (score: number) => {
  if (score >= 90) return <TrendingUp className="h-4 w-4 text-green-600" />
  if (score >= 75) return <Minus className="h-4 w-4 text-yellow-600" />
  return <TrendingDown className="h-4 w-4 text-red-600" />
}

export function AuditSection({ ticker, data: propData }: AuditSectionProps) {
  // Component is disabled - show disabled state
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Security Audits & Code Review</h2>
        <p className="text-muted-foreground">Smart contract audit analysis is temporarily disabled</p>
      </div>
      
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Audit Analysis - Disabled</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Service Temporarily Disabled</AlertTitle>
            <AlertDescription>
              Smart contract audit discovery and analysis has been temporarily disabled. 
              This feature will be re-enabled in a future update.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
} 