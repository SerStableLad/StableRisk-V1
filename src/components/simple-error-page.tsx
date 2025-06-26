"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

interface SimpleErrorPageProps {
  ticker: string
  errorType: 'not_found' | 'not_stablecoin' | 'api_error'
  tokenName?: string
}

export function SimpleErrorPage({ ticker, errorType, tokenName }: SimpleErrorPageProps) {
  const getErrorContent = () => {
    switch (errorType) {
      case 'not_stablecoin':
        return {
          title: "Not a Stablecoin",
          description: (
            <>
              <p>
                <strong>{tokenName || ticker} ({ticker})</strong> is not a stablecoin.
              </p>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm">
                  This platform is designed specifically for assessing USD-pegged stablecoin risks. 
                  We analyze factors like peg stability, transparency, liquidity, and audit coverage 
                  that are unique to stablecoins.
                </p>
              </div>
            </>
          )
        }
      
      case 'not_found':
        return {
          title: "Token Not Available",
          description: (
            <>
              <p>
                <strong>{ticker}</strong> could not be retrieved from our data sources.
              </p>
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm mb-2">Possible reasons:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Token symbol is misspelled</li>
                  <li>Token is not listed on CoinGecko</li>
                  <li>Token is too new or has low market cap</li>
                </ul>
              </div>
            </>
          )
        }
      
      default:
        return {
          title: "Unable to Load Data",
          description: (
            <p>
              Unable to load data for <strong>{ticker}</strong>. Please try again later.
            </p>
          )
        }
    }
  }

  const { title, description } = getErrorContent()

  return (
    <div className="container mx-auto px-4 py-8">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {description}
          
          {(errorType === 'not_found' || errorType === 'not_stablecoin') && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Try these popular stablecoins:</p>
              <div className="flex gap-2 flex-wrap">
                {['USDT', 'USDC', 'USDS', 'PYUSD', 'FRAX'].map(symbol => (
                  <Button 
                    key={symbol}
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = `/${symbol}`}
                  >
                    {symbol}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          <Button onClick={() => window.history.back()}>
            ← Go Back
          </Button>
        </CardContent>
      </Card>
    </div>
  )
} 