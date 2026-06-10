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
      const { data } = await supabase.from('questions').select('subject, category, categories')
      if (cancelled) return
      const subs = new Set<string>()
      const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
        if (row.categories) {
          for (const c of row.categories as string[]) {
            if (c) cats.add(c)
          }
        }
      }
      cacheSubs = [...subs].sort()
      cacheCats = [...cats].sort()
      setSubjects(cacheSubs)
      setCategories(cacheCats)
      setFilteredCategories(cacheCats)
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
