/**
 * 错题 / 收藏题导出 DEMO 数据。
 * 「导出模板」与考试的「试卷模板」是两套东西：前者定义题目清单导出的格式与字段，
 * 后者定义试卷在纸上的排版。此处全部为内置示例数据，不接数据库。
 */

export type QuestionSource = 'wrong' | 'favorite'

export type DemoQuestionType = '单项选择' | '多项选择' | '填空' | '综合应用' | '算法设计'

export interface DemoOption {
  key: string
  text: string
}

export interface DemoQuestion {
  id: string
  source: QuestionSource
  topicId: string
  type: DemoQuestionType
  stem: string
  options?: DemoOption[]
  answer: string
  analysis: string
  difficulty: 1 | 2 | 3 | 4 | 5
  tags: string[]
  bankName: string
  /** 错题本字段 */
  wrongCount?: number
  wrongReason?: string
  lastWrongAt?: string
  /** 收藏夹字段 */
  favoritedAt?: string
}

export const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    id: 'q-ds-01',
    source: 'wrong',
    topicId: 'ds',
    type: '单项选择',
    stem: '在含有 n 个结点的二叉排序树中查找一个关键字，最坏情况下的时间复杂度是（　）。',
    options: [
      { key: 'A', text: 'O(1)' },
      { key: 'B', text: 'O(log₂n)' },
      { key: 'C', text: 'O(n)' },
      { key: 'D', text: 'O(nlog₂n)' },
    ],
    answer: 'C',
    analysis:
      '二叉排序树的查找长度取决于树高。当插入序列有序时，二叉排序树退化为单支树，树高为 n，此时查找退化为顺序查找，最坏时间复杂度为 O(n)。',
    difficulty: 2,
    tags: ['二叉排序树', '复杂度'],
    bankName: '数据结构章节精练',
    wrongCount: 3,
    wrongReason: '把最坏情况当成树高 O(log₂n)，忽略了退化成单支树的情形。',
    lastWrongAt: '2026-09-09',
  },
  {
    id: 'q-ds-02',
    source: 'wrong',
    topicId: 'ds',
    type: '算法设计',
    stem: '设计一个算法，判断无向图 G 是否连通，要求时间复杂度不超过 O(n + e)。',
    answer:
      '从任一顶点出发做一次 DFS/BFS，统计访问到的顶点数 cnt；若 cnt == n 则连通，否则不连通。时间复杂度 O(n + e)。',
    analysis:
      '连通性判定只需一次遍历。关键是遍历必须覆盖所有顶点，因此要在主循环中对每个未访问顶点发起遍历（本图连通时实际只发起一次）。',
    difficulty: 4,
    tags: ['图', 'DFS', '连通性'],
    bankName: '算法设计题手写专项',
    wrongCount: 2,
    wrongReason: '只从顶点 0 遍历一次就下结论，漏了非连通图的边界判断。',
    lastWrongAt: '2026-09-06',
  },
  {
    id: 'q-os-01',
    source: 'wrong',
    topicId: 'os',
    type: '综合应用',
    stem: '某进程访问页面序列为 1,2,3,4,1,2,5,1,2,3，物理块数为 3，采用 LRU 置换算法，求缺页次数与缺页率。',
    answer: '缺页 8 次，缺页率 80%',
    analysis:
      '按 LRU 逐次模拟：前 3 次必然缺页（1,2,3），之后 4 缺页淘汰 1，1、2、5 中 5 缺页，1、2 命中，3 缺页淘汰 2。累计缺页 8 次，共 10 次访问，缺页率 80%。',
    difficulty: 3,
    tags: ['页面置换', 'LRU'],
    bankName: '操作系统章节精练',
    wrongCount: 4,
    wrongReason: '命中时也按一次置换去更新栈，导致把命中算成了缺页。',
    lastWrongAt: '2026-09-10',
  },
  {
    id: 'q-os-02',
    source: 'wrong',
    topicId: 'os',
    type: '单项选择',
    stem: '下列页面置换算法中，可能出现 Belady 异常的是（　）。',
    options: [
      { key: 'A', text: 'LRU' },
      { key: 'B', text: 'OPT' },
      { key: 'C', text: 'FIFO' },
      { key: 'D', text: 'Clock（改进型）' },
    ],
    answer: 'C',
    analysis:
      'Belady 异常指分配的物理块数增加反而缺页次数增加。FIFO 属于非栈式算法，会出现该异常；LRU 与 OPT 均为栈式算法，不会出现。',
    difficulty: 2,
    tags: ['页面置换', 'Belady 异常'],
    bankName: '操作系统章节精练',
    wrongCount: 1,
    wrongReason: '把 Clock 算法也当成了非栈式算法。',
    lastWrongAt: '2026-09-04',
  },
  {
    id: 'q-co-01',
    source: 'wrong',
    topicId: 'co',
    type: '综合应用',
    stem: '某计算机主存地址 32 位，按字节编址，Cache 数据区容量 8KB，采用 4 路组相联映射，块大小 64B。求标记字段、组号字段与块内地址的位数。',
    answer: '块内地址 6 位，组号 5 位，标记 21 位',
    analysis:
      '块大小 64B → 块内地址 log₂64 = 6 位。Cache 共 8KB/64B = 128 块，4 路组相联 → 128/4 = 32 组 → 组号 log₂32 = 5 位。标记 = 32 − 5 − 6 = 21 位。',
    difficulty: 4,
    tags: ['Cache', '组相联', '存储系统'],
    bankName: 'Cache 与流水线计算专练',
    wrongCount: 2,
    wrongReason: '先算组数时忘了除以路数，直接用 128 算成 7 位组号。',
    lastWrongAt: '2026-09-02',
  },
  {
    id: 'q-cn-01',
    source: 'wrong',
    topicId: 'cn',
    type: '综合应用',
    stem: '某 TCP 连接采用慢开始与拥塞避免（ssthresh 初值 8），画出前 12 轮传输中拥塞窗口的变化，并指出第 12 轮结束时的窗口值。',
    answer: '第 12 轮结束窗口 = 12',
    analysis:
      '第 1-4 轮慢开始（1,2,4,8），第 5 轮起进入拥塞避免，每轮 +1（9,10,11,12…），故第 12 轮结束窗口为 12。',
    difficulty: 4,
    tags: ['TCP', '拥塞控制'],
    bankName: '网络计算题专项',
    wrongCount: 3,
    wrongReason: 'ssthresh 到达后仍在按指数增长，没切换到拥塞避免。',
    lastWrongAt: '2026-09-08',
  },
  {
    id: 'q-db-01',
    source: 'wrong',
    topicId: 'db',
    type: '填空',
    stem: '关系模式 R(A,B,C,D) 的函数依赖集为 {A→B, B→C}，则 R 属于第几范式？____',
    answer: '满足 2NF，但不满足 3NF',
    analysis:
      '候选码为 A。所有非主属性 B、C 都完全函数依赖于 A，故满足 2NF；但存在 A→B→C 的传递函数依赖，故不满足 3NF。',
    difficulty: 3,
    tags: ['范式', '函数依赖'],
    bankName: '数据库原理章节精练',
    wrongCount: 1,
    wrongReason: '只检查了部分函数依赖，漏掉传递依赖。',
    lastWrongAt: '2026-09-05',
  },
  {
    id: 'q-cc-01',
    source: 'wrong',
    topicId: 'cc',
    type: '综合应用',
    stem: '给定文法 G[S]: S → aS | b，求各非终结符的 FIRST 集与 FOLLOW 集，并判断该文法是否为 LL(1) 文法。',
    answer: 'FIRST(S)={a,b}，FOLLOW(S)={#}；该文法是 LL(1) 文法',
    analysis:
      'S 的产生式右部首符号分别为 a 与 b，不相交，故不含左递归且无回溯，可直接判断为 LL(1)。',
    difficulty: 3,
    tags: ['FIRST/FOLLOW', 'LL(1)'],
    bankName: '编译原理章节精练',
    wrongCount: 2,
    wrongReason: 'FOLLOW 集里漏写了输入结束符 #。',
    lastWrongAt: '2026-09-07',
  },
  {
    id: 'q-ds-11',
    source: 'favorite',
    topicId: 'ds',
    type: '单项选择',
    stem: '向一棵平衡二叉树（AVL）依次插入 3,2,1，插入后需要进行的调整是（　）。',
    options: [
      { key: 'A', text: 'LL 型，右单旋转' },
      { key: 'B', text: 'RR 型，左单旋转' },
      { key: 'C', text: 'LR 型，先左后右双旋转' },
      { key: 'D', text: 'RL 型，先右后左双旋转' },
    ],
    answer: 'A',
    analysis: '插入 1 后结点 3 的平衡因子变为 +2，最小不平衡子树的插入位置在左子树的左子树上，属 LL 型，做一次右单旋转。',
    difficulty: 3,
    tags: ['AVL', '旋转'],
    bankName: '数据结构章节精练',
    favoritedAt: '2026-08-21',
  },
  {
    id: 'q-os-11',
    source: 'favorite',
    topicId: 'os',
    type: '单项选择',
    stem: '在时间片轮转调度中，时间片取值过小会导致（　）。',
    options: [
      { key: 'A', text: '进程响应时间变长' },
      { key: 'B', text: '进程切换开销显著增大' },
      { key: 'C', text: '长作业饥饿' },
      { key: 'D', text: '系统吞吐量上升' },
    ],
    answer: 'B',
    analysis: '时间片越小，单位时间内发生的进程切换次数越多，上下文切换开销占比上升，实际有效计算时间被压缩。',
    difficulty: 2,
    tags: ['调度算法', '时间片'],
    bankName: '操作系统章节精练',
    favoritedAt: '2026-08-18',
  },
  {
    id: 'q-co-11',
    source: 'favorite',
    topicId: 'co',
    type: '单项选择',
    stem: 'IEEE 754 单精度浮点数中，阶码采用移码表示，其偏移量为（　）。',
    options: [
      { key: 'A', text: '127' },
      { key: 'B', text: '128' },
      { key: 'C', text: '255' },
      { key: 'D', text: '1023' },
    ],
    answer: 'A',
    analysis: '单精度阶码 8 位，偏移量取 2^(8−1) − 1 = 127；双精度阶码 11 位，偏移量为 1023。注意与全 0/全 1 表示特殊值的约定配合。',
    difficulty: 2,
    tags: ['IEEE 754', '浮点数'],
    bankName: '组成原理章节精练',
    favoritedAt: '2026-08-14',
  },
  {
    id: 'q-cn-11',
    source: 'favorite',
    topicId: 'cn',
    type: '单项选择',
    stem: '将 192.168.10.0/24 划分为至少 6 个子网，每个子网最多容纳 30 台主机，应借用的子网位数为（　）。',
    options: [
      { key: 'A', text: '2 位' },
      { key: 'B', text: '3 位' },
      { key: 'C', text: '4 位' },
      { key: 'D', text: '5 位' },
    ],
    answer: 'B',
    analysis:
      '需要 ≥6 个子网 → 2^3 = 8 ≥ 6，借 3 位；剩余 5 位主机位可容纳 2^5 − 2 = 30 台，恰好满足，故借 3 位。',
    difficulty: 3,
    tags: ['子网划分'],
    bankName: '网络计算题专项',
    favoritedAt: '2026-08-09',
  },
  {
    id: 'q-db-11',
    source: 'favorite',
    topicId: 'db',
    type: '综合应用',
    stem: '写出 SQL：查询每个院系中平均成绩高于全校平均成绩的学生人数（表 student(sno, sdept, grade)）。',
    answer:
      'SELECT sdept, COUNT(*) FROM student GROUP BY sdept HAVING AVG(grade) > (SELECT AVG(grade) FROM student);',
    analysis: '院系内聚合用 GROUP BY，与全校平均比较需用标量子查询放在 HAVING 中，不能放在 WHERE。',
    difficulty: 3,
    tags: ['SQL', '聚合查询'],
    bankName: '数据库原理章节精练',
    favoritedAt: '2026-08-05',
  },
  {
    id: 'q-cc-11',
    source: 'favorite',
    topicId: 'cc',
    type: '单项选择',
    stem: '若一个文法存在某个句子对应两棵不同的语法树，则该文法（　）。',
    options: [
      { key: 'A', text: '一定是二义的' },
      { key: 'B', text: '一定不是二义的' },
      { key: 'C', text: '是 LL(1) 文法' },
      { key: 'D', text: '是 LR(1) 文法' },
    ],
    answer: 'A',
    analysis: '文法二义性的定义就是「存在某个句子有两棵不同的语法树（或两个不同的最左推导）」，与其是否属于某一类分析文法无关。',
    difficulty: 2,
    tags: ['二义性', '语法树'],
    bankName: '编译原理章节精练',
    favoritedAt: '2026-08-02',
  },
]

export type ExportFormat = 'markdown' | 'txt' | 'csv' | 'html'

export type ExportField =
  | 'meta'
  | 'stem'
  | 'options'
  | 'answer'
  | 'analysis'
  | 'wrongReason'
  | 'tags'
  | 'stats'

export type ExportGroupBy = 'none' | 'topic' | 'type' | 'difficulty'

export type ExportOrderBy = 'recent' | 'wrongCount' | 'difficulty' | 'topic'

export interface ExportTemplate {
  id: string
  name: string
  description: string
  format: ExportFormat
  fields: ExportField[]
  groupBy: ExportGroupBy
  orderBy: ExportOrderBy
  includeIndex: boolean
  includeCover: boolean
  includeToc: boolean
  builtin: boolean
  /** 适用的数据源；缺省表示错题本与收藏夹都能用 */
  appliesTo?: QuestionSource[]
  createdAt?: string
}

/** 模板适用的数据源，未显式声明时两种都适用 */
export function templateAppliesTo(template: ExportTemplate): QuestionSource[] {
  return template.appliesTo ?? ['wrong', 'favorite']
}

export const EXPORT_FORMATS: { key: ExportFormat; label: string; ext: string; desc: string }[] = [
  { key: 'markdown', label: 'Markdown', ext: 'md', desc: '适合导入笔记软件，保留标题层级' },
  { key: 'txt', label: '纯文本', ext: 'txt', desc: '最通用，任何设备都能打开' },
  { key: 'csv', label: 'CSV 表格', ext: 'csv', desc: '适合导入 Excel / 表格工具做二次整理' },
  { key: 'html', label: '网页 / 打印', ext: 'html', desc: '自带排版，可用浏览器直接打印成 PDF' },
]

export const EXPORT_FIELDS: { key: ExportField; label: string; hint: string }[] = [
  { key: 'meta', label: '元信息', hint: '专业课 / 题型 / 难度 / 来源题库' },
  { key: 'stem', label: '题干', hint: '必选，否则无法定位题目' },
  { key: 'options', label: '选项', hint: '选择题的 A/B/C/D' },
  { key: 'answer', label: '答案', hint: '' },
  { key: 'analysis', label: '解析', hint: '' },
  { key: 'wrongReason', label: '我的错因', hint: '仅错题本有该字段' },
  { key: 'tags', label: '标签', hint: '' },
  { key: 'stats', label: '统计', hint: '错误次数 / 收藏时间' },
]

export const EXPORT_GROUPS: { key: ExportGroupBy; label: string }[] = [
  { key: 'none', label: '不分分组' },
  { key: 'topic', label: '按专业课' },
  { key: 'type', label: '按题型' },
  { key: 'difficulty', label: '按难度' },
]

export const EXPORT_ORDERS: { key: ExportOrderBy; label: string }[] = [
  { key: 'recent', label: '最近一次练习' },
  { key: 'wrongCount', label: '错误次数降序' },
  { key: 'difficulty', label: '难度降序' },
  { key: 'topic', label: '按专业课顺序' },
]

export const BUILTIN_TEMPLATES: ExportTemplate[] = [
  {
    id: 'tpl-recite',
    name: '背诵速查卡',
    description: '只留题干与答案，按专业课分组，适合考前快速过一遍。',
    format: 'markdown',
    fields: ['meta', 'stem', 'answer', 'wrongReason', 'tags'],
    groupBy: 'topic',
    orderBy: 'wrongCount',
    includeIndex: true,
    includeCover: false,
    includeToc: false,
    builtin: true,
  },
  {
    id: 'tpl-review',
    name: '完整复盘版',
    description: '题干、选项、答案、解析、错因全带上，用于深度复盘。',
    format: 'markdown',
    fields: ['meta', 'stem', 'options', 'answer', 'analysis', 'wrongReason', 'tags', 'stats'],
    groupBy: 'topic',
    orderBy: 'recent',
    includeIndex: true,
    includeCover: true,
    includeToc: true,
    builtin: true,
  },
  {
    id: 'tpl-sheet',
    name: '表格清单',
    description: '一行一题，便于筛排序、统计错误次数，可导入表格工具。',
    format: 'csv',
    fields: ['meta', 'stem', 'answer', 'tags', 'stats'],
    groupBy: 'none',
    orderBy: 'wrongCount',
    includeIndex: true,
    includeCover: false,
    includeToc: false,
    builtin: true,
  },
  {
    id: 'tpl-print',
    name: '打印自测版',
    description: '只给题干与选项，答案与解析附在卷末，适合打印后手写自测。',
    format: 'html',
    fields: ['meta', 'stem', 'options'],
    groupBy: 'none',
    orderBy: 'topic',
    includeIndex: true,
    includeCover: true,
    includeToc: false,
    builtin: true,
  },
  {
    id: 'tpl-weak',
    name: '薄弱点统计',
    description: '按难度分组列出题干与答案，先看最难的，快速定位薄弱章节。',
    format: 'txt',
    fields: ['meta', 'stem', 'answer', 'tags'],
    groupBy: 'difficulty',
    orderBy: 'difficulty',
    includeIndex: true,
    includeCover: false,
    includeToc: false,
    builtin: true,
  },
  {
    id: 'tpl-wrong-hard',
    name: '错题攻坚清单',
    description: '错题专用：按错误次数降序，只留题干、答案与我的错因，每天先攻错得最多的。',
    format: 'markdown',
    fields: ['meta', 'stem', 'answer', 'wrongReason', 'stats'],
    groupBy: 'topic',
    orderBy: 'wrongCount',
    includeIndex: true,
    includeCover: true,
    includeToc: false,
    builtin: true,
    appliesTo: ['wrong'],
  },
  {
    id: 'tpl-fav-card',
    name: '收藏速览卡',
    description: '收藏专用：一页一题不分组，按下单顺序排列，适合睡前快速过一遍收藏夹。',
    format: 'markdown',
    fields: ['meta', 'stem', 'options', 'answer', 'stats'],
    groupBy: 'none',
    orderBy: 'recent',
    includeIndex: false,
    includeCover: false,
    includeToc: false,
    builtin: true,
    appliesTo: ['favorite'],
  },
]

export const DEFAULT_CUSTOM_TEMPLATES: ExportTemplate[] = [
  {
    id: 'tpl-my-1',
    name: '只留题干自测',
    description: '隐藏答案与解析，导出后自己先做一遍再对答案。',
    format: 'markdown',
    fields: ['meta', 'stem', 'options'],
    groupBy: 'topic',
    orderBy: 'recent',
    includeIndex: true,
    includeCover: false,
    includeToc: false,
    builtin: false,
    createdAt: '2026-08-30',
  },
  {
    id: 'tpl-my-2',
    name: '错因归类表',
    description: '按错因逐条列出，配合每周复盘使用。',
    format: 'csv',
    fields: ['stem', 'answer', 'wrongReason', 'tags'],
    groupBy: 'none',
    orderBy: 'topic',
    includeIndex: false,
    includeCover: false,
    includeToc: false,
    builtin: false,
    createdAt: '2026-09-03',
  },
]

export function questionsOfSource(source: QuestionSource): DemoQuestion[] {
  return DEMO_QUESTIONS.filter((question) => question.source === source)
}

export function sourceCount(source: QuestionSource): number {
  return questionsOfSource(source).length
}

/** 新建导出模板的初始值 */
export function blankTemplate(): ExportTemplate {
  return {
    id: '',
    name: '未命名模板',
    description: '',
    format: 'markdown',
    fields: ['meta', 'stem', 'answer'],
    groupBy: 'topic',
    orderBy: 'recent',
    includeIndex: true,
    includeCover: false,
    includeToc: false,
    builtin: false,
  }
}
