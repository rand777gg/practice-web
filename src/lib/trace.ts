/**
 * 一次用户操作的关联 id。
 *
 * 为什么要它：线上现在能看见"某个请求慢了"（`slow_request`）和"某个错误发生了"（`error`），
 * 但看不出**这两条是同一次点击**造成的。给一次操作开一个 trace id，把它触发的所有事件都带上
 * （落在 `client_events.detail.trace_id` / `trace_name`），排查时
 * `where detail->>'trace_id' = '<id>'` 就是这次操作的全部现场。
 *
 * 为什么不做成"每个请求各自一个 id"：那样每个请求一个号，等于没有关联 —— 关联的价值就在于
 * **跨请求**。所以 trace 只在用户动作的边界上开（`withTrace` 包住那个动作）。
 *
 * 为什么不做进 `services/db.ts` 的 `run`：那里是全应用唯一的请求出口，但一次操作会发好几个
 * 请求，在出口处生成只会得到几个互不相干的号。
 *
 * 已知局限（写下来免得误判）：当前 trace 是**模块级**变量，同一瞬间有两个动作重叠时
 * （比如用户在交卷的同时切页触发了另一次加载）会互相覆盖，事件可能挂到后开的那个 trace 上。
 * 浏览器里没有 AsyncLocalStorage，要彻底消掉就得把 trace 当参数一路传下去 ——
 * 那会把 trace 变成每个函数签名的一部分，代价比收益大。先接受：trace 用来"把现场串起来看"，
 * 不用来"精确定责"。
 *
 * 这个模块不 import 任何东西（与 `api-metrics.ts` 同一个理由：那套零依赖的 Node 测试要能直接
 * import 它）。
 */

export interface Trace {
  id: string
  /** 动作名，例如 'practice.submit' / 'exam.submit' */
  name: string
}

let current: Trace | null = null

/** 会话内的 trace 计数，只为了在 id 里带上序号，方便肉眼比对前后顺序 */
let seq = 0

function newId(): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${Date.now().toString(36)}-${suffix}`
}

/** 当前正在进行的操作；没有就返回 null（大多数事件发生在动作之外，这是正常的） */
export function currentTrace(): Trace | null {
  return current
}

/**
 * 把这次操作包起来。动作里发生的错误与慢请求都会带上这个 trace。
 *
 * 可以嵌套：内层结束后恢复外层（`finally` 里还原），所以"页面级动作里再包一个子动作"不会
 * 把外层的现场弄丢。`fn` 抛错时 trace 一样会还原。
 */
export async function withTrace<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const previous = current
  seq += 1
  current = { id: `${newId()}-${seq}`, name }
  try {
    return await fn()
  } finally {
    current = previous
  }
}

/** 仅供测试：清掉当前 trace（正常情况下由 withTrace 自己还原） */
export function resetTrace(): void {
  current = null
  seq = 0
}
