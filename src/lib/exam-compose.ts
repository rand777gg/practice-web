import { supabase } from '@/lib/supabase'
import { EXAM_MAX_COUNT, QUESTION_TYPE_LABELS } from '@/lib/constants'
import type {
  CaseQuestion,
  ExamSampleMode,
  ExamTemplate,
  ExamComposeStat,
  Question,
  QuestionType,
} from '@/types'

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
        .map((s) => ({
          type: s.type,
          count: s.count,
          categories: s.categories ?? [],
          subject: s.subject?.length ? s.subject : null,
        }))
    : [{ type: null, count: Math.max(1, Math.min(EXAM_MAX_COUNT, req.questionCount)), categories: [] }]
}

/** 只组卷不建会话, 供试卷预览使用 */
export async function composeExamIds(req: ComposeRequest): Promise<ComposeResult> {
  const sections = buildComposeSections(req)
  if (sections.length === 0) return { questionIds: [], stats: [] }

  const hasSections = (req.template?.sections?.length ?? 0) > 0
  const subjectFilter = req.template?.subject?.length ? req.template.subject : req.subjects?.length ? req.subjects : null

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
    const picked = questions.filter(
      (q) =>
        q.question_type === s.type &&
        !used.has(q.id) &&
        (!s.subject?.length || (q.subject != null && s.subject.includes(q.subject))),
    )
    if (picked.length === 0) continue
    picked.forEach((q) => used.add(q.id))
    const baseName = QUESTION_TYPE_LABELS[s.type] ?? s.type
    out.push({
      name: s.subject?.length ? `${baseName}（${s.subject.join('、')}）` : baseName,
      scorePerQuestion: s.score,
      questions: picked,
    })
  }
  const rest = questions.filter((q) => !used.has(q.id))
  if (rest.length) out.push({ name: QUESTION_TYPE_LABELS[rest[0].question_type] ?? '其他', scorePerQuestion: 0, questions: rest })
  return out
}

/* ================= 占位预览题目(不抽取题库) ================= */

const MOCK_OPTIONS = ['占位选项 A……', '占位选项 B……', '占位选项 C……', '占位选项 D……']
const MOCK_SUBJECT_MATERIAL =
  '（占位案例材料）\n\n这里是案例材料占位正文。选择模板后的卷面预览只用于检查版式与分页，不会抽取题库中的真实题目。'

/** 按模板分区造一条本地占位题(仅渲染用, 不落库、不判分) */
function mockQuestion(type: QuestionType, seq: number, subject: string | null): Question {
  const base: Question = {
    id: `preview-${type}-${seq}`,
    question_type: type,
    question_text: `（占位示例题）题干内容占位，用于检查卷面版式与分页。`,
    options: MOCK_OPTIONS,
    correct_answer: 0,
    category: subject,
    categories: [],
    subject,
    analysis: null,
    key_points: null,
    answer_explanation: null,
    seq_number: null,
    created_at: '',
    created_by: null,
    verified: false,
    import_mode: null,
    allow_unordered: false,
    unordered_blanks: null,
    source_page: null,
  }
  switch (type) {
    case 'single_choice':
      return base
    case 'multi_select':
      return { ...base, correct_answer: [0, 2] }
    case 'true_false':
      return { ...base, correct_answer: true, options: [] }
    case 'judge_correct':
      return { ...base, correct_answer: true, options: [] }
    case 'fill_blank':
      return { ...base, question_text: `（占位填空题）请在 ____ 中填入答案内容。`, correct_answer: ['占位答案'] }
    case 'short_answer':
      return { ...base, correct_answer: ['占位答案'] }
    case 'analysis':
      return { ...base, correct_answer: null }
    case 'coding':
      return { ...base, correct_answer: { code: '', language: 'javascript', allPassed: false }, options: [] }
    case 'case_analysis': {
      const subs: CaseQuestion[] = [
        {
          id: `preview-case-${seq}-s1`,
          type: 'single_choice',
          text: '小题 1（占位）：根据材料判断，下列哪一项正确？',
          options: MOCK_OPTIONS,
          answer: 0,
        },
        {
          id: `preview-case-${seq}-s2`,
          type: 'multi_select',
          text: '小题 2（占位）：下列哪些表述符合材料内容？（多选）',
          options: MOCK_OPTIONS,
          answer: [0, 1],
        },
        {
          id: `preview-case-${seq}-s3`,
          type: 'true_false',
          text: '小题 3（占位）：材料中的结论对上述问题成立。',
          options: [],
          answer: true,
        },
      ]
      return { ...base, question_text: MOCK_SUBJECT_MATERIAL, case_questions: subs, correct_answer: null }
    }
  }
}

/**
 * 生成「占位卷面」的分区数据: 不访问题库, 每个分区按模板题量用本地占位题填充,
 * 供选择模板后的卷面预览/版式检查使用(与 buildPaperSections 相同分区命名与结构)。
 */
export function buildPlaceholderPaperSections(template: ExamTemplate | null): PaperSection[] {
  if (!template?.sections?.length) return []
  const mock: Question[] = []
  for (const s of template.sections) {
    if (!s.type || (s.count ?? 0) <= 0) continue
    const subject = s.subject?.length ? s.subject[0] : null
    for (let k = 0; k < s.count; k++) mock.push(mockQuestion(s.type, k, subject))
  }
  return mock.length ? buildPaperSections(mock, template) : []
}
