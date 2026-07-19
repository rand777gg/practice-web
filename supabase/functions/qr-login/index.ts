import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  try {
    const { token, code } = await req.json()
    if (!token || !code) return new Response(JSON.stringify({ error: "missing params" }), { status: 400 })

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Verify token is confirmed and code matches
    const { data: row, error: rowErr } = await supabaseAdmin
      .from("qr_login_tokens")
      .select("user_id, status, auth_code")
      .eq("token", token)
      .single()

    if (rowErr || !row || row.status !== "confirmed" || row.auth_code !== code) {
      return new Response(JSON.stringify({ error: "invalid" }), { status: 401 })
    }

    // Get user email
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(row.user_id)
    if (!user?.email) return new Response(JSON.stringify({ error: "user not found" }), { status: 404 })

    // Generate a session by signing in as the user via admin API
    // Create a magic link and extract the session from the redirect
    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
      options: { redirectTo: `${Deno.env.get("SITE_URL") || "http://localhost:5173"}/` }
    })

    if (!linkData) return new Response(JSON.stringify({ error: "link failed" }), { status: 500 })

    // The generateLink response includes hashed_token in the URL
    // We can extract it and use to create a session
    const url = new URL(linkData.properties.action_link)
    const tokenHash = url.searchParams.get("token_hash")
    const type = url.searchParams.get("type")

    if (!tokenHash) return new Response(JSON.stringify({ error: "no token" }), { status: 500 })

    // Verify the OTP to get a session
    const { data: verifyData, error: verifyErr } = await supabaseAdmin.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    })

    if (verifyErr || !verifyData.session) {
      return new Response(JSON.stringify({ error: "verify failed" }), { status: 500 })
    }

    // Mark token as used
    await supabaseAdmin.from("qr_login_tokens").update({ status: "expired" }).eq("token", token)

    return new Response(JSON.stringify({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    }), { headers: { "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
