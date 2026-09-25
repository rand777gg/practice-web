/**
 * 「依据原文」的读写 —— 拆出来是为了让 kp-resource-refs.ts 保持纯函数, 能被 Node 直接跑验证。
 * 和 resource-toc.ts(纯) / resource-toc-store.ts(IO) 是同一个分法。
 *
 * 快照(页码/文献标题/摘录)一律不从这里传: 前端为了取摘录得把整篇正文拉下来, 而"整节"这种粗选
 * 本来就没有逐段内容 —— 服务端一句 SQL 就能从 resource_blocks 里补齐(见 Section 63)。
 */
import { supabase } from '@/lib/supabase'
import { logError, userMessage } from '@/services/errors'
import {
  listDocumentRefs as listDocumentRefRows,
  listKpRefs as listKpRefRows,
} from '@/services/resources'
import type { KpRefDraft, KpResourceRef } from '@/lib/kp-resource-refs'

/** 某条解读的全部依据(复制/展示用) */
export async function listKpRefs(subject: string, kp: string): Promise<KpResourceRef[]> {
  if (!subject || !kp) return []
  try {
    return await listKpRefRows(subject, kp)
  } catch (e) {
    logError('kp-resource-refs.listKpRefs', e)
    throw new Error(`加载依据失败: ${userMessage(e)}`, { cause: e })
  }
}

/** 某篇文献被哪些解读引为依据 —— 阅读页的块标记用这条反查 */
export async function listDocumentRefs(documentId: string): Promise<KpResourceRef[]> {
  if (!documentId) return []
  try {
    return await listDocumentRefRows(documentId)
  } catch (e) {
    logError('kp-resource-refs.listDocumentRefs', e)
    throw new Error(`加载引用失败: ${userMessage(e)}`, { cause: e })
  }
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
