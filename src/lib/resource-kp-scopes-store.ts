/**
 * 知识点范围的读写 —— 纯逻辑在 resource-kp-scopes.ts。
 *
 * 从知识点那一侧反查时要连着文献标题一起取回("第 74-90 页"单独看没有意义), 但不用 PostgREST
 * 的内嵌关联: 关联的形状依赖外键的暴露方式, 一次改名就得跟着改这里(和 kp-question-refs-store
 * 同一个写法), 而一次反查最多也就几十行。
 */
import { supabase } from '@/lib/supabase'
import type { ResourceKpScope, ResourceKpScopeDraft } from '@/lib/resource-kp-scopes'

const SCOPE_COLUMNS = [
  'id', 'document_id', 'subject', 'kp', 'block_from', 'block_to',
  'page_from', 'page_to', 'toc_title', 'toc_level', 'note', 'created_at',
].join(', ')

interface RawScopeRow {
  id: string
  document_id: string
  subject: string
  kp: string
  block_from: number
  block_to: number
  page_from: number
  page_to: number
  toc_title: string
  toc_level: number
  note: string
  created_at: string
}

function toScope(row: RawScopeRow, title: string): ResourceKpScope {
  return {
    id: row.id,
    documentId: row.document_id,
    documentTitle: title,
    subject: row.subject,
    kp: row.kp,
    blockFrom: row.block_from,
    blockTo: row.block_to,
    pageFrom: row.page_from,
    pageTo: row.page_to,
    tocTitle: row.toc_title,
    tocLevel: row.toc_level,
    note: row.note,
    createdAt: row.created_at,
  }
}

/** 给一批范围补上文献标题(查不到的按"已下线"处理, 不丢这一行) */
async function withTitles(rows: RawScopeRow[]): Promise<ResourceKpScope[]> {
  const ids = [...new Set(rows.map((r) => r.document_id))]
  const titles = new Map<string, string>()
  if (ids.length > 0) {
    const { data } = await supabase.from('resource_documents').select('id, title').in('id', ids)
    for (const d of (data ?? []) as { id: string; title: string }[]) titles.set(d.id, d.title)
  }
  return rows.map((r) => toScope(r, titles.get(r.document_id) ?? '（文献已下线）'))
}

/** 这一篇里圈出来的范围(阅读页那一栏; 全体登录用户都能读) */
export async function listDocumentScopes(documentId: string): Promise<ResourceKpScope[]> {
  if (!documentId) return []
  const { data, error } = await supabase
    .from('resource_kp_scopes')
    .select(SCOPE_COLUMNS)
    .eq('document_id', documentId)
    .order('block_from', { ascending: true })
  if (error) throw new Error(`加载知识点范围失败: ${error.message}`)
  return (data ?? []) as unknown as ResourceKpScope[]
}

/** 这个知识点的材料都在哪几篇哪几段 —— 知识点解读、专题、路线图都走这一条 */
export async function listKpScopes(subject: string, kp: string): Promise<ResourceKpScope[]> {
  if (!subject || !kp) return []
  const { data, error } = await supabase
    .from('resource_kp_scopes')
    .select(SCOPE_COLUMNS)
    .eq('subject', subject)
    .eq('kp', kp)
    .order('page_from', { ascending: true })
  if (error) throw new Error(`加载知识点材料范围失败: ${error.message}`)
  return withTitles((data ?? []) as unknown as RawScopeRow[])
}

/** 一个学科下所有知识点的范围(专题页按学科列材料时用) */
export async function listSubjectScopes(subject: string, limit = 200): Promise<ResourceKpScope[]> {
  if (!subject) return []
  const { data, error } = await supabase
    .from('resource_kp_scopes')
    .select(SCOPE_COLUMNS)
    .eq('subject', subject)
    .order('kp', { ascending: true })
    .order('page_from', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`加载学科材料范围失败: ${error.message}`)
  return withTitles((data ?? []) as unknown as RawScopeRow[])
}

/**
 * 指定的这几个知识点的范围(学习路线的某个阶段用: 那一阶段的题涉及哪几个知识点)。
 *
 * 只按 kp 名捞一次再在本地按 (学科, kp) 收口 —— 知识点名理论上可能重名于两个学科,
 * 而 `or=(subject,kp).in.(...)` 这种行值过滤在 PostgREST 上写出来没人看得懂。
 */
export async function listScopesForSubjectKps(
  pairs: { subject: string; kp: string }[],
  limit = 200,
): Promise<ResourceKpScope[]> {
  const kps = [...new Set(pairs.map((p) => p.kp).filter(Boolean))]
  if (kps.length === 0) return []
  const { data, error } = await supabase
    .from('resource_kp_scopes')
    .select(SCOPE_COLUMNS)
    .in('kp', kps)
    .order('page_from', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`加载知识点材料范围失败: ${error.message}`)

  const wanted = new Set(pairs.map((p) => `${p.subject}\u0000${p.kp}`))
  const rows = ((data ?? []) as unknown as RawScopeRow[])
    .filter((r) => wanted.has(`${r.subject}\u0000${r.kp}`))
  return withTitles(rows)
}

export async function createKpScope(draft: ResourceKpScopeDraft): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const { error } = await supabase.from('resource_kp_scopes').insert({
    document_id: draft.documentId,
    subject: draft.subject,
    kp: draft.kp,
    block_from: draft.blockFrom,
    block_to: draft.blockTo,
    page_from: draft.pageFrom,
    page_to: draft.pageTo,
    toc_title: draft.tocTitle,
    toc_level: draft.tocLevel,
    note: draft.note,
    created_by: userData.user?.id ?? null,
  })
  // 唯一索引挡下来的重复圈法: 说人话, 不要把这个 409 原样丢给用户
  if (error) {
    throw new Error(error.code === '23505'
      ? '这一段已经挂在这个知识点上了'
      : `保存知识点范围失败: ${error.message}`)
  }
}

export async function deleteKpScope(id: string): Promise<void> {
  const { error } = await supabase.from('resource_kp_scopes').delete().eq('id', id)
  if (error) throw new Error(`删除知识点范围失败: ${error.message}`)
}
