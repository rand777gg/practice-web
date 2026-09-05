/**
 * 试卷封面 (paper-cover): 每个 ExamTemplate 可选自带一张封面页,
 * 从 PDF 首页解析 (位置感知), 也可以在编辑器里手动编辑。
 *
 * 设计原则: 封面是结构化的「语义块」, 不是自由 HTML —— 这样:
 *   1. 编辑器可以直接渲染表单, 用户修改字段即可, 不需要写 HTML;
 *   2. 渲染时 PaperPreview 用固定排版, 跨模板风格一致;
 *   3. 后续可以一键导出为打印 / PDF, 不依赖用户能否写富文本。
 */
import type { QuestionType } from '@/types'

export interface ExamTemplateCoverInfoRow {
  /** 行首标签: "考生编号" / "报考单位" / ... */
  label: string
  /** 框数 (>=1 表示「N 个填涂小方块」, 0 表示「一段长空白」) */
  boxes: number
  /** 留空按布局自动伸展 */
  widthMm?: number
}

export type ExamTemplateCoverBlockKind = 'heading' | 'paragraph' | 'rule'

export interface ExamTemplateCoverBlock {
  kind: ExamTemplateCoverBlockKind
  /** heading/paragraph 时为文本, rule 时可空 */
  text?: string
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 附加块落位: 默认封面内; header/footer 交给版式渲染 */
  placement?: 'header' | 'footer' | 'cover-end'
}

export interface ExamTemplateCover {
  /** 左上角密级 / 装订条: "绝密★启用前" / "密封线内不要答题" 等 */
  banner?: string | null
  /** 居中考试名 (主标题上方那行, 例如 "2025 年全国硕士研究生招生考试") */
  examName?: string | null
  /** 主标题 (大号居中, 例如 "计算机学科专业基础") */
  title?: string | null
  /** 主标题下副标题 (例如 "（科目代码：408）") */
  codeLine?: string | null
  /** 居中加粗副标题 (例如 "考生注意事项") */
  noticeTitle?: string | null
  /** 编号注意事项列表 (1./2./3. ...), 编辑器中按行编辑 */
  notices?: string[] | null
  /** 注意事项下方居中小字 (例如 "（以下信息考生必须认真填写）") */
  infoHint?: string | null
  /** 填涂信息表: 每行 [label, boxes] */
  infoTable?: ExamTemplateCoverInfoRow[] | null
  /** 自定义附加块, 排在前述语义块之后 */
  customBlocks?: ExamTemplateCoverBlock[] | null
}

/** 封面是否「非空」(只要有一个字段非空就算有封面) */
export function hasCoverContent(c: ExamTemplateCover | null | undefined): boolean {
  if (!c) return false
  return Boolean(
    c.banner || c.examName || c.title || c.codeLine || c.noticeTitle
    || (c.notices && c.notices.length > 0)
    || c.infoHint
    || (c.infoTable && c.infoTable.length > 0)
    || (c.customBlocks && c.customBlocks.length > 0),
  )
}

/**
 * 画布双击就地改文字: 按字段/下标把新文字写回 cover (空值 = 删除该字段/该条)。
 * - field='notice' + index: 修改 cover.notices 的第 index 条, 清空则该条被移除;
 * - 其它 field 与 ExamTemplateCover 的字符串字段同名 (banner/examName/title/codeLine/noticeTitle/infoHint)。
 */
export function setCoverFieldText(
  cover: ExamTemplateCover,
  field: string,
  index: number | undefined,
  value: string,
): ExamTemplateCover {
  if (field === 'notice') {
    const cur = cover.notices ?? []
    if (index == null || index < 0 || index >= cur.length) return cover
    const next = value.trim()
      ? cur.map((n, i) => (i === index ? value : n))
      : cur.filter((_, i) => i !== index)
    return { ...cover, notices: next.length ? next : null }
  }
  const out = { ...cover } as Record<string, unknown>
  if (value.trim()) out[field] = value
  else delete out[field]
  return out as unknown as ExamTemplateCover
}

/**
 * 把封面自定义块数组中「封面内可视」的第 from 个块移到第 to 个槽位(0 基, 均可视槽位)。
 * placement 为 header/footer 的块不渲染在封面上, 保持原位; 可视块的相对顺序按新槽位重排。
 * from === to 或无块可移时原样返回。
 */
export function moveCoverCustomBlocks(
  blocks: ExamTemplateCoverBlock[] | null | undefined,
  from: number,
  to: number,
): ExamTemplateCoverBlock[] {
  const src = blocks ?? []
  const visSlots: number[] = []
  src.forEach((b, i) => {
    if (b.placement === 'header' || b.placement === 'footer') return
    visSlots.push(i)
  })
  if (visSlots.length < 2) return src
  if (from < 0 || from >= visSlots.length || from === to) return src
  const t = Math.min(visSlots.length - 1, Math.max(0, to))
  const order = [...visSlots]
  const [moved] = order.splice(from, 1)
  order.splice(t, 0, moved)
  const slotOf = new Map<number, number>()
  visSlots.forEach((slot, k) => slotOf.set(slot, order[k]))
  return src.map((b, i) => (slotOf.has(i) ? src[slotOf.get(i)!] : b))
}

/* -------------------- 题型名 → QuestionType 映射 -------------------- */

const TYPE_NAME_MAP: Array<{ re: RegExp; type: QuestionType }> = [
  { re: /单项选择/, type: 'single_choice' },
  { re: /多项选择/, type: 'multi_select' },
  { re: /判断改错|改正/, type: 'judge_correct' },
  { re: /判断/, type: 'true_false' },
  { re: /填空|填入/, type: 'fill_blank' },
  { re: /编程|算法设计.*程序/, type: 'coding' },
  { re: /综合应用|应用题|案例分析/, type: 'analysis' },
  { re: /论述|简答|问答题/, type: 'short_answer' },
]

export function mapQuestionTypeName(name: string): QuestionType | null {
  for (const { re, type } of TYPE_NAME_MAP) if (re.test(name)) return type
  return null
}

/* -------------------- 大题头解析 (sections 预设) -------------------- */

export interface ParsedSection {
  /** 罗马序号: 一/二/三... */
  ordinal: string
  /** 大题名 (题干中文) */
  name: string
  /** 推断的题型 */
  type: QuestionType | null
  /** 题号范围 [from, to] */
  range: [number, number] | null
  /** 该大题总题数 */
  count: number
  /** 每题分值 (若可推断) */
  score: number
  /** 该大题总分 (若原文出现) */
  total: number | null
}

/**
 * 把 PDF 全文拼接后的字符串喂进来, 解析出大题头列表。
 * 兼容中英文符号 / 半全角波浪号 / 「共 N 分」「每小题 N 分」等常见写法。
 */
export function parseSectionsFromText(allText: string): ParsedSection[] {
  const out: ParsedSection[] = []
  // 允许的序号集: 一二三四五六七八九十 + 阿拉伯数字 (1./2.)
  const ordinalRe = /([一二三四五六七八九十]{1,3}|[0-9]{1,2})[、.]/
  // 题号范围: 第 1~40 小题 / 第 41～47 题 / 第 1-40 题
  const rangeRe = /第\s*(\d+)\s*[~～\-—]\s*(\d+)\s*[小]?题?/
  const rangeSingleRe = /第\s*(\d+)\s*[小]?题(?!\s*[~～\-—])/
  // 共 N 分 / 每小题 N 分
  const totalRe = /共\s*(\d+)\s*分/
  const eachRe = /每\s*[小]?题\s*(\d+)\s*分/

  const lines = allText.split(/[\n\r]+/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const m = line.match(ordinalRe)
    if (!m) continue
    const ordinal = m[1]
    const rest = line.slice(m.index! + m[0].length).trim()
    if (!rest || rest.length < 4) continue

    // 必须含有「题」字才算大题 (避开「一、xxx」「一、回答问题」等)
    if (!/[题分]/.test(rest)) continue

    // 解析 range / total / each
    let range: [number, number] | null = null
    let hasRange = false
    const rm = rest.match(rangeRe)
    if (rm) {
      range = [Number(rm[1]), Number(rm[2])]
      hasRange = true
    } else {
      const sm = rest.match(rangeSingleRe)
      if (sm) {
        range = [Number(sm[1]), Number(sm[1])]
        hasRange = true
      }
    }

    const totalM = rest.match(totalRe)
    const eachM = rest.match(eachRe)

    // 关键过滤: 大题头几乎必带「第 N 题/小题 / 共 N 分 / 每小题 N 分」之一。
    // 不带则多半是题干行 (如「41.（15分）已知…」), 跳过, 避免误判。
    if (!hasRange && !totalM && !eachM) continue

    // 推断 name: 截到第一个标点/题号/共/每之前
    let name = rest
    const cut = name.search(/[：:。,\s]第|第\s*\d|共\s*\d|每\s*[小]?题/)
    if (cut > 0) name = name.slice(0, cut).trim()
    name = name.replace(/[：:。,，.\s]+$/, '').trim()
    if (!name) continue

    const type = mapQuestionTypeName(name)
    let count = 0
    if (range) count = range[1] - range[0] + 1
    const total = totalM ? Number(totalM[1]) : null
    const score = eachM ? Number(eachM[1]) : (total && count ? Math.round(total / count) : 0)

    out.push({ ordinal, name, type, range, count: count || score || 0, score, total })
  }
  // 去重: 同 ordinal 仅保留第一次出现
  const seen = new Set<string>()
  return out.filter((s) => (seen.has(s.ordinal) ? false : (seen.add(s.ordinal), true)))
}

/* -------------------- 封面解析 (page-1, 位置感知) -------------------- */

export interface PdfItem {
  str: string
  x: number
  y: number
  w: number
  h: number
  size: number
  font: string
}

/** 一行: 同 y 坐标的 items 拼起来, 按 x 排序 */
export interface PdfLine {
  text: string
  x: number
  y: number
  w: number
  h: number
  size: number
}

/** 一页: 该页全部文本项 + 页面尺寸(px, scale=1) */
export interface PdfPage {
  items: PdfItem[]
  width: number
  height: number
}

export function groupItemsToLines(items: PdfItem[], yTol = 2): PdfLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: PdfLine[] = []
  let cur: PdfItem[] = []
  let curY = -1
  const flush = () => {
    if (!cur.length) return
    const sortedCur = [...cur].sort((a, b) => a.x - b.x)
    const text = sortedCur.map((i) => i.str).join('').trim()
    const minX = Math.min(...sortedCur.map((i) => i.x))
    const maxX = Math.max(...sortedCur.map((i) => i.x + i.w))
    const minY = Math.min(...sortedCur.map((i) => i.y))
    const maxY = Math.max(...sortedCur.map((i) => i.y + i.h))
    if (text) {
      lines.push({
        text,
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        size: Math.max(...sortedCur.map((i) => i.size)),
      })
    }
    cur = []
  }
  for (const it of sorted) {
    if (curY < 0 || Math.abs(it.y - curY) <= yTol) {
      cur.push(it)
      curY = curY < 0 ? it.y : (curY + it.y) / 2
    } else {
      flush()
      cur.push(it)
      curY = it.y
    }
  }
  flush()
  return lines
}

/**
 * 把首页 items 转成结构化封面。
 * 算法: 用页面宽高 + 字体大小 + 对齐方式识别「密级条 / 居中标题组 / 居中副标题 / 编号列表 / 信息表」。
 */
export function parseCoverFromItems(items: PdfItem[], pageWidth: number, pageHeight: number): ExamTemplateCover | null {
  if (!items.length) return null
  const lines = groupItemsToLines(items)
  if (!lines.length) return null

  const cx = pageWidth / 2
  const isCentered = (l: PdfLine) => Math.abs((l.x + l.w / 2) - cx) < pageWidth * 0.12

  const sizes = lines.map((l) => l.size)
  const medSize = [...sizes].sort((a, b) => a - b)[Math.floor(sizes.length / 2)] || 12

  // 1) banner: 左上角 (x < pageWidth*0.35, y < pageHeight*0.1)
  let banner: string | null = null
  const bannerLine = lines.find((l) => l.x < pageWidth * 0.35 && l.y < pageHeight * 0.12 && l.text.length <= 12)
  if (bannerLine) banner = bannerLine.text

  // 2) 居中标题组: 在中段 (0.15 ~ 0.6) 的居中行, 按字号倒序选 3 行
  const centeredMid = lines.filter((l) => isCentered(l) && l.y > pageHeight * 0.15 && l.y < pageHeight * 0.55)
  const titleGroup = [...centeredMid].sort((a, b) => b.size - a.size).slice(0, 3)
  // 按 y 排序: 上面 = examName, 中间 = title (最大字号), 下面 = codeLine
  titleGroup.sort((a, b) => a.y - b.y)
  let examName: string | null = null
  let title: string | null = null
  let codeLine: string | null = null
  if (titleGroup.length >= 1) {
    const biggest = titleGroup.reduce((a, b) => (b.size > a.size ? b : a))
    title = biggest.text
    const idx = titleGroup.indexOf(biggest)
    const above = titleGroup.slice(0, idx).find((l) => l.size < biggest.size)
    const below = titleGroup.slice(idx + 1).find((l) => l.size < biggest.size)
    if (above) examName = above.text
    if (below) codeLine = below.text
  }

  // 3) noticeTitle: 居中、加粗(用大小判断)、中段
  let noticeTitle: string | null = null
  const candNT = lines.find((l) => isCentered(l) && l.size >= medSize * 1.05 && /考生|应试|注意|作答/.test(l.text) && l.y > pageHeight * 0.5)
  if (candNT) noticeTitle = candNT.text

  // 4) notices: 以 "1." / "2." / "一" 开头 / 阿拉伯数字行
  const noticeRe = /^[\s(（]?([0-9]{1,2})[.)、]\s*(.+)/
  const noticeStarts: { idx: number; text: string }[] = []
  lines.forEach((l, i) => {
    const m = l.text.match(noticeRe)
    if (m && l.x < pageWidth * 0.4 && l.y > pageHeight * 0.5) {
      noticeStarts.push({ idx: i, text: m[2] })
    }
  })
  // 合并段落: 把序号行下面若干相邻非序号行并入同一段
  const notices: string[] = []
  if (noticeStarts.length) {
    for (let i = 0; i < noticeStarts.length; i++) {
      const start = noticeStarts[i].idx
      const end = i + 1 < noticeStarts.length ? noticeStarts[i + 1].idx : lines.length
      const para = lines.slice(start, end).map((l) => l.text).join('').trim()
      const cleaned = para.replace(/^[\s(（]?[0-9]{1,2}[.)、]\s*/, '').trim()
      notices.push(cleaned)
    }
  }

  // 5) infoHint: 中下段、居中、字号小、含「以下」「考生」等关键字
  let infoHint: string | null = null
  const hintLine = lines.find(
    (l) => isCentered(l) && l.y > pageHeight * 0.65 && /以下|考生/.test(l.text) && l.size <= medSize,
  )
  if (hintLine) infoHint = hintLine.text

  // 6) infoTable: 在底部 (y > pageHeight*0.75) 识别: 同一行有连续等宽小 items = 编号框
  //    简化: 找底部连续的多个 size≈同、宽度≈同的 items, 视为框
  const bottomItems = items.filter((it) => it.y > pageHeight * 0.7)
  const boxesByRow = new Map<string, PdfItem[]>()
  for (const it of bottomItems) {
    // 按 y 聚类, 容差 1.5
    let key = ''
    for (const k of boxesByRow.keys()) {
      if (Math.abs(Number(k) - it.y) < 3) {
        key = k
        break
      }
    }
    if (!key) key = String(it.y)
    const arr = boxesByRow.get(key) ?? []
    arr.push(it)
    boxesByRow.set(key, arr)
  }
  const infoTable: ExamTemplateCoverInfoRow[] = []
  for (const [, arr] of boxesByRow) {
    const sorted = [...arr].sort((a, b) => a.x - b.x)
    if (sorted.length < 4) continue
    // 取前一段 label 文字 (大概率出现在同一行最左/同一区域小字)
    const labelItem = sorted[0]
    const labelText = labelItem.str
    if (!labelText || labelText.length > 8) continue
    const widths = sorted.slice(1).map((s) => s.w)
    const avg = widths.reduce((a, b) => a + b, 0) / widths.length
    const similar = widths.every((w) => Math.abs(w - avg) / avg < 0.4)
    if (!similar) continue
    infoTable.push({ label: labelText, boxes: sorted.length - 1 })
  }

  // 至少要有 title 或 banner 才算解析到东西
  if (!title && !banner && noticeStarts.length === 0) return null

  const cover: ExamTemplateCover = {
    banner,
    examName,
    title,
    codeLine,
    noticeTitle,
    notices: notices.length ? notices : null,
    infoHint,
    infoTable: infoTable.length ? infoTable : null,
    customBlocks: null,
  }
  return cover
}

/* -------------------- PDF 加载与解析入口 -------------------- */

/**
 * 在浏览器里用 pdfjs-dist 加载一份 PDF 并把所有页文本项 + 页面尺寸抽出来。
 * 复用项目里 PdfViewer 的 worker 配置方式 (调用方需先设置过 pdfjsLib.GlobalWorkerOptions.workerSrc)。
 */
export async function loadPdfItems(pdfjsLib: typeof import('pdfjs-dist'), source: ArrayBuffer | Uint8Array): Promise<PdfPage[]> {
  const pdf = await pdfjsLib.getDocument({ data: source }).promise
  const pages: PdfPage[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    const items: PdfItem[] = []
    for (const it of tc.items) {
      if (!('str' in it)) continue
      const tr = (it as { transform: number[] }).transform
      const x = tr[4]
      const yTop = vp.height - tr[5]
      const size = Math.hypot(tr[2], tr[3])
      items.push({
        str: (it as { str: string }).str,
        x: Math.round(x * 10) / 10,
        y: Math.round(yTop * 10) / 10,
        w: Math.round((it as { width: number }).width * 10) / 10,
        h: Math.round((it as { height: number }).height * 10) / 10,
        size: Math.round(size * 10) / 10,
        font: (it as { fontName: string }).fontName,
      })
    }
    pages.push({ items, width: vp.width, height: vp.height })
  }
  return pages
}

export interface ParsedPdfResult {
  /** 首页解析出的封面; 无法识别时为 null */
  cover: ExamTemplateCover | null
  /** 大题头列表 (sections 预设) */
  sections: ParsedSection[]
  /** 总页数 */
  pageCount: number
  /** 首页是否含文本层 (false 表示扫描件, 解析不出封面) */
  hasTextLayer: boolean
}

/**
 * 一站式: 加载 + 解析封面 + 解析大题头。
 * 调用方需要负责 pdfjsLib 的 worker 配置 (与项目其它用法一致)。
 */
export async function parsePdf(pdfjsLib: typeof import('pdfjs-dist'), source: ArrayBuffer | Uint8Array): Promise<ParsedPdfResult> {
  const pages = await loadPdfItems(pdfjsLib, source)
  const first = pages[0]
  const allText = pages
    .map((p) => p.items.map((it) => it.str).join(''))
    .join('\n')
  const cover = first ? parseCoverFromItems(first.items, first.width, first.height) : null
  const sections = parseSectionsFromText(allText)
  return {
    cover,
    sections,
    pageCount: pages.length,
    hasTextLayer: first ? first.items.length > 0 : false,
  }
}