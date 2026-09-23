import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { PaperPreview } from '@/components/exam/PaperPreview'
import { buildPaperSections, fetchQuestionsByIds } from '@/lib/exam-compose'
import { sessionItemCount } from '@/lib/answer-utils'
import { paperScopeLabel } from '@/lib/bank-papers'
import type { Question, QuestionBankPaper } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  paper: QuestionBankPaper | null
}

/** 套卷的卷面预览: 按冻结的题单和模板快照还原整张卷 */
export function PaperPreviewDialog({ open, onOpenChange, paper }: Props) {
  const [loaded, setLoaded] = useState<{ key: string; questions: Question[] } | null>(null)

  // 用「载入的卷 id」和当前卷对比, 而不是在 effect 里同步清空 state
  const paperKey = open && paper ? paper.id : ''

  useEffect(() => {
    if (!paperKey || !paper) return
    let cancelled = false
    fetchQuestionsByIds(paper.question_ids)
      .then((qs) => { if (!cancelled) setLoaded({ key: paperKey, questions: qs }) })
      .catch(() => { if (!cancelled) setLoaded({ key: paperKey, questions: [] }) })
    return () => { cancelled = true }
  }, [paperKey, paper])

  const questions = loaded && loaded.key === paperKey ? loaded.questions : null

  const sections = useMemo(
    () => (questions && paper ? buildPaperSections(questions, paper.template) : []),
    [questions, paper],
  )

  const meta = paper
    ? [
        paperScopeLabel(paper),
        paper.subject?.length ? paper.subject.join('、') : '',
        `${paper.question_ids.length} 题`,
        `${paper.duration_min} 分钟`,
      ].filter(Boolean).join(' · ')
    : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1200px] gap-2 p-4">
        <DialogHeader>
          <DialogTitle className="text-base">{paper?.name ?? '套卷预览'}</DialogTitle>
          <DialogDescription className="text-xs">{meta}</DialogDescription>
        </DialogHeader>

        {questions === null ? (
          <div className="space-y-3 py-4">
            <Skeleton className="mx-auto h-[520px] w-full max-w-[820px] rounded-lg" />
          </div>
        ) : questions.length === 0 ? (
          <div className="flex h-[50vh] items-center justify-center text-sm text-muted-foreground">
            这套卷里的题目已被删除，请重新组卷
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              共 {questions.length} 道大题 · {sessionItemCount(questions)} 个小题
              {paper && ` · 模板：${paper.template.name}`}
            </p>
            <div className="flex h-[72vh] min-h-[420px] w-full justify-center overflow-hidden rounded-md border bg-muted/20">
              <PaperPreview
                title={paper?.name ?? ''}
                meta={meta}
                sections={sections}
                answers={new Map()}
                readOnly
                layout="spread"
                cover={paper?.template.cover ?? null}
                paperLayout={paper?.template.layout ?? null}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
