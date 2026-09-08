import { useEffect } from 'react'

export function useForceDarkPage() {
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains('dark')
    const eyeCareClasses = Array.from(root.classList).filter((c) => c.startsWith('eye-care-'))
    root.classList.add('dark')
    root.classList.remove(...eyeCareClasses)
    return () => {
      if (!wasDark) root.classList.remove('dark')
      root.classList.add(...eyeCareClasses)
    }
  }, [])
}
