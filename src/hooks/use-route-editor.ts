import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logError, userMessage } from '@/services/errors'
import { fetchLearningRoute, fetchMaxRouteOrder, listQuestionItemsByStages } from '@/services/learning-routes'
import { fetchQuestionsByIds } from '@/services/questions'
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
  updateRouteQuestionItem,
  updateRouteStage,
} from '@/hooks/use-learning-routes'
import type { RouteNodeStyle } from '@/types/learning-routes'
import type { Question } from '@/types'
import type { DrawioFigureHandle } from '@/components/learning-route/DrawioFigure'
import type { RoadmapEditor, RoadmapNodeTarget, RoadmapStage } from '@/components/learning-route/RoadmapCanvas'

export interface LocalQuestionItem {
  itemId?: string
  questionId: string
  question?: Question
  nodeStyle?: RouteNodeStyle
}

export interface LocalStage {
  id?: string
  localKey?: number
  title: string
  description: string
  items: LocalQuestionItem[]
  nodeStyle?: RouteNodeStyle
}

export interface RouteMeta {
  title: string
  description: string
  is_published: boolean
  route_order: number
}

interface ServerItemRec {
  itemId: string
  questionId: string
}

export function questionPreview(q: Question): string {
  return q.question_text.replace(/[#*`>[\]!-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** 画布上还没落库的阶段用本地 key 当节点 id */
function stageKey(s: LocalStage, i: number) {
  return s.id ?? `local-${s.localKey ?? i}`
}

/** patch 里值为 undefined 表示「恢复默认」, 要真删掉这个键而不是留个 undefined */
function mergeNodeStyle(prev: RouteNodeStyle | undefined, patch: RouteNodeStyle): RouteNodeStyle {
  const next: RouteNodeStyle = { ...prev, ...patch }
  for (const key of Object.keys(patch) as (keyof RouteNodeStyle)[]) {
    if (patch[key] === undefined) delete next[key]
  }
  return next
}

/**
 * 学习路线编辑器的全部状态与操作: 表单页和大画布页共用同一份草稿。
 * 所有改动都留在本地, 只有 handleSave 会写库。
 */
export function useRouteEditor(routeId: string | undefined) {
  const navigate = useNavigate()
  const isNew = !routeId

  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [meta, setMeta] = useState<RouteMeta>({ title: '', description: '', is_published: false, route_order: 0 })
  const [stages, setStages] = useState<LocalStage[]>([])
  const [pickerStage, setPickerStage] = useState<number | null>(null)
  const [savingQids, setSavingQids] = useState<Set<string>>(new Set())
  const [diagramXml, setDiagramXml] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  /** 画布右击「编辑标题与简介」打开的阶段下标 */
  const [contentStage, setContentStage] = useState<number | null>(null)
  /** 画布右击「换一道题」的目标 */
  const [replaceTarget, setReplaceTarget] = useState<{ stage: number; questionId: string } | null>(null)

  const serverRef = useRef<Map<string, ServerItemRec[]>>(new Map())
  const localKeyRef = useRef(0)
  const drawioRef = useRef<DrawioFigureHandle | null>(null)

  const loadRoute = useCallback(async (rid: string) => {
    setLoading(true)
    setNotFound(false)
    setError('')
    try {
      const route = await fetchLearningRoute(rid)
      if (!route) {
        setNotFound(true)
        return
      }
      const stageList = await fetchRouteStages(rid)

      const stageIds = stageList.map((s) => s.id)
      const linkByStageQid = new Map<string, Map<string, { itemId: string; nodeStyle: RouteNodeStyle }>>()
      if (stageIds.length > 0) {
        for (const row of await listQuestionItemsByStages(stageIds)) {
          let m = linkByStageQid.get(row.stage_id)
          if (!m) {
            m = new Map()
            linkByStageQid.set(row.stage_id, m)
          }
          m.set(row.question_id, { itemId: row.id, nodeStyle: row.node_style })
        }
      }

      const map = new Map<string, ServerItemRec[]>()
      for (const st of stageList) {
        const qidMap = linkByStageQid.get(st.id) ?? new Map<string, { itemId: string; nodeStyle: RouteNodeStyle }>()
        const items: ServerItemRec[] = []
        for (const q of st.questions) {
          const rec = qidMap.get(q.id)
          if (rec) items.push({ itemId: rec.itemId, questionId: q.id })
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
          const qidMap = linkByStageQid.get(st.id) ?? new Map<string, { itemId: string; nodeStyle: RouteNodeStyle }>()
          const qById = new Map(st.questions.map((q) => [q.id, q]))
          return {
            id: st.id,
            title: st.title,
            description: st.description,
            nodeStyle: st.node_style ?? {},
            items: (map.get(st.id) ?? []).map((it) => ({
              itemId: it.itemId,
              questionId: it.questionId,
              question: qById.get(it.questionId),
              nodeStyle: qidMap.get(it.questionId)?.nodeStyle ?? {},
            })),
          }
        }),
      )
      setDirty(false)
    } catch (err) {
      logError('useRouteEditor.loadRoute', err)
      setError('加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    serverRef.current = new Map()
    if (!routeId) return
    void loadRoute(routeId)
  }, [routeId, loadRoute])

  const updateMeta = (patch: Partial<RouteMeta>) => {
    setDirty(true)
    setMeta((prev) => ({ ...prev, ...patch }))
  }

  const updateStage = (index: number, patch: Partial<Pick<LocalStage, 'title' | 'description'>>) => {
    setDirty(true)
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const addStage = () => {
    localKeyRef.current += 1
    setDirty(true)
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
      setDirty(true)
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
    setDirty(true)
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
        setDirty(true)
        return { ...s, items }
      }),
    )

  const removeItem = (stageIndex: number, itemIndex: number) => {
    setDirty(true)
    setStages((prev) =>
      prev.map((s, i) =>
        i !== stageIndex ? s : { ...s, items: s.items.filter((_, j) => j !== itemIndex) },
      ),
    )
  }

  const stageIndexById = (stageId: string) => stages.findIndex((s, i) => stageKey(s, i) === stageId)

  const patchNodeStyle = (target: RoadmapNodeTarget, patch: RouteNodeStyle) => {
    setDirty(true)
    setStages((prev) =>
      prev.map((s, i) => {
        if (stageKey(s, i) !== target.stageId) return s
        if (!target.questionId) return { ...s, nodeStyle: mergeNodeStyle(s.nodeStyle, patch) }
        return {
          ...s,
          items: s.items.map((it) =>
            it.questionId === target.questionId ? { ...it, nodeStyle: mergeNodeStyle(it.nodeStyle, patch) } : it,
          ),
        }
      }),
    )
  }

  const moveNode = (target: RoadmapNodeTarget, pos: { x: number; y: number } | null) =>
    patchNodeStyle(target, pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : { x: undefined, y: undefined })

  const resetLayout = () => {
    setDirty(true)
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        nodeStyle: mergeNodeStyle(s.nodeStyle, { x: undefined, y: undefined }),
        items: s.items.map((it) => ({ ...it, nodeStyle: mergeNodeStyle(it.nodeStyle, { x: undefined, y: undefined }) })),
      })),
    )
  }

  const roadmapStages: RoadmapStage[] = useMemo(
    () =>
      stages.map((s, si) => ({
        id: stageKey(s, si),
        label: s.title || `阶段 ${si + 1}`,
        meta: `${s.items.length} 题`,
        done: false,
        style: s.nodeStyle,
        questions: s.items.map((it) => ({
          id: it.questionId,
          label: it.question ? questionPreview(it.question) : it.questionId,
          passed: false,
          style: it.nodeStyle,
        })),
      })),
    [stages],
  )

  const roadmapEditor: RoadmapEditor = {
    onAddStage: (pos) => {
      localKeyRef.current += 1
      setDirty(true)
      setStages((prev) => [
        ...prev,
        { localKey: localKeyRef.current, title: '新阶段', description: '', items: [], nodeStyle: { x: pos.x, y: pos.y } },
      ])
    },
    onEditStageContent: (stageId) => {
      const i = stageIndexById(stageId)
      if (i >= 0) setContentStage(i)
    },
    onAddQuestion: (stageId) => {
      const i = stageIndexById(stageId)
      if (i < 0) return
      setReplaceTarget(null)
      setPickerStage(i)
    },
    onRemoveStage: (stageId) => {
      const i = stageIndexById(stageId)
      if (i >= 0) removeStage(i)
    },
    onMoveStage: (stageId, dir) => {
      const i = stageIndexById(stageId)
      if (i >= 0) moveStage(i, dir)
    },
    onRemoveQuestion: (stageId, questionId) => {
      const i = stageIndexById(stageId)
      const ii = stages[i]?.items.findIndex((it) => it.questionId === questionId) ?? -1
      if (i >= 0 && ii >= 0) removeItem(i, ii)
    },
    onReplaceQuestion: (stageId, questionId) => {
      const i = stageIndexById(stageId)
      if (i < 0) return
      setReplaceTarget({ stage: i, questionId })
      setPickerStage(i)
    },
    onMoveQuestion: (stageId, questionId, dir) => {
      const i = stageIndexById(stageId)
      const ii = stages[i]?.items.findIndex((it) => it.questionId === questionId) ?? -1
      if (i >= 0 && ii >= 0) moveItem(i, ii, dir)
    },
    onPatchStyle: patchNodeStyle,
    onMoveNode: moveNode,
    onResetLayout: resetLayout,
  }

  const handlePickerAdd = async (questionIds: string[]) => {
    if (pickerStage === null || questionIds.length === 0) return
    const idx = pickerStage
    const replace = replaceTarget
    setSavingQids(new Set(questionIds))
    try {
      const byId = new Map<string, Question>()
      for (const row of await fetchQuestionsByIds(questionIds)) byId.set(row.id, row)
      setDirty(true)
      setStages((prev) =>
        prev.map((s, i) => {
          if (i !== idx) return s
          if (replace) {
            const at = s.items.findIndex((it) => it.questionId === replace.questionId)
            const picked = byId.get(questionIds[0])
            if (at < 0 || !picked) return s
            const items = [...s.items]
            items[at] = { questionId: questionIds[0], question: picked, nodeStyle: items[at].nodeStyle }
            return { ...s, items }
          }
          return {
            ...s,
            items: [
              ...s.items,
              ...questionIds.map((qid) => ({ questionId: qid, question: byId.get(qid) })),
            ],
          }
        }),
      )
      setPickerStage(null)
      setReplaceTarget(null)
    } catch (err) {
      logError('useRouteEditor.handlePickerAdd', err)
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
    return ((await fetchMaxRouteOrder()) ?? -1) + 1
  }

  const handleSave = async () => {
    if (!meta.title.trim()) {
      setError('请先填写路线标题')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
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
        const style = stage.nodeStyle ?? {}
        if (!stage.id) {
          stage.id = await createRouteStage(rid, stage.title, stage.description, style)
        } else if (serverRef.current.has(stage.id)) {
          await updateRouteStage(stage.id, { title: stage.title, description: stage.description, node_style: style })
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
        const styleByQid: Record<string, RouteNodeStyle> = {}
        for (const it of stage.items) styleByQid[it.questionId] = it.nodeStyle ?? {}
        const toAdd = stage.items
          .filter((it) => !prevQidMap.has(it.questionId))
          .map((it) => it.questionId)
        if (toAdd.length > 0) await addRouteQuestions(sid, toAdd, styleByQid)
        const keptItemIds = new Set(stage.items.filter((it) => it.itemId).map((it) => it.itemId as string))
        for (const it of prevItems) {
          if (!keptItemIds.has(it.itemId)) await removeRouteQuestion(it.itemId)
        }
        const knownItemIds = stage.items.filter((it) => it.itemId).map((it) => it.itemId as string)
        if (knownItemIds.length > 0) await reorderRouteQuestions(sid, knownItemIds)
        for (const it of stage.items) {
          if (it.itemId) await updateRouteQuestionItem(it.itemId, { node_style: it.nodeStyle ?? {} })
        }
      }

      for (const stageId of serverRef.current.keys()) {
        if (!working.some((s) => s.id === stageId)) await deleteRouteStage(stageId)
      }

      const drawn = await drawioRef.current?.exportXml()
      if (drawn) await saveRouteDiagram(rid, drawn)
      else if (drawioRef.current?.isReady()) {
        setNotice('路线已保存，但没能从 draw.io 取回画布内容，请点「保存图」重试。')
      }

      if (routeId) {
        await loadRoute(routeId)
      } else {
        navigate(`/admin/learning-routes/${rid}/edit`)
      }
    } catch (err) {
      logError('useRouteEditor.handleSave', err)
      setError(userMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return {
    isNew, loading, notFound, error, setError, saving, dirty, notice, setNotice,
    meta, updateMeta, stages, updateStage, addStage, moveStage, removeStage,
    moveItem, removeItem,
    pickerStage, setPickerStage, replaceTarget, setReplaceTarget, savingQids, pickerExistingIds, handlePickerAdd,
    contentStage, setContentStage,
    diagramXml, drawioRef,
    roadmapStages, roadmapEditor,
    patchNodeStyle, moveNode, resetLayout,
    handleSave,
  }
}

export type RouteEditor = ReturnType<typeof useRouteEditor>
