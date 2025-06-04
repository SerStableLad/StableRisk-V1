import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Risk assessment utilities
export function getRiskColor(score: number): string {
  if (score >= 8) return "text-green-600 dark:text-green-400"  // Low risk (high score)
  if (score >= 6) return "text-yellow-600 dark:text-yellow-400"  // Medium risk
  if (score >= 3) return "text-orange-600 dark:text-orange-400"  // High risk
  return "text-red-600 dark:text-red-400"  // Very high/critical risk (low score)
}

export function getRiskBadgeColor(score: number): string {
  if (score >= 8) return "bg-green-600 text-white"  // Low risk (high score)
  if (score >= 6) return "bg-yellow-600 text-white"  // Medium risk
  if (score >= 3) return "bg-orange-600 text-white"  // High risk
  return "bg-red-600 text-white"  // Very high/critical risk (low score)
}

export function getRiskLevel(score: number): string {
  if (score >= 8) return "Low"      // High score = Low risk
  if (score >= 6) return "Medium"   // Medium score = Medium risk
  if (score >= 3) return "High"     // Low score = High risk
  return "Critical"                 // Very low score = Critical risk
}

export function formatMarketCap(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`
} 