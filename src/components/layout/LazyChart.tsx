import { type ReactNode } from 'react'
import { useIntersectionObserver } from '@/hooks/use-intersection-observer'
import { SkeletonCard } from '@/components/ui/skeleton'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  rootMargin?: string
}

export function LazyChart({ children, fallback, rootMargin = '300px' }: Props) {
  const { ref, isIntersecting } = useIntersectionObserver({ rootMargin })

  return (
    <div ref={ref}>
      {isIntersecting ? children : (fallback ?? <SkeletonCard />)}
    </div>
  )
}
