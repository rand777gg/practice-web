/**
 * 试卷渲染纯函数/常量 (paper-view-core): 无组件、无 hook, 供 PaperPreview /
 * PaperSpreadView / paper-view-parts 共享 —— 与组件文件分离以兼容 fast-refresh。
 */
import type { CodingAnswer, CorrectAnswer } from '@/types'

/** 单题批改结果; isCorrect 为 null 表示该题无法自动批改(如分析题) */
export interface PaperGrade {
  isCorrect: boolean | null
  correctAnswer: CorrectAnswer
  explanation?: string | null
  /**
   * 案例分析题按小题计分的明细(答对小题数/总小题数)。
   * 存在时, 卷面题号徽标与「得分 x/y」抬头均按小题口径展示, 而非整题对错。
   */
  partial?: { correct: number; total: number } | null
}

export const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']

export const DASH = '—'

export function blankCount(text: string): number {
  return (text.match(/_{2,}/g) || []).length || 1
}

export function isBlankAnswer(a: CorrectAnswer | null | undefined): boolean {
  if (a === null || a === undefined) return true
  if (typeof a === 'string') return a.trim() === ''
  if (Array.isArray(a)) return a.length === 0
  if (typeof a === 'object') {
    if ('subs' in (a as object)) return false
    return !(a as CodingAnswer).code?.trim()
  }
  return false
}

/** 选项批改状态: 正确选项 / 用户错选 / 其它 */
export function optionMark(
  correct: CorrectAnswer,
  index: number,
  checked: boolean,
  isMulti: boolean,
): 'correct' | 'wrong' | null {
  const correctSet = isMulti
    ? Array.isArray(correct)
      ? (correct as number[])
      : []
    : typeof correct === 'number'
      ? [correct]
      : []
  if (correctSet.includes(index)) return 'correct'
  return checked ? 'wrong' : null
}
