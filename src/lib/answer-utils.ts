import type { CorrectAnswer, QuestionType } from '@/types'

export function isAnswerCorrect(
  selected: CorrectAnswer | null | undefined,
  correct: CorrectAnswer | null | undefined,
  questionType: QuestionType,
  allowUnordered?: boolean,
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
      }
      return selArr.every((s, i) => s === corArr[i])
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
  }
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
  }
}
