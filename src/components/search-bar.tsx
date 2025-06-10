"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SearchBarProps {
  className?: string
  placeholder?: string
  size?: "default" | "lg"
}

export function SearchBar({ 
  className, 
  placeholder = "Enter stablecoin ticker (e.g., USDT, USDC, DAI)",
  size = "default"
}: SearchBarProps) {
  const [ticker, setTicker] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!ticker.trim()) {
      setError("Please enter a stablecoin ticker")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      // Clean and format ticker
      const cleanTicker = ticker.trim().toUpperCase()
      
      // Navigate to the assessment page
      router.push(`/${cleanTicker}`)
    } catch (err) {
      setError("Something went wrong. Please try again.")
      console.error("Search error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTicker(e.target.value)
    if (error) setError("") // Clear error when user starts typing
  }

  return (
    <div className={cn("w-full max-w-2xl", className)}>
      <form onSubmit={handleSearch} className="space-y-4">
        <div className="relative">
          <Input
            type="text"
            placeholder={placeholder}
            value={ticker}
            onChange={handleInputChange}
            className={cn(
              "pr-12",
              size === "lg" && "h-14 text-lg",
              error && "border-destructive focus-visible:ring-destructive"
            )}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size={size === "lg" ? "lg" : "default"}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2",
              size === "lg" && "h-12"
            )}
            disabled={isLoading || !ticker.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="sr-only">Search stablecoin</span>
          </Button>
        </div>
        
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>
      
      <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">
          Popular: 
          <button
            type="button"
            onClick={() => setTicker("USDT")}
            className="ml-2 text-primary hover:underline"
            disabled={isLoading}
          >
            USDT
          </button>
          <span className="mx-1">•</span>
          <button
            type="button"
            onClick={() => setTicker("USDC")}
            className="text-primary hover:underline"
            disabled={isLoading}
          >
            USDC
          </button>
          <span className="mx-1">•</span>
          <button
            type="button"
            onClick={() => setTicker("DAI")}
            className="text-primary hover:underline"
            disabled={isLoading}
          >
            DAI
          </button>
        </p>
      </div>
    </div>
  )
} 