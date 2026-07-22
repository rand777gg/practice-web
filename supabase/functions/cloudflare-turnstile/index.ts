import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "missing token" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || ""

    const formData = new FormData()
    formData.append("secret", Deno.env.get("CF_TURNSTILE_SECRET") ?? "")
    formData.append("response", token)
    if (ip) formData.append("remoteip", ip)

    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      body: formData,
      method: "POST",
    })

    const outcome = await result.json() as { success: boolean; "error-codes"?: string[] }
    if (outcome.success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ success: false, "error-codes": outcome["error-codes"] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
