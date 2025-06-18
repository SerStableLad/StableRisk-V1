import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MainSummaryCard } from '@/components/main-summary-card'
import { RiskSummaryCards } from '@/components/risk-summary-cards'
import { ProgressiveDashboardSkeleton } from '@/components/dashboard-skeleton'
import { PegStabilitySection } from '@/components/peg-stability-section'
import { TransparencySection } from '@/components/transparency-section'
import { AuditSection } from '@/components/audit-section'
// import { OracleSection } from '@/components/oracle-section' // Disabled oracle functionality
import { LiquiditySection } from '@/components/liquidity-section'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StablecoinDataService } from '@/lib/services/stablecoin-data'
import { isKnownStablecoin, getKnownStablecoinEntry } from '@/lib/services/stablecoin-mapping-table'

interface AssessmentPageProps {
  params: Promise<{
    ticker: string
  }>
}

// Get stablecoin assessment data
async function getAssessment(ticker: string) {
  try {
    console.log(`Fetching real assessment data for ${ticker}`)
    
    const dataService = new StablecoinDataService()
    console.log('StablecoinDataService created successfully')
    
    const assessment = await dataService.getStablecoinAssessment(ticker.toUpperCase())
    console.log('API call completed, result:', assessment ? 'Success' : 'Failed')
    
    if (!assessment) {
      console.log(`No assessment data found for ${ticker}`)
      // Try to get basic info from mapping table as fallback
      const mappingData = isKnownStablecoin(ticker) ? getKnownStablecoinEntry(ticker) : null
      
      // For now, let's return a basic structure to prevent 404
      return {
        info: {
          name: mappingData?.name || `${ticker.toUpperCase()}`,
          symbol: ticker.toUpperCase(),
          image: 'https://via.placeholder.com/64',
          market_cap: 0,
          genesis_date: mappingData?.genesis_date || 'Unknown',
          pegging_type: 'fiat-backed' as const,
          blockchain: 'Unknown',
          current_price: 1.0,
          official_links: undefined
        },
        risk_scores: {
          overall: 0,
          peg_stability: 0,
          transparency: 0,
          liquidity: 0,
          audit: 0
        },
        transparency: {
          dashboard_url: undefined,
          attestation_provider: undefined,
          attestation_url: undefined,
          update_frequency: 'unknown' as const,
          last_update_date: undefined,
          has_proof_of_reserves: false,
          verification_status: 'unknown' as const
        },
        peg_stability: {
          price_history: [],
          average_deviation: 0,
          depeg_incidents: 0,
          depeg_recovery_speed: 0,
          is_depegged: false,
          last_depeg_date: undefined
        },
        liquidity: {
          total_liquidity: 0,
          dex_distribution: [],
          concentration_risk: 'low' as const,
          chain_distribution: []
        },
        audits: [],
        last_updated: new Date().toISOString(),
        data_sources: ['API Error']
      }
    }
    
    console.log(`Successfully fetched assessment for ${ticker}:`, {
      name: assessment.info.name,
      symbol: assessment.info.symbol,
      overallScore: assessment.risk_scores.overall
    })
    
    return assessment
  } catch (error) {
    console.error(`Error fetching assessment for ${ticker}:`, error)
    console.error('Error details:', error instanceof Error ? error.message : String(error))
    
    // Try to get basic info from mapping table as fallback
    const mappingData = isKnownStablecoin(ticker) ? getKnownStablecoinEntry(ticker) : null
    
    // Return a fallback structure instead of null to prevent 404
    return {
      info: {
        name: mappingData?.name || `${ticker.toUpperCase()} (Error)`,
        symbol: ticker.toUpperCase(),
        image: 'https://via.placeholder.com/64',
        market_cap: 0,
        genesis_date: mappingData?.genesis_date || 'Unknown',
        pegging_type: 'fiat-backed' as const,
        blockchain: 'Unknown', // We don't store blockchain info in mapping table
        current_price: 1.0,
        official_links: undefined
      },
      risk_scores: {
        overall: 0,
        peg_stability: 0,
        transparency: 0,
        liquidity: 0,
        audit: 0
      },
      transparency: {
        dashboard_url: undefined,
        attestation_provider: undefined,
        attestation_url: undefined,
        update_frequency: 'unknown' as const,
        last_update_date: undefined,
        has_proof_of_reserves: false,
        verification_status: 'unknown' as const
      },
      peg_stability: {
        price_history: [],
        average_deviation: 0,
        depeg_incidents: 0,
        depeg_recovery_speed: 0,
        is_depegged: false,
        last_depeg_date: undefined
      },
      liquidity: {
        total_liquidity: 0,
        dex_distribution: [],
        concentration_risk: 'low' as const,
        chain_distribution: []
      },
      audits: [],
      last_updated: new Date().toISOString(),
      data_sources: ['API Error']
    }
  }
}

// Main dashboard content component  
async function DashboardContent({ ticker }: { ticker: string }) {
  const assessment = await getAssessment(ticker)

  if (!assessment) {
    notFound()
  }

  // Transform the assessment data to match our component interfaces
  const stablecoinInfo = {
    name: assessment.info.name,
    symbol: ticker,
    logo: assessment.info.image,
    market_cap: assessment.info.market_cap || 0,
    genesis_date: assessment.info.genesis_date,
    pegging_type: assessment.info.pegging_type || 'Unknown',
    blockchain: assessment.info.blockchain || 'Unknown',
    current_price: assessment.info.current_price,
    official_links: assessment.info.official_links || undefined
  }

  // Calculate overall score (you might want to use your actual scoring logic)
  const overallScore = assessment.risk_scores?.overall ?? null

  // Transform risk factors for the cards
  const riskFactors = {
    pegStability: {
      name: 'Peg Stability',
      score: assessment.risk_scores?.peg_stability ?? null,
      summary: assessment.peg_stability?.is_depegged 
        ? `Currently depegged with ${assessment.peg_stability.depeg_incidents} incidents in 365 days`
        : `Stable peg with ${assessment.peg_stability?.average_deviation?.toFixed(3) || '0.000'}% average deviation`,
      lastUpdated: '1h ago',
      isVerified: !assessment.peg_stability?.is_depegged,
      hasIssues: assessment.peg_stability?.is_depegged || false,
      explanation: assessment.peg_stability?.is_depegged 
        ? `Score reduced due to current depeg status. The stablecoin has experienced ${assessment.peg_stability.depeg_incidents} depeg incidents, indicating instability in maintaining its USD peg. Recovery time and frequency of depegs are key factors in this assessment.`
        : `Strong peg stability with minimal deviation from $1.00 target. Low depeg incident count and quick recovery times contribute to a high stability score. Consistent price performance indicates reliable peg maintenance mechanisms.`,
      keyMetrics: [
        { 
          label: 'Average Deviation', 
          value: `${assessment.peg_stability?.average_deviation?.toFixed(3) || '0.000'}%`,
          isGood: (assessment.peg_stability?.average_deviation || 0) < 0.5
        },
        { 
          label: 'Depeg Incidents (365d)', 
          value: `${assessment.peg_stability?.depeg_incidents || 0}`,
          isGood: (assessment.peg_stability?.depeg_incidents || 0) === 0
        },
        { 
          label: 'Currently Depegged', 
          value: assessment.peg_stability?.is_depegged ? 'Yes' : 'No',
          isGood: !assessment.peg_stability?.is_depegged
        },
        ...(assessment.peg_stability?.depeg_recovery_speed ? [{
          label: 'Avg Recovery Time', 
          value: `${assessment.peg_stability.depeg_recovery_speed.toFixed(1)}h`,
          isGood: assessment.peg_stability.depeg_recovery_speed < 24
        }] : [])
      ]
    },
    transparency: {
      name: 'Transparency',
      score: assessment.risk_scores?.transparency ?? null,
      summary: assessment.transparency?.has_proof_of_reserves 
        ? 'Proof of reserves available with regular attestations'
        : 'Limited transparency information available',
      lastUpdated: '24h ago',
      isVerified: assessment.transparency?.has_proof_of_reserves || false,
      hasIssues: false,
      explanation: assessment.transparency?.has_proof_of_reserves
        ? `High transparency score due to available proof of reserves and regular attestations. ${assessment.transparency.attestation_provider ? `Attestations provided by ${assessment.transparency.attestation_provider}` : 'Regular verification processes'} ensure users can verify backing assets. ${assessment.transparency.update_frequency !== 'unknown' ? `Updates provided ${assessment.transparency.update_frequency}.` : ''}`
        : `Lower transparency score due to limited public disclosure of reserve information. Without proof of reserves or regular attestations, users cannot independently verify that the stablecoin is fully backed. This increases counterparty risk and reduces trust in the asset's stability.`,
      keyMetrics: [
        { 
          label: 'Proof of Reserves', 
          value: assessment.transparency?.has_proof_of_reserves ? 'Available' : 'Not Available',
          isGood: assessment.transparency?.has_proof_of_reserves
        },
        { 
          label: 'Attestation Provider', 
          value: assessment.transparency?.attestation_provider || 'None',
          isGood: !!assessment.transparency?.attestation_provider
        },
        { 
          label: 'Update Frequency', 
          value: assessment.transparency?.update_frequency || 'Unknown',
          isGood: assessment.transparency?.update_frequency === 'daily' || assessment.transparency?.update_frequency === 'weekly'
        },
        { 
          label: 'Dashboard Available', 
          value: assessment.transparency?.dashboard_url ? 'Yes' : 'No',
          isGood: !!assessment.transparency?.dashboard_url
        }
      ]
    },
    liquidity: {
      name: 'Liquidity',
      score: assessment.risk_scores?.liquidity ?? null,
      summary: `$${(assessment.liquidity?.total_liquidity || 0).toLocaleString()} total liquidity across ${assessment.liquidity?.chain_distribution?.length || 0} chains`,
      lastUpdated: '1h ago',
      isVerified: true,
      hasIssues: assessment.liquidity?.concentration_risk === 'high',
      explanation: assessment.liquidity?.concentration_risk === 'high'
        ? `Moderate liquidity score due to high concentration risk. While total liquidity may be substantial, it's concentrated in few venues or chains, creating potential exit liquidity issues during market stress. Diversification across more platforms would improve this score.`
        : `${assessment.liquidity?.total_liquidity && assessment.liquidity.total_liquidity > 10000000 ? 'Strong' : 'Moderate'} liquidity score based on total available liquidity and distribution. Good spread across multiple chains and DEXs reduces concentration risk and ensures users can trade without significant slippage.`,
      keyMetrics: [
        { 
          label: 'Total Liquidity', 
          value: `$${(assessment.liquidity?.total_liquidity || 0).toLocaleString()}`,
          isGood: (assessment.liquidity?.total_liquidity || 0) > 10000000
        },
        { 
          label: 'Chain Distribution', 
          value: `${assessment.liquidity?.chain_distribution?.length || 0} chains`,
          isGood: (assessment.liquidity?.chain_distribution?.length || 0) > 2
        },
        { 
          label: 'Concentration Risk', 
          value: assessment.liquidity?.concentration_risk || 'Unknown',
          isGood: assessment.liquidity?.concentration_risk === 'low'
        },
        ...(assessment.liquidity?.dex_distribution?.length ? [{
          label: 'DEX Count', 
          value: `${assessment.liquidity.dex_distribution.length} DEXs`,
          isGood: assessment.liquidity.dex_distribution.length > 5
        }] : [])
      ]
    },
    audit: {
      name: 'Audit',
      score: assessment.risk_scores?.audit ?? null,
      summary: assessment.audits?.length 
        ? `${assessment.audits.length} audits found in the last 6 months`
        : 'No recent audit information available',
      lastUpdated: '7d ago',
      isVerified: (assessment.audits?.length || 0) > 0,
      hasIssues: assessment.audits?.some(audit => audit.critical_high_issues > 0) || false,
      explanation: assessment.audits?.length
        ? `${assessment.audits.some(audit => audit.critical_high_issues > 0) ? 'Moderate' : 'Good'} audit score based on ${assessment.audits.length} recent audit${assessment.audits.length > 1 ? 's' : ''}. ${assessment.audits.some(audit => audit.critical_high_issues > 0) ? 'Some critical or high-severity issues were identified, which impacts the score.' : 'No critical issues identified in recent audits.'} Regular security assessments by reputable firms indicate commitment to security best practices.`
        : `Lower audit score due to lack of recent public audit information. Without regular security assessments, potential vulnerabilities may go undetected. Smart contract audits are crucial for identifying security risks and ensuring user funds are protected.`,
      keyMetrics: [
        { 
          label: 'Recent Audits', 
          value: `${assessment.audits?.length || 0}`,
          isGood: (assessment.audits?.length || 0) > 0
        },
        { 
          label: 'Critical Issues', 
          value: `${assessment.audits?.reduce((sum, audit) => sum + (audit.critical_high_issues || 0), 0) || 0}`,
          isGood: (assessment.audits?.reduce((sum, audit) => sum + (audit.critical_high_issues || 0), 0) || 0) === 0
        },
        ...(assessment.audits?.length ? [{
          label: 'Latest Audit', 
          value: assessment.audits[0]?.date ? new Date(assessment.audits[0].date).toLocaleDateString() : 'Unknown',
          isGood: assessment.audits[0]?.date ? (Date.now() - new Date(assessment.audits[0].date).getTime()) < (180 * 24 * 60 * 60 * 1000) : false // Within 6 months
        }] : []),
        ...(assessment.audits?.length && assessment.audits[0]?.firm ? [{
          label: 'Primary Auditor', 
          value: assessment.audits[0].firm,
          isGood: true
        }] : [])
      ]
    }
  }

  // Generate a risk summary
  const generateRiskSummary = () => {
    if (overallScore >= 80) {
      return `${assessment.info.name} demonstrates strong risk management across all factors with minimal concerns identified.`
    } else if (overallScore >= 60) {
      return `${assessment.info.name} shows moderate risk levels with some areas requiring attention and monitoring.`
    } else if (overallScore >= 40) {
      return `${assessment.info.name} presents elevated risk factors that require careful consideration before use.`
    } else {
      return `${assessment.info.name} shows significant risk concerns across multiple factors and requires caution.`
    }
  }

  return (
    <div className="space-y-12">
      {/* Main Summary Card */}
      <MainSummaryCard 
        info={stablecoinInfo}
        overallScore={overallScore}
        riskScores={{
          overall: assessment.risk_scores?.overall ?? 0,
          peg_stability: assessment.risk_scores?.peg_stability ?? 0,
          transparency: assessment.risk_scores?.transparency ?? 0,
          liquidity: assessment.risk_scores?.liquidity ?? 0,
          audit: assessment.risk_scores?.audit ?? 0
        }}
        confidenceScore={85}
        summary={generateRiskSummary()}
      />

      {/* Risk Summary Cards */}
      <RiskSummaryCards
        pegStability={riskFactors.pegStability}
        transparency={riskFactors.transparency}
        liquidity={riskFactors.liquidity}
        audit={riskFactors.audit}
      />

      {/* Detailed Sections - Only show sections with actual data */}
      <div className="space-y-12" id="detailed-sections">
        
        {/* Peg Stability Section - Always show since we always have price data */}
        <div id="peg-stability" className="scroll-mt-20">
          <PegStabilitySection 
            ticker={ticker} 
            data={assessment.peg_stability ? {
              price_history: assessment.peg_stability.price_history?.map(point => ({
                date: new Date(point.timestamp).toISOString().split('T')[0],
                price: point.price,
                timestamp: point.timestamp,
                isDepeg: Math.abs(point.price - 1.0) > 0.01
              })) || [],
              statistics: {
                average_deviation_percent: assessment.peg_stability.average_deviation || 0,
                depeg_incidents_count: assessment.peg_stability.depeg_incidents || 0,
                max_deviation_percent: Math.max(...(assessment.peg_stability.price_history?.map(p => Math.abs(p.price - 1.0)) || [0])) * 100,
                recovery_speed_hours: assessment.peg_stability.depeg_recovery_speed || undefined,
                current_deviation_percent: assessment.peg_stability.price_history?.length 
                  ? Math.abs(assessment.peg_stability.price_history[assessment.peg_stability.price_history.length - 1].price - 1.0) * 100
                  : 0
              },
              depeg_events: [], // Will be derived from price history
              is_currently_depegged: assessment.peg_stability.is_depegged || false,
              days_since_depeg: assessment.peg_stability.last_depeg_date 
                ? Math.floor((Date.now() - new Date(assessment.peg_stability.last_depeg_date).getTime()) / (1000 * 60 * 60 * 24))
                : undefined
            } : null} 
          />
        </div>

        {/* Transparency Section - Only show if we have transparency data */}
        {assessment.risk_scores?.transparency !== null && (
          <div id="transparency" className="scroll-mt-20">
            <TransparencySection 
              ticker={ticker} 
              data={assessment.transparency ? {
                dashboard_url: assessment.transparency.dashboard_url,
                has_proof_of_reserves: assessment.transparency.has_proof_of_reserves,
                proof_of_reserves_score: assessment.transparency.has_proof_of_reserves ? 85 : 0,
                attestation_providers: assessment.transparency.attestation_provider ? [{
                  name: assessment.transparency.attestation_provider,
                  type: 'accounting_firm' as const,
                  reputation_score: 8.5,
                  last_report_date: assessment.transparency.last_update_date || new Date().toISOString().split('T')[0],
                  report_url: assessment.transparency.attestation_url,
                  is_verified: assessment.transparency.verification_status === 'verified'
                }] : [],
                update_frequency: assessment.transparency.update_frequency,
                is_verified_source: assessment.transparency.verification_status === 'verified',
                transparency_issues: [],
                last_updated: assessment.transparency.last_update_date || new Date().toISOString().split('T')[0],
                reserve_composition: {
                  cash_and_equivalents: 85,
                  treasury_bills: 10,
                  other_investments: 5,
                  crypto_assets: 0
                }
              } : null} 
            />
          </div>
        )}

        {/* Liquidity Section - Only show if we have liquidity data */}
        {assessment.risk_scores?.liquidity !== null && (
          <div id="liquidity" className="scroll-mt-20">
            <LiquiditySection 
              ticker={ticker} 
              data={assessment.liquidity ? {
                total_volume_24h: assessment.liquidity.total_liquidity || 0,
                total_volume_7d: (assessment.liquidity.total_liquidity || 0) * 7,
                volume_change_24h: 0,
                market_cap: assessment.info.market_cap || 0,
                liquidity_score: assessment.risk_scores?.liquidity || 0,
                exchanges: assessment.liquidity.dex_distribution?.map(dex => ({
                  name: dex.dex,
                  type: 'DEX' as const,
                  volume_24h: dex.liquidity,
                  volume_percentage: dex.percentage,
                  spread: 0.005,
                  market_depth_1_percent: dex.liquidity * 0.1,
                  last_updated: new Date().toISOString(),
                  is_active: true,
                  trading_pairs: [`${ticker}/USDC`, `${ticker}/ETH`]
                })) || [],
                liquidity_pools: [],
                market_depth_analysis: {
                  depth_1_percent: (assessment.liquidity.total_liquidity || 0) * 0.1,
                  depth_5_percent: (assessment.liquidity.total_liquidity || 0) * 0.3,
                  depth_10_percent: (assessment.liquidity.total_liquidity || 0) * 0.5,
                  average_spread: 0.005
                },
                exchange_distribution: {
                  cex_percentage: 70,
                  dex_percentage: 30,
                  cex_volume: (assessment.liquidity.total_liquidity || 0) * 0.7,
                  dex_volume: (assessment.liquidity.total_liquidity || 0) * 0.3
                },
                liquidation_risk: {
                  risk_level: assessment.liquidity.concentration_risk || 'medium',
                  factors: assessment.liquidity.concentration_risk === 'low' 
                    ? ['Well distributed across multiple venues']
                    : ['Concentration risk present'],
                  concentrated_holdings: assessment.liquidity.concentration_risk === 'high' ? 60 : 20,
                  whale_concentration: assessment.liquidity.concentration_risk === 'high' ? 50 : 15
                },
                liquidity_issues: assessment.liquidity.concentration_risk === 'high' 
                  ? ['High concentration risk']
                  : []
              } : null} 
            />
          </div>
        )}

        {/* Audit Section - Only show if we have audit data */}
        {assessment.risk_scores?.audit !== null && (
          <div id="audit" className="scroll-mt-20">
            <AuditSection 
              ticker={ticker} 
              data={assessment.audits?.length ? {
                recent_audits: assessment.audits.map(audit => ({
                  firm_name: audit.firm,
                  audit_type: 'comprehensive' as const,
                  audit_date: audit.date,
                  report_url: audit.report_url,
                  findings: audit.critical_high_issues > 0 ? [{
                    severity: 'high' as const,
                    title: 'Security Issues Identified',
                    description: `${audit.critical_high_issues} critical/high issues found`,
                    status: audit.resolution_status === 'resolved' ? 'resolved' as const : 'open' as const,
                    date_found: audit.date,
                    date_resolved: audit.resolution_status === 'resolved' ? audit.date : undefined
                  }] : [],
                  overall_score: audit.critical_high_issues === 0 ? 95 : 70,
                  is_verified: true,
                  coverage_areas: ['Smart Contracts', 'Security', 'Operations'],
                  methodology: audit.is_top_tier ? 'Comprehensive Security Audit' : 'Standard Security Review'
                })),
                audit_frequency: assessment.audits.length > 2 ? 'quarterly' as const : 'semi_annual' as const,
                last_audit_date: assessment.audits[0]?.date || new Date().toISOString().split('T')[0],
                critical_issues_count: assessment.audits.reduce((sum, audit) => sum + (audit.critical_high_issues || 0), 0),
                high_issues_count: 0,
                total_issues_resolved: assessment.audits.filter(audit => audit.resolution_status === 'resolved').length,
                audit_coverage_score: assessment.risk_scores?.audit || 0,
                has_continuous_monitoring: assessment.audits.some(audit => audit.is_top_tier),
                next_scheduled_audit: undefined,
                audit_issues: assessment.audits.some(audit => audit.critical_high_issues > 0) 
                  ? ['Critical issues identified in recent audits']
                  : []
              } : null} 
            />
          </div>
        )}

      </div>

      {/* How We Score Each Factor Section - HIDDEN FOR NOW */}
      {/* 
      <div className="mt-16 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">How We Score Each Factor</CardTitle>
            <p className="text-center text-muted-foreground">
              Our comprehensive methodology for evaluating stablecoin risk factors
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-muted/30 p-4 rounded-lg space-y-3">
                <div className="font-semibold text-lg text-muted-foreground">🎯 Peg Stability (40%)</div>
                <div className="space-y-2 text-sm">
                  <div>• <span className="text-green-600 font-medium">Perfect (100)</span>: Max deviation &lt;1%, avg &lt;0.5%</div>
                  <div>• <span className="text-green-500 font-medium">Good (80-99)</span>: Max deviation &lt;3%, avg &lt;0.7%</div>
                  <div>• <span className="text-yellow-500 font-medium">Fair (60-79)</span>: Max deviation &lt;5%, avg &lt;1%</div>
                  <div>• <span className="text-orange-500 font-medium">Poor (40-59)</span>: Max deviation &lt;10%, avg &lt;2%</div>
                  <div>• <span className="text-red-500 font-medium">Very Poor (0-39)</span>: Max deviation ≥10%</div>
                </div>
              </div>

              <div className="bg-muted/30 p-4 rounded-lg space-y-3">
                <div className="font-semibold text-lg text-muted-foreground">🔍 Transparency (20%)</div>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="font-medium mb-1">Third-Party Attestations (Max: 30 points)</div>
                    <div className="text-xs space-y-1 ml-3 text-muted-foreground">
                      <div>• +30 points if independent, credible third-party attestation</div>
                      <div>• +0 points if no attestation or unverified source</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium mb-1">Update Frequency (Max: 20 points)</div>
                    <div className="text-xs space-y-1 ml-3 text-muted-foreground">
                      <div>• +20 points for daily updates</div>
                      <div>• +15 points for weekly updates</div>
                      <div>• +10 points for monthly updates</div>
                      <div>• +5 points for quarterly updates</div>
                      <div>• +0 points if infrequent or unknown</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium mb-1">Public Proof-of-Reserves Dashboard (Max: 10 points)</div>
                    <div className="text-xs space-y-1 ml-3 text-muted-foreground">
                      <div>• +10 points if publicly accessible and verifiable</div>
                      <div>• +0 points if unavailable or inaccessible</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium mb-1">Overcollateralization Ratio (Max: 15 points)</div>
                    <div className="text-xs space-y-1 ml-3 text-muted-foreground">
                      <div>• +15 points if overcollateralized but exceeds ±10% deviation</div>
                      <div>• +10 points if overcollateralized within ±10% deviation</div>
                      <div>• +5 points if overcollateralized within ±5% deviation</div>
                      <div>• +2 points if overcollateralized within ±3% deviation</div>
                      <div>• +0 points if not overcollateralized or unknown</div>
                    </div>
                  </div>
                  <div>
                    <div className="font-medium mb-1">Collateral Asset Quality (Max: 25 points)</div>
                    <div className="text-xs space-y-1 ml-3 text-muted-foreground">
                      <div>• +25 points if 100% stable assets (e.g., USDC, T-Bills)</div>
                      <div>• +20 points if mixed but mostly stable (&gt;70%)</div>
                      <div>• +15 points if mixed but mostly volatile (&gt;70%)</div>
                      <div>• +0 points if primarily volatile or unknown composition</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-muted/30 p-4 rounded-lg space-y-3">
                <div className="font-semibold text-lg text-muted-foreground">💧 Liquidity (15%)</div>
                <div className="space-y-2 text-sm">
                  <div>• Total liquidity across all DEXs and chains</div>
                  <div>• <span className="text-green-500 font-medium">High</span>: &gt;$100M, low concentration risk</div>
                  <div>• <span className="text-yellow-500 font-medium">Medium</span>: $10M-$100M, moderate concentration</div>
                  <div>• <span className="text-red-500 font-medium">Low</span>: &lt;$10M or high concentration risk</div>
                  <div>• Chain diversity bonus for multi-chain presence</div>
                </div>
              </div>

              <div className="bg-muted/30 p-4 rounded-lg space-y-3">
                <div className="font-semibold text-lg text-muted-foreground">🛡️ Audit Status (10%)</div>
                <div className="space-y-2 text-sm">
                  <div>• <span className="text-green-500 font-medium">Excellent (90-95)</span>: Monthly audits by Big 4</div>
                  <div>• <span className="text-green-400 font-medium">Good (85-89)</span>: Quarterly audits, reputable firm</div>
                  <div>• <span className="text-yellow-500 font-medium">Fair (60-79)</span>: Annual audits or security reviews</div>
                  <div>• <span className="text-red-500 font-medium">Poor (30)</span>: No known audits or attestations</div>
                  <div>• Critical issues reduce score significantly</div>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      </div>
      */}

      {/* Footer Data Info */}
      <div className="text-center text-sm text-muted-foreground">
        <p>
          Data last updated: {new Date().toLocaleString()}. 
          Risk scores are calculated using our proprietary methodology.
        </p>
      </div>
    </div>
  )
}

// Main page component
export default async function AssessmentPage({
  params
}: AssessmentPageProps) {
  const { ticker } = await params
  const cleanTicker = ticker.toUpperCase()

  return (
    <DashboardLayout ticker={cleanTicker}>
      <Suspense fallback={<ProgressiveDashboardSkeleton tier={1} />}>
        <DashboardContent ticker={cleanTicker} />
      </Suspense>
    </DashboardLayout>
  )
}

// Generate metadata
export async function generateMetadata({
  params,
}: AssessmentPageProps) {
  const { ticker } = await params
  const upperTicker = ticker.toUpperCase()
  
  return {
    title: `${upperTicker} Risk Assessment - StableRisk`,
    description: `Comprehensive risk analysis for ${upperTicker} stablecoin including peg stability, transparency, liquidity, and audit status.`,
    keywords: 'stablecoin,risk assessment,DeFi,cryptocurrency,USDT,USDC,DAI',
    authors: [{ name: 'SerStableLad' }],
    robots: 'index, follow',
    openGraph: {
      title: `${upperTicker} Risk Assessment - StableRisk`,
      description: `Get detailed risk analysis for ${upperTicker} stablecoin`,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `${upperTicker} Risk Assessment - StableRisk`,
      description: `Get detailed risk analysis for ${upperTicker} stablecoin`,
    },
  }
}

// Add static generation for popular stablecoins
export async function generateStaticParams() {
  // REDUCED SCOPE: Only pre-generate the most critical stablecoins to avoid rate limits
  // Build-time API calls are hitting rate limits with 7+ concurrent requests
  const criticalStablecoins = ['USDT', 'USDC', 'DAI'] // Reduced from 7 to 3
  
  return criticalStablecoins.map((ticker) => ({
    ticker: ticker.toLowerCase(),
  }))
}

// Enable ISR with 1 hour revalidation
export const revalidate = 3600 // 1 hour

// Add build-time safety: Force dynamic rendering for non-critical pages
export const dynamic = 'auto' // Allow Next.js to choose based on usage
export const dynamicParams = true // Allow dynamic params not in generateStaticParams 