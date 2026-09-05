import type { CaseAnswer, CaseQuestion, CorrectAnswer, Question, QuestionType } from '@/types'

export function isAnswerCorrect(
  selected: CorrectAnswer | null | undefined,
  correct: CorrectAnswer | null | undefined,
  questionType: QuestionType,
  allowUnordered?: boolean,
  unorderedBlanks?: number[] | null,
  /** case_analysis 的小题定义; 缺省时 case 题一律判错 */
  subs?: CaseQuestion[] | null,
): boolean {
  if (selected == null || correct == null) return false
  switch (questionType) {
    case 'single_choice':
      return selected === correct
    case 'multi_select': {
      const sel = selected as number[]
      const cor = correct as number[]
      if (!Array.isArray(sel) || !Array.isArray(cor)) return false
      if (sel.length !== cor.length) return false
      const corSet = new Set(cor)
      return sel.every(s => corSet.has(s))
    }
    case 'true_false':
      return Boolean(selected) === Boolean(correct)
    case 'fill_blank': {
      const selArr = Array.isArray(selected) ? selected.map(s => String(s).trim().toLowerCase()) : [String(selected).trim().toLowerCase()]
      const corArr = Array.isArray(correct) ? correct.map(c => String(c).trim().toLowerCase()) : [String(correct).trim().toLowerCase()]
      if (selArr.length !== corArr.length) return false
      if (allowUnordered) {
        selArr.sort()
        corArr.sort()
        return selArr.every((s, i) => {
          const alternatives = corArr[i].split(/[;；]/).map(a => a.trim()).filter(Boolean)
          return alternatives.some(a => s === a)
        })
      }
      if (unorderedBlanks && unorderedBlanks.length > 0) {
        const uSet = new Set(unorderedBlanks)
        // Check ordered positions
        for (let i = 0; i < corArr.length; i++) {
          if (uSet.has(i)) continue
          const alternatives = corArr[i].split(/[;；]/).map(a => a.trim()).filter(Boolean)
          if (!alternatives.some(a => selArr[i] === a)) return false
        }
        // Check unordered positions as sets
        const uSel = unorderedBlanks.map(i => selArr[i]).sort()
        const uCor = unorderedBlanks.map(i => corArr[i]).sort()
        return uSel.every((s, i) => {
          const alternatives = uCor[i].split(/[;；]/).map(a => a.trim()).filter(Boolean)
          return alternatives.some(a => s === a)
        })
      }
      return selArr.every((s, i) => {
        const alternatives = corArr[i].split(/[;；]/).map(a => a.trim()).filter(Boolean)
        return alternatives.some(a => s === a)
      })
    }
    case 'short_answer': {
      const userAnswer = String(selected).trim().toLowerCase()
      const acceptable = Array.isArray(correct) ? correct : [correct]
      return acceptable.some(a => userAnswer.includes(String(a).toLowerCase()))
    }
    case 'judge_correct':
      return selected === true ? correct === true : String(selected).trim().toLowerCase() === String(correct).trim().toLowerCase()
    case 'analysis':
      return false
    case 'case_analysis': {
      if (!subs || subs.length === 0) return false
      const results = caseSubResults(subs, selected)
      if (!results) return false
      return results.every(r => r.correct)
    }
    case 'coding': {
      const ca = selected as { allPassed?: boolean }
      return ca?.allPassed === true
    }
  }
}

/** 按小题逐一判分; 作答缺失或形状不对返回 null */
export function caseSubResults(
  subs: CaseQuestion[],
  selected: CorrectAnswer | null | undefined,
): { id: string; correct: boolean }[] | null {
  if (!Array.isArray(subs) || subs.length === 0) return null
  if (!selected || typeof selected !== 'object' || Array.isArray(selected) || !('subs' in (selected as object))) return null
  const values = new Map((selected as CaseAnswer).subs?.map(s => [s.id, s.value]) ?? [])
  return subs.map(sub => ({ id: sub.id, correct: isAnswerCorrect(values.get(sub.id), sub.answer, sub.type) }))
}

/** 一道案例题答对的小题数 / 小题总数 (小题粒度计分用) */
export function caseScore(
  subs: CaseQuestion[],
  selected: CorrectAnswer | null | undefined,
): { correct: number; total: number } {
  const results = caseSubResults(subs, selected)
  const total = Array.isArray(subs) ? subs.length : 0
  if (!results) return { correct: 0, total }
  return { correct: results.filter(r => r.correct).length, total }
}

/** 该题按「小题」展开后的计题数: 案例分析题 = 小题数, 其余 = 1 */
export function questionItemCount(q: Pick<Question, 'question_type' | 'case_questions'>): number {
  if (q.question_type === 'case_analysis') {
    const n = q.case_questions?.length ?? 0
    return Math.max(1, n)
  }
  return 1
}

/** 该题答对的小题数: 案例分析题 = 答对的小题数(可部分计分), 其余 = 全对 1 / 0 */
export function questionCorrectItemCount(q: Question, selected: CorrectAnswer | null | undefined): number {
  if (q.question_type === 'case_analysis') {
    return caseScore(q.case_questions ?? [], selected).correct
  }
  return isAnswerCorrect(selected, q.correct_answer, q.question_type, q.allow_unordered, q.unordered_blanks, q.case_questions)
    ? 1
    : 0
}

export function getDefaultAnswer(type: QuestionType): CorrectAnswer {
  switch (type) {
    case 'single_choice': return 0
    case 'multi_select': return []
    case 'true_false': return true
    case 'judge_correct': return true
    case 'fill_blank': return [] as string[]
    case 'short_answer': return ''
    case 'analysis': return null
    case 'case_analysis': return { subs: [] } as CaseAnswer
    case 'coding': return { code: '', language: 'javascript', allPassed: false }
  }
}
