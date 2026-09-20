/**
 * 免登录的临时预览：把「考试模式答题卡视图」用一份合成的英语（一）卷面跑起来。
 *
 * 考试模式的真会话要登录、库里还得有英语一的题，端到端不好测；这个页面只喂
 * 合成的 sections + answers，专门用来看涂卡落点对不对。
 * 涂法是「每题涂不同选项」：完形/阅读取 (题号-1)%4，Part B 五个位置故意选不同字母，
 * 这样一旦列号算错（比如拿下标当列号）立刻能看出来。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { ExamAnswerCardView } from '@/components/exam/ExamAnswerCardView'
import { buildNumberMap, matchEnglishCard } from '@/lib/exam-answer-sheet'
import { withSlotValue } from '@/lib/exam-paper'
import type { CaseQuestion, CorrectAnswer, Question, QuestionType } from '@/types'

/** 卷面一条记录 = 一大题：多小题题型把小题挂在 case_questions 上，小题 id 就是卷面题号 */
const record = (id: string, type: QuestionType, from: number, count: number, options: string[]): Question => ({
  id,
  question_type: type,
  question_text: '',
  options: [],
  correct_answer: null,
  category: null,
  categories: [],
  subject: '英语一',
  analysis: null,
  key_points: null,
  answer_explanation: null,
  seq_number: from,
  created_at: '',
  created_by: null,
  verified: true,
  import_mode: null,
  allow_unordered: false,
  unordered_blanks: null,
  source_page: null,
  case_questions: Array.from({ length: count }, (_, i): CaseQuestion => ({
    id: String(from + i),
    type: 'single_choice',
    text: `第 ${from + i} 题`,
    options,
    answer: 0,
  })),
})

/** 写作这类单条记录没有小题，整条记录只占卡上一格 */
const writingRecord = (id: string, no: number): Question => ({ ...record(id, 'writing', no, 0, []), seq_number: no })

/** Part B：选项文本自带字母前缀，且顺序故意打乱（卷面已给定 F/H/C） */
const PART_B_LETTERS = ['E', 'G', 'A', 'B', 'D']
const ABCD = ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁']

const paperSections = [
  { name: '完形', scorePerQuestion: 0.5, questions: [record('cloze', 'cloze', 1, 20, ABCD)] },
  {
    name: '阅读A',
    scorePerQuestion: 2,
    questions: [21, 26, 31, 36].map((from, i) => record(`read${i + 1}`, 'reading_set', from, 5, ABCD)),
  },
  { name: '新题型', scorePerQuestion: 2, questions: [record('order', 'sentence_order', 41, 5, PART_B_LETTERS.map((x) => `${x}. 段落 ${x}`))] },
  { name: '翻译', scorePerQuestion: 2, questions: [record('trans', 'translation', 46, 5, [])] },
  { name: '应用文', scorePerQuestion: 10, questions: [writingRecord('writingA', 51)] },
  { name: '短文写作', scorePerQuestion: 20, questions: [writingRecord('writingB', 52)] },
]

/** 合成卷面 → 绑卡 → 造作答。都是静态数据，放模块作用域，组件里不用再 memo */
const binding = matchEnglishCard(paperSections)
const numberMap = binding ? buildNumberMap(paperSections, binding) : null
const answers = new Map<string, CorrectAnswer>()
if (numberMap) {
  // 完形 + 阅读 Part A：每题涂 (题号-1)%4，四个列轮流出现
  for (let no = 1; no <= 40; no++) {
    const slot = numberMap.slotByNo.get(no)
    if (slot) answers.set(slot.questionId, withSlotValue(answers.get(slot.questionId), slot.subId, (no - 1) % 4))
  }
  // Part B：5 个位置分别选 E / G / A / B / D → 卡上应为第 5 / 7 / 1 / 2 / 4 列
  for (let i = 0; i < 5; i++) {
    const slot = numberMap.slotByNo.get(41 + i)
    if (slot) answers.set(slot.questionId, withSlotValue(answers.get(slot.questionId), slot.subId, i))
  }
}

const probe = [
  ...Array.from({ length: 4 }, (_, i) => `第 ${i + 1} 题 → 第 ${(i % 4) + 1} 列`),
  ...['E', 'G', 'A', 'B', 'D'].map((l, i) => `第 ${41 + i} 题 选 ${l} → 第 ${l.charCodeAt(0) - 64} 列`),
]

const view = !binding || !numberMap
  ? <p style={{ padding: 16 }}>没认出英语（一）答题卡</p>
  : (
    <div style={{ padding: 16 }}>
      <p style={{ font: '12px/1.7 system-ui', marginBottom: 12, color: '#92400e', background: '#fef3c7', padding: '8px 12px', border: '1px solid #fcd34d' }}>
        <b>临时预览（免登录）</b> · 合成英语（一）卷面 20/20/5/5/1/1 → 考试模式答题卡视图。
        预期落点：{probe.join('；')}
      </p>
      <ExamAnswerCardView
        binding={binding}
        numberMap={numberMap}
        answers={answers}
        institution="重庆大学"
        candidateName="张三丰"
        candidateNo="106112026010001"
      />
    </div>
  )

createRoot(document.getElementById('root')!).render(<StrictMode>{view}</StrictMode>)
