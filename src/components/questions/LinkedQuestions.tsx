/**
 * 信源侧的「关联题目」—— 与题面下方的 QuestionSources 是同一条边的两个方向:
 * 那边从题看信源, 这边从信源看题。
 *
 * 做成一个自给自足的块(自己拉数据、自己管展开), 因为它要挂在好几处: 文献阅读页、知识点解读、
 * 学科解读、公开笔记。没有关联时返回 null —— 绝大多数学员在绝大多数页面上没挂过东西, 空盒子
 * 只会占地方。
 *
 * 只看得见自己挂的(RLS 按 user_id 收): 这条边的语义是「我在这一段上挂过哪几道题」。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ListChecks } from 'lucide-react'

import { questionStem, questionTypeLabel } from '@/lib/kp-question-refs'
import { listLinkedQuestions, type LinkedQuestionRef } from '@/lib/question-links-store'
import { cn } from '@/lib/utils'
import type { RagSource } from '@/lib/rag'

interface Props {
  source: RagSource
  sourceId: string
  /** 块标题里那句"在这上面挂过的题" */
  title?: string
  className?: string
}

export function LinkedQuestions({ source, sourceId, title, className }: Props) {
  const [refs, setRefs] = useState<LinkedQuestionRef[]>([])
  /** 展开的那条(看备注) */
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!sourceId) return
    let cancelled = false
    // 反查失败就只是少一块: 阅读页不该因为关联表读不到就整页报错
    void (async () => {
      try {
        const rows = await listLinkedQuestions(source, sourceId)
        if (!cancelled) setRefs(rows)
      } catch {
        if (!cancelled) setRefs([])
      }
    })()
    return () => { cancelled = true }
  }, [source, sourceId])

  if (!sourceId || refs.length === 0) return null

  return (
    <div className={cn('space-y-1 rounded-lg border border-primary/20 bg-primary/[0.04] p-2', className)}>
      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <ListChecks className="h-2.5 w-2.5" />
        {title ?? '关联题目'}（{refs.length}）· 从这里能回到题上
      </p>
      {refs.map((ref) => {
        const q = ref.question
        if (!q) return null
        return (
          <div key={ref.linkId} className="rounded-md border border-primary/15 bg-background/60">
            <div className="flex items-center gap-1.5 px-1.5 py-1">
              <button
                type="button"
                onClick={() => setOpenId((cur) => (cur === ref.linkId ? null : ref.linkId))}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
                  {questionTypeLabel(q.questionType)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px]">{questionStem(q.questionText, 48)}</span>
                <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', openId === ref.linkId && 'rotate-90')} />
              </button>
              <Link to={`/practice?q=${q.id}`} className="shrink-0 text-[10px] text-primary hover:underline">
                去做这道题
              </Link>
            </div>
            {openId === ref.linkId && (
              <div className="space-y-1 border-t border-primary/10 px-1.5 py-1">
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{q.questionText}</p>
                {ref.note && (
                  <p className="text-[10px] leading-relaxed text-foreground/80">关联说明：{ref.note}</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
