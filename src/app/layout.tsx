import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"
import { ThemeProvider } from "@/components/theme-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "StableRisk by SerStableLad",
  description: "Comprehensive risk assessment for USD-pegged stablecoins. Analyze peg stability, transparency, liquidity, oracle setup, and audit status.",
  keywords: ["stablecoin", "risk assessment", "DeFi", "cryptocurrency", "USDT", "USDC", "DAI"],
  authors: [{ name: "SerStableLad" }],
  openGraph: {
    title: "StableRisk - Stablecoin Risk Assessment",
    description: "Get comprehensive risk analysis for USD-pegged stablecoins",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(
        inter.className,
        "min-h-screen bg-background font-sans antialiased"
      )}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="relative flex min-h-screen flex-col">
            <main className="flex-1">
              {children}
            </main>
          <footer className="border-t py-6 md:py-0">
            <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
              <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
                <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                  Built by{" "}
                  <a 
                    href="https://x.com/SerStableLad" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-4 hover:text-foreground transition-colors"
                  >
                    SerStableLad
                  </a>
                  . Not financial advice.
                </p>
              </div>
            </div>
          </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
} 