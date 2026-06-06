import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'

export function useFavorites() {
  const user = useAuthStore((s) => s.user)
  const version = useRefreshStore((s) => s.version)
  const [favorites, setFavorites] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)

  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([])
      setLoaded(true)
      return
    }
    const { data } = await supabase
      .from('favorites')
      .select('question_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setFavorites((data ?? []).map((r: { question_id: string }) => r.question_id))
    setLoaded(true)
  }, [user])

  useEffect(() => {
    fetchFavorites()
  }, [fetchFavorites, version])

  const toggleFavorite = useCallback(
    (questionId: string) => {
      if (!user) return
      setFavorites((prev) => {
        if (prev.includes(questionId)) {
          supabase.from('favorites').delete().eq('user_id', user.id).eq('question_id', questionId).then()
          return prev.filter((id) => id !== questionId)
        }
        supabase.from('favorites').insert({ user_id: user.id, question_id: questionId }).then()
        return [...prev, questionId]
      })
    },
    [user],
  )

  const isFavorite = useCallback(
    (questionId: string) => favorites.includes(questionId),
    [favorites],
  )

  const removeFavorite = useCallback(
    async (questionId: string) => {
      if (!user) return
      setFavorites((prev) => prev.filter((id) => id !== questionId))
      await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('question_id', questionId)
    },
    [user],
  )

  return { favorites, isFavorite, toggleFavorite, removeFavorite, loaded }
}
