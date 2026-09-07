// 中心判题 —— Judge0 CE 代理(纯 Judge0,已移除 Piston / 内联 JS 执行)
//
// 设计目标:编程题判题统一走标准 Judge0,不再依赖任何旧的自研 JS 沙箱 / Piston。
//  - 每个测试用例 = 一个 Judge0 submission(编译+运行一次),对应 OJ 的一个测试点;
//  - 中心判题(平台自部署 Judge0)计入公共成绩;用户本地自测见 src/lib/judge0.ts(浏览器直连)。
//
// 必配环境变量:
//   JUDGE0_URL  平台自部署 Judge0 的地址,例如 http://<host>:2358
//   npx supabase secrets set JUDGE0_URL=http://<your-judge0-host>:2358
// 未配置时直接返回明确错误(不再回退到旧逻辑)。

const JUDGE0_URL = Deno.env.get('JUDGE0_URL') || ''

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info',
}

// 前端语言 key -> Judge0 CE 语言 id(与 src/lib/judge0.ts 保持一致)
const LANGUAGE_IDS: Record<string, number> = {
  c: 50,
  cpp: 54,
  java: 62,
  javascript: 63,
  typescript: 74,
  python: 71,
}

interface TestCase { input: string; expected: string }

interface JudgeRequest {
  code: string
  language: string
  test_cases: TestCase[]
  execution_mode?: 'stdio' | 'function'
  runtime_config?: { timeout_ms?: number; memory_mb?: number }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function j0Status(statusId: number): string {
  switch (statusId) {
    case 3: return 'accepted'
    case 4: return 'wrong_answer'
    case 5: return 'timeout'
    case 6: return 'compile_error'
    default: return 'runtime_error'
  }
}
const j0Trim = (s?: string): string => (s ?? '').replace(/\s+$/, '')
const j0Match = (a: string, b: string): boolean => a.replace(/\s+$/, '') === b.replace(/\s+$/, '')

async function judgeViaJudge0(body: JudgeRequest): Promise<Response> {
  const { code, language, test_cases, execution_mode = 'stdio', runtime_config } = body

  if (!code || !language || !test_cases?.length) return json({ error: 'missing code, language, or test_cases' }, 400)

  // Judge0 是真实编译/运行,只支持 stdin→stdout 的 stdio 模式;function/LeetCode 模板题不走这里
  if (execution_mode === 'function') {
    return json({ error: 'function 模板题不适用 Judge0,请将该题改为 stdio 模式后重试' }, 400)
  }
  const languageId = LANGUAGE_IDS[language]
  if (!languageId) {
    return json({ error: `语言 ${language} 暂不支持中心 Judge0 判题(支持:c/cpp/java/javascript/typescript/python)` }, 400)
  }

  const cpuMs = runtime_config?.timeout_ms ?? 2000
  const memMb = runtime_config?.memory_mb ?? 128
  const wallSec = Math.max(1, Math.round((cpuMs / 1000) * 1.5))
  const memKb = Math.max(32768, Math.round(memMb * 1024))

  const submissions = test_cases.map((tc) => ({
    source_code: code,
    language_id: languageId,
    stdin: tc.input,
    cpu_time_limit: wallSec,
    wall_time_limit: Math.max(1, Math.round(wallSec * 1.5)),
    memory_limit: memKb,
    enable_network: false,
  }))

  // 1) 批量创建
  const createRes = await fetch(`${JUDGE0_URL}/submissions/batch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissions }),
  })
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '')
    return json({ error: `Judge0 创建提交失败:HTTP ${createRes.status} ${text.slice(0, 200)}` }, createRes.status)
  }
  const created = (await createRes.json()) as { token?: string }[]
  const tokens = created.map((c) => c.token).filter((t): t is string => !!t)
  if (tokens.length !== test_cases.length) return json({ error: 'Judge0 提交 token 数量不符' }, 502)

  // 2) 轮询至全部出结果
  type Run = { status_id: number; stdout?: string; stderr?: string; compile_output?: string; time?: unknown; memory?: unknown }
  const fields = 'token,stdout,stderr,compile_output,status,time,memory'
  const all = new Array<Run | null>(tokens.length).fill(null)
  const deadline = Date.now() + Math.max(20000, cpuMs * tokens.length + 10000)
  while (all.some((r) => r === null)) {
    if (Date.now() > deadline) return json({ error: '判题超时' }, 504)
    const pending = tokens.map((tk, i) => ({ tk, i })).filter(({ i }) => all[i] === null)
    const poll = await fetch(`${JUDGE0_URL}/submissions/batch?tokens=${pending.map((p) => p.tk).join(',')}&fields=${fields}`)
    if (!poll.ok) return json({ error: `Judge0 查询失败:HTTP ${poll.status}` }, 502)
    const data = (await poll.json()) as Run[]
    for (let k = 0; k < pending.length; k++) {
      const rec = data[k]
      if (rec && rec.status_id >= 3) all[pending[k].i] = rec
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  // 3) 整理判定
  const results = test_cases.map((tc, i) => {
    const run = all[i]!
    const st = j0Status(run.status_id)
    const actualOut = j0Trim(run.stdout)
    const expOut = tc.expected.trim()
    const outputOk = st === 'accepted' && j0Match(actualOut, expOut)
    let error: string | undefined
    if (st === 'compile_error') error = run.compile_output || '编译错误'
    else if (st === 'runtime_error') error = run.stderr || '运行错误'
    else if (st === 'timeout') error = '超出时间限制'
    return {
      testCaseIndex: i,
      passed: outputOk,
      input: tc.input,
      expected: tc.expected,
      actual: actualOut,
      error,
      status: outputOk ? 'accepted' : st,
      time_ms: run.time != null ? Math.round(Number(run.time) * 1000) : null,
      memory_kb: run.memory ?? null,
    }
  })

  const allPassed = results.every((r) => r.passed)
  const failed = results.find((r) => !r.passed)
  const status = allPassed ? 'accepted' : failed?.status || 'wrong_answer'
  const execution_time_ms = results.reduce((sum, r) => sum + (r.time_ms ?? 0), 0)
  return json({ status, results, execution_time_ms })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!JUDGE0_URL) {
    return json({ error: '中心判题尚未配置:请先为 judge 函数设置环境变量 JUDGE0_URL(指向平台自部署的 Judge0 CE)' }, 503)
  }
  try {
    const body = (await req.json()) as JudgeRequest
    return await judgeViaJudge0(body)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
