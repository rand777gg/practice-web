import type { CSSProperties } from 'react'
import {
  A3_SHEET, OPTION_LABELS, idCell, objectiveCells,
  type FieldBox, type ObjectiveCell, type OfficialAnswerCard, type OfficialCardDraft,
} from '@/lib/answer-sheet-official'

const INK = '#111827'
const FILL = '#1f2937'

/** 卷面信息（报考单位 / 考生姓名）叠印在原件留白行里 */
function fieldStyle(box: FieldBox): CSSProperties {
  return {
    position: 'absolute',
    left: `${box.left}mm`,
    top: `${box.top}mm`,
    width: `${box.width}mm`,
    height: `${box.height}mm`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: `${box.fontSize}mm`,
    lineHeight: 1,
    fontFamily: '"SimSun", "Songti SC", "Noto Serif CJK SC", serif',
    color: INK,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  }
}

/** 涂上的实心格：盖住原件的空泡 */
function Fill({ x, y, boxW, boxH }: { x: number; y: number; boxW: number; boxH: number }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: `${x - boxW / 2}mm`,
        top: `${y - boxH / 2}mm`,
        width: `${boxW}mm`,
        height: `${boxH}mm`,
        background: FILL,
        borderRadius: '0.25mm',
      }}
    />
  )
}

function Hit({ x, y, boxW, boxH, title, onClick }: { x: number; y: number; boxW: number; boxH: number; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="official-hit"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${x - boxW / 2}mm`,
        top: `${y - boxH / 2}mm`,
        width: `${boxW}mm`,
        height: `${boxH}mm`,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
      }}
    />
  )
}

/** 涂卡层：叠在底图上面，跟底图共用同一套 mm 坐标 */
function Overlay({
  card,
  draft,
  onToggleAnswer,
  onSetIdDigit,
}: {
  card: OfficialAnswerCard
  draft?: OfficialCardDraft
  onToggleAnswer?: (q: number, option: number, multi: boolean) => void
  onSetIdDigit?: (pos: number, digit: number) => void
}) {
  const l = card.idLattice
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: `${A3_SHEET.width}mm`, height: `${A3_SHEET.height}mm` }}>
      {draft?.institution ? <span style={fieldStyle(card.institutionBox)}>{draft.institution}</span> : null}
      {draft?.candidateName ? <span style={fieldStyle(card.nameBox)}>{draft.candidateName}</span> : null}

      {draft?.idDigits.map((digit, pos) =>
        digit === null ? null : <Fill key={`id-${pos}`} {...idCell(card, pos, digit)} />,
      )}
      {onSetIdDigit &&
        Array.from({ length: l.cols }, (_, pos) =>
          Array.from({ length: l.rows }, (_, digit) => (
            <Hit
              key={`idhit-${pos}-${digit}`}
              {...idCell(card, pos, digit)}
              title={`准考证号第 ${pos + 1} 位涂 ${digit}`}
              onClick={() => onSetIdDigit(pos, digit)}
            />
          )),
        )}

      {draft &&
        objectiveCells(card).map((cell: ObjectiveCell) =>
          (draft.answers[cell.q] ?? []).includes(cell.option) ? <Fill key={`ans-${cell.q}-${cell.option}`} {...cell} /> : null,
        )}
      {onToggleAnswer &&
        objectiveCells(card).map((cell) => (
          <Hit
            key={`anshit-${cell.q}-${cell.option}`}
            {...cell}
            title={`第 ${cell.q} 题 ${OPTION_LABELS[cell.option]}`}
            onClick={() => onToggleAnswer(cell.q, cell.option, cell.multi)}
          />
        ))}
    </div>
  )
}

/**
 * 统考答题卡：原件每一面就是一张 A3 横向底图，按 1:1 mm 摆好，涂卡层叠在上面。
 * 不传 draft 就是空白卡；不传回调就是只读（打印用）。
 */
export function OfficialAnswerCardStack({
  card,
  scale = 1,
  draft,
  onToggleAnswer,
  onSetIdDigit,
}: {
  card: OfficialAnswerCard
  scale?: number
  draft?: OfficialCardDraft
  onToggleAnswer?: (q: number, option: number, multi: boolean) => void
  onSetIdDigit?: (pos: number, digit: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${10 * scale}px`, width: `${A3_SHEET.width * scale}mm` }}>
      {card.faces.map((src, i) => (
        <div
          key={src}
          className="official-sheet"
          style={{
            position: 'relative',
            width: `${A3_SHEET.width * scale}mm`,
            height: `${A3_SHEET.height * scale}mm`,
            overflow: 'hidden',
            background: '#fff',
            outline: '1px solid hsl(var(--border))',
          }}
        >
          <img
            src={src}
            alt={`${card.name} 第 ${i + 1} 面`}
            draggable={false}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
          {i === 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: `${A3_SHEET.width * scale}mm`,
                height: `${A3_SHEET.height * scale}mm`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <Overlay card={card} draft={draft} onToggleAnswer={onToggleAnswer} onSetIdDigit={onSetIdDigit} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function OfficialAnswerCardStyles() {
  return (
    <style>{`
      .official-sheet img { image-rendering: auto; }
      .official-hit:hover { background: rgba(236, 72, 153, 0.28); }
      .official-hit:focus-visible { outline: 1px solid #db2777; outline-offset: 0; }
      @media print {
        .official-sheet { outline: none !important; }
        .official-sheet img, .official-sheet span { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .official-hit { display: none !important; }
      }
    `}</style>
  )
}
