// Supabase Edge Function: ai
//
// 平台模型的唯一出口 —— 前端不再持有任何 AI key。
//
// 为什么是"透明反向代理"而不是每个功能写一个函数:
//   前端十来处调用(小Q 对话、AI 导题、出题、简答批改、图表解读、Markdown 换行…)
//   全都是 OpenAI 兼容的 POST /chat/completions, 参数与响应都由 @ai-sdk 组装和解析。
//   所以这里原样转发: 进来的 body 不动, Authorization 换成服务端的 DEEPSEEK_API_KEY,
//   上游响应(含状态码)原样返回。于是前端只需要把 baseURL 指到本函数,
//   一行 SDK 调用都不用改 —— 谁也不会因为"多了一层代理"而拿到不一样的响应。
//
// 身份为什么必须查:
//   config.toml 里 verify_jwt = false 只是让网关别在入口拦(浏览器直连时带的头不标准),
//   真正的校验在下面 admin.auth.getUser(): 没有有效用户 JWT 一律 401。
//   否则这就是一个"任何人拿 anon key 就能刷平台额度"的免费接口。
//
// 路径为什么白名单:
//   目标主机写死 DEEPSEEK_BASE_URL(服务端配置), 只放行 /chat/completions 与 /models,
//   免得它被当成任意路径的跳板。
//
// 为什么用量记在这里(见 Section 72):
//   "AI 接入管理"页要看调用次数/耗时/成本, 而记在服务端是唯一不依赖前端自觉的位置 ——
//   这里已经握着 调用者(来自 JWT)、模型名(body)、状态码、耗时、以及上游返回的 usage。
//   前端那十几处调用一行都不用改。写失败只打日志, 绝不影响回答。
//   会话归属(x-ai-conversation)也在这里落, 于是管理页能按会话把用量归拢起来(见 Section 76)。
//
// 配置 (supabase secrets):
//   DEEPSEEK_API_KEY   —— 必配, 前端那把 VITE_DEEPSEEK_API_KEY 已经不需要了
//   DEEPSEEK_BASE_URL  —— 可选, 默认 https://api.deepseek.com
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type SB = ReturnType<typeof createClient>

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
const BASE_URL = (Deno.env.get('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com').replace(/\/+$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ai-source, x-ai-conversation',
  // 前端要能读到下面这个标记(跨域下自定义响应头默认读不到), 见 src/lib/ai/config.ts 的重试判断
  'Access-Control-Expose-Headers': 'x-ai-upstream',
  'Access-Control-Max-Age': '86400',
}

/** 一次请求的 body 上限。一次对话/导题撑死几十 KB, 超过就是有人在拿它当上传通道 */
const MAX_BODY_BYTES = 512 * 1024

const ALLOWED_PATHS = ['/chat/completions', '/models']

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * 取上游路径。
 *
 * 前端把 baseURL 设成本函数的地址, SDK 会自己接上 /chat/completions, 所以浏览器打的是
 * /functions/v1/ai/chat/completions; 而函数里读到的 req.url.pathname 是 /ai/chat/completions
 * —— 网关会把 /functions/v1 去掉, 但**保留函数名那一段**(实测)。两段都剥掉,
 * 直接打函数根路径的按对话处理。
 */
function upstreamPath(pathname: string): string {
  const rest = pathname
    .replace(/^\/functions\/v1/, '')
    .replace(/^\/ai/, '')
  if (!rest) return '/chat/completions'
  return rest.startsWith('/') ? rest : `/${rest}`
}

interface Usage {
  prompt: number | null
  completion: number | null
}

const EMPTY_USAGE: Usage = { prompt: null, completion: null }

function toCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

/** 从 OpenAI 兼容的响应体里取 usage(非流式的完整 JSON, 或流式里的某个 chunk) */
function readUsage(payload: unknown): Usage {
  const usage = (payload as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage
  if (!usage) return EMPTY_USAGE
  return { prompt: toCount(usage.prompt_tokens), completion: toCount(usage.completion_tokens) }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 场景标记只用来分组展示, 长度和字符集都收紧, 免得它变成任意写入 */
function readSource(header: string | null): string | null {
  if (!header) return null
  const clean = header.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32)
  return clean || null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 小Q 会话 id —— 让「AI 接入管理」能把用量按会话归拢起来。
 *
 * 只校验格式, **不校验归属**: 这是客户端自带的值, 乱填的后果仅仅是"他自己那一行挂到了别人的会话上",
 * 而 ai_usage 的策略是本人+管理员可见, 他看不到也因此改不了别人的账。
 * 为此每次调用多查一次会话表(对话高峰就是每次都要多打一次库)不值得。
 */
function readConversationId(header: string | null): string | null {
  const value = header?.trim() ?? ''
  return UUID_RE.test(value) ? value.toLowerCase() : null
}

/**
 * 流式请求要拿 token 用量: OpenAI 兼容接口只在带 stream_options.include_usage 时,
 * 才会在最后一个 chunk 里给出 usage。
 *
 * 这是全函数里**唯一**改写请求体的地方 —— 不改的话流式调用就只能记到耗时, 记不到 tokens。
 * 其他字段一律不动, 前端看到的上游响应结构因此没有变化(多出来的是标准 OpenAI 行为)。
 */
function withIncludeUsage(raw: string): string {
  const parsed = safeJson(raw)
  if (!parsed || typeof parsed !== 'object') return raw
  const obj = parsed as Record<string, unknown>
  const existing = (obj.stream_options && typeof obj.stream_options === 'object')
    ? obj.stream_options as Record<string, unknown>
    : {}
  obj.stream_options = { ...existing, include_usage: true }
  return JSON.stringify(obj)
}

/** 逐块读 SSE, 攒出最后那个 usage。读失败只是记不到 tokens, 不影响已经发给浏览器的流 */
async function consumeStreamUsage(
  stream: ReadableStream<Uint8Array>,
  onDone: (usage: Usage) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage: Usage = EMPTY_USAGE
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim()
          if (payload && payload !== '[DONE]') {
            const parsed = safeJson(payload)
            if (parsed && typeof parsed === 'object' && 'usage' in parsed) usage = readUsage(parsed)
          }
        }
        nl = buffer.indexOf('\n')
      }
    }
  } catch (err) {
    console.error('[ai] usage stream read failed:', String(err))
  } finally {
    onDone(usage)
    reader.cancel().catch(() => {})
  }
}

interface UsageRow {
  user_id: string
  model: string
  source: string | null
  conversation_id: string | null
  ok: boolean
  status_code: number
  latency_ms: number
  prompt_tokens: number | null
  completion_tokens: number | null
}

/** 埋点绝不能拖慢或打断回答: 不 await, 失败只落控制台 */
function logUsage(admin: SB, row: UsageRow): void {
  admin.from('ai_usage').insert(row).then(({ error }) => {
    if (error) console.error('[ai] usage log failed:', error.message)
  }, (err: unknown) => {
    console.error('[ai] usage log failed:', String(err))
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const started = Date.now()
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '') ?? ''
    if (!token) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return json({ error: 'unauthorized' }, 401)

    if (!API_KEY) return json({ error: 'ai_not_configured' }, 503)

    const url = new URL(req.url)
    const path = upstreamPath(url.pathname)
    if (!ALLOWED_PATHS.includes(path)) return json({ error: `path_not_allowed: ${path}` }, 404)

    // 只有"花钱的调用"才记: /models 是模型清单, 记进去会把调用次数灌水
    const tracked = req.method === 'POST' && path === '/chat/completions'
    const source = readSource(req.headers.get('x-ai-source'))
    const conversationId = readConversationId(req.headers.get('x-ai-conversation'))

    let body: string | undefined
    let model = ''
    let stream = false
    if (req.method !== 'GET') {
      body = await req.text()
      if (body.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)
      if (tracked) {
        const parsed = safeJson(body) as { model?: unknown; stream?: unknown } | null
        model = typeof parsed?.model === 'string' ? parsed.model : ''
        stream = parsed?.stream === true
        if (stream) body = withIncludeUsage(body)
      }
    }

    let upstream: Response
    try {
      upstream = await fetch(`${BASE_URL}${path}${url.search}`, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body,
      })
    } catch (err) {
      // 连不上上游: 这也是一次"调用失败", 页面上要能看见
      if (tracked) {
        logUsage(admin, {
          user_id: user.id, model, source, conversation_id: conversationId, ok: false, status_code: 0,
          latency_ms: Date.now() - started, prompt_tokens: null, completion_tokens: null,
        })
      }
      throw err
    }

    // 原样回: @ai-sdk 要靠 upstream 的状态码和 JSON 结构区分"额度不足 / 限流 / 模型错误",
    // 在这里翻译错误体只会让它认不出来。
    //
    // x-ai-upstream 是给前端认的: 上游的 401(比如 key 失效)和"会话过期"在状态码上一样,
    // 前端只该在后者重试一次 —— 没有这个标记它会把上游 401 也当成会话过期, 白发一次请求。
    const passHeaders = {
      ...corsHeaders,
      'x-ai-upstream': '1',
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    }

    if (!tracked || !upstream.body) {
      return new Response(upstream.body, { status: upstream.status, headers: passHeaders })
    }

    if (stream) {
      // 分流: 一路照常流给浏览器(流式体验不变), 另一路在后台读 usage 落库
      const [toClient, toLog] = upstream.body.tee()
      void consumeStreamUsage(toLog, (usage) => {
        logUsage(admin, {
          user_id: user.id, model, source, conversation_id: conversationId, ok: upstream.ok, status_code: upstream.status,
          latency_ms: Date.now() - started, prompt_tokens: usage.prompt, completion_tokens: usage.completion,
        })
      })
      return new Response(toClient, { status: upstream.status, headers: passHeaders })
    }

    // 非流式: 读完整段(一次对话的回答就几十 KB)才能拿到 usage
    const text = await upstream.text()
    const usage = readUsage(safeJson(text))
    logUsage(admin, {
      user_id: user.id, model, source, conversation_id: conversationId, ok: upstream.ok, status_code: upstream.status,
      latency_ms: Date.now() - started, prompt_tokens: usage.prompt, completion_tokens: usage.completion,
    })
    return new Response(text, { status: upstream.status, headers: passHeaders })
  } catch (err) {
    console.error('[ai]', err)
    return json({ error: String(err) }, 500)
  }
})
