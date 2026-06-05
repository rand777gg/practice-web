import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pencil, Clock, RotateCcw } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const { user } = useAuthStore()
  const [stats, setStats] = useState({ totalAnswered: 0, wrongCount: 0, examsCompleted: 0 })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function load() {
      const { count: total } = await supabase
        .from('user_answers')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)

      const { count: wrong } = await supabase
        .from('user_answers')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('is_correct', false)

      const { count: exams } = await supabase
        .from('exam_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('status', 'completed')

      setStats({
        totalAnswered: total ?? 0,
        wrongCount: wrong ?? 0,
        examsCompleted: exams ?? 0,
      })
      setIsLoading(false)
    }
    load()
  }, [user])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl lg:text-2xl font-bold">{t('dashboard.title')}</h1>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t('dashboard.totalAnswered')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl lg:text-3xl font-bold">{stats.totalAnswered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t('dashboard.wrongAnswers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl lg:text-3xl font-bold text-destructive">{stats.wrongCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t('dashboard.examsCompleted')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl lg:text-3xl font-bold">{stats.examsCompleted}</p>
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="sm:h-9 sm:px-4 sm:py-2">
          <Link to="/practice">
            <Pencil className="h-4 w-4" />
            {t('dashboard.startPractice')}
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/exam">
            <Clock className="h-4 w-4" />
            {t('dashboard.takeExam')}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/review">
            <RotateCcw className="h-4 w-4" />
            {t('dashboard.reviewMistakes')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
