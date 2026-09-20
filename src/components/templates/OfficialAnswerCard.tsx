import type { CSSProperties } from 'react'
import {
  A3_SHEET, OPTION_LABELS, idCell, objectiveCells, questionRows,
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
  focusQ,
  onLocateQ,
}: {
  card: OfficialAnswerCard
  draft?: OfficialCardDraft
  onToggleAnswer?: (q: number, option: number, multi: boolean) => void
  onSetIdDigit?: (pos: number, digit: number) => void
  /** 当前小题：在卡上圈出它那一行（双向定位的「卡片 → 答题卡」方向） */
  focusQ?: number | null
  /** 点题号区 → 回到答题卡的那一小题（「答题卡 → 卡片」方向） */
  onLocateQ?: (q: number) => void
}) {
  const l = card.idLattice
  const rows = focusQ == null && !onLocateQ ? [] : questionRows(card)
  const focusRow = focusQ == null ? null : rows.find((r) => r.q === focusQ) ?? null
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

      {/* 当前小题的那一行：套一个圈，扫一眼就知道卡片在问哪一题 */}
      {focusRow && (
        <span
          style={{
            position: 'absolute',
            left: `${focusRow.left}mm`,
            top: `${focusRow.top}mm`,
            width: `${focusRow.width}mm`,
            height: `${focusRow.height}mm`,
            border: '0.5mm solid rgba(37,99,235,.85)',
            borderRadius: '1mm',
            boxSizing: 'content-box',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 每题的整行热区：点在圆圈上是作答, 点在题号/空隙上是回跳卡片 */}
      {onLocateQ &&
        rows.map((r) => (
          <button
            key={`loc-${r.q}`}
            type="button"
            className="official-hit"
            title={`回到第 ${r.q} 题`}
            onClick={() => onLocateQ(r.q)}
            style={{
              position: 'absolute',
              left: `${r.hitLeft}mm`,
              top: `${r.hitTop}mm`,
              width: `${r.hitWidth}mm`,
              height: `${r.hitHeight}mm`,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
        ))}

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
 *
 * `crop` 传了就只显示某一张 A3 的一个折页（A4 单页视图）：A3 横版按折线裁成
 * `foldPanels` 张 A4 竖版，一页看一张，字号也就跟着大一倍。
 */
export function OfficialAnswerCardStack({
  card,
  scale = 1,
  draft,
  onToggleAnswer,
  onSetIdDigit,
  focusQ,
  onLocateQ,
  crop,
}: {
  card: OfficialAnswerCard
  scale?: number
  draft?: OfficialCardDraft
  onToggleAnswer?: (q: number, option: number, multi: boolean) => void
  onSetIdDigit?: (pos: number, digit: number) => void
  /** 当前小题：圈出卡上那一行 */
  focusQ?: number | null
  /** 点题号区 → 回到答题卡的那一小題 */
  onLocateQ?: (q: number) => void
  /** A4 单页：只显示第 `face` 面的第 `panel` 折页 */
  crop?: { face: number; panel: number }
}) {
  const faces = crop ? card.faces.slice(crop.face, crop.face + 1) : card.faces
  const faceW = A3_SHEET.width / card.foldPanels
  const viewW = crop ? faceW : A3_SHEET.width
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${10 * scale}px`, width: `${viewW * scale}mm` }}>
      {faces.map((src, fi) => {
        const faceIndex = crop ? crop.face : fi
        const shift = crop ? crop.panel * faceW : 0
        return (
          <div
            key={src}
            className="official-sheet"
            style={{
              position: 'relative',
              width: `${viewW * scale}mm`,
              height: `${A3_SHEET.height * scale}mm`,
              overflow: 'hidden',
              background: '#fff',
              outline: '1px solid hsl(var(--border))',
            }}
          >
            <img
              src={src}
              alt={`${card.name} 第 ${faceIndex + 1} 面`}
              draggable={false}
              style={{
                display: 'block',
                width: `${A3_SHEET.width * scale}mm`,
                height: `${A3_SHEET.height * scale}mm`,
                marginLeft: `${-shift * scale}mm`,
                maxWidth: 'none',
              }}
            />
            {faceIndex === 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: `${-shift * scale}mm`,
                  top: 0,
                  width: `${A3_SHEET.width * scale}mm`,
                  height: `${A3_SHEET.height * scale}mm`,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                <Overlay card={card} draft={draft} onToggleAnswer={onToggleAnswer} onSetIdDigit={onSetIdDigit} focusQ={focusQ} onLocateQ={onLocateQ} />
              </div>
            )}
          </div>
        )
      })}
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
