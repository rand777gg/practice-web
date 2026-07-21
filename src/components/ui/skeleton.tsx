import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-3 p-6 rounded-lg border', className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-3/4" />
    </div>
  )
}

export { Skeleton }
