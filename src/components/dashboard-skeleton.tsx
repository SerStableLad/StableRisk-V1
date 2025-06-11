import React from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

// Tier 1: Basic info and preliminary score skeleton
export function Tier1Skeleton() {
  return (
    <div className="space-y-8">
      {/* Main Summary Card Skeleton */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Risk Score Meter Skeleton */}
            <div className="flex justify-center lg:justify-start">
              <div className="flex flex-col items-center space-y-4">
                <Skeleton className="h-32 w-32 rounded-full" />
                <div className="space-y-2 text-center">
                  <Skeleton className="h-4 w-20 mx-auto" />
                  <Skeleton className="h-3 w-24 mx-auto" />
                </div>
              </div>
            </div>
            
            {/* Info Skeleton */}
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading message */}
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 text-muted-foreground">
          <div className="h-4 w-4 rounded-full bg-primary animate-pulse" />
          <span>Loading basic information...</span>
        </div>
      </div>
    </div>
  )
}

// Tier 2: Risk factors and stability analysis skeleton
export function Tier2Skeleton() {
  return (
    <div className="space-y-8">
      {/* Risk Summary Cards Skeleton */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <Skeleton className="h-8 w-64 mx-auto" />
          <Skeleton className="h-4 w-96 mx-auto" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Skeleton className="h-5 w-5" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-12" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-16 w-16 rounded-full" />
                </div>
                
                <Skeleton className="h-12 w-full" />
                
                <div className="flex items-center justify-between">
                  <div className="flex space-x-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
                
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Loading message */}
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 text-muted-foreground">
          <div className="h-4 w-4 rounded-full bg-primary animate-pulse" />
          <span>Analyzing risk factors...</span>
        </div>
      </div>
    </div>
  )
}

// Tier 3: Detailed sections skeleton
export function Tier3Skeleton() {
  return (
    <div className="space-y-8">
      {/* Peg Stability Section Skeleton */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-6 w-32" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chart skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-64 w-full" />
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center space-y-2">
                <Skeleton className="h-4 w-24 mx-auto" />
                <Skeleton className="h-6 w-16 mx-auto" />
              </div>
              <div className="text-center space-y-2">
                <Skeleton className="h-4 w-20 mx-auto" />
                <Skeleton className="h-6 w-12 mx-auto" />
              </div>
              <div className="text-center space-y-2">
                <Skeleton className="h-4 w-28 mx-auto" />
                <Skeleton className="h-6 w-20 mx-auto" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Sections Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Skeleton className="h-6 w-6" />
                <Skeleton className="h-6 w-24" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
              
              {i === 0 && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}
              
              {i === 1 && (
                <div className="space-y-2">
                  <Skeleton className="h-32 w-full" />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Loading message */}
      <div className="text-center">
        <div className="inline-flex items-center space-x-2 text-muted-foreground">
          <div className="h-4 w-4 rounded-full bg-primary animate-pulse" />
          <span>Loading comprehensive analysis...</span>
        </div>
      </div>
    </div>
  )
}

// Combined progressive skeleton that shows different states
export function ProgressiveDashboardSkeleton({ tier = 1 }: { tier?: 1 | 2 | 3 }) {
  return (
    <div className="space-y-8">
      <Tier1Skeleton />
      
      {tier >= 2 && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <Tier2Skeleton />
        </div>
      )}
      
      {tier >= 3 && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 delay-300">
          <Tier3Skeleton />
        </div>
      )}
    </div>
  )
} 