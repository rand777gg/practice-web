import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Auth Hook 调用时会用这个 header 传递 secret
const HOOK_SECRET = Deno.env.get("AUTH_HOOK_SECRET")

interface AuthEvent {
  user?: { id: string; email?: string }
  ip_address?: string
  user_agent?: string
  timestamp?: string
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // 验证 Auth Hook secret（如果有配置）
    if (HOOK_SECRET) {
      const hookSecret = req.headers.get("x-supabase-auth-hook-secret")
      if (!hookSecret || hookSecret !== HOOK_SECRET) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: corsHeaders,
        })
      }
    }

    const body = await req.json()
    const ip = body.ip_address || body.ip || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
    const userAgent = body.user_agent || body.userAgent || req.headers.get("user-agent") || "unknown"
    const userId = body.user?.id || body.userId
    const email = body.user?.email || body.email || ""

    if (!userId) {
      return new Response(JSON.stringify({ error: "missing userId" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

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
                  content: `用户 **${userName}** 从新设备登录\n\n**时间：** ${time}\n**设备：** ${deviceLabel}\n**IP：** ${ip}`,
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
