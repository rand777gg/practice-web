/**
 * 竞赛（友好 PK）DEMO 数据。纯前端演示，不接数据库。
 */

export type PkStatus = 'pending' | 'ongoing' | 'won' | 'lost' | 'draw'

export interface ArenaPaper {
  id: string
  name: string
  topicId: string
  questionCount: number
  durationMin: number
  source: string
}

export interface PkMatch {
  id: string
  opponent: string
  opponentTag: string
  topicId: string
  paperName: string
  questionCount: number
  durationMin: number
  myScore: number | null
  opponentScore: number | null
  status: PkStatus
  createdAt: string
  inviteCode?: string
}

export interface PublicProfile {
  nickname: string
  signature: string
  visibility: 'private' | 'friends' | 'public'
  publicTopicIds: string[]
  allowChallenge: boolean
  showScore: boolean
}

export const ARENA_PAPERS: ArenaPaper[] = [
  { id: 'p1', name: '数据结构 · 树与图专项卷', topicId: 'ds', questionCount: 20, durationMin: 45, source: '平台自建' },
  { id: 'p2', name: '数据结构 · 408 真题组合卷 A', topicId: 'ds', questionCount: 25, durationMin: 60, source: '历年真题' },
  { id: 'p3', name: '操作系统 · 内存与调度卷', topicId: 'os', questionCount: 20, durationMin: 45, source: '平台自建' },
  { id: 'p4', name: '组成原理 · 存储层次计算卷', topicId: 'co', questionCount: 18, durationMin: 45, source: '高频考点' },
  { id: 'p5', name: '计算机网络 · 协议分析卷', topicId: 'cn', questionCount: 20, durationMin: 40, source: '平台自建' },
  { id: 'p6', name: '数据库 · SQL 与范式卷', topicId: 'db', questionCount: 22, durationMin: 50, source: '自命题风格' },
  { id: 'p7', name: '编译原理 · 分析表构造卷', topicId: 'cc', questionCount: 15, durationMin: 60, source: '大题专项' },
]

export const PK_MATCHES: PkMatch[] = [
  {
    id: 'pk1',
    opponent: '匿名同学 3821',
    opponentTag: '计算机 408 备考生',
    topicId: 'ds',
    paperName: '数据结构 · 树与图专项卷',
    questionCount: 20,
    durationMin: 45,
    myScore: 17,
    opponentScore: 14,
    status: 'won',
    createdAt: '2026-09-10 21:04',
  },
  {
    id: 'pk2',
    opponent: '匿名同学 1197',
    opponentTag: '跨专业二战',
    topicId: 'os',
    paperName: '操作系统 · 内存与调度卷',
    questionCount: 20,
    durationMin: 45,
    myScore: 15,
    opponentScore: 15,
    status: 'draw',
    createdAt: '2026-09-09 19:32',
  },
  {
    id: 'pk3',
    opponent: '匿名同学 6402',
    opponentTag: '自命题院校',
    topicId: 'co',
    paperName: '组成原理 · 存储层次计算卷',
    questionCount: 18,
    durationMin: 45,
    myScore: 11,
    opponentScore: 16,
    status: 'lost',
    createdAt: '2026-09-08 15:10',
  },
  {
    id: 'pk4',
    opponent: '匿名同学 2055',
    opponentTag: '计算机 408 备考生',
    topicId: 'cn',
    paperName: '计算机网络 · 协议分析卷',
    questionCount: 20,
    durationMin: 40,
    myScore: null,
    opponentScore: null,
    status: 'ongoing',
    createdAt: '2026-09-11 09:20',
  },
  {
    id: 'pk5',
    opponent: '匿名同学 7734',
    opponentTag: '软件工程 408',
    topicId: 'db',
    paperName: '数据库 · SQL 与范式卷',
    questionCount: 22,
    durationMin: 50,
    myScore: null,
    opponentScore: null,
    status: 'pending',
    createdAt: '2026-09-11 08:05',
    inviteCode: 'PK-7F4Q2M',
  },
]

export const DEFAULT_PROFILE: PublicProfile = {
  nickname: '刷题网用户',
  signature: '正在冲 408，欢迎友好切磋。',
  visibility: 'friends',
  publicTopicIds: ['ds', 'os'],
  allowChallenge: true,
  showScore: true,
}

export interface ArenaStat {
  label: string
  value: string
  hint?: string
}

export const ARENA_STATS: ArenaStat[] = [
  { label: '进行中对战', value: '2', hint: '含 1 场待你应战' },
  { label: '累计对战', value: '17' },
  { label: '胜率', value: '62%', hint: '10 胜 5 负 2 平' },
  { label: '最佳连胜', value: '5' },
]

/** PK 状态展示元数据 */
export const PK_STATUS_META: Record<PkStatus, { label: string; className: string }> = {
  pending: { label: '待应战', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  ongoing: { label: '进行中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  won: { label: '胜', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  lost: { label: '负', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  draw: { label: '平', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

export interface ArenaQuestion {
  id: string
  paperId: string
  topicId: string
  type: string
  stem: string
}

/** 试卷内题目预览，用于「发起邀请」时展示关联的题目 */
export const ARENA_QUESTIONS: ArenaQuestion[] = [
  { id: 'q1', paperId: 'p1', topicId: 'ds', type: '单选', stem: '在含有 n 个结点的二叉排序树中查找一个关键字，最坏情况下的时间复杂度是（ ）。' },
  { id: 'q2', paperId: 'p1', topicId: 'ds', type: '综合', stem: '已知一棵二叉树的先序与中序遍历序列，画出该二叉树并写出其后序遍历序列。' },
  { id: 'q3', paperId: 'p1', topicId: 'ds', type: '算法设计', stem: '设计算法判断无向图 G 是否为连通图，要求时间复杂度不超过 O(n + e)。' },
  { id: 'q4', paperId: 'p2', topicId: 'ds', type: '综合', stem: '对给定关键字序列构造平衡二叉树（AVL），写出每次插入后的调整过程。' },
  { id: 'q5', paperId: 'p3', topicId: 'os', type: '综合', stem: '某系统采用 LRU 页面置换算法，给定引用串与物理块数，计算缺页率。' },
  { id: 'q6', paperId: 'p3', topicId: 'os', type: 'PV 操作', stem: '用信号量实现「读者—写者」问题，要求写者优先。' },
  { id: 'q7', paperId: 'p4', topicId: 'co', type: '计算', stem: '某 Cache 采用 4 路组相联映射，主存地址 32 位，求标记位、组号与块内地址位数。' },
  { id: 'q8', paperId: 'p5', topicId: 'cn', type: '计算', stem: '某 TCP 连接的拥塞窗口从 1 开始，采用慢开始与拥塞避免，画出前 12 轮的窗口变化。' },
  { id: 'q9', paperId: 'p6', topicId: 'db', type: 'SQL 手写', stem: '写出 SQL 查询：统计每个院系中平均成绩高于全校平均成绩的学生人数。' },
  { id: 'q10', paperId: 'p7', topicId: 'cc', type: '构造', stem: '给定文法，求各非终结符的 FIRST 集与 FOLLOW 集，并判断是否为 LL(1) 文法。' },
]

export function questionsOfPaper(paperId: string): ArenaQuestion[] {
  return ARENA_QUESTIONS.filter((question) => question.paperId === paperId)
}

export function papersOfTopic(topicId: string): ArenaPaper[] {
  return ARENA_PAPERS.filter((paper) => paper.topicId === topicId)
}

