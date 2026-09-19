/**
 * 免登录预览 + 验收：主观题双模作答。
 *
 * 用 CDP 派发 `pointerType: 'pen'` 且带 force 的事件，把「压感控粗细」这条路径真跑一遍
 * ——playwright 的 page.mouse 只会产生 pointerType: 'mouse'，测不到压感。
 */
import { createRoot } from 'react-dom/client'
import { StrictMode, useState } from 'react'
import '@/index.css'
import { SubjectiveAnswerInput } from '@/components/exam/SubjectiveAnswerInput'
import { WrittenGradingPanel } from '@/components/exam/WrittenGradingPanel'
import { EMPTY_WRITTEN, estimateWordCount, inkPointCount, inkToPng, type WrittenAnswer } from '@/lib/written-answer'
import { parseGradingResult } from '@/lib/written-grading'

/** 造假返回，覆盖面板的四种状态：未评 / 评分中 / 失败 / 成功 */
const fakeSmall = parseGradingResult(JSON.stringify({
  total: 7,
  band: '第四档',
  dimensions: [
    { name: '内容要点', score: 3, max: 3, comment: '三点要求都覆盖了，回信目的清楚' },
    { name: '语言准确', score: 2, max: 4, comment: '时态混用较多，有三四处主谓不一致' },
    { name: '篇章衔接', score: 2, max: 3, comment: '衔接词偏少，句子靠堆叠' },
  ],
  overall: '格式完整、要点齐全，是一封合格的回信。主要问题在语言：一般过去时与现在完成时混用，建议先固定一个时间基准再展开。',
  confidence: 'medium',
}), 'writing_small', 'deepseek-chat')

const fakeTranslation = parseGradingResult(JSON.stringify({
  total: 6.5,
  band: '基本到位',
  dimensions: [
    { name: '理解准确', score: 4, max: 5, comment: '整体意思抓对，第 47 句的限定关系译反了' },
    { name: '表达通顺', score: 2.5, max: 5, comment: '译文偏直译，长句没有拆分' },
  ],
  sentenceNotes: [
    { ref: '46', student: '追踪这一术语的历史…', suggestion: '追溯该术语的历史…', note: '「追踪/追溯」都可，给满分' },
    { ref: '47', student: '…在确定目标时搅浑了水', suggestion: '…使得科学教育的目标更难界定', note: 'muddying the waters 是「使难以判断」，不是「搅浑水」，扣理解分' },
  ],
  overall: '五句里四句基本到位，第 47 句的习语理解偏了是主要失分点。',
  confidence: 'high',
}), 'translation', 'deepseek-chat + qwen-plus')

const fakeFail = parseGradingResult('模型今天没返回 JSON', 'writing_large')

// 这个入口为了演示必须带状态，所以有一个组件；它不是热更新模块，忽略该规则
/* eslint-disable react-refresh/only-export-components */
function Harness() {
  const [a1, setA1] = useState<WrittenAnswer>(EMPTY_WRITTEN)
  const [a2, setA2] = useState<WrittenAnswer>({ ...EMPTY_WRITTEN, text: 'Hello, this is a typed answer.' })

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <p style={{ font: '12px/1.7 system-ui', marginBottom: 12, color: '#92400e', background: '#fef3c7', padding: '8px 12px', border: '1px solid #fcd34d' }}>
        <b>临时预览（免登录）</b> · 双模作答 + 建议分面板。<br />
        51 题：笔迹 {a1.ink.length} 笔 / {inkPointCount(a1)} 点 / 文字 {estimateWordCount(a1.text)} 词
      </p>

      <p style={{ font: '13px/1.6 system-ui', margin: '12px 0 6px' }}>51. 给朋友 Paul 回信（约 100 词）+ 建议分</p>
      <SubjectiveAnswerInput value={a1} onChange={setA1} minHeightMm={42} wordHint="100 词" placeholder="写回信…" />
      <div style={{ marginTop: 8 }}><WrittenGradingPanel result={fakeSmall} onRegrade={() => {}} /></div>

      <p style={{ font: '13px/1.6 system-ui', margin: '20px 0 6px' }}>52. 看图作文（160–200 词）</p>
      <SubjectiveAnswerInput value={a2} onChange={setA2} minHeightMm={56} wordHint="160–200 词" placeholder="写短文…" />

      <p style={{ font: '13px/1.6 system-ui', margin: '20px 0 6px' }}>46–50 翻译：三种面板状态</p>
      <WrittenGradingPanel result={fakeTranslation} onRegrade={() => {}} />
      <div style={{ height: 8 }} />
      <WrittenGradingPanel result={null} onGrade={() => {}} />
      <div style={{ height: 8 }} />
      <WrittenGradingPanel result={null} grading />
      <div style={{ height: 8 }} />
      <WrittenGradingPanel result={fakeFail} onRegrade={() => {}} />

      <p style={{ font: '12px/1.6 system-ui', marginTop: 16, color: '#666' }}>
        手写导出 PNG 长度：{a1.ink.length ? inkToPng(a1, 600, 200).length : 0}
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
