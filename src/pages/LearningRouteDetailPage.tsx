import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ChevronDown, ChevronRight, CircleDot, CircleCheck, PlayCircle, Pencil, ListChecks,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteDiagramTabs } from '@/components/learning-route/RouteDiagramTabs'
import type { RouteMapStageNode } from '@/components/learning-route/RouteMapFigure'
import { useLearningRouteDetail } from '@/hooks/use-learning-routes'
import { useAuthStore } from '@/stores/auth-store'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Question } from '@/types'

function questionPreview(q: Question) {
  const text = q.question_text.replace(/[#*`_>\[\]!\-~]/g, '').replace(/\s+/g, ' ').trim()
  return text.length > 90 ? text.slice(0, 90) + '…' : text
}

export function Component() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  const { detail, isLoading } = useLearningRouteDetail(routeId)

  const stageNodes: RouteMapStageNode[] = useMemo(() => {
    return (detail?.stages ?? []).map(s => ({
      id: s.id,
      label: s.title || `阶段 ${s.position + 1}`,
      sublabel: `${s.questions.length} 题`,
    }))
  }, [detail])

  const stageState = useMemo(() => {
    if (!detail) return undefined
    const out: Record<string, 'todo' | 'done'> = {}
    for (const s of detail.stages) {
      const done = s.questions.length > 0 && s.questions.every(q => detail.passByQuestion[q.id])
      if (done) out[s.id] = 'done'
    }
    return out
  }, [detail])

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[420px] w-full" />
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="max-w-5xl mx-auto">
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">路线不存在或尚未发布。</CardContent></Card>
      </div>
    )
  }

  const { route, stages, totalCount, doneCount } = detail
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate('/learning-routes')}>
        <ArrowLeft className="h-4 w-4 mr-1" /> 全部路线
      </Button>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <CardTitle className="text-xl">{route.title}</CardTitle>
              {route.description && <CardDescription className="whitespace-pre-wrap">{route.description}</CardDescription>}
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" asChild className="shrink-0">
                <Link to={`/admin/learning-routes/${route.id}/edit`}><Pencil className="h-3.5 w-3.5 mr-1" />编辑</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CircleDot className="h-4 w-4" />{stages.length} 个阶段</span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground"><ListChecks className="h-4 w-4" />{totalCount} 题</span>
            <span className={cn('font-medium', doneCount > 0 && doneCount === totalCount ? 'text-green-600' : '')}>
              已完成 {doneCount} / {totalCount}（{percent}%）
            </span>
          </div>
          {totalCount > 0 && <Progress value={percent} className="h-2" />}
          {totalCount > 0 && (
            <Button size="sm" onClick={() => navigate(`/learning-routes/${route.id}/practice`)}>
              <PlayCircle className="h-4 w-4 mr-1.5" />开始整条路线
            </Button>
          )}
        </CardContent>
      </Card>

      {stages.length > 0 && (
        <RouteDiagramTabs
          title={route.title || '学习路线'}
          stages={stageNodes}
          state={stageState}
          diagramXml={route.diagram_xml}
          height={Math.min(900, 420 + stages.length * 46)}
        />
      )}

      {stages.map((stage, si) => {
        const doneQuestions = stage.questions.filter(q => detail.passByQuestion[q.id]).length
        const stageDone = stage.questions.length > 0 && doneQuestions === stage.questions.length
        return (
          <Card key={stage.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <span className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  stageDone ? 'bg-green-600 text-white' : 'bg-primary/10 text-primary',
                )}>
                  {si + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{stage.title || `阶段 ${si + 1}`}</CardTitle>
                    {stageDone && <Badge className="bg-green-600/90 text-white border-0"><CircleCheck className="h-3 w-3 mr-1" />已通过</Badge>}
                  </div>
                  {stage.description && <CardDescription className="text-xs whitespace-pre-wrap">{stage.description}</CardDescription>}
                  <p className="text-xs text-muted-foreground">已通过 {doneQuestions}/{stage.questions.length} 题</p>
                </div>
                {stage.questions.length > 0 && (
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/learning-routes/${route.id}/practice?stage=${stage.id}`)}>
                    <PlayCircle className="h-4 w-4 mr-1" />练习本阶段
                  </Button>
                )}
              </div>
            </CardHeader>
            {stage.questions.length === 0 ? (
              <CardContent className="pt-0 text-xs text-muted-foreground">该阶段暂无题目。</CardContent>
            ) : (
              <CardContent className="pt-0 space-y-1">
                {stage.questions.map((q, qi) => {
                  const passed = !!detail.passByQuestion[q.id]
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => navigate(`/learning-routes/${route.id}/practice?stage=${stage.id}&start=${q.id}`)}
                      className="w-full flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent group"
                    >
                      <span className={cn(
                        'h-5 w-5 shrink-0 rounded-full border flex items-center justify-center',
                        passed ? 'border-green-500 text-green-600' : 'border-muted-foreground/40 text-muted-foreground/60',
                      )}>
                        {passed ? <CircleCheck className="h-4 w-4" /> : <span className="text-[10px] font-medium">{qi + 1}</span>}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{questionPreview(q)}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">{QUESTION_TYPE_LABELS[q.question_type] ?? q.question_type}</Badge>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  )
                })}
              </CardContent>
            )}
          </Card>
        )
      })}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2">
        <ChevronDown className="h-3.5 w-3.5" /> 答对一道题即记为通过；自由选择阶段练习，无强制解锁。
      </div>
    </div>
  )
}
