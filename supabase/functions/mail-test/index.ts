// mail-test —— 一次性诊断函数: 用项目已配置的 RESEND_API_KEY / RESEND_FROM 发测试邮件
// 用法: POST {"to":"someone@example.com"}  -> {"ok":true,"id":"..."} 或 {"ok":false,"error":"..."}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

  try {
    const { to } = await req.json()
    if (!to || typeof to !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return json({ ok: false, error: "invalid_to" }, 400)
    }
    const apiKey = Deno.env.get("RESEND_API_KEY")
    const from = Deno.env.get("RESEND_FROM")
    if (!apiKey || !from) return json({ ok: false, error: "resend_not_configured" }, 500)

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "自习室测试邮件 (from practice-web)",
        text: "这是一封来自 practice-web 的测试邮件。\n\n如果你收到这封邮件, 说明 Resend 发信链路(API Key + 发件域名)已打通。\n发件配置: " + from,
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      console.error("resend failed", res.status, text)
      return json({ ok: false, error: "resend_error", status: res.status, detail: text })
    }
    return json({ ok: true, detail: JSON.parse(text) })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
