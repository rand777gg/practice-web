/**
 * MinerU 四套 type 取值 —— 分文件、分模型。
 *
 * 同一篇文献的产物里, 不同 JSON 用的不是同一套词:
 *   middle.json          → BlockType      (image / title / ref_text / page_footnote …)
 *   content_list.json    → ContentType    (text / image / table / equation …)
 *   content_list_v2.json → ContentTypeV2  (paragraph / equation_interline / text_list …)
 *   model.json           → category_id    (0=Title, 3=ImageBody, 101=ImageFootnote …)
 * 所以标签不能只做一张表 —— 四套各一份, 而且**同一概念在四套里的名字不同**
 * (表格标题: table_caption / (v1 没有) / table_caption / 6), 值本身又可能撞车
 * (四套都有 text, 但 v2 的 text 是段落里的 span, 不是块)。
 *
 * zh 就是块上标签的文字: 用户看到的是 type 取值对应的中文名, 和 MinerU 客户端一致。
 */

export type MineruSource = 'middle' | 'content_list' | 'content_list_v2' | 'model'

/** 配色分组。标签、正文块的左边框、PDF 上的热区框共用同一套色 */
export type BlockTone =
  | 'title' | 'text' | 'list' | 'image' | 'caption' | 'table'
  | 'equation' | 'code' | 'reference' | 'furniture' | 'unknown'

export interface TypeMeta {
  zh: string
  tone: BlockTone
  /**
   * 页面装饰: 页眉/页脚/页码/边注/脚注/注音/丢弃。
   * 阅读页默认把它们藏起来(一页一条, 重复且和内容无关), 检索也跳过 —— 否则搜一个常用词会命中几百条页眉。
   */
  furniture?: boolean
}

/** ① middle.json / layout.json 的 para_blocks、preproc_blocks、discarded_blocks */
export const MIDDLE_TYPES: Record<string, TypeMeta> = {
  image: { zh: '图片', tone: 'image' },
  image_body: { zh: '图片内容', tone: 'image' },
  image_caption: { zh: '图片标题', tone: 'caption' },
  image_footnote: { zh: '图片脚注', tone: 'caption' },
  table: { zh: '表格', tone: 'table' },
  table_body: { zh: '表格内容', tone: 'table' },
  table_caption: { zh: '表格标题', tone: 'caption' },
  table_footnote: { zh: '表格脚注', tone: 'caption' },
  text: { zh: '正文', tone: 'text' },
  title: { zh: '标题', tone: 'title' },
  interline_equation: { zh: '行间公式', tone: 'equation' },
  list: { zh: '列表', tone: 'list' },
  index: { zh: '目录项', tone: 'list' },
  discarded: { zh: '已丢弃', tone: 'furniture', furniture: true },
  code: { zh: '代码', tone: 'code' },
  code_body: { zh: '代码内容', tone: 'code' },
  code_caption: { zh: '代码标题', tone: 'caption' },
  algorithm: { zh: '算法', tone: 'code' },
  ref_text: { zh: '参考文献', tone: 'reference' },
  phonetic: { zh: '注音', tone: 'furniture', furniture: true },
  header: { zh: '页眉', tone: 'furniture', furniture: true },
  footer: { zh: '页脚', tone: 'furniture', furniture: true },
  page_number: { zh: '页码', tone: 'furniture', furniture: true },
  aside_text: { zh: '边注', tone: 'furniture', furniture: true },
  page_footnote: { zh: '脚注', tone: 'furniture', furniture: true },
}

/** ② content_list.json (v1): 平铺, 标题也是 text + text_level */
export const CONTENT_LIST_TYPES: Record<string, TypeMeta> = {
  text: { zh: '正文', tone: 'text' },
  image: { zh: '图片', tone: 'image' },
  table: { zh: '表格', tone: 'table' },
  equation: { zh: '行间公式', tone: 'equation' },
  interline_equation: { zh: '行间公式', tone: 'equation' },
  inline_equation: { zh: '行内公式', tone: 'equation' },
  code: { zh: '代码', tone: 'code' },
}

/** ③ content_list_v2.json: type + content 结构; text/md 等是段落里的 span, 块级是 paragraph/title/… */
export const CONTENT_LIST_V2_TYPES: Record<string, TypeMeta> = {
  title: { zh: '标题', tone: 'title' },
  paragraph: { zh: '正文', tone: 'text' },
  text: { zh: '正文', tone: 'text' },
  md: { zh: 'Markdown', tone: 'text' },
  image: { zh: '图片', tone: 'image' },
  table: { zh: '表格', tone: 'table' },
  simple_table: { zh: '简单表格', tone: 'table' },
  complex_table: { zh: '复杂表格', tone: 'table' },
  equation_interline: { zh: '行间公式', tone: 'equation' },
  equation_inline: { zh: '行内公式', tone: 'equation' },
  list: { zh: '列表', tone: 'list' },
  text_list: { zh: '文本列表', tone: 'list' },
  reference_list: { zh: '参考文献', tone: 'reference' },
  code: { zh: '代码', tone: 'code' },
  code_inline: { zh: '行内代码', tone: 'code' },
  algorithm: { zh: '算法', tone: 'code' },
  phonetic: { zh: '注音', tone: 'furniture', furniture: true },
  page_header: { zh: '页眉', tone: 'furniture', furniture: true },
  page_footer: { zh: '页脚', tone: 'furniture', furniture: true },
  page_number: { zh: '页码', tone: 'furniture', furniture: true },
  page_aside_text: { zh: '边注', tone: 'furniture', furniture: true },
  page_footnote: { zh: '脚注', tone: 'furniture', furniture: true },
}

/**
 * ④ model.json 的 category_id → 名字 + 标签。
 * 数字是模型直接给的类别号, 落库时统一转成 name 存进 block_type, 阅读页才有中文可显示。
 *
 * 3/5(ImageBody/TableBody) 落成 image/table 而不是 image_body/table_body:
 * model.json 是平铺的检测框, 没有 middle.json 那层容器, 那个框本身就是整张图/整张表。
 */
export const CATEGORY_ID_META: Record<number, TypeMeta & { name: string }> = {
  0: { name: 'title', zh: '标题', tone: 'title' },
  1: { name: 'text', zh: '正文', tone: 'text' },
  2: { name: 'abandon', zh: '丢弃', tone: 'furniture', furniture: true },
  3: { name: 'image', zh: '图片', tone: 'image' },
  4: { name: 'image_caption', zh: '图片标题', tone: 'caption' },
  5: { name: 'table', zh: '表格', tone: 'table' },
  6: { name: 'table_caption', zh: '表格标题', tone: 'caption' },
  7: { name: 'table_footnote', zh: '表格脚注', tone: 'caption' },
  8: { name: 'interline_equation', zh: '行间公式', tone: 'equation' },
  9: { name: 'interline_equation_number', zh: '行间公式编号', tone: 'equation' },
  13: { name: 'inline_equation', zh: '行内公式', tone: 'equation' },
  14: { name: 'interline_equation_yolo', zh: '行间公式', tone: 'equation' },
  15: { name: 'ocr_text', zh: 'OCR 文本', tone: 'text' },
  16: { name: 'low_score_text', zh: '低置信文本', tone: 'furniture', furniture: true },
  101: { name: 'image_footnote', zh: '图片脚注', tone: 'caption' },
}

/** ④ 的按名字索引形式, 与前三套同形, 好让查表逻辑只有一条路 */
export const MODEL_TYPES: Record<string, TypeMeta> = Object.fromEntries(
  Object.values(CATEGORY_ID_META).map((m) => [m.name, { zh: m.zh, tone: m.tone, furniture: m.furniture }]),
)

/**
 * 2.7.6 的枚举里没有、但线上产物里见过的名字。
 * 例如 `chart` (我们库里真的有两条) —— 线上服务版本与本地源码不同, 认不出来就按原样显示英文, 很难看。
 */
export const LEGACY_TYPES: Record<string, TypeMeta> = {
  figure: { zh: '图片', tone: 'image' },
  chart: { zh: '图表', tone: 'image' },
  formula: { zh: '公式', tone: 'equation' },
  inline_formula: { zh: '行内公式', tone: 'equation' },
  list_item: { zh: '列表项', tone: 'list' },
  'list-item': { zh: '列表项', tone: 'list' },
  heading: { zh: '标题', tone: 'title' },
  code_block: { zh: '代码', tone: 'code' },
  ref: { zh: '参考文献', tone: 'reference' },
  reference: { zh: '参考文献', tone: 'reference' },
}

export const TYPE_TABLES: Record<MineruSource, Record<string, TypeMeta>> = {
  middle: MIDDLE_TYPES,
  content_list: CONTENT_LIST_TYPES,
  content_list_v2: CONTENT_LIST_V2_TYPES,
  model: MODEL_TYPES,
}

/** 查表顺序: 先按来源查(区分模型), 没给来源就按落库时的可能性从高到低 */
const LOOKUP_ORDER: MineruSource[] = ['middle', 'content_list_v2', 'content_list', 'model']

export function typeMeta(type: string | null | undefined, source?: MineruSource): TypeMeta | null {
  if (!type) return null
  const key = String(type).trim().toLowerCase()
  if (!key) return null
  if (source) return TYPE_TABLES[source][key] ?? LEGACY_TYPES[key] ?? null
  for (const s of LOOKUP_ORDER) {
    const hit = TYPE_TABLES[s][key]
    if (hit) return hit
  }
  return LEGACY_TYPES[key] ?? null
}

/** 块标签上的中文名。认不出来的类型原样显示 —— 总比显示"未知"更有诊断价值 */
export function typeLabel(type: string | null | undefined, source?: MineruSource): string {
  return typeMeta(type, source)?.zh ?? (type ? String(type) : '未标注')
}

export function typeTone(type: string | null | undefined): BlockTone {
  return typeMeta(type)?.tone ?? 'unknown'
}

export function isFurnitureType(type: string | null | undefined): boolean {
  return typeMeta(type)?.furniture === true
}

/** 落库的 block_type 里所有"页面装饰"取值 —— 阅读页默认藏这些, 检索也要跳过 */
export const FURNITURE_TYPES: string[] = [
  ...new Set([
    ...Object.entries(MIDDLE_TYPES).filter(([, m]) => m.furniture).map(([k]) => k),
    ...Object.entries(CONTENT_LIST_V2_TYPES).filter(([, m]) => m.furniture).map(([k]) => k),
    ...Object.entries(MODEL_TYPES).filter(([, m]) => m.furniture).map(([k]) => k),
  ]),
].sort()

/** 代码块: 要用语法高亮渲染的那些。code_caption 不算 —— 它是题注, 按题注排版 */
export const CODE_TYPES = ['code', 'code_body', 'code_block', 'algorithm']

export function isCodeType(type: string | null | undefined): boolean {
  return type ? CODE_TYPES.includes(String(type).trim().toLowerCase()) : false
}

export const TONE_ZH: Record<BlockTone, string> = {
  title: '标题',
  text: '正文',
  list: '列表 / 目录',
  image: '图片',
  caption: '图表题注',
  table: '表格',
  equation: '公式',
  code: '代码 / 算法',
  reference: '参考文献',
  furniture: '页面装饰',
  unknown: '未识别',
}

/** 块上的标签样式。底色是实色 —— 标签会压在正文上, 半透明会透出字来 */
export const TONE_CHIP: Record<BlockTone, string> = {
  title: 'border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
  text: 'border-border/60 bg-muted text-muted-foreground',
  list: 'border-teal-500/30 bg-teal-50 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300',
  image: 'border-violet-500/30 bg-violet-50 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300',
  caption: 'border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300',
  table: 'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300',
  equation: 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300',
  code: 'border-indigo-500/30 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300',
  reference: 'border-orange-500/30 bg-orange-50 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300',
  furniture: 'border-border/50 bg-muted text-muted-foreground/70',
  unknown: 'border-dashed border-border bg-background text-muted-foreground/70',
}

/**
 * 正文块的左边框颜色。只有带 bbox 的块才上色(没有 bbox = 在 PDF 上定位不到),
 * 所以"有颜色"仍然等于"能双向定位", 颜色本身表示类型。
 */
export const TONE_BORDER: Record<BlockTone, string> = {
  title: 'border-l-blue-500/70',
  text: 'border-l-amber-300/60',
  list: 'border-l-teal-500/60',
  image: 'border-l-violet-500/60',
  caption: 'border-l-sky-500/60',
  table: 'border-l-emerald-500/60',
  equation: 'border-l-amber-500/60',
  code: 'border-l-indigo-500/60',
  reference: 'border-l-orange-500/60',
  furniture: 'border-l-border',
  unknown: 'border-l-amber-300/60',
}

/** PDF 热区框的样式(平时透明, 悬停才显形; 选中态由阅读页再加 ring) */
export const TONE_HOTSPOT: Record<BlockTone, string> = {
  title: 'hover:border-blue-500/80 hover:bg-blue-500/15',
  text: 'hover:border-amber-400/70 hover:bg-amber-400/20',
  list: 'hover:border-teal-500/70 hover:bg-teal-500/15',
  image: 'hover:border-violet-500/70 hover:bg-violet-500/15',
  caption: 'hover:border-sky-500/70 hover:bg-sky-500/15',
  table: 'hover:border-emerald-500/70 hover:bg-emerald-500/15',
  equation: 'hover:border-amber-500/70 hover:bg-amber-500/15',
  code: 'hover:border-indigo-500/70 hover:bg-indigo-500/15',
  reference: 'hover:border-orange-500/70 hover:bg-orange-500/15',
  furniture: 'hover:border-border hover:bg-muted/30',
  unknown: 'hover:border-amber-400/70 hover:bg-amber-400/20',
}
