import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, PlayCircle, RotateCcw, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { useLearningRouteDetail } from '@/hooks/use-learning-routes'
import { useUserAnswers } from '@/hooks/use-user-answers'
import { useRefreshStore } from '@/stores/refresh-store'
import { isAnswerCorrect } from '@/lib/answer-utils'
import type { CorrectAnswer, Question } from '@/types'

interface Item {
  stageId: string
  stageTitle: string
  question: Question
}

function buildItems(detail: { stages: { id: string; title: string; questions: Question[] }[] }, stageId?: string): Item[] {
  const out: Item[] = []
  for (const s of detail.stages) {
    if (stageId && s.id !== stageId) continue
    for (const q of s.questions) out.push({ stageId: s.id, stageTitle: s.title || '阶段', question: q })
  }
  return out
}

export function Component() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { detail, isLoading } = useLearningRouteDetail(routeId)
  const { saveAnswer } = useUserAnswers()
  const bumpRefresh = useRefreshStore((s) => s.bump)

  const paramKey = `${searchParams.get('stage') ?? ''}|${searchParams.get('start') ?? ''}`
  const stageId = searchParams.get('stage') ?? undefined
  const startId = searchParams.get('start') ?? undefined

  const items = useMemo(() => (detail ? buildItems(detail, stageId) : []), [detail, stageId])

  const [idx, setIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<CorrectAnswer | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [run, setRun] = useState<Record<string, boolean>>({}) // questionId -> correct

  // 路由/参数变化后定位起点(默认阶段首题或 start 指定题)
  useEffect(() => {
    if (!detail || items.length === 0) return
    const at = startId ? items.findIndex(x => x.question.id === startId) : -1
    setIdx(at >= 0 ? at : 0)
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setFinished(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.route.id, paramKey])

  // 换题时重置作答态
  useEffect(() => {
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setFinished(false)
  }, [idx, detail?.route.id])

  const current: Item | undefined = items[idx]
  const hasPrev = idx > 0
  const hasNext = idx < items.length - 1

  const stageStartIndex = useMemo(() => {
    if (!stageId) return 0
    const i = items.findIndex(x => x.stageId === stageId)
    return i < 0 ? 0 : i
  }, [items, stageId])

  const stageEndIndex = useMemo(() => {
    if (!stageId) return items.length - 1
    let last = items.length - 1
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].stageId === stageId) { last = i; break }
    }
    return last
  }, [items, stageId])

  const goIndex = (next: number) => {
    if (next < 0 || next > items.length - 1) return
    setIdx(next)
  }

  const handleSelect = (answer: CorrectAnswer) => {
    if (isSubmitted) return
    setSelectedAnswer(answer)
  }

  const handleSubmit = async () => {
    if (!current || selectedAnswer === null) return
    const q = current.question
    const correct = isAnswerCorrect(selectedAnswer, q.correct_answer, q.question_type, q.allow_unordered, q.unordered_blanks, q.case_questions)
    await saveAnswer(q.id, selectedAnswer, correct, 'practice')
    setRun(prev => ({ ...prev, [q.id]: correct }))
    setIsSubmitted(true)
    bumpRefresh()
  }

  const handleNext = () => {
    if (!hasNext) {
      setFinished(true)
      return
    }
    goIndex(idx + 1)
  }

  const handleSkip = () => {
    if (isSubmitted) return
    handleNext()
  }

  const restart = () => {
    setRun({})
    setIdx(stageId ? stageStartIndex : 0)
    setSelectedAnswer(null)
    setIsSubmitted(false)
    setFinished(false)
  }

  const nextStageId = useMemo(() => {
    if (!stageId || !detail) return undefined
    const i = detail.stages.findIndex(s => s.id === stageId)
    return i >= 0 && i < detail.stages.length - 1 ? detail.stages[i + 1].id : undefined
  }, [stageId, detail])

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    )
  }

  if (!detail || items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card><CardContent className="p-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">该路线（阶段）暂无可练习的题目。</p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/learning-routes/${routeId}`)}>返回路线</Button>
        </CardContent></Card>
      </div>
    )
  }

  const curStagePos = current ? detail.stages.findIndex(s => s.id === current.stageId) : -1
  const stageTotal = stageEndIndex - stageStartIndex + 1
  const rel = idx - stageStartIndex + 1
  const answeredRun = Object.values(run).length
  const correctRun = Object.values(run).filter(Boolean).length

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(`/learning-routes/${routeId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {detail.route.title}
        </Button>
        {!finished && (
          <Button variant="ghost" size="sm" className="-ml-1 text-muted-foreground" onClick={() => setFinished(true)}>
            <Flag className="h-3.5 w-3.5 mr-1" />结束练习
          </Button>
        )}
      </div>

      {finished ? (
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
            <div>
              <p className="text-lg font-semibold">本次练习结束</p>
              <p className="text-sm text-muted-foreground mt-1">
                本次共作答 {answeredRun} 题，答对 {correctRun} 题
                {stageId && curStagePos >= 0 ? `（第 ${curStagePos + 1} 阶段）` : ''}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Button onClick={restart}><RotateCcw className="h-4 w-4 mr-1.5" />再练一遍</Button>
              {nextStageId && (
                <Button variant="outline" onClick={() => navigate(`/learning-routes/${routeId}/practice?stage=${nextStageId}`)}>
                  <PlayCircle className="h-4 w-4 mr-1.5" />练习下一阶段
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate(`/learning-routes/${routeId}`)}>返回路线</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {current && (
            <div className="rounded-xl border bg-card p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {curStagePos >= 0 && <>阶段 {curStagePos + 1}：{current.stageTitle}</>}
                </span>
                <span className="inline-flex items-center gap-1.5 ml-auto">
                  第 {rel} / {stageTotal} 题（路线内第 {idx + 1} / {items.length} 题）
                </span>
              </div>
              <Progress value={((idx + 1) / items.length) * 100} className="h-1" />
            </div>
          )}

          {current && (
            <Card>
              <CardContent className="p-4 lg:p-5">
                <QuestionCard
                  key={current.question.id}
                  question={current.question}
                  selectedAnswer={selectedAnswer}
                  showResult={isSubmitted}
                  onSelect={handleSelect}
                  disabled={isSubmitted}
                  allowLocalJudge
                />
                {current.question.question_type === 'analysis' && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">主观题不自动判分：提交即记为你已作答并计入进度。</p>
                )}
              </CardContent>
            </Card>
          )}

          {current && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => goIndex(idx - 1)}>上一题</Button>
              {!isSubmitted ? (
                <>
                  <Button variant="ghost" size="sm" onClick={handleSkip} title="跳过不记录">跳过此题</Button>
                  <Button size="sm" onClick={handleSubmit} disabled={selectedAnswer === null}>提交答案</Button>
                </>
              ) : (
                <Button size="sm" onClick={handleNext}>
                  {hasNext ? '下一题' : '完成练习'}
                </Button>
              )}
            </div>
          )}

          {current?.question.question_type === 'coding' && (
            <p className="text-xs text-muted-foreground">编程题请在编辑器中提交判题后再点「提交答案」记录结果。</p>
          )}
        </>
      )}
    </div>
  )
}
