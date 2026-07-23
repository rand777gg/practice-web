import type { CorrectAnswer, QuestionType } from '@/types'

export function isAnswerCorrect(
  selected: CorrectAnswer | null | undefined,
  correct: CorrectAnswer | null | undefined,
  questionType: QuestionType,
  allowUnordered?: boolean,
  unorderedBlanks?: number[] | null,
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
    case 'coding': {
      const ca = selected as { allPassed?: boolean }
      return ca?.allPassed === true
    }
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
    case 'coding': return { code: '', language: 'javascript', allPassed: false }
  }
}
