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
// 配置 (supabase secrets):
//   DEEPSEEK_API_KEY   —— 必配, 前端那把 VITE_DEEPSEEK_API_KEY 已经不需要了
//   DEEPSEEK_BASE_URL  —— 可选, 默认 https://api.deepseek.com
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const API_KEY = Deno.env.get('DEEPSEEK_API_KEY') ?? ''
const BASE_URL = (Deno.env.get('DEEPSEEK_BASE_URL') ?? 'https://api.deepseek.com').replace(/\/+$/, '')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

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

    let body: string | undefined
    if (req.method !== 'GET') {
      body = await req.text()
      if (body.length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)
    }

    const upstream = await fetch(`${BASE_URL}${path}${url.search}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body,
    })

    // 原样回: @ai-sdk 要靠 upstream 的状态码和 JSON 结构区分"额度不足 / 限流 / 模型错误",
    // 在这里翻译错误体只会让它认不出来。
    //
    // x-ai-upstream 是给前端认的: 上游的 401(比如 key 失效)和"会话过期"在状态码上一样,
    // 前端只该在后者重试一次 —— 没有这个标记它会把上游 401 也当成会话过期, 白发一次请求。
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        'x-ai-upstream': '1',
        'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      },
    })
  } catch (err) {
    console.error('[ai]', err)
    return json({ error: String(err) }, 500)
  }
})
