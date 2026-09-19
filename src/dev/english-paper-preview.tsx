/**
 * 免登录预览 + 验收：英语（一）真题卷面渲染。
 *
 * 用**合成数据**（短假文）而不是真题全文：排版该验的东西（Times New Roman、
 * 挖空带题号、选项挨排、文章/题目分页、顺序骨架、翻译下划线、canvas 图表）都能验到，
 * 又不用把真题全文烤进公开仓库。
 */
import { createRoot } from 'react-dom/client'
import { StrictMode, useState } from 'react'
import '@/index.css'
import { EnglishRealPaper } from '@/components/exam/EnglishRealPaper'
import type { EnglishPaperLayout } from '@/lib/english-paper-layout'

const LOREM = 'Advances in artificial intelligence are rapidly changing every aspect of human life. The world of AI is buzzing with an exciting potential to improve and enrich our lives, yet it also carries hazards we may find hard to control. One such question is how we understand and experience beauty in a world shaped by machines. '

const layout: EnglishPaperLayout = {
  title: '2026 年全国硕士研究生招生考试英语（一）',
  warnings: [],
  sections: {
    cloze: {
      ordinal: 'Section I',
      title: 'Use of English',
      directions: 'Read the following text. Choose the best word(s) for each numbered blank and mark A, B, C or D on the ANSWER SHEET. (10 points)',
      passage: `${LOREM}[[1]] , AI also has the potential hazard of [[2]] our experiences. One such [[3]] is how we understand beauty. [[4]] human creativity and AI algorithms can lead to unique outcomes.`,
      blanks: Array.from({ length: 4 }, (_, i) => ({
        no: i + 1,
        options: [`option-a-${i + 1}`, `option-b-${i + 1}`, `option-c-${i + 1}`, `option-d-${i + 1}`],
      })),
    },
    reading: {
      head: {
        ordinal: 'Section II Part A',
        title: 'Reading Comprehension',
        directions: 'Read the following four texts. Answer the questions below each text by choosing A, B, C or D. Mark your answers on the ANSWER SHEET. (40 points)',
      },
      texts: [
        {
          no: 1,
          heading: 'Text 1',
          passage: `${LOREM}${LOREM}`,
          questions: Array.from({ length: 2 }, (_, i) => ({
            no: 21 + i,
            stem: `What can be learned about the subject from Paragraph ${i + 1}?`,
            options: ['first option text here', 'second option text here', 'third option text here', 'fourth option text here'],
          })),
        },
      ],
    },
    partB: {
      ordinal: 'Section II Part B',
      title: 'Reading Comprehension Part B',
      directions: 'The following paragraphs are given in a wrong order. For questions 41-45, you are required to reorganize these paragraphs into a coherent text by choosing from the list A-H and filling them into the numbered boxes. Paragraphs F, H, and C have been correctly placed. Mark your answers on the ANSWER SHEET. (10 points)',
      paragraphs: ['A', 'B', 'D', 'E', 'G'].map((l) => ({ letter: l, text: `Paragraph ${l} body text goes here, a couple of lines long so the layout is visible.` })),
      placed: ['F', 'H', 'C'],
      skeleton: ['F', 41, 42, 'H', 43, 'C', 44, 45],
      questions: Array.from({ length: 5 }, (_, i) => ({ no: 41 + i, options: ['A', 'B', 'D', 'E', 'G'].map((l) => `段落 ${l}`) })),
    },
    partC: {
      ordinal: 'Section II Part C',
      title: 'Reading Comprehension Part C',
      directions: 'Read the following text carefully and then translate the underlined segments into Chinese. Write your answers on the ANSWER SHEET. (10 points)',
      passage: `${LOREM}(46) Tracing the history of the term, we can see how the definition has shifted over time. ${LOREM}(47) A return to that version of literacy seems like something society today desperately needs. ${LOREM}`,
      segments: [
        { no: 46, sentence: 'Tracing the history of the term, we can see how the definition has shifted over time.' },
        { no: 47, sentence: 'A return to that version of literacy seems like something society today desperately needs.' },
      ],
    },
    writingA: {
      ordinal: 'Section III Part A',
      title: 'Writing Part A',
      directions: 'Read the following email from your friend Paul and write him a reply. You should write about 100 words on the ANSWER SHEET. Do not use your own name in the email; use "Li Ming" instead. (10 points)',
      letterBox: 'Hi Li Ming, I was really moved by the letters you posted yesterday. They are priceless! Could you tell me a bit more about them? Thanks. Yours, Paul',
    },
    writingB: {
      ordinal: 'Section III Part B',
      title: 'Writing Part B',
      directions: 'Write an essay based on the charts below. In your essay, you should 1) describe the charts briefly, 2) interpret the charts, and 3) give your comments, Write your answer in 160-200 words on the ANSWER SHEET. (20 points)',
      charts: [
        { kind: 'pie', items: [{ label: '不接受', value: 27.9 }, { label: '部分接受', value: 32.8 }, { label: '完全接受', value: 39.3 }] },
        { kind: 'bar', items: [{ label: '安全', value: 46.3 }, { label: '价格', value: 24.9 }, { label: '便利', value: 10.7 }] },
      ],
      chartCaption: '一项关于养老机器人的消费者接受度和首要关注点的调查',
    },
  },
}

/** 题号 → questionId 的映射，跟线上一致：完形是 1–20 条独立记录，阅读每篇 5 条 */
const questionIdByNo = new Map<number, string>()
for (let no = 1; no <= 45; no++) questionIdByNo.set(no, `q${no}`)
questionIdByNo.set(51, 'q51')
questionIdByNo.set(52, 'q52')

function Harness() {
  const [picked] = useState(() => new Map<string, number>([['q1', 0], ['q2', 2], ['q21', 1]]))
  const [texts] = useState(() => new Map<string, string>([['q46', '这是一句示例译文。']]))

  return (
    <div style={{ padding: 16, background: '#e5e5e5' }}>
      <p style={{ font: '12px/1.7 system-ui', marginBottom: 12, color: '#92400e', background: '#fef3c7', padding: '8px 12px', border: '1px solid #fcd34d' }}>
        <b>临时预览（免登录）</b> · 英语（一）真题卷面渲染，合成数据。<br />
        预期：Times New Roman · 完形整篇一题、挖空处显示题号（1 已作答显示 A）· 选项挨着排 ·
        阅读文章一页/题目另起一页 · Part B 顺序骨架（41→B）· 翻译下划线带号 · 写作两题 canvas 图表
      </p>
      <EnglishRealPaper
        layout={layout}
        questionIdByNo={questionIdByNo}
        pickedByQuestion={picked}
        textByQuestion={texts}
        onPick={() => {}}
        onText={() => {}}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
