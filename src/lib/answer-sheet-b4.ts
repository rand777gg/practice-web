/**
 * 「招生单位自命题科目答题纸」真实版式（B4 打印）。
 *
 * 几何量逐项量自桌面原件 `自命题科目答题纸（B4打印）.pdf`（8 张 B4 面 = 16 页）：
 *   - 一张 B4 横向 364 × 257mm 上并排两张 B5 竖版 182 × 257mm，双面印刷
 *   - 第 1 页是封面：左侧考生编号条 + 装订线，标题区、招生单位/考试科目填空线、
 *     题号·分数·阅卷人评分表、注意事项框
 *   - 第 2 页起是空白答题页，只有装订线与页脚「第 N 页（共 __ 页）」（__ 是全角空位，由考生填总页数）
 *
 * 单位一律 mm，直接写进 inline style，不做任何缩放换算。
 * 原件的长直线带 ~0.1° 拼版倾斜（同一像素列只有部分高度是黑的），这里按竖直/水平取正。
 * 文字一律用「块顶 = 视觉中心 − 字号 / 2 + line-height:1」定位，比行高估算法更稳。
 */

export const B4_SHEET = { width: 364, height: 257 } as const
export const B5_PAGE = { width: 182, height: 257 } as const

/** CJK 字形在 em 框里大致占 ascent 0.88 / descent 0.12，基线定位要用到 */
export const CJK_ASCENT = 0.88

/** 装订线：距装订边（左页取左边缘、右页取右边缘）的距离 */
export const BINDER = {
  single: 17,
  pair: [21.4, 31.1],
  label: 18.83,
  top: 10,
  bottom: 249.5,
  width: 0.3,
  fontSize: 3.9,
} as const

/** 封面左侧信息条（考生编号 15 格 + 姓名 / 报考专业填空线） */
export const COVER_STRIP = {
  boxLeft: 4.33,
  boxTop: 25,
  boxWidth: 7.05,
  boxHeight: 93.9,
  boxRows: 15,
  lineX: 8.93,
  lineWidth: 0.35,
  labelCenterX: 7.72,
  idLabelCenterY: 128.7,
  nameLine: [142.3, 164.4],
  nameLabelCenterY: 172.7,
  majorLine: [184.2, 219.1],
  majorLabelCenterY: 230,
  fontSize: 3.9,
} as const

/** 封面正文区：标题 / 两行填空 / 评分表 / 注意事项 */
export const COVER_BODY = {
  centerX: 109.8,
  titleFontSize: 6.35,
  titleLineCenters: [26.53, 37.55],
  infoFontSize: 4.95,
  infoLabelLeft: 42.3,
  infoRuleLeft: 87,
  infoRuleRight: 171.6,
  infoRows: [
    { labelCenterY: 60, ruleY: 61.74 },
    { labelCenterY: 70.93, ruleY: 72.67 },
  ],
} as const

export const COVER_TABLE = {
  left: 37.77,
  colDividers: [49.2, 61.91],
  right: 93.83,
  headerTop: 93.24,
  headerHeight: 7.91,
  rowHeight: 7.94,
  rowCount: 15,
  spacerHeight: 7.92,
  totalHeight: 9.99,
  border: 0.2,
  fontSize: 3.73,
  padX: 1.6,
  /** 单元格文字基线固定在行顶下方 6.85mm（原件所有行都是这个偏移，不是垂直居中） */
  baselineOffset: 6.85,
} as const

/**
 * 原件嵌入的三款中文字体（子集名 宋体 / 楷体 / 仿宋）。
 * 逐元素比对字形后确认：标题、填空标签、竖排标签、页脚是「宋体加粗」；
 * 评分表、注意事项是「仿宋」。楷体在正文里没找到用处，原件大概是残留。
 */
export const FONT_SONG_BOLD = '"SimSun", "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif'
export const FONT_FANGSONG = '"FangSong", "STFangsong", "FangSong_GB2312", "Noto Serif CJK SC", "Source Han Serif SC", serif'

export const COVER_NOTICE = {
  left: 102.21,
  top: 101.15,
  right: 172.42,
  bottom: 228.35,
  border: 0.2,
  titleFontSize: 4.23,
  titleCenterY: 111.48,
  fontSize: 3.73,
  lineHeight: 7.41,
  bodyTop: 122.9,
  numberLeft: 104.19,
  textLeft: 110.53,
  /** 原件注意事项是两端对齐的，非末行都撑到 59.87mm 这个栏宽 */
  textWidth: 59.87,
} as const

/**
 * 页脚「第 N 页（共 __ 页）」。
 * 页数总量在原件里就是空的（考生在考场自己填），这里只印页码。
 * 原件正面/背面的页脚横向位置并不一致（封面 113.2mm、背面 75.2mm，同一张纸翻面会左右跳），
 * 这里统一按正文区中线居中。
 */
export const FOOTER = {
  centerX: 106,
  centerY: 247.5,
  fontSize: 3.73,
} as const

/**
 * 注意事项的换行位置照抄原件（原件是固定版式，行是硬折的）。
 * 交给浏览器自动折行的话，只要字体度量差一点点就会多折一行、把正文顶出框外。
 */
export const COVER_NOTICES: readonly (readonly string[])[] = [
  ['考生编号、姓名、报考专业必须写在', '装订线内指定位置。'],
  ['所有答案必须写在答题纸上,做在试', '题纸或草稿纸上的一律无效。'],
  ['答题时必须写清题号。'],
  ['字迹要清楚、保持卷面清洁。一律使', '用黑色或蓝色字迹的钢笔或签字笔', '（同一科目答卷的字迹必须是一种', '颜色）。'],
  ['考生答完试题后，在“共\u3000页”处', '填写答卷的总共页数（包括第 1 页）。'],
  ['全国统考、全国联考科目不得使用此', '答题纸，否则，答题结果一律无效。'],
  ['禁止做任何与考试无关的标记。'],
] as const

export const COVER_TABLE_ROWS = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五',
] as const

/** 答题页装订线两种画法：外侧边是双线带「装订线」字样，折缝那侧只有一条单线 */
export type BinderStyle = 'pair' | 'single'

/** 拼版后的一个 B5 页槽位 */
export interface B4PageSlot {
  pageNo: number
  /** 装订边在哪一侧（左页取左、右页取右） */
  binderSide: 'left' | 'right'
  binderStyle: BinderStyle
}

export interface B4SheetFace {
  faceIndex: number
  /** 正面放第 1、2 页，背面放第 3、4 页，依此类推 */
  isFront: boolean
  left: B4PageSlot | null
  right: B4PageSlot | null
}

/**
 * 把 1..totalPages 拼到 B4 双面。
 * 装订边永远贴着 B4 纸的外侧：正面看是整张纸的左边缘，翻面后落在右边缘，
 * 所以 binderSide 只由正/背面决定；而双线带「装订线」字样只画在最外侧那一页
 * （正面左页 / 背面右页），折缝那侧只留一条单线。
 */
export function buildSheetFaces(totalPages: number): B4SheetFace[] {
  const faces: B4SheetFace[] = []
  for (let start = 1; start <= totalPages; start += 2) {
    const faceIndex = faces.length
    const isFront = faceIndex % 2 === 0
    const slot = (pageNo: number, isLeft: boolean): B4PageSlot | null =>
      pageNo > totalPages
        ? null
        : {
            pageNo,
            binderSide: isFront ? 'left' : 'right',
            binderStyle: isFront === isLeft ? 'pair' : 'single',
          }
    faces.push({ faceIndex, isFront, left: slot(start, true), right: slot(start + 1, false) })
  }
  return faces
}

export interface B4AnswerSheetInfo {
  /** 招生单位代码及名称 */
  institution: string
  /** 考试科目代码及名称 */
  subject: string
  /** 考生编号：逐位印进左侧 15 格里，最多 15 位 */
  candidateNo: string
  /** 考生姓名：竖排印在姓名线上 */
  candidateName: string
  /** 报考专业：竖排印在报考专业线上 */
  major: string
  /** 生成多少页（决定要几张 B4 双面）。页脚「共 __ 页」的页数始终留空，由考生在考场手填 */
  totalPages: number
}

export const DEFAULT_B4_INFO: B4AnswerSheetInfo = {
  institution: '',
  subject: '',
  candidateNo: '',
  candidateName: '',
  major: '',
  totalPages: 16,
}
