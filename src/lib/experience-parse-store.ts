/**
 * 经验解析的数据层。
 *
 * 检索走 rag.ts 的 searchKnowledge(和全站同一个检索入口), 材料入库走 resource-library.ts
 * 的 ingestResource(和资料库同一条解析流水线), 所以这一层只补页面特有的几件事:
 * 材料索引状态、材料目录、待归类题目、采纳写入。
 *
 * 待归类题目为什么整表拉回来在本地筛: 「除年份标签外还有没有别的分类」在 PostgREST 里
 * 表达不出来 —— categories 是 JSONB 数组, 而判断条件是"这个数组里有几条不是 `YYYY年真题`"。
 * 一次 1000 行翻页取到够数就停, 和 rag-index 取数时同一个取舍。
 */
import { supabase } from '@/lib/supabase'
import { autoIndex } from '@/lib/rag'
import { realYearCategory } from '@/lib/bank-papers'
import {
  mergeKeyPoints, needsTriage, sectionNodes, triageFromRow, withChapterTag,
  type SectionNode, type TriageCriterion, type TriageQuestion, type TriageRow,
} from '@/lib/experience-parse'
import { getResourceDocument, loadAutoToc, loadDocumentToc } from '@/lib/resource-library'

const QUESTION_COLUMNS = [
  'id', 'subject', 'question_type', 'question_text', 'options', 'correct_answer',
  'analysis', 'answer_explanation', 'key_points', 'categories', 'category', 'source_page', 'seq_number',
].join(', ')

const PAGE_SIZE = 1000

// ── 材料 ──

/** 一份材料在检索索引里的块数。0 块 = 检索恒为空, 页面上必须先让人看见这一点 */
export async function documentIndexStatus(documentId: string): Promise<{ chunks: number; embedded: number }> {
  const base = () => supabase
    .from('rag_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'resource')
    .eq('source_id', documentId)
  const [all, embedded] = await Promise.all([
    base(),
    base().not('embedded_at', 'is', null),
  ])
  if (all.error) throw new Error(`读取索引状态失败: ${all.error.message}`)
  return { chunks: all.count ?? 0, embedded: embedded.count ?? 0 }
}

/** 材料的章节目录 → 带祖先链的节点。人工改过的目录优先(和阅读页同一口径) */
export async function loadSectionNodes(documentId: string): Promise<SectionNode[]> {
  const doc = await getResourceDocument(documentId)
  const manual = await loadDocumentToc(documentId).catch(() => null)
  const toc = manual ?? await loadAutoToc(documentId)
  return sectionNodes(toc, doc?.pdf_total_pages ?? 0)
}

// ── 题目 ──

export interface QuestionMetaOptions {
  subjects: string[]
  /** 库里出现过的真题年份, 新 → 旧 */
  years: number[]
}

export async function loadQuestionMeta(): Promise<QuestionMetaOptions> {
  const { data, error } = await supabase.rpc('get_question_meta', { p_subject: null })
  if (error) throw new Error(`读取学科与年份失败: ${error.message}`)
  const meta = (data ?? {}) as { subjects?: string[]; categories?: string[] }
  const years = new Set<number>()
  for (const c of meta.categories ?? []) {
    const m = /^(\d{4})年真题$/.exec(String(c).trim())
    if (m) years.add(Number(m[1]))
  }
  return {
    subjects: meta.subjects ?? [],
    years: [...years].sort((a, b) => b - a),
  }
}

export interface TriageQuery {
  subject: string | null
  year: number | null
  criterion: TriageCriterion
  limit: number
}

export interface TriageLoadResult {
  rows: TriageQuestion[]
  /** 实际扫过多少道题 —— "库里有 2000 道却只命中 3 道"和"根本没扫到"要分得清 */
  scanned: number
  /** 到数量上限就停了, 库里还有没扫到的 */
  truncated: boolean
}

export async function loadTriageQuestions(query: TriageQuery): Promise<TriageLoadResult> {
  const rows: TriageQuestion[] = []
  let scanned = 0

  for (let from = 0; ; from += PAGE_SIZE) {
    // 按 id 排序而不是 created_at: 分页要求排序键唯一, 否则翻页会漏行或重复
    let q = supabase.from('questions').select(QUESTION_COLUMNS).order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1)
    if (query.subject) q = q.eq('subject', query.subject)
    // 用 filter('cs', JSON 数组) 而不是 contains(): categories 是 jsonb 列, 而 contains()
    // 对数组值发的是 PostgREST 的数组字面量 `cs.{2024年真题}`, jsonb 解析不了这个写法,
    // 服务端直接 400 invalid input syntax for type json(实测)。jsonb 要的是 JSON 数组。
    if (query.year) q = q.filter('categories', 'cs', JSON.stringify([realYearCategory(query.year)]))

    const { data, error } = await q
    if (error) throw new Error(`加载题目失败: ${error.message}`)
    const page = (data ?? []) as unknown as TriageRow[]
    scanned += page.length

    for (const row of page) {
      const item = triageFromRow(row)
      if (!needsTriage(item, query.criterion)) continue
      rows.push(item)
      if (rows.length >= query.limit) return { rows, scanned, truncated: true }
    }
    if (page.length < PAGE_SIZE) break
  }

  return { rows, scanned, truncated: false }
}

/** 采纳: 章节标签并进 categories, 管理员挑中的知识点并进 key_points —— 一次 update 写完 */
export async function saveAttribution(
  question: TriageQuestion,
  patch: { chapterTag?: string | null; keyPoints?: string[] },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.chapterTag && patch.chapterTag.trim()) {
    update.categories = withChapterTag(question.categories, patch.chapterTag)
  }
  if (patch.keyPoints && patch.keyPoints.length > 0) {
    const merged = mergeKeyPoints(question.keyPoints, patch.keyPoints)
    if (merged) update.key_points = merged
  }
  if (Object.keys(update).length === 0) return

  const { error } = await supabase.from('questions').update(update).eq('id', question.id)
  if (error) throw new Error(`写入失败: ${error.message}`)
  // categories / key_points 都进了检索块正文, 采纳完不重索引就还是旧标签
  autoIndex('question', question.id)
}
