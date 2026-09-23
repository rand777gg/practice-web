/**
 * 经验解析 —— 「这道题属于材料的哪一部分」(纯逻辑这一半)。
 *
 * 题库里有一批往年真题只带了年份标签: 既没有章节分类, 也没写知识点。人工翻材料去对太慢,
 * 所以走检索 —— 拿题干(连选项、解析)在**知识点材料**里检索, 每个命中块各自落回材料目录的
 * 某一节, 按命中得分投票, 得票最高的那一节就是它所属的部分。
 *
 * 为什么归属锚在页码而不是命中块自带的标题路径(rag_chunks.sub_label):
 *   页码区间是目录现推出来的、互不重叠; 而标题字符串在同一本书里会重复(「小结」「思考题」
 *   每章都有一条), 拿字符串去认会一次命中全书所有章的小结。页码归属还有个附带好处 ——
 *   命中落在第一个标题之前时能老实记成"未归属", 而不是硬塞一节。
 *
 * 只写 categories(章节标签), 不擅自写 key_points: 平台的知识点是受控词表(形如
 * `A01-医学的演变、传播与交融`), 随手写进去的自由文本跟任何筛选都对不上 —— 见
 * create-spec 里同一处判断。词表里真有对得上的条目时才预选, 见 matchKeyPoints。
 */
import { OPTION_LABELS } from './constants.ts'
import { REAL_YEAR_CATEGORY_RE } from './bank-papers.ts'
import { searchTermForKp } from './kp-resource-refs.ts'
import { formatKeyPoints, splitKeyPoints } from './create-spec.ts'
import { sectionsFromToc, type TocEntry, type TocSection } from './resource-blocks.ts'

// ── 目录 ──

export interface SectionRef {
  key: number
  level: number
  title: string
}

export interface SectionNode extends SectionRef {
  pageFrom: number
  pageTo: number
  /** 祖先 → 自身。展示成「第一部分 › 第3章」, 归属按层级取其中的一节 */
  chain: SectionRef[]
}

/**
 * 目录条目 → 带祖先链的节点。
 * 层级来自标题编号(「第一章」=1 级 / 「1.1」=2 级), 推法与 rag-index 给块加标题前缀时一致。
 */
export function sectionNodes(toc: TocEntry[], totalPages: number): SectionNode[] {
  const stack: TocSection[] = []
  return sectionsFromToc(toc, totalPages).map((s) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= s.level) stack.pop()
    stack.push(s)
    return {
      key: s.key,
      level: s.level,
      title: s.title,
      pageFrom: s.pageFrom,
      pageTo: s.pageTo,
      chain: stack.map((n) => ({ key: n.key, level: n.level, title: n.title })),
    }
  })
}

/** 材料里真的出现过的层级, 升序 */
export function levelsOf(nodes: SectionNode[]): number[] {
  return [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b)
}

/**
 * 默认归类粒度。
 * 取第 2 级(章下面的节)是因为它最接近"这一题考哪块内容"; 材料只有一层标题时退化成第 1 级,
 * 而不是硬找一个不存在的层级。
 */
export function defaultLevel(nodes: SectionNode[]): number {
  const levels = levelsOf(nodes)
  if (levels.length === 0) return 1
  return levels.includes(2) ? 2 : levels[0]
}

/**
 * 页码落在哪一节里。
 * 同一页挂着多节时(几个标题挤在一页, 区间被夹成单页)取**最深**那一节, 深浅相同取靠后那条 ——
 * 目录是按阅读顺序排的, 靠后的那条离正文更近。
 */
function nodeAtPage(nodes: SectionNode[], pageNo: number | null): SectionNode | null {
  if (pageNo === null) return null
  let found: SectionNode | null = null
  for (const node of nodes) {
    if (node.pageFrom <= pageNo && node.pageTo >= pageNo && (!found || node.level >= found.level)) found = node
  }
  return found
}

/** 节点在指定层级上的那一节: 取链上最深的 ≤ level 的那节; 整条链都比 level 深时取最上面那节 */
function ancestorAt(node: SectionNode, level: number): SectionRef {
  let target = node.chain[0]
  for (const ref of node.chain) if (ref.level <= level) target = ref
  return target
}

// ── 归属 ──

export interface AttributionHit {
  sourceId: string
  pageNo: number | null
  score: number
  content: string
}

export interface ChapterVote {
  key: number
  level: number
  title: string
  /** 完整标题链, 给管理员看上下文 */
  path: string[]
  score: number
  hits: number
}

export interface Attribution {
  /** 建议归属; null = 没有一条命中落进任何一节 */
  best: ChapterVote | null
  /** 建议那一节的得分 / 全部命中得分, 0..1 */
  confidence: number
  /** 命中里落不进任何一节的条数(正文在第一个标题之前) */
  unattributed: number
  /** 该层级的全部候选, 得分高者在前 —— 管理员要改归属时就从这里挑 */
  candidates: ChapterVote[]
}

export const EMPTY_ATTRIBUTION: Attribution = { best: null, confidence: 0, unattributed: 0, candidates: [] }

/**
 * 命中 → 归属。
 *
 * 只统计**主材料**的命中: 佐证材料(经验贴之类)的片段是给人看的旁证, 它有自己的目录,
 * 混进来投票会把两个来源的章节搅在一起。
 */
export function attributeHits(
  hits: AttributionHit[],
  nodes: SectionNode[],
  level: number,
  mainSourceId: string,
): Attribution {
  const byKey = new Map(nodes.map((n) => [n.key, n]))
  const votes = new Map<number, ChapterVote>()
  let total = 0
  let unattributed = 0

  for (const hit of hits) {
    if (hit.sourceId !== mainSourceId) continue
    total += hit.score
    const node = nodeAtPage(nodes, hit.pageNo)
    if (!node) {
      unattributed += 1
      continue
    }
    const ref = ancestorAt(node, level)
    const path = (byKey.get(ref.key)?.chain ?? node.chain).map((c) => c.title)
    const prev = votes.get(ref.key)
    if (prev) {
      prev.score += hit.score
      prev.hits += 1
    } else {
      votes.set(ref.key, { key: ref.key, level: ref.level, title: ref.title, path, score: hit.score, hits: 1 })
    }
  }

  const candidates = [...votes.values()].sort((a, b) => b.score - a.score || b.hits - a.hits || a.key - b.key)
  const best = candidates[0] ?? null
  return {
    best,
    confidence: best && total > 0 ? best.score / total : 0,
    unattributed,
    candidates,
  }
}

export type ConfidenceTier = 'high' | 'medium' | 'low'

export const CONFIDENCE_TIER_LABEL: Record<ConfidenceTier, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

/**
 * 置信度分档。
 *
 * 只有一条命中一律算低: 一次检索只中一块时, "它落在哪一节"跟"这一节就是答案"是两回事,
 * 没有第二条命中去印证。分档阈值是拿真实材料的投票分布定的 —— 命中权重是 RRF 得分,
 * 排第一那条满打满算 1/61, 所以"高"必须是同一节连着拿下好几条命中。
 */
export function confidenceTier(a: Attribution): ConfidenceTier {
  if (!a.best || a.best.hits < 2) return 'low'
  if (a.confidence >= 0.45) return 'high'
  if (a.confidence >= 0.25) return 'medium'
  return 'low'
}

/** 命中块正文里的片段, 去掉开头的【材料 › 标题】前缀(那一层信息已经由"建议部分"表达了) */
export function evidenceSnippet(content: string, max = 140): string {
  const body = content.replace(/^【[^】]*】/, '').replace(/\s+/g, ' ').trim()
  return body.length > max ? `${body.slice(0, max)}…` : body
}

// ── 题目 ──

export interface TriageQuestion {
  id: string
  subject: string | null
  questionType: string
  questionText: string
  options: string[]
  correctAnswer: unknown
  analysis: string | null
  answerExplanation: string | null
  keyPoints: string[]
  categories: string[]
  /** categories 里 `YYYY年真题` 那条的年份; 多条年份标签取最新的 */
  year: number | null
  /** 除年份标签以外的分类 —— 这些才是章节 */
  chapterTags: string[]
  sourcePage: string | null
  seqNumber: number | null
}

export interface TriageRow {
  id: string
  subject: string | null
  question_type: string
  question_text: string
  options: unknown
  correct_answer: unknown
  analysis: string | null
  answer_explanation: string | null
  key_points: string | null
  categories: unknown
  category: string | null
  source_page: string | null
  seq_number: number | null
}

export function triageFromRow(row: TriageRow): TriageQuestion {
  const categories = Array.isArray(row.categories) && row.categories.length > 0
    ? (row.categories as unknown[]).map((c) => String(c).trim()).filter(Boolean)
    : (row.category ? [row.category.trim()] : [])
  const years: number[] = []
  const chapterTags: string[] = []
  for (const c of categories) {
    const m = REAL_YEAR_CATEGORY_RE.exec(c)
    if (m) years.push(Number(m[1]))
    else chapterTags.push(c)
  }
  return {
    id: row.id,
    subject: row.subject,
    questionType: row.question_type,
    questionText: row.question_text,
    options: Array.isArray(row.options) ? (row.options as unknown[]).map(String) : [],
    correctAnswer: row.correct_answer,
    analysis: row.analysis,
    answerExplanation: row.answer_explanation,
    keyPoints: splitKeyPoints(row.key_points),
    categories,
    year: years.length > 0 ? Math.max(...years) : null,
    chapterTags,
    sourcePage: row.source_page,
    seqNumber: row.seq_number,
  }
}

export type TriageCriterion = 'either' | 'chapter' | 'key_points'

export const TRIAGE_CRITERIA: { value: TriageCriterion; label: string; hint: string }[] = [
  { value: 'either', label: '缺章节或知识点', hint: '任一缺失就列入 —— 补真题标签最常用' },
  { value: 'chapter', label: '只缺章节分类', hint: '已经有知识点, 只差"属于哪一部分"' },
  { value: 'key_points', label: '只缺知识点', hint: '已经有章节, 只差知识点词条' },
]

export function needsTriage(q: TriageQuestion, criterion: TriageCriterion): boolean {
  const noChapter = q.chapterTags.length === 0
  const noKp = q.keyPoints.length === 0
  if (criterion === 'chapter') return noChapter
  if (criterion === 'key_points') return noKp
  return noChapter || noKp
}

/**
 * 检索用的问句: 题干是主体, 选项、解析都是补充信号。
 * rag-search 那边限 500 字, 这里留点余量 —— 超了会被整条请求拒掉。
 */
export function retrievalQuery(q: TriageQuestion, max = 480): string {
  const parts = [
    q.questionText.trim(),
    q.options.length > 0 ? q.options.map((o, i) => `${OPTION_LABELS[i] ?? i + 1}. ${o}`).join(' ') : '',
    (q.analysis ?? '').trim(),
    (q.answerExplanation ?? '').trim(),
  ].filter(Boolean)
  const text = parts.join(' ')
  return text.length > max ? text.slice(0, max) : text
}

/**
 * 章节标签追加到 categories **末尾**。
 * 放末尾而不是开头: questions 的触发器把 categories[0] 同步成 category, 而真题的
 * `2024年真题` 必须留在首位 —— 全站的真题筛选和套卷都认那一条。
 */
export function withChapterTag(categories: string[], tag: string): string[] {
  const clean = tag.trim()
  if (!clean) return categories
  return categories.some((c) => c.trim() === clean) ? categories : [...categories, clean]
}

/**
 * 从平台受控知识点词表里挑出与这次归属相关的条目。
 *
 * 词表条目形如 `A01-医学的演变、传播与交融`, 所以先剥掉编码前缀再拿名字去材料正文/标题里找。
 * 找不到就不预选 —— 宁可留空让管理员自己挑, 也不要塞一个跟任何筛选都对不上的自由文本。
 */
export function matchKeyPoints(vocabulary: string[], texts: string[], limit = 6): string[] {
  const hay = texts.filter(Boolean)
  const out: string[] = []
  for (const entry of vocabulary) {
    const term = searchTermForKp(entry)
    if (term.length < 3) continue
    if (!hay.some((t) => t.includes(term))) continue
    out.push(entry)
    if (out.length >= limit) break
  }
  return out
}

/** 采纳时的知识点合并: 已有的原样留着, 新挑的追加去重 */
export function mergeKeyPoints(existing: string[], picked: string[]): string | null {
  return formatKeyPoints([...existing, ...picked])
}
