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

    // --- REGISTER: generate options ---
    if (action === "register-begin") {
      const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userID: new TextEncoder().encode(userId),
        userName: userId,
        attestationType: "none",
        excludeCredentials: [],
      })

      // Store challenge (generated internally by the library) for verification
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      await supabaseAdmin
        .from("auth_challenges")
        .insert({ user_id: userId, challenge: options.challenge, type: "registration", expires_at: expiresAt })

      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // --- REGISTER: verify and store credential ---
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

      // Determine device name from transports
      const transports = credential.response?.transports || []
      const deviceName = transports.includes("internal")
        ? "Platform Authenticator"
        : transports.includes("usb")
        ? "Security Key"
        : "Passkey"

      const { error: insertErr } = await supabaseAdmin
        .from("passkey_credentials")
        .insert({
          user_id: userId,
          credential_id: btoa(String.fromCharCode(...new Uint8Array(credentialID))),
          public_key: btoa(String.fromCharCode(...new Uint8Array(credentialPublicKey))),
          counter,
          transports,
          device_name: deviceName,
        })

      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: corsHeaders,
        })
      }

      return new Response(JSON.stringify({ verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // --- AUTHENTICATE: generate options ---
    if (action === "authenticate-begin") {
      // Get user's registered credentials
      const { data: credentials } = await supabaseAdmin
        .from("passkey_credentials")
        .select("credential_id, transports")
        .eq("user_id", userId)

      const allowCredentials = (credentials || []).map((c) => ({
        id: Uint8Array.from(atob(c.credential_id), (c) => c.charCodeAt(0)),
        type: "public-key" as const,
        transports: c.transports || ["internal"],
      }))

      const options = await generateAuthenticationOptions({
        rpID: rpId,
        allowCredentials,
        userVerification: "preferred",
      })

      // Store challenge (generated internally by the library)
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
      await supabaseAdmin
        .from("auth_challenges")
        .insert({ user_id: userId, challenge: options.challenge, type: "authentication", expires_at: expiresAt })

      return new Response(JSON.stringify(options), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // --- AUTHENTICATE: verify assertion ---
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

      // Look up the credential
      const credentialIdB64 = btoa(String.fromCharCode(...new Uint8Array(credential.id)))
      const { data: storedCreds } = await supabaseAdmin
        .from("passkey_credentials")
        .select("*")
        .eq("credential_id", credentialIdB64)
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
            publicKey: Uint8Array.from(atob(storedCred.public_key), (c) => c.charCodeAt(0)),
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

    // --- LIST user's passkeys ---
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

    // --- DELETE a passkey ---
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
