/**
 * 请求耗时与失败计数。
 *
 * 落点选在 `services/db.ts` 的 `run` / `runCount` —— 那是全应用**唯一**的 PostgREST 出口
 * （`fetchAll` / `fetchInChunks` 也都走它们），所以在这里量一次就等于量了全部，
 * 不必往几十个服务函数里各插一行。
 *
 * 两件事分开看，价值不一样：
 *   · **慢请求上报**：超过阈值的请求报一条 `slow_request` 事件（落点复用 Section 104 的
 *     `client_events`，`npm run events` 就看得见）。这是**生产上真正有信号**的那一半 ——
 *     用户说"卡"的时候，至少能知道是哪类查询慢。
 *   · **本地计数**：每个 context 的调用数/失败数/总耗时/最大值，供控制台 `getApiStats()` 看，
 *     也在会话结束时由 `flushApiStats` 拍成**一条**摘要报上去（`api_stats`）——
 *     逐条上报失败会淹掉信号，而"哪一类查询整体在失败"只有聚合才看得出来。
 *
 * 这个模块**不 import 任何东西**：上报出口由应用启动时注入（与 `errors.ts` 的
 * `setErrorReporter` 同一个理由 —— 那套零依赖的 Node 测试要能直接 import 它）。
 *
 * 自我约束与 `client-events.ts` 一致：**永不抛错**，指标坏掉不能影响请求本身。
 */

export interface ApiStat {
  /** 调用次数（一次 run = 一次，重试不额外计数） */
  calls: number
  /** 最终失败的次数（重试用尽仍失败） */
  failures: number
  /** 累计耗时（含重试与退避） */
  totalMs: number
  /** 单次最大耗时 */
  maxMs: number
  /** 最近一次失败的分类，例如 'network' / 'permission' */
  lastErrorKind: string | null
}

/** 超过这个耗时就算"慢"，报一条事件。 */
export const SLOW_REQUEST_MS = 3000

export type SlowRequestReporter = (info: {
  context: string
  ms: number
  calls: number
  failures: number
  maxMs: number
}) => void

let reporter: SlowRequestReporter | null = null
const stats = new Map<string, ApiStat>()

export function setSlowRequestReporter(fn: SlowRequestReporter | null): void {
  reporter = fn
}

export function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

/** 取消（切页/关弹窗）不是"慢"，也不该计数 —— 它没有失败。 */
function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/**
 * 记一次请求。`error` 非空表示这次**最终**失败了（重试用尽）。
 * 永不让指标影响调用方：整个函数包在 try 里。
 */
export function recordApiCall(context: string, ms: number, error?: unknown): void {
  try {
    if (isAbort(error)) return
    const key = context || '(未命名)'
    const prev = stats.get(key) ?? { calls: 0, failures: 0, totalMs: 0, maxMs: 0, lastErrorKind: null }
    const next: ApiStat = {
      calls: prev.calls + 1,
      failures: prev.failures + (error === undefined ? 0 : 1),
      totalMs: prev.totalMs + ms,
      maxMs: Math.max(prev.maxMs, ms),
      lastErrorKind: error === undefined ? prev.lastErrorKind : errorKindOf(error),
    }
    stats.set(key, next)

    if (ms >= SLOW_REQUEST_MS && reporter) {
      // 把当前的调用数/失败数一起带上：一条事件就能看出"是偶发慢还是这类查询一直在慢"，
      // 否则还得去别处对账（而失败率本来就没有上报）。
      reporter({ context: key, ms: Math.round(ms), calls: next.calls, failures: next.failures, maxMs: Math.round(next.maxMs) })
    }
  } catch {
    // 指标坏了不能影响请求
  }
}

function errorKindOf(e: unknown): string {
  if (e && typeof e === 'object' && 'kind' in e && typeof (e as { kind: unknown }).kind === 'string') {
    return (e as { kind: string }).kind
  }
  return 'unknown'
}

/** 控制台里看：`getApiStats()` 会按总耗时倒序打出所有 context。 */
export function getApiStats(): ({ context: string } & ApiStat)[] {
  return [...stats.entries()]
    .map(([context, s]) => ({ context, ...s }))
    .sort((a, b) => b.totalMs - a.totalMs)
}

export function resetApiStats(): void {
  stats.clear()
}

export interface ApiStatsSummary {
  /** 这次会话里量到的请求总数与失败总数 —— 线上失败率就是 failures / calls */
  calls: number
  failures: number
  /** 只带"值得一提"的 context：有失败、或者慢过、或者最慢那几次 */
  contexts: { context: string; calls: number; failures: number; maxMs: number; lastErrorKind: string | null }[]
}

const SUMMARY_CONTEXT_LIMIT = 10

/**
 * 把这次会话的聚合拍成一条摘要（给"线上失败率"用）。
 *
 * 为什么是"会话结束发一条"而不是"每条都发"：逐条发会把信号淹掉 —— 同一类查询连续失败会刷满
 * `client_events`，而要看的东西恰恰是"哪一类在整体失败"。摘要一条就够：总调用数、总失败数、
 * 以及每个重点 context 的失败数与最大耗时。落点复用 Section 104 的表，`kind` 用 `other`、
 * `name` 用 `api_stats`（`npm run events` 里一眼能认出来）。
 *
 * 只挑有失败或慢过的 context，且最多 10 个（按总耗时倒序已经排过序）：摘要本身也要能看，
 * 而且 Edge Function 对 detail 有 4000 字节的上限。
 *
 * 一个 context 都没量到就返回 null —— 不发空事件。
 */
export function apiStatsSummary(limit = SUMMARY_CONTEXT_LIMIT): ApiStatsSummary | null {
  try {
    if (stats.size === 0) return null
    const all = getApiStats()
    const worth = all.filter((s) => s.failures > 0 || s.maxMs >= SLOW_REQUEST_MS)
    return {
      calls: all.reduce((n, s) => n + s.calls, 0),
      failures: all.reduce((n, s) => n + s.failures, 0),
      contexts: worth.slice(0, limit).map((s) => ({
        context: s.context,
        calls: s.calls,
        failures: s.failures,
        maxMs: Math.round(s.maxMs),
        lastErrorKind: s.lastErrorKind,
      })),
    }
  } catch {
    return null
  }
}

/**
 * 会话收尾时调一次：有东西可报就交给 `report`，返回是否报了。
 *
 * 不清空计数 —— 页面从"隐藏"回到前台再隐藏时应该能再报一次最新摘要；
 * 而 `reportClientEvent` 自带每会话去重（同一个 (kind, name) 只发一条），重复调用不会刷表。
 *
 * 已知局限：`pagehide` 上发的是 `fetch`，页面被立刻销毁时可能发不出去。所以应用里同时挂在
 * `visibilitychange`（转后台就会先发一次）—— 那个时机通常是够的。
 */
export function flushApiStats(report: (summary: ApiStatsSummary) => void, limit = SUMMARY_CONTEXT_LIMIT): boolean {
  const summary = apiStatsSummary(limit)
  if (!summary) return false
  try {
    report(summary)
  } catch {
    // 上报坏掉不能影响别的
  }
  return true
}
