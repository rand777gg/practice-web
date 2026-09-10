/**
 * 成就系统 DEMO 数据：徽章 + 学习足迹里程碑。纯前端演示，不接数据库。
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export type AchievementCategory = '刷题' | '坚持' | '专题' | '对战' | '贡献'

export interface Achievement {
  id: string
  name: string
  description: string
  tier: AchievementTier
  category: AchievementCategory
  progress: number
  target: number
  unlockedAt: string | null
  points: number
}

export type MilestoneKind = 'start' | 'streak' | 'topic' | 'arena' | 'note' | 'level'

export interface Milestone {
  id: string
  date: string
  title: string
  desc: string
  kind: MilestoneKind
  topicId?: string
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'a1', name: '初次落笔', description: '完成第一道练习题', tier: 'bronze', category: '刷题', progress: 1, target: 1, unlockedAt: '2026-06-02', points: 10 },
  { id: 'a2', name: '百题斩', description: '累计完成 100 道题', tier: 'bronze', category: '刷题', progress: 100, target: 100, unlockedAt: '2026-07-14', points: 30 },
  { id: 'a3', name: '千题之路', description: '累计完成 1000 道题', tier: 'silver', category: '刷题', progress: 742, target: 1000, unlockedAt: null, points: 80 },
  { id: 'a4', name: '七日不辍', description: '连续 7 天有练习记录', tier: 'bronze', category: '坚持', progress: 7, target: 7, unlockedAt: '2026-07-20', points: 30 },
  { id: 'a5', name: '月度恒心', description: '连续 30 天有练习记录', tier: 'gold', category: '坚持', progress: 30, target: 30, unlockedAt: '2026-08-19', points: 120 },
  { id: 'a6', name: '夜行者', description: '在 00:00 - 05:00 完成 20 道题', tier: 'silver', category: '坚持', progress: 13, target: 20, unlockedAt: null, points: 50 },
  { id: 'a7', name: '专题入门', description: '完整读完一个专题的专业课介绍', tier: 'bronze', category: '专题', progress: 1, target: 1, unlockedAt: '2026-06-05', points: 15 },
  { id: 'a8', name: '图谱通读', description: '通读同一专题下全部章节框架', tier: 'silver', category: '专题', progress: 3, target: 4, unlockedAt: null, points: 60 },
  { id: 'a9', name: '登榜者', description: '在热门专业课排行榜进入前 3', tier: 'gold', category: '专题', progress: 0, target: 1, unlockedAt: null, points: 150 },
  { id: 'a10', name: '首次切磋', description: '完成第一场友好 PK', tier: 'bronze', category: '对战', progress: 1, target: 1, unlockedAt: '2026-08-02', points: 20 },
  { id: 'a11', name: '五连胜', description: '在友好 PK 中取得 5 连胜', tier: 'gold', category: '对战', progress: 5, target: 5, unlockedAt: '2026-09-06', points: 140 },
  { id: 'a12', name: '笔记传灯', description: '发布 10 篇公开笔记，被收藏 50 次', tier: 'platinum', category: '贡献', progress: 6, target: 10, unlockedAt: null, points: 300 },
]

export const MILESTONES: Milestone[] = [
  { id: 'm1', date: '2026-06-01', title: '开启刷题之旅', desc: '注册账号，选定第一个专业课专题「数据结构与算法」。', kind: 'start', topicId: 'ds' },
  { id: 'm2', date: '2026-06-05', title: '读完第一份专题框架', desc: '通读数据结构 6 个章节的考点密度图谱。', kind: 'topic', topicId: 'ds' },
  { id: 'm3', date: '2026-07-14', title: '累计完成 100 道题', desc: '解锁「百题斩」徽章，正确率 68% → 76%。', kind: 'level' },
  { id: 'm4', date: '2026-07-20', title: '连续打卡 7 天', desc: '解锁「七日不辍」，日均练习 42 分钟。', kind: 'streak' },
  { id: 'm5', date: '2026-08-02', title: '完成第一场友好 PK', desc: '对阵「匿名同学 3821」，数据结构专项卷 17 : 14 取胜。', kind: 'arena', topicId: 'ds' },
  { id: 'm6', date: '2026-08-19', title: '月度恒心达成', desc: '连续 30 天有练习记录，解锁金色徽章。', kind: 'streak' },
  { id: 'm7', date: '2026-08-27', title: '发布第一篇公开笔记', desc: '《树与图的 6 种手工模拟速查》被收藏 23 次。', kind: 'note' },
  { id: 'm8', date: '2026-09-06', title: 'PK 五连胜', desc: '在操作系统与组成原理两个专题连续取胜。', kind: 'arena', topicId: 'os' },
  { id: 'm9', date: '2026-09-10', title: '升至 Lv.7 刷题学徒', desc: '累计经验 2680，距离下一等级还差 820。', kind: 'level' },
]

export const ACHIEVEMENT_SUMMARY = {
  level: 7,
  levelTitle: '刷题学徒',
  exp: 2680,
  nextLevelExp: 3500,
  totalPoints: 725,
}

export const TIER_META: Record<AchievementTier, { label: string; className: string; ring: string }> = {
  bronze: {
    label: '青铜',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    ring: 'ring-amber-300/60 dark:ring-amber-700/50',
  },
  silver: {
    label: '白银',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    ring: 'ring-slate-300/60 dark:ring-slate-600/50',
  },
  gold: {
    label: '黄金',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    ring: 'ring-yellow-300/60 dark:ring-yellow-700/50',
  },
  platinum: {
    label: '铂金',
    className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
    ring: 'ring-cyan-300/60 dark:ring-cyan-700/50',
  },
}

export const MILESTONE_KIND_META: Record<MilestoneKind, { className: string }> = {
  start: { className: 'bg-primary/15 text-primary' },
  streak: { className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  topic: { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  arena: { className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  note: { className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  level: { className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
}
