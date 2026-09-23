import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { normalizeTemplate } from '@/stores/exam-template-store'
import { composeExamIds } from '@/lib/exam-compose'
import {
  defaultPaperName,
  scopeCategoriesOf,
  scopeFromPaper,
  scopeKeyPointsOf,
  type BankPaperScope,
} from '@/lib/bank-papers'
import type { ExamComposeStat, ExamTemplate, QuestionBankPaper } from '@/types'

function rowToPaper(row: Record<string, unknown>): QuestionBankPaper {
  return {
    id: String(row.id),
    bank_id: String(row.bank_id),
    created_by: String(row.created_by),
    name: String(row.name ?? ''),
    kind: row.kind === 'real' ? 'real' : 'mock',
    scope_type:
      row.scope_type === 'year' || row.scope_type === 'chapter' || row.scope_type === 'key_point'
        ? row.scope_type
        : 'comprehensive',
    year: row.year == null ? null : Number(row.year),
    scope_values: Array.isArray(row.scope_values)
      ? (row.scope_values as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
    subject: Array.isArray(row.subject) ? (row.subject as string[]) : null,
    duration_min: Math.max(1, Math.min(600, Number(row.duration_min) || 60)),
    template: normalizeTemplate((row.template ?? {}) as Record<string, unknown>),
    question_ids: Array.isArray(row.question_ids)
      ? (row.question_ids as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
    generated_at: String(row.generated_at ?? ''),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  }
}

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
    const { data } = await supabase
      .from('question_bank_papers')
      .select('*')
      .eq('bank_id', bankId)
      .order('kind', { ascending: true })
      .order('year', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
    setPapers((data ?? []).map((r) => rowToPaper(r as Record<string, unknown>)))
    setIsLoading(false)
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

      const { data, error } = await supabase
        .from('question_bank_papers')
        .insert({
          bank_id: input.bankId,
          created_by: user.id,
          name: (input.name ?? '').trim() || defaultPaperName(input),
          kind: input.kind,
          scope_type: input.scopeType,
          year: input.scopeType === 'year' ? input.year : null,
          scope_values: input.values,
          subject: tpl.subject?.length ? tpl.subject : null,
          duration_min: input.durationMin ?? tpl.duration_min ?? 60,
          template: JSON.parse(JSON.stringify(tpl)) as Record<string, unknown>,
          question_ids: composed.questionIds,
          generated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error || !data) return { ok: false, paper: null, stats: composed.stats, error: error?.message }

      const paper = rowToPaper(data as Record<string, unknown>)
      setPapers((prev) => [...prev, paper])
      return { ok: true, paper, stats: composed.stats }
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

      const { data, error } = await supabase
        .from('question_bank_papers')
        .update({
          question_ids: composed.questionIds,
          generated_at: new Date().toISOString(),
        })
        .eq('id', paper.id)
        .select()
        .single()

      if (error || !data) return { ok: false, paper: null, stats: composed.stats, error: error?.message }

      const next = rowToPaper(data as Record<string, unknown>)
      setPapers((prev) => prev.map((p) => (p.id === paper.id ? next : p)))
      return { ok: true, paper: next, stats: composed.stats }
    },
    [],
  )

  const remove = useCallback(async (id: string) => {
    await supabase.from('question_bank_papers').delete().eq('id', id)
    setPapers((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { papers, isLoading, load, generate, regenerate, remove }
}
