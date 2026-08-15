import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface SubjectExplanation {
  subject: string
  content: string
  updated_at: string
}

let cache: Map<string, SubjectExplanation> | null = null

export function useSubjectExplanations() {
  const [explanations, setExplanations] = useState<Map<string, SubjectExplanation>>(new Map())
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (cache) { setExplanations(cache); setLoaded(true); return }
    const { data } = await supabase.from('subject_explanations').select('subject, content, updated_at')
    const map = new Map<string, SubjectExplanation>()
    for (const row of (data ?? []) as SubjectExplanation[]) map.set(row.subject, row)
    cache = map
    setExplanations(map)
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    cache = null
    await load()
  }, [load])

  return { explanations, loaded, refresh }
}
