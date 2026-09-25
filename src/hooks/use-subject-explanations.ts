import { useCallback, useEffect, useState } from 'react'
import { fetchSubjectExplanations, type SubjectExplanation } from '@/services/practice'
import { logError } from '@/services/errors'

export type { SubjectExplanation }

let cache: Map<string, SubjectExplanation> | null = null

export function useSubjectExplanations() {
  const [explanations, setExplanations] = useState<Map<string, SubjectExplanation>>(new Map())
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (cache) { setExplanations(cache); setLoaded(true); return }
    const map = new Map<string, SubjectExplanation>()
    try {
      for (const row of await fetchSubjectExplanations()) map.set(row.subject, row)
    } catch (e) {
      logError('useSubjectExplanations.load', e)
    }
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
