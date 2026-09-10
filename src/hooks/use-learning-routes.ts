import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import type { Question } from '@/types'
import type {
  LearningRoute, RouteDetail, RouteListEntry, RouteStage, RouteStageWithQuestions,
} from '@/types/learning-routes'

/** 棰樼洰甯哥敤瀛楁(缁冧範鏃?QuestionCard 闇€瑕佸畬鏁撮闈? 鍥犳鍙栧叏閲忓瓧娈? */
export const ROUTE_QUESTION_SELECT = '*, questions(*)'

function sortByPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position)
}


function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** 鐢ㄦ埛瀵圭粰瀹氶鐩腑鈥滆嚦灏戠瓟瀵硅繃涓€娆♀€濈殑棰樼洰 id 闆嗗悎(鐢ㄤ簬璺嚎/闃舵閫氳繃鍒ゅ畾) */
export async function fetchUserCorrectQuestionIds(questionIds: string[]): Promise<Set<string>> {
  const user = useAuthStore.getState().user
  const done = new Set<string>()
  if (!user || questionIds.length === 0) return done
  for (const part of chunked(questionIds, 300)) {
    const { data } = await supabase
      .from('user_answers')
      .select('question_id')
      .eq('user_id', user.id)
      .eq('is_correct', true)
      .in('question_id', part)
    for (const row of (data ?? []) as { question_id: string }[]) done.add(row.question_id)
  }
  return done
}

/** ids the user has answered at all (any correctness). analysis questions cannot be auto-graded, so answering counts as passing */
export async function fetchUserAnyAnswerQuestionIds(questionIds: string[]): Promise<Set<string>> {
  const user = useAuthStore.getState().user
  const done = new Set<string>()
  if (!user || questionIds.length === 0) return done
  for (const part of chunked(questionIds, 300)) {
    const { data } = await supabase
      .from('user_answers')
      .select('question_id')
      .eq('user_id', user.id)
      .in('question_id', part)
    for (const row of (data ?? []) as { question_id: string }[]) done.add(row.question_id)
  }
  return done
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
  const analysisIds = new Set<string>()
  for (const part of chunked(allQuestionIds, 300)) {
    const { data } = await supabase.from('questions').select('id').eq('question_type', 'analysis').in('id', part)
    for (const r of (data ?? []) as { id: string }[]) analysisIds.add(r.id)
  }
  if (analysisIds.size === 0) return correct
  const any = await fetchUserAnyAnswerQuestionIds([...analysisIds])
  return mergePassedQuestionIds(correct, any, allQuestionIds, analysisIds)
}

/** 鎷夊彇璺嚎鍒楄〃(鍚瘡闃舵棰樻暟銆侀鐩暟銆佹垜鐨勫畬鎴愭暟) */
export async function fetchLearningRoutes(includeDrafts = false): Promise<RouteListEntry[]> {
  let q = supabase.from('learning_routes').select('*')
  if (!includeDrafts) q = q.eq('is_published', true)
  const { data } = await q.order('route_order', { ascending: true }).order('created_at', { ascending: false })
  const routes = (data ?? []) as LearningRoute[]
  if (routes.length === 0) return []

  const { data: stageRows } = await supabase
    .from('learning_route_stages')
    .select('id, route_id')
    .in('route_id', routes.map(r => r.id))
  const stages = (stageRows ?? []) as { id: string; route_id: string }[]

  let items: { id: string; stage_id: string; question_id: string }[] = []
  if (stages.length > 0) {
    for (const part of chunked(stages.map(s => s.id), 300)) {
      const { data: itemRows } = await supabase
        .from('learning_route_questions')
        .select('id, stage_id, question_id')
        .in('stage_id', part)
      items = items.concat((itemRows ?? []) as typeof items)
    }
  }

  const stageByRoute = new Map<string, string[]>()
  for (const s of stages) {
    const arr = stageByRoute.get(s.route_id) ?? []
    arr.push(s.id)
    stageByRoute.set(s.route_id, arr)
  }
  const stageOfItem = new Map(items.map(i => [i.id, i.stage_id]))

  const questionCountByRoute = new Map<string, number>()
  const doneByRoute = new Map<string, number>()
  const allQuestionIds: string[] = []
  for (const it of items) {
    const stageId = stageOfItem.get(it.id)
    if (!stageId) continue
    const routeId = stages.find(s => s.id === stageId)?.route_id
    if (!routeId) continue
    questionCountByRoute.set(routeId, (questionCountByRoute.get(routeId) ?? 0) + 1)
    allQuestionIds.push(it.question_id)
  }
  const correctDone = await fetchUserCorrectQuestionIds(allQuestionIds)
  const done = await mergeAnalysisLenient(correctDone, allQuestionIds)
  for (const it of items) {
    const stageId = stageOfItem.get(it.id)
    const routeId = stageId ? stages.find(s => s.id === stageId)?.route_id : undefined
    if (!routeId || !done.has(it.question_id)) continue
    doneByRoute.set(routeId, (doneByRoute.get(routeId) ?? 0) + 1)
  }

  return routes.map(r => ({
    route: r,
    stageCount: stageByRoute.get(r.id)?.length ?? 0,
    questionCount: questionCountByRoute.get(r.id) ?? 0,
    doneCount: doneByRoute.get(r.id) ?? 0,
  }))
}

/** 鎷夊彇鍗曟潯璺嚎璇︽儏(闃舵 + 鏈夊簭棰樼洰 + 鎴戠殑閫氳繃鎯呭喌) */
export async function fetchLearningRouteDetail(routeId: string): Promise<RouteDetail | null> {
  const { data: route } = await supabase.from('learning_routes').select('*').eq('id', routeId).single()
  if (!route) return null
  const r = route as LearningRoute

  const { data: stageRows } = await supabase
    .from('learning_route_stages')
    .select('*')
    .eq('route_id', routeId)
  const stages = sortByPosition((stageRows ?? []) as RouteStage[])

  const out: RouteStageWithQuestions[] = []
  const questionIds: string[] = []
  for (const stage of stages) {
    const { data: linkRows } = await supabase
      .from('learning_route_questions')
      .select('question_id, position')
      .eq('stage_id', stage.id)
    const links = sortByPosition((linkRows ?? []) as { question_id: string; position: number }[])
    const ids = links.map(l => l.question_id)
    let questions: Question[] = []
    if (ids.length > 0) {
      const { data: qRows } = await supabase.from('questions').select('*').in('id', ids)
      const byId = new Map((qRows ?? []).map((x: Question) => [x.id, x]))
      questions = ids.map(id => byId.get(id)).filter(Boolean) as Question[]
    }
    out.push({ ...stage, questions })
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

  return { route: r, stages: out, totalCount, doneCount, passByQuestion }
}

// ---------------------------------------------------------------------------
// 鍓嶅彴椤?hooks
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
    }).catch(() => { if (!cancelled) { setDetail(null); setIsLoading(false) } })
    return () => { cancelled = true }
  }, [routeId, bump])
  return { detail, isLoading, refresh }
}

// ---------------------------------------------------------------------------
// 鍚庡彴 CRUD
// ---------------------------------------------------------------------------

export interface RouteDraft {
  id?: string
  title: string
  description: string
  is_published: boolean
  route_order: number
}

export async function saveLearningRoute(draft: RouteDraft): Promise<string> {
  const user = useAuthStore.getState().user
  const payload = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    is_published: draft.is_published,
    route_order: draft.route_order,
    updated_at: new Date().toISOString(),
  }
  if (draft.id) {
    const { data, error } = await supabase.from('learning_routes').update(payload).eq('id', draft.id).select('id').single()
    if (error) throw error
    return (data as { id: string }).id
  }
  const { data, error } = await supabase.from('learning_routes').insert({ ...payload, created_by: user?.id ?? null }).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deleteLearningRoute(routeId: string) {
  const { error } = await supabase.from('learning_routes').delete().eq('id', routeId)
  if (error) throw error
}

/** 单独写路线的 draw.io 图: 编辑器内保存 / 保存路线时都会走这里 */
export async function saveRouteDiagram(routeId: string, diagramXml: string | null) {
  const { error } = await supabase
    .from('learning_routes')
    .update({ diagram_xml: diagramXml, updated_at: new Date().toISOString() })
    .eq('id', routeId)
  if (error) throw error
}

export async function fetchRouteStages(routeId: string): Promise<RouteStageWithQuestions[]> {
  const { data: stageRows } = await supabase.from('learning_route_stages').select('*').eq('route_id', routeId)
  const stages = sortByPosition((stageRows ?? []) as RouteStage[])
  const out: RouteStageWithQuestions[] = []
  for (const stage of stages) {
    const { data: linkRows } = await supabase
      .from('learning_route_questions')
      .select('question_id, position')
      .eq('stage_id', stage.id)
    const links = sortByPosition((linkRows ?? []) as { question_id: string; position: number }[])
    const ids = links.map(l => l.question_id)
    let questions: Question[] = []
    if (ids.length > 0) {
      const { data: qRows } = await supabase.from('questions').select('*').in('id', ids)
      const byId = new Map((qRows ?? []).map((x: Question) => [x.id, x]))
      questions = ids.map(id => byId.get(id)).filter(Boolean) as Question[]
    }
    out.push({ ...stage, questions })
  }
  return out
}

export async function createRouteStage(routeId: string, title: string, description = ''): Promise<string> {
  const { data: maxRow } = await supabase
    .from('learning_route_stages')
    .select('position')
    .eq('route_id', routeId)
    .order('position', { ascending: false })
    .limit(1)
  const position = ((maxRow?.[0]?.position as number | undefined) ?? -1) + 1
  const { data, error } = await supabase
    .from('learning_route_stages')
    .insert({ route_id: routeId, position, title: title.trim(), description })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateRouteStage(stageId: string, patch: { title?: string; description?: string; position?: number }) {
  const { error } = await supabase.from('learning_route_stages').update(patch).eq('id', stageId)
  if (error) throw error
}

export async function deleteRouteStage(stageId: string) {
  const { error } = await supabase.from('learning_route_stages').delete().eq('id', stageId)
  if (error) throw error
}

/** 寰€闃舵杩藉姞棰樼洰(杩藉姞鍒扮幇鏈夐鐩箣鍚? */
export async function addRouteQuestions(stageId: string, questionIds: string[]) {
  if (questionIds.length === 0) return
  const { data: maxRow } = await supabase
    .from('learning_route_questions')
    .select('position')
    .eq('stage_id', stageId)
    .order('position', { ascending: false })
    .limit(1)
  let position = ((maxRow?.[0]?.position as number | undefined) ?? -1) + 1
  const rows = questionIds.map(qid => ({ stage_id: stageId, question_id: qid, position: position++ }))
  const { error } = await supabase.from('learning_route_questions').insert(rows)
  if (error) throw error
}

export async function removeRouteQuestion(itemId: string) {
  const { error } = await supabase.from('learning_route_questions').delete().eq('id', itemId)
  if (error) throw error
}

/** 閲嶆帓闃舵/棰樼洰:浼犲叆璇ョ粍鎵€鏈夋湁搴?id, 瑕嗙洊浣嶇疆 */
export async function reorderRouteStages(routeId: string, orderedStageIds: string[]) {
  for (let i = 0; i < orderedStageIds.length; i++) {
    await supabase.from('learning_route_stages').update({ position: i }).eq('route_id', routeId).eq('id', orderedStageIds[i])
  }
}

export async function reorderRouteQuestions(stageId: string, orderedItemIds: string[]) {
  for (let i = 0; i < orderedItemIds.length; i++) {
    await supabase.from('learning_route_questions').update({ position: i }).eq('stage_id', stageId).eq('id', orderedItemIds[i])
  }
}
