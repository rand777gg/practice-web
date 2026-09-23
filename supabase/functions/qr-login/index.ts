import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// 扫码登录的"兑换"这一步。
//
// 身份证明是**桌面端本地生成的 secret**(只存了 sha256), 不是二维码里的东西 ——
// 二维码/URL/表里都没有能换到登录态的材料。旧的 token+auth_code 方案等于把凭证
// 抄在本子上再拿本子对答案: 表对 anon 可读, 谁都能照着换一个 magic link 登录别人
// (见 001_initial_schema.sql Section 67)。
//
// 消费必须是原子的: 状态改成 expired 与取 user_id 在同一条 UPDATE ... RETURNING 里完成
// (qr_login_claim), 否则并发两次请求可以换出两个 magic link。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { token, secret } = await req.json()
    if (!token || !secret) return json({ error: "missing params" }, 400)

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: claimed, error } = await admin.rpc("qr_login_claim", {
      p_token: token,
      p_secret: secret,
    })
    if (error) return json({ error: error.message }, 500)

    // 没兑到 = 没确认 / 已过期 / 已被兑换 / secret 不对。一律同一个回答, 不区分。
    const userId = Array.isArray(claimed) ? claimed[0] : claimed
    if (!userId) return json({ error: "invalid" }, 401)

    const { data: { user } } = await admin.auth.admin.getUserById(userId)
    if (!user?.email) return json({ error: "user not found" }, 404)

    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
      options: { redirectTo: `${Deno.env.get("SITE_URL") || "http://localhost:5173"}/mfa` },
    })
    if (!linkData) return json({ error: "link failed" }, 500)

    return json({ magic_link: linkData.properties.action_link })
  } catch (e) {
    console.error("[qr-login]", e)
    return json({ error: String(e) }, 500)
  }
})
