import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { slotKey, type PaperSlot } from '@/lib/exam-paper'
import type { EnglishPaperLayout, WritingChart } from '@/lib/english-paper-layout'

/**
 * 英语（一）真题卷面渲染。
 *
 * 目标是「像真题」而不是「像刷题界面」：Times New Roman、段首缩进、两端对齐、
 * 文章与题目分页，完形整篇一题、挖空处显示题号、选项挨着排。
 *
 * **只吃 props，不碰数据来源**——卷面文本从哪来（题库 question_text / 本地烤好的
 * 快照 / 上传的 PDF）是上层的事，这样换数据源不用动渲染。
 *
 * 作答按「题号 → questionId」写回既有记录：完形在库里仍是 1–20 条独立单选、
 * 阅读仍是每篇 5 条，渲染合并显示但**不动数据模型**。
 */

const OPTION_LETTERS = 'ABCDEFGH'
/** 卷面一页按 A4 竖版排（和 .erp-page 的宽度一致），双页摊开时缩放要靠它算 */
const A4_W_MM = 210
const SPREAD_GAP_MM = 8

export function EnglishRealPaperStyles() {
  return (
    <style>{`
      .erp-root { font-family: "Times New Roman", Times, "Songti SC", serif; color: #111; }
      .erp-root .erp-page {
        width: 210mm; min-height: 297mm; box-sizing: border-box;
        padding: 16mm 15mm; background: #fff; margin: 0 auto 10mm;
        box-shadow: 0 1px 4px rgba(0,0,0,.18);
      }
      /* 单页：一页一列竖着排；双页摊开：两页并排（像翻开的书） */
      .erp-root .erp-flow { display: flex; flex-direction: column; align-items: center; }
      .erp-root .erp-flow .erp-page { margin: 0 0 10mm; }
      .erp-root .erp-flow.is-spread {
        flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: flex-start;
        gap: ${SPREAD_GAP_MM}mm;
      }
      .erp-root .erp-flow.is-spread .erp-page { margin: 0; }
      .erp-root .erp-title { text-align: center; font-size: 15pt; font-weight: 700; margin-bottom: 8mm; }
      .erp-root .erp-sect { font-size: 12pt; font-weight: 700; margin: 0 0 2mm; }
      .erp-root .erp-dir { font-size: 10.5pt; line-height: 1.5; margin: 0 0 4mm; }
      .erp-root .erp-body { font-size: 10.5pt; line-height: 1.62; text-align: justify; text-indent: 2em; }
      .erp-root .erp-text-head { font-size: 11pt; font-weight: 700; margin: 0 0 3mm; }
      /* 挖空：真题里就是个空位，这里把题号填进去 */
      .erp-root .erp-blank {
        display: inline-block; min-width: 7mm; padding: 0 1mm; margin: 0 .5mm;
        border-bottom: 1px solid #111; text-align: center; font-size: 9pt; line-height: 1.2;
      }
      .erp-root .erp-blank.is-answered { font-weight: 700; border-bottom-width: 2px; }
      /* 选项挨着排（真题是四列，这里让它自然并排换行） */
      .erp-root .erp-options { display: flex; flex-wrap: wrap; gap: 2mm 8mm; margin: 2mm 0 0; text-indent: 0; }
      .erp-root .erp-opt { font-size: 10.5pt; cursor: pointer; white-space: nowrap; }
      .erp-root .erp-opt:hover { background: #f1f5f9; }
      .erp-root .erp-opt .k { display: inline-block; min-width: 4mm; }
      .erp-root .erp-opt.is-on { font-weight: 700; }
      .erp-root .erp-opt.is-on .k { border-bottom: 2px solid #111; }
      .erp-root .erp-q { font-size: 10.5pt; line-height: 1.55; margin: 0 0 1mm; }
      .erp-root .erp-qn { font-weight: 700; margin-right: 1.5mm; }
      .erp-root .erp-block { margin-bottom: 5mm; }
      /* 双向定位：当前小题高亮；点题号回跳答题卡 */
      .erp-root .erp-block, .erp-root .erp-loc { border-radius: 1mm; }
      .erp-root .erp-cur { outline: 1.5px solid rgba(37,99,235,.5); outline-offset: 2mm; background: rgba(37,99,235,.045); }
      .erp-root .erp-flash { animation: erp-flash 1.2s ease-out; }
      @keyframes erp-flash {
        from { background: rgba(37,99,235,.22); }
        to { background: rgba(37,99,235,.045); }
      }
      .erp-root .erp-locator {
        font: inherit; font-weight: 700; margin-right: 1.5mm; padding: 0 1mm;
        border: 0; background: none; color: inherit; cursor: pointer; border-radius: .5mm;
      }
      .erp-root .erp-locator:hover { color: #1d4ed8; background: rgba(37,99,235,.12); }
      .erp-root button.erp-blank { background: none; font: inherit; }
      /* 顺序骨架：F → [41.] → [42.] → H … */
      .erp-root .erp-skel { display: flex; flex-wrap: wrap; align-items: center; gap: 0; margin: 0 0 5mm; font-size: 12pt; }
      .erp-root .erp-skel .g { padding: 0 2mm; font-weight: 700; }
      .erp-root .erp-skel .box { border: 1px solid #111; padding: .5mm 3mm; min-width: 14mm; text-align: center; }
      .erp-root .erp-skel .arw { padding: 0 2mm; }
      .erp-root .erp-letter { border: 1px solid #111; padding: 3mm 4mm; font-size: 10.5pt; line-height: 1.6; margin: 3mm 0 4mm; }
      .erp-root .erp-caption { font-size: 10pt; text-align: center; margin-top: 2mm; }
      .erp-root .erp-charts { display: flex; gap: 10mm; justify-content: center; align-items: flex-start; margin: 3mm 0; }
      .erp-root .erp-para { margin: 0 0 2mm; }
      .erp-root .erp-segno { font-weight: 700; }
      @media print {
        .erp-root .erp-page { box-shadow: none; margin: 0; break-after: page; }
        .erp-root .erp-page:last-child { break-after: auto; }
      }
    `}</style>
  )
}

function PaperPage({ children }: { children: React.ReactNode }) {
  return <div className="erp-page">{children}</div>
}

/** 完形正文：把 [[N]] 画成带题号的空，已作答的显示所选字母 */
function ClozePassage({
  passage, pickedByNo, currentNo, onLocate,
}: { passage: string; pickedByNo: Map<number, number>; currentNo?: number | null; onLocate?: (no: number) => void }) {
  const parts = passage.split(/(\[\[\d+\]\])/g)
  return (
    <p className="erp-body">
      {parts.map((part, i) => {
        const m = /^\[\[(\d+)\]\]$/.exec(part)
        if (!m) return <span key={i}>{part}</span>
        const no = Number(m[1])
        const picked = pickedByNo.get(no)
        return (
          <Locator
            key={i}
            no={no}
            onLocate={onLocate}
            className={cn('erp-blank', picked !== undefined && 'is-answered', currentNo === no && 'erp-cur')}
            data-erp-blank={no}
          >
            {picked === undefined ? no : OPTION_LETTERS[picked]}
          </Locator>
        )
      })}
    </p>
  )
}

/** 一行选项，点一个即作答 */
function OptionRow({
  labels, options, picked, onPick,
}: { labels?: string[]; options: string[]; picked: number | undefined; onPick: (i: number) => void }) {
  return (
    <div className="erp-options">
      {options.map((text, i) => (
        <span
          key={i}
          role="button"
          tabIndex={0}
          onClick={() => onPick(i)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPick(i) }}
          className={cn('erp-opt', picked === i && 'is-on')}
        >
          <span className="k">{labels?.[i] ?? OPTION_LETTERS[i]}.</span>
          {text}
        </span>
      ))}
    </div>
  )
}

/** 一条小题的容器：标记题号（供定位滚动）、当前题高亮、题号可点回跳卡片 */
function PaperItem({
  no, current, flash, className, style, children,
}: {
  no: number
  current?: boolean
  flash?: boolean
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div
      data-erp-no={no}
      style={style}
      className={cn('erp-block', className, current && 'erp-cur', current && flash && 'erp-flash')}
    >
      {children}
    </div>
  )
}

/** 可点的题号：从卷面回跳答题卡的同一小题 */
function Locator({ no, onLocate, children, className, ...rest }: {
  no: number
  onLocate?: (no: number) => void
  children: React.ReactNode
  className?: string
} & Record<`data-${string}`, unknown>) {
  if (!onLocate) return <span className={className} {...rest}>{children}</span>
  return (
    <button
      type="button"
      className={cn(className, 'erp-locator')}
      title={`回到第 ${no} 题`}
      onClick={(e) => { e.stopPropagation(); onLocate(no) }}
      {...rest}
    >
      {children}
    </button>
  )
}

/** 顺序骨架：字母是卷面已给定的，方框是待填的题号 */
function OrderSkeleton({ skeleton, answersByNo }: { skeleton: (string | number)[]; answersByNo: Map<number, string> }) {
  return (
    <div className="erp-skel">
      {skeleton.map((item, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {i > 0 && <span className="arw">→</span>}
          {typeof item === 'number'
            ? <span className="box">{answersByNo.get(item) ?? `${item}.`}</span>
            : <span className="g">{item}</span>}
        </span>
      ))}
    </div>
  )
}

/** 图表用 canvas 画（真题的饼图 + 柱状图） */
function ChartCanvas({ chart, size = 220 }: { chart: WritingChart; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const key = JSON.stringify(chart)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.font = '11px "Times New Roman", Times, serif'
    ctx.fillStyle = '#111'
    ctx.strokeStyle = '#111'

    if (chart.kind === 'pie') {
      const cx = size / 2
      const cy = size / 2
      const r = size * 0.3
      const total = chart.items.reduce((a, b) => a + b.value, 0) || 1
      let angle = -Math.PI / 2
      const shades = ['#d9d9d9', '#a6a6a6', '#737373', '#404040']
      chart.items.forEach((it, i) => {
        const sweep = (it.value / total) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, r, angle, angle + sweep)
        ctx.closePath()
        ctx.fillStyle = shades[i % shades.length]
        ctx.fill()
        ctx.stroke()
        // 标签画在扇形中间
        const mid = angle + sweep / 2
        const lx = cx + Math.cos(mid) * r * 0.62
        const ly = cy + Math.sin(mid) * r * 0.62
        ctx.fillStyle = '#111'
        ctx.textAlign = 'center'
        ctx.fillText(`${it.value}%`, lx, ly - 2)
        ctx.fillText(it.label, lx, ly + 11)
        angle += sweep
      })
    } else {
      const padL = 42, padB = 30, padT = 18
      const w = size - padL - 14
      const h = size - padB - padT
      const max = Math.max(...chart.items.map((i) => i.value), 1)
      // 坐标轴
      ctx.beginPath()
      ctx.moveTo(padL, padT)
      ctx.lineTo(padL, padT + h)
      ctx.lineTo(padL + w, padT + h)
      ctx.stroke()
      const bw = (w / chart.items.length) * 0.5
      chart.items.forEach((it, i) => {
        const cx = padL + (w / chart.items.length) * (i + 0.5)
        const bh = (it.value / max) * h
        ctx.fillStyle = '#8c8c8c'
        ctx.fillRect(cx - bw / 2, padT + h - bh, bw, bh)
        ctx.strokeRect(cx - bw / 2, padT + h - bh, bw, bh)
        ctx.fillStyle = '#111'
        ctx.textAlign = 'center'
        ctx.fillText(`${it.value}%`, cx, padT + h - bh - 4)
        ctx.fillText(it.label, cx, padT + h + 14)
      })
    }
  }, [key, size])

  return <canvas ref={ref} style={{ width: size, height: size }} />
}

/** 翻译全文：待译句加下划线 + 题号 */
function UnderlinedPassage({ passage, segments }: { passage: string; segments: { no: number; sentence: string }[] }) {
  const found = segments
    .map((s) => ({ no: s.no, at: passage.indexOf(s.sentence) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)

  if (found.length !== segments.length) {
    // 定位不到就退化成「全文 + 逐句列出」，总比丢内容强
    return (
      <>
        <p className="erp-body">{passage}</p>
        {segments.map((s) => (
          <p key={s.no} className="erp-body" style={{ textIndent: 0 }}>
            <span className="erp-segno">({s.no})</span> <span style={{ textDecoration: 'underline' }}>{s.sentence}</span>
          </p>
        ))}
      </>
    )
  }

  const nodes: React.ReactNode[] = []
  let cursor = 0
  found.forEach((f, i) => {
    const seg = segments.find((s) => s.no === f.no)!
    if (f.at > cursor) nodes.push(<span key={`t${i}`}>{passage.slice(cursor, f.at)}</span>)
    nodes.push(
      <span key={`s${i}`} style={{ textDecoration: 'underline' }}>
        <span className="erp-segno">({f.no})</span> {seg.sentence}
      </span>,
    )
    cursor = f.at + seg.sentence.length
  })
  if (cursor < passage.length) nodes.push(<span key="tail">{passage.slice(cursor)}</span>)
  return <p className="erp-body">{nodes}</p>
}

export interface EnglishRealPaperProps {
  layout: EnglishPaperLayout
  /** 卷面题号 → 该格属于哪条记录的哪个小题 */
  slotByNo: Map<number, PaperSlot>
  /** `slotKey(记录, 小题)` → 已选下标 */
  pickedBySlot: Map<string, number>
  /** `slotKey(记录, 小题)` → 主观题的文字作答 */
  textBySlot?: Map<string, string>
  onPick?: (slot: PaperSlot, optionIndex: number) => void
  onText?: (slot: PaperSlot, text: string) => void
  /** 当前小题的卷面题号：高亮它（双向定位的「卡片 → 卷面」方向） */
  currentNo?: number | null
  /** 显式定位令牌：变化时无论 autoLocate 都滚动到当前小题（答题卡/题号格点题） */
  locateNonce?: number
  /** 跟随当前小题自动滚动（默认关闭） */
  autoLocate?: boolean
  /** 点卷面上的题号 → 回到答题卡的那一小題（「卷面 → 卡片」方向） */
  onLocate?: (no: number) => void
  /** 双页摊开：两页并排（像翻开的书）；默认单页竖排 */
  spread?: boolean
  /** 按窗格宽度等比缩放，让整页/整摊都看得全（默认开） */
  fit?: boolean
  className?: string
}

export function EnglishRealPaper({
  layout, slotByNo, pickedBySlot, textBySlot, onPick, onText,
  currentNo = null, locateNonce = 0, autoLocate = false, onLocate, spread = false, fit = true, className,
}: EnglishRealPaperProps) {
  const { cloze, reading, partB, partC, writingA, writingB } = layout.sections
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [flash, setFlash] = useState(false)
  const [boxW, setBoxW] = useState(0)

  /** 按窗格宽度等比缩放：单页让一页看得全，双页让一整摊（两页）看得全 */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width))
    ro.observe(el)
    setBoxW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const MM_TO_PX = 96 / 25.4
  const cols = spread ? 2 : 1
  const needed = A4_W_MM * MM_TO_PX * cols + SPREAD_GAP_MM * MM_TO_PX * (cols - 1)
  const scale = fit && boxW > 0 ? Math.min(1, (boxW - 4) / needed) : 1

  /**
   * 双向定位（卷面侧）：显式跳题（点题号格）总是滚动并闪一下；
   * 平时只有开着「自动定位」才跟随当前小题滚动——和通用卷面视图同一套语义。
   */
  const prevLocateRef = useRef(locateNonce)
  useEffect(() => {
    const explicit = locateNonce !== prevLocateRef.current
    prevLocateRef.current = locateNonce
    if (!explicit && !autoLocate) return
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-erp-no="${currentNo}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(true)
    const timer = setTimeout(() => setFlash(false), 1200)
    return () => clearTimeout(timer)
  }, [currentNo, locateNonce, autoLocate])

  const itemProps = (no: number) => ({
    no,
    current: currentNo === no,
    flash,
  })

  const keyOf = (no: number) => {
    const slot = slotByNo.get(no)
    return slot ? slotKey(slot.questionId, slot.subId) : null
  }
  const pickedOf = (no: number) => {
    const k = keyOf(no)
    return k ? pickedBySlot.get(k) : undefined
  }
  const textOf = (no: number) => {
    const k = keyOf(no)
    return (k ? textBySlot?.get(k) : '') ?? ''
  }
  const pick = (no: number) => (i: number) => {
    const slot = slotByNo.get(no)
    if (slot && onPick) onPick(slot, i)
  }
  const pickedByNo = new Map<number, number>()
  for (const [no, slot] of slotByNo) {
    const p = pickedBySlot.get(slotKey(slot.questionId, slot.subId))
    if (p !== undefined) pickedByNo.set(no, p)
  }
  const answeredLetterByNo = new Map<number, string>()
  for (const q of partB?.questions ?? []) {
    const p = pickedOf(q.no)
    if (p !== undefined) answeredLetterByNo.set(q.no, q.options[p]?.replace('段落 ', '') ?? '')
  }

  return (
    <div ref={rootRef} className={cn('erp-root', className)}>
      <EnglishRealPaperStyles />

      <div className={cn('erp-flow', spread && 'is-spread')} style={{ zoom: scale }}>
      {/* ── Section I 完形：整篇一个题，挖空带题号，选项挨着排 ── */}
      {cloze && (
        <PaperPage>
          <h1 className="erp-title">{layout.title}</h1>
          <h2 className="erp-sect">{cloze.ordinal} {cloze.title}</h2>
          <p className="erp-dir"><b>Directions:</b> {cloze.directions}</p>
          <ClozePassage passage={cloze.passage} pickedByNo={pickedByNo} currentNo={currentNo} onLocate={onLocate} />
          <div style={{ marginTop: '5mm' }}>
            {cloze.blanks.map((b) => (
              <PaperItem key={b.no} {...itemProps(b.no)} className="erp-loc" style={{ marginBottom: '1.5mm' }}>
                <div className="erp-options">
                  <span className="erp-opt" style={{ cursor: 'default' }}>
                    <Locator no={b.no} onLocate={onLocate} className="k">{b.no}.</Locator>
                  </span>
                  {b.options.map((text, i) => (
                    <span
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => pick(b.no)(i)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') pick(b.no)(i) }}
                      className={cn('erp-opt', pickedOf(b.no) === i && 'is-on')}
                    >
                      <span className="k">{OPTION_LETTERS[i]}.</span>{text}
                    </span>
                  ))}
                </div>
              </PaperItem>
            ))}
          </div>
        </PaperPage>
      )}

      {/* ── Section II Part A 阅读：文章占一页，题目选项另起一页 ── */}
      {reading && reading.texts.map((t) => (
        <div key={t.no}>
          <PaperPage>
            <h2 className="erp-sect">{reading.head.ordinal} {reading.head.title}</h2>
            {t.no === reading.texts[0].no && (
              <p className="erp-dir"><b>Directions:</b> {reading.head.directions}</p>
            )}
            <h3 className="erp-text-head">{t.heading}</h3>
            <p className="erp-body">{t.passage}</p>
          </PaperPage>
          <PaperPage>
            <h3 className="erp-text-head">{t.heading}</h3>
            {t.questions.map((q) => (
              <PaperItem key={q.no} {...itemProps(q.no)}>
                <p className="erp-q"><Locator no={q.no} onLocate={onLocate} className="erp-qn">{q.no}.</Locator>{q.stem}</p>
                <OptionRow options={q.options} picked={pickedOf(q.no)} onPick={pick(q.no)} />
              </PaperItem>
            ))}
          </PaperPage>
        </div>
      ))}

      {/* ── Part B 新题型：段落 + 顺序骨架 ── */}
      {partB && (
        <PaperPage>
          <h2 className="erp-sect">{partB.ordinal} {partB.title}</h2>
          <p className="erp-dir"><b>Directions:</b> {partB.directions}</p>
          <OrderSkeleton skeleton={partB.skeleton} answersByNo={answeredLetterByNo} />
          {partB.paragraphs.map((p) => (
            <p key={p.letter} className="erp-body erp-para" style={{ textIndent: 0 }}>
              <b>{p.letter}.</b> {p.text}
            </p>
          ))}
          <div style={{ marginTop: '4mm' }}>
            {partB.questions.map((q) => (
              <PaperItem key={q.no} {...itemProps(q.no)}>
                <p className="erp-q"><Locator no={q.no} onLocate={onLocate} className="erp-qn">{q.no}.</Locator></p>
                <OptionRow labels={['A', 'B', 'D', 'E', 'G']} options={q.options} picked={pickedOf(q.no)} onPick={pick(q.no)} />
              </PaperItem>
            ))}
          </div>
        </PaperPage>
      )}

      {/* ── Part C 翻译：全文 + 待译处下划线 ── */}
      {partC && (
        <PaperPage>
          <h2 className="erp-sect">{partC.ordinal} {partC.title}</h2>
          <p className="erp-dir"><b>Directions:</b> {partC.directions}</p>
          <UnderlinedPassage passage={partC.passage} segments={partC.segments} />
          <div style={{ marginTop: '5mm' }}>
            {partC.segments.map((s) => {
              const slot = slotByNo.get(s.no)
              return (
                <PaperItem key={s.no} {...itemProps(s.no)}>
                  <p className="erp-q"><Locator no={s.no} onLocate={onLocate} className="erp-qn">({s.no})</Locator></p>
                  <textarea
                    value={slot ? textOf(s.no) : ''}
                    onChange={(e) => { if (slot && onText) onText(slot, e.target.value) }}
                    placeholder="译文…"
                    style={{
                      width: '100%', minHeight: '22mm', boxSizing: 'border-box',
                      font: '10.5pt/1.6 "Times New Roman", Times, serif', padding: '2mm', resize: 'vertical',
                    }}
                  />
                </PaperItem>
              )
            })}
          </div>
        </PaperPage>
      )}

      {/* ── Section III Writing：两题都用 canvas 还原排版 ── */}
      {writingA && (
        <PaperPage>
          <h2 className="erp-sect">{writingA.ordinal} {writingA.title}</h2>
          <p className="erp-q"><Locator no={51} onLocate={onLocate} className="erp-qn">51.</Locator><b>Directions:</b></p>
          <p className="erp-dir">{writingA.directions.replace(/^\s*Read the following email[^.]*\.\s*/i, '')}</p>
          {writingA.letterBox && <div className="erp-letter">{writingA.letterBox}</div>}
          <PaperItem {...itemProps(51)}>
            <textarea
              value={slotByNo.has(51) ? textOf(51) : ''}
              onChange={(e) => { const slot = slotByNo.get(51); if (slot && onText) onText(slot, e.target.value) }}
              placeholder="Write your reply…"
              style={{
                width: '100%', minHeight: '70mm', boxSizing: 'border-box',
                font: '10.5pt/1.9 "Times New Roman", Times, serif', padding: '3mm', resize: 'vertical',
              }}
            />
          </PaperItem>
        </PaperPage>
      )}

      {writingB && (
        <PaperPage>
          <h2 className="erp-sect">{writingB.ordinal} {writingB.title}</h2>
          <p className="erp-q"><Locator no={52} onLocate={onLocate} className="erp-qn">52.</Locator><b>Directions:</b></p>
          <p className="erp-dir">{writingB.directions.replace(/^\s*Write an essay based on the charts below\.\s*/i, '')}</p>
          {writingB.charts && (
            <>
              <div className="erp-charts">
                {writingB.charts.map((c, i) => <ChartCanvas key={i} chart={c} />)}
              </div>
              {writingB.chartCaption && <p className="erp-caption">{writingB.chartCaption}</p>}
            </>
          )}
          <PaperItem {...itemProps(52)}>
            <textarea
              value={slotByNo.has(52) ? textOf(52) : ''}
              onChange={(e) => { const slot = slotByNo.get(52); if (slot && onText) onText(slot, e.target.value) }}
              placeholder="Write your essay…"
              style={{
                width: '100%', minHeight: '80mm', boxSizing: 'border-box', marginTop: '4mm',
                font: '10.5pt/1.9 "Times New Roman", Times, serif', padding: '3mm', resize: 'vertical',
              }}
            />
          </PaperItem>
        </PaperPage>
      )}
      </div>
    </div>
  )
}
