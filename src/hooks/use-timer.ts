import { useEffect, useRef, useState } from 'react'

interface UseTimerOptions {
  durationMs: number
  onExpire?: () => void
}

export function useTimer({ durationMs, onExpire }: UseTimerOptions) {
  const [timeLeft, setTimeLeft] = useState(durationMs)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    const startTime = Date.now()
    const endTime = startTime + durationMs

    const interval = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now())
      setTimeLeft(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        onExpireRef.current?.()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [durationMs])

  const minutes = Math.floor(timeLeft / 60000)
  const seconds = Math.floor((timeLeft % 60000) / 1000)
  const isWarning = timeLeft < 5 * 60 * 1000
  const isExpired = timeLeft <= 0

  return {
    timeLeft,
    minutes,
    seconds,
    isWarning,
    isExpired,
    formatted: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  }
}
