/**
 * 统考答题卡（数学 / 英语一 / 政治）。
 *
 * 这三份原件跟「自命题科目答题纸」不同：页面里没有文字层、也没有嵌位图，
 * 是字体转曲后的纯矢量 PDF，页面本身就是 A3 横向 420×294mm。
 * 逐条重画矢量不现实（光英语的涂卡区就有 200 多个空泡），所以：
 *   底图 —— `scripts/build-answer-sheet-assets.mjs` 按 200dpi 出成 WebP；
 *   涂卡格坐标 —— `scripts/measure-answer-sheet-grids.mjs` 从底图反推，写死在下面。
 *
 * 坐标一律是「格中心」，单位 mm，原点在 A3 左上角。
 *
 * 两种排布都要支持，别想当然：
 *   数学选择题 / 英语客观题 —— 题自上而下排，一道题的 A B C D 横向并排；
 *   政治单选多选 —— 题自左而右排，一道题的 A B C D 竖向叠着（跟准考证号阵一个样子）。
 * 所以每道题只登记「A 格中心 + 选项步进」，方向由步进的 dx / dy 决定。
 */

export const A3_SHEET = { width: 420, height: 294 } as const

/** 涂卡格中心阵列（准考证号用） */
export interface BubbleLattice {
  x0: number
  y0: number
  colPitch: number
  rowPitch: number
  cols: number
  rows: number
  boxW: number
  boxH: number
}

/** 一块客观题涂卡区 */
export interface QuestionBlock {
  /** 每道题的「A 格」中心，按题号升序 */
  aCells: { q: number; x: number; y: number }[]
  /** 选项步进：dx 非 0 = 选项横排，dy 非 0 = 选项竖排 */
  step: { dx: number; dy: number }
  /** 每题几个选项（英语 Part B 是 7 个 A–G） */
  options: number
  /** 多选：一题可涂多个 */
  multi?: boolean
}

/** 卷面信息里叠印文字的空白行 */
export interface FieldBox {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
}

export interface OfficialAnswerCard {
  id: string
  name: string
  subject: string
  description: string
  faces: readonly string[]
  foldPanels: number
  totalPages: number
  /** 准考证号涂卡阵：列 = 数位（15 位），行 = 数字 0–9 */
  idLattice: BubbleLattice
  blocks: QuestionBlock[]
  institutionBox: FieldBox
  nameBox: FieldBox
}

export interface OfficialCardDraft {
  institution: string
  candidateName: string
  /** 15 位准考证号，null = 该位没涂 */
  idDigits: (number | null)[]
  /** 题号 -> 已涂的选项下标（单选只有一个，多选可多个） */
  answers: Record<number, number[]>
}

export const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const

const OBJ_BOX = { boxW: 3.68, boxH: 2.29 }
const ID_BOX = { boxW: 3.68, boxH: 2.03 }

/** 英语 / 政治共用表头：准考证号阵在面板右侧 */
const WIDE_ID_LATTICE: BubbleLattice = { x0: 120.41, y0: 54.23, colPitch: 5.015, rowPitch: 3.3022, cols: 15, rows: 10, ...ID_BOX }
/** 英语 / 政治的报考单位、考生姓名空白行（左侧 91.7mm 宽的框内） */
const WIDE_INSTITUTION_BOX: FieldBox = { left: 23.05, top: 48.6, width: 91.7, height: 13.1, fontSize: 6 }
const WIDE_NAME_BOX: FieldBox = { left: 23.05, top: 73.3, width: 91.7, height: 13.3, fontSize: 6 }

/* ------------------------------- 数学 ------------------------------- */

const MATH_CHOICE_X = [30.48, 54.99, 79.63, 104.14, 128.78]
const MATH_CHOICE_ROWS = [153.39, 158.4]

/** 选择题 1–10：2 行 × 5 组，每题 4 个选项横排 */
function mathBlock(): QuestionBlock {
  const aCells: { q: number; x: number; y: number }[] = []
  for (let r = 0; r < 2; r++) {
    for (let g = 0; g < 5; g++) aCells.push({ q: r * 5 + g + 1, x: MATH_CHOICE_X[g], y: MATH_CHOICE_ROWS[r] })
  }
  return { aCells, step: { dx: 4.191, dy: 0 }, options: 4 }
}

/* ------------------------------ 英语（一） ------------------------------ */

/** 英语客观题纵向两段行（第 5、6 行之间跨了分区线，行距不一样） */
const ENG_ROWS_A = [170.85, 174.98, 179.04, 183.14, 187.21]
const ENG_ROWS_B = [193.66, 197.78, 201.9, 206.09, 210.19]

/** 英语 5 个题号栏：题自上而下，选项横排 */
function engBlock(x0: number, dx: number, first: number, count: number, options: number): QuestionBlock {
  const aCells = Array.from({ length: count }, (_, i) => ({
    q: first + i,
    x: x0,
    y: i < 5 ? ENG_ROWS_A[i] : ENG_ROWS_B[i - 5],
  }))
  return { aCells, step: { dx, dy: 0 }, options }
}

function englishBlocks(): QuestionBlock[] {
  return [
    engBlock(34.42, 5.143, 1, 10, 4),
    engBlock(63.44, 5.143, 11, 10, 4),
    engBlock(95.51, 5.12, 21, 10, 4),
    engBlock(125.03, 5.147, 31, 10, 4),
    engBlock(156.53, 5.06, 41, 5, 7),
  ]
}

/* ------------------------------- 政治 ------------------------------- */

/** 政治：题自左而右、选项 A–D 自上而下 */
const POL_SINGLE_X = [57.41, 87.76, 118.11, 148.53]
const POL_MULTI_X = [57.41, 87.76, 118.11, 148.53, 178.95]
const POL_SINGLE_ROW_TOP = 158.75
const POL_MULTI_ROW_TOP = 187.11
/** 组内相邻两题的 x 间距 */
const POL_Q_PITCH = 5.12
/** A–D 的行距 */
const POL_OPTION_PITCH = 4.14

function politicsBlocks(): QuestionBlock[] {
  const single: { q: number; x: number; y: number }[] = []
  POL_SINGLE_X.forEach((gx, g) => {
    for (let i = 0; i < 4; i++) single.push({ q: g * 4 + i + 1, x: +(gx + i * POL_Q_PITCH).toFixed(2), y: POL_SINGLE_ROW_TOP })
  })

  const multi: { q: number; x: number; y: number }[] = []
  POL_MULTI_X.forEach((gx, g) => {
    for (let i = 0; i < 4; i++) {
      const q = 17 + g * 4 + i
      if (q <= 33) multi.push({ q, x: +(gx + i * POL_Q_PITCH).toFixed(2), y: POL_MULTI_ROW_TOP })
    }
  })

  return [
    { aCells: single, step: { dx: 0, dy: POL_OPTION_PITCH }, options: 4 },
    { aCells: multi, step: { dx: 0, dy: POL_OPTION_PITCH }, options: 4, multi: true },
  ]
}

/* ------------------------------- 卡片表 ------------------------------- */

export const OFFICIAL_ANSWER_CARDS: readonly OfficialAnswerCard[] = [
  {
    id: 'official-math',
    name: '数学试题答题卡',
    subject: '数学（一）/（二）/（三）',
    description: 'A3 横向双面共 6 页，每面三折。第 1 页是报考单位、考生姓名、准考证号涂卡区与第 1~3 页，'
      + '含选择题 1–10 涂卡、填空题 11–16、解答题 17–22 的作答框。',
    faces: ['/answer-sheet/math-1.webp', '/answer-sheet/math-2.webp'],
    foldPanels: 3,
    totalPages: 6,
    idLattice: { x0: 76.26, y0: 54.36, colPitch: 5.02, rowPitch: 3.3022, cols: 15, rows: 10, ...ID_BOX },
    blocks: [mathBlock()],
    institutionBox: { left: 20.01, top: 48.64, width: 51.94, height: 13.46, fontSize: 5 },
    nameBox: { left: 20.13, top: 73.16, width: 51.82, height: 13.59, fontSize: 5 },
  },
  {
    id: 'official-english1',
    name: '英语（一）试题答题卡',
    subject: '英语（一）',
    description: 'A3 横向双面共 4 页，每面对折。第 1 页是客观题涂卡区（Section I 完形填空 1–20、'
      + 'Section II 阅读 Part A 21–40、Part B 41–45 每题 7 个选项），第 2 页起是 Part C 翻译与写作作答区。',
    faces: ['/answer-sheet/english-1.webp', '/answer-sheet/english-2.webp'],
    foldPanels: 2,
    totalPages: 4,
    idLattice: WIDE_ID_LATTICE,
    blocks: englishBlocks(),
    institutionBox: WIDE_INSTITUTION_BOX,
    nameBox: WIDE_NAME_BOX,
  },
  {
    id: 'official-politics',
    name: '思想政治理论试题答题卡',
    subject: '思想政治理论',
    description: 'A3 横向三面共 6 页，每面对折。第 1 页是单项选择题 1–16 与多项选择题 17–33 的涂卡区，'
      + '其余是第 34–38 题分析题的作答框。',
    faces: ['/answer-sheet/politics-1.webp', '/answer-sheet/politics-2.webp', '/answer-sheet/politics-3.webp'],
    foldPanels: 2,
    totalPages: 6,
    idLattice: WIDE_ID_LATTICE,
    blocks: politicsBlocks(),
    institutionBox: WIDE_INSTITUTION_BOX,
    nameBox: WIDE_NAME_BOX,
  },
]

export function officialCardById(id: string): OfficialAnswerCard | undefined {
  return OFFICIAL_ANSWER_CARDS.find((card) => card.id === id)
}

/** 客观题所有可涂的格 */
export interface ObjectiveCell {
  q: number
  option: number
  x: number
  y: number
  boxW: number
  boxH: number
  multi: boolean
}

export function objectiveCells(card: OfficialAnswerCard): ObjectiveCell[] {
  const out: ObjectiveCell[] = []
  for (const block of card.blocks) {
    for (const a of block.aCells) {
      for (let o = 0; o < block.options; o++) {
        out.push({
          q: a.q, option: o,
          x: +(a.x + o * block.step.dx).toFixed(2),
          y: +(a.y + o * block.step.dy).toFixed(2),
          boxW: OBJ_BOX.boxW, boxH: OBJ_BOX.boxH,
          multi: !!block.multi,
        })
      }
    }
  }
  return out
}

export function allQuestions(card: OfficialAnswerCard): number[] {
  return card.blocks.flatMap((b) => b.aCells.map((a) => a.q)).sort((a, b) => a - b)
}

/** 一道题在卡上占的那一行：圈选高亮用「行框」，点题号回跳用「整行热区」 */
export interface QuestionRow {
  q: number
  /** 行框（只包住圆圈那一排） */
  left: number
  top: number
  width: number
  height: number
  /** 整行热区（从题号左边一直到最后一个圈）——圆圈自带热区叠在上面，所以点圈仍是作答 */
  hitLeft: number
  hitTop: number
  hitWidth: number
  hitHeight: number
}

export function questionRows(card: OfficialAnswerCard): QuestionRow[] {
  const byQ = new Map<number, ObjectiveCell[]>()
  for (const cell of objectiveCells(card)) {
    const list = byQ.get(cell.q)
    if (list) list.push(cell)
    else byQ.set(cell.q, [cell])
  }
  return [...byQ.entries()].map(([q, cells]) => {
    const xs = cells.map((c) => c.x)
    const ys = cells.map((c) => c.y)
    const { boxW, boxH } = cells[0]
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    return {
      q,
      left: +(minX - boxW / 2 - 1).toFixed(2),
      top: +(minY - boxH / 2 - 1).toFixed(2),
      width: +(maxX - minX + boxW + 2).toFixed(2),
      height: +(boxH + 2).toFixed(2),
      // 题号印在第一个圆圈的左侧，热区往左多留一格半
      hitLeft: +(minX - boxW * 2.5).toFixed(2),
      hitTop: +(minY - boxH / 2).toFixed(2),
      hitWidth: +(maxX - minX + boxW * 3.5).toFixed(2),
      hitHeight: +boxH.toFixed(2),
    }
  })
}

/** 多选题的题号集合 */
export function multiQuestions(card: OfficialAnswerCard): Set<number> {
  return new Set(card.blocks.filter((b) => b.multi).flatMap((b) => b.aCells.map((a) => a.q)))
}

/** 准考证号某一数位、某个数字的格 */
export function idCell(card: OfficialAnswerCard, pos: number, digit: number) {
  const l = card.idLattice
  return { x: +(l.x0 + pos * l.colPitch).toFixed(2), y: +(l.y0 + digit * l.rowPitch).toFixed(2), boxW: l.boxW, boxH: l.boxH }
}

export function emptyDraft(): OfficialCardDraft {
  return { institution: '', candidateName: '', idDigits: Array.from({ length: 15 }, () => null), answers: {} }
}

/** 准考证号输入框的值：按位拼出来，没涂的位留空 */
export function idDigitsToText(digits: (number | null)[]): string {
  return digits.map((d) => (d === null ? '' : String(d))).join('')
}

/** 文本 -> 15 位数字数组（非数字丢掉，最多 15 位） */
export function textToIdDigits(text: string): (number | null)[] {
  const clean = text.replace(/\D/g, '').slice(0, 15).split('').map(Number)
  return Array.from({ length: 15 }, (_, i) => (i < clean.length ? clean[i] : null))
}
