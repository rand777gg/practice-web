import { supabase } from './supabase'
import { setErrorReporter } from '@/services/errors'
import { currentTrace } from './trace'

/**
 * 生产环境的诊断上报。
 *
 * 为什么需要它：`logError` 在生产是**空操作**（`if (import.meta.env.PROD) return`），
 * 所以有两件事在线上完全不可见 —— 最要紧的是交卷（Section 102）与保存路线（Section 103）
 * 留的"RPC 函数不存在就退回旧路径"那个降级分支：它**应当永不进入**，
 * 可一旦真进去了，用户只是在用那条没有事务的老路，谁也不知道。
 *
 * 落点走 Edge Function `report-client-event`（service_role 落库）——
 * 前端对 `client_events` 没有 INSERT 权限（migration Section 104），免得这张表被刷。
 *
 * 三条自我约束，都是"诊断工具不该伤害应用"：
 *   · **永不抛错**：整段包在 try/catch 里，失败就静默（上报挂了不能影响刷题）；
 *   · **每会话去重**：同一个 (kind, name) 只报一次 —— 一个循环里的错误不该刷满表；
 *   · **总量封顶**：每会话最多 SESSION_CAP 条，超了直接不发。
 *
 * 查看：`npm run events`（走 SSH 直连库，不经过 PostgREST）。
 */

const SESSION_CAP = 20
const reported = new Set<string>()
let sent = 0
/** 函数不存在（线上还没部署/迁移）就整个会话不再试，省掉每次一次的无效往返 */
let disabled = false

export type ClientEventKind = 'rpc_missing' | 'error' | 'slow_request' | 'other'

export interface ClientEventInput {
  kind: ClientEventKind
  /** 具体是谁：函数名或 logError 的 context，例如 'complete_exam' / 'exam.submitExam' */
  name: string
  detail?: Record<string, unknown>
}

/**
 * 上报一条事件。**不 await、不抛错**，调用点就当它是 `void`。
 */
export function reportClientEvent(input: ClientEventInput): void {
  if (disabled) return
  if (sent >= SESSION_CAP) return
  const key = `${input.kind}:${input.name}`
  if (reported.has(key)) return
  reported.add(key)
  sent += 1

  void (async () => {
    try {
      // 落在 detail 里而不是单独开一列：它只在排查时按 `detail->>'trace_id'` 查，
      // 为它加列 + 索引要动一次迁移，不值。有 trace 时才加这两个字段。
      const trace = currentTrace()
      const { error } = await supabase.functions.invoke('report-client-event', {
        body: {
          kind: input.kind,
          name: input.name,
          detail: trace ? { ...input.detail, trace_id: trace.id, trace_name: trace.name } : (input.detail ?? {}),
          ua: navigator.userAgent,
          region: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
          app_version: __APP_VERSION__,
        },
      })
      // 函数不存在（还没部署）就别再试了。查表也不存在时 supabase-js 报的是 404/FunctionsHttpError。
      if (error && /not found|404/i.test(error.message ?? '')) disabled = true
    } catch {
      // 静默：上报失败不该影响任何功能
    }
  })()
}

/** 仅供测试/诊断：重置会话内的去重与计数 */
export function resetClientEventSession(): void {
  reported.clear()
  sent = 0
  disabled = false
}

/**
 * 把 `logError` 的生产出口接到这里。应用启动时调一次（见 main.tsx）。
 *
 * 用注入而不是让 errors.ts 直接 import 本模块：errors.ts 是最被广泛引用的纯工具，
 * 连它的单元测试都在 Node 里跑（scripts/test-practice-machine.mjs），一旦它拉进 supabase
 * 那套零依赖测试就装不起来了。
 */
export function installErrorReporting(): void {
  setErrorReporter((context, err) => {
    reportClientEvent({
      kind: 'error',
      name: context,
      detail: { kind: err.kind, code: err.code, message: err.message },
    })
  })
}
