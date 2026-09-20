/**
 * 卡片模式里的「材料」。
 *
 * 材料是卷面原文，但**题号要标出来**——不然点开材料只是一篇没有下标的文章，
 * 读的人对不上「第 17 题问的是哪一句」：
 *   - 完形：正文里的 `[[n]]` 画成带回跳的空（题号带下划线，当前那空高亮）
 *   - 翻译：待译句标 `(46)` 波浪线（当前那句高亮）
 *   - 阅读 / 新题型：整段正文（题号在题目页上，材料里没有可标的）
 *
 * 字体按卷面走 Times New Roman；颜色都用主题变量，深色主题下也读得清。
 */
import type { CaseQuestion, Question } from '@/types'

const SERIF = '"Times New Roman", Times, "Songti SC", "Noto Serif CJK SC", serif'
const ACCENT = 'hsl(var(--primary))'
const ACCENT_SOFT = 'hsl(var(--primary) / .14)'

interface Props {
  question: Question
  /** 当前小题 id（卷面题型就是卷面题号），用来在材料里高亮它 */
  subId: string
  /** 点材料里的题号 → 跳到那一小题 */
  onLocate?: (no: number) => void
  /** 单条记录的题没有小题，材料直接就是题干 */
  className?: string
}

function subNo(sub: CaseQuestion): number | null {
  const n = Number(sub.id)
  return Number.isFinite(n) ? n : null
}

/** 材料里的题号：当前那个高亮；能回跳时渲染成按钮 */
function MaterialNo({ no, current, onLocate, children, style }: {
  no: number
  current: boolean
  onLocate?: (no: number) => void
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const base: React.CSSProperties = {
    font: 'inherit',
    fontWeight: 700,
    border: 0,
    borderBottom: '1px solid currentColor',
    background: current ? ACCENT_SOFT : 'none',
    color: current ? ACCENT : 'inherit',
    borderRadius: '2px',
    padding: '0 2px',
    margin: '0 1px',
    cursor: onLocate ? 'pointer' : 'inherit',
    ...style,
  }
  if (!onLocate) return <span style={base}>{children}</span>
  return (
    <button type="button" style={base} title={`回到第 ${no} 题`} onClick={() => onLocate(no)}>
      {children}
    </button>
  )
}

export function CardMaterial({ question, subId, onLocate, className }: Props) {
  const paper = question.paper
  const subs = question.case_questions ?? []
  const currentNo = Number(subId)

  // 完形：正文里的 [[n]] → 带题号的空
  if (question.question_type === 'cloze' && paper?.passage) {
    const parts = paper.passage.split(/(\[\[\d+\]\])/g)
    return (
      <p className={className} style={{ fontFamily: SERIF, fontSize: '15px', lineHeight: 1.9, textAlign: 'justify', textIndent: '2em' }}>
        {parts.map((part, i) => {
          const m = /^\[\[(\d+)\]\]$/.exec(part)
          if (!m) return <span key={i}>{part}</span>
          const no = Number(m[1])
          return <MaterialNo key={i} no={no} current={no === currentNo} onLocate={onLocate}>{no}</MaterialNo>
        })}
      </p>
    )
  }

  // 翻译：待译句加波浪线 + 题号
  if (question.question_type === 'translation' && paper?.passage && subs.length > 0) {
    const segments = subs
      .map((s) => ({ no: subNo(s), sentence: s.text }))
      .filter((s): s is { no: number; sentence: string } => s.no != null && s.sentence.length > 0)
    const nodes: React.ReactNode[] = []
    let cursor = 0
    const passage = paper.passage
    for (const seg of segments) {
      const at = passage.indexOf(seg.sentence, cursor)
      if (at < 0) continue
      if (at > cursor) nodes.push(<span key={`t${seg.no}`}>{passage.slice(cursor, at)}</span>)
      const on = seg.no === currentNo
      nodes.push(
        <span key={`s${seg.no}`} style={{ textDecoration: 'underline wavy', textDecorationColor: on ? ACCENT : 'currentColor', background: on ? ACCENT_SOFT : 'none' }}>
          <MaterialNo no={seg.no} current={on} onLocate={onLocate} style={{ borderBottom: 0, textDecoration: 'none' }}>({seg.no})</MaterialNo>
          {seg.sentence}
        </span>,
      )
      cursor = at + seg.sentence.length
    }
    if (cursor < passage.length) nodes.push(<span key="tail">{passage.slice(cursor)}</span>)
    return (
      <p className={className} style={{ fontFamily: SERIF, fontSize: '15px', lineHeight: 1.9, textAlign: 'justify', textIndent: '2em' }}>
        {nodes}
      </p>
    )
  }

  // 新题型：段落（字母已在正文里）
  if (paper?.paragraphs?.length) {
    return (
      <div className={className} style={{ fontFamily: SERIF, fontSize: '15px', lineHeight: 1.9 }}>
        {paper.paragraphs.map((p) => (
          <p key={p.letter} style={{ margin: '0 0 8px' }}>
            <b>{p.letter}.</b> {p.text}
          </p>
        ))}
      </div>
    )
  }

  // 阅读等：整段正文
  if (paper?.passage) {
    return (
      <p className={className} style={{ fontFamily: SERIF, fontSize: '15px', lineHeight: 1.9, textAlign: 'justify', textIndent: '2em' }}>
        {paper.passage}
      </p>
    )
  }

  // 案例题这类：材料就是题干
  if (subs.length > 0) {
    return <p className={className} style={{ fontFamily: SERIF, fontSize: '15px', lineHeight: 1.9 }}>{question.question_text}</p>
  }

  return null
}
