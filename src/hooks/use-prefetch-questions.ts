import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { bulkPrefetchQuestions, getPrefetchedQuestionIds } from '@/lib/offline-db'

export function usePrefetchPlanQuestions(enabled: boolean) {
  const ranRef = useRef(false)

  useEffect(() => {
    if (!enabled || ranRef.current) return
    ranRef.current = true

    const run = async () => {
      try {
        // Check what we already have
        const existing = new Set(await getPrefetchedQuestionIds())

        // Fetch ALL questions (full data) for offline practice use
        const { data } = await supabase.from('questions').select('*')
        if (!data || data.length === 0) return

        const toStore = data
          .filter((q: any) => !existing.has(q.id))
          .map((q: any) => ({ id: q.id, data: q }))

        if (toStore.length > 0) {
          await bulkPrefetchQuestions(toStore)
        }
      } catch { /* best-effort background prefetch */ }
    }
    // Delay prefetch to avoid competing with initial page load
    const id = setTimeout(run, 3000)
    return () => clearTimeout(id)
  }, [enabled])
}
