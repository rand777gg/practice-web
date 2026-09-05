/**
 * 试卷排版 token (paper-layout): 每个 ExamTemplate 可选自带一份版式, 控制整张卷子的
 * 纸张 / 边距 / 字号 / 分栏 / 装订线 / 密封条 / 水印 / 页眉页脚 / 得分框 / 附加块
 * 封面独占页 / 卷首抬头 / 各文本块字体。
 *
 * 设计原则: 与 cover 一样是「结构化 token」, 不是自由 HTML
 *   1. 编辑器直接渲染表单, 用户改字段即可, 不需要写 HTML
 *   2. PaperPreview / PaperOutline / PaperCover 消费同一份 token, 风格一致
 *   3. CSS 变量驱动 (--paper-*), 修改后全局生效
 *
 * 与 ExamTemplateCover 的关系:
 *   cover 只管「封面页写了什么」(标题/注意事项/填涂表)
 *   layout 管「整张卷子的样子」(纸张/边距/字号/水印...)
 *   两者独立, 模板可只设其一或都设。
 */
/** 纸张尺寸 (A4 默认) */
export type PaperSize = 'A4' | 'A3' | 'B5' | 'Letter'

/** 装订线位置 (沿左/右/上装订) */
export type BinderSide = 'left' | 'right' | 'top' | 'none'

/** 密封条位置 (居中横条/左上角/无) */
export type SealPosition = 'top-center' | 'top-left' | 'none'

/** 得分框显示策略 */
export type ScoreBoxMode = 'always' | 'optional' | 'none'

/** 封面文本块 id (每处可独立调字体/字号/行距/段间距) */
export type PaperTextBlockKey =
  | 'coverBanner'       // 左上角密级条
  | 'coverExamName'     // 封面居中考试名
  | 'coverTitle'        // 封面主标题
  | 'coverCode'         // 封面科目代码行
  | 'coverNoticeTitle'  // 封面「考生注意事项」标题
  | 'coverNoticeItem'   // 封面每条注意事项
  | 'coverInfoLabel'    // 封面填涂表行首标签
  | 'coverInfoHint'     // 封面信息表上方提示小字
  | 'paperTitle'        // 卷首大标题 (模板名)
  | 'paperMeta'         // 卷首 meta 行 (学科·时长)
  | 'sectionTitle'      // 分区标题 (一、单项选择题)
  | 'questionStem'      // 题干正文
  | 'questionOption'    // 选项文字

/** 文本块的样式覆写; 全部可选, 缺省=跟随整卷默认 */
export interface PaperTextBlockStyle {
  /** CSS font-family 栈 (如 '"SimSun", serif'), 空=继承整卷字族 */
  fontFamily?: string | null
  /** 字号 (pt), 空=继承 (封面主标题等再按各自 em 基准) */
  fontSizePt?: number | null
  /** 行高倍数, 空=继承整卷行高 */
  lineHeight?: number | null
  /** 段后间距 (mm), 空=保持默认 */
  spacingMm?: number | null
}

export interface PaperMargins {
  topMm: number
  rightMm: number
  bottomMm: number
  leftMm: number
}

/** 直调编辑命中的边: top/right/bottom/left (对应 PaperMargins 的 *Mm 字段) */
export type PaperMarginSide = 'top' | 'right' | 'bottom' | 'left'

/**
 * 预览直调命中的目标: 一个文本块 key(作用于全部同名块)、一条边距,
 * 或封面上某个自定义附加块(仅 heading/paragraph 文本, 调 size/align/bold)。
 * TemplatePaperPreview / PaperOutline / PaperLayoutEditor 共用。
 */
export type PaperPick =
  | { kind: 'tb'; tb: PaperTextBlockKey }
  | { kind: 'margin'; side: PaperMarginSide }
  | { kind: 'coverBlock'; index: number }

/**
 * 画布上的「双击就地改文字」请求:
 * - paperTitle: 卷首大标题 → 写回模板名 (name)
 * - coverField: 封面文字 → 写回 cover 对应字段 (field 与 ExamTemplateCover 字段同名;
 *   field='notice' 时为注意事项第 index 条)
 */
export type PaperTextEditReq =
  | { kind: 'paperTitle' }
  | { kind: 'coverField'; field: string; index?: number }

export interface PaperWatermark {
  enabled: boolean
  text: string
  /** 0..1, 默认 0.08 (很淡) */
  opacity: number
  /** 倾斜角 (deg), 默认 -30 */
  rotationDeg: number
  /** 字号 (pt), 默认 60 */
  fontSizePt: number
  /** 主色 hsl 字符串, 默认 'hsl(var(--foreground))' */
  color?: string
}

export interface PaperHeaderFooter {
  /** 页眉居中文字, 空=不渲染 */
  headerText: string
  /** 页脚居中文字, 可用 {page} / {total} 占位, 空=不渲染 */
  footerText: string
  /** 是否在页脚追加「第 N 页 / 共 M 页」 */
  showPageNumber: boolean
}

export interface PaperBinderLine {
  side: BinderSide
  /** 距纸张边的距离, mm; 默认 10mm */
  offsetMm: number
  /** 装订线宽度, mm; 默认 1mm */
  widthMm: number
}

export interface PaperSealBand {
  position: SealPosition
  text: string
  /** 距纸张边的距离, mm */
  offsetMm: number
  /** 条带高度, mm */
  heightMm: number
  /** 字号 (pt) */
  fontSizePt: number
  /** 背景色 (hsl 字符串), 默认透明 */
  background?: string
}

/** 附加块: v1.22 暂只暴露富文本/HTML, 给「考前须知」「考后签名」等留口子 */
export interface PaperAdditionalBlock {
  /** 锚点: 'cover' = 封面末尾; 'header' = 每页眉; 'footer' = 每页脚 */
  placement: 'cover-end' | 'header' | 'footer'
  /** 文本/HTML; 实际渲染时按 placement 决定是纯文本还是 dangerouslySetInnerHTML */
  content: string
}

export interface ExamTemplateLayout {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  margins: PaperMargins
  /** 基础字号 (pt) */
  baseFontPt: number
  /** 行高倍数 */
  lineHeight: number
  /** 分栏 (1/2/3), 仅在 PaperPreview 'spread' 模式下生效 */
  columns: number
  binderLine: PaperBinderLine
  sealBand: PaperSealBand
  watermark: PaperWatermark
  headerFooter: PaperHeaderFooter
  scoreBox: ScoreBoxMode
  additionalBlocks: PaperAdditionalBlock[]
  /** 封面是否单独占用一整页 (默认 true); false=封面作为卷首头部与正文同页 */
  coverOwnPage: boolean
  /** 卷首是否显示模板标题 (默认 false, 因为封面通常已含考试名) */
  showPaperTitle: boolean
  /** 卷首是否显示 meta 行 (学科·时长·总分, 默认 false) */
  showPaperMeta: boolean
  /** 整卷字族 (CSS font-family 栈); 空=跟随 app 默认 */
  fontFamily?: string | null
  /** 各文本块样式覆写 (可选字段, 全空=不覆写) */
  textBlocks: Partial<Record<PaperTextBlockKey, PaperTextBlockStyle>>
}

/* ----------------- 默认值 ----------------- */

export const PAPER_DIMENSIONS_MM: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  B5: { width: 176, height: 250 },
  Letter: { width: 216, height: 279 },
}

export const DEFAULT_LAYOUT: ExamTemplateLayout = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { topMm: 16, rightMm: 15, bottomMm: 16, leftMm: 15 },
  baseFontPt: 11,
  lineHeight: 1.9,
  columns: 2,
  binderLine: { side: 'none', offsetMm: 10, widthMm: 1 },
  sealBand: { position: 'none', text: '', offsetMm: 4, heightMm: 6, fontSizePt: 9 },
  watermark: { enabled: false, text: '', opacity: 0.08, rotationDeg: -30, fontSizePt: 60 },
  headerFooter: { headerText: '', footerText: '', showPageNumber: false },
  scoreBox: 'optional',
  additionalBlocks: [],
  coverOwnPage: true,
  showPaperTitle: false,
  showPaperMeta: false,
  fontFamily: null,
  textBlocks: {},
}

/* 常用中文字族预设 (value 空 = 不设置, 跟随整卷); labelKey 指向 examTemplate.layout.{labelKey} */
export const LAYOUT_FONT_PRESETS: { value: string; labelKey: 'fontDefault' | 'fontSong' | 'fontHei' | 'fontKai' | 'fontFang' | 'fontMono' }[] = [
  { value: '', labelKey: 'fontDefault' },
  { value: '"SimSun","Songti SC","Noto Serif CJK SC",serif', labelKey: 'fontSong' },
  { value: '"SimHei","PingFang SC","Microsoft YaHei",sans-serif', labelKey: 'fontHei' },
  { value: '"KaiTi","STKaiti","Noto Serif CJK SC",serif', labelKey: 'fontKai' },
  { value: '"FangSong","STFangsong",serif', labelKey: 'fontFang' },
  { value: 'ui-monospace,Consolas,Menlo,monospace', labelKey: 'fontMono' },
]

/* ----------------- 类型守卫 ----------------- */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function pickStr(o: Record<string, unknown>, k: string): string | null {
  const v = o[k]
  return typeof v === 'string' ? v : null
}

function pickNum(o: Record<string, unknown>, k: string, def: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  const v = o[k]
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

function pickBool(o: Record<string, unknown>, k: string, def: boolean): boolean {
  const v = o[k]
  return typeof v === 'boolean' ? v : def
}

/** 从原始 JSON 里挑文本块样式 (兼容 DB 老数据: 顶层 textBlocks / text / fonts 三处都可能存) */
function pickTextBlocks(o: Record<string, unknown>): Partial<Record<PaperTextBlockKey, PaperTextBlockStyle>> {
  const raw = isObject(o.textBlocks) ? o.textBlocks : isObject(o.text) ? o.text : {}
  const out: Partial<Record<PaperTextBlockKey, PaperTextBlockStyle>> = {}
  if (!raw) return out
  for (const [k, v] of Object.entries(raw)) {
    if (!isObject(v)) continue
    const style: PaperTextBlockStyle = {}
    const ff = pickStr(v, 'fontFamily')
    if (ff) style.fontFamily = ff
    const fs = pickNum(v, 'fontSizePt', -1)
    if (fs > 0) style.fontSizePt = fs
    const lh = pickNum(v, 'lineHeight', -1)
    if (lh > 0) style.lineHeight = lh
    const sp = pickNum(v, 'spacingMm', -1)
    if (sp >= 0) style.spacingMm = sp
    if (Object.keys(style).length) out[k as PaperTextBlockKey] = style
  }
  return out
}

/** 把数据库 JSONB 行的 layout 字段归一化为 ExamTemplateLayout, 容错坏数据 */
export function normalizeLayout(raw: unknown): ExamTemplateLayout {
  if (!isObject(raw)) return { ...DEFAULT_LAYOUT }
  const o = raw

  const paperSize: PaperSize = ((): PaperSize => {
    const v = pickStr(o, 'paperSize')
    return v === 'A3' || v === 'B5' || v === 'Letter' ? v : 'A4'
  })()
  const orientation: 'portrait' | 'landscape' = pickStr(o, 'orientation') === 'landscape' ? 'landscape' : 'portrait'

  const marginsRaw = isObject(o.margins) ? o.margins : {}
  const margins: PaperMargins = {
    topMm: pickNum(marginsRaw, 'topMm', DEFAULT_LAYOUT.margins.topMm, 0, 50),
    rightMm: pickNum(marginsRaw, 'rightMm', DEFAULT_LAYOUT.margins.rightMm, 0, 50),
    bottomMm: pickNum(marginsRaw, 'bottomMm', DEFAULT_LAYOUT.margins.bottomMm, 0, 50),
    leftMm: pickNum(marginsRaw, 'leftMm', DEFAULT_LAYOUT.margins.leftMm, 0, 50),
  }

  const baseFontPt = pickNum(o, 'baseFontPt', DEFAULT_LAYOUT.baseFontPt, 8, 18)
  const lineHeight = pickNum(o, 'lineHeight', DEFAULT_LAYOUT.lineHeight, 1, 3)

  const columnsRaw = pickNum(o, 'columns', DEFAULT_LAYOUT.columns, 1, 4)
  const columns = Math.round(columnsRaw) as 1 | 2 | 3 | 4

  const binderRaw = isObject(o.binderLine) ? o.binderLine : {}
  const binderSide: BinderSide = ((): BinderSide => {
    const v = pickStr(binderRaw, 'side')
    return v === 'left' || v === 'right' || v === 'top' ? v : 'none'
  })()
  const binderLine: PaperBinderLine = {
    side: binderSide,
    offsetMm: pickNum(binderRaw, 'offsetMm', 10, 0, 30),
    widthMm: pickNum(binderRaw, 'widthMm', 1, 0, 5),
  }

  const sealRaw = isObject(o.sealBand) ? o.sealBand : {}
  const sealPosition: SealPosition = ((): SealPosition => {
    const v = pickStr(sealRaw, 'position')
    return v === 'top-center' || v === 'top-left' ? v : 'none'
  })()
  const sealBand: PaperSealBand = {
    position: sealPosition,
    text: pickStr(sealRaw, 'text') ?? '',
    offsetMm: pickNum(sealRaw, 'offsetMm', 4, 0, 20),
    heightMm: pickNum(sealRaw, 'heightMm', 6, 2, 20),
    fontSizePt: pickNum(sealRaw, 'fontSizePt', 9, 6, 16),
    background: pickStr(sealRaw, 'background') ?? undefined,
  }

  const watermarkRaw = isObject(o.watermark) ? o.watermark : {}
  const watermark: PaperWatermark = {
    enabled: pickBool(watermarkRaw, 'enabled', false),
    text: pickStr(watermarkRaw, 'text') ?? '',
    opacity: pickNum(watermarkRaw, 'opacity', 0.08, 0, 1),
    rotationDeg: pickNum(watermarkRaw, 'rotationDeg', -30, -90, 90),
    fontSizePt: pickNum(watermarkRaw, 'fontSizePt', 60, 16, 200),
    color: pickStr(watermarkRaw, 'color') ?? undefined,
  }

  const hfRaw = isObject(o.headerFooter) ? o.headerFooter : {}
  const headerFooter: PaperHeaderFooter = {
    headerText: pickStr(hfRaw, 'headerText') ?? '',
    footerText: pickStr(hfRaw, 'footerText') ?? '',
    showPageNumber: pickBool(hfRaw, 'showPageNumber', false),
  }

  const scoreBoxRaw = pickStr(o, 'scoreBox')
  const scoreBox: ScoreBoxMode = scoreBoxRaw === 'always' || scoreBoxRaw === 'none' ? scoreBoxRaw : 'optional'

  const addRaw = Array.isArray(o.additionalBlocks) ? o.additionalBlocks : []
  const additionalBlocks: PaperAdditionalBlock[] = addRaw
    .filter((b): b is Record<string, unknown> => isObject(b))
    .map((b) => {
      const placement = pickStr(b, 'placement')
      const validPlacement: PaperAdditionalBlock['placement'] =
        placement === 'header' || placement === 'footer' || placement === 'cover-end' ? placement : 'cover-end'
      return {
        placement: validPlacement,
        content: pickStr(b, 'content') ?? '',
      }
    })

  return {
    paperSize,
    orientation,
    margins,
    baseFontPt,
    lineHeight,
    columns,
    binderLine,
    sealBand,
    watermark,
    headerFooter,
    scoreBox,
    additionalBlocks,
    coverOwnPage: pickBool(o, 'coverOwnPage', true),
    showPaperTitle: pickBool(o, 'showPaperTitle', false),
    showPaperMeta: pickBool(o, 'showPaperMeta', false),
    fontFamily: pickStr(o, 'fontFamily') ?? null,
    textBlocks: pickTextBlocks(o),
  }
}

/* ----------------- CSS 变量 ----------------- */

/** 把 layout 转成 CSS 变量键值对 (样式属性), 用于 inline style 注入到 paper-sheet 根节点 */
export function layoutToCssVars(layout: ExamTemplateLayout, mode: 'sheet' | 'spread'): Record<string, string | number> {
  const dim = PAPER_DIMENSIONS_MM[layout.paperSize]
  const isLandscape = layout.orientation === 'landscape'
  const widthMm = isLandscape ? dim.height : dim.width
  const heightMm = isLandscape ? dim.width : dim.height

  const padTop = layout.margins.topMm
  const padRight = layout.margins.rightMm
  const padBottom = layout.margins.bottomMm
  const padLeft = layout.margins.leftMm

  // 装订线预留: 把装订线那一侧的 padding 加宽
  const binderExtra = layout.binderLine.side === 'none' ? 0 : layout.binderLine.offsetMm + layout.binderLine.widthMm + 4
  let adjustedPadLeft = padLeft
  let adjustedPadRight = padRight
  if (layout.binderLine.side === 'left') adjustedPadLeft += binderExtra
  if (layout.binderLine.side === 'right') adjustedPadRight += binderExtra
  // 顶部装订不需要额外加 padding (装订线在纸张内顶部)

  const cols = mode === 'spread' ? Math.max(1, layout.columns) : 1

  const vars: Record<string, string | number> = {
    '--paper-width': `${widthMm}mm`,
    '--paper-min-height': `${heightMm}mm`,
    '--paper-padding-top': `${padTop}mm`,
    '--paper-padding-right': `${adjustedPadRight}mm`,
    '--paper-padding-bottom': `${padBottom}mm`,
    '--paper-padding-left': `${adjustedPadLeft}mm`,
    '--paper-font-size': `${layout.baseFontPt}pt`,
    '--paper-line-height': String(layout.lineHeight),
    '--paper-columns': String(cols),
    '--paper-column-gap': '9mm',
    '--paper-binder-side': layout.binderLine.side,
    '--paper-binder-offset': `${layout.binderLine.offsetMm}mm`,
    '--paper-binder-width': `${layout.binderLine.widthMm}mm`,
    '--paper-watermark-text': layout.watermark.text || '""',
    '--paper-watermark-opacity': String(layout.watermark.enabled ? layout.watermark.opacity : 0),
    '--paper-watermark-rotation': `${layout.watermark.rotationDeg}deg`,
    '--paper-watermark-size': `${layout.watermark.fontSizePt}pt`,
    '--paper-watermark-color': layout.watermark.color || 'hsl(var(--foreground))',
    '--paper-header-text': layout.headerFooter.headerText || '""',
    '--paper-footer-text': layout.headerFooter.footerText || '""',
    '--paper-show-page-num': layout.headerFooter.showPageNumber ? '1' : '0',
    '--paper-seal-text': layout.sealBand.text || '""',
    '--paper-seal-position': layout.sealBand.position,
    '--paper-seal-height': `${layout.sealBand.heightMm}mm`,
    '--paper-seal-font-size': `${layout.sealBand.fontSizePt}pt`,
  }

  // 整卷字族
  if (layout.fontFamily) vars['--paper-font-family'] = layout.fontFamily

  return vars
}

/**
 * 取单个文本块的 inline style (fontFamily/fontSize/lineHeight/marginBottom)。
 * inline style 用于稳定覆盖 tailwind/shadcn 类字号 (字号/行高/段距);
 * fontFamily 同时经整卷 --paper-font-family 或此处直接设, 取覆盖优先级更高的 inline。
 * 未设置的字段返回空, 不会覆盖元素默认样式。
 */
export function textBlockInlineStyle(
  layout: ExamTemplateLayout | null | undefined,
  key: PaperTextBlockKey,
): Record<string, string> {
  const s = layout?.textBlocks?.[key]
  if (!s) return {}
  const out: Record<string, string> = {}
  if (s.fontFamily) out.fontFamily = s.fontFamily
  if (s.fontSizePt) out.fontSize = `${s.fontSizePt}pt`
  if (s.lineHeight) out.lineHeight = String(s.lineHeight)
  if (s.spacingMm !== undefined && s.spacingMm !== null) out.marginBottom = `${s.spacingMm}mm`
  return out
}
