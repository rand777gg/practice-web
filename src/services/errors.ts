import type { PostgrestError } from '@supabase/supabase-js'

/**
 * 统一的失败分类。调用方只关心"该怎么办"，不该去认 PostgREST 的错误码 ——
 * 分类在服务层做完，UI 层拿到的永远是一个带 kind 的 AppError。
 */
export type AppErrorKind =
  | 'auth'        // 未登录 / 会话过期 / JWT 无效
  | 'permission'  // 角色不足或 RLS 拒绝
  | 'not_found'   // 期望一行却没有
  | 'conflict'    // 唯一键冲突（含幂等键重复）
  | 'validation'  // 外键 / CHECK / 非空约束失败
  | 'network'     // 离线、超时、连接被重置
  | 'server'      // 5xx / 数据库内部错误
  | 'unknown'

const AUTH_CODES = new Set(['PGRST301', 'PGRST302', '42501_LOGIN'])
const PERMISSION_CODES = new Set(['42501'])
const NETWORK_CODES = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '57014'])

function classifyCode(code: string): AppErrorKind {
  if (AUTH_CODES.has(code)) return 'auth'
  if (PERMISSION_CODES.has(code)) return 'permission'
  if (NETWORK_CODES.has(code)) return 'network'
  if (code === '23505') return 'conflict'
  if (code === '23503' || code === '23502' || code === '23514' || code === '22P02' || code === '22001') return 'validation'
  if (code === 'PGRST116') return 'not_found'
  if (/^5/.test(code)) return 'server'
  if (/^23/.test(code)) return 'validation'
  if (/^08/.test(code)) return 'network'
  return 'unknown'
}

/** 只有这两类值得原样重试：网络抖动和服务端瞬时故障。 */
function isRetryableKind(kind: AppErrorKind): boolean {
  return kind === 'network' || kind === 'server'
}

export class AppError extends Error {
  readonly kind: AppErrorKind
  readonly code: string | null
  readonly details: string | null
  readonly hint: string | null
  readonly retryable: boolean
  override readonly cause: unknown

  constructor(init: {
    kind: AppErrorKind
    message: string
    code?: string | null
    details?: string | null
    hint?: string | null
    cause?: unknown
  }) {
    super(init.message)
    this.name = 'AppError'
    this.kind = init.kind
    this.code = init.code ?? null
    this.details = init.details ?? null
    this.hint = init.hint ?? null
    this.retryable = isRetryableKind(init.kind)
    this.cause = init.cause
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}

/** PostgREST 直接返回的 error 对象 → AppError */
export function fromPostgrestError(error: PostgrestError, context: string): AppError {
  return new AppError({
    kind: classifyCode(error.code),
    message: context ? `${context}: ${error.message}` : error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    cause: error,
  })
}

/**
 * 任意抛出物 → AppError。fetch 层的失败（断网、DNS、超时）在 supabase-js 里
 * 表现为 TypeError 或带 ERR_ 前缀的字符串，这里统一收成 network。
 */
export function toAppError(e: unknown, context = ''): AppError {
  if (isAppError(e)) return e
  if (e && typeof e === 'object' && 'code' in e && 'message' in e && typeof (e as PostgrestError).code === 'string') {
    return fromPostgrestError(e as PostgrestError, context)
  }
  const raw = e instanceof Error ? e.message : String(e)
  const isNetwork = /NETWORK_CHANGED|QUIC_PROTOCOL_ERROR|CONNECTION_RESET|CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_IO_SUSPENDED|ERR_TIMED_OUT|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError|AbortError/i.test(raw)
  const kind: AppErrorKind = isNetwork ? 'network' : 'unknown'
  return new AppError({
    kind,
    message: context ? `${context}: ${raw}` : raw,
    cause: e,
  })
}

/** 用户可见提示：不暴露表名、约束名和错误码。 */
export function userMessage(e: unknown): string {
  const err = isAppError(e) ? e : toAppError(e)
  switch (err.kind) {
    case 'auth': return '登录状态已失效，请重新登录'
    case 'permission': return '没有权限执行该操作'
    case 'not_found': return '数据不存在或已被删除'
    case 'conflict': return '数据已被他人修改，请刷新后重试'
    case 'validation': return '数据格式不符合要求'
    case 'network': return '网络不稳定，请稍后重试'
    case 'server': return '服务暂时不可用，请稍后重试'
    default: return '操作失败，请稍后重试'
  }
}

/** 开发日志：带上下文和错误码，只在非生产环境打。 */
export function logError(context: string, e: unknown): void {
  const err = isAppError(e) ? e : toAppError(e)
  if (import.meta.env.PROD) return
  console.error(`[${context}] ${err.kind}${err.code ? `/${err.code}` : ''}: ${err.message}`, err.cause ?? '')
}
