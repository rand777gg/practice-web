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

/** 前端可选语言 -> Judge0 CE v1.13 默认语言 id(社区实例的内置 languages 表,已稳定多年) */
export const JUDGE0_LANGUAGE_IDS: Record<string, number> = {
  c: 50,            // C (GCC 7.4.0)
  cpp: 54,          // C++ (GCC 7.4.0)
  java: 62,         // Java (OpenJDK 13.0.1)
  javascript: 63,   // JavaScript (Node.js 12.14.0)
  typescript: 74,   // TypeScript (3.7.4)
  python: 71,       // Python (3.8.1)
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
}

/** Judge0 /submissions 里 decode 出的执行结果片段 */
export interface Judge0RunResult {
  stdout?: string
  stderr?: string
  compile_output?: string
  status_id: number
  status_description?: string
  time?: string | number | null
  memory?: number | null
  token?: string
}

/** 映射回前端 SubmissionResult(status 语义沿用现有枚举) */
export interface Judge0SubmissionResult {
  testCaseIndex: number
  passed: boolean
  input: string
  expected: string
  actual: string
  error?: string
  status: string // accepted | wrong_answer | timeout | compile_error | runtime_error
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
  if (!testCases.length) throw new Error('No test cases')
  if (!isJudge0Lang(language)) throw new Error(`语言 ${language} 暂不支持本地 Judge0 判题`)

  const languageId = JUDGE0_LANGUAGE_IDS[language as Judge0LangKey]
  const cpuLimit = options.timeoutMs ?? 2000
  // Judge0 时间参数单位为秒;内存单位为 KB(整数)。下限保护:CPU>=1s、内存>=32MB。
  const wallSec = Math.max(1, Math.round((cpuLimit / 1000) * 1.5))
  const memKb = Math.max(32768, Math.round((options.memoryMb ?? 128) * 1024))

  // 1) 批量创建提交
  const submissions = testCases.map((tc) => ({
    source_code: code,
    language_id: languageId,
    stdin: tc.input,
    cpu_time_limit: wallSec,
    wall_time_limit: Math.max(1, Math.round(wallSec * 1.5)),
    memory_limit: memKb,
    stack_size_limit: Math.max(128 * 1024, memKb),
    enable_network: false,
    enable_per_file_and_network_limits: true,
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

  // 2) 轮询直到全部出结果
  const fields = 'token,stdout,stderr,compile_output,status,time,memory'
  const all = new Array<Judge0RunResult | null>(tokens.length).fill(null)
  const deadline = Date.now() + Math.max(15000, cpuLimit * testCases.length + 8000)

  while (all.some((r) => r === null)) {
    if (Date.now() > deadline) throw new Error('判题超时(轮询超时),请稍后重试')
    const pending = tokens
      .map((tk, i) => ({ tk, i }))
      .filter(({ i }) => all[i] === null)
      .slice(0, 20) // 分批拉取,避免 URL 过长
    const tkList = pending.map((p) => p.tk).join(',')
    const data = await fetchJson<Judge0RunResult[]>(
      `${baseUrl}/submissions/batch?tokens=${tkList}&fields=${fields}`,
      { method: 'GET' },
      10000,
    )
    for (let k = 0; k < pending.length; k++) {
      const rec = data[k]
      if (!rec) continue
      const statusId = Number(rec.status_id)
      if (statusId >= 3) all[pending[k].i] = rec // 1/2 仍为排队/运行,下一轮再取
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  // 3) 整理判定结果
  const results: Judge0SubmissionResult[] = testCases.map((tc, i) => {
    const run = all[i] as Judge0RunResult
    let st = mapJudge0Status(run.status_id)
    const actualOut = norm(b64decode(run.stdout))
    const expOut = tc.expected.trim()

    let error: string | undefined

    if (st === 'accepted') {
      // 程序正常运行结束;是否通过仍需比对输出与期望是否一致(输出不符即 WA)
      const matches = equalsIgnoreTrailingWs(actualOut, expOut)
      if (!matches) st = 'wrong_answer'
    }

    switch (st) {
      case 'compile_error':
        error = b64decode(run.compile_output) || '编译错误'
        break
      case 'runtime_error':
        error = b64decode(run.stderr) || '运行错误'
        break
      case 'timeout':
        error = '超出时间限制'
        break
      case 'wrong_answer':
        break
      default:
        break
    }

    return {
      testCaseIndex: i,
      passed: st === 'accepted',
      input: tc.input,
      expected: tc.expected,
      actual: actualOut,
      error,
      status: st,
      time_ms: run.time != null ? Math.round(Number(run.time) * 1000) : null,
      memory_kb: run.memory ?? null,
    }
  })

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
