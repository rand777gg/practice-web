import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  addRouteQuestions,
  createRouteStage,
  deleteRouteStage,
  fetchRouteStages,
  reorderRouteQuestions,
  reorderRouteStages,
  removeRouteQuestion,
  saveLearningRoute,
  saveRouteDiagram,
  updateRouteStage,
} from '@/hooks/use-learning-routes'
import type { LearningRoute } from '@/types/learning-routes'
import type { Question } from '@/types'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { QuestionPicker } from '@/components/question-bank/QuestionPicker'
import { RouteDiagramTabs } from '@/components/learning-route/RouteDiagramTabs'
import type { DrawioFigureHandle } from '@/components/learning-route/DrawioFigure'
import { ArrowDown, ArrowLeft, ArrowUp, Map as MapIcon, Plus, Save, Trash2 } from 'lucide-react'

interface LocalQuestionItem {
  itemId?: string
  questionId: string
  question?: Question
}

interface LocalStage {
  id?: string
  localKey?: number
  title: string
  description: string
  items: LocalQuestionItem[]
}

interface ServerItemRec {
  itemId: string
  questionId: string
}

interface RouteMeta {
  title: string
  description: string
  is_published: boolean
  route_order: number
}

function questionPreview(q: Question): string {
  return q.question_text.replace(/[#*`>[\]!-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

export function Component() {
  const { routeId } = useParams<{ routeId: string }>()
  const navigate = useNavigate()
  const isNew = !routeId

  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [meta, setMeta] = useState<RouteMeta>({ title: '', description: '', is_published: false, route_order: 0 })
  const [stages, setStages] = useState<LocalStage[]>([])
  const [pickerStage, setPickerStage] = useState<number | null>(null)
  const [savingQids, setSavingQids] = useState<Set<string>>(new Set())
  const [showMap, setShowMap] = useState(Boolean(routeId))
  const [diagramXml, setDiagramXml] = useState<string | null>(null)

  const serverRef = useRef<Map<string, ServerItemRec[]>>(new Map())
  const localKeyRef = useRef(0)
  const drawioRef = useRef<DrawioFigureHandle | null>(null)

  const loadRoute = useCallback(async (rid: string) => {
    setLoading(true)
    setNotFound(false)
    setError('')
    try {
      const { data: routeRow, error: routeErr } = await supabase
        .from('learning_routes')
        .select('*')
        .eq('id', rid)
        .single()
      if (routeErr || !routeRow) {
        setNotFound(true)
        return
      }
      const route = routeRow as LearningRoute
      const stageList = await fetchRouteStages(rid)

      const stageIds = stageList.map((s) => s.id)
      const itemIdByStageQid = new Map<string, Map<string, string>>()
      if (stageIds.length > 0) {
        const { data: linkRows } = await supabase
          .from('learning_route_questions')
          .select('id, stage_id, question_id')
          .in('stage_id', stageIds)
        for (const row of (linkRows ?? []) as { id: string; stage_id: string; question_id: string }[]) {
          let m = itemIdByStageQid.get(row.stage_id)
          if (!m) {
            m = new Map()
            itemIdByStageQid.set(row.stage_id, m)
          }
          m.set(row.question_id, row.id)
        }
      }

      const map = new Map<string, ServerItemRec[]>()
      for (const st of stageList) {
        const qidMap = itemIdByStageQid.get(st.id) ?? new Map<string, string>()
        const items: ServerItemRec[] = []
        for (const q of st.questions) {
          const itemId = qidMap.get(q.id)
          if (itemId) items.push({ itemId, questionId: q.id })
        }
        map.set(st.id, items)
      }

      serverRef.current = map
      setDiagramXml(route.diagram_xml ?? null)
      setMeta({
        title: route.title,
        description: route.description,
        is_published: route.is_published,
        route_order: route.route_order,
      })
      setStages(
        stageList.map((st) => {
          const qById = new Map(st.questions.map((q) => [q.id, q]))
          return {
            id: st.id,
            title: st.title,
            description: st.description,
            items: (map.get(st.id) ?? []).map((it) => ({
              itemId: it.itemId,
              questionId: it.questionId,
              question: qById.get(it.questionId),
            })),
          }
        }),
      )
    } catch (err) {
      console.error(err)
      setError('加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    serverRef.current = new Map()
    if (!routeId) {
      setMeta({ title: '', description: '', is_published: false, route_order: 0 })
      setStages([])
      setDiagramXml(null)
      setNotFound(false)
      setLoading(false)
      return
    }
    void loadRoute(routeId)
  }, [routeId, loadRoute])

  const updateMeta = (patch: Partial<RouteMeta>) =>
    setMeta((prev) => ({ ...prev, ...patch }))

  const updateStage = (index: number, patch: Partial<Pick<LocalStage, 'title' | 'description'>>) =>
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const addStage = () => {
    localKeyRef.current += 1
    setStages((prev) => [
      ...prev,
      { id: undefined, localKey: localKeyRef.current, title: '新阶段', description: '', items: [] },
    ])
  }

  const moveStage = (index: number, dir: -1 | 1) =>
    setStages((prev) => {
      const to = index + dir
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const tmp = next[index]
      next[index] = next[to]
      next[to] = tmp
      return next
    })

  const removeStage = (index: number) => {
    const stage = stages[index]
    if (!stage) return
    if (
      stage.items.length > 0 &&
      !window.confirm(`删除「${stage.title || `阶段${index + 1}`}」会连同移除其中的 ${stage.items.length} 道题目，确定删除？`)
    ) {
      return
    }
    setStages((prev) => prev.filter((_, i) => i !== index))
  }

  const moveItem = (stageIndex: number, itemIndex: number, dir: -1 | 1) =>
    setStages((prev) =>
      prev.map((s, i) => {
        if (i !== stageIndex) return s
        const to = itemIndex + dir
        if (to < 0 || to >= s.items.length) return s
        const items = [...s.items]
        const tmp = items[itemIndex]
        items[itemIndex] = items[to]
        items[to] = tmp
        return { ...s, items }
      }),
    )

  const removeItem = (stageIndex: number, itemIndex: number) =>
    setStages((prev) =>
      prev.map((s, i) =>
        i !== stageIndex ? s : { ...s, items: s.items.filter((_, j) => j !== itemIndex) },
      ),
    )

  const handlePickerAdd = async (questionIds: string[]) => {
    if (pickerStage === null || questionIds.length === 0) return
    const idx = pickerStage
    setSavingQids(new Set(questionIds))
    try {
      const { data } = await supabase.from('questions').select('*').in('id', questionIds)
      const byId = new Map<string, Question>()
      for (const row of (data ?? []) as Question[]) byId.set(row.id, row)
      setStages((prev) =>
        prev.map((s, i) =>
          i !== idx
            ? s
            : {
                ...s,
                items: [
                  ...s.items,
                  ...questionIds.map((qid) => ({ questionId: qid, question: byId.get(qid) })),
                ],
              },
        ),
      )
      setPickerStage(null)
    } catch (err) {
      console.error(err)
      setError('添加题目失败，请稍后重试')
    } finally {
      setSavingQids(new Set())
    }
  }

  const pickerExistingIds =
    pickerStage !== null && stages[pickerStage]
      ? new Set(stages[pickerStage].items.map((it) => it.questionId))
      : new Set<string>()

  const nextRouteOrder = async (): Promise<number> => {
    const { data } = await supabase
      .from('learning_routes')
      .select('route_order')
      .order('route_order', { ascending: false })
      .limit(1)
    return ((data?.[0]?.route_order as number | undefined) ?? -1) + 1
  }

  const handleSave = async () => {
    if (!meta.title.trim()) {
      setError('请先填写路线标题')
      return
    }
    setSaving(true)
    setError('')
    try {
      const working: LocalStage[] = stages.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) }))
      const rid = await saveLearningRoute({
        ...(routeId ? { id: routeId } : {}),
        title: meta.title,
        description: meta.description,
        is_published: meta.is_published,
        route_order: routeId ? meta.route_order : await nextRouteOrder(),
      })

      for (const stage of working) {
        if (!stage.id) {
          stage.id = await createRouteStage(rid, stage.title, stage.description)
        } else if (serverRef.current.has(stage.id)) {
          await updateRouteStage(stage.id, { title: stage.title, description: stage.description })
        }
      }

      await reorderRouteStages(rid, working.map((s) => s.id as string))

      for (const stage of working) {
        const sid = stage.id as string
        const prevItems = serverRef.current.get(sid) ?? []
        const prevQidMap = new Map(prevItems.map((it) => [it.questionId, it.itemId]))
        for (const item of stage.items) {
          if (!item.itemId) item.itemId = prevQidMap.get(item.questionId)
        }
        const toAdd = stage.items
          .filter((it) => !prevQidMap.has(it.questionId))
          .map((it) => it.questionId)
        if (toAdd.length > 0) await addRouteQuestions(sid, toAdd)
        const keptItemIds = new Set(stage.items.filter((it) => it.itemId).map((it) => it.itemId as string))
        for (const it of prevItems) {
          if (!keptItemIds.has(it.itemId)) await removeRouteQuestion(it.itemId)
        }
        const knownItemIds = stage.items.filter((it) => it.itemId).map((it) => it.itemId as string)
        if (knownItemIds.length > 0) await reorderRouteQuestions(sid, knownItemIds)
      }

      for (const stageId of serverRef.current.keys()) {
        if (!working.some((s) => s.id === stageId)) await deleteRouteStage(stageId)
      }

      const drawn = await drawioRef.current?.exportXml()
      if (drawn) await saveRouteDiagram(rid, drawn)

      if (routeId) {
        await loadRoute(routeId)
      } else {
        navigate(`/admin/learning-routes/${rid}/edit`)
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" disabled>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Skeleton className="h-7 w-40" />
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-16 w-full" />
        </div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/learning-routes')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">编辑学习路线</h1>
        </div>
        <p className="text-sm text-muted-foreground">路线不存在或已被删除</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/learning-routes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="min-w-0 flex-1 text-xl font-bold">
          {isNew ? '新建学习路线' : '编辑学习路线'}
        </h1>
        <Button
          variant="outline"
          size="sm"
          title="点击切换发布状态，随「保存路线」生效"
          onClick={() => updateMeta({ is_published: !meta.is_published })}
        >
          {meta.is_published ? '已发布' : '草稿'}
        </Button>
        {stages.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>
            <MapIcon className="mr-1 h-3.5 w-3.5" />
            {showMap ? '收起路线图' : '路线图'}
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {showMap && stages.length > 0 && (
        <RouteDiagramTabs
          title={meta.title || '路线图预览'}
          stages={stages.map((s, i) => ({
            id: s.id ?? `preview-${i}`,
            label: s.title || `阶段${i + 1}`,
            sublabel: `${s.items.length} 题`,
          }))}
          diagramXml={diagramXml}
          editable
          editorRef={drawioRef}
          onSaveDiagram={routeId ? (xml) => saveRouteDiagram(routeId, xml) : undefined}
          height={560}
        />
      )}

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">标题</Label>
          <Input
            value={meta.title}
            placeholder="给学习路线起个名字，如：高等数学基础强化"
            onChange={(e) => updateMeta({ title: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">简介</Label>
          <Textarea
            rows={3}
            value={meta.description}
            placeholder="说明这条路线适合谁、覆盖哪些内容、预计用时…"
            onChange={(e) => updateMeta({ description: e.target.value })}
          />
        </div>
      </div>

      {stages.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">
          还没有阶段，点击下方「添加阶段」开始编排题目。
        </p>
      )}

      {stages.map((stage, si) => (
        <div
          key={stage.id ?? `local-${stage.localKey ?? si}`}
          className="overflow-hidden rounded-xl border bg-card"
        >
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">阶段 {si + 1}</span>
            <Input
              className="h-8 flex-1 font-medium"
              value={stage.title}
              onChange={(e) => updateStage(si, { title: e.target.value })}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={si === 0}
              title="上移阶段"
              onClick={() => moveStage(si, -1)}
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={si === stages.length - 1}
              title="下移阶段"
              onClick={() => moveStage(si, 1)}
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="删除阶段"
              onClick={() => removeStage(si)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-3 px-4 py-3">
            <Textarea
              rows={2}
              className="text-xs"
              value={stage.description}
              placeholder="阶段简介（可选）"
              onChange={(e) => updateStage(si, { description: e.target.value })}
            />
            {stage.items.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {stage.items.map((item, ii) => (
                  <li key={item.itemId ?? item.questionId} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {ii + 1}
                    </span>
                    <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                      {item.question
                        ? QUESTION_TYPE_LABELS[item.question.question_type] || item.question.question_type
                        : '题目'}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={item.question ? questionPreview(item.question) : item.questionId}>
                      {item.question ? questionPreview(item.question) : item.questionId}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={ii === 0}
                      title="上移题目"
                      onClick={() => moveItem(si, ii, -1)}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={ii === stage.items.length - 1}
                      title="下移题目"
                      onClick={() => moveItem(si, ii, 1)}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="移除题目"
                      onClick={() => removeItem(si, ii)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" onClick={() => setPickerStage(si)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              添加题目
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-full" onClick={addStage}>
        <Plus className="mr-1 h-4 w-4" />
        添加阶段
      </Button>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/learning-routes')}>
          取消
        </Button>
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? (
            '保存中…'
          ) : (
            <>
              <Save className="mr-1 h-3.5 w-3.5" />
              保存路线
            </>
          )}
        </Button>
      </div>

      <QuestionPicker
        open={pickerStage !== null}
        onOpenChange={(open) => { if (!open) setPickerStage(null) }}
        onAdd={handlePickerAdd}
        existingIds={pickerExistingIds}
        savingIds={savingQids}
      />
    </div>
  )
}
