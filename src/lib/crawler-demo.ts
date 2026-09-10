/**
 * 分布式采集（爬虫）DEMO 数据。
 * 分两条线：题库采集（对接现有题库，多模态大模型解析）与经验采集（小红书 / 知乎）。
 * 所有节点、来源、用户均为虚构示例，不接数据库，也不会真的发起任何网络请求。
 */

export type CrawlerTab = 'questions' | 'experience'

export type NodeStatus = 'running' | 'idle' | 'throttled' | 'error'

export interface CrawlerNode {
  id: string
  name: string
  region: string
  ip: string
  status: NodeStatus
  currentUrl: string
  pagesPerMin: number
  fetched: number
  failed: number
  lastHeartbeat: string
  /** 负责该节点的用户 */
  operator: string
}

export interface CrawlSourceSite {
  id: string
  name: string
  domain: string
  topicIds: string[]
  pages: number
  questions: number
  /** 合规策略说明 */
  compliance: string
  authorized: boolean
}

export interface CrawlPipelineStep {
  key: string
  name: string
  desc: string
  count: number
  avgMs: number
}

export interface CrawledQuestion {
  id: string
  title: string
  topicId: string
  type: string
  /** 内容来源 */
  sourceSite: string
  sourceUrl: string
  /** 采集节点 */
  node: string
  /** 发起人（用户） */
  operator: string
  /** 审核人（用户） */
  reviewer: string
  confidence: number
  status: 'imported' | 'pending' | 'duplicate' | 'rejected'
  modality: string
}

export interface ExperiencePlatform {
  id: string
  name: string
  domain: string
  collected: number
  pending: number
  approved: number
  rejected: number
  note: string
}

export interface ExperiencePost {
  id: string
  title: string
  excerpt: string
  /** 内容来源平台 */
  platform: string
  url: string
  /** 原作者（用户） */
  author: string
  authorHandle: string
  authorVerified: boolean
  likes: number
  collectedAt: string
  node: string
  /** 采集人（用户） */
  operator: string
  status: 'pending' | 'approved' | 'rejected'
  topicIds: string[]
  tags: string[]
  hasImages: boolean
}

export const NODE_STATUS_META: Record<NodeStatus, { label: string; className: string }> = {
  running: { label: '采集中', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  idle: { label: '空闲', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  throttled: { label: '限速中', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  error: { label: '异常', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
}

export const QUESTION_STATUS_META: Record<
  CrawledQuestion['status'],
  { label: string; className: string }
> = {
  imported: { label: '已入库', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  pending: { label: '待审核', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  duplicate: { label: '重复丢弃', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  rejected: { label: '已驳回', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
}

export const POST_STATUS_META: Record<ExperiencePost['status'], { label: string; className: string }> = {
  pending: { label: '待审核', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  approved: { label: '已采纳', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected: { label: '已驳回', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
}

export const CRAWLER_NODES: CrawlerNode[] = [
  {
    id: 'n1', name: '华东-01', region: '杭州', ip: '10.24.**.31', status: 'running',
    currentUrl: 'https://example-edu.cn/cs/ds/chapter-6#q12', pagesPerMin: 42,
    fetched: 1860, failed: 12, lastHeartbeat: '4 秒前', operator: '林一',
  },
  {
    id: 'n2', name: '华东-02', region: '上海', ip: '10.24.**.52', status: 'running',
    currentUrl: 'https://example-edu.cn/cs/os/chapter-3#q07', pagesPerMin: 38,
    fetched: 1420, failed: 9, lastHeartbeat: '6 秒前', operator: '苏晚',
  },
  {
    id: 'n3', name: '华北-01', region: '北京', ip: '10.31.**.17', status: 'running',
    currentUrl: 'https://exam-archive.org/408/2021/q38', pagesPerMin: 51,
    fetched: 2240, failed: 21, lastHeartbeat: '3 秒前', operator: '陈舟',
  },
  {
    id: 'n4', name: '华南-01', region: '深圳', ip: '10.42.**.88', status: 'throttled',
    currentUrl: 'https://cn-problems.net/db/normalization#p3', pagesPerMin: 6,
    fetched: 640, failed: 4, lastHeartbeat: '12 秒前', operator: '老周',
  },
  {
    id: 'n5', name: '西南-01', region: '成都', ip: '10.55.**.09', status: 'idle',
    currentUrl: '—', pagesPerMin: 0, fetched: 0, failed: 0, lastHeartbeat: '2 分钟前', operator: '阿糖',
  },
  {
    id: 'n6', name: '海外-01', region: '新加坡', ip: '13.212.**.44', status: 'error',
    currentUrl: 'https://textbook-mirror.org/cc/ll1', pagesPerMin: 0,
    fetched: 318, failed: 47, lastHeartbeat: '8 分钟前', operator: '青禾',
  },
]

export const CRAWL_SOURCES: CrawlSourceSite[] = [
  {
    id: 's1', name: '高校公开题库站', domain: 'example-edu.cn', topicIds: ['ds', 'os'],
    pages: 1240, questions: 3860, compliance: '已获得站点书面授权，仅采集公开页面', authorized: true,
  },
  {
    id: 's2', name: '历年真题归档库', domain: 'exam-archive.org', topicIds: ['ds', 'co', 'cn', 'os'],
    pages: 680, questions: 2140, compliance: '遵循 robots.txt，限速 30 页/分', authorized: true,
  },
  {
    id: 's3', name: '中文题库聚合页', domain: 'cn-problems.net', topicIds: ['db', 'cc'],
    pages: 410, questions: 1120, compliance: 'robots 未禁止但需限速，已降速至 6 页/分', authorized: false,
  },
  {
    id: 's4', name: '教材习题镜像', domain: 'textbook-mirror.org', topicIds: ['cc'],
    pages: 96, questions: 318, compliance: '存在版权风险，节点已被自动熔断', authorized: false,
  },
]

export const CRAWL_PIPELINE: CrawlPipelineStep[] = [
  { key: 'client', name: '模拟客户端', desc: '无头浏览器 + 随机指纹，规避反爬误伤', count: 4628, avgMs: 820 },
  { key: 'render', name: '页面渲染', desc: '等待公式 / 图表异步加载完成', count: 4628, avgMs: 1140 },
  { key: 'vision', name: '多模态抽取', desc: '大模型识别题干、选项、公式与图片表格', count: 4390, avgMs: 1620 },
  { key: 'structure', name: '结构化归一', desc: '统一题型、选项顺序与符号写法', count: 4390, avgMs: 240 },
  { key: 'dedupe', name: '查重比对', desc: '与现有题库做语义 + 文本双通道比对', count: 4390, avgMs: 310 },
  { key: 'store', name: '入库待审', desc: '写入待审核队列并记录来源', count: 2976, avgMs: 120 },
]

export const CRAWLED_QUESTIONS: CrawledQuestion[] = [
  {
    id: 'cq1', title: '在含有 n 个结点的二叉排序树中查找一个关键字，最坏时间复杂度…',
    topicId: 'ds', type: '单项选择', sourceSite: '高校公开题库站',
    sourceUrl: 'https://example-edu.cn/cs/ds/chapter-6#q12', node: '华东-01',
    operator: '林一', reviewer: '管理员 · 周', confidence: 0.97, status: 'imported',
    modality: '纯文本',
  },
  {
    id: 'cq2', title: '某进程访问页面序列为 1,2,3,4,…，采用 LRU 求缺页次数与缺页率',
    topicId: 'os', type: '综合应用', sourceSite: '历年真题归档库',
    sourceUrl: 'https://exam-archive.org/408/2021/q38', node: '华北-01',
    operator: '陈舟', reviewer: '管理员 · 周', confidence: 0.94, status: 'imported',
    modality: '含表格图片',
  },
  {
    id: 'cq3', title: '某 Cache 采用 4 路组相联映射，主存地址 32 位，求各字段位数',
    topicId: 'co', type: '综合应用', sourceSite: '历年真题归档库',
    sourceUrl: 'https://exam-archive.org/408/2022/q41', node: '华北-01',
    operator: '陈舟', reviewer: '—', confidence: 0.91, status: 'pending',
    modality: '含公式（LaTeX 还原）',
  },
  {
    id: 'cq4', title: '给定文法 G[S]: S → aS | b，求 FIRST / FOLLOW 集',
    topicId: 'cc', type: '综合应用', sourceSite: '中文题库聚合页',
    sourceUrl: 'https://cn-problems.net/cc/ll1#p3', node: '华南-01',
    operator: '老周', reviewer: '—', confidence: 0.88, status: 'pending',
    modality: '含公式（LaTeX 还原）',
  },
  {
    id: 'cq5', title: '关系模式 R(A,B,C,D) 中 A→B, B→C，判断其所属范式',
    topicId: 'db', type: '填空', sourceSite: '中文题库聚合页',
    sourceUrl: 'https://cn-problems.net/db/normalization#p3', node: '华南-01',
    operator: '老周', reviewer: '管理员 · 李', confidence: 0.95, status: 'imported',
    modality: '纯文本',
  },
  {
    id: 'cq6', title: 'IEEE 754 单精度浮点数阶码偏移量为多少',
    topicId: 'co', type: '单项选择', sourceSite: '高校公开题库站',
    sourceUrl: 'https://example-edu.cn/cs/co/chapter-2#q05', node: '华东-01',
    operator: '林一', reviewer: '管理员 · 李', confidence: 0.92, status: 'duplicate',
    modality: '纯文本',
  },
  {
    id: 'cq7', title: '将 192.168.10.0/24 划分为至少 6 个子网，应借用几位',
    topicId: 'cn', type: '单项选择', sourceSite: '历年真题归档库',
    sourceUrl: 'https://exam-archive.org/408/2019/q33', node: '华北-01',
    operator: '陈舟', reviewer: '—', confidence: 0.96, status: 'pending',
    modality: '含表格图片',
  },
  {
    id: 'cq8', title: '教材习题镜像页面的解析正文残缺，无法还原完整题干',
    topicId: 'cc', type: '综合应用', sourceSite: '教材习题镜像',
    sourceUrl: 'https://textbook-mirror.org/cc/ll1', node: '海外-01',
    operator: '青禾', reviewer: '—', confidence: 0.41, status: 'rejected',
    modality: '含图片（OCR 置信度低）',
  },
]

export const CRAWL_LOGS: { time: string; level: 'info' | 'warn' | 'error'; node: string; text: string }[] = [
  { time: '05:12:41', level: 'info', node: '华东-01', text: '解析成功：ds/chapter-6#q12，置信度 0.97，已写入待审队列' },
  { time: '05:12:38', level: 'warn', node: '华南-01', text: '触发站点限速，单节点吞吐降至 6 页/分' },
  { time: '05:12:35', level: 'info', node: '华北-01', text: '多模态抽取完成：表格 → 结构化矩阵（3×4）' },
  { time: '05:12:31', level: 'error', node: '海外-01', text: '连续 47 次 403，判定为版权风险站点，已自动熔断该节点' },
  { time: '05:12:28', level: 'info', node: '华东-02', text: '查重命中：co/chapter-2#q05 与现有题目相似度 0.98，标记为重复' },
  { time: '05:12:24', level: 'info', node: '华东-01', text: '模拟客户端指纹已轮换（第 128 次）' },
]

export const EXPERIENCE_PLATFORMS: ExperiencePlatform[] = [
  {
    id: 'p1', name: '小红书', domain: 'xiaohongshu.com',
    collected: 428, pending: 96, approved: 274, rejected: 58,
    note: '仅采集公开笔记，保留作者昵称与原文链接',
  },
  {
    id: 'p2', name: '知乎', domain: 'zhihu.com',
    collected: 366, pending: 71, approved: 251, rejected: 44,
    note: '仅采集公开回答与文章，已过滤付费内容',
  },
]

export const EXPERIENCE_NODES: CrawlerNode[] = [
  {
    id: 'e1', name: '经验-华东-01', region: '杭州', ip: '10.24.**.77', status: 'running',
    currentUrl: 'https://www.xiaohongshu.com/explore/6a1f**c2', pagesPerMin: 18,
    fetched: 240, failed: 3, lastHeartbeat: '5 秒前', operator: '木木',
  },
  {
    id: 'e2', name: '经验-华北-01', region: '北京', ip: '10.31.**.66', status: 'running',
    currentUrl: 'https://www.zhihu.com/question/528**41/answer/19**07', pagesPerMin: 22,
    fetched: 196, failed: 5, lastHeartbeat: '4 秒前', operator: '温柔',
  },
  {
    id: 'e3', name: '经验-华南-01', region: '深圳', ip: '10.42.**.12', status: 'idle',
    currentUrl: '—', pagesPerMin: 0, fetched: 358, failed: 9, lastHeartbeat: '1 分钟前', operator: '木木',
  },
]

export const EXPERIENCE_POSTS: ExperiencePost[] = [
  {
    id: 'ep1',
    title: '二战 408 上岸：数据结构大题我是这样从 8 分提到 24 分',
    excerpt: '第一年死在算法设计题上。第二年把所有树与图的手工模拟都重做了一遍，特别是……',
    platform: '小红书',
    url: 'https://www.xiaohongshu.com/explore/6a1f**c2',
    author: '阿栗学姐',
    authorHandle: '@aliali_408',
    authorVerified: true,
    likes: 4820,
    collectedAt: '2026-09-11 04:52',
    node: '经验-华东-01',
    operator: '木木',
    status: 'approved',
    topicIds: ['ds'],
    tags: ['树与图', '算法设计题', '二战'],
    hasImages: true,
  },
  {
    id: 'ep2',
    title: '操作系统 PV 操作到底怎么下手？给你一套固定顺序',
    excerpt: '先判断互斥还是同步，再列资源清单，最后才写代码。顺序反了就会写出永不死锁也永远不对的代码……',
    platform: '知乎',
    url: 'https://www.zhihu.com/question/528**41/answer/19**07',
    author: '无名的进程',
    authorHandle: '@process_noname',
    authorVerified: false,
    likes: 2310,
    collectedAt: '2026-09-11 04:41',
    node: '经验-华北-01',
    operator: '温柔',
    status: 'approved',
    topicIds: ['os'],
    tags: ['PV 操作', '解题步骤'],
    hasImages: false,
  },
  {
    id: 'ep3',
    title: '408 组成原理 Cache 计算题，我总结了三张 A4 表',
    excerpt: '映射方式、替换算法、写策略三组变量组合起来就那几种变式，把表贴在桌上每天走一遍……',
    platform: '小红书',
    url: 'https://www.xiaohongshu.com/explore/7b2e**a9',
    author: '糖不甩',
    authorHandle: '@tangbusw',
    authorVerified: false,
    likes: 1673,
    collectedAt: '2026-09-11 04:28',
    node: '经验-华东-01',
    operator: '木木',
    status: 'pending',
    topicIds: ['co'],
    tags: ['Cache', '计算题', '笔记'],
    hasImages: true,
  },
  {
    id: 'ep4',
    title: '数据库范式判定题，别再硬套定义了',
    excerpt: '直接看每个非主属性是否完全依赖候选码，画出函数依赖集再判定，基本不会错……',
    platform: '知乎',
    url: 'https://www.zhihu.com/question/612**77/answer/31**44',
    author: '周老师讲数据库',
    authorHandle: '@zhou_db',
    authorVerified: true,
    likes: 986,
    collectedAt: '2026-09-11 04:15',
    node: '经验-华南-01',
    operator: '老周',
    status: 'pending',
    topicIds: ['db'],
    tags: ['范式', '函数依赖'],
    hasImages: true,
  },
  {
    id: 'ep5',
    title: '跨考计算机两年，聊聊我是怎么熬过瓶颈期的',
    excerpt: '不是技巧贴，纯心态。我崩过两次，后来给自己定了一个「学不动就只做 10 道题」的下限……',
    platform: '小红书',
    url: 'https://www.xiaohongshu.com/explore/8c3f**d1',
    author: '路口的风',
    authorHandle: '@wind_at_cross',
    authorVerified: false,
    likes: 3042,
    collectedAt: '2026-09-11 03:58',
    node: '经验-华东-01',
    operator: '木木',
    status: 'pending',
    topicIds: ['ds', 'os'],
    tags: ['跨考', '心态'],
    hasImages: false,
  },
  {
    id: 'ep6',
    title: '（内容为课程广告，正文含大量付费引导）',
    excerpt: '已命中推广词库与联系方式正则，自动驳回并加入站点黑名单……',
    platform: '知乎',
    url: 'https://www.zhihu.com/question/700**12/answer/88**01',
    author: '某某考研机构',
    authorHandle: '@ad_account',
    authorVerified: false,
    likes: 12,
    collectedAt: '2026-09-11 03:40',
    node: '经验-华北-01',
    operator: '温柔',
    status: 'rejected',
    topicIds: [],
    tags: ['疑似推广'],
    hasImages: false,
  },
]

export function nodesOf(tab: CrawlerTab): CrawlerNode[] {
  return tab === 'questions' ? CRAWLER_NODES : EXPERIENCE_NODES
}
