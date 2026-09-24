/**
 * 「材料范围」跳转清单 —— 知识点的材料长在哪几篇文献的哪几段(见 Section 80)。
 *
 * 同一份清单要在四处出现: 知识点解读弹窗(这条解读的材料)、专业专题(这个学科的材料)、
 * 学习路线的阶段(这一阶段涉及的几个知识点的材料)、以及资料库阅读页的反向入口。
 * 所以做成一个自给自足的块: 给它学科(可选再给几个知识点), 它自己去查、自己渲染。
 *
 * 链接地址就是 RAG 引用用的那个 /resource-library/x?block=n —— 点过去落在圈出来的第一段,
 * 落到哪一段由范围决定, 不由点击的人决定。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  groupScopesByDocument, kpCode, scopeAnchor, scopePages, type ResourceKpScope,
} from '@/lib/resource-kp-scopes'
import { listScopesForSubjectKps, listSubjectScopes } from '@/lib/resource-kp-scopes-store'

interface Props {
  subject: string
  /** 限定这几个知识点; 不传 = 该学科下所有圈过范围的知识点 */
  kps?: string[]
  title?: string
  /** 一条都没有时显示这句; 不传就整块不渲染 */
  emptyHint?: string
  className?: string
}

export function KpScopeLinks({ subject, kps, title, emptyHint, className }: Props) {
  const [scopes, setScopes] = useState<ResourceKpScope[]>([])
  const [loaded, setLoaded] = useState(false)
  /** kps 是每次渲染新建的数组, 直接进依赖会无限拉取; 用它的字符串形态当 key */
  const kpKey = kps?.join('\u0000') ?? ''

  useEffect(() => {
    if (!subject) return
    let cancelled = false
    void (async () => {
      try {
        const wanted = kpKey ? kpKey.split('\u0000') : []
        const list = wanted.length > 0
          ? await listScopesForSubjectKps(wanted.map((kp) => ({ subject, kp })))
          : await listSubjectScopes(subject)
        if (!cancelled) setScopes(list)
      } catch {
        // 材料范围是锦上添花: 查不到就当没有, 不该把解读/专题整块弄成错误页
        if (!cancelled) setScopes([])
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [subject, kpKey])

  if (!loaded) return null
  if (scopes.length === 0) {
    return emptyHint
      ? <p className={cn('text-[11px] leading-relaxed text-muted-foreground', className)}>{emptyHint}</p>
      : null
  }

  return (
    <div className={cn('space-y-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-2', className)}>
      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Layers className="h-2.5 w-2.5" />
        {title ?? '材料范围'}（{scopes.length} 段）· 点开跳到原文那一段
      </p>
      {groupScopesByDocument(scopes).map((group) => (
        <div key={group.documentId} className="space-y-0.5">
          <p className="px-0.5 text-[10px] font-medium text-foreground/80">{group.documentTitle}</p>
          {group.items.map((scope) => (
            <Link
              key={scope.id}
              to={scopeAnchor(scope)}
              className="flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-emerald-500/10"
            >
              <span className="shrink-0 rounded bg-emerald-100 px-1 text-[9px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {kpCode(scope.kp)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px]" title={scope.kp}>{scope.kp}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {scopePages(scope)}{scope.tocTitle && ` · ${scope.tocTitle.slice(0, 12)}`}
              </span>
              <span className="shrink-0 text-[10px] text-primary">跳过去</span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}
