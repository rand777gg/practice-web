import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useFavorites } from '@/hooks/use-favorites'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { Spinner } from '@/components/ui/spinner'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { favorites, isFavorite, toggleFavorite } = useFavorites()
  const [questions, setQuestions] = useState<Question[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
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
  }, [favorites])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl lg:text-2xl font-bold mb-6">{t('favorites.title')}</h1>
      {questions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('favorites.empty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
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
