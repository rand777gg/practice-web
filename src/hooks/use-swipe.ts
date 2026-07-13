import { useRef, useCallback, useState } from 'react'

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 }: UseSwipeOptions) {
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const [swipeOffset, setSwipeOffset] = useState(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const deltaX = e.touches[0].clientX - touchStartX.current
      const deltaY = e.touches[0].clientY - touchStartY.current
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        e.preventDefault()
        setSwipeOffset(deltaX)
      }
    },
    [],
  )

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current
      const deltaY = e.changedTouches[0].clientY - touchStartY.current

      setSwipeOffset(0)

      if (Math.abs(deltaX) < Math.abs(deltaY)) return
      if (Math.abs(deltaX) < threshold) return

      if (deltaX > 0) {
        onSwipeRight?.()
      } else {
        onSwipeLeft?.()
      }
    },
    [onSwipeLeft, onSwipeRight, threshold],
  )

  return { onTouchStart, onTouchMove, onTouchEnd, swipeOffset }
}
