import type { Json } from '@/types/database'
import type { UserRole, Profile, PlanRound, PlanGoal, PlanScope } from '@/types'
import { normalizePlanRounds, normalizePlanGoals, getPlanScope } from '@/types'
import { db, run, runList, fetchAll, toJson, type QueryOptions, type Update } from './db'
import { assertColumns } from './columns'

/**
 * profiles 的字段集。
 *
 * 曾经到处是 select('*')：加一列就顺手进了所有界面，包括别人的公开资料页。
 * 这里按用途拆开 —— 自己看详情、看别人的公开资料、只读计划 —— 新增列必须显式加进对应的集合。
 * 每个集合都由 assertColumns 在编译期核对「mapper 要读的字段是否都在这段字符串里」。
 */
export type ProfileSource = {
  id: string
  role: string
  nickname: string | null
  avatar_url: string | null
  avatar_preset: string | null
  created_at: string
  deadline: string | null
  plan_subjects: string | null
  plan_rounds: Json | null
  plan_goals: Json | null
  daily_targets: string | null
  daily_deadline: string | null
  milestones: Json | null
  goal_type: string | null
  exam_status: string | null
  target_school: string | null
  profile_visibility: Json
  plan_reset_at: string | null
  plan_scope: Json | null
  subject_reset_at: Json | null
  daily_reset_at: string | null
  totp_enabled: boolean
  preferred_2fa: string
  passkey_timeout_minutes: number
  mfa_grace_until: string | null
  mfa_validity_days: number
  onboarded_at: string | null
}

/** 自己看的详情字段集 */
export const PROFILE_COLUMNS = assertColumns<ProfileSource>()(
  'id, role, nickname, avatar_url, avatar_preset, created_at, deadline, plan_subjects, plan_rounds, plan_goals, daily_targets, daily_deadline, milestones, goal_type, exam_status, target_school, profile_visibility, plan_reset_at, plan_scope, subject_reset_at, daily_reset_at, totp_enabled, preferred_2fa, passkey_timeout_minutes, mfa_grace_until, mfa_validity_days, onboarded_at',
)

/** 看别人的资料：只取认人和自习室展示需要的列，计划、MFA 一概不下发 */
export type PublicProfileSource = Pick<
  ProfileSource,
  'id' | 'role' | 'nickname' | 'avatar_url' | 'avatar_preset' | 'goal_type' | 'exam_status' | 'target_school' | 'profile_visibility' | 'created_at'
>

export const PROFILE_PUBLIC_COLUMNS = assertColumns<PublicProfileSource>()(
  'id, role, nickname, avatar_url, avatar_preset, goal_type, exam_status, target_school, profile_visibility, created_at',
)

/** 只读计划：DashboardPlanCards / PlanDialog / 计划完成度计算都在读这一组 */
export type ProfilePlanSource = Pick<
  ProfileSource,
  'id' | 'deadline' | 'plan_subjects' | 'plan_rounds' | 'plan_goals' | 'daily_targets' | 'milestones' | 'plan_reset_at' | 'plan_scope' | 'subject_reset_at' | 'daily_reset_at'
>

export const PROFILE_PLAN_COLUMNS = assertColumns<ProfilePlanSource>()(
  'id, deadline, plan_subjects, plan_rounds, plan_goals, daily_targets, milestones, plan_reset_at, plan_scope, subject_reset_at, daily_reset_at',
)

const SUBJECT_RESET_COLUMNS = assertColumns<Pick<ProfileSource, 'subject_reset_at'>>()('subject_reset_at')

type ProfileUpdate = Update<'profiles'>

function asUserRole(value: string): UserRole {
  return value === 'admin' ? 'admin' : 'user'
}

/** DB 行 → 领域对象。JSONB 在这里归一化，UI 层不再各写一遍 parse。 */
export function toProfile(row: ProfileSource): Profile {
  return {
    id: row.id,
    role: asUserRole(row.role),
    nickname: row.nickname,
    avatar_url: row.avatar_url,
    avatar_preset: row.avatar_preset,
    deadline: row.deadline,
    plan_subjects: row.plan_subjects,
    plan_rounds: normalizePlanRounds(row.plan_rounds),
    plan_goals: normalizePlanGoals(row.plan_goals),
    daily_targets: row.daily_targets,
    daily_deadline: row.daily_deadline,
    milestones: row.milestones ?? undefined,
    goal_type: row.goal_type,
    exam_status: row.exam_status,
    target_school: row.target_school,
    profile_visibility: (row.profile_visibility ?? null) as Profile['profile_visibility'],
    plan_reset_at: row.plan_reset_at,
    plan_scope: getPlanScope({ plan_scope: row.plan_scope as PlanScope | null }),
    subject_reset_at: (row.subject_reset_at ?? null) as Record<string, string> | null,
    daily_reset_at: row.daily_reset_at,
    totp_enabled: row.totp_enabled,
    preferred_2fa: row.preferred_2fa === 'passkey' ? 'passkey' : 'totp',
    passkey_timeout_minutes: row.passkey_timeout_minutes,
    mfa_grace_until: row.mfa_grace_until,
    mfa_validity_days: row.mfa_validity_days,
    onboarded_at: row.onboarded_at,
    created_at: row.created_at,
  }
}

/**
 * 取自己的资料。新用户的 profile 由 auth.users 上的 on_auth_user_created 触发器建，
 * 正常情况下这里一定查得到；触发器落库与客户端拿到会话之间有一瞬间空窗，所以允许返回 null，
 * 由调用方决定是重试还是报错 —— 绝不再走「先 count 再 insert」那条竞态路径。
 */
export async function fetchProfile(userId: string, options: QueryOptions = {}): Promise<Profile | null> {
  const base = db.from('profiles').select(PROFILE_COLUMNS).eq('id', userId)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'profiles.fetchProfile' },
  )
  return row ? toProfile(row) : null
}

/** 带重试的取资料：给触发器落库留一点时间，避免新用户第一次进站看到"资料不存在"。 */
export async function fetchProfileWithRetry(
  userId: string,
  options: QueryOptions & { attempts?: number } = {},
): Promise<Profile | null> {
  const attempts = options.attempts ?? 3
  for (let i = 0; i < attempts; i++) {
    const profile = await fetchProfile(userId, options)
    if (profile) return profile
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i))
  }
  return null
}

/** 批量取公开资料，用于自习室、公开笔记、用户管理列表 */
export async function fetchPublicProfiles(ids: string[], options: QueryOptions = {}): Promise<PublicProfileSource[]> {  if (ids.length === 0) return []
  const base = db.from('profiles').select(PROFILE_PUBLIC_COLUMNS).in('id', ids)
  return runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'profiles.fetchPublicProfiles' },
  )
}

/**
 * 管理员看全站用户：整表分页读，按注册时间升序。
 * 走 fetchAll 而不是一次 select —— 用户数超过 PostgREST 单次 1000 行上限时，
 * 静默截断会让管理员以为"就这么些人"。
 */
export async function listAllProfiles(options: QueryOptions = {}): Promise<Profile[]> {
  const rows = await fetchAll(
    (from, to) => {
      const base = db
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .order('created_at', { ascending: true })
        .range(from, to)
      return options.signal ? base.abortSignal(options.signal) : base
    },
    { ...options, context: options.context ?? 'profiles.listAllProfiles' },
  )
  return rows.map(toProfile)
}

export async function updateProfile(userId: string, patch: ProfileUpdate, options: QueryOptions = {}): Promise<void> {
  const base = db.from('profiles').update(patch).eq('id', userId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'profiles.updateProfile' },
  )
}

export async function setProfileRole(userId: string, role: UserRole, options: QueryOptions = {}): Promise<void> {
  await updateProfile(userId, { role }, options)
}

/** 写轮次快照（JSONB）。轮次模型见 types.PlanRound */
export async function savePlanRounds(userId: string, rounds: PlanRound[], options: QueryOptions = {}): Promise<void> {
  await updateProfile(userId, { plan_rounds: toJson(rounds) }, options)
}

export async function savePlanGoals(userId: string, goals: PlanGoal[], options: QueryOptions = {}): Promise<void> {
  await updateProfile(userId, { plan_goals: toJson(goals) }, options)
}

/**
 * 合并式写 subject_reset_at：读当前值 → 合并 patch → 落库，返回合并结果。
 * 学科重置时刻是「这一遍从哪天算起」的唯一依据，覆盖写会丢掉其他学科的时刻，
 * 所以这里只暴露合并语义。patch 里值为 null 表示删掉该学科。
 */
export async function mergeSubjectResetAt(
  userId: string,
  patch: Record<string, string | null>,
  options: QueryOptions = {},
): Promise<Record<string, string>> {
  const base = db.from('profiles').select(SUBJECT_RESET_COLUMNS).eq('id', userId)
  const current = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'profiles.mergeSubjectResetAt.read' },
  )
  const merged: Record<string, string> = { ...((current?.subject_reset_at ?? {}) as Record<string, string>) }
  for (const [subject, at] of Object.entries(patch)) {
    if (at === null) delete merged[subject]
    else merged[subject] = at
  }
  await updateProfile(userId, { subject_reset_at: toJson(merged) }, options)
  return merged
}

/** 昵称与头像的自动补齐：登录后异步跑，不阻塞首屏。 */
export async function backfillLoginProfile(
  userId: string,
  patch: { nickname?: string; avatar_url?: string },
  options: QueryOptions = {},
): Promise<void> {
  await updateProfile(userId, patch, { ...options, context: options.context ?? 'profiles.backfillLoginProfile' })
}
