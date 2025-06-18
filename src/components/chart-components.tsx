import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Dynamically import heavy components to reduce initial bundle size
export const PegStabilitySection = dynamic(
  () => import('./peg-stability-section').then(mod => ({ default: mod.PegStabilitySection })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

export const LiquiditySection = dynamic(
  () => import('./liquidity-section').then(mod => ({ default: mod.LiquiditySection })),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
)

// Export other heavy components dynamically
export const AuditSection = dynamic(
  () => import('./audit-section').then(mod => ({ default: mod.AuditSection })),
  {
    loading: () => <Skeleton className="h-[400px] w-full" />,
  }
)

export const TransparencySection = dynamic(
  () => import('./transparency-section').then(mod => ({ default: mod.TransparencySection })),
  {
    loading: () => <Skeleton className="h-[300px] w-full" />,
  }
) 