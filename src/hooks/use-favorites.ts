import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'

function getStorageKey(userId: string) {
  return `practice_favorites_${userId}`
}

export function useFavorites() {
  const user = useAuthStore((s) => s.user)
  const [favorites, setFavorites] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) {
      setFavorites([])
      setLoaded(true)
      return
    }
    try {
      const raw = localStorage.getItem(getStorageKey(user.id))
      setFavorites(raw ? JSON.parse(raw) : [])
    } catch {
      setFavorites([])
    }
    setLoaded(true)
  }, [user])

  useEffect(() => {
    if (!user || !loaded) return
    localStorage.setItem(getStorageKey(user.id), JSON.stringify(favorites))
  }, [favorites, user, loaded])

  const toggleFavorite = useCallback((questionId: string) => {
    setFavorites((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId],
    )
  }, [])

  const isFavorite = useCallback(
    (questionId: string) => favorites.includes(questionId),
    [favorites],
  )

  const removeFavorite = useCallback((questionId: string) => {
    setFavorites((prev) => prev.filter((id) => id !== questionId))
  }, [])

  return { favorites, isFavorite, toggleFavorite, removeFavorite, loaded }
}
