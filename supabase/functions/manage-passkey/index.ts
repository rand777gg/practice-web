import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@10.0.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

/** Convert Uint8Array to base64url string */
function b64url(buf: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Convert base64url string to Uint8Array */
function b64urlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const pad = base64.length % 4 === 3 ? "=" : base64.length % 4 === 2 ? "==" : ""
  const bin = atob(base64 + pad)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}

/** Recursively walk an object and convert any Uint8Array values to base64url */
function serializeForClient(val: unknown): unknown {
  if (val instanceof Uint8Array) return b64url(val)
  if (val && typeof val === "object") {
    if (Array.isArray(val)) return val.map(serializeForClient)
    const obj: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      obj[k] = serializeForClient(v)
    }
    return obj
  }
  return val
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
): Promise<void> {
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

  if (remember && validityDays > 0) {
    await supabaseAdmin
      .from("profiles")
      .update({ mfa_grace_until: expiresAt })
      .eq("id", userId)
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
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
    const body = await req.json()
    const { action } = body

    if (!action) {
      return new Response(JSON.stringify({ error: "missing action" }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const origin = req.headers.get("origin") || `https://${Deno.env.get("SUPABASE_URL")!.split("://")[1]}`
    const rpId = new URL(origin).hostname
    const rpName = "Practice Web"

    // ============================================================
    // REGISTER: generate options
    // ============================================================
    if (action === "register-begin") {
      // Fetch existing credentials to exclude from re-registration
      // credential_id is already stored as base64url — server expects base64url strings
      const { data: existing } = await supabaseAdmin
        .from("passkey_credentials")
        .select("credential_id")
        .eq("user_id", userId)

      const excludeCredentials = (existing || []).map((c) => ({
        id: c.credential_id,
        type: "public-key" as const,
        transports: ["internal"] as AuthenticatorTransport[],
      }))

      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userID: new TextEncoder().encode(userId),
        userName: userId,
        attestationType: "none",
        excludeCredentials,
      })

      // Store challenge for later verification
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      await supabaseAdmin
        .from("auth_challenges")
        .insert({ user_id: userId, challenge: options.challenge, type: "registration", expires_at: expiresAt })

      return new Response(JSON.stringify(serializeForClient(options)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // REGISTER: verify and store credential
    // ============================================================
    if (action === "register-complete") {
      const { credential, deviceName: customDeviceName, platform } = body
      if (!credential) {
        return new Response(JSON.stringify({ error: "missing credential" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      // Get stored challenge
      const { data: challenges } = await supabaseAdmin
        .from("auth_challenges")
        .select("challenge")
        .eq("user_id", userId)
        .eq("type", "registration")
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)

      const storedChallenge = challenges?.[0]?.challenge
      if (!storedChallenge) {
        return new Response(JSON.stringify({ error: "no valid challenge found, try again" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      // Clean up used challenges
      await supabaseAdmin
        .from("auth_challenges")
        .delete()
        .eq("user_id", userId)
        .eq("type", "registration")

      let verification
      try {
        verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: storedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpId,
        })
      } catch (e) {
        return new Response(JSON.stringify({ error: `verification failed: ${e}` }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      if (!verification.verified || !verification.registrationInfo) {
        return new Response(JSON.stringify({ error: "credential not verified" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      const { credentialPublicKey, credentialID, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
      // credentialID is a base64url string (from isoBase64URL.fromBuffer internally)
      if (!credentialID || typeof credentialID !== 'string' || credentialID.length === 0) {
        return new Response(JSON.stringify({ error: "credentialID is empty, registration data corrupted" }), {
          status: 500,
          headers: corsHeaders,
        })
      }
      const pubKeyB64 = b64url(new Uint8Array(credentialPublicKey))

      // Determine device name: custom name > transport-based heuristic
      const transports = credential.response?.transports || []
      const deviceName = customDeviceName || (transports.includes("internal")
        ? "Platform Authenticator"
        : transports.includes("usb")
        ? "Security Key"
        : "Passkey")

      // Upsert to handle edge case where credential_id already exists
      const { error: upsertErr } = await supabaseAdmin
        .from("passkey_credentials")
        .upsert(
          { user_id: userId, credential_id: credentialID, public_key: pubKeyB64, counter, transports, device_name: deviceName, platform, credential_device_type: credentialDeviceType, credential_backed_up: credentialBackedUp },
          { onConflict: "credential_id", ignoreDuplicates: false },
        )

      if (upsertErr) {
        return new Response(JSON.stringify({ error: upsertErr.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      // Registering a passkey is itself a strong-auth moment — mark session verified (L1 + optional L2)
      const payload = decodeJwtPayload(token)
      const sid = (payload.session_id || payload.sid) as string || ""
      await markSessionVerified(supabaseAdmin, userId, sid, "passkey", body.remember === true)

      return new Response(JSON.stringify({ verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // AUTHENTICATE: generate options
    // ============================================================
    if (action === "authenticate-begin") {
      const { data: credentials } = await supabaseAdmin
        .from("passkey_credentials")
        .select("credential_id, transports")
        .eq("user_id", userId)

      const allowCredentials = (credentials || []).map((c) => ({
        id: c.credential_id,
        type: "public-key" as const,
        transports: c.transports || ["internal"],
      }))

      const options = await generateAuthenticationOptions({
        rpID: rpId,
        allowCredentials,
        userVerification: "preferred",
      })

      // Store challenge
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      await supabaseAdmin
        .from("auth_challenges")
        .insert({ user_id: userId, challenge: options.challenge, type: "authentication", expires_at: expiresAt })

      return new Response(JSON.stringify(serializeForClient(options)), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // AUTHENTICATE: verify assertion
    // ============================================================
    if (action === "authenticate-complete") {
      const { credential, remember, deviceToken, deviceName } = body
      if (!credential) {
        return new Response(JSON.stringify({ error: "missing credential" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      // Get stored challenge
      const { data: challenges } = await supabaseAdmin
        .from("auth_challenges")
        .select("challenge")
        .eq("user_id", userId)
        .eq("type", "authentication")
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)

      const storedChallenge = challenges?.[0]?.challenge
      if (!storedChallenge) {
        return new Response(JSON.stringify({ error: "no valid challenge found, try again" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      // Clean up used challenges
      await supabaseAdmin
        .from("auth_challenges")
        .delete()
        .eq("user_id", userId)
        .eq("type", "authentication")

      // credential.id from @simplewebauthn/browser is already base64url
      const { data: storedCreds } = await supabaseAdmin
        .from("passkey_credentials")
        .select("*")
        .eq("credential_id", credential.id)
        .limit(1)

      const storedCred = storedCreds?.[0]
      if (!storedCred) {
        return new Response(JSON.stringify({ error: "credential not found" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      let verification
      try {
        verification = await verifyAuthenticationResponse({
          response: credential,
          expectedChallenge: storedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpId,
          authenticator: {
            credentialID: storedCred.credential_id,
            credentialPublicKey: b64urlToBytes(storedCred.public_key),
            counter: storedCred.counter,
            transports: storedCred.transports || [],
          },
        })
      } catch (e) {
        return new Response(JSON.stringify({ error: `verification failed: ${e}` }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      if (!verification.verified) {
        return new Response(JSON.stringify({ error: "authentication not verified" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      // Update counter
      await supabaseAdmin
        .from("passkey_credentials")
        .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
        .eq("id", storedCred.id)

      // Supabase JWT exposes the session id as "session_id" (not "sid")
      const payload = decodeJwtPayload(token)
      const sid = (payload.session_id || payload.sid) as string || ""
      await markSessionVerified(supabaseAdmin, userId, sid, "passkey", remember === true)

      // Passkey is device-bound strong auth → trust this device automatically (per-device grace)
      if (remember === true && deviceToken) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("mfa_validity_days")
          .eq("id", userId)
          .single()
        const validityDays = Math.max(0, prof?.mfa_validity_days ?? 7)
        if (validityDays > 0) {
          const expiresAt = new Date(Date.now() + validityDays * 86400_000).toISOString()
          const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null
          await supabaseAdmin
            .from("user_trusted_devices")
            .upsert({
              user_id: userId,
              device_id: deviceToken,
              device_name: deviceName || null,
              device_info: { ip },
              expires_at: expiresAt,
            }, { onConflict: "user_id,device_id" })
        }
      }

      return new Response(JSON.stringify({ verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // CHECK-GRACE: whether user is within re-verification timeout
    // ============================================================
    if (action === "check-grace") {
      const timeoutMinutes = Math.min(Math.max(Number(body.timeoutMinutes) || 5, 5), 30)
      const { data } = await supabaseAdmin
        .from("passkey_credentials")
        .select("last_used_at")
        .eq("user_id", userId)
        .order("last_used_at", { ascending: false })
        .limit(1)

      const lastUsed = data?.[0]?.last_used_at
      if (!lastUsed) {
        return new Response(JSON.stringify({ valid: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const elapsed = Date.now() - new Date(lastUsed).getTime()
      const valid = elapsed < timeoutMinutes * 60 * 1000
      return new Response(JSON.stringify({ valid, elapsed, timeoutMinutes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // RENAME a passkey's display name
    // ============================================================
    if (action === "rename") {
      const { credentialId, name } = body
      if (!credentialId || !name) {
        return new Response(JSON.stringify({ error: "missing credentialId or name" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      const { error } = await supabaseAdmin
        .from("passkey_credentials")
        .update({ device_name: String(name).slice(0, 50) })
        .eq("id", credentialId)
        .eq("user_id", userId)

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      return new Response(JSON.stringify({ renamed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // LIST user's passkeys
    // ============================================================
    if (action === "list") {
      const { data: credentials } = await supabaseAdmin
        .from("passkey_credentials")
        .select("id, credential_id, device_name, platform, credential_device_type, credential_backed_up, transports, created_at, last_used_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      return new Response(JSON.stringify(credentials || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // DELETE a passkey
    // ============================================================
    if (action === "delete") {
      const { credentialId } = body
      if (!credentialId) {
        return new Response(JSON.stringify({ error: "missing credentialId" }), {
          status: 400,
          headers: corsHeaders,
        })
      }

      await supabaseAdmin
        .from("passkey_credentials")
        .delete()
        .eq("id", credentialId)
        .eq("user_id", userId)

      return new Response(JSON.stringify({ deleted: true }), {
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
