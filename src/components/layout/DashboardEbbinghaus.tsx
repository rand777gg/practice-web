import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  const [showDetails, setShowDetails] = useState(false)
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

  if (loading) return null

  if (!data || (data.curve.length === 0 && data.urgency.length === 0)) return null

  return (
    <Card className="border-0 shadow-none">
      <CardContent className="pt-0 pb-3">
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-muted-foreground gap-1"
          >
            <Sparkles className="h-3 w-3 text-blue-500" />
            {showDetails ? t('ebbinghaus.hide') : t('ebbinghaus.view')}
            {data.totalReviewQueue > 0 && (
              <span className="text-amber-500 font-medium ml-1">
                ({t('ebbinghaus.pendingReview').replace('{n}', String(data.totalReviewQueue))})
              </span>
            )}
          </Button>
        </div>

        {showDetails && (
          <div className="space-y-3 mt-3">
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
          </div>
        )}
      </CardContent>
    </Card>
  )
}
