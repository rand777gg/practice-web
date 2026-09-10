/**
 * 引路人（师徒 / 拜师）DEMO 数据。
 * 联系方式均为虚构示例，仅用于演示交互，不接任何数据库。
 */

export type HelpKind = '择校定位' | '复习规划' | '专业课答疑' | '真题资料' | '复试指导' | '心态陪伴'

export type RewardKind = '免费带' | '互相交流' | '请喝奶茶' | '笔记互换'

export type ContactChannel = '微信' | 'QQ' | '邮箱' | '站内私信'

export type SchoolTier = '985' | '211' | '双一流' | '普通院校'

export interface MentorContact {
  channel: ContactChannel
  value: string
}

export interface Mentor {
  id: string
  nickname: string
  school: string
  schoolTier: SchoolTier
  major: string
  enrollYear: string
  score: string
  topicIds: string[]
  headline: string
  intro: string
  helps: HelpKind[]
  reward: RewardKind
  contacts: MentorContact[]
  slots: { used: number; total: number }
  rating: number
  menteeCount: number
  /** 平均响应时长（小时） */
  responseHours: number
  /** 最近活跃 */
  lastActive: string
  online: boolean
  featured?: boolean
}

export interface MentorshipApplication {
  id: string
  mentorId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
  message: string
  goal: string
}

export interface MentorSettings {
  open: boolean
  topicIds: string[]
  helps: HelpKind[]
  reward: RewardKind
  channels: ContactChannel[]
  visibility: 'after-approval' | 'members' | 'public'
  slots: number
  note: string
}

export const HELP_KINDS: HelpKind[] = ['择校定位', '复习规划', '专业课答疑', '真题资料', '复试指导', '心态陪伴']
export const REWARD_KINDS: RewardKind[] = ['免费带', '互相交流', '请喝奶茶', '笔记互换']
export const CONTACT_CHANNELS: ContactChannel[] = ['微信', 'QQ', '邮箱', '站内私信']

export const MENTORS: Mentor[] = [
  {
    id: 'm-linyi',
    nickname: '林一',
    school: '清华大学',
    schoolTier: '985',
    major: '计算机科学与技术',
    enrollYear: '2025 上岸',
    score: '408 总分 138',
    topicIds: ['ds', 'os'],
    headline: '二战上岸，擅长把数据结构讲成流程图而不是代码',
    intro:
      '本科双非，二战 408。第一年死在数据结构大题上，第二年把树与图全部改成手绘流程图重学了一遍。现在愿意带 1-2 位同学，重点帮你把「看得懂但写不出」这一段补上。每周固定一次 30 分钟语音答疑。',
    helps: ['择校定位', '复习规划', '专业课答疑'],
    reward: '互相交流',
    contacts: [
      { channel: '微信', value: 'linyi_408go' },
      { channel: '站内私信', value: '@林一' },
    ],
    slots: { used: 1, total: 3 },
    rating: 4.9,
    menteeCount: 7,
    responseHours: 3,
    lastActive: '2 小时前',
    online: true,
    featured: true,
  },
  {
    id: 'm-suwan',
    nickname: '苏晚',
    school: '浙江大学',
    schoolTier: '985',
    major: '软件工程',
    enrollYear: '2024 上岸',
    score: '408 总分 132',
    topicIds: ['co', 'cn'],
    headline: '组成原理计算题笔记整理了三版，可以直接发你',
    intro:
      '在职备考上岸，白天上班晚上刷题，最懂时间不够用是什么感觉。整理了一份 Cache 与流水线的计算题模板（三版迭代），带过的同学基本都能把第 40 题拿满。愿意免费带，前提是你每周能交一次作业。',
    helps: ['专业课答疑', '真题资料', '复习规划'],
    reward: '免费带',
    contacts: [
      { channel: 'QQ', value: '3281****57' },
      { channel: '邮箱', value: 'suwan.go@example.com' },
    ],
    slots: { used: 0, total: 2 },
    rating: 4.8,
    menteeCount: 11,
    responseHours: 6,
    lastActive: '昨天',
    online: true,
  },
  {
    id: 'm-chenzhou',
    nickname: '陈舟',
    school: '北京邮电大学',
    schoolTier: '211',
    major: '网络空间安全',
    enrollYear: '2023 上岸',
    score: '408 总分 124',
    topicIds: ['cn', 'ds'],
    headline: '复试逆袭 20 名，专治初试压线的心态问题',
    intro:
      '初试压线进复试，最后总分排进前 30%。对复试流程、导师联系邮件、面试常见问题比较熟。也愿意聊专业课，但更擅长帮你把心态稳住。',
    helps: ['复试指导', '心态陪伴'],
    reward: '请喝奶茶',
    contacts: [{ channel: '微信', value: 'chenzhou_bupt' }],
    slots: { used: 2, total: 4 },
    rating: 4.6,
    menteeCount: 9,
    responseHours: 12,
    lastActive: '3 天前',
    online: false,
  },
  {
    id: 'm-wenrou',
    nickname: '温柔',
    school: '华中科技大学',
    schoolTier: '985',
    major: '计算机技术',
    enrollYear: '2025 上岸',
    score: '408 总分 141',
    topicIds: ['ds'],
    headline: '数据结构大题 3 年真题全刷，名额已满先别申请',
    intro:
      '今年带了 3 位同学，名额已经满了，暂时不再接收新的拜师申请。但你可以在专题的「前辈足迹」里找到我的复习记录，或者在公开笔记里看我的答题模板。',
    helps: ['复习规划', '心态陪伴', '专业课答疑'],
    reward: '免费带',
    contacts: [{ channel: '站内私信', value: '@温柔' }],
    slots: { used: 3, total: 3 },
    rating: 5.0,
    menteeCount: 6,
    responseHours: 8,
    lastActive: '今天',
    online: true,
  },
  {
    id: 'm-laozhou',
    nickname: '老周',
    school: '西安电子科技大学',
    schoolTier: '211',
    major: '计算机科学与技术',
    enrollYear: '2022 上岸',
    score: '专业课 128',
    topicIds: ['db'],
    headline: '数据库自命题 5 年真题都能讲，换笔记就行',
    intro:
      '报考院校是自命题，数据库系统原理我做了 5 年真题的逐题拆解。不需要付费，但希望你能把自己整理的笔记发我一份，互相补充。已经有 1 位同学在带。',
    helps: ['专业课答疑', '真题资料'],
    reward: '笔记互换',
    contacts: [
      { channel: 'QQ', value: '6142****03' },
      { channel: '站内私信', value: '@老周' },
    ],
    slots: { used: 1, total: 5 },
    rating: 4.7,
    menteeCount: 14,
    responseHours: 18,
    lastActive: '本周',
    online: false,
  },
  {
    id: 'm-atang',
    nickname: '阿糖',
    school: '南京大学',
    schoolTier: '985',
    major: '计算机科学与技术',
    enrollYear: '2025 上岸',
    score: '专业课 134',
    topicIds: ['cc', 'os'],
    headline: '编译原理分析表构造有固定模板，一对一改卷',
    intro:
      '编译原理是我唯一考满分的科目。FIRST/FOLLOW 集和 LR 分析表我总结了一套模板化写法，可以帮你逐份改卷。只带 1 位，想找真能坚持下来的同学。',
    helps: ['择校定位', '复习规划', '专业课答疑'],
    reward: '互相交流',
    contacts: [{ channel: '微信', value: 'atang_compiler' }],
    slots: { used: 0, total: 1 },
    rating: 4.9,
    menteeCount: 4,
    responseHours: 4,
    lastActive: '5 小时前',
    online: true,
    featured: true,
  },
  {
    id: 'm-mumu',
    nickname: '木木',
    school: '杭州电子科技大学',
    schoolTier: '双一流',
    major: '计算机技术',
    enrollYear: '2024 上岸',
    score: '408 总分 118',
    topicIds: ['os', 'cn'],
    headline: '不是高分选手，但很会陪人熬过瓶颈期',
    intro:
      '我的分数不算高，但备考那年情绪崩过两次，后来自己摸索出一套节奏管理方法。如果你现在处于「学不动又不敢停」的状态，可以找我聊聊。纯陪聊，不谈技巧。',
    helps: ['心态陪伴'],
    reward: '免费带',
    contacts: [{ channel: '站内私信', value: '@木木' }],
    slots: { used: 1, total: 6 },
    rating: 4.5,
    menteeCount: 5,
    responseHours: 2,
    lastActive: '1 小时前',
    online: true,
  },
  {
    id: 'm-qinghe',
    nickname: '青禾',
    school: '中国科学技术大学',
    schoolTier: '985',
    major: '计算机科学与技术',
    enrollYear: '2025 上岸',
    score: '408 总分 145',
    topicIds: ['co', 'os', 'ds'],
    headline: '全程规划型，从 3 月到 12 月给你排好节奏',
    intro:
      '我的习惯是把整年拆成 4 个阶段、每阶段定 3 个可验收的目标。带过 2 位同学，都是应届生。如果你需要一个人帮你把大目标拆成每周清单，可以来找我，带满 2 位就停。',
    helps: ['择校定位', '复习规划', '专业课答疑', '心态陪伴'],
    reward: '免费带',
    contacts: [
      { channel: '微信', value: 'qinghe_ustc' },
      { channel: '邮箱', value: 'qinghe.go@example.com' },
    ],
    slots: { used: 2, total: 2 },
    rating: 5.0,
    menteeCount: 8,
    responseHours: 5,
    lastActive: '今天',
    online: false,
  },
]

export const MY_APPLICATIONS: MentorshipApplication[] = [
  {
    id: 'app1',
    mentorId: 'm-linyi',
    status: 'accepted',
    createdAt: '2026-08-14',
    message: '二战 408，数据结构综合题总是写不完整，想找人带一段时间。',
    goal: '目标 985，当前数据结构自测 42/70',
  },
  {
    id: 'app2',
    mentorId: 'm-atang',
    status: 'pending',
    createdAt: '2026-09-09',
    message: '编译原理 LR 分析表构造总出错，想请你帮我改几份卷子。',
    goal: '目标南大，专业课刚过完第一轮',
  },
  {
    id: 'app3',
    mentorId: 'm-wenrou',
    status: 'rejected',
    createdAt: '2026-08-02',
    message: '想跟着你刷数据结构大题。',
    goal: '目标 985，数据结构基础尚可',
  },
]

export const MENTOR_STATS = [
  { label: '开放带人的引路人', value: '1,286', hint: '较上月 +218' },
  { label: '已成功结对', value: '3,412', hint: '组' },
  { label: '平均响应时长', value: '6.2', hint: '小时' },
  { label: '徒弟好评率', value: '96%' },
]

export const APPLICATION_STATUS_META: Record<
  MentorshipApplication['status'],
  { label: string; className: string }
> = {
  pending: { label: '待师门确认', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  accepted: { label: '已结对', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected: { label: '暂无空缺', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
}

export const DEFAULT_MENTOR_SETTINGS: MentorSettings = {
  open: false,
  topicIds: ['ds'],
  helps: ['专业课答疑'],
  reward: '互相交流',
  channels: ['站内私信'],
  visibility: 'after-approval',
  slots: 2,
  note: '每天 22:00 - 23:00 有空，周末可以语音。',
}

export const VISIBILITY_OPTIONS: { key: MentorSettings['visibility']; label: string; desc: string }[] = [
  { key: 'after-approval', label: '拜师通过后可见', desc: '推荐：只有你确认的徒弟才能看到联系方式' },
  { key: 'members', label: '仅登录用户可见', desc: '所有注册用户都能看到，无需申请' },
  { key: 'public', label: '完全公开', desc: '任何人（含未登录访客）都能看到' },
]

export const TIER_CLASS: Record<SchoolTier, string> = {
  '985': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  '211': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  双一流: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  普通院校: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function mentorById(id: string): Mentor | undefined {
  return MENTORS.find((mentor) => mentor.id === id)
}

export function hasVacancy(mentor: Mentor): boolean {
  return mentor.slots.used < mentor.slots.total
}

/** 联系方式脱敏：保留前 3 位与后 2 位 */
export function maskContact(value: string): string {
  if (value.includes('@')) {
    const [name, domain] = value.split('@')
    return `${name.slice(0, 2)}***@${domain}`
  }
  if (value.length <= 5) return `${value.slice(0, 1)}***`
  return `${value.slice(0, 3)}***${value.slice(-2)}`
}
