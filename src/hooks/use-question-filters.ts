import { useState, useEffect, useCallback } from 'react'
import { logError } from '@/services/errors'
import { fetchQuestionCategories, fetchQuestionMetaCache } from '@/services/questions'

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
      let subs: string[] = []
      let cats: string[] = []
      try {
        const meta = await fetchQuestionMetaCache()
        subs = meta.subjects
        cats = meta.categories
      } catch (e) {
        logError('useQuestionFilters.load', e)
      }
      if (cancelled) return
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
    let cats: string[] = []
    try {
      // 一个学科的分类就可能上千条, PostgREST 单次最多回 1000 行 —— 服务层翻页取全
      cats = await fetchQuestionCategories([subject])
    } catch (e) {
      logError('useQuestionFilters.updateFilteredCategories', e)
    }
    setFilteredCategories(cats)
  }, [categories])

  return { subjects, categories, filteredCategories, loading, updateFilteredCategories }
}
