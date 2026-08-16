import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { verify } from "npm:otplib"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Rate limiting: per-IP sliding-window counter (max 5 req/min)
const rateMap = new Map<string, { count: number; resetAt: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of rateMap) { if (v.resetAt < now) rateMap.delete(k) }
}, 30_000)

// Recovery code helpers
const RECOVERY_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_COUNT = 8
const CODE_LENGTH = 12 // formatted as XXXX-XXXX-XXXX

function generateRecoveryCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes).map((b) => RECOVERY_CHARS[b % RECOVERY_CHARS.length])
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`
}

async function hashCode(code: string): Promise<string> {
  const normalized = code.replace(/-/g, "").toUpperCase()
  const data = new TextEncoder().encode(normalized)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || entry.resetAt < now) {
    rateMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return false
  }
  entry.count++
  if (entry.count > 5) return true
  return false
}

/** Decode a JWT payload (base64url) without verification — token is already trusted via getUser. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1] ?? ""
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")
  const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))
  return JSON.parse(json)
}

/** Mark current session as MFA-verified (L1) and optionally extend account grace (L2). */
async function markSessionVerified(
  supabaseAdmin: any,
  userId: string,
  sid: string,
  method: "totp" | "passkey",
  remember: boolean,
): Promise<{ expiresAt: string; graceUntil: string | null }> {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("mfa_validity_days")
    .eq("id", userId)
    .single()
  const validityDays = Math.max(0, prof?.mfa_validity_days ?? 7)
  const expiresAt = new Date(Date.now() + validityDays * 86400_000).toISOString()

  await supabaseAdmin
    .from("user_mfa_sessions")
    .upsert(
      { session_id: sid, user_id: userId, method, expires_at: expiresAt },
      { onConflict: "session_id" },
    )

  let graceUntil: string | null = null
  if (remember && validityDays > 0) {
    await supabaseAdmin
      .from("profiles")
      .update({ mfa_grace_until: expiresAt })
      .eq("id", userId)
    graceUntil = expiresAt
  }
  return { expiresAt, graceUntil }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "unknown"
  if (isRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: corsHeaders,
    })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders })
    }

    const userId = user.id
    const sid = (decodeJwtPayload(token).sid as string) || ""
    const { action, code, secret, remember, deviceToken, deviceName } = await req.json()

    if (!action) {
      return new Response(JSON.stringify({ error: "missing action" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    // --- STATUS: server-authoritative MFA gate decision (L1 session / device trust / available methods)
    if (action === "status") {
      const [{ data: prof }, { count: passkeyCount }, { data: sess }, { data: totp }, { data: rc }, { data: dev }] = await Promise.all([
        supabaseAdmin.from("profiles").select("mfa_grace_until, mfa_validity_days, onboarded_at, role").eq("id", userId).single(),
        supabaseAdmin.from("passkey_credentials").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabaseAdmin.from("user_mfa_sessions").select("method, expires_at").eq("session_id", sid).eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("user_totp").select("user_id").eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("user_recovery_codes").select("codes").eq("user_id", userId).maybeSingle(),
        deviceToken
          ? supabaseAdmin.from("user_trusted_devices").select("expires_at").eq("user_id", userId).eq("device_id", deviceToken).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const now = Date.now()
      const sessionVerified = !!sess && new Date(sess.expires_at).getTime() > now
      // Device trust (per-device grace): this device's token row is valid
      const deviceTrusted = !!dev?.expires_at && new Date(dev.expires_at).getTime() > now
      // Legacy account-level grace (kept for compatibility, no longer the primary gate)
      const graceActive = (prof?.mfa_validity_days ?? 7) > 0
        && !!prof?.mfa_grace_until
        && new Date(prof.mfa_grace_until).getTime() > now

      return new Response(JSON.stringify({
        needsMfa: !sessionVerified && !deviceTrusted,
        sessionVerified,
        deviceTrusted,
        deviceExpiresAt: deviceTrusted ? dev.expires_at : null,
        graceUntil: graceActive ? prof.mfa_grace_until : null,
        validityDays: prof?.mfa_validity_days ?? 7,
        onboarded: !!prof?.onboarded_at,
        role: prof?.role ?? "user",
        availableMethods: {
          passkey: (passkeyCount ?? 0) > 0,
          totp: !!totp,
          recovery: !!(rc?.codes?.length),
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // --- SETUP: verify code against provided secret, then store
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

      // Generate recovery codes
      const plainCodes: string[] = []
      for (let i = 0; i < CODE_COUNT; i++) {
        plainCodes.push(generateRecoveryCode())
      }
      const hashedCodes = await Promise.all(plainCodes.map(hashCode))

      const { error: rcErr } = await supabaseAdmin
        .from("user_recovery_codes")
        .upsert({ user_id: userId, codes: hashedCodes })

      if (rcErr) {
        return new Response(JSON.stringify({ error: rcErr.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      // Setup counts as this session being verified (L1 + optional L2)
      const marked = await markSessionVerified(supabaseAdmin, userId, sid, "totp", remember === true)

      return new Response(JSON.stringify({ valid: true, recoveryCodes: plainCodes, graceUntil: marked.graceUntil }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // --- RECOVER: verify a recovery code and disable TOTP
    if (action === "recover") {
      if (!code) {
        return new Response(JSON.stringify({ error: "missing code" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      const { data: rcRow, error: rcErr } = await supabaseAdmin
        .from("user_recovery_codes")
        .select("codes")
        .eq("user_id", userId)
        .single()

      if (rcErr || !rcRow?.codes?.length) {
        return new Response(JSON.stringify({ valid: false, error: "no recovery codes" }), {
          status: 200,
          headers: corsHeaders,
        })
      }

      const submittedHash = await hashCode(code)
      const idx = rcRow.codes.indexOf(submittedHash)
      if (idx === -1) {
        return new Response(JSON.stringify({ valid: false, error: "invalid recovery code" }), {
          status: 200,
          headers: corsHeaders,
        })
      }

      // Remove used code and disable TOTP
      const remaining = [...rcRow.codes]
      remaining.splice(idx, 1)

      const [{ error: updErr }, { error: delErr }] = await Promise.all([
        supabaseAdmin.from("user_recovery_codes").upsert({ user_id: userId, codes: remaining }),
        supabaseAdmin.from("user_totp").delete().eq("user_id", userId),
        supabaseAdmin.from("profiles").update({ totp_enabled: false }).eq("id", userId),
      ])

      if (updErr || delErr) {
        return new Response(JSON.stringify({ error: (updErr || delErr)!.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      return new Response(JSON.stringify({ valid: true, remaining: remaining.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // --- VERIFY: verify code against stored secret
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
      if (!result.valid) {
        return new Response(JSON.stringify({ valid: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      // Mark this session verified (L1)
      await markSessionVerified(supabaseAdmin, userId, sid, "totp", remember === true)

      // Trust this device (per-device grace) when the user opted in
      let deviceExpiresAt: string | null = null
      if (remember === true && deviceToken) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("mfa_validity_days")
          .eq("id", userId)
          .single()
        const validityDays = Math.max(0, prof?.mfa_validity_days ?? 7)
        if (validityDays > 0) {
          deviceExpiresAt = new Date(Date.now() + validityDays * 86400_000).toISOString()
          const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null
          await supabaseAdmin
            .from("user_trusted_devices")
            .upsert({
              user_id: userId,
              device_id: deviceToken,
              device_name: deviceName || null,
              device_info: { ip },
              expires_at: deviceExpiresAt,
            }, { onConflict: "user_id,device_id" })
        }
      }

      return new Response(JSON.stringify({ valid: true, deviceExpiresAt }), {
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
