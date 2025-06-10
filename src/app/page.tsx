import { SearchBar } from "@/components/search-bar"
import { Card, CardContent } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import { Shield, TrendingUp, Eye, Zap, FileCheck } from "lucide-react"

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-8">
        {/* Logo and Branding */}
        <div className="space-y-4">
          <div className="flex items-center justify-center space-x-4">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              StableRisk
            </h1>
            <ThemeToggle />
          </div>
          <p className="text-lg text-muted-foreground">
            by <a 
              href="https://x.com/SerStableLad" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline transition-colors"
            >
              SerStableLad
            </a>
          </p>
        </div>

        {/* Tagline */}
        <div className="space-y-2 max-w-3xl">
          <h2 className="text-xl md:text-2xl font-medium text-foreground">
            Comprehensive Risk Assessment for USD-Pegged Stablecoins
          </h2>
          <p className="text-base md:text-lg text-muted-foreground">
            Analyze peg stability, transparency, liquidity, oracle setup, and audit status 
            to make informed decisions about stablecoin risk.
          </p>
        </div>

        {/* Search Bar */}
        <SearchBar size="lg" className="w-full" />

        {/* Disclaimer */}
        <div className="bg-muted/50 rounded-lg p-4 max-w-2xl">
          <p className="text-sm text-muted-foreground">
            <strong>Disclaimer:</strong> This tool provides risk analysis for educational purposes only. 
            Not financial advice. Always do your own research before making investment decisions.
          </p>
        </div>
      </div>



      {/* Data Sources */}
      <div className="mt-16 text-center space-y-4">
        <h3 className="text-xl font-semibold">Trusted Data Sources</h3>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
          We aggregate data from CoinGecko, CoinMarketCap, DeFiLlama, GeckoTerminal, 
          official project documentation, and GitHub repositories to provide 
          comprehensive and accurate risk assessments.
        </p>
      </div>
    </div>
  )
} 