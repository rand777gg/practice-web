import type { Json } from '@/types/database'
import { db, run, runList, toJson, type QueryOptions } from './db'
import { AppError } from './errors'
import { assertColumns } from './columns'

/**
 * 账号域服务: 用户设置、信任设备、MFA 会话、推送订阅、插件、提示词、扫码登录、专注时长。
 *
 * 两条贯穿全文件的规矩:
 *   · 列集一律写成常量 —— 原先 MFA / 设备那几处的 select('*') 把整行(含服务端写的指纹)随手发进了界面;
 *   · 写失败一律抛 AppError —— 调用点原先 .then(() => {}) 或只判 error, 失败被当成成功。
 */

/** settings / config / device_info 三个 JSONB 列只接受对象, 数组和标量一律按缺省处理 */
function isJsonObject(value: unknown): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// --- user_settings ---

/** 云同步快照: 键是 localStorage 的键, 值是按 JSON 解析后的值 */
export type SettingsSnapshot = Record<string, unknown>

export interface UserSettings {
  settings: SettingsSnapshot
  updated_at: string
}

export type UserSettingsSource = {
  settings: Json
  updated_at: string
}

export const USER_SETTINGS_COLUMNS = assertColumns<UserSettingsSource>()('settings, updated_at')

/** DB 行 → 领域对象。parse 只在这一处做, 界面拿到的 settings 一定是对象。 */
export function toUserSettings(row: UserSettingsSource): UserSettings {
  return {
    settings: isJsonObject(row.settings) ? row.settings : {},
    updated_at: row.updated_at,
  }
}

/** 读服务端快照: 设置页的冲突检测和"下载服务器设置"都只要这两列 */
export async function fetchUserSettings(userId: string, options: QueryOptions = {}): Promise<UserSettings | null> {
  const base = db.from('user_settings').select(USER_SETTINGS_COLUMNS).eq('user_id', userId)
  const row = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base).maybeSingle(),
    { ...options, context: options.context ?? 'account.fetchUserSettings' },
  )
  return row ? toUserSettings(row) : null
}

/**
 * 整份快照覆盖写, 返回落库的 updated_at。
 * updated_at 必须由客户端带上 —— 这张表没有 set_updated_at 触发器, 不传就永远停在建行那一刻,
 * 而"上次同步时间"正是拿它显示的。
 */
export async function upsertSettings(
  userId: string,
  settings: SettingsSnapshot,
  options: QueryOptions = {},
): Promise<string> {
  const updatedAt = new Date().toISOString()
  const base = db
    .from('user_settings')
    .upsert({ user_id: userId, settings: toJson(settings), updated_at: updatedAt }, { onConflict: 'user_id' })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.upsertSettings' },
  )
  return updatedAt
}

// --- user_trusted_devices ---

export type TrustedDeviceSource = {
  id: string
  user_id: string
  device_id: string
  device_name: string | null
  custom_name: string | null
  device_info: Json | null
  expires_at: string
  created_at: string
}

export const TRUSTED_DEVICE_COLUMNS = assertColumns<TrustedDeviceSource>()(
  'id, user_id, device_id, device_name, custom_name, device_info, expires_at, created_at',
)

export interface TrustedDevice {
  id: string
  user_id: string
  device_id: string
  device_name: string | null
  custom_name: string | null
  device_info: Record<string, unknown> | null
  expires_at: string
  created_at: string
}

export function toTrustedDevice(row: TrustedDeviceSource): TrustedDevice {
  return {
    ...row,
    device_info: isJsonObject(row.device_info) ? row.device_info : null,
  }
}

/** 管理设备列表: device_info 里是服务端收集的设备指纹, 只给"详情"面板看 */
export async function fetchTrustedDevices(userId: string, options: QueryOptions = {}): Promise<TrustedDevice[]> {
  const base = db
    .from('user_trusted_devices')
    .select(TRUSTED_DEVICE_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.fetchTrustedDevices' },
  )
  return rows.map(toTrustedDevice)
}

/**
 * 让某台设备在 expiresAt 之前免验证。
 * 不写 device_info: 那列由 verify-totp 在服务端写入真实指纹, upsert 带上它会把它覆盖成一个空对象。
 */
export async function trustDevice(
  userId: string,
  device: { deviceId: string; deviceName: string | null; expiresAt: string },
  options: QueryOptions = {},
): Promise<void> {
  const base = db.from('user_trusted_devices').upsert(
    {
      user_id: userId,
      device_id: device.deviceId,
      device_name: device.deviceName,
      expires_at: device.expiresAt,
    },
    { onConflict: 'user_id,device_id' },
  )
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.trustDevice' },
  )
}

/** 改的是显示名, 用 id 定位; 空名字落成 null, 表示回落到系统识别的设备名 */
export async function renameTrustedDevice(id: string, name: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('user_trusted_devices').update({ custom_name: name.trim() || null }).eq('id', id)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.renameTrustedDevice' },
  )
}

export async function revokeTrustedDevice(userId: string, deviceId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('user_trusted_devices').delete().eq('user_id', userId).eq('device_id', deviceId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.revokeTrustedDevice' },
  )
}

// --- user_mfa_sessions ---

export type MfaMethod = 'totp' | 'passkey'

export type MfaSessionSource = {
  session_id: string
  method: string
  verified_at: string
  expires_at: string
}

export const MFA_SESSION_COLUMNS = assertColumns<MfaSessionSource>()('session_id, method, verified_at, expires_at')

export interface MfaSession {
  session_id: string
  method: MfaMethod
  verified_at: string
  expires_at: string
}

export function toMfaSession(row: MfaSessionSource): MfaSession {
  return {
    session_id: row.session_id,
    method: row.method === 'passkey' ? 'passkey' : 'totp',
    verified_at: row.verified_at,
    expires_at: row.expires_at,
  }
}

/**
 * 会话级验证记录只有服务端能写(表上没有 INSERT/UPDATE 策略, 见 001_initial_schema.sql 的 Section 18),
 * 客户端只能看和撤销自己的行。
 */
export async function fetchMfaSessions(userId: string, options: QueryOptions = {}): Promise<MfaSession[]> {
  const base = db
    .from('user_mfa_sessions')
    .select(MFA_SESSION_COLUMNS)
    .eq('user_id', userId)
    .order('verified_at', { ascending: false })
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.fetchMfaSessions' },
  )
  return rows.map(toMfaSession)
}

export async function revokeMfaSession(userId: string, sessionId: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('user_mfa_sessions').delete().eq('user_id', userId).eq('session_id', sessionId)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.revokeMfaSession' },
  )
}

// --- push_subscriptions ---

export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
}

/**
 * 登记本机推送订阅(供服务端 cron 推送)。
 * endpoint 是推送服务给的地址且表上有唯一约束: 同一台设备重复授权只该更新那一行。
 * 失败抛 AppError —— 订阅没登记成功意味着这台设备收不到提醒, 不能当成功吞掉。
 */
export async function upsertPushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
  options: QueryOptions = {},
): Promise<void> {
  const base = db.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      user_agent: subscription.userAgent,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.upsertPushSubscription' },
  )
}

// --- user_plugins ---

export type UserPluginConfig = Record<string, number | boolean>

export type UserPluginSource = {
  plugin_id: string
  enabled: boolean
  config: Json
}

export const USER_PLUGIN_COLUMNS = assertColumns<UserPluginSource>()('plugin_id, enabled, config')

export interface UserPlugin {
  plugin_id: string
  enabled: boolean
  config: UserPluginConfig
}

export function toUserPlugin(row: UserPluginSource): UserPlugin {
  return {
    plugin_id: row.plugin_id,
    enabled: row.enabled,
    config: isJsonObject(row.config) ? (row.config as UserPluginConfig) : {},
  }
}

export async function fetchUserPlugins(userId: string, options: QueryOptions = {}): Promise<UserPlugin[]> {
  const base = db.from('user_plugins').select(USER_PLUGIN_COLUMNS).eq('user_id', userId)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.fetchUserPlugins' },
  )
  return rows.map(toUserPlugin)
}

/**
 * 插件行的写入一定是整行(enabled + config 一起): 表上这两列都有默认值, 只传一列时
 * PostgREST 的 upsert 不会把另一列带上, 冲突路径下会留下半截状态。
 */
export async function upsertUserPlugin(userId: string, plugin: UserPlugin, options: QueryOptions = {}): Promise<void> {
  const base = db.from('user_plugins').upsert(
    {
      user_id: userId,
      plugin_id: plugin.plugin_id,
      enabled: plugin.enabled,
      config: toJson(plugin.config),
    },
    { onConflict: 'user_id,plugin_id' },
  )
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.upsertUserPlugin' },
  )
}

// --- user_prompts ---

export type UserPromptSource = {
  prompt_key: string
  title: string | null
  body: string
  variables: string[]
  enabled: boolean
}

export const USER_PROMPT_COLUMNS = assertColumns<UserPromptSource>()('prompt_key, title, body, variables, enabled')

export interface UserPrompt {
  prompt_key: string
  title: string | null
  body: string
  variables: string[]
  enabled: boolean
}

export function toUserPrompt(row: UserPromptSource): UserPrompt {
  return {
    prompt_key: row.prompt_key,
    title: row.title,
    body: row.body,
    variables: row.variables ?? [],
    enabled: row.enabled,
  }
}

export async function fetchUserPrompts(userId: string, options: QueryOptions = {}): Promise<UserPrompt[]> {
  const base = db.from('user_prompts').select(USER_PROMPT_COLUMNS).eq('user_id', userId)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.fetchUserPrompts' },
  )
  return rows.map(toUserPrompt)
}

export interface UserPromptInput {
  prompt_key: string
  body: string
  title?: string | null
  variables: string[]
  enabled?: boolean
}

/** 保存用户改过的/自建的提示词, 覆盖同 key 的旧内容 */
export async function saveUserPrompt(
  userId: string,
  prompt: UserPromptInput,
  options: QueryOptions = {},
): Promise<void> {
  const base = db.from('user_prompts').upsert(
    {
      user_id: userId,
      prompt_key: prompt.prompt_key,
      body: prompt.body,
      title: prompt.title ?? null,
      variables: prompt.variables,
      enabled: prompt.enabled ?? true,
    },
    { onConflict: 'user_id,prompt_key' },
  )
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.saveUserPrompt' },
  )
}

/**
 * 把用户还没碰过的内置提示词按其默认值落库(服务端 MCP 端点要取库里的内容)。
 * ignoreDuplicates 是这里的全部意义: 已经存在的行(用户改过的)一个字都不能动。
 */
export async function seedUserPrompts(
  userId: string,
  prompts: { prompt_key: string; body: string; variables: string[] }[],
  options: QueryOptions = {},
): Promise<void> {
  if (prompts.length === 0) return
  const base = db
    .from('user_prompts')
    .upsert(
      prompts.map((p) => ({ user_id: userId, prompt_key: p.prompt_key, body: p.body, variables: p.variables })),
      { onConflict: 'user_id,prompt_key', ignoreDuplicates: true },
    )
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.seedUserPrompts' },
  )
}

export async function deleteUserPrompt(userId: string, promptKey: string, options: QueryOptions = {}): Promise<void> {
  const base = db.from('user_prompts').delete().eq('user_id', userId).eq('prompt_key', promptKey)
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.deleteUserPrompt' },
  )
}

// --- qr_login_tokens ---

/**
 * 扫码登录只暴露三个状态迁移, 不暴露表:
 *   createQrLoginChallenge  桌面端发起
 *   confirmQrLogin          手机端确认(只能绑到调用者自己名下)
 *   fetchQrLoginStatus      桌面端轮询
 *
 * 表本身对客户端是完全关闭的: 没有 SELECT 策略, 也没有 UPDATE 策略 —— "待确认"的行还没有归属人
 * (user_id 为空), 留不出"既找得到它、又不让旁人看见"的策略, 所以确认走 SECURITY DEFINER 的窄接口。
 * 直接写表不报错, 但影响 0 行, 这正是原先 QrScanner 里那条 update 一直"成功"的原因。
 */

export type QrLoginStatus = 'pending' | 'confirmed' | 'expired'

export interface QrLoginChallenge {
  /** 公开的那一半: 进二维码, 手机端用它确认 */
  token: string
  /** 只留在本机的那一半: 轮询状态和兑换登录态都要它, 入表的只有它的 sha256 */
  secret: string
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 发起一次扫码登录。token 与 secret 在这里一起生成, 保证"入表的哈希"和"本机持有的 secret"必然配对;
 * secret 不再单独交回给调用方去拼 insert, 也就没有"误把明文写进表"的余地。
 */
export async function createQrLoginChallenge(options: QueryOptions = {}): Promise<QrLoginChallenge> {
  const token = crypto.randomUUID()
  const secret = `${crypto.randomUUID()}${crypto.randomUUID()}`
  const base = db.from('qr_login_tokens').insert({ token, secret_hash: await sha256Hex(secret) })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.createQrLoginChallenge' },
  )
  return { token, secret }
}

/**
 * 手机端确认。函数内部只把"还在等确认且没过期"的行绑到 auth.uid() 名下, 所以返回 false
 * 就等于"二维码已过期或已被使用" —— 调用方不必自己分辨这两种, 这里直接当 not_found 抛出。
 */
export async function confirmQrLogin(
  token: string,
  deviceInfo: string | null,
  options: QueryOptions = {},
): Promise<void> {
  const base = db.rpc('qr_login_confirm', { p_token: token, p_device_info: deviceInfo ?? undefined })
  const confirmed = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.confirmQrLogin' },
  )
  if (confirmed !== true) {
    throw new AppError({ kind: 'not_found', message: 'account.confirmQrLogin: 二维码已过期或已被使用' })
  }
}

/**
 * 桌面端轮询。只有 secret 的 sha256 与表里那行相同才答得出状态。
 * null = 查无此 token 或 secret 不匹配(函数对两种情况都只回 NULL), 调用方按"过期"处理。
 */
export async function fetchQrLoginStatus(
  token: string,
  secret: string,
  options: QueryOptions = {},
): Promise<QrLoginStatus | null> {
  const base = db.rpc('qr_login_status', { p_token: token, p_secret: secret })
  const state = await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.fetchQrLoginStatus' },
  )
  return state === 'pending' || state === 'confirmed' || state === 'expired' ? state : null
}

// --- focus_sessions ---

export type FocusSessionMode = 'stopwatch' | 'pomodoro'

export interface FocusSessionInput {
  mode: FocusSessionMode
  startedAt: string
  durationSec: number
}

/** 记一轮专注。ended_at 取落库时刻: 计时器是"停下就写", 两者是同一次调用。 */
export async function recordFocusSession(
  userId: string,
  session: FocusSessionInput,
  options: QueryOptions = {},
): Promise<void> {
  const base = db.from('focus_sessions').insert({
    user_id: userId,
    mode: session.mode,
    started_at: session.startedAt,
    ended_at: new Date().toISOString(),
    duration_sec: session.durationSec,
  })
  await run(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.recordFocusSession' },
  )
}

export type FocusSessionStatSource = {
  started_at: string
  duration_sec: number
}

export const FOCUS_SESSION_STAT_COLUMNS = assertColumns<FocusSessionStatSource>()('started_at, duration_sec')

export interface FocusSessionStat {
  started_at: string
  duration_sec: number
}

export function toFocusSessionStat(row: FocusSessionStatSource): FocusSessionStat {
  return {
    started_at: row.started_at,
    duration_sec: Number(row.duration_sec) || 0,
  }
}

/** 统计只取起点和秒数; "今天/本周"按北京时间切分是调用方的事, 这里不预设时区口径 */
export async function fetchFocusSessionStatsSince(
  userId: string,
  sinceIso: string,
  options: QueryOptions = {},
): Promise<FocusSessionStat[]> {
  const base = db
    .from('focus_sessions')
    .select(FOCUS_SESSION_STAT_COLUMNS)
    .eq('user_id', userId)
    .gte('started_at', sinceIso)
  const rows = await runList(
    () => (options.signal ? base.abortSignal(options.signal) : base),
    { ...options, context: options.context ?? 'account.fetchFocusSessionStatsSince' },
  )
  return rows.map(toFocusSessionStat)
}

// --- user_totp / user_recovery_codes ---

/**
 * 这两张表故意没有客户端接口, 不是漏了。
 *
 * user_totp.totp_secret 与 user_recovery_codes.codes 是密钥和恢复码, 两张表都启用了 RLS 却一条策略
 * 都没有(见 001_initial_schema.sql 的 Section 11 / 13): authenticated 读必然为空、写必然被拒。
 * 于是任何"客户端读一下"的包装都只会返回空 —— 而空结果正好会被读成"这个账号没开 MFA",
 * 也就是 lib/mfa.ts 里那条注释记下的坑(那次它把已登录用户踢去了 /guide)。
 * 唯一能碰它们的是 verify-totp / admin-delete-user 这两个 Edge Function(service_role)。
 * 所以"是否绑了 TOTP / 还能用几张恢复码"一律以 getMfaStatus() 的 availableMethods 为准,
 * 密钥永远不进浏览器, 服务层这一侧也就没有可暴露的读接口。
 */
