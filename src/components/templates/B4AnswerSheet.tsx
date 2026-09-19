import { type CSSProperties } from 'react'
import { AnswerSheetPrintSurface } from '@/components/templates/AnswerSheetPrintSurface'
import {
  B4_SHEET, B5_PAGE, BINDER, CJK_ASCENT, COVER_BODY, COVER_NOTICE, COVER_NOTICES,
  COVER_STRIP, COVER_TABLE, COVER_TABLE_ROWS, FONT_FANGSONG, FONT_SONG_BOLD, FOOTER,
  buildSheetFaces, type B4AnswerSheetInfo, type B4PageSlot, type B4SheetFace,
} from '@/lib/answer-sheet-b4'

const ink = '#000'

/** 原件的数字与空格走 Times New Roman（连「1.」的宽度都是 Times 的 0.5em+0.25em） */
const LATIN_FONT = '"Times New Roman", "Liberation Serif", serif'

/** 中文走当前字体，ASCII 段（数字/空格/标点）切出来走拉丁字体，宽度才对得上原件 */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/([ -~]+)/).map((part, i) =>
        /^[ -~]+$/.test(part) ? <span key={i} style={{ fontFamily: LATIN_FONT }}>{part}</span> : <span key={i}>{part}</span>,
      )}
    </>
  )
}

type Typeface = { fontFamily: string; fontWeight?: number }

/** 原件里「宋体加粗」那一组：标题 / 填空标签 / 竖排标签 / 页脚 */
const BOLD_SONG: Typeface = { fontFamily: FONT_SONG_BOLD, fontWeight: 700 }
/** 原件里「仿宋」那一组：评分表 / 注意事项 */
const FANGSONG: Typeface = { fontFamily: FONT_FANGSONG }

/** 文字一律按「视觉中心 + 字号」定位，配合 line-height:1，基线可预测 */
function text(left: number, centerY: number, fontSize: number, face: Typeface): CSSProperties {
  return {
    position: 'absolute',
    left: `${left}mm`,
    top: `${centerY - fontSize / 2}mm`,
    fontSize: `${fontSize}mm`,
    lineHeight: 1,
    whiteSpace: 'pre',
    ...face,
  }
}

function centered(centerX: number, centerY: number, fontSize: number, face: Typeface, width = 120): CSSProperties {
  return { ...text(centerX - width / 2, centerY, fontSize, face), width: `${width}mm`, textAlign: 'center', whiteSpace: 'normal' }
}

/** 竖排标签：绕自身中心旋转，left/top 即标签的视觉中心 */
function vertical(centerX: number, centerY: number, deg: number, fontSize: number, face: Typeface): CSSProperties {
  return {
    position: 'absolute',
    left: `${centerX}mm`,
    top: `${centerY}mm`,
    fontSize: `${fontSize}mm`,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    transform: `translate(-50%, -50%) rotate(${deg}deg)`,
    ...face,
  }
}

function BinderLines({ side, style }: { side: 'left' | 'right'; style: 'pair' | 'single' }) {
  const insets: readonly number[] = style === 'pair' ? BINDER.pair : [BINDER.single]
  return (
    <>
      {insets.map((inset) => (
        <span
          key={inset}
          style={{
            position: 'absolute',
            left: `${side === 'left' ? inset : B5_PAGE.width - inset}mm`,
            top: `${BINDER.top}mm`,
            height: `${BINDER.bottom - BINDER.top}mm`,
            width: `${BINDER.width}mm`,
            background: ink,
          }}
        />
      ))}
      {style === 'pair' && (
        <span style={vertical(side === 'left' ? BINDER.label : B5_PAGE.width - BINDER.label, 146.27, side === 'left' ? -90 : 90, BINDER.fontSize, BOLD_SONG)}>
          装 订 线
        </span>
      )}
    </>
  )
}

/**
 * 竖排填充文字：沿填空线自下而上写（原件的中文竖排就是 −90°），
 * 字号按线长自适应，免得长名字或长专业名溢出线外。
 */
function VerticalFill({ text, centerX, line, face, maxSize = 5 }: { text: string; centerX: number; line: readonly [number, number]; face: Typeface; maxSize?: number }) {
  const chars = [...text]
  if (!chars.length) return null
  const size = Math.min(maxSize, (line[1] - line[0] - 1.5) / chars.length)
  return (
    <span style={vertical(centerX, (line[0] + line[1]) / 2, -90, size, face)}>{text}</span>
  )
}

/** 封面左侧信息条：考生编号 15 格 + 姓名 / 报考专业 竖排填空线 */
function CoverStrip({ info }: { info: B4AnswerSheetInfo }) {
  const { boxLeft, boxTop, boxWidth, boxHeight, boxRows, lineX, lineWidth, labelCenterX, idLabelCenterY, nameLine, nameLabelCenterY, majorLine, majorLabelCenterY, fontSize } = COVER_STRIP
  const rowHeight = boxHeight / boxRows
  const digits = info.candidateNo.replace(/\D/g, '').slice(0, boxRows).split('')
  const fields = [
    { label: '姓　名', value: info.candidateName, line: nameLine, labelY: nameLabelCenterY },
    { label: '报考专业', value: info.major, line: majorLine, labelY: majorLabelCenterY },
  ]
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: `${boxLeft}mm`,
          top: `${boxTop}mm`,
          width: `${boxWidth}mm`,
          height: `${boxHeight}mm`,
          border: `${COVER_TABLE.border}mm solid ${ink}`,
          display: 'grid',
          gridTemplateRows: `repeat(${boxRows}, 1fr)`,
        }}
      >
        {Array.from({ length: boxRows }, (_, i) => (
          <span key={i} style={{ borderBottom: i === boxRows - 1 ? 'none' : `${COVER_TABLE.border}mm solid ${ink}` }} />
        ))}
      </div>

      {digits.map((digit, i) => (
        <span key={i} style={vertical(boxLeft + boxWidth / 2, boxTop + (i + 0.5) * rowHeight, -90, 4.6, BOLD_SONG)}>{digit}</span>
      ))}

      <span style={vertical(labelCenterX, idLabelCenterY, -90, fontSize, BOLD_SONG)}>考生编号</span>

      {fields.map((field) => (
        <span key={field.label}>
          <span style={{ position: 'absolute', left: `${lineX}mm`, top: `${field.line[0]}mm`, height: `${field.line[1] - field.line[0]}mm`, width: `${lineWidth}mm`, background: ink }} />
          <VerticalFill text={field.value} centerX={labelCenterX} line={field.line} face={BOLD_SONG} />
          <span style={vertical(labelCenterX, field.labelY, -90, fontSize, BOLD_SONG)}>{field.label}</span>
        </span>
      ))}
    </>
  )
}

/** 评分表：题号 / 分数 / 阅卷人 三列，一~十五 + 空行 + 总分 */
function CoverScoreTable() {
  const { left, colDividers, right, headerTop, headerHeight, rowHeight, rowCount, spacerHeight, totalHeight, border, fontSize, padX, baselineOffset } = COVER_TABLE
  const boundaries: number[] = [headerTop]
  let y = headerTop + headerHeight
  boundaries.push(y)
  for (let i = 0; i < rowCount; i++) boundaries.push((y += rowHeight))
  boundaries.push((y += spacerHeight))
  boundaries.push((y += totalHeight))
  const columns: number[] = [left, ...colDividers, right]

  const cell = (col: number, rowTop: number, value: string) => (
    <span key={`${col}-${rowTop}-${value}`} style={{ ...text(columns[col] + padX, 0, fontSize, FANGSONG), top: `${rowTop + baselineOffset - CJK_ASCENT * fontSize}mm` }}>
      {value}
    </span>
  )

  return (
    <>
      {columns.map((x) => (
        <span key={`v${x}`} style={{ position: 'absolute', left: `${x - border / 2}mm`, top: `${headerTop}mm`, height: `${y - headerTop}mm`, width: `${border}mm`, background: ink }} />
      ))}
      {boundaries.map((lineY) => (
        <span key={`h${lineY}`} style={{ position: 'absolute', left: `${left - border / 2}mm`, top: `${lineY - border / 2}mm`, width: `${right - left + border}mm`, height: `${border}mm`, background: ink }} />
      ))}
      {cell(0, headerTop, '题号')}
      {cell(1, headerTop, '分数')}
      {cell(2, headerTop, '阅卷人')}
      {COVER_TABLE_ROWS.map((label, i) => cell(0, headerTop + headerHeight + rowHeight * i, label))}
      {cell(0, y - totalHeight, '总分')}
    </>
  )
}

function CoverNotice() {
  const { left, top, right, bottom, border, titleFontSize, titleCenterY, fontSize, lineHeight, bodyTop, numberLeft, textLeft, textWidth } = COVER_NOTICE
  const gutter = textLeft - numberLeft
  return (
    <>
      <div style={{ position: 'absolute', left: `${left}mm`, top: `${top}mm`, width: `${right - left}mm`, height: `${bottom - top}mm`, border: `${border}mm solid ${ink}` }} />
      <span style={centered((left + right) / 2, titleCenterY, titleFontSize, FANGSONG, right - left - 6)}>注 意 事 项</span>
      <div style={{ position: 'absolute', left: `${numberLeft}mm`, top: `${bodyTop}mm`, width: `${gutter + textWidth}mm`, fontFamily: FANGSONG.fontFamily, fontSize: `${fontSize}mm`, lineHeight: `${lineHeight}mm` }}>
        {COVER_NOTICES.map((lines, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span style={{ flex: '0 0 auto', width: `${gutter}mm`, fontFamily: LATIN_FONT }}>{i + 1}.</span>
            <span style={{ flex: '0 0 auto', width: `${textWidth}mm` }}>
              {lines.map((line, j) => {
                const isLastLine = j === lines.length - 1
                return (
                  <span
                    key={j}
                    style={{
                      display: 'block',
                      whiteSpace: 'nowrap',
                      textAlign: isLastLine ? 'left' : 'justify',
                      textAlignLast: isLastLine ? 'left' : 'justify',
                    }}
                  >
                    <RichText text={line} />
                  </span>
                )
              })}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function CoverPage({ info }: { info: B4AnswerSheetInfo }) {
  const rows = [
    { label: '招生单位代码及名称:', value: info.institution, ...COVER_BODY.infoRows[0] },
    { label: '考试科目代码及名称:', value: info.subject, ...COVER_BODY.infoRows[1] },
  ]
  return (
    <>
      <CoverStrip info={info} />
      <span style={centered(COVER_BODY.centerX, COVER_BODY.titleLineCenters[0], COVER_BODY.titleFontSize, BOLD_SONG)}>硕士生入学考试初试</span>
      <span style={centered(COVER_BODY.centerX, COVER_BODY.titleLineCenters[1], COVER_BODY.titleFontSize, BOLD_SONG)}>招生单位自命题科目答题纸</span>

      {rows.map((row) => (
        <span key={row.label}>
          <span style={text(COVER_BODY.infoLabelLeft, row.labelCenterY, COVER_BODY.infoFontSize, BOLD_SONG)}>{row.label}</span>
          <span style={{ position: 'absolute', left: `${COVER_BODY.infoRuleLeft}mm`, top: `${row.ruleY}mm`, width: `${COVER_BODY.infoRuleRight - COVER_BODY.infoRuleLeft}mm`, height: `${COVER_TABLE.border}mm`, background: ink }} />
          {row.value && <span style={text(COVER_BODY.infoRuleLeft + 2, row.ruleY - 0.8 - COVER_BODY.infoFontSize, COVER_BODY.infoFontSize, BOLD_SONG)}>{row.value}</span>}
        </span>
      ))}

      <CoverScoreTable />
      <CoverNotice />
    </>
  )
}

/** 页脚两个数字都留空，页码与总页数都由考生在考场自己填 */
function PageFooter() {
  return (
    <span style={centered(FOOTER.centerX, FOOTER.centerY, FOOTER.fontSize, BOLD_SONG)}>
      <RichText text={'第\u3000页（共\u3000页）'} />
    </span>
  )
}

function B5Page({ slot, info }: { slot: B4PageSlot; info: B4AnswerSheetInfo }) {
  const isCover = slot.pageNo === 1
  return (
    <div className="b4-page" style={{ width: `${B5_PAGE.width}mm`, height: `${B5_PAGE.height}mm`, position: 'relative', overflow: 'hidden', background: '#fff', color: ink }}>
      {isCover ? <CoverPage info={info} /> : null}
      <BinderLines side={isCover ? 'left' : slot.binderSide} style={isCover ? 'pair' : slot.binderStyle} />
      <PageFooter />
    </div>
  )
}

function B4Face({ face, info }: { face: B4SheetFace; info: B4AnswerSheetInfo }) {
  return (
    <div className="b4-sheet" style={{ width: `${B4_SHEET.width}mm`, height: `${B4_SHEET.height}mm`, display: 'flex', position: 'relative', background: '#fff', color: ink }}>
      {face.left && <B5Page slot={face.left} info={info} />}
      {face.right && <B5Page slot={face.right} info={info} />}
    </div>
  )
}

function B4AnswerSheetStyles() {
  return (
    <style>{`
      .b4-sheet, .b4-page, .b4-sheet *, .b4-page * {
        font-family: ${FONT_SONG_BOLD};
        box-sizing: border-box;
      }
      .b4-sheet { outline: 1px solid hsl(var(--border)); }
      @media print {
        .b4-sheet { outline: none !important; }
        .b4-sheet *, .b4-page * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      }
    `}</style>
  )
}

/** 全部 B4 面按 1:1 mm 渲染；预览用 scale 缩放（打印时走 B4PrintSurface，不带 scale） */
export function B4AnswerSheetStack({ info, scale = 1 }: { info: B4AnswerSheetInfo; scale?: number }) {
  const faces = buildSheetFaces(Math.max(info.totalPages, 1))
  return (
    <>
      <B4AnswerSheetStyles />
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${10 * scale}px`, width: `${B4_SHEET.width * scale}mm` }}>
        {faces.map((face) => (
          <div key={face.faceIndex} style={{ width: `${B4_SHEET.width * scale}mm`, height: `${B4_SHEET.height * scale}mm`, overflow: 'hidden' }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <B4Face face={face} info={info} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * 打印视图：Portal 到 body，只留 B4 面，进入即 window.print。
 */
export function B4PrintSurface({ info, onClose }: { info: B4AnswerSheetInfo; onClose: () => void }) {
  return (
    <AnswerSheetPrintSurface pageWidthMm={B4_SHEET.width} pageHeightMm={B4_SHEET.height} sheetSelector=".b4-sheet" onClose={onClose}>
      <B4AnswerSheetStack info={info} />
    </AnswerSheetPrintSurface>
  )
}
