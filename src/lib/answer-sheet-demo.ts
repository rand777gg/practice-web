/**
 * 答题卡模板 DEMO 数据。
 * 与「考试模板」（管试卷本身怎么排版）不同，答题卡模板只描述学生作答区域：
 * 客观题涂卡格、主观题答题行的规格。
 */

export type AnswerSheetKind = 'objective' | 'subjective' | 'mixed'

export interface AnswerSheetTemplate {
  id: string
  name: string
  description: string
  kind: AnswerSheetKind
  paperSize: 'A4' | 'A3'
  /** 客观题题量，0 表示无涂卡区 */
  objectiveCount: number
  /** 每题选项数 */
  optionCount: number
  /** 涂卡区分栏数 */
  columns: number
  /** 主观题题量，0 表示无主观区 */
  subjectiveCount: number
  /** 主观题每题答题行数 */
  linesPerQuestion: number
  includesHeader: boolean
  includesSeatInfo: boolean
  includesScoreBox: boolean
  builtin: boolean
}

export const KIND_LABEL: Record<AnswerSheetKind, string> = {
  objective: '纯客观',
  subjective: '纯主观',
  mixed: '主客观混合',
}

export const ANSWER_SHEET_TEMPLATES: AnswerSheetTemplate[] = [
  {
    id: 'sheet-std-100',
    name: '标准客观题卡 · 100 题',
    description: 'A4 单面，4 选项 × 100 题，四栏排列。适用于计算机统考选择题部分的模拟演练。',
    kind: 'objective',
    paperSize: 'A4',
    objectiveCount: 100,
    optionCount: 4,
    columns: 4,
    subjectiveCount: 0,
    linesPerQuestion: 0,
    includesHeader: true,
    includesSeatInfo: true,
    includesScoreBox: false,
    builtin: true,
  },
  {
    id: 'sheet-mixed-60-4',
    name: '主客观混合卡 · 60 + 4',
    description: 'A4 双面：正面 60 题涂卡区，背面 4 道综合应用大题，每题 8 行。贴近 408 真实卷面结构。',
    kind: 'mixed',
    paperSize: 'A4',
    objectiveCount: 60,
    optionCount: 4,
    columns: 3,
    subjectiveCount: 4,
    linesPerQuestion: 8,
    includesHeader: true,
    includesSeatInfo: true,
    includesScoreBox: true,
    builtin: true,
  },
  {
    id: 'sheet-subjective-6',
    name: '主观题答题卡 · 6 题',
    description: 'A4 单面，只要大题作答区，每题 10 行并带得分框，适合自命题院校的专业课卷。',
    kind: 'subjective',
    paperSize: 'A4',
    objectiveCount: 0,
    optionCount: 0,
    columns: 1,
    subjectiveCount: 6,
    linesPerQuestion: 10,
    includesHeader: true,
    includesSeatInfo: false,
    includesScoreBox: true,
    builtin: true,
  },
  {
    id: 'sheet-large-50',
    name: '大字号客观题卡 · 50 题',
    description: 'A3 单面，5 选项 × 50 题，涂卡格加大一倍，适合打印后反复擦写练习。',
    kind: 'objective',
    paperSize: 'A3',
    objectiveCount: 50,
    optionCount: 5,
    columns: 4,
    subjectiveCount: 0,
    linesPerQuestion: 0,
    includesHeader: true,
    includesSeatInfo: true,
    includesScoreBox: false,
    builtin: true,
  },
]

export function answerSheetById(id: string): AnswerSheetTemplate {
  return ANSWER_SHEET_TEMPLATES.find((item) => item.id === id) ?? ANSWER_SHEET_TEMPLATES[0]
}
