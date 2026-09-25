/**
 * 知识点范围的读写 —— 纯逻辑在 resource-kp-scopes.ts。
 *
 * 从知识点那一侧反查时要连着文献标题一起取回("第 74-90 页"单独看没有意义), 那一步
 * (行 → 对象 + 补标题) 由服务层收口, 这里只负责把失败翻成人话。
 */
import { isAppError, logError, userMessage } from '@/services/errors'
import {
  createKpScope as createKpScopeRow,
  deleteKpScope as deleteKpScopeRow,
  listDocumentScopes as listDocumentScopeRows,
  listScopesForKp,
  listScopesForSubjectKps as listScopeRowsForSubjectKps,
  listSubjectScopes as listSubjectScopeRows,
} from '@/services/resources'
import type { ResourceKpScope, ResourceKpScopeDraft } from '@/lib/resource-kp-scopes'

/** 这一篇里圈出来的范围(阅读页那一栏; 全体登录用户都能读) */
export async function listDocumentScopes(documentId: string): Promise<ResourceKpScope[]> {
  if (!documentId) return []
  try {
    return await listDocumentScopeRows(documentId)
  } catch (e) {
    logError('resource-kp-scopes-store.listDocumentScopes', e)
    throw new Error(`加载知识点范围失败: ${userMessage(e)}`, { cause: e })
  }
}

/** 这个知识点的材料都在哪几篇哪几段 —— 知识点解读、专题、路线图都走这一条 */
export async function listKpScopes(subject: string, kp: string): Promise<ResourceKpScope[]> {
  if (!subject || !kp) return []
  try {
    return await listScopesForKp(subject, kp)
  } catch (e) {
    logError('resource-kp-scopes-store.listKpScopes', e)
    throw new Error(`加载知识点材料范围失败: ${userMessage(e)}`, { cause: e })
  }
}

/** 一个学科下所有知识点的范围(专题页按学科列材料时用) */
export async function listSubjectScopes(subject: string, limit = 200): Promise<ResourceKpScope[]> {
  if (!subject) return []
  try {
    return await listSubjectScopeRows(subject, limit)
  } catch (e) {
    logError('resource-kp-scopes-store.listSubjectScopes', e)
    throw new Error(`加载学科材料范围失败: ${userMessage(e)}`, { cause: e })
  }
}

/**
 * 指定的这几个知识点的范围(学习路线的某个阶段用: 那一阶段的题涉及哪几个知识点)。
 * 知识点名可能重名于两个学科, 所以服务层按 (学科, kp) 收口, 不以裸 kp 名为准。
 */
export async function listScopesForSubjectKps(
  pairs: { subject: string; kp: string }[],
  limit = 200,
): Promise<ResourceKpScope[]> {
  try {
    return await listScopeRowsForSubjectKps(pairs, limit)
  } catch (e) {
    logError('resource-kp-scopes-store.listScopesForSubjectKps', e)
    throw new Error(`加载知识点材料范围失败: ${userMessage(e)}`, { cause: e })
  }
}

export async function createKpScope(draft: ResourceKpScopeDraft): Promise<void> {
  try {
    await createKpScopeRow(draft)
  } catch (e) {
    logError('resource-kp-scopes-store.createKpScope', e)
    // 唯一索引挡下来的重复圈法: 说人话, 不要把这个 409 原样丢给用户
    const message = isAppError(e) && e.kind === 'conflict'
      ? '这一段已经挂在这个知识点上了'
      : `保存知识点范围失败: ${userMessage(e)}`
    throw new Error(message, { cause: e })
  }
}

export async function deleteKpScope(id: string): Promise<void> {
  try {
    await deleteKpScopeRow(id)
  } catch (e) {
    logError('resource-kp-scopes-store.deleteKpScope', e)
    throw new Error(`删除知识点范围失败: ${userMessage(e)}`, { cause: e })
  }
}
