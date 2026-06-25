import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

let cacheSubs: string[] | null = null
let cacheCats: string[] | null = null

export function useQuestionFilters() {
  const [subjects, setSubjects] = useState<string[]>(cacheSubs ?? [])
  const [categories, setCategories] = useState<string[]>(cacheCats ?? [])
  const [filteredCategories, setFilteredCategories] = useState<string[]>(cacheCats ?? [])
  const [loading, setLoading] = useState(!cacheSubs)

  useEffect(() => {
    if (cacheSubs) return
    let cancelled = false
    async function load() {
      // ponytail: question_meta_cache has 1 row, vs scanning 1281 questions rows
      const { data } = await supabase
        .from('question_meta_cache')
        .select('subjects, categories')
        .single()
      if (cancelled) return
      const subs = (data?.subjects ?? []) as string[]
      const cats = (data?.categories ?? []) as string[]
      cacheSubs = subs
      cacheCats = cats
      setSubjects(subs)
      setCategories(cats)
      setFilteredCategories(cats)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const updateFilteredCategories = useCallback(async (subject: string) => {
    if (!subject) {
      setFilteredCategories(categories.length ? categories : cacheCats ?? [])
      return
    }
    // ponytail: subject has an index now, query is fast on filtered subset
    const { data } = await supabase
      .from('questions')
      .select('category, categories')
      .eq('subject', subject)
    const cats = new Set<string>()
    for (const row of data ?? []) {
      if (row.category) cats.add(row.category)
      if (row.categories) {
        for (const c of row.categories as string[]) {
          if (c) cats.add(c)
        }
      }
    }
    setFilteredCategories([...cats].sort())
  }, [categories])

  return { subjects, categories, filteredCategories, loading, updateFilteredCategories }
}
