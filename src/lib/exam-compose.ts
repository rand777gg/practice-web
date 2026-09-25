import { EXAM_MAX_COUNT, QUESTION_TYPE_LABELS } from '@/lib/constants'
import { composeExam } from '@/services/exam'
import { fetchQuestionsByIds as fetchQuestionRows } from '@/services/questions'
import type { ExamTemplate, ExamSampleMode, ExamComposeStat, Question } from '@/types'

export interface ComposeRequest {
  template?: ExamTemplate | null
  questionCount: number
  subjects?: string[]
  categories?: string[]
  questionTypes?: string[]
  sampleMode?: ExamSampleMode
  /** 只在指定试题库的题目里组卷(套卷用) */
  bankId?: string
  /**
   * 套卷范围分类(年份标签 / 章节名)。与 categories 不同, 它是**硬过滤**:
   * 年份范围必须始终生效, 不能被分区自带的 categories 顶掉。
   */
  scopeCategories?: string[]
  /** 套卷范围知识点, 命中 kp_question_map */
  keyPoints?: string[]
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

  return composeExam({
    subjects: subjectFilter,
    categories: req.categories?.length ? req.categories : null,
    sections,
    types: hasSections ? null : req.questionTypes?.length ? req.questionTypes : null,
    sampleMode: req.sampleMode ?? req.template?.sample_mode ?? 'random',
    orderMode: req.template?.order_mode ?? 'section',
    bankId: req.bankId ?? null,
    scopeCategories: req.scopeCategories?.length ? req.scopeCategories : null,
    keyPoints: req.keyPoints?.length ? req.keyPoints : null,
  })
}

/** 服务层按库里的顺序返回, 这里还原成传入 id 的顺序 —— 题单顺序就是卷面顺序 */
export async function fetchQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return []
  const rows = await fetchQuestionRows(ids)
  const map = new Map(rows.map((q) => [q.id, q]))
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
    const matched = questions.filter(
      (q) =>
        q.question_type === s.type &&
        !used.has(q.id) &&
        (!s.subject?.length || (q.subject != null && s.subject.includes(q.subject))) &&
        // 分区可能靠 categories 区分：英语一的完形 / 阅读 / 新题型同为 single_choice，
        // 不按它过滤，第一个分区就会把另外两个分区的题一起吞掉
        (!s.categories?.length || q.categories?.some((c) => s.categories.includes(c))),
    )
    // 也要按 count 截断。compose_exam 抽题时是按 count 抽的，这里不截断，
    // 一个分区就会吞掉同题型的全部题目，分区数跟模板对不上，答题卡也就绑不上。
    const picked = s.count > 0 ? matched.slice(0, s.count) : matched
    if (picked.length === 0) continue
    picked.forEach((q) => used.add(q.id))
    const baseName = QUESTION_TYPE_LABELS[s.type] ?? s.type
    out.push({
      name: s.categories?.length
        ? s.categories.join('、')
        : s.subject?.length ? `${baseName}（${s.subject.join('、')}）` : baseName,
      scorePerQuestion: s.score,
      questions: picked,
    })
  }
  const rest = questions.filter((q) => !used.has(q.id))
  if (rest.length) out.push({ name: QUESTION_TYPE_LABELS[rest[0].question_type] ?? '其他', scorePerQuestion: 0, questions: rest })
  return out
}
