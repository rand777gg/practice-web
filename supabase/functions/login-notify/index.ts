import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

/** 进飞书卡片前洗一遍: lark_md 认 * _ ~ ` [ ] ( ) 这些记号, 换行还能把卡片撑变形 */
function larkSafe(value: unknown, max = 120): string {
  return String(value ?? "")
    .replace(/[*_~`\[\]()<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "unknown"
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // 身份只能来自 JWT。以前直接读 body.userId, 于是任何访客都能:
    //   · 以任意用户的名义往 auth_log 写"登录记录"(服务端身份写, RLS 拦不住);
    //   · 往飞书群推伪造的"新设备登录"卡片 —— ip / user_agent 也是调用方传的,
    //     拼进 lark_md 还能注入格式。
    // 现在: 调用者必须登录, user_id 取验证过的会话; ip/UA 只信网关头, 且进卡片前先洗一遍。
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    const { data: { user }, error: userError } = token
      ? await supabaseAdmin.auth.getUser(token)
      : { data: { user: null }, error: new Error("no token") }
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const userId = user.id
    const email = user.email ?? ""
    // security_sb_forwarded_for_enabled=false, 所以这个头本身也可能是调用方伪造的 —— 只当参考信息用,
    // 绝不参与任何判定
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
    const userAgent = req.headers.get("user-agent") ?? "unknown"

    // 记录本次登录（记录 IP 供参考，但不作为判定依据）
    await supabaseAdmin
      .from("auth_log")
      .insert({ user_id: userId, ip, user_agent: userAgent })

    // 用 User Agent 判断是否同设备（比 IP 更可靠：手机 IP 漂移 / VPN 不变设备）
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentLogs } = await supabaseAdmin
      .from("auth_log")
      .select("user_agent, created_at")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(100)

    // 只有一条（刚插入的）→ 首次登录
    const isFirstLogin = !recentLogs || recentLogs.length <= 1

    // 检查这个 User Agent 是否在 30 天内出现过
    const knownUAs = new Set((recentLogs || []).slice(1).map((r) => r.user_agent))
    const isNewUA = !knownUAs.has(userAgent)

    // 新设备 + 飞书 webhook 已配置 → 考虑发通知
    const feishuWebhook = Deno.env.get("FEISHU_WEBHOOK_URL")
    if (feishuWebhook && (isFirstLogin || isNewUA)) {
      // 频率限制：1 小时内不发重复通知
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count } = await supabaseAdmin
        .from("auth_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", oneHourAgo)
        // 排除刚插入的这条，看之前是否有通知触发过
        .neq("user_agent", userAgent)
        .neq("ip", ip)

      // count === 0：这个小时内没有别的设备/IP登录过 → 可以通知
      // count > 0：已有其他设备/IP触发过通知 → 跳过，防刷屏
      if (count === 0) {
        const userName = email || userId.slice(0, 8)
        const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })

        // 从 UA 提取简明的设备名
        const deviceLabel = userAgent.replace(/Mozilla\/[\d.]+ /, "").replace(/\([^)]+\)/g, "").replace(/AppleWebKit\/[\d.]+\s*/g, "").replace(/ Chrome\/[\d.]+ Safari\/[\d.]+/, "").replace(/ Gecko\/[\d.]+ Firefox\/[\d.]+/, "").replace(/ Version\/[\d.]+/, "").replace(/\s+/g, " ").trim() || "未知设备"

        const message = {
          msg_type: "interactive",
          card: {
            header: {
              title: { tag: "plain_text", content: "新设备登录提醒" },
            },
            elements: [
              {
                tag: "div",
                text: {
                  tag: "lark_md",
                  content: `用户 **${larkSafe(email || userId.slice(0, 8))}** 从新设备登录\n\n**时间：** ${time}\n**设备：** ${larkSafe(deviceLabel)}\n**IP：** ${larkSafe(ip, 45)}`,
                },
              },
            ],
          },
        }

        fetch(feishuWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message),
        }).catch(() => {})
      }
    }

    return new Response(JSON.stringify({ result: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("login-notify error:", e)
    // Auth Hook 即使出错也不应该阻断登录，始终返回 200
    return new Response(JSON.stringify({ result: true, error: String(e) }), {
      status: 200,
      headers: corsHeaders,
    })
  }
})
