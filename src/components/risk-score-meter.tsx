import React from "react"
import { cn } from "@/lib/utils"

interface RiskScoreMeterProps {
  score: number
  size?: "sm" | "md" | "lg"
  className?: string
  showScore?: boolean
}

export function RiskScoreMeter({ 
  score, 
  size = "lg", 
  className,
  showScore = true 
}: RiskScoreMeterProps) {
  // Determine risk level and color
  const getRiskLevel = (score: number) => {
    if (score <= 30) return { level: "High Risk", color: "text-red-500", bgColor: "stroke-red-500" }
    if (score <= 60) return { level: "Medium Risk", color: "text-yellow-500", bgColor: "stroke-yellow-500" }
    return { level: "Low Risk", color: "text-green-500", bgColor: "stroke-green-500" }
  }

  const riskInfo = getRiskLevel(score)
  
  // Size configurations
  const sizeConfig = {
    sm: { radius: 35, strokeWidth: 6, textSize: "text-lg", labelSize: "text-xs" },
    md: { radius: 50, strokeWidth: 8, textSize: "text-2xl", labelSize: "text-sm" },
    lg: { radius: 70, strokeWidth: 10, textSize: "text-4xl", labelSize: "text-base" }
  }
  
  const config = sizeConfig[size]
  const circumference = 2 * Math.PI * config.radius
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (score / 100) * circumference
  
  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      {/* Circular Progress */}
      <div className="relative">
        <svg 
          width={config.radius * 2 + config.strokeWidth * 2} 
          height={config.radius * 2 + config.strokeWidth * 2}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={config.radius + config.strokeWidth}
            cy={config.radius + config.strokeWidth}
            r={config.radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="transparent"
            className="text-muted-foreground/20"
          />
          
          {/* Progress circle */}
          <circle
            cx={config.radius + config.strokeWidth}
            cy={config.radius + config.strokeWidth}
            r={config.radius}
            stroke="currentColor"
            strokeWidth={config.strokeWidth}
            fill="transparent"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={cn("transition-all duration-1000 ease-out", riskInfo.bgColor)}
          />
        </svg>
        
        {/* Score display in center */}
        {showScore && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("font-bold", config.textSize, riskInfo.color)}>
              {score}
            </span>
            <span className={cn("text-muted-foreground", config.labelSize)}>
              / 100
            </span>
          </div>
        )}
      </div>
      
      {/* Risk level label */}
      <div className="mt-4 text-center">
        <div className={cn("font-semibold", config.labelSize, riskInfo.color)}>
          {riskInfo.level}
        </div>
        <div className={cn("text-muted-foreground", config.labelSize === "text-xs" ? "text-xs" : "text-sm")}>
          Risk Assessment
        </div>
      </div>
    </div>
  )
} 