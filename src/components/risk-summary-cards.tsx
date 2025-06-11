'use client'

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RiskScoreMeter } from "@/components/risk-score-meter"
import { 
  Eye, 
  Droplets, 
  Network, 
  FileCheck, 
  Clock,
  AlertTriangle,
  CheckCircle
} from "lucide-react"

interface RiskFactor {
  name: string
  score: number | null
  summary: string
  lastUpdated?: string
  hasIssues?: boolean
  isVerified?: boolean
}

interface RiskSummaryCardsProps {
  transparency: RiskFactor
  liquidity: RiskFactor
  oracle: RiskFactor
  audit: RiskFactor
}

// Scroll to section functionality (client-side)
function scrollToSection(section: string) {
  const element = document.getElementById(section)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' })
  }
}

export function RiskSummaryCards({
  transparency,
  liquidity,
  oracle,
  audit
}: RiskSummaryCardsProps) {
  
  const getRiskBadgeVariant = (score: number | null) => {
    if (score === null) return "outline"
    if (score <= 30) return "destructive"
    if (score <= 60) return "warning" 
    return "success"
  }

  const getRiskLevel = (score: number | null) => {
    if (score === null) return "Unrated"
    if (score <= 30) return "High Risk"
    if (score <= 60) return "Medium Risk"
    return "Low Risk"
  }

  const formatScore = (score: number | null) => {
    return score !== null ? score.toString() : "N/A"
  }

  const RiskCard = ({ 
    factor, 
    icon: Icon, 
    section,
    description 
  }: { 
    factor: RiskFactor
    icon: React.ElementType
    section: string
    description: string
  }) => (
    <Card 
      className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] group"
      onClick={() => scrollToSection(section)}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center space-x-2">
            <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span>{factor.name}</span>
          </div>
          <Badge variant={getRiskBadgeVariant(factor.score)}>
            {getRiskLevel(factor.score)}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">
              {formatScore(factor.score)}
              {factor.score !== null && (
                <span className="text-sm text-muted-foreground ml-1">/100</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          
          {factor.score !== null && (
            <RiskScoreMeter 
              score={factor.score} 
              size="sm" 
              showScore={false}
              className="ml-4"
            />
          )}
        </div>

        {/* Summary */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {factor.summary}
        </p>

        {/* Status Indicators */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-3">
            {factor.isVerified && (
              <div className="flex items-center space-x-1 text-green-600">
                <CheckCircle className="h-3 w-3" />
                <span>Verified</span>
              </div>
            )}
            
            {factor.hasIssues && (
              <div className="flex items-center space-x-1 text-yellow-600">
                <AlertTriangle className="h-3 w-3" />
                <span>Issues Found</span>
              </div>
            )}
          </div>

          {factor.lastUpdated && (
            <div className="flex items-center space-x-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{factor.lastUpdated}</span>
            </div>
          )}
        </div>

        {/* Click hint */}
        <div className="pt-2 border-t">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full text-xs text-muted-foreground hover:text-primary"
          >
            Click to view details →
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold">Risk Factor Analysis</h3>
        <p className="text-muted-foreground">
          Click any card to explore detailed analysis for each risk factor
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <RiskCard
          factor={transparency}
          icon={Eye}
          section="transparency"
          description="Proof of reserves & attestation"
        />
        
        <RiskCard
          factor={liquidity}
          icon={Droplets}
          section="liquidity"
          description="Market depth & concentration"
        />
        
        <RiskCard
          factor={oracle}
          icon={Network}
          section="oracle"
          description="Price feed security"
        />
        
        <RiskCard
          factor={audit}
          icon={FileCheck}
          section="audit"
          description="Security assessment history"
        />
      </div>
    </div>
  )
} 