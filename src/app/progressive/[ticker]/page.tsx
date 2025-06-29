import ProgressiveDashboard from '@/components/progressive-dashboard'

interface PageProps {
  params: Promise<{
    ticker: string
  }>
}

export default async function ProgressivePage({ params }: PageProps) {
  const resolvedParams = await params
  const { ticker } = resolvedParams

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Progressive Loading Demo</h1>
        <p className="text-muted-foreground">
          This page demonstrates sub-3 second loading with progressive data updates for {ticker.toUpperCase()}
        </p>
      </div>
      
      <ProgressiveDashboard ticker={ticker} />
    </div>
  )
}

export async function generateMetadata({ params }: PageProps) {
  const resolvedParams = await params
  const { ticker } = resolvedParams
  
  return {
    title: `Progressive Loading - ${ticker.toUpperCase()} | StableRisk`,
    description: `Real-time progressive loading demo for ${ticker.toUpperCase()} stablecoin assessment`
  }
} 