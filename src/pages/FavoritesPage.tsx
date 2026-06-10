import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useFavorites } from '@/hooks/use-favorites'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { Skeleton } from '@/components/ui/skeleton'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { favorites, isFavorite, toggleFavorite, loaded } = useFavorites()
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!loaded) return
    async function load() {
      if (favorites.length === 0) {
        setQuestions([])
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      const { data } = await supabase
        .from('questions')
        .select('*')
        .in('id', favorites)
      setQuestions((data ?? []) as Question[])
      setIsLoading(false)
    }
    load()
  }, [favorites, loaded])

  if (!loaded || isLoading) {
    return (
      <div className="max-w-5xl">
        <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('favorites.title')}</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 lg:p-6 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('favorites.title')}</h1>
      {questions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('favorites.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              disabled
              showResult
              isFavorited={isFavorite(q.id)}
              onToggleFavorite={() => toggleFavorite(q.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
