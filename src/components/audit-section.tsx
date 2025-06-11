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
    'USDT': {
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
  // Use mock data for development
  const data = propData || generateMockData(ticker)
  
  const daysSinceLastAudit = Math.floor((Date.now() - new Date(data.last_audit_date).getTime()) / (1000 * 60 * 60 * 24))
  const nextAuditDays = data.next_scheduled_audit 
    ? Math.floor((new Date(data.next_scheduled_audit).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Security Audits & Code Review</h2>
        <p className="text-muted-foreground">
          Third-party security audits and smart contract verification
        </p>
      </div>

      {/* Audit Issues Alert */}
      {data.audit_issues.length > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Audit Concerns</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {data.audit_issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Audit Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Audit Overview</span>
            </div>
            <div className="flex items-center space-x-2">
              {getFrequencyBadge(data.audit_frequency)}
              {data.has_continuous_monitoring && (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Continuous Monitoring
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Coverage Score</p>
              <div className="flex items-center justify-center space-x-2">
                <p className={`text-2xl font-bold ${getScoreColor(data.audit_coverage_score)}`}>
                  {data.audit_coverage_score}%
                </p>
                {getScoreTrend(data.audit_coverage_score)}
              </div>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Critical Issues</p>
              <p className={`text-2xl font-bold ${data.critical_issues_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {data.critical_issues_count}
              </p>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">High Issues</p>
              <p className={`text-2xl font-bold ${data.high_issues_count > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {data.high_issues_count}
              </p>
            </div>
            
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Issues Resolved</p>
              <p className="text-2xl font-bold text-blue-600">
                {data.total_issues_resolved}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Last Audit</p>
              <p className="font-medium">
                {new Date(data.last_audit_date).toLocaleDateString()} ({daysSinceLastAudit} days ago)
              </p>
            </div>
            
            <div>
              <p className="text-muted-foreground">Audit Frequency</p>
              <p className="font-medium capitalize">{data.audit_frequency.replace('_', ' ')}</p>
            </div>
            
            <div>
              <p className="text-muted-foreground">Next Scheduled</p>
              <p className="font-medium">
                {data.next_scheduled_audit 
                  ? `${new Date(data.next_scheduled_audit).toLocaleDateString()} (${nextAuditDays} days)`
                  : 'Not scheduled'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Audits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Recent Audit Reports</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {data.recent_audits.map((audit, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Building className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <h4 className="font-medium">{audit.firm_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {audit.methodology}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getAuditTypeBadge(audit.audit_type)}
                    {audit.is_verified ? (
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
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Score</p>
                    <div className="flex items-center space-x-2">
                      <p className={`text-lg font-bold ${getScoreColor(audit.overall_score)}`}>
                        {audit.overall_score}/100
                      </p>
                      <Progress value={audit.overall_score} className="flex-1" />
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Audit Date</p>
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{new Date(audit.audit_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Findings</p>
                    <p className="font-medium">
                      {audit.findings.length} issue{audit.findings.length !== 1 ? 's' : ''} found
                    </p>
                  </div>
                </div>
                
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-2">Coverage Areas</p>
                  <div className="flex flex-wrap gap-2">
                    {audit.coverage_areas.map((area, areaIndex) => (
                      <Badge key={areaIndex} variant="outline" className="text-xs">
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {audit.findings.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-2">Key Findings</p>
                    <div className="space-y-2">
                      {audit.findings.map((finding, findingIndex) => (
                        <div key={findingIndex} className="border rounded p-3 text-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline" className={getSeverityColor(finding.severity)}>
                                {finding.severity.toUpperCase()}
                              </Badge>
                              <span className="font-medium">{finding.title}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              {getStatusIcon(finding.status)}
                              <span className="text-xs text-muted-foreground capitalize">
                                {finding.status.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                          <p className="text-muted-foreground mb-2">{finding.description}</p>
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span>Found: {new Date(finding.date_found).toLocaleDateString()}</span>
                            {finding.date_resolved && (
                              <span>Resolved: {new Date(finding.date_resolved).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {Math.floor((Date.now() - new Date(audit.audit_date).getTime()) / (1000 * 60 * 60 * 24))} days ago
                  </div>
                  {audit.report_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(audit.report_url, '_blank', 'noopener,noreferrer')}
                      className="flex items-center space-x-2"
                    >
                      <FileText className="h-3 w-3" />
                      <span>View Report</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 