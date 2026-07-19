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
    const { token, code } = await req.json()
    if (!token || !code) return new Response(JSON.stringify({ error: "missing params" }), { status: 400, headers: corsHeaders })

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    // Public client for verifyOtp — must use anon key to get the USER's session
    const supabasePublic = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
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

    if (!linkData) return new Response(JSON.stringify({ error: "link failed" }), { status: 500, headers: corsHeaders })

    const url = new URL(linkData.properties.action_link)
    const tokenHash = url.searchParams.get("token_hash")
    if (!tokenHash) return new Response(JSON.stringify({ error: "no token" }), { status: 500, headers: corsHeaders })

    // Verify OTP with PUBLIC client → creates the USER's session (not admin)
    const { data: verifyData, error: verifyErr } = await supabasePublic.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    })

    if (verifyErr || !verifyData.session) {
      return new Response(JSON.stringify({ error: "verify failed" }), { status: 500, headers: corsHeaders })
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
