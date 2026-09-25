import { useCallback, useEffect, useState } from 'react'
import { logError } from '@/services/errors'
import {
  createLearningRoute,
  createRouteStage as createRouteStageRow,
  fetchLearningRoute,
  listLearningRoutes,
  listQuestionItemsByStages,
  listQuestionRefsByStages,
  listRouteStageRefs,
  listRouteStages,
  updateLearningRoute,
  type RouteQuestionItem,
} from '@/services/learning-routes'
import { fetchQuestionIdsOfType, fetchQuestionsByIds } from '@/services/questions'
import { fetchAnsweredQuestionIdsFor, fetchCorrectQuestionIdsFor } from '@/services/practice'
import { useAuthStore } from '@/stores/auth-store'
import type { Question } from '@/types'
import type {
  RouteDetail, RouteListEntry, RouteNodeStyle, RouteStageWithQuestions,
} from '@/types/learning-routes'

function sortByPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position)
}

/** 批量取回来的行序不可依赖, 阶段里的题目顺序以关联行的顺序为准 */
async function loadQuestionsInOrder(ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return []
  const byId = new Map((await fetchQuestionsByIds(ids)).map((q) => [q.id, q]))
  const out: Question[] = []
  for (const id of ids) {
    const q = byId.get(id)
    if (q) out.push(q)
  }
  return out
}

/** 用户对给定题目中「至少答对过一次」的题目 id 集合(用于路线/阶段通过判定) */
export async function fetchUserCorrectQuestionIds(questionIds: string[]): Promise<Set<string>> {
  const user = useAuthStore.getState().user
  if (!user || questionIds.length === 0) return new Set()
  return new Set(await fetchCorrectQuestionIdsFor(user.id, questionIds))
}

/** ids the user has answered at all (any correctness). analysis questions cannot be auto-graded, so answering counts as passing */
export async function fetchUserAnyAnswerQuestionIds(questionIds: string[]): Promise<Set<string>> {
  const user = useAuthStore.getState().user
  if (!user || questionIds.length === 0) return new Set()
  return new Set(await fetchAnsweredQuestionIdsFor(user.id, questionIds))
}

/** merge pass rule: objective types need a correct answer; 'analysis' needs any answer */
export function mergePassedQuestionIds(correct: Set<string>, anyAnswer: Set<string>, questionIds: string[], analysisIds: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const qid of questionIds) {
    if (correct.has(qid)) out.add(qid)
    else if (analysisIds.has(qid) && anyAnswer.has(qid)) out.add(qid)
  }
  return out
}

/** add analysis-typed ids among questionIds into the passed set when the user answered them at all */
async function mergeAnalysisLenient(correct: Set<string>, allQuestionIds: string[]): Promise<Set<string>> {
  if (allQuestionIds.length === 0) return correct
  const analysisIds = new Set(await fetchQuestionIdsOfType('analysis', allQuestionIds))
  if (analysisIds.size === 0) return correct
  const any = await fetchUserAnyAnswerQuestionIds([...analysisIds])
  return mergePassedQuestionIds(correct, any, allQuestionIds, analysisIds)
}

/** 拉取路线列表(含每阶段题数、题目数、我的完成数) */
export async function fetchLearningRoutes(includeDrafts = false): Promise<RouteListEntry[]> {
  try {
    const routes = await listLearningRoutes({ includeDrafts })
    if (routes.length === 0) return []

    const stages = await listRouteStageRefs(routes.map((r) => r.id))
    const items = stages.length > 0 ? await listQuestionRefsByStages(stages.map((s) => s.id)) : []

    const stageByRoute = new Map<string, string[]>()
    for (const s of stages) {
      const arr = stageByRoute.get(s.route_id) ?? []
      arr.push(s.id)
      stageByRoute.set(s.route_id, arr)
    }
    const routeOfStage = new Map(stages.map((s) => [s.id, s.route_id]))

    const questionCountByRoute = new Map<string, number>()
    const doneByRoute = new Map<string, number>()
    const allQuestionIds: string[] = []
    for (const it of items) {
      const routeId = routeOfStage.get(it.stage_id)
      if (!routeId) continue
      questionCountByRoute.set(routeId, (questionCountByRoute.get(routeId) ?? 0) + 1)
      allQuestionIds.push(it.question_id)
    }
    const correctDone = await fetchUserCorrectQuestionIds(allQuestionIds)
    const done = await mergeAnalysisLenient(correctDone, allQuestionIds)
    for (const it of items) {
      const routeId = routeOfStage.get(it.stage_id)
      if (!routeId || !done.has(it.question_id)) continue
      doneByRoute.set(routeId, (doneByRoute.get(routeId) ?? 0) + 1)
    }

    return routes.map((r) => ({
      route: r,
      stageCount: stageByRoute.get(r.id)?.length ?? 0,
      questionCount: questionCountByRoute.get(r.id) ?? 0,
      doneCount: doneByRoute.get(r.id) ?? 0,
    }))
  } catch (e) {
    // 列表页把失败当「还没有路线」渲染, 沿用旧行为: 只记开发日志, 不往上抛
    logError('fetchLearningRoutes', e)
    return []
  }
}

/** 拉取单条路线详情(阶段 + 有序题目 + 我的通过情况) */
export async function fetchLearningRouteDetail(routeId: string): Promise<RouteDetail | null> {
  const route = await fetchLearningRoute(routeId)
  if (!route) return null

  const stages = sortByPosition(await listRouteStages(routeId))
  const itemsByStage = new Map<string, RouteQuestionItem[]>()
  for (const item of await listQuestionItemsByStages(stages.map((s) => s.id))) {
    const list = itemsByStage.get(item.stage_id) ?? []
    list.push(item)
    itemsByStage.set(item.stage_id, list)
  }

  const out: RouteStageWithQuestions[] = []
  const questionIds: string[] = []
  for (const stage of stages) {
    const links = sortByPosition(itemsByStage.get(stage.id) ?? [])
    const ids = links.map((l) => l.question_id)
    const itemStyles: Record<string, RouteNodeStyle> = {}
    for (const l of links) itemStyles[l.question_id] = l.node_style
    out.push({ ...stage, questions: await loadQuestionsInOrder(ids), itemStyles })
    questionIds.push(...ids)
  }

  const correct = await fetchUserCorrectQuestionIds(questionIds)
  const done = await mergeAnalysisLenient(correct, questionIds)
  const totalCount = questionIds.length
  const passByQuestion: Record<string, boolean> = {}
  let doneCount = 0
  for (const qid of questionIds) {
    if (done.has(qid)) {
      passByQuestion[qid] = true
      doneCount++
    }
  }

  return { route, stages: out, totalCount, doneCount, passByQuestion }
}

// ---------------------------------------------------------------------------
// 前台页面 hooks
// ---------------------------------------------------------------------------

export function useLearningRoutesList() {
  const [entries, setEntries] = useState<RouteListEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const refresh = useCallback(async () => {
    setIsLoading(true)
    const list = await fetchLearningRoutes(false)
    setEntries(list)
    setIsLoading(false)
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return { entries, isLoading, refresh }
}

export function useLearningRouteDetail(routeId: string | undefined) {
  const [detail, setDetail] = useState<RouteDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [bump, setBump] = useState(0)
  const refresh = useCallback(() => setBump(v => v + 1), [])
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    if (!routeId) { setDetail(null); setIsLoading(false); return }
    fetchLearningRouteDetail(routeId).then(d => {
      if (cancelled) return
      setDetail(d)
      setIsLoading(false)
    }).catch((e) => {
      logError('useLearningRouteDetail', e)
      if (!cancelled) { setDetail(null); setIsLoading(false) }
    })
    return () => { cancelled = true }
  }, [routeId, bump])
  return { detail, isLoading, refresh }
}

// ---------------------------------------------------------------------------
// 后台 CRUD
// ---------------------------------------------------------------------------

export interface RouteDraft {
  id?: string
  title: string
  description: string
  is_published: boolean
  route_order: number
}

/** 存路线(有 id 走更新, 没有走新建 —— 新建必须经 createLearningRoute 才拿得到 id) */
export async function saveLearningRoute(draft: RouteDraft): Promise<string> {
  if (draft.id) {
    await updateLearningRoute(draft.id, {
      title: draft.title,
      description: draft.description,
      is_published: draft.is_published,
      route_order: draft.route_order,
    })
    return draft.id
  }
  return createLearningRoute({
    title: draft.title,
    description: draft.description,
    is_published: draft.is_published,
    route_order: draft.route_order,
    created_by: useAuthStore.getState().user?.id ?? null,
  })
}

export async function fetchRouteStages(routeId: string): Promise<RouteStageWithQuestions[]> {
  const stages = sortByPosition(await listRouteStages(routeId))
  const itemsByStage = new Map<string, RouteQuestionItem[]>()
  for (const item of await listQuestionItemsByStages(stages.map((s) => s.id))) {
    const list = itemsByStage.get(item.stage_id) ?? []
    list.push(item)
    itemsByStage.set(item.stage_id, list)
  }

  const out: RouteStageWithQuestions[] = []
  for (const stage of stages) {
    const links = sortByPosition(itemsByStage.get(stage.id) ?? [])
    const ids = links.map((l) => l.question_id)
    const itemStyles: Record<string, RouteNodeStyle> = {}
    for (const l of links) itemStyles[l.question_id] = l.node_style
    out.push({ ...stage, questions: await loadQuestionsInOrder(ids), itemStyles })
  }
  return out
}

export async function createRouteStage(routeId: string, title: string, description = '', nodeStyle: RouteNodeStyle = {}): Promise<string> {
  return createRouteStageRow(routeId, { title, description, node_style: nodeStyle })
}

// 这几个函数的签名与服务层完全一致, 直接透出, 不再各包一层
export {
  addRouteQuestions,
  deleteLearningRoute,
  deleteRouteStage,
  removeRouteQuestion,
  reorderRouteQuestions,
  reorderRouteStages,
  saveLearningRouteDiagram as saveRouteDiagram,
  updateRouteQuestionItem,
  updateRouteStage,
} from '@/services/learning-routes'
