import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get risk score color class based on score value
 * Red: 0-5, Yellow: 5-8, Green: 8-10
 */
export function getRiskScoreColor(score: number): string {
  if (score <= 5) return "text-risk-high"
  if (score <= 8) return "text-risk-medium"
  return "text-risk-low"
}

/**
 * Get risk score background color class
 */
export function getRiskScoreBgColor(score: number): string {
  if (score <= 5) return "bg-risk-high"
  if (score <= 8) return "bg-risk-medium"
  return "bg-risk-low"
}

/**
 * Format number with appropriate decimal places
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/**
 * Format currency with $ symbol
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`
  return formatCurrency(num)
} 