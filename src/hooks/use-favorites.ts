import { useState, useEffect, useCallback, useRef } from 'react'
import { addFavorite, fetchFavoriteQuestionIds, removeFavorite as unfavorite } from '@/services/practice'
import { logError } from '@/services/errors'
import { commitOptimistic } from '@/lib/optimistic'
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

  /**
   * 收藏是切换语义：列表要立刻响应，写失败再按项改回来。
   *
   * 原来把服务调用写在 setFavorites 的 updater 里 —— 那是副作用，React 在开发模式下会
   * 双调用 updater，于是这里会**发两次请求**。现在先改本地，写请求在 updater 外面发。
   *
   * 回滚用函数式更新只动这一项：两个收藏操作重叠时（前一个失败得慢），快照式回滚会把
   * 后一个成功的改动一起抹掉。
   */
  const toggleFavorite = useCallback(
    (questionId: string) => {
      if (!user) return
      const wasFavorite = favorites.includes(questionId)
      setFavorites((prev) =>
        wasFavorite
          ? prev.filter((id) => id !== questionId)
          : prev.includes(questionId) ? prev : [...prev, questionId],
      )
      void commitOptimistic({
        rollback: () => setFavorites((prev) =>
          wasFavorite
            ? prev.includes(questionId) ? prev : [...prev, questionId]
            : prev.filter((id) => id !== questionId),
        ),
        commit: () => (wasFavorite ? unfavorite(user.id, questionId) : addFavorite(user.id, questionId)),
        onError: (e) => logError('useFavorites.toggleFavorite', e),
      })
    },
    [user?.id, favorites],
  )

  const isFavorite = useCallback(
    (questionId: string) => favorites.includes(questionId),
    [favorites],
  )

  const removeFavorite = useCallback(
    async (questionId: string) => {
      if (!user) return
      setFavorites((prev) => prev.filter((id) => id !== questionId))
      await commitOptimistic({
        rollback: () => setFavorites((prev) => (prev.includes(questionId) ? prev : [...prev, questionId])),
        commit: () => unfavorite(user.id, questionId),
        onError: (e) => logError('useFavorites.removeFavorite', e),
      })
    },
    [user?.id],
  )

  return { favorites, isFavorite, toggleFavorite, removeFavorite, loaded }
}
