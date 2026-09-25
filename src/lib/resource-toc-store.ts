/**
 * 人工目录的读写 —— 拆出来是为了让 resource-toc.ts 保持纯函数, 能被 Node 直接跑测试。
 * 和 create-spec.ts(纯) / assistant-create.ts(IO) 是同一个分法。
 */

import { supabase } from '@/lib/supabase'
import { logError, userMessage } from '@/services/errors'
import { listResourceTocEntries } from '@/services/resources'
import type { TocDraftEntry } from '@/lib/resource-toc'

export async function loadManualToc(documentId: string): Promise<TocDraftEntry[]> {
  try {
    return await listResourceTocEntries(documentId)
  } catch (e) {
    logError('resource-toc-store.loadManualToc', e)
    throw new Error(`加载人工目录失败: ${userMessage(e)}`, { cause: e })
  }
}

/**
 * 落库走 RPC: 删旧 + 插新 + 翻 toc_source 必须在同一个事务里(见 Section 60)。
 * 分成「先 delete 再 insert」两个请求的话, 中间一旦失败, 管理员刚编完的整份目录就没了。
 */
export async function saveManualToc(documentId: string, entries: TocDraftEntry[]): Promise<void> {
  const payload = entries.map((e) => ({
    level: e.level,
    title: e.title.trim(),
    block_index: e.blockIndex,
    page_no: e.pageNo,
  }))
  const { error } = await supabase.rpc('save_resource_toc', {
    p_document_id: documentId,
    p_entries: payload,
  })
  if (error) throw new Error(`保存目录失败: ${error.message}`)
}

/** 退回自动目录: 清掉人工条目并把 toc_source 翻回 'auto' */
export async function resetManualToc(documentId: string): Promise<void> {
  const { error } = await supabase.rpc('reset_resource_toc', { p_document_id: documentId })
  if (error) throw new Error(`恢复自动目录失败: ${error.message}`)
}
