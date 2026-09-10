import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { QUESTION_TYPE_LABELS, TYPE_COLORS, POINT_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Check, Sparkles } from 'lucide-react'
import type { Question } from '@/types'
import { useT } from '@/i18n/use-t'

function MultiYearBadge({ yearCats }: { yearCats: string[] }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400 cursor-pointer select-none"
          onClick={() => setOpen(!open)}
        >
          {(t('questionTags.realYearTemplate') ?? '{n}年真题').replace('{n}', String(yearCats.length))}
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-auto max-w-[calc(100vw-2rem)] px-3 py-2 text-xs">
        <p className="text-muted-foreground mb-1.5">{t('questionTags.realYearTip') ?? '该题在以下年份出现过：'}</p>
        <div className="flex flex-wrap gap-1">
          {yearCats.map((y) => (
            <span key={y} className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 font-medium whitespace-nowrap">{y}</span>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function AiBadge() {
  const { t } = useT()
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="ai-ring ai-badge ai-badge-dark">
          <span className="gemini-star"><Sparkles className="w-full h-full" /></span>
          <span className="badge-text">{t('ai.generated') ?? 'AI生成'}</span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" className="w-auto px-3 py-2 text-xs">
        <p>{t('ai.disclaimer')}</p>
      </HoverCardContent>
    </HoverCard>
  )
}

/** 题目标签徽章行:类型 / 验证状态 / 科目 / 分类(年份真题·AI生成等) / 知识点 / 作答次数 */
export function QuestionTags({ question, attemptCount, wrongCount, collapseAiTags }: {
  question: Question
  attemptCount?: number
  wrongCount?: number
  /**
   * 练习与考试场景下设为 true：把 AI 生成的知识点折叠成一个「N 个知识点」的悬停入口。
   * 知识点是 AI 抽取出来的，直接铺开会提示这道题在考什么，也把标签行挤得很长。
   */
  collapseAiTags?: boolean
}) {
  const { t } = useT()
  const type = question.question_type
  // t 缺词条时回落到 zh 常量,避免把 key 当文案显示
  const typeLabel = (() => {
    const v = t('questionTags.types.' + type)
    return v.startsWith('questionTags.types.') ? (QUESTION_TYPE_LABELS[type] ?? type) : v
  })()
  const cats = question.categories?.length ? question.categories : question.category ? [question.category] : []
  const yearPattern = /^\d{4}年真题$/
  const yearCats = cats.filter((c) => yearPattern.test(c))
  const otherCats = cats.filter((c) => !yearPattern.test(c))
  // 与题库其它位置保持一致：半角/全角逗号与分号都当作分隔符
  const kps = (question.key_points ?? '')
    .split(/[,，;；]/)
    .map((kp) => kp.trim())
    .filter(Boolean)

  const kpBadges = kps.map((kp, i) => (
    <Badge key={i} variant="secondary" className={cn(POINT_COLORS[i % POINT_COLORS.length], 'rounded-full')}>
      {kp}
    </Badge>
  ))

  return (
    <>
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[type] || 'bg-muted text-muted-foreground'}`}>
        {typeLabel}
      </span>
      {question.verified ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 text-xs">
          <Check className="h-3 w-3" />{t('questionTags.verified') ?? '已验证'}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs">
          {t('questionTags.unverified') ?? '待验证'}
        </span>
      )}
      {question.subject && (
        <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          {question.subject}
        </span>
      )}
      {yearCats.length >= 2 ? (
        <>
          <MultiYearBadge yearCats={yearCats} />
          {otherCats.map((cat) => (cat === 'AI生成' ? <AiBadge key="AI生成" /> : (
            <span key={cat} className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{cat}</span>
          )))}
        </>
      ) : (
        cats.map((cat) => (cat === 'AI生成' ? <AiBadge key="AI生成" /> : (
          <span key={cat} className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{cat}</span>
        )))
      )}
      {kps.length > 0 && (collapseAiTags ? (
        <HoverCard openDelay={120} closeDelay={80}>
          <HoverCardTrigger asChild>
            <span className="inline-flex cursor-pointer select-none items-center gap-1 rounded-full border border-dashed border-primary/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              <Sparkles className="h-3 w-3" />
              {kps.length} 个知识点
            </span>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" align="start" className="w-auto max-w-[min(90vw,340px)] px-3 py-2">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              AI 生成的知识点（悬停查看，避免影响作答）
            </p>
            <div className="flex flex-wrap gap-1">{kpBadges}</div>
          </HoverCardContent>
        </HoverCard>
      ) : (
        kpBadges
      ))}
      {attemptCount != null && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <span>{t('practice.attempts')}: {attemptCount}</span>
          {wrongCount != null && wrongCount > 0 && <span className="text-red-500">({t('practice.wrong')}: {wrongCount})</span>}
        </span>
      )}
    </>
  )
}
