import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  Clock, 
  Building2, 
  FileCheck, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Globe,
  DollarSign,
  Calendar,
  Eye,
  Lock,
  Award,
  Banknote
} from 'lucide-react'
import { formatMarketCap } from '@/lib/utils'
import type { TransparencyData } from '@/lib/types'

interface ReserveTransparencyReportProps {
  transparencyData: TransparencyData
  stablecoinName: string
  symbol: string
}

export function ReserveTransparencyReport({ 
  transparencyData, 
  stablecoinName, 
  symbol 
}: ReserveTransparencyReportProps) {
  
  const getFrequencyColor = (frequency: string) => {
    switch (frequency) {
      case 'Real-time':
      case 'Daily': return 'text-green-600 dark:text-green-400'
      case 'Weekly':
      case 'Monthly': return 'text-blue-600 dark:text-blue-400'
      case 'Quarterly': return 'text-yellow-600 dark:text-yellow-400'
      case 'Annually':
      case 'Irregular': return 'text-red-600 dark:text-red-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getGradeBadgeVariant = (grade: string) => {
    if (['A+', 'A'].includes(grade)) return 'success'
    if (['B+', 'B'].includes(grade)) return 'warning'
    if (['C+', 'C'].includes(grade)) return 'secondary'
    return 'destructive'
  }

  const getVerifierTypeBadge = (type: string) => {
    switch (type) {
      case 'Big 4 Accounting': return 'success'
      case 'Regional Accounting': return 'warning'
      case 'Specialized Auditor': return 'secondary'
      case 'Legal Firm': return 'secondary'
      case 'Internal': return 'destructive'
      default: return 'secondary'
    }
  }

  const getCustodyModelColor = (model: string) => {
    switch (model) {
      case 'Decentralized': return 'text-green-600 dark:text-green-400'
      case 'Third-Party Custody': return 'text-blue-600 dark:text-blue-400'
      case 'Mixed Custody': return 'text-yellow-600 dark:text-yellow-400'
      case 'Self-Custody': return 'text-red-600 dark:text-red-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div>
              <CardTitle className="text-2xl">Reserve Transparency Report</CardTitle>
              <CardDescription>
                Comprehensive analysis of {stablecoinName} ({symbol}) reserve backing and transparency
              </CardDescription>
            </div>
          </div>
          {transparencyData.transparency_score && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Transparency Score</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {(transparencyData.transparency_score * 100).toFixed(0)}%
              </p>
              {transparencyData.report_frequency_details?.transparency_grade && (
                <Badge variant={getGradeBadgeVariant(transparencyData.report_frequency_details.transparency_grade)}>
                  Grade {transparencyData.report_frequency_details.transparency_grade}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-8">
        {/* Key Metrics Summary */}
        {(transparencyData.total_reserves || transparencyData.reserve_ratio) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-6 border-b">
            {transparencyData.total_reserves && (
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Reserves</p>
                  <p className="text-xl font-bold">{formatMarketCap(transparencyData.total_reserves)}</p>
                </div>
              </div>
            )}
            {transparencyData.reserve_ratio && (
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm text-muted-foreground">Reserve Ratio</p>
                  <p className="text-xl font-bold">{(transparencyData.reserve_ratio * 100).toFixed(1)}%</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-sm font-medium">
                  {transparencyData.last_update ? 
                    new Date(transparencyData.last_update).toLocaleDateString() : 
                    'Unknown'
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Reporting Frequency Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold">Reporting Frequency</h3>
          </div>
          <p className="text-sm text-muted-foreground">Reserve report publication schedule and consistency</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Update Frequency</p>
                  <p className={`text-lg font-semibold ${getFrequencyColor(
                    transparencyData.report_frequency_details?.frequency || transparencyData.update_frequency || 'Unknown'
                  )}`}>
                    {transparencyData.report_frequency_details?.frequency || transparencyData.update_frequency || 'Unknown'}
                  </p>
                </div>
                {transparencyData.report_frequency_details?.update_consistency && (
                  <div>
                    <p className="text-sm text-muted-foreground">Consistency</p>
                    <Badge variant={
                      ['Very Consistent', 'Consistent'].includes(transparencyData.report_frequency_details.update_consistency) 
                        ? 'success' : 'warning'
                    }>
                      {transparencyData.report_frequency_details.update_consistency}
                    </Badge>
                  </div>
                )}
              </div>
              
              {transparencyData.report_frequency_details?.automated_reporting !== undefined && (
                <div className="flex items-center gap-2">
                  {transparencyData.report_frequency_details.automated_reporting ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  )}
                  <span className="text-sm">
                    {transparencyData.report_frequency_details.automated_reporting ? 'Automated' : 'Manual'} Reporting
                  </span>
                </div>
              )}
            </div>
            
            {transparencyData.dashboard_url && (
              <div className="flex items-center">
                <a 
                  href={transparencyData.dashboard_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Eye className="h-4 w-4" />
                  View Live Dashboard
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Reserve Backing Section */}
        {transparencyData.reserve_backing && (
          <div className="space-y-4 pt-6 border-t">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-green-600 dark:text-green-400" />
              <h3 className="text-lg font-semibold">Reserve Backing</h3>
            </div>
            <p className="text-sm text-muted-foreground">Asset composition and backing mechanism</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Backing Type</p>
                    <Badge variant="secondary" className="text-xs">
                      {transparencyData.reserve_backing.backing_type}
                    </Badge>
                  </div>
                  {transparencyData.reserve_backing.overcollateralization_ratio && (
                    <div>
                      <p className="text-muted-foreground">Collateralization</p>
                      <p className="font-semibold">
                        {(transparencyData.reserve_backing.overcollateralization_ratio * 100).toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>

                {transparencyData.reserve_backing.geographical_distribution && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Geographic Distribution</p>
                    <div className="flex flex-wrap gap-1">
                      {transparencyData.reserve_backing.geographical_distribution.map((location, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {location}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {transparencyData.reserve_backing.composition && transparencyData.reserve_backing.composition.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium mb-3">Asset Composition</h5>
                  <div className="space-y-3">
                    {transparencyData.reserve_backing.composition.map((component, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{component.asset_type}</span>
                          <div className="flex items-center gap-2">
                            <span>{component.percentage.toFixed(1)}%</span>
                            <Badge variant="outline" className="text-xs">
                              {component.verification_method}
                            </Badge>
                          </div>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-2 bg-blue-600 dark:bg-blue-400 rounded-full transition-all duration-300" 
                            style={{ width: `${component.percentage}%` }}
                          ></div>
                        </div>
                        {component.amount_usd && (
                          <p className="text-xs text-muted-foreground">
                            ~{formatMarketCap(component.amount_usd)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Third-Party Attestation Section */}
        {transparencyData.attestation_details && (
          <div className="space-y-4 pt-6 border-t">
            <div className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="text-lg font-semibold">Third-Party Attestation</h3>
            </div>
            <p className="text-sm text-muted-foreground">Independent verification and audit details</p>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Primary Verifier</p>
                  <p className="font-semibold">{transparencyData.attestation_details.primary_verifier}</p>
                  <Badge variant={getVerifierTypeBadge(transparencyData.attestation_details.verifier_type)}>
                    {transparencyData.attestation_details.verifier_type}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Attestation Type</p>
                  <p className="font-semibold">{transparencyData.attestation_details.attestation_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Attestation</p>
                  <p className="font-semibold">
                    {new Date(transparencyData.attestation_details.last_attestation_date).toLocaleDateString()}
                  </p>
                  {transparencyData.attestation_details.next_scheduled_date && (
                    <p className="text-xs text-muted-foreground">
                      Next: {new Date(transparencyData.attestation_details.next_scheduled_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              {transparencyData.attestation_details.attestation_scope && (
                <div>
                  <h5 className="text-sm font-medium mb-2">Attestation Scope</h5>
                  <div className="flex flex-wrap gap-2">
                    {transparencyData.attestation_details.attestation_scope.map((scope, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {transparencyData.attestation_details.regulatory_compliance && (
                  <div>
                    <h5 className="text-sm font-medium mb-2">Regulatory Compliance</h5>
                    <div className="flex flex-wrap gap-2">
                      {transparencyData.attestation_details.regulatory_compliance.map((compliance, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          <Award className="h-3 w-3 mr-1" />
                          {compliance}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {transparencyData.attestation_details.report_url && (
                  <div className="flex items-center">
                    <a 
                      href={transparencyData.attestation_details.report_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <FileCheck className="h-4 w-4" />
                      View Attestation Report
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Custodian Information Section */}
        {transparencyData.custody_info && (
          <div className="space-y-4 pt-6 border-t">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <h3 className="text-lg font-semibold">Custodian Information</h3>
            </div>
            <p className="text-sm text-muted-foreground">Asset custody and storage arrangements</p>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Custody Model</p>
                  <p className={`font-semibold ${getCustodyModelColor(transparencyData.custody_info.custody_model)}`}>
                    {transparencyData.custody_info.custody_model}
                  </p>
                </div>
                {transparencyData.custody_info.insurance_coverage && (
                  <div>
                    <p className="text-sm text-muted-foreground">Insurance Coverage</p>
                    <p className="font-semibold">{formatMarketCap(transparencyData.custody_info.insurance_coverage)}</p>
                    {transparencyData.custody_info.insurance_provider && (
                      <p className="text-xs text-muted-foreground">{transparencyData.custody_info.insurance_provider}</p>
                    )}
                  </div>
                )}
                {transparencyData.custody_info.custodians && (
                  <div>
                    <p className="text-sm text-muted-foreground">Number of Custodians</p>
                    <p className="font-semibold">{transparencyData.custody_info.custodians.length}</p>
                  </div>
                )}
              </div>

              {transparencyData.custody_info.regulatory_oversight && (
                <div>
                  <h5 className="text-sm font-medium mb-2">Regulatory Oversight</h5>
                  <div className="flex flex-wrap gap-2">
                    {transparencyData.custody_info.regulatory_oversight.map((oversight, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        <Shield className="h-3 w-3 mr-1" />
                        {oversight}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {transparencyData.custody_info.custodians && transparencyData.custody_info.custodians.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium mb-3">Custodian Details</h5>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {transparencyData.custody_info.custodians.map((custodian, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h6 className="font-medium">{custodian.name}</h6>
                            <p className="text-sm text-muted-foreground">{custodian.type}</p>
                          </div>
                          <div className="text-right text-sm">
                            <div className="flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              <span>{custodian.jurisdiction}</span>
                            </div>
                            {custodian.percentage_of_reserves && (
                              <p className="text-xs text-muted-foreground">
                                {custodian.percentage_of_reserves.toFixed(1)}% of reserves
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground">Regulatory Status</p>
                            <Badge variant="outline" className="text-xs">
                              {custodian.regulatory_status}
                            </Badge>
                          </div>
                          {custodian.insurance_coverage && (
                            <div>
                              <p className="text-muted-foreground">Insurance</p>
                              <p className="font-medium">{formatMarketCap(custodian.insurance_coverage)}</p>
                            </div>
                          )}
                        </div>

                        {custodian.assets_held && custodian.assets_held.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Assets Held</p>
                            <div className="flex flex-wrap gap-1">
                              {custodian.assets_held.map((asset, assetIndex) => (
                                <Badge key={assetIndex} variant="outline" className="text-xs">
                                  {asset}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 