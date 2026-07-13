import { supabase } from './supabase'
import type { DailyTarget } from '@/types'

// 交集范围 → 匹配的题目 id 集合。空筛选=不约束。
export async function fetchTargetScopeIds(
  t: Pick<DailyTarget, 'subjects' | 'categories' | 'keyPoints'>,
): Promise<Set<string>> {
  const needKp = t.keyPoints.length > 0
  let q = supabase
    .from('questions')
    .select(needKp ? 'id, category, categories, key_points' : 'id, category, categories')
    .limit(5000)
  if (t.subjects.length) q = q.in('subject', t.subjects)
  const { data } = await q
  const ids = new Set<string>()
  for (const row of (data ?? []) as any[]) {
    if (t.categories.length) {
      const rc = (row.categories?.length ? row.categories : row.category ? [row.category] : []) as string[]
      if (!rc.some((c) => t.categories.includes(c))) continue
    }
    if (needKp && !t.keyPoints.some((k) => (row.key_points || '').includes(k))) continue
    ids.add(row.id)
  }
  return ids
}

export type AnswerRow = { question_id: string; is_correct: boolean; answered_at: string }
export type AnswerSets = ReturnType<typeof deriveAnswerSets>

// 从用户全部作答记录派生各集合。redone = 错题且之后答对过。
export function deriveAnswerSets(rows: AnswerRow[], todayISO: string) {
  const attempts = new Map<string, { count: number; beforeCount: number; wrong: boolean; hasCorrect: boolean; today: boolean }>()
  for (const r of rows) {
    const a = attempts.get(r.question_id) ?? { count: 0, beforeCount: 0, wrong: false, hasCorrect: false, today: false }
    a.count++
    if (!r.is_correct) a.wrong = true
    else a.hasCorrect = true
    if (r.answered_at >= todayISO) a.today = true
    else a.beforeCount++
    attempts.set(r.question_id, a)
  }
  const answeredIds = new Set<string>(), answeredBeforeIds = new Set<string>(), todayIds = new Set<string>()
  const wrongIds = new Set<string>(), redoneIds = new Set<string>(), redoneBeforeIds = new Set<string>(), redoneTodayIds = new Set<string>()
  for (const [id, a] of attempts) {
    answeredIds.add(id)
    if (a.beforeCount >= 1) answeredBeforeIds.add(id)
    if (a.today) todayIds.add(id)
    if (a.wrong) {
      wrongIds.add(id)
      if (a.hasCorrect) { redoneIds.add(id); if (a.today) redoneTodayIds.add(id) }
      if (a.beforeCount >= 1 && a.hasCorrect) redoneBeforeIds.add(id)
    }
  }
  return { answeredIds, answeredBeforeIds, todayIds, wrongIds, redoneIds, redoneBeforeIds, redoneTodayIds }
}

// filterIds + sets + wrongOnly → {total, done, doneBefore, todayDone}
export function scopeProgress(filterIds: Set<string>, sets: AnswerSets, wrongOnly: boolean) {
  if (!wrongOnly) {
    let done = 0, before = 0, today = 0
    for (const id of filterIds) {
      if (sets.answeredIds.has(id)) done++
      if (sets.answeredBeforeIds.has(id)) before++
      if (sets.todayIds.has(id)) today++
    }
    return { total: filterIds.size, done, doneBefore: before, todayDone: today }
  }
  let total = 0, done = 0, before = 0, today = 0
  for (const id of filterIds) {
    if (!sets.wrongIds.has(id)) continue
    total++
    if (sets.redoneIds.has(id)) done++
    if (sets.redoneBeforeIds.has(id)) before++
    if (sets.redoneTodayIds.has(id)) today++
  }
  return { total, done, doneBefore: before, todayDone: today }
}
