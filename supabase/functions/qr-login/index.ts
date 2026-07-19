import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  try {
    const { token, code, anonKey } = await req.json()
    if (!token || !code || !anonKey) return new Response(JSON.stringify({ error: "missing params" }), { status: 400, headers: corsHeaders })

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    const supabasePublic = createClient(
      Deno.env.get("SUPABASE_URL")!,
      anonKey
    )

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("qr_login_tokens")
      .select("user_id, status, auth_code")
      .eq("token", token)
      .single()

    if (rowErr || !row || row.status !== "confirmed" || row.auth_code !== code) {
      return new Response(JSON.stringify({ error: "invalid" }), { status: 401, headers: corsHeaders })
    }

    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
    if (!user?.email) return new Response(JSON.stringify({ error: "user not found" }), { status: 404, headers: corsHeaders })

    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
      options: { redirectTo: `${Deno.env.get("SITE_URL") || "http://localhost:5173"}/` }
    })

    if (!linkData) return new Response(JSON.stringify({ error: "link failed", detail: "generateLink returned empty" }), { status: 500, headers: corsHeaders })

    const url = new URL(linkData.properties.action_link)
    const magicToken = url.searchParams.get("token")
    if (!magicToken) return new Response(JSON.stringify({ error: "no token", detail: url.href }), { status: 500, headers: corsHeaders })

    // SHA256 hash the raw token to get token_hash
    const tokenHash = Array.from(new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(magicToken))
    )).map(b => b.toString(16).padStart(2, "0")).join("")

    const { data: verifyData, error: verifyErr } = await supabasePublic.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    })

    if (verifyErr || !verifyData.session) {
      return new Response(JSON.stringify({ error: "verify failed", detail: verifyErr?.message || String(verifyErr) }), { status: 500, headers: corsHeaders })
    }

    await supabaseAdmin.from("qr_login_tokens").update({ status: "expired" }).eq("token", token)

    return new Response(JSON.stringify({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
