import { useState, lazy, Suspense, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'
import { computeEbbinghaus, type EbbinghausData } from '@/lib/ai/ebbinghaus'
import { suggestPlan, hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'
import { useT } from '@/i18n/use-t'

const EbbinghausCurve = lazy(() => import('@/components/charts/EbbinghausCurve').then(m => ({ default: m.EbbinghausCurve })))
const UrgencyChart = lazy(() => import('@/components/charts/UrgencyChart').then(m => ({ default: m.UrgencyChart })))

export function DashboardEbbinghaus() {
  const { t } = useT()
  const { user } = useAuthStore()
  const { isEnabled } = useSettingsStore()
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<EbbinghausData | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiGlow, setAiGlow] = useState(false)
  const [aiFade, setAiFade] = useState(false)

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (data) return

    if (!user) return
    setLoading(true)
    setAiGlow(true)
    const d = await computeEbbinghaus(user.id)
    setData(d)
    setLoading(false)

    if (hasAiConfig() && isEnabled('suggestions') && d.urgency.length > 0) {
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
        setAiSuggestion(text)
      } catch { /* ignore */ }
      setAiLoading(false)
    }

    setTimeout(() => {
      setAiFade(true)
      requestAnimationFrame(() => {
        setAiGlow(false)
        setTimeout(() => setAiFade(false), 1500)
      })
    }, 300)
  }, [expanded, data, user])

  return (
    <Card className={`border-0 shadow-none transition-[border-color,box-shadow] duration-1500 ease-out ${
      aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''
    }`}>
      <CardContent className="pt-0 pb-3">
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            disabled={loading}
            className="text-xs text-muted-foreground gap-1"
          >
            <Sparkles className={`h-3 w-3 text-blue-500 ${loading ? 'animate-pulse' : ''}`} />
            {(() => {
              if (loading) return t('ebbinghaus.loading')
              if (expanded) return t('ebbinghaus.hide')
              return t('ebbinghaus.view')
            })()}
            {data && data.totalReviewQueue > 0 && (
              <span className="text-amber-500 font-medium ml-1">
                ({t('ebbinghaus.pendingReview').replace('{n}', String(data.totalReviewQueue))})
              </span>
            )}
          </Button>
        </div>

        {expanded && (
          <div className="space-y-3 mt-3">
            {aiLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 animate-pulse" />
                AI 正在生成学习建议…
              </p>
            )}
            {aiSuggestion && (
              <p className="text-xs text-muted-foreground leading-relaxed bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-2.5">
                {[...aiSuggestion].map((ch, i) => (
                  <span key={i} className="animate-[charReveal_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.02}s` }}>{ch}</span>
                ))}
              </p>
            )}

            {data && data.curve.length > 0 && (
              <Suspense fallback={<div className="h-[220px]" />}>
                <EbbinghausCurve curve={data.curve} />
              </Suspense>
            )}
            {data && data.urgency.length > 0 && (
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
