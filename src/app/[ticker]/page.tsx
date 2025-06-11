import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MainSummaryCard } from '@/components/main-summary-card'
import { RiskSummaryCards } from '@/components/risk-summary-cards'
import { ProgressiveDashboardSkeleton } from '@/components/dashboard-skeleton'
import { PegStabilitySection } from '@/components/peg-stability-section'
import { TransparencySection } from '@/components/transparency-section'
import { AuditSection } from '@/components/audit-section'
import { OracleSection } from '@/components/oracle-section'
import { LiquiditySection } from '@/components/liquidity-section'

interface AssessmentPageProps {
  params: {
    ticker: string
  }
}

// Get stablecoin assessment data
async function getAssessment(ticker: string) {
  try {
    console.log(`Fetching assessment for ${ticker}`)
    
    // For development, return mock data instead of calling the real service
    return {
      info: {
        name: `${ticker} Mock`,
        symbol: ticker,
        image: `https://assets.coingecko.com/coins/images/325/large/Tether.png`,
        market_cap: 120000000000,
        genesis_date: '2014-10-06',
        pegging_type: 'Fiat-backed',
        blockchain: 'Multi-chain',
        current_price: 1.0
      },
      risk_scores: {
        overall: 75,
        transparency: 80,
        liquidity: 90,
        oracle: 60,
        audit: 70
      },
      transparency: {
        has_proof_of_reserves: true
      },
      liquidity: {
        total_liquidity: 50000000000,
        chain_distribution: ['Ethereum', 'BSC', 'Polygon'],
        concentration_risk: 'medium'
      },
      oracle: {
        is_multi_oracle: false,
        providers: ['Chainlink']
      },
      audits: [
        {
          firm: 'Sample Auditor',
          date: '2024-01-15',
          critical_high_issues: 0
        }
      ]
    }
  } catch (error) {
    console.error(`Error fetching assessment for ${ticker}:`, error)
    return null
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
    blockchain: assessment.info.blockchain,
    current_price: assessment.info.current_price
  }

  // Calculate overall score (you might want to use your actual scoring logic)
  const overallScore = assessment.risk_scores?.overall || 0

  // Transform risk factors for the cards
  const riskFactors = {
    transparency: {
      name: 'Transparency',
      score: assessment.risk_scores?.transparency || null,
      summary: assessment.transparency?.has_proof_of_reserves 
        ? 'Proof of reserves available with regular attestations'
        : 'Limited transparency information available',
      lastUpdated: '24h ago',
      isVerified: assessment.transparency?.has_proof_of_reserves || false,
      hasIssues: false
    },
    liquidity: {
      name: 'Liquidity',
      score: assessment.risk_scores?.liquidity || null,
      summary: `$${(assessment.liquidity?.total_liquidity || 0).toLocaleString()} total liquidity across ${assessment.liquidity?.chain_distribution?.length || 0} chains`,
      lastUpdated: '1h ago',
      isVerified: true,
      hasIssues: assessment.liquidity?.concentration_risk === 'high'
    },
    oracle: {
      name: 'Oracle',
      score: assessment.risk_scores?.oracle || null,
      summary: assessment.oracle?.is_multi_oracle 
        ? `Multi-oracle setup with ${assessment.oracle.providers.length} providers`
        : 'Single oracle dependency detected',
      lastUpdated: '12h ago',
      isVerified: assessment.oracle?.is_multi_oracle || false,
      hasIssues: !assessment.oracle?.is_multi_oracle
    },
    audit: {
      name: 'Audit',
      score: assessment.risk_scores?.audit || null,
      summary: assessment.audits?.length 
        ? `${assessment.audits.length} audits found in the last 6 months`
        : 'No recent audit information available',
      lastUpdated: '7d ago',
      isVerified: (assessment.audits?.length || 0) > 0,
      hasIssues: assessment.audits?.some(audit => audit.critical_high_issues > 0) || false
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
        confidenceScore={85}
        summary={generateRiskSummary()}
      />

      {/* Risk Summary Cards */}
      <RiskSummaryCards
        transparency={riskFactors.transparency}
        liquidity={riskFactors.liquidity}
        oracle={riskFactors.oracle}
        audit={riskFactors.audit}
      />

      {/* Peg Stability Section */}
      <div id="peg-stability" className="scroll-mt-20">
        <PegStabilitySection ticker={ticker} data={null} />
      </div>

      {/* Detailed Sections */}
      <div className="space-y-12" id="detailed-sections">
        <div id="transparency" className="scroll-mt-20">
          <TransparencySection ticker={ticker} data={null} />
        </div>
        <div id="liquidity" className="scroll-mt-20">
          <LiquiditySection ticker={ticker} data={null} />
        </div>
        <div id="oracle" className="scroll-mt-20">
          <OracleSection ticker={ticker} data={null} />
        </div>
        <div id="audit" className="scroll-mt-20">
          <AuditSection ticker={ticker} data={null} />
        </div>
      </div>

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
  const cleanTicker = params.ticker.toUpperCase()

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
  const ticker = params.ticker.toUpperCase()
  
  return {
    title: `${ticker} Risk Assessment - StableRisk`,
    description: `Comprehensive risk analysis for ${ticker} stablecoin including peg stability, transparency, liquidity, oracle setup, and audit status.`,
    keywords: 'stablecoin,risk assessment,DeFi,cryptocurrency,USDT,USDC,DAI',
    authors: [{ name: 'SerStableLad' }],
    robots: 'index, follow',
    openGraph: {
      title: `${ticker} Risk Assessment - StableRisk`,
      description: `Get detailed risk analysis for ${ticker} stablecoin`,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `${ticker} Risk Assessment - StableRisk`,
      description: `Get detailed risk analysis for ${ticker} stablecoin`,
    },
  }
} 