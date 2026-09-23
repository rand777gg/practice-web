/**
 * 「依据原文」的读写 —— 拆出来是为了让 kp-resource-refs.ts 保持纯函数, 能被 Node 直接跑验证。
 * 和 resource-toc.ts(纯) / resource-toc-store.ts(IO) 是同一个分法。
 *
 * 快照(页码/文献标题/摘录)一律不从这里传: 前端为了取摘录得把整篇正文拉下来, 而"整节"这种粗选
 * 本来就没有逐段内容 —— 服务端一句 SQL 就能从 resource_blocks 里补齐(见 Section 63)。
 */
import { supabase } from '@/lib/supabase'
import type { KpRefDraft, KpResourceRef } from '@/lib/kp-resource-refs'

const COLUMNS = [
  'id', 'subject', 'kp', 'document_id', 'block_index', 'page_from', 'page_to',
  'blocks', 'doc_title', 'label', 'snippet', 'note', 'sort_order',
].join(', ')

interface RawRef {
  id: string
  subject: string
  kp: string
  document_id: string | null
  block_index: number | null
  page_from: number
  page_to: number
  blocks: number[] | null
  doc_title: string
  label: string
  snippet: string
  note: string
  sort_order: number
}

function toRef(r: RawRef): KpResourceRef {
  return {
    id: r.id,
    subject: r.subject,
    kp: r.kp,
    documentId: r.document_id,
    blockIndex: r.block_index,
    pageFrom: r.page_from,
    pageTo: r.page_to,
    blocks: r.blocks ?? [],
    docTitle: r.doc_title,
    label: r.label,
    snippet: r.snippet,
    note: r.note,
    sortOrder: r.sort_order,
  }
}

/** 某条解读的全部依据(复制/展示用) */
export async function listKpRefs(subject: string, kp: string): Promise<KpResourceRef[]> {
  if (!subject || !kp) return []
  const { data, error } = await supabase
    .from('kp_resource_refs')
    .select(COLUMNS)
    .eq('subject', subject)
    .eq('kp', kp)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`加载依据失败: ${error.message}`)
  return ((data ?? []) as unknown as RawRef[]).map(toRef)
}

/** 某篇文献被哪些解读引为依据 —— 阅读页的块标记用这条反查 */
export async function listDocumentRefs(documentId: string): Promise<KpResourceRef[]> {
  if (!documentId) return []
  const { data, error } = await supabase
    .from('kp_resource_refs')
    .select(COLUMNS)
    .eq('document_id', documentId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`加载引用失败: ${error.message}`)
  return ((data ?? []) as unknown as RawRef[]).map(toRef)
}

/**
 * 整条解读的依据一次性覆盖保存。
 *
 * 不走"逐条增删改"是因为它们本来就是一份有序清单(顺序即展示顺序), 分条改还要处理 id 的增删;
 * 而 RPC 那边是删旧插新一个事务, 中途失败不会留下"删了一半"的依据。
 */
export async function saveKpRefs(subject: string, kp: string, drafts: KpRefDraft[]): Promise<number> {
  const payload = drafts.map((d) => ({
    document_id: d.documentId,
    page_from: d.pageFrom,
    page_to: d.pageTo,
    blocks: d.blocks,
    label: d.label,
    note: d.note,
  }))
  const { data, error } = await supabase.rpc('save_kp_resource_refs', {
    p_subject: subject,
    p_kp: kp,
    p_refs: payload,
  })
  if (error) throw new Error(`保存依据失败: ${error.message}`)
  return Number(data ?? 0)
}
