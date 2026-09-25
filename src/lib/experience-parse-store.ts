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
  mergeKeyPoints, needsTriage, usableToc, sectionNodes, triageFromRow, withChapterTag,
  type SectionNode, type TriageCriterion, type TriageQuestion, type TriageRow,
} from '@/lib/experience-parse'
import { getResourceDocument, loadAutoToc, loadDocumentToc } from '@/lib/resource-library'
import { logError, userMessage } from '@/services/errors'
import { countResourceChunks } from '@/services/resources'
import { fetchQuestionTriagePage, updateQuestion } from '@/services/questions'
import type { QuestionInput } from '@/types'

const PAGE_SIZE = 1000

// ── 材料 ──

/** 一份材料在检索索引里的块数。0 块 = 检索恒为空, 页面上必须先让人看见这一点 */
export async function documentIndexStatus(documentId: string): Promise<{ chunks: number; embedded: number }> {
  try {
    return await countResourceChunks(documentId)
  } catch (e) {
    logError('experience-parse.documentIndexStatus', e)
    throw new Error(`读取索引状态失败: ${userMessage(e)}`, { cause: e })
  }
}

export interface MaterialSections {
  /** 归属候选(带祖先链) */
  nodes: SectionNode[]
  /** 材料识别出的标题总数。候选只是其中带编号的那部分, 两个数要一起给人看 */
  headingCount: number
  /** 用的是管理员改过的人工目录(那种目录逐条挑过, 不再按编号筛) */
  manual: boolean
}

/** 材料的章节目录 → 归属候选。人工改过的目录优先(和阅读页同一口径) */
export async function loadMaterialSections(documentId: string): Promise<MaterialSections> {
  const doc = await getResourceDocument(documentId)
  const pages = doc?.pdf_total_pages ?? 0
  const manualToc = await loadDocumentToc(documentId).catch(() => null)
  if (manualToc) return { nodes: sectionNodes(manualToc, pages), headingCount: manualToc.length, manual: true }

  /*
   * 标题行必须取全。这里曾经自己 `.limit(1000)` 翻页, 而 PostgREST 的 db-max-rows 也是 1000,
   * 一本 544 页的书有 1194 个标题 —— 后半本书的节全部缺失, sectionsFromToc 把最后一个节点的页区间
   * 一路延到全书末尾, 后半本的命中就都被算到"最后一个节点"头上(抽查实测 p521 的概念技能被归到了
   * 一个完全不沾边的节)。loadAutoToc 现在由服务层翻页取全, 不再有截断。
   */
  const toc = await loadAutoToc(documentId)
  return { nodes: sectionNodes(usableToc(toc), pages), headingCount: toc.length, manual: false }
}

// ── 题目 ──

export interface QuestionMetaOptions {
  subjects: string[]
  /** 库里出现过的真题年份, 新 → 旧 */
  years: number[]
}

export async function loadQuestionMeta(): Promise<QuestionMetaOptions> {
  // p_subject 省略即 SQL 里的 DEFAULT NULL（全学科）；生成类型也只接受 undefined 表示省略
  const { data, error } = await supabase.rpc('get_question_meta', {})
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
  const year = query.year ? realYearCategory(query.year) : null

  for (let from = 0; ; from += PAGE_SIZE) {
    // 按 id 排序而不是 created_at: 分页要求排序键唯一, 否则翻页会漏行或重复
    let page: TriageRow[]
    try {
      page = await fetchQuestionTriagePage({
        subject: query.subject,
        year,
        from,
        to: from + PAGE_SIZE - 1,
      })
    } catch (e) {
      logError('experience-parse.loadTriageQuestions', e)
      throw new Error(`加载题目失败: ${userMessage(e)}`, { cause: e })
    }
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
  const write: Pick<Partial<QuestionInput>, 'categories' | 'key_points'> = {}
  if (patch.chapterTag && patch.chapterTag.trim()) {
    write.categories = withChapterTag(question.categories, patch.chapterTag)
  }
  if (patch.keyPoints && patch.keyPoints.length > 0) {
    const merged = mergeKeyPoints(question.keyPoints, patch.keyPoints)
    if (merged) write.key_points = merged
  }
  if (Object.keys(write).length === 0) return

  try {
    await updateQuestion(question.id, write)
  } catch (e) {
    logError('experience-parse.saveAttribution', e)
    throw new Error(`写入失败: ${userMessage(e)}`, { cause: e })
  }
  // categories / key_points 都进了检索块正文, 采纳完不重索引就还是旧标签
  autoIndex('question', question.id)
}
