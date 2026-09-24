/**
 * 知识点解读的正文 —— 弹窗(KpExplanationDialog) 和阅读页抽屉(KpExplanationSheet) 共用的那一份。
 *
 * 两处只差一层壳, 所以正文、「依据原文」与「相关真题」都放这里; 标题留在各自壳里 ——
 * Radix 的 Dialog/Sheet 各自要求自己的 Title 组件, 硬凑一个共用头反而更绕。
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Library } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { ReadAloudButton } from '@/components/tts/ReadAloudButton'
import { LinkedQuestions } from '@/components/questions/LinkedQuestions'
import { markdownToSpeech, splitForSpeech } from '@/lib/tts/speech'
import { supabase } from '@/lib/supabase'
import { OPTION_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { kpSourceId } from '@/lib/question-links'
import { refAnchor, refWhere, type KpResourceRef } from '@/lib/kp-resource-refs'
import { listKpRefs } from '@/lib/kp-resource-refs-store'
import {
  answerText, correctOptionIndexes, explanationOf, questionStem, questionTypeLabel, yearBadge,
  type KpQuestionLink,
} from '@/lib/kp-question-refs'
import { listKpQuestions } from '@/lib/kp-question-refs-store'

interface Props {
  subject: string
  kp: string
  /**
   * 打开一条依据。不传就退化成站内跳转(<Link> 到 /resource-library/x?block=n)。
   * 阅读页要"就地定位 + 关抽屉", 所以那条路自己接了这个回调。
   */
  onOpenRef?: (hit: KpResourceRef) => void
}

interface Loaded {
  key: string
  content: string
  refs: KpResourceRef[]
  questions: KpQuestionLink[]
}

/**
 * 一条依据: 点一下展开摘录与备注, 右边是"去看原文"。
 * 展开是刻意的 —— 依据要能当场核对, 而不是只能相信写着有出处。
 */
function RefRow({ item, onOpenRef }: { item: KpResourceRef; onOpenRef?: (hit: KpResourceRef) => void }) {
  const [open, setOpen] = useState(false)
  const anchor = refAnchor(item)
  const where = refWhere(item)

  return (
    <div className="rounded-md border border-primary/10 bg-background/60">
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <Badge variant="secondary" className="shrink-0 border-transparent bg-primary/10 px-1 py-0 text-[9px] font-normal leading-4 text-primary">
            文献
          </Badge>
          <span className="min-w-0 flex-1 truncate text-[11px]">{item.docTitle || '（未知文献）'}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{where}</span>
          <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        </button>

        {onOpenRef ? (
          <button
            type="button"
            onClick={() => onOpenRef(item)}
            className="shrink-0 text-[10px] text-primary hover:underline"
          >
            看原文
          </button>
        ) : anchor ? (
          <Link to={anchor} className="shrink-0 text-[10px] text-primary hover:underline">看原文</Link>
        ) : (
          // 原文献被删了: 依据本身还在(摘录就是当初的原文), 但没有可跳的地方
          <span className="shrink-0 text-[10px] text-muted-foreground">原文已下线</span>
        )}
      </div>

      {open && (
        <div className="space-y-1 border-t border-primary/10 px-1.5 py-1">
          {item.label && <p className="text-[10px] text-muted-foreground">{item.label}</p>}
          {item.note && (
            <p className="text-[10px] leading-relaxed text-foreground/80">依据说明：{item.note}</p>
          )}
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {item.snippet || '（这条依据没有摘录，点「看原文」核对）'}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * 一道真题: 收起来只露"年份 + 题型 + 题干", 展开才是完整的一道题(题干 / 选项 / 答案 / 解析)。
 *
 * 默认收起是必须的 —— 一条解读可能挂着五六年的同类题, 全展开会把解读正文挤得看不见;
 * 但答案与解析也不能藏第二次(要再点一层), 那样读者宁可直接去题库。
 */
function QuestionRow({ link }: { link: KpQuestionLink }) {
  const [open, setOpen] = useState(false)
  const q = link.question
  if (!q) return null

  const badge = yearBadge(q)
  const answer = answerText(q)
  const explanation = explanationOf(q)
  const correct = correctOptionIndexes(q)

  return (
    <div className="rounded-md border border-amber-400/25 bg-background/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-1.5 py-1 text-left"
      >
        {badge && (
          <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {badge}
          </span>
        )}
        <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
          {questionTypeLabel(q.questionType)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px]">{questionStem(q.questionText, 64)}</span>
        <ChevronRight className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-amber-400/20 px-1.5 py-1.5">
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed">{q.questionText}</p>

          {q.options.length > 0 && (
            <ul className="space-y-0.5">
              {q.options.map((opt, oi) => (
                <li
                  key={oi}
                  className={cn(
                    'flex gap-1 text-[11px] leading-relaxed',
                    correct?.includes(oi) && 'font-medium text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  <span className="shrink-0 tabular-nums">{OPTION_LABELS[oi] ?? oi}.</span>
                  <span className="min-w-0 whitespace-pre-wrap">{opt}</span>
                </li>
              ))}
            </ul>
          )}

          {answer && (
            <p className="text-[11px]">
              <span className="text-muted-foreground">正确答案：</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{answer}</span>
            </p>
          )}

          {link.note && (
            <p className="text-[10px] leading-relaxed text-foreground/80">考点提示：{link.note}</p>
          )}

          {explanation && (
            <div className="rounded border bg-muted/20 p-1.5">
              <p className="pb-0.5 text-[10px] text-muted-foreground">解析</p>
              <MarkdownRenderer content={explanation} className="text-[11px]" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function KpExplanationContent({ subject, kp, onOpenRef }: Props) {
  /**
   * 正文、依据、真题**按 (学科, 知识点) 打 key** 一起存。
   *
   * 换一条解读时旧数据自动失效(派生值), 于是"还在加载"就等于 loaded 为 null ——
   * 不需要在 effect 里同步 setState 去清空: 那会多渲染一轮, 而且清理与拉取之间会先闪出
   * 上一条解读的内容。
   */
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    if (!subject || !kp) return
    let cancelled = false
    void (async () => {
      const loadContent = async (): Promise<string> => {
        try {
          const { data } = await supabase
            .from('kp_explanations')
            .select('content')
            .eq('subject', subject)
            .eq('kp', kp)
            .maybeSingle()
          return (data?.content as string | undefined) ?? ''
        } catch {
          return ''
        }
      }
      // 三路并行: 依据或真题拉不到就只是少一块, 不该把解读正文一起变成空白
      const [content, refs, questions] = await Promise.all([
        loadContent(),
        listKpRefs(subject, kp).catch(() => [] as KpResourceRef[]),
        listKpQuestions(subject, kp).catch(() => [] as KpQuestionLink[]),
      ])
      if (!cancelled) setLoaded({ key: `${subject}\u0000${kp}`, content, refs, questions })
    })()
    return () => { cancelled = true }
  }, [subject, kp])

  const view = loaded && loaded.key === `${subject}\u0000${kp}` ? loaded : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {view && view.content.length > 0 && (
        <div className="-mt-2 flex shrink-0 justify-end">
          <ReadAloudButton
            id={`kp:${subject}:${kp}`}
            build={() => ({ prompt: [], answer: splitForSpeech(markdownToSpeech(view.content)) })}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!view ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : view.content.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">该知识点暂未配置解读内容</p>
        ) : (
          <MarkdownRenderer content={view.content} />
        )}

        {view && view.refs.length > 0 && (
          <div className="mt-3 space-y-1 rounded-lg border border-primary/15 bg-primary/[0.04] p-2">
            <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Library className="h-2.5 w-2.5" />
              依据原文（{view.refs.length}）· 点开核对
            </p>
            {view.refs.map((item) => <RefRow key={item.id} item={item} onOpenRef={onOpenRef} />)}
          </div>
        )}

        {view && view.questions.length > 0 && (
          <div className="mt-2 space-y-1 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-2">
            <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Library className="h-2.5 w-2.5" />
              历年真题（{view.questions.length}）· 点开看题与解析
            </p>
            {view.questions.map((item) => <QuestionRow key={item.id} link={item} />)}
          </div>
        )}

        {/* 反向那条边: 学员自己在这条解读上挂过的题(见 components/questions/LinkedQuestions) */}
        <div className="mt-2">
          <LinkedQuestions source="kp" sourceId={kpSourceId(subject, kp)} title="关联题目" />
        </div>
      </div>
    </div>
  )
}
