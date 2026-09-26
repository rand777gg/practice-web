// Edge Function: report-client-event
//
// 只做一件事：把前端上报的事件落库（migration Section 104 的 client_events）。
//
// 为什么需要它：`logError` 在生产是空操作，于是有两件事在线上完全不可见 ——
//   1. 交卷（Section 102）与保存路线（Section 103）都留了"RPC 函数不存在就退回旧路径"的降级分支，
//      那些分支**应当永不进入**，可一旦真进去了客户端没有任何信号；
//   2. 其它被 catch 掉的错误，线上连个数都没有。
//
// 落库用 service_role（前端对 client_events 没有 INSERT 权限，避免这张表被刷）。
// 校验刻意保守：kind 只认白名单，detail 只收对象且限体积 —— 这是给人看的诊断上下文，
// 不是数据通道，宁可少收也不让它变成可写任意内容的接口。
//
// 部署（自建环境不是 supabase functions deploy，见 docs/how-to-guide/01-self-hosted-functions.md）：
//   scp -r supabase/functions/report-client-event hk-sb:/opt/sbstack/volumes/functions/
//   ssh hk-sb 'cd /opt/sbstack && docker compose restart functions'

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

const KINDS = new Set(['rpc_missing', 'error', 'slow_request', 'other'])
const MAX_DETAIL_CHARS = 4000

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s === '' ? null : s
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const kind = typeof body.kind === 'string' && KINDS.has(body.kind) ? body.kind : null
    if (!kind) return json({ error: 'bad_kind' }, 400)

    // detail 只收普通对象且限体积；超限就丢掉内容只留一个标记（别让一条上报塞爆表）
    let detail: Record<string, unknown> = {}
    if (body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)) {
      const candidate = body.detail as Record<string, unknown>
      detail = JSON.stringify(candidate).length > MAX_DETAIL_CHARS
        ? { truncated: true, reason: 'detail 超过 4000 字符，已丢弃内容' }
        : candidate
    }

    // 尽量识别调用者但不强制：未登录时的错误同样有价值（user_id 记 null）
    let userId: string | null = null
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (token) {
      const { data } = await adminClient.auth.getUser(token).catch(() => ({ data: { user: null } }))
      userId = data?.user?.id ?? null
    }

    const { error } = await adminClient.from('client_events').insert({
      user_id: userId,
      kind,
      name: str(body.name, 120),
      detail,
      ua: str(body.ua, 200),
      region: str(body.region, 32),
      app_version: str(body.app_version, 32),
    })
    if (error) return json({ ok: false, error: error.message }, 500)

    return json({ ok: true })
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500)
  }
})
