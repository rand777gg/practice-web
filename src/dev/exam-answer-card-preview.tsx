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
import type { Question } from '@/types'

const mk4 = (n: number, prefix: string): Question[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    question_type: 'single_choice',
    options: ['A. 甲', 'B. 乙', 'C. 丙', 'D. 丁'],
  })) as unknown as Question[]

/** Part B：选项文本自带字母前缀，且顺序故意打乱 */
const PART_B_LETTERS = ['E', 'G', 'A', 'B', 'D']
const partB: Question[] = Array.from({ length: 5 }, (_, i) => ({
  id: `b${i + 1}`,
  question_type: 'single_choice',
  options: PART_B_LETTERS.map((x) => `${x}. 段落 ${x}`),
})) as unknown as Question[]

const subjective = (n: number, prefix: string): Question[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, question_type: 'short_answer', options: [] })) as unknown as Question[]

const paperSections = [
  { name: '完形', scorePerQuestion: 0.5, questions: mk4(20, 'c') },
  { name: '阅读A', scorePerQuestion: 2, questions: mk4(20, 'r') },
  { name: '新题型', scorePerQuestion: 2, questions: partB },
  { name: '翻译', scorePerQuestion: 2, questions: subjective(5, 't') },
  { name: '应用文', scorePerQuestion: 10, questions: subjective(1, 'w') },
  { name: '短文写作', scorePerQuestion: 20, questions: subjective(1, 'x') },
]

/** 合成卷面 → 绑卡 → 造作答。都是静态数据，放模块作用域，组件里不用再 memo */
const binding = matchEnglishCard(paperSections as never)
const numberMap = binding ? buildNumberMap(paperSections as never, binding) : null
const answers = new Map<string, number>()
if (numberMap) {
  // 完形 + 阅读 Part A：每题涂 (题号-1)%4，四个列轮流出现
  for (let no = 1; no <= 40; no++) {
    const id = numberMap.questionIdByNo.get(no)
    if (id) answers.set(id, (no - 1) % 4)
  }
  // Part B：5 个位置分别选 E / G / A / B / D → 卡上应为第 5 / 7 / 1 / 2 / 4 列
  for (let i = 0; i < 5; i++) {
    const id = numberMap.questionIdByNo.get(41 + i)
    if (id) answers.set(id, i)
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
