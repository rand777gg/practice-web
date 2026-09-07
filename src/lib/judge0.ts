/**
 * Judge0 CE REST 客户端 —— 算法/编程题判题(与 OJ 平台同构)
 *
 * 代码判题统一走标准 Judge0(REST /submissions + /submissions/{token}),
 * 已移除旧的自研 JS 沙箱 / Piston 执行逻辑。
 *
 * 两种运行方式共用本层:
 *  - 中心判题(platform): 服务端(Edge Function)携带 JUDGE0_URL 转发;
 *  - 本地自测(local):    浏览器直连 http://localhost:2358(自部署 Judge0)。
 *
 * 说明:Judge0 的每次提交 = 一次完整的「编译 + 运行」,天然对应 OJ 的一个测试点。
 * 因此我们为每个测试用例(输入/期望输出)单独创建一个 submission,再批量轮询比对。
 */

export const JUDGE0_DEFAULT_URL = 'http://localhost:2358'

/**
 * 平台中心判题节点。当前经 Cloudflare 隧道指向自部署 Judge0。
 * TODO(集群化):改为可配置的节点列表(多区域 AZ),由后端按用户 IP 就近/负载选点;
 * 这里保留默认值以便前端探活显示"浏览器→平台"延迟。
 */
export const JUDGE0_PLATFORM_URL = 'https://oj.pguide.dev'

/** 前端可选语言 -> Judge0 CE v1.13 默认语言 id(社区实例的内置 languages 表,已稳定多年) */
export const JUDGE0_LANGUAGE_IDS: Record<string, number> = {
  c: 50,            // C (GCC 7.4.0)
  cpp: 54,          // C++ (GCC 7.4.0)
  java: 62,         // Java (OpenJDK 13.0.1)
  javascript: 63,   // JavaScript (Node.js 12.14.0)
  typescript: 74,   // TypeScript (3.7.4)
  python: 71,       // Python (3.8.1)
}

/** 测量浏览器→某 Judge0 端点的往返延迟(ms)。失败返回 null。 */
export async function measureJudge0Latency(baseUrl: string, timeoutMs = 4000): Promise<number | null> {
  const t0 = performance.now()
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/config_info`, { signal: ctrl.signal, method: 'GET' })
    clearTimeout(timer)
    if (!res.ok) return null
    return Math.round(performance.now() - t0)
  } catch {
    return null
  }
}

/** 我们的语言 key 集合;仅这些走 Judge0(stdin/stdout 均可运行) */
export type Judge0LangKey = keyof typeof JUDGE0_LANGUAGE_IDS

export function isJudge0Lang(lang: string): lang is Judge0LangKey {
  return lang in JUDGE0_LANGUAGE_IDS
}

export interface Judge0TestCase {
  input: string
  expected: string
}

export interface Judge0JudgeOptions {
  baseUrl?: string
  timeoutMs?: number // 每题运行上限(CPU 时间),默认 2000ms
  memoryMb?: number // 每题内存上限,默认 128MB
  /** 每轮轮询后有新完成的测试点就回调部分结果(用于逐点即时回显) */
  onProgress?: (results: Judge0SubmissionResult[]) => void
}

/** Judge0 单条提交的结果片段(Judge0 用 status:{id,description} 对象;batch 结果包在 {submissions:[...]}) */
export interface Judge0RunResult {
  stdout?: string
  stderr?: string
  compile_output?: string
  status: { id: number; description?: string }
  time?: string | number | null
  memory?: number | null
  token?: string
}

/** GET /submissions/batch 的返回外壳:结果在 submissions 数组里 */
interface Judge0BatchResponse {
  submissions?: Judge0RunResult[]
}

/** 映射回前端 SubmissionResult(status 语义沿用现有枚举) */
export interface Judge0SubmissionResult {
  testCaseIndex: number
  passed: boolean
  input: string
  expected: string
  actual: string
  error?: string
  status: string // accepted | wrong_answer | timeout | compile_error | runtime_error | pending(进行中/未判完)
  time_ms?: number | null
  memory_kb?: number | null
}

export interface Judge0Verdict {
  status: string
  results: Judge0SubmissionResult[]
  execution_time_ms: number
}

// Judge0 状态:见 GET /statuses。3=Accepted,4=WA,5=TLE,6=CE,7~12=RTE(各信号)。
// 我们只关心这些已判状态;1/2(排队/运行)由轮询阶段消解。
function mapJudge0Status(statusId: number): string {
  switch (statusId) {
    case 3: return 'accepted'
    case 4: return 'wrong_answer'
    case 5: return 'timeout'
    case 6: return 'compile_error'
    case 7: case 8: case 9: case 10: case 11: case 12: return 'runtime_error'
    default: return 'runtime_error'
  }
}

const b64decode = (s?: string): string => {
  if (!s) return ''
  // 服务端一般不会回传 base64(除非请求时带 base64_encoded=true);这里兼容万一回传
  try {
    if (s === '') return ''
    return atob(s)
  } catch {
    return s
  }
}

const norm = (s?: string): string => (s ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, '')
/** OJ 比对:忽略行尾空白与尾部空行 */
const equalsIgnoreTrailingWs = (a: string, b: string): boolean =>
  a.replace(/\s+$/, '') === b.replace(/\s+$/, '')
/**
 * 把字面转义序列还原成真实字符。题库的 input/expected 常以 JSON 存成字面 "\\n" 而非真实换行,
 * 提交给 Judge0 前需还原,否则 stdin 会带字面 \n 导致 int('9\\n2') 之类报错。
 * 只处理常见转义,不折叠其它反斜杠以免误伤合法输入。
 */
const decodeEscapes = (s: string): string =>
  s
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')

/** 健康检查:能连上则返回 true;本地 Judge0 未启动/未配置时不抛错,交由 UI 提示 */
export async function isJudge0Reachable(baseUrl = JUDGE0_DEFAULT_URL, timeoutMs = 3000): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/config_info`, { signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Judge0 HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 单份代码判一批测试用例(每用例一个 Judge0 提交),阻塞到全部出结果。
 *
 * @param code          用户源码(stdin/stdout 程序)
 * @param language      judge0 语言 key(如 'python')
 * @param testCases     测试用例[{input,expected}]
 */
export async function judgeOnJudge0(
  code: string,
  language: string,
  testCases: Judge0TestCase[],
  options: Judge0JudgeOptions = {},
): Promise<Judge0Verdict> {
  const baseUrl = (options.baseUrl || JUDGE0_DEFAULT_URL).replace(/\/$/, '')
  const { onProgress } = options
  if (!testCases.length) throw new Error('No test cases')
  if (!isJudge0Lang(language)) throw new Error(`语言 ${language} 暂不支持本地 Judge0 判题`)

  const languageId = JUDGE0_LANGUAGE_IDS[language as Judge0LangKey]
  const cpuLimit = options.timeoutMs ?? 2000
  // Judge0 参数:时间=秒、内存=KB。为避免 422,所有自定义值都钳制到服务端上限以内,
  // 且不传 wall_time_limit/stack_size_limit(交给服务端默认,天然不超限)。
  const SERVER_MAX_CPU_S = 15
  const SERVER_MAX_MEM_KB = 512000
  // cpu_time_limit:秒。给足余量,下限 1s,上限 15s。
  const cpuSec = Math.min(SERVER_MAX_CPU_S, Math.max(1, Math.round(cpuLimit / 1000)))
  // memory_limit:KB。下限 32MB,上限 512000KB。
  const memKb = Math.min(SERVER_MAX_MEM_KB, Math.max(32768, Math.round((options.memoryMb ?? 128) * 1024)))

  // 1) 批量创建提交
  const submissions = testCases.map((tc) => ({
    source_code: code,
    language_id: languageId,
    stdin: decodeEscapes(tc.input),
    cpu_time_limit: cpuSec,
    memory_limit: memKb,
  }))

  interface Created { token?: string }
  const created = await fetchJson<Created[] | Created>(
    `${baseUrl}/submissions/batch?base64_encoded=false`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissions }),
    },
    10000,
  )
  const tokens = (Array.isArray(created) ? created : [created])
    .map((c) => c.token)
    .filter((t): t is string => !!t)
  if (tokens.length !== testCases.length) throw new Error('Judge0 创建提交失败:token 数量不符')

  // 2) 轮询直到全部出结果;每轮有新完成的点就回调 onProgress(逐点即时回显)
  const fields = 'token,stdout,stderr,compile_output,status,time,memory'
  const all = new Array<Judge0RunResult | null>(tokens.length).fill(null)
  const deadline = Date.now() + Math.max(15000, cpuLimit * testCases.length + 8000)

  const assemble = (): Judge0SubmissionResult[] =>
    testCases.map((tc, i) => {
      const run = all[i]
      if (!run) return { testCaseIndex: i, passed: false, input: decodeEscapes(tc.input), expected: decodeEscapes(tc.expected), actual: '', status: 'pending' }
      let st = mapJudge0Status(run.status?.id ?? 13)
      const actualOut = norm(b64decode(run.stdout))
      const expOut = decodeEscapes(tc.expected).trim()
      let error: string | undefined
      if (st === 'accepted') {
        const matches = equalsIgnoreTrailingWs(actualOut, expOut)
        if (!matches) st = 'wrong_answer'
      }
      switch (st) {
        case 'compile_error': error = b64decode(run.compile_output) || '编译错误'; break
        case 'runtime_error': error = b64decode(run.stderr) || '运行错误'; break
        case 'timeout': error = '超出时间限制'; break
        default: break
      }
      return {
        testCaseIndex: i,
        passed: st === 'accepted',
        input: decodeEscapes(tc.input),
        expected: decodeEscapes(tc.expected),
        actual: actualOut,
        error,
        status: st,
        time_ms: run.time != null ? Math.round(Number(run.time) * 1000) : null,
        memory_kb: run.memory ?? null,
      }
    })

  while (all.some((r) => r === null)) {
    if (Date.now() > deadline) throw new Error('判题超时(轮询超时),请稍后重试')
    const pending = tokens
      .map((tk, i) => ({ tk, i }))
      .filter(({ i }) => all[i] === null)
      .slice(0, 20) // 分批拉取,避免 URL 过长
    const tkList = pending.map((p) => p.tk).join(',')
    // GET /submissions/batch 返回外壳是 { submissions: [...] }
    const res = await fetchJson<Judge0BatchResponse | Judge0RunResult[]>(
      `${baseUrl}/submissions/batch?tokens=${tkList}&fields=${fields}`,
      { method: 'GET' },
      10000,
    )
    const list = Array.isArray(res) ? res : (res.submissions ?? [])
    let newlyDone = 0
    for (let k = 0; k < pending.length; k++) {
      const rec = list[k]
      if (!rec) continue
      const statusId = Number(rec.status?.id)
      if (statusId >= 3) { all[pending[k].i] = rec; newlyDone++ } // 1/2 仍为排队/运行,下一轮再取
    }
    if (newlyDone > 0) onProgress?.(assemble())
    await new Promise((r) => setTimeout(r, 400))
  }

  // 3) 最终判定
  const results = assemble()
  const allPassed = results.every((r) => r.passed)
  const hasError = results.some((r) => !r.passed && r.status !== 'wrong_answer' && !!r.error)
  const status = allPassed
    ? 'accepted'
    : hasError
      ? results.find((r) => !r.passed && !!r.error)?.status || 'runtime_error'
      : 'wrong_answer'

  const execution_time_ms = results.reduce((sum, r) => sum + (r.time_ms ?? 0), 0)
  return { status, results, execution_time_ms }
}
