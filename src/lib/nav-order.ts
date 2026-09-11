/** 侧边栏可排序项的元数据: id 与 AppSidebar 里 NavItem.id 一一对应 */
export const SIDEBAR_GROUPS = ['learn', 'smart', 'community', 'admin'] as const

export type SidebarGroup = (typeof SIDEBAR_GROUPS)[number]

export interface SidebarItemMeta {
  id: string
  group: SidebarGroup
  labelZh: string
  labelEn: string
}

export const SIDEBAR_ITEMS: SidebarItemMeta[] = [
  { id: 'dashboard', group: 'learn', labelZh: '仪表盘', labelEn: 'Dashboard' },
  { id: 'dataCenter', group: 'learn', labelZh: '数据中心', labelEn: 'Data Center' },
  { id: 'practice', group: 'learn', labelZh: '练习', labelEn: 'Practice' },
  { id: 'exam', group: 'learn', labelZh: '考试', labelEn: 'Exam' },
  { id: 'questionBank', group: 'learn', labelZh: '题库', labelEn: 'Question Bank' },
  { id: 'templates', group: 'learn', labelZh: '模板', labelEn: 'Templates' },
  { id: 'topics', group: 'learn', labelZh: '专业专题', labelEn: 'Topics' },
  { id: 'learningRoutes', group: 'learn', labelZh: '学习路线', labelEn: 'Learning Routes' },
  { id: 'notes', group: 'learn', labelZh: '公开笔记', labelEn: 'Public Notes' },
  { id: 'studyRooms', group: 'learn', labelZh: '自习室', labelEn: 'Study Rooms' },

  { id: 'assistant', group: 'smart', labelZh: '小Q', labelEn: 'Xiao Q' },
  { id: 'aiSettings', group: 'smart', labelZh: 'AI 设置', labelEn: 'AI Settings' },

  { id: 'community', group: 'community', labelZh: '社区', labelEn: 'Community' },

  { id: 'adminQuestions', group: 'admin', labelZh: '题目管理', labelEn: 'Questions' },
  { id: 'adminLearningRoutes', group: 'admin', labelZh: '学习路线', labelEn: 'Learning Routes' },
  { id: 'adminCrawler', group: 'admin', labelZh: '分布式采集', labelEn: 'Crawler' },
  { id: 'adminOrganizeExam', group: 'admin', labelZh: '组织考试', labelEn: 'Organize Exam' },
  { id: 'adminUsers', group: 'admin', labelZh: '用户管理', labelEn: 'Users' },
]

export const SIDEBAR_GROUP_LABELS: Record<SidebarGroup, { labelZh: string; labelEn: string }> = {
  learn: { labelZh: '学习', labelEn: 'Learn' },
  smart: { labelZh: '智能', labelEn: 'Smart' },
  community: { labelZh: '社区', labelEn: 'Community' },
  admin: { labelZh: '管理', labelEn: 'Admin' },
}

export type SidebarOrder = Record<SidebarGroup, string[]>

export const DEFAULT_SIDEBAR_ORDER: SidebarOrder = {
  learn: SIDEBAR_ITEMS.filter((i) => i.group === 'learn').map((i) => i.id),
  smart: SIDEBAR_ITEMS.filter((i) => i.group === 'smart').map((i) => i.id),
  community: SIDEBAR_ITEMS.filter((i) => i.group === 'community').map((i) => i.id),
  admin: SIDEBAR_ITEMS.filter((i) => i.group === 'admin').map((i) => i.id),
}

const VALID_IDS = new Set(SIDEBAR_ITEMS.map((i) => i.id))

/** 丢弃已下线项、补上新增项, 保证每组顺序始终完整 */
export function normalizeSidebarOrder(raw: unknown): SidebarOrder {
  const source = (raw ?? {}) as Partial<Record<SidebarGroup, unknown>>
  const result = { ...DEFAULT_SIDEBAR_ORDER }
  for (const group of SIDEBAR_GROUPS) {
    const stored = source[group]
    if (!Array.isArray(stored)) continue
    const kept = stored.filter((id): id is string => typeof id === 'string' && VALID_IDS.has(id))
    const seen = new Set(kept)
    const missing = DEFAULT_SIDEBAR_ORDER[group].filter((id) => !seen.has(id))
    result[group] = [...kept, ...missing]
  }
  return result
}

export function moveItem(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
