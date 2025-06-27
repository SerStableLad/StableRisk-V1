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
    <Button variant="outline" size="sm" onClick={handleShare} className="text-xs sm:text-sm">
      <Share2 className="h-4 w-4 mr-1 sm:mr-2" />
      <span className="hidden xs:inline">Share</span>
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
        <div className="container mx-auto px-2 sm:px-4 md:px-6 flex h-14 items-center justify-between">
          {/* Left: Back Navigation */}
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-1">
            <Link href="/">
              <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
                <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden xs:inline">Back to Search</span>
                <span className="xs:hidden">Back</span>
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
          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <span className="text-xs sm:text-sm text-muted-foreground hidden xs:inline">
              Analyzing
            </span>
            <span className="font-semibold uppercase text-sm sm:text-base">
              {ticker}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-1 sm:space-x-2 min-w-0 flex-1 justify-end">
            <ShareButton ticker={ticker} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 md:px-6 py-8">
        {children}
      </main>
    </div>
  )
} 