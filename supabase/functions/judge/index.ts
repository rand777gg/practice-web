const PISTON_URL = Deno.env.get('PISTON_URL') || ''

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info',
}

interface TestCase {
  input: string
  expected: string
}

interface JudgeRequest {
  code: string
  language: string
  test_cases: TestCase[]
  execution_mode?: 'stdio' | 'function'
  runtime_config?: {
    timeout_ms?: number
    memory_mb?: number
  }
}

// --- stdio mode: console.log / print output capture ---

function executeStdioJS(code: string, stdin: string): { stdout: string; error?: string } {
  const logs: string[] = []
  const _console = { log: (...args: unknown[]) => logs.push(args.map(String).join(' ')) }

  const inputLines = stdin ? stdin.split('\n') : []
  let inputIdx = 0
  const input = () => inputLines[inputIdx++] ?? ''

  try {
    const wrapped = `return (() => { ${code} })()`
    const fn = new Function('console', 'input', wrapped)
    const result = fn(_console, input)
    if (result !== undefined && logs.every((l) => !l.includes(String(result)))) {
      logs.push(String(result))
    }
    return { stdout: logs.join('\n').trimEnd() }
  } catch (e) {
    return { stdout: logs.join('\n').trimEnd(), error: e instanceof Error ? e.message : String(e) }
  }
}

// --- function mode: call solution(...args), compare return value ---

function executeFunctionJS(code: string, input: string): { stdout: string; error?: string } {
  try {
    // Wrap user code to capture the defined function
    const wrapped = `
      ${code}
      if (typeof solution !== 'undefined') return solution
      if (typeof solve !== 'undefined') return solve
      return undefined
    `
    const solution = new Function(wrapped)()

    if (typeof solution !== 'function') {
      return { stdout: '', error: '未找到函数，请定义 function solution(...) 或 function solve(...)' }
    }

    const args = JSON.parse(input)

    if (!Array.isArray(args)) {
      return { stdout: '', error: '测试用例 input 必须是 JSON 数组格式' }
    }

    const result = solution(...args)
    const stdout = JSON.stringify(result)
    return { stdout }
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { stdout: '', error: `语法错误: ${e.message}` }
    }
    return { stdout: '', error: e instanceof Error ? e.message : String(e) }
  }
}

// --- Piston proxy for non-JS languages ---

async function executePiston(code: string, language: string, stdin: string, timeoutMs: number, memoryMb: number): Promise<{ stdout: string; error?: string }> {
  const langMap: Record<string, string> = {
    python: 'python',
    cpp: 'cpp',
    java: 'java',
  }

  const versions: Record<string, string> = {
    python: '3.10.0',
    cpp: '10.2.0',
    java: '15.0.2',
  }

  const res = await fetch(`${PISTON_URL}/api/v2/piston/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: langMap[language],
      version: versions[language] || '*',
      files: [{ content: code }],
      stdin,
      run_timeout: timeoutMs,
      compile_timeout: 10000,
      run_memory_limit: memoryMb * 1024,
    }),
  })

  const data = await res.json()
  const run = data.run

  if (!run) {
    return { stdout: '', error: data.message || 'execution failed' }
  }

  return {
    stdout: (run.stdout || '').trim(),
    error: run.stderr || run.signal || undefined,
  }
}

// --- main ---

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body: JudgeRequest = await req.json()
    const { code, language, test_cases, execution_mode = 'stdio', runtime_config } = body

    if (!code || !language || !test_cases?.length) {
      return new Response(JSON.stringify({ error: 'missing code, language, or test_cases' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const timeoutMs = runtime_config?.timeout_ms ?? 2000
    const memoryMb = runtime_config?.memory_mb ?? 256
    const isJS = language === 'javascript' || language === 'typescript'
    const usePiston = !isJS && PISTON_URL
    const isFunctionMode = execution_mode === 'function'

    if (!isJS && !usePiston) {
      return new Response(JSON.stringify({
        error: '仅支持 JavaScript/TypeScript。Python/C++/Java 需自部署 Piston 并设置 PISTON_URL。',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (isFunctionMode && !isJS) {
      return new Response(JSON.stringify({
        error: 'function 模式目前仅支持 JavaScript/TypeScript。',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = []

    for (let i = 0; i < test_cases.length; i++) {
      const tc = test_cases[i]
      let stdout: string
      let error: string | undefined

      if (isJS && isFunctionMode) {
        const result = executeFunctionJS(code, tc.input)
        stdout = result.stdout
        error = result.error
      } else if (isJS) {
        const result = executeStdioJS(code, tc.input)
        stdout = result.stdout
        error = result.error
      } else {
        const result = await executePiston(code, language, tc.input, timeoutMs, memoryMb)
        stdout = result.stdout
        error = result.error
      }

      const expected = tc.expected.trim()
      const passed = !error && stdout === expected

      results.push({
        testCaseIndex: i,
        passed,
        input: tc.input,
        expected: tc.expected,
        actual: stdout,
        error,
      })
    }

    const allPassed = results.every((r) => r.passed && !r.error)
    const hasError = results.some((r) => r.error)

    let status: string
    if (allPassed) {
      status = 'accepted'
    } else if (hasError) {
      status = 'runtime_error'
    } else {
      status = 'wrong_answer'
    }

    return new Response(JSON.stringify({ status, results, execution_time_ms: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
