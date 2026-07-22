import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { verify } from "npm:otplib"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, userId, code, secret, deviceId, deviceName, deviceInfo, customName } = await req.json()

    if (!action || !userId) {
      return new Response(JSON.stringify({ error: "missing params" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // --- SETUP: verify code against provided secret, then store ---
    if (action === "setup") {
      if (!secret || !code) {
        return new Response(JSON.stringify({ error: "missing secret or code" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      const result = await verify({ token: code, secret })
      if (!result.valid) {
        return new Response(JSON.stringify({ valid: false, error: "invalid code" }), {
          status: 200,
          headers: corsHeaders,
        })
      }

      const { error: upsertErr } = await supabaseAdmin
        .from("user_totp")
        .upsert({ user_id: userId, totp_secret: secret })

      if (upsertErr) {
        return new Response(JSON.stringify({ error: upsertErr.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      const { error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update({ totp_enabled: true })
        .eq("id", userId)

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      return new Response(JSON.stringify({ valid: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // --- VERIFY: verify code against stored secret ---
    if (action === "verify") {
      if (!code) {
        return new Response(JSON.stringify({ error: "missing code" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      const { data: totp, error: totpErr } = await supabaseAdmin
        .from("user_totp")
        .select("totp_secret")
        .eq("user_id", userId)
        .single()

      if (totpErr || !totp?.totp_secret) {
        return new Response(JSON.stringify({ valid: false, error: "no totp secret" }), {
          status: 200,
          headers: corsHeaders,
        })
      }

      const result = await verify({ token: code, secret: totp.totp_secret })
      return new Response(JSON.stringify({ valid: result.valid }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // --- TRUST: upsert trusted device with 7-day expiry ---
    if (action === "trust") {
      if (!deviceId) {
        return new Response(JSON.stringify({ error: "missing deviceId" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null
      const info = deviceInfo ? { ...deviceInfo, ip } : { ip }

      const { error: upsertErr } = await supabaseAdmin
        .from("user_trusted_devices")
        .upsert({ user_id: userId, device_id: deviceId, device_name: deviceName || null, custom_name: customName || null, device_info: info, expires_at: expiresAt }, {
          onConflict: "user_id,device_id",
        })

      if (upsertErr) {
        return new Response(JSON.stringify({ error: upsertErr.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      return new Response(JSON.stringify({ trusted: true, expiresAt }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: corsHeaders,
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
