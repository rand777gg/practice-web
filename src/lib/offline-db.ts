import { AppError, toAppError } from '@/services/errors'

/**
 * 离线队列。
 *
 * 改之前的样子：每次操作都 `indexedDB.open()` 再 `db.close()`（一次答题开一次库），
 * 没有事务封装，同步是"把所有待办攒成一批 insert"—— 一条脏数据就整批失败，
 * 而 catch 把它吞掉，用户只看到"待同步 3"一直不降。也没有稳定幂等键，
 * 超时重试会把同一次作答写两遍。
 *
 * 现在的结构：
 *   · 单例连接 + 统一事务封装（含连接被浏览器关掉后自动重开）；
 *   · `outbox` 里一条操作一条记录，带 `client_operation_id`；
 *   · 逐条发送并按错误分类处理（可重试 / 冲突 / 永久），可重试的按指数退避；
 *   · 网络恢复、页面回到前台、定时器三个触发点都会尝试排空。
 */

const DB_NAME = 'practice-offline'
const DB_VERSION = 4

const STORE_OUTBOX = 'outbox'
const STORE_PREFETCH = 'prefetched_questions'
/** v3 及以前的名字，升级时把里面的记录搬进 outbox 后删掉 */
const LEGACY_STORE = 'pending_answers'

export type OutboxKind = 'answer'

/** 一条待同步操作。answer 是 payload 的形状；之后要加别的操作只扩 kind 联合。 */
export interface OutboxOperation {
  /** 幂等键：同一次用户动作重试多少次都用同一个 */
  clientOperationId: string
  kind: OutboxKind
  payload: AnswerPayload
  createdAt: string
  attempts: number
  /** ISO；早于它的记录才会被这次排空取走 */
  nextAttemptAt: string
  state: 'pending' | 'failed'
  /** 'conflict' / 'permanent' / 上次的失败原因，供界面解释为什么停在 failed */
  failedReason?: string
  lastErrorKind?: string
}

export interface AnswerPayload {
  user_id: string
  question_id: string
  selected_answer: unknown
  is_correct: boolean
  mode: 'practice' | 'exam'
  exam_session_id: string | null
  source: 'sequential' | 'random' | null
  answered_at: string
}

export interface OutboxStats {
  /** 还会重试的条数（界面上的"待同步"） */
  pending: number
  /** 已放弃自动重试的条数：只可能是校验/权限类错误，需要人看一眼 */
  failed: number
}

export type FailureClass = 'retryable' | 'conflict' | 'permanent'

const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 5 * 60_000

/**
 * 错误分类。跟 `services/errors.ts` 的 AppError.kind 对齐，但队列的语义不同：
 *   · 认证失败是可重试的 —— 会话可能刚好在刷新；
 *   · 冲突单列一档：这不是"再等等就好"，重复试只会一直撞，要停下载等人处理；
 *   · 校验/权限/找不到是永久的，继续重试只是烧电。
 */
export function classifyFailure(e: unknown): FailureClass {
  const err = e instanceof AppError ? e : toAppError(e)
  switch (err.kind) {
    case 'network':
    case 'server':
    case 'auth':
      return 'retryable'
    case 'conflict':
      return 'conflict'
    default:
      return 'permanent'
  }
}

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS)
}

export function newClientOperationId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// ── 连接：单例 ──

let dbPromise: Promise<IDBDatabase> | null = null

function createConnection(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (event) => {
      const db = req.result
      // v3 的遗留 store：删掉，内容在下面搬进 outbox
      const legacy = db.objectStoreNames.contains(LEGACY_STORE)
        ? req.transaction!.objectStore(LEGACY_STORE)
        : null

      if (db.objectStoreNames.contains('question_stats')) db.deleteObjectStore('question_stats')
      if (!db.objectStoreNames.contains(STORE_PREFETCH)) {
        db.createObjectStore(STORE_PREFETCH, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const outbox = db.createObjectStore(STORE_OUTBOX, { keyPath: 'clientOperationId' })
        // 排空时按"到期时间 + 入队顺序"取，建索引避免每次全表读
        outbox.createIndex('nextAttemptAt', 'nextAttemptAt')
      }

      // 升级时先把旧记录搬过来 —— 不搬就等于把用户离线时做的题直接丢掉
      if (legacy && (event as IDBVersionChangeEvent).oldVersion < 4) {
        const outbox = req.transaction!.objectStore(STORE_OUTBOX)
        legacy.openCursor().onsuccess = (ev) => {
          const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result
          if (!cursor) return
          const old = cursor.value as {
            user_id: string; question_id: string; selected_answer: unknown; is_correct: boolean
            mode: 'practice' | 'exam'; exam_session_id: string | null
            source: 'sequential' | 'random' | null; answered_at: string
          }
          outbox.put({
            clientOperationId: newClientOperationId(),
            kind: 'answer',
            payload: {
              user_id: old.user_id,
              question_id: old.question_id,
              selected_answer: old.selected_answer,
              is_correct: old.is_correct,
              mode: old.mode,
              exam_session_id: old.exam_session_id ?? null,
              source: old.source ?? null,
              answered_at: old.answered_at,
            },
            createdAt: old.answered_at ?? new Date().toISOString(),
            attempts: 0,
            nextAttemptAt: new Date().toISOString(),
            state: 'pending',
          })
          cursor.continue()
        }
      }
      if (legacy) db.deleteObjectStore(LEGACY_STORE)
    }

    req.onsuccess = () => {
      const db = req.result
      // 别的标签页要升级版本时，必须让出连接，否则新版本永远升不上去
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      // 浏览器可能在内存吃紧时关掉连接；下次用到再开
      db.onclose = () => { dbPromise = null }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = createConnection().catch((e) => {
      dbPromise = null
      throw e
    })
  }
  return dbPromise
}

/**
 * 事务封装。等 `oncomplete` 而不是等每个请求成功 ——
 * 请求成功不代表事务提交了，中途 abort 的话写操作会整批回滚。
 */
async function withTx<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await getDb()
  const tx = db.transaction(stores, mode)
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务被中断'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
  })
  const result = await fn(tx)
  await done
  return result
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// ── outbox ──

export async function enqueueAnswer(payload: AnswerPayload): Promise<string> {
  const clientOperationId = newClientOperationId()
  await withTx(STORE_OUTBOX, 'readwrite', (tx) => {
    tx.objectStore(STORE_OUTBOX).put({
      clientOperationId,
      kind: 'answer',
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
      state: 'pending',
    } satisfies OutboxOperation)
  })
  return clientOperationId
}

/** 到期的待发操作，按入队顺序（先入先出，避免乱序推进计划轮次） */
export async function takeDueOperations(limit = 50): Promise<OutboxOperation[]> {
  const now = new Date().toISOString()
  const all = await withTx(STORE_OUTBOX, 'readonly', (tx) =>
    req(tx.objectStore(STORE_OUTBOX).getAll() as IDBRequest<OutboxOperation[]>))
  return all
    .filter((op) => op.state === 'pending' && op.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit)
}

export async function getOutboxStats(): Promise<OutboxStats> {
  const all = await withTx(STORE_OUTBOX, 'readonly', (tx) =>
    req(tx.objectStore(STORE_OUTBOX).getAll() as IDBRequest<OutboxOperation[]>))
  return {
    pending: all.filter((op) => op.state === 'pending').length,
    failed: all.filter((op) => op.state === 'failed').length,
  }
}

export async function getFailedOperations(): Promise<OutboxOperation[]> {
  const all = await withTx(STORE_OUTBOX, 'readonly', (tx) =>
    req(tx.objectStore(STORE_OUTBOX).getAll() as IDBRequest<OutboxOperation[]>))
  return all.filter((op) => op.state === 'failed').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** 同步成功后删掉记录（不是标记完成 —— 留着的都是待办） */
async function markDone(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await withTx(STORE_OUTBOX, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_OUTBOX)
    for (const id of ids) store.delete(id)
  })
}

/** 只改需要的字段，且读改写放在同一个事务里，避免并发排空互相覆盖 */
async function patchOperation(id: string, patch: Partial<OutboxOperation>): Promise<void> {
  await withTx(STORE_OUTBOX, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE_OUTBOX)
    const current = await req(store.get(id) as IDBRequest<OutboxOperation | undefined>)
    if (!current) return
    store.put({ ...current, ...patch })
  })
}

export interface DrainResult {
  done: number
  retried: number
  failed: number
  remaining: number
}

/**
 * 逐条发送。**一次一条**是有意的：批量 insert 里一条校验失败会让整批回滚，
 * 而失败原因还会被当成"网络问题"重试 —— 这正是改造前"待同步"永远不降的原因。
 *
 * `apply` 抛出的错误按 `classifyFailure` 分类：可重试的按指数退避延后，
 * 冲突和永久错误标记为 failed 停在队列里等人工处理（不静默丢弃）。
 */
export async function drainOutbox(
  apply: (op: OutboxOperation) => Promise<void>,
  options: { limit?: number } = {},
): Promise<DrainResult> {
  const due = await takeDueOperations(options.limit ?? 50)
  let done = 0
  let retried = 0
  let failed = 0

  for (const op of due) {
    try {
      await apply(op)
      await markDone([op.clientOperationId])
      done += 1
    } catch (e) {
      const klass = classifyFailure(e)
      const err = e instanceof AppError ? e : toAppError(e)
      if (klass === 'retryable') {
        const attempts = op.attempts + 1
        await patchOperation(op.clientOperationId, {
          attempts,
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
          lastErrorKind: err.kind,
        })
        retried += 1
        // 网络断了就别把剩下几十条挨个撞一遍
        if (err.kind === 'network') break
      } else {
        await patchOperation(op.clientOperationId, {
          state: 'failed',
          attempts: op.attempts + 1,
          failedReason: klass === 'conflict' ? '数据冲突，需要重新拉取后再提交' : '服务端拒绝了这条数据',
          lastErrorKind: err.kind,
        })
        failed += 1
      }
    }
  }

  const stats = await getOutboxStats()
  return { done, retried, failed, remaining: stats.pending }
}

// ── 预取题目（离线降级用）──

export async function prefetchQuestions(questions: { id: string; data: unknown }[]): Promise<void> {
  await withTx(STORE_PREFETCH, 'readwrite', (tx) => {
    const store = tx.objectStore(STORE_PREFETCH)
    for (const q of questions) store.put(q)
  })
}

export async function getPrefetchedQuestions(): Promise<unknown[]> {
  const all = await withTx(STORE_PREFETCH, 'readonly', (tx) =>
    req(tx.objectStore(STORE_PREFETCH).getAll() as IDBRequest<{ id: string; data: unknown }[]>))
  return all.map((q) => q.data)
}

export async function clearPrefetchedQuestions(): Promise<void> {
  await withTx(STORE_PREFETCH, 'readwrite', (tx) => { tx.objectStore(STORE_PREFETCH).clear() })
}

export async function getPrefetchedQuestionIds(): Promise<string[]> {
  const keys = await withTx(STORE_PREFETCH, 'readonly', (tx) =>
    req(tx.objectStore(STORE_PREFETCH).getAllKeys() as IDBRequest<IDBValidKey[]>))
  return keys.map(String)
}

export async function getPrefetchedQuestion(id: string): Promise<unknown | null> {
  const result = await withTx(STORE_PREFETCH, 'readonly', (tx) =>
    req(tx.objectStore(STORE_PREFETCH).get(id) as IDBRequest<{ id: string; data: unknown } | undefined>))
  return result ? result.data : null
}

// ── 触发点 ──

/**
 * 网络恢复 / 页面回到前台 / 定时三种触发。
 *
 * Background Sync 只在 Chromium 上有，而且它也只能唤醒页面自己来发请求
 * （Service Worker 里没有 Supabase 会话），所以它是"额外的一次机会"，
 * 不能当成唯一机制 —— 这里把 online 事件作为主路径。
 */
export function installOutboxTriggers(run: () => void): () => void {
  const onOnline = () => run()
  const onVisible = () => { if (document.visibilityState === 'visible') run() }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(() => {
    if (navigator.onLine) run()
  }, 60_000)

  // 有 Background Sync 就顺手注册一次：浏览器在恢复网络时会唤醒 SW，
  // SW 再把页面叫起来（见 src/sw.ts 的 sync 处理）
  void (async () => {
    try {
      const reg = await navigator.serviceWorker?.ready
      const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync
      if (sync) await sync.register('outbox-drain')
    } catch {
      // 不支持就算了：online 事件已经覆盖
    }
  })()

  const onSwMessage = (e: MessageEvent) => {
    if ((e.data as { type?: string } | null)?.type === 'outbox-drain') run()
  }
  navigator.serviceWorker?.addEventListener('message', onSwMessage)

  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
    navigator.serviceWorker?.removeEventListener('message', onSwMessage)
  }
}
