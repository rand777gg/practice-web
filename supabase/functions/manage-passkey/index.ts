import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "https://esm.sh/@simplewebauthn/server@10.0.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

/** Convert Uint8Array to base64url string — JSON.stringify can't handle binary */
function b64url(buf: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, userId } = body

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
      const { credential } = body
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

      const { credentialPublicKey, credentialID, counter } = verification.registrationInfo
      const credIdB64 = b64url(new Uint8Array(credentialID))
      const pubKeyB64 = b64url(new Uint8Array(credentialPublicKey))

      // Determine device name from transports
      const transports = credential.response?.transports || []
      const deviceName = transports.includes("internal")
        ? "Platform Authenticator"
        : transports.includes("usb")
        ? "Security Key"
        : "Passkey"

      // Upsert to handle edge case where credential_id already exists
      const { error: upsertErr } = await supabaseAdmin
        .from("passkey_credentials")
        .upsert(
          { user_id: userId, credential_id: credIdB64, public_key: pubKeyB64, counter, transports, device_name: deviceName },
          { onConflict: "credential_id", ignoreDuplicates: false },
        )

      if (upsertErr) {
        return new Response(JSON.stringify({ error: upsertErr.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

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
      const { credential } = body
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
          credential: {
            id: storedCred.credential_id,
            publicKey: Uint8Array.from(atob(storedCred.public_key), (ch) => ch.charCodeAt(0)),
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

      return new Response(JSON.stringify({ verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ============================================================
    // LIST user's passkeys
    // ============================================================
    if (action === "list") {
      const { data: credentials } = await supabaseAdmin
        .from("passkey_credentials")
        .select("id, credential_id, device_name, transports, created_at, last_used_at")
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
