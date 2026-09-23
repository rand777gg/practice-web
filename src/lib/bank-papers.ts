import type { BankPaperKind, BankPaperScopeType, Question, QuestionBankPaper } from '@/types'

/** 平台约定的真题年份标签: 题目 categories 里的 `2024年真题` */
export const REAL_YEAR_CATEGORY_RE = /^(\d{4})年真题$/

/** 题目的分类; 老数据只有 category 单值时兜底成数组(categories 才是真相) */
export function questionCategories(q: Question): string[] {
  if (q.categories?.length) return q.categories
  return q.category ? [q.category] : []
}

/** key_points 是 [,，;；] 分隔的受控知识点词表, 与 kp_question_map 同口径 */
export function questionKeyPoints(q: Question): string[] {
  return (q.key_points ?? '').split(/[,，;；]/).map((s) => s.trim()).filter(Boolean)
}

/**
 * 一套卷的「范围」。套卷 = 范围 + 模板, 范围只表达"题从哪来",
 * 具体题型/数量/分值一律由模板决定。
 */
export interface BankPaperScope {
  kind: BankPaperKind
  scopeType: BankPaperScopeType
  /** 仅 scopeType='year' 用 */
  year: number | null
  /** 章节名 / 知识点名(可多选); 综合卷为空 */
  values: string[]
}

export interface BankPaperScopeOptions {
  /** 库里出现过的真题年份, 新 → 旧 */
  years: number[]
  /** 除年份标签以外的分类(即章节) */
  chapters: string[]
  keyPoints: string[]
  subjects: string[]
}

/** 套卷可选的年份/章节/知识点, 全部来自库里已有的题目标签, 不额外查库 */
export function collectBankPaperScopes(questions: Question[]): BankPaperScopeOptions {
  const years = new Set<number>()
  const chapters = new Set<string>()
  const keyPoints = new Set<string>()
  const subjects = new Set<string>()
  for (const q of questions) {
    for (const raw of questionCategories(q)) {
      const c = raw.trim()
      if (!c) continue
      const m = REAL_YEAR_CATEGORY_RE.exec(c)
      if (m) years.add(Number(m[1]))
      else chapters.add(c)
    }
    for (const kp of questionKeyPoints(q)) keyPoints.add(kp)
    if (q.subject) subjects.add(q.subject)
  }
  const zh = (a: string, b: string) => a.localeCompare(b, 'zh-CN')
  return {
    years: [...years].sort((a, b) => b - a),
    chapters: [...chapters].sort(zh),
    keyPoints: [...keyPoints].sort(zh),
    subjects: [...subjects].sort(zh),
  }
}

export function realYearCategory(year: number): string {
  return `${year}年真题`
}

/** 题目所属真题年份(取第一个 `YYYY年真题` 分类), 不是真题则 null */
export function realYearOf(q: Question): number | null {
  for (const raw of questionCategories(q)) {
    const m = REAL_YEAR_CATEGORY_RE.exec(raw.trim())
    if (m) return Number(m[1])
  }
  return null
}

function sameValues(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((v) => set.has(v))
}

/** 某个范围是否已经生成过卷了(一年一份 / 一章一份 / 综合一份) */
export function findPaperForScope(
  papers: QuestionBankPaper[],
  scope: BankPaperScope,
): QuestionBankPaper | undefined {
  return papers.find((p) => {
    if (p.scope_type !== scope.scopeType) return false
    if (scope.scopeType === 'year') return p.year === scope.year
    if (scope.scopeType === 'comprehensive') return true
    return sameValues(p.scope_values, scope.values)
  })
}

/**
 * 列表要展示的范围 = 从题库标签里长出来的 + 已生成套卷自带的。
 * 题目后来被移出库(年份标签消失)时, 那份卷子仍然要看得见 —— 否则它的行不渲染,
 * 用户既打不开也删不掉, 只在"共 N 套卷"里占一个数。
 */
export function mergePaperScopeValues(
  derived: string[],
  papers: QuestionBankPaper[],
  scopeType: BankPaperScopeType,
): string[] {
  const set = new Set(derived)
  for (const p of papers) {
    if (p.scope_type !== scopeType) continue
    for (const v of p.scope_values) set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function mergePaperYears(derived: number[], papers: QuestionBankPaper[]): number[] {
  const set = new Set(derived)
  for (const p of papers) {
    if (p.scope_type === 'year' && p.year != null) set.add(p.year)
  }
  return [...set].sort((a, b) => b - a)
}

/** 该范围在库里现有多少道题(按记录口径, 与库详情里的"共 N 道题"一致) */export function countQuestionsInScope(questions: Question[], scope: BankPaperScope): number {
  switch (scope.scopeType) {
    case 'comprehensive':
      return questions.length
    case 'year':
      return scope.year == null ? 0 : questions.filter((q) => realYearOf(q) === scope.year).length
    case 'chapter':
      return questions.filter((q) => questionCategories(q).some((c) => scope.values.includes(c.trim()))).length
    default:
      return questions.filter((q) => questionKeyPoints(q).some((kp) => scope.values.includes(kp))).length
  }
}

/** 组卷时传给 compose_exam 的硬过滤分类: 年份标签 / 章节名 */
export function scopeCategoriesOf(scope: BankPaperScope): string[] {
  if (scope.scopeType === 'year') return scope.year == null ? [] : [realYearCategory(scope.year)]
  return scope.scopeType === 'chapter' ? scope.values : []
}

export function scopeKeyPointsOf(scope: BankPaperScope): string[] {
  return scope.scopeType === 'key_point' ? scope.values : []
}

export function scopeFromPaper(paper: QuestionBankPaper): BankPaperScope {
  return {
    kind: paper.kind,
    scopeType: paper.scope_type,
    year: paper.year,
    values: paper.scope_values ?? [],
  }
}

export function defaultPaperName(scope: BankPaperScope): string {
  switch (scope.scopeType) {
    case 'year':
      return scope.year == null ? '真题卷' : `${scope.year}年真题卷`
    case 'chapter':
      return scope.values.length ? `${scope.values.join('、')}·章节模拟卷` : '章节模拟卷'
    case 'key_point':
      return scope.values.length ? `${scope.values.join('、')}·知识点模拟卷` : '知识点模拟卷'
    default:
      return '综合模拟卷'
  }
}

export const SCOPE_TYPE_LABELS: Record<BankPaperScopeType, string> = {
  year: '年份真题',
  chapter: '章节',
  key_point: '知识点',
  comprehensive: '综合',
}

/** 卷子来源的一句话说明, 用于卡片副标题 */
export function paperScopeLabel(paper: QuestionBankPaper): string {
  switch (paper.scope_type) {
    case 'year':
      return `${paper.year ?? ''}年真题`
    case 'chapter':
      return `章节：${paper.scope_values.join('、') || '—'}`
    case 'key_point':
      return `知识点：${paper.scope_values.join('、') || '—'}`
    default:
      return '整库综合'
  }
}
