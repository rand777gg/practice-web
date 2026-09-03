import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface KpExplanation {
  subject: string
  kp: string
  content: string
  updated_at: string
}

// Composite key — the same KP name can exist under different subjects
export function kpExplanationKey(subject: string, kp: string) {
  return `${subject}\u0000${kp}`
}

let cache: Map<string, KpExplanation> | null = null

export function useKpExplanations() {
  const [explanations, setExplanations] = useState<Map<string, KpExplanation>>(new Map())
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (cache) { setExplanations(cache); setLoaded(true); return }
    const { data } = await supabase.from('kp_explanations').select('subject, kp, content, updated_at')
    const map = new Map<string, KpExplanation>()
    for (const row of (data ?? []) as KpExplanation[]) map.set(kpExplanationKey(row.subject, row.kp), row)
    cache = map
    setExplanations(map)
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    cache = null
    await load()
  }, [load])

  const get = useCallback((subject: string, kp: string): KpExplanation | undefined =>
    explanations.get(kpExplanationKey(subject, kp)), [explanations])

  return { explanations, loaded, refresh, get }
}
