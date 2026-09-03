import { supabase } from '@/lib/supabase'
import { EXAM_MAX_COUNT, QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { ExamTemplate, ExamSampleMode, ExamComposeStat, Question } from '@/types'

export interface ComposeRequest {
  template?: ExamTemplate | null
  questionCount: number
  subjects?: string[]
  categories?: string[]
  questionTypes?: string[]
  sampleMode?: ExamSampleMode
}

export interface ComposeResult {
  questionIds: string[]
  stats: ExamComposeStat[]
}

export function buildComposeSections(req: ComposeRequest) {
  const hasSections = (req.template?.sections?.length ?? 0) > 0
  return hasSections
    ? req.template!.sections
        .filter((s) => s.count > 0)
        .map((s) => ({ type: s.type, count: s.count, categories: s.categories ?? [] }))
    : [{ type: null, count: Math.max(1, Math.min(EXAM_MAX_COUNT, req.questionCount)), categories: [] }]
}

/** 只组卷不建会话, 供试卷预览使用 */
export async function composeExamIds(req: ComposeRequest): Promise<ComposeResult> {
  const sections = buildComposeSections(req)
  if (sections.length === 0) return { questionIds: [], stats: [] }

  const hasSections = (req.template?.sections?.length ?? 0) > 0
  const subjectFilter = req.template?.subject ? [req.template.subject] : req.subjects?.length ? req.subjects : null

  const { data, error } = await supabase.rpc('compose_exam', {
    p_subjects: subjectFilter,
    p_categories: req.categories?.length ? req.categories : null,
    p_sections: sections as unknown as Record<string, unknown>[],
    p_types: hasSections ? null : req.questionTypes?.length ? req.questionTypes : null,
    p_sample_mode: req.sampleMode ?? req.template?.sample_mode ?? 'random',
    p_order_mode: req.template?.order_mode ?? 'section',
  })

  if (error) throw new Error(error.message)
  const result = data as { question_ids?: string[]; sections?: ExamComposeStat[] } | null
  return {
    questionIds: (result?.question_ids ?? []).filter((id): id is string => typeof id === 'string'),
    stats: result?.sections ?? [],
  }
}

export async function fetchQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('questions').select('*').in('id', ids)
  if (error || !data) throw new Error(error?.message ?? 'Failed to load questions')
  const map = new Map((data as Question[]).map((q) => [q.id, q]))
  return ids.map((id) => map.get(id)).filter((q): q is Question => q !== undefined)
}

/** 试卷上的一个分区(对应卷面里的一道大题区), questions 已按整卷题号排序 */
export interface PaperSection {
  name: string
  scorePerQuestion: number
  questions: Question[]
}

/** 按模板分区把题目切成卷面分区; 无模板时按题型在卷中首次出现的顺序分组 */
export function buildPaperSections(questions: Question[], template: ExamTemplate | null): PaperSection[] {
  if (!template?.sections?.length) {
    const groups: PaperSection[] = []
    for (const q of questions) {
      const name = QUESTION_TYPE_LABELS[q.question_type] ?? q.question_type
      let g = groups.find((x) => x.name === name)
      if (!g) {
        g = { name, scorePerQuestion: 0, questions: [] }
        groups.push(g)
      }
      g.questions.push(q)
    }
    return groups
  }

  const out: PaperSection[] = []
  const used = new Set<string>()
  for (const s of template.sections) {
    if (!s.type) continue
    const picked = questions.filter((q) => q.question_type === s.type && !used.has(q.id))
    if (picked.length === 0) continue
    picked.forEach((q) => used.add(q.id))
    out.push({ name: QUESTION_TYPE_LABELS[s.type] ?? s.type, scorePerQuestion: s.score, questions: picked })
  }
  const rest = questions.filter((q) => !used.has(q.id))
  if (rest.length) out.push({ name: QUESTION_TYPE_LABELS[rest[0].question_type] ?? '其他', scorePerQuestion: 0, questions: rest })
  return out
}
