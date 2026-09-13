export const EXAM_STATUSES = [
  { value: 'school', label: '在校备考' },
  { value: 'full', label: '全职备考' },
  { value: 'working', label: '在职备考' },
  { value: 'repeat', label: '二战及以后' },
  { value: 'done', label: '已上岸' },
] as const

export type ExamStatusValue = (typeof EXAM_STATUSES)[number]['value']

export function examStatusLabel(value?: string | null): string {
  if (!value) return ''
  return EXAM_STATUSES.find((s) => s.value === value)?.label ?? ''
}

/** 自习室里可以自己决定公开的资料项; 昵称与头像不在此列(靠它们认人) */
export const VISIBILITY_ITEMS = [
  { key: 'goal_type', label: '备考目标' },
  { key: 'exam_status', label: '备考状态' },
  { key: 'target_school', label: '目标院校' },
] as const

export type VisibilityKey = (typeof VISIBILITY_ITEMS)[number]['key']

export type ProfileVisibility = Record<VisibilityKey, boolean>

/** 默认全不公开: 成员得自己勾选才会出现在自习室里 */
export const DEFAULT_VISIBILITY: ProfileVisibility = {
  goal_type: false,
  exam_status: false,
  target_school: false,
}

export function parseVisibility(raw: unknown): ProfileVisibility {
  const src = (raw ?? {}) as Record<string, unknown>
  return {
    goal_type: src.goal_type === true,
    exam_status: src.exam_status === true,
    target_school: src.target_school === true,
  }
}

/** 只留勾上的键, 免得 profile_visibility 里堆积历史字段 */
export function serializeVisibility(v: ProfileVisibility): Record<string, true> {
  const out: Record<string, true> = {}
  for (const item of VISIBILITY_ITEMS) {
    if (v[item.key]) out[item.key] = true
  }
  return out
}

export interface PublicProfile {
  id: string
  nickname: string | null
  avatar_url: string | null
  avatar_preset: string | null
  /** 未公开时为 null, 服务端就不下发 */
  goal_type: string | null
  exam_status: string | null
  target_school: string | null
}
