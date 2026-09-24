// 平台判题探活 —— 浏览器不再直连 Judge0 之后的服务端代理
//
// 中心 Judge0 现在开了自带鉴权(AUTHN_HEADER=Authorization),浏览器直连只会拿到 401;
// 而 JUDGE0_TOKEN 是服务端机密,绝不能下发到浏览器(否则 F12 一抓即得,鉴权形同虚设)。
// 所以"平台判题是否可用/链路多快"只能由服务端回答:先校验调用者的 Supabase 登录态,
// 再由服务端带 token 去问 Judge0。前端拿到的仍是自己这一侧的往返耗时。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const JUDGE0_URL = (Deno.env.get('JUDGE0_URL') || '').replace(/\/$/, '')
const JUDGE0_TOKEN = Deno.env.get('JUDGE0_TOKEN') || ''

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!JUDGE0_URL) return json({ ok: false, error: '中心判题尚未配置 JUDGE0_URL' }, 503)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = token ? await adminClient.auth.getUser(token) : { data: { user: null } }
    if (!user) return json({ error: 'unauthorized' }, 401)

    const started = Date.now()
    const res = await fetch(`${JUDGE0_URL}/config_info`, {
      headers: JUDGE0_TOKEN ? { Authorization: JUDGE0_TOKEN } : {},
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return json({ ok: false, error: `Judge0 HTTP ${res.status}`, status: res.status }, 503)
    }
    return json({ ok: true, judge0_latency_ms: Date.now() - started })
  } catch (err) {
    return json({ ok: false, error: String(err) }, 503)
  }
})
