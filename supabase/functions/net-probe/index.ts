// Edge Function: net-probe
//
// 只做一件事：把前端测到的「直连 vs 经 Cloudflare」两条路径的耗时落库。
//
// 为什么需要它：实测中国大陆直连香港源站 170ms、经 Cloudflare 1416ms（8.3 倍），
// 但那只是一条电信线路的样本。要决定是否把整个 API 切到直连，
// 需要真实用户跨运营商的数据。
//
// 落库用 service_role（前端对 net_probe_samples 没有 INSERT 权限，避免被刷）。
// 校验规则刻意保守：任何超出合理范围的值直接丢弃，宁可少收数据也不污染统计。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

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

const MAX_MS = 60_000
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0 || n > MAX_MS) return null
  return Math.round(n * 100) / 100
}
const str = (v: unknown, max = 64): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s === '' ? null : s
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const direct_ms = num(body.direct_ms)
    const cdn_ms = num(body.cdn_ms)
    const direct_ok = body.direct_ok === true
    const cdn_ok = body.cdn_ok === true

    // 两条路径都没测出来就没有记录价值
    if (direct_ms === null && cdn_ms === null) return json({ error: 'no_samples' }, 400)

    // 尽量识别调用者，但不强制：未登录访客的样本同样有价值（user_id 记 null）
    let userId: string | null = null
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (token) {
      const { data } = await adminClient.auth.getUser(token).catch(() => ({ data: { user: null } }))
      userId = data?.user?.id ?? null
    }

    const { error } = await adminClient.from('net_probe_samples').insert({
      user_id: userId,
      direct_ms, cdn_ms, direct_ok, cdn_ok,
      colo: str(body.colo, 8),
      conn_type: str(body.conn_type, 16),
      downlink_mbps: num(body.downlink_mbps),
      client_rtt_ms: num(body.client_rtt_ms),
      save_data: typeof body.save_data === 'boolean' ? body.save_data : null,
      region: str(body.region, 32),
      ua: str(body.ua, 200),
    })
    if (error) return json({ ok: false, error: error.message }, 500)

    return json({ ok: true })
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500)
  }
})
