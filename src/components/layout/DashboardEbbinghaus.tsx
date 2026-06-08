import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Sparkles } from 'lucide-react'
import { computeEbbinghaus, type EbbinghausData } from '@/lib/ai/ebbinghaus'
import { suggestPlan, hasAiConfig } from '@/lib/ai'
import { useT } from '@/i18n/use-t'

const EbbinghausCurve = lazy(() => import('@/components/charts/EbbinghausCurve').then(m => ({ default: m.EbbinghausCurve })))
const UrgencyChart = lazy(() => import('@/components/charts/UrgencyChart').then(m => ({ default: m.UrgencyChart })))

export function DashboardEbbinghaus() {
  const { t } = useT()
  const { user } = useAuthStore()
  const [data, setData] = useState<EbbinghausData | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const d = await computeEbbinghaus(user!.id)
      if (cancelled) return
      setData(d)
      setLoading(false)

      if (hasAiConfig() && d.urgency.length > 0) {
        setAiLoading(true)
        try {
          const text = await suggestPlan({
            totalReviewQueue: d.totalReviewQueue,
            topUrgent: d.urgency.map(u => ({
              subject: u.subject,
              urgency: u.urgency,
              reviewQueue: u.reviewQueue,
              errorRate: u.errorRate,
            })),
            atRiskCurve: d.curve,
            totalSubjects: d.urgency.length,
          })
          if (!cancelled) setAiSuggestion(text)
        } catch { /* ignore */ }
        if (!cancelled) setAiLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [user])

  if (loading) {
    return (
      <Card className="border-0 shadow-none">
        <CardContent className="flex items-center justify-center py-8 gap-2">
          <Spinner />
          <span className="text-xs text-muted-foreground">正在分析遗忘曲线...</span>
        </CardContent>
      </Card>
    )
  }

  if (!data || (data.curve.length === 0 && data.urgency.length === 0)) return null

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-1">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-blue-500" />
          {t('ebbinghaus.title')}
          {data.totalReviewQueue > 0 && (
            <span className="text-amber-500 font-normal text-xs ml-auto">
              {t('ebbinghaus.pendingReview', { n: data.totalReviewQueue })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {aiLoading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 animate-pulse" />
            AI 正在生成学习建议...
          </p>
        )}
        {aiSuggestion && (
          <p className="text-xs text-muted-foreground leading-relaxed bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-2.5">
            {aiSuggestion}
          </p>
        )}

        {data.curve.length > 0 && (
          <Suspense fallback={<div className="h-[220px]" />}>
            <EbbinghausCurve curve={data.curve} />
          </Suspense>
        )}
        {data.urgency.length > 0 && (
          <Suspense fallback={<div className="h-[120px]" />}>
            <UrgencyChart urgency={data.urgency} />
          </Suspense>
        )}
      </CardContent>
    </Card>
  )
}
