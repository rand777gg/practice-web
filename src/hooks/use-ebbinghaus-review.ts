import { useState, useEffect, useCallback, useRef } from 'react'
import { getReviewQueueIds, type ReviewItem } from '@/lib/ai/ebbinghaus'
import { useAuthStore } from '@/stores/auth-store'

// Module-level cache to avoid re-computing within the same session
let cachedItems: ReviewItem[] | null = null
let cachedUserId: string | null = null

export function useEbbinghausReview() {
  const user = useAuthStore((s) => s.user)
  const [items, setItems] = useState<ReviewItem[]>(cachedItems ?? [])
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    if (!user) return
    // Reuse cache if same user
    if (cachedUserId === user.id && cachedItems) {
      setItems(cachedItems)
      return
    }
    setLoading(true)
    try {
      const result = await getReviewQueueIds(user.id)
      cachedItems = result
      cachedUserId = user.id
      setItems(result)
    } catch { /* ignore */ }
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (user && !loadedRef.current) {
      loadedRef.current = true
      load()
    }
  }, [user, load])

  return {
    reviewItems: items,
    reviewCount: items.length,
    loading,
    reload: load,
  }
}
