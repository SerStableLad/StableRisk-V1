'use client'

import Link from "next/link"
import { ArrowLeft, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

interface ShareButtonProps {
  ticker: string
}

function ShareButton({ ticker }: ShareButtonProps) {
  const handleShare = async () => {
    const url = `${window.location.origin}/${ticker}`
    const title = `${ticker} Risk Assessment - StableRisk`
    
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch (error) {
        // User cancelled or error occurred
        console.log('Share cancelled')
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(url)
      // You could show a toast notification here
      console.log('URL copied to clipboard')
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      <Share2 className="h-4 w-4 mr-2" />
      Share
    </Button>
  )
}

interface DashboardLayoutProps {
  children: React.ReactNode
  ticker: string
}

export function DashboardLayout({ children, ticker }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          {/* Left: Back Navigation */}
          <div className="flex items-center space-x-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Search
              </Button>
            </Link>
            
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2">
              <span className="hidden sm:inline-block font-bold">
                StableRisk
              </span>
            </Link>
          </div>

          {/* Center: Current Stablecoin */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">
              Analyzing
            </span>
            <span className="font-semibold uppercase">
              {ticker}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-2">
            <ShareButton ticker={ticker} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
} 