/**
 * 问题反馈 DEMO 数据。
 * 参照 GitHub issue 的结构：类型 / 标题 / 正文 / 复现步骤 / 期望与实际 / 严重程度 / 标签 / 环境信息 / 状态流转。
 */

export type IssueKind = 'bug' | 'feature' | 'content' | 'question' | 'other'
export type IssueStatus = 'open' | 'triaged' | 'in_progress' | 'resolved' | 'closed'
export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface FeedbackIssue {
  number: number
  title: string
  kind: IssueKind
  status: IssueStatus
  severity: Severity
  labels: string[]
  author: string
  createdAt: string
  comments: number
  upvotes: number
  /** 公开后其他人能看到并 +1 */
  public: boolean
  env: string
  body: string
  steps?: string
  expected?: string
  actual?: string
}

export const LABELS = [
  '练习模式', '考试模式', '题库', 'AI 解析', '判题', '移动端', '性能', 'UI', '数据同步', '登录', '有奖捉虫',
]

export const KIND_META: Record<IssueKind, { label: string; hint: string; className: string }> = {
  bug: { label: '缺陷报告', hint: '功能坏了或结果不对', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  feature: { label: '功能建议', hint: '想要一个新功能', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  content: { label: '题目纠错', hint: '题目、答案或解析有错', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  question: { label: '使用咨询', hint: '不知道怎么用', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  other: { label: '其他', hint: '都不属于上面几类', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

export const STATUS_META: Record<IssueStatus, { label: string; className: string }> = {
  open: { label: '待处理', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  triaged: { label: '已确认', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  in_progress: { label: '处理中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  resolved: { label: '已解决', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  closed: { label: '已关闭', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

export const SEVERITY_META: Record<Severity, { label: string; className: string }> = {
  low: { label: '轻微', className: 'text-muted-foreground' },
  medium: { label: '一般', className: 'text-amber-600 dark:text-amber-400' },
  high: { label: '严重', className: 'text-orange-600 dark:text-orange-400' },
  critical: { label: '阻塞', className: 'text-rose-600 dark:text-rose-400' },
}

/** 公开区（所有人可见、可 +1） */
export const PUBLIC_ISSUES: FeedbackIssue[] = [
  {
    number: 1042,
    title: '练习模式连续答题时，偶尔会重复出现刚做过的题',
    kind: 'bug',
    status: 'in_progress',
    severity: 'medium',
    labels: ['练习模式', '性能'],
    author: '匿名同学 3821',
    createdAt: '2026-09-09',
    comments: 7,
    upvotes: 34,
    public: true,
    env: 'Chrome 141 / Windows 11 / 深色',
    body: '在随机模式下连答 30 题左右会明显感觉有重复，尤其是把「排除已做过的题」打开之后仍然出现。',
    steps: '1. 进入练习模式 → 随机\n2. 打开「排除已做过的题」\n3. 连续作答 30 题\n4. 观察是否出现重复',
    expected: '同一会话内不出现重复题目',
    actual: '约每 20-30 题会出现 1 次重复',
  },
  {
    number: 1039,
    title: '希望考试模式支持中途保存草稿并恢复',
    kind: 'feature',
    status: 'triaged',
    severity: 'medium',
    labels: ['考试模式', '数据同步'],
    author: '阿栗学姐',
    createdAt: '2026-09-08',
    comments: 12,
    upvotes: 89,
    public: true,
    env: 'Safari / macOS',
    body: '长时间考试中途刷新页面就全没了。希望像练习模式一样自动保存草稿，重进可以继续。',
  },
  {
    number: 1036,
    title: '题目纠错：操作系统 LRU 缺页率那题答案应为 80%',
    kind: 'content',
    status: 'resolved',
    severity: 'high',
    labels: ['题库', 'AI 解析', '有奖捉虫'],
    author: '无名的进程',
    createdAt: '2026-09-06',
    comments: 4,
    upvotes: 56,
    public: true,
    env: '—',
    body: '题库里写的是 75%，但按 LRU 逐次模拟，前 3 次必缺页，之后 4、5、3 各缺一次，共 8 次，缺页率应为 80%。解析里的计数漏了一次。',
    expected: '答案与解析都改为 80%（8/10）',
    actual: '当前答案为 75%',
  },
  {
    number: 1031,
    title: '移动端答题卡在小屏上会被右侧裁掉一截',
    kind: 'bug',
    status: 'triaged',
    severity: 'high',
    labels: ['移动端', 'UI', '考试模式'],
    author: '糖不甩',
    createdAt: '2026-09-04',
    comments: 9,
    upvotes: 41,
    public: true,
    env: 'iPhone 14 / iOS 26 / 浅色',
    body: '竖屏下打开试卷，最右侧一列涂卡格超出可视区域，横向滚动也没法完全露出来。',
    steps: '1. 手机竖屏进入考试\n2. 打开任意一份试卷\n3. 观察最右侧',
  },
  {
    number: 1027,
    title: 'AI 解析对含公式的题目经常漏掉上下标',
    kind: 'bug',
    status: 'open',
    severity: 'medium',
    labels: ['AI 解析', '题库'],
    author: '周老师讲数据库',
    createdAt: '2026-09-02',
    comments: 3,
    upvotes: 27,
    public: true,
    env: '—',
    body: 'LaTeX 还原后的公式里，O(log₂n) 这种下标经常变成 O(logn)。',
  },
  {
    number: 1024,
    title: '不确定「我的题库」的题目会不会被平台看到',
    kind: 'question',
    status: 'resolved',
    severity: 'low',
    labels: ['题库'],
    author: '路口的风',
    createdAt: '2026-08-30',
    comments: 5,
    upvotes: 18,
    public: true,
    env: '—',
    body: '想确认一下：我在「我的题库」里导入的题目，平台能不能看到？',
  },
]

/** 我提交的（含不公开的） */
export const MY_ISSUES: FeedbackIssue[] = [
  {
    number: 1046,
    title: '收藏夹按「最近收藏」排序时顺序不稳定',
    kind: 'bug',
    status: 'open',
    severity: 'low',
    labels: ['题库', 'UI'],
    author: '我',
    createdAt: '2026-09-11',
    comments: 0,
    upvotes: 2,
    public: false,
    env: 'Chrome 141 / Windows 11 / 浅色',
    body: '刷新几次之后顺序会变，怀疑是没带二级排序键。',
  },
  {
    number: 1043,
    title: '希望错题回顾能按「错误次数」一键筛选',
    kind: 'feature',
    status: 'triaged',
    severity: 'low',
    labels: ['练习模式'],
    author: '我',
    createdAt: '2026-09-10',
    comments: 1,
    upvotes: 6,
    public: true,
    env: '—',
    body: '现在只能按科目筛，想快速找出错了 3 次以上的题。',
  },
  {
    number: 1038,
    title: '判题返回「编译错误」但代码在本地能跑',
    kind: 'bug',
    status: 'in_progress',
    severity: 'high',
    labels: ['判题'],
    author: '我',
    createdAt: '2026-09-07',
    comments: 4,
    upvotes: 11,
    public: false,
    env: '中心判题 / C++17',
    body: '同样的代码本地 g++ 11 编译通过，平台报编译错误。怀疑是标准或头文件差异。',
    steps: '1. 提交 C++ 代码\n2. 选择 C++17\n3. 观察返回',
    expected: '编译通过并执行',
    actual: '返回 compile_error',
  },
  {
    number: 1033,
    title: '深色模式下部分图表文字对比度偏低',
    kind: 'bug',
    status: 'resolved',
    severity: 'medium',
    labels: ['UI'],
    author: '我',
    createdAt: '2026-09-03',
    comments: 2,
    upvotes: 15,
    public: true,
    env: 'Chrome / 深色',
    body: '数据中心弦图的标签在深色下偏灰，看不清。',
  },
]

export const FEEDBACK_STATS = [
  { label: '累计反馈', value: '1,286', hint: '公开 942' },
  { label: '本周新增', value: '63', hint: '较上周 +12' },
  { label: '已解决', value: '1,041', hint: '解决率 80.9%' },
  { label: '平均首次响应', value: '11 小时', hint: '缺陷类 4 小时' },
]

/** 新 issue 的起始编号 */
export const NEXT_ISSUE_NUMBER = 1047
