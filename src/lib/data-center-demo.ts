/**
 * 数据中心 DEMO 数据：题目数量披露 + 用户知识点选择分布（弦图）。
 * 全部为内置示例统计，不接数据库。
 */

export interface DataCenterStat {
  label: string
  value: string
  hint?: string
}

export const DATA_CENTER_STATS: DataCenterStat[] = [
  { label: '题库总题量', value: '28,640', hint: '含解析 26,102 题（91.1%）' },
  { label: '覆盖专业课', value: '6', hint: '408 四门 + 数据库 / 编译原理' },
  { label: '真题年份跨度', value: '2009–2025', hint: '共 17 个年份' },
  { label: '含公式 / 图表题', value: '3,182', hint: '多模态解析还原' },
  { label: '本月新增', value: '1,240', hint: '采集去重后入库' },
  { label: '累计作答', value: '4,182,900', hint: '近 30 日 386,400 次' },
]

export interface QuestionCountRow {
  topicId: string
  total: number
  /** 客观题（选择 / 填空） */
  objective: number
  /** 主观题（综合 / 算法设计） */
  subjective: number
  withAnalysisRate: number
  addedThisMonth: number
  yearRange: string
}

export const QUESTION_COUNTS: QuestionCountRow[] = [
  { topicId: 'ds', total: 6840, objective: 4620, subjective: 2220, withAnalysisRate: 94, addedThisMonth: 286, yearRange: '2009–2025' },
  { topicId: 'co', total: 5320, objective: 3860, subjective: 1460, withAnalysisRate: 92, addedThisMonth: 214, yearRange: '2009–2025' },
  { topicId: 'os', total: 4960, objective: 3480, subjective: 1480, withAnalysisRate: 93, addedThisMonth: 198, yearRange: '2009–2025' },
  { topicId: 'cn', total: 4720, objective: 3320, subjective: 1400, withAnalysisRate: 90, addedThisMonth: 176, yearRange: '2009–2025' },
  { topicId: 'db', total: 3860, objective: 2740, subjective: 1120, withAnalysisRate: 88, addedThisMonth: 212, yearRange: '2012–2025' },
  { topicId: 'cc', total: 2940, objective: 1980, subjective: 960, withAnalysisRate: 86, addedThisMonth: 154, yearRange: '2013–2025' },
]

export interface ChordAxisItem {
  id: string
  name: string
}

export interface ChordPreset {
  key: string
  label: string
  desc: string
  rowLabel: string
  colLabel: string
  centerLabel: string
  rows: ChordAxisItem[]
  cols: ChordAxisItem[]
  /** matrix[行下标][列下标]，表示该组合下用户勾选 / 标记的知识点条目数 */
  matrix: number[][]
}

const KP_COLS: ChordAxisItem[] = [
  { id: 'concept', name: '概念理解' },
  { id: 'calc', name: '计算推导' },
  { id: 'algo', name: '算法实现' },
  { id: 'proof', name: '证明推理' },
  { id: 'apply', name: '综合应用' },
]

const TOPIC_ROWS: ChordAxisItem[] = [
  { id: 'ds', name: '数据结构与算法' },
  { id: 'co', name: '计算机组成原理' },
  { id: 'os', name: '操作系统' },
  { id: 'cn', name: '计算机网络' },
  { id: 'db', name: '数据库系统原理' },
  { id: 'cc', name: '编译原理' },
]

const GROUP_ROWS: ChordAxisItem[] = [
  { id: 'fresh', name: '应届生' },
  { id: 'second', name: '二战' },
  { id: 'cross', name: '跨专业' },
  { id: 'work', name: '在职备考' },
]

export const CHORD_PRESETS: ChordPreset[] = [
  {
    key: 'topic-kp',
    label: '专业课 × 知识点类别',
    desc: '用户在各门专业课下勾选的知识点，按类别汇总。可以看出每门课的「重心」落在哪类知识上。',
    rowLabel: '专业课',
    colLabel: '知识点类别',
    centerLabel: '知识点勾选总量',
    rows: TOPIC_ROWS,
    cols: KP_COLS,
    matrix: [
      [14200, 8600, 19800, 2400, 6400],
      [9800, 16400, 3100, 1800, 4200],
      [11200, 9400, 7800, 1500, 5900],
      [10400, 12100, 2600, 900, 7100],
      [7600, 5200, 3400, 600, 6800],
      [6200, 4100, 5200, 2900, 3600],
    ],
  },
  {
    key: 'group-kp',
    label: '用户群体 × 知识点类别',
    desc: '不同备考背景的人在知识点类别上的偏好差异。跨考与在职备考更集中在概念理解。',
    rowLabel: '用户群体',
    colLabel: '知识点类别',
    centerLabel: '知识点勾选总量',
    rows: GROUP_ROWS,
    cols: KP_COLS,
    matrix: [
      [38400, 32100, 41200, 5200, 24800],
      [18600, 21400, 16800, 4100, 12200],
      [24800, 12600, 9400, 1100, 8600],
      [14200, 9800, 6200, 700, 5100],
    ],
  },
  {
    key: 'group-topic',
    label: '用户群体 × 专业课',
    desc: '各备考群体选择的专业课分布，可以看到跨考与在职备考更偏向非 408 的自命题科目。',
    rowLabel: '用户群体',
    colLabel: '专业课',
    centerLabel: '专业课选择总量',
    rows: GROUP_ROWS,
    cols: TOPIC_ROWS,
    matrix: [
      [24800, 21200, 19800, 18600, 9200, 6400],
      [14200, 12600, 11800, 10400, 6800, 5200],
      [8600, 4200, 5100, 4800, 9800, 8600],
      [6200, 3400, 3900, 3200, 7400, 6900],
    ],
  },
]

export function toChord(preset: ChordPreset) {
  const nodes = [
    ...preset.rows.map((row) => ({ id: row.id, name: row.name, side: 0 as const })),
    ...preset.cols.map((col) => ({ id: col.id, name: col.name, side: 1 as const })),
  ]
  const links = preset.matrix.flatMap((row, rowIndex) =>
    row
      .map((value, colIndex) => ({
        source: preset.rows[rowIndex].id,
        target: preset.cols[colIndex].id,
        value,
      }))
      .filter((link) => link.value > 0),
  )
  return { nodes, links }
}
