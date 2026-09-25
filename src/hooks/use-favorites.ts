import { useState, useEffect, useCallback, useRef } from 'react'
import { addFavorite, fetchFavoriteQuestionIds, removeFavorite as unfavorite } from '@/services/practice'
import { logError } from '@/services/errors'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'

export function useFavorites() {
  const user = useAuthStore((s) => s.user)
  const version = useRefreshStore((s) => s.version)
  const [favorites, setFavorites] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchGenRef = useRef(0)

  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([])
      setLoaded(true)
      return
    }
    fetchGenRef.current++
    const myGen = fetchGenRef.current

    let ids: string[] = []
    try {
      ids = await fetchFavoriteQuestionIds(user.id)
    } catch (e) {
      logError('useFavorites.fetchFavorites', e)
    }
    if (fetchGenRef.current !== myGen) return

    setFavorites(ids)
    setLoaded(true)
  }, [user?.id])

  useEffect(() => {
    fetchFavorites()
  }, [fetchFavorites, version])

  const toggleFavorite = useCallback(
    (questionId: string) => {
      if (!user) return
      setFavorites((prev) => {
        if (prev.includes(questionId)) {
          unfavorite(user.id, questionId).catch((e) => logError('useFavorites.toggleFavorite', e))
          return prev.filter((id) => id !== questionId)
        }
        addFavorite(user.id, questionId).catch((e) => logError('useFavorites.toggleFavorite', e))
        return [...prev, questionId]
      })
    },
    [user?.id],
  )

  const isFavorite = useCallback(
    (questionId: string) => favorites.includes(questionId),
    [favorites],
  )

  const removeFavorite = useCallback(
    async (questionId: string) => {
      if (!user) return
      setFavorites((prev) => prev.filter((id) => id !== questionId))
      try {
        await unfavorite(user.id, questionId)
      } catch (e) {
        logError('useFavorites.removeFavorite', e)
      }
    },
    [user?.id],
  )

  return { favorites, isFavorite, toggleFavorite, removeFavorite, loaded }
}
