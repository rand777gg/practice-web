import { useCallback, useState } from 'react'
import { logError, userMessage } from '@/services/errors'
import {
  createQuestionBankPaper,
  deleteQuestionBankPaper,
  listQuestionBankPapers,
  regenerateQuestionBankPaper,
} from '@/services/questions'
import { useAuthStore } from '@/stores/auth-store'
import { composeExamIds } from '@/lib/exam-compose'
import {
  defaultPaperName,
  scopeCategoriesOf,
  scopeFromPaper,
  scopeKeyPointsOf,
  type BankPaperScope,
} from '@/lib/bank-papers'
import type { ExamComposeStat, ExamTemplate, QuestionBankPaper } from '@/types'

export interface GeneratePaperInput extends BankPaperScope {
  bankId: string
  template: ExamTemplate
  /** 留空则按范围自动起名 */
  name?: string
  durationMin?: number
}

export interface GeneratePaperResult {
  ok: boolean
  paper: QuestionBankPaper | null
  /** 各分区实抽题数, 供"题库不足"提示 */
  stats: ExamComposeStat[]
  error?: string
}

export function useBankPapers(bankId: string) {
  const user = useAuthStore((s) => s.user)
  const [papers, setPapers] = useState<QuestionBankPaper[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!bankId) return
    setIsLoading(true)
    try {
      setPapers(await listQuestionBankPapers(bankId))
    } catch (e) {
      logError('useBankPapers.load', e)
      setPapers([])
    } finally {
      setIsLoading(false)
    }
  }, [bankId])

  /** 按范围+模板组一份新卷并落库(题单冻结) */
  const generate = useCallback(
    async (input: GeneratePaperInput): Promise<GeneratePaperResult> => {
      if (!user) return { ok: false, paper: null, stats: [], error: '未登录' }
      const tpl = input.template
      const composed = await composeExamIds({
        template: tpl,
        questionCount: 0,
        sampleMode: tpl.sample_mode,
        bankId: input.bankId,
        scopeCategories: scopeCategoriesOf(input),
        keyPoints: scopeKeyPointsOf(input),
      }).catch((e: Error) => ({ questionIds: [] as string[], stats: [] as ExamComposeStat[], error: e.message }))

      if (composed.questionIds.length === 0) {
        return { ok: false, paper: null, stats: composed.stats, error: 'error' in composed ? composed.error : undefined }
      }

      try {
        const paper = await createQuestionBankPaper({
          bankId: input.bankId,
          createdBy: user.id,
          name: (input.name ?? '').trim() || defaultPaperName(input),
          kind: input.kind,
          scopeType: input.scopeType,
          year: input.year,
          scopeValues: input.values,
          subject: tpl.subject?.length ? tpl.subject : null,
          durationMin: input.durationMin ?? tpl.duration_min ?? 60,
          template: tpl,
          questionIds: composed.questionIds,
        })
        setPapers((prev) => [...prev, paper])
        return { ok: true, paper, stats: composed.stats }
      } catch (e) {
        logError('useBankPapers.generate', e)
        return { ok: false, paper: null, stats: composed.stats, error: userMessage(e) }
      }
    },
    [user],
  )

  /** 重新组卷: 同范围同模板重抽一次, 覆盖题单 */
  const regenerate = useCallback(
    async (paper: QuestionBankPaper): Promise<GeneratePaperResult> => {
      const scope = scopeFromPaper(paper)
      const tpl = paper.template
      const composed = await composeExamIds({
        template: tpl,
        questionCount: 0,
        sampleMode: tpl.sample_mode,
        bankId: paper.bank_id,
        scopeCategories: scopeCategoriesOf(scope),
        keyPoints: scopeKeyPointsOf(scope),
      }).catch((e: Error) => ({ questionIds: [] as string[], stats: [] as ExamComposeStat[], error: e.message }))

      if (composed.questionIds.length === 0) {
        return { ok: false, paper: null, stats: composed.stats, error: 'error' in composed ? composed.error : undefined }
      }

      try {
        const next = await regenerateQuestionBankPaper(paper.id, composed.questionIds)
        setPapers((prev) => prev.map((p) => (p.id === paper.id ? next : p)))
        return { ok: true, paper: next, stats: composed.stats }
      } catch (e) {
        logError('useBankPapers.regenerate', e)
        return { ok: false, paper: null, stats: composed.stats, error: userMessage(e) }
      }
    },
    [],
  )

  const remove = useCallback(async (id: string) => {
    try {
      await deleteQuestionBankPaper(id)
    } catch (e) {
      logError('useBankPapers.remove', e)
    }
    setPapers((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { papers, isLoading, load, generate, regenerate, remove }
}
