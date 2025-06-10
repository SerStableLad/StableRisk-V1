import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { StablecoinDataService } from "@/lib/services/stablecoin-data"
import { StablecoinAssessment } from "@/lib/types"

interface AssessmentPageProps {
  params: {
    ticker: string
  }
}

async function getAssessment(ticker: string): Promise<StablecoinAssessment | null> {
  const dataService = new StablecoinDataService()
  const assessment = await dataService.getStablecoinAssessment(ticker)
  return assessment
}

export default async function AssessmentPage({ params }: AssessmentPageProps) {
  const { ticker } = params
  
  // Validate ticker format (basic validation)
  if (!ticker || ticker.length < 2 || ticker.length > 10) {
    notFound()
  }

  const cleanTicker = ticker.toUpperCase()
  const assessment = await getAssessment(cleanTicker)

  if (!assessment) {
    notFound()
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back navigation */}
      <div className="mb-8">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </Link>
      </div>

      {/* Assessment Content */}
      <div className="space-y-8">
        {/* Stablecoin Header */}
        <div className="text-center space-y-4">
          <h2 className="text-3xl md:text-4xl font-bold">
            {assessment.info.name} ({cleanTicker}) Risk Assessment
          </h2>
          <p className="text-muted-foreground">
            Comprehensive risk analysis for {assessment.info.name}
          </p>
        </div>

        {/* Data Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Overall Risk Score */}
          <Card className="md:col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>Overall Risk Score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-6xl font-bold">{assessment.risk_scores.overall}</div>
                <p className="text-muted-foreground">Out of 100</p>
              </div>
            </CardContent>
          </Card>

          {/* Peg Stability */}
          <Card>
            <CardHeader>
              <CardTitle>Peg Stability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>Avg. Deviation:</strong> {assessment.peg_stability.average_deviation.toFixed(4)}%</p>
              <p><strong>Depegs:</strong> {assessment.peg_stability.depeg_incidents}</p>
              <p><strong>Peg Status:</strong> {assessment.peg_stability.is_depegged ? 'Depegged' : 'Peanut'}</p>
            </CardContent>
          </Card>

          {/* Transparency */}
          <Card>
            <CardHeader>
              <CardTitle>Transparency</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>PoR:</strong> {assessment.transparency.has_proof_of_reserves ? 'Yes' : 'No'}</p>
              <p><strong>Attestation:</strong> {assessment.transparency.attestation_provider || 'N/A'}</p>
              <p><strong>Frequency:</strong> {assessment.transparency.update_frequency}</p>
            </CardContent>
          </Card>

          {/* Liquidity */}
          <Card>
            <CardHeader>
              <CardTitle>Liquidity & Blockchain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>Total:</strong> ${assessment.liquidity.total_liquidity.toLocaleString()}</p>
              <p><strong>Concentration:</strong> {assessment.liquidity.concentration_risk}</p>
              <p><strong>Blockchain:</strong> {assessment.info.blockchain}</p>
            </CardContent>
          </Card>

          {/* Oracle Setup */}
          <Card>
            <CardHeader>
              <CardTitle>Oracle Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><strong>Multi-oracle:</strong> {assessment.oracle.is_multi_oracle ? 'Yes' : 'No'}</p>
              <p><strong>Providers:</strong> {assessment.oracle.providers.join(', ')}</p>
            </CardContent>
          </Card>

          {/* Audit Status */}
          <Card>
            <CardHeader>
              <CardTitle>Audit Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {assessment.audits.slice(0, 2).map((audit, index) => (
                <div key={index}>
                  <p><strong>Firm:</strong> {audit.firm}</p>
                  <p><strong>Issues:</strong> {audit.critical_high_issues} critical</p>
                </div>
              ))}
              {assessment.audits.length === 0 && <p>No audits found.</p>}
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon Notice */}
        <Card className="border-2 border-dashed border-muted-foreground/25">
          <CardContent className="p-8 text-center space-y-4">
            <div className="text-4xl">🚧</div>
            <h3 className="text-xl font-semibold">Assessment Engine Coming Soon</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We're currently building the comprehensive risk assessment engine that will analyze 
              {" "}<strong>{cleanTicker}</strong> across all five risk factors. The full analysis 
              will include real-time data from multiple sources, detailed scoring, and actionable insights.
            </p>
            <div className="pt-4">
              <Link href="/">
                <Button>
                  Try Another Stablecoin
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">
            <strong>Disclaimer:</strong> This tool provides risk analysis for educational purposes only. 
            Not financial advice. Always do your own research before making investment decisions.
          </p>
        </div>
      </div>
    </div>
  )
}

// Generate metadata for SEO
export function generateMetadata({ params }: AssessmentPageProps) {
  const ticker = params.ticker.toUpperCase()
  
  return {
    title: `${ticker} Risk Assessment - StableRisk`,
    description: `Comprehensive risk analysis for ${ticker} stablecoin including peg stability, transparency, liquidity, oracle setup, and audit status.`,
  }
} 