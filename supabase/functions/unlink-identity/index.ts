// Supabase Edge Function: unlink-identity
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { provider } = await req.json()
    if (!provider) {
      return new Response(JSON.stringify({ error: 'Missing provider' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const targetIdentity = user.identities?.find((i: any) => i.provider === provider)
    if (!targetIdentity) {
      return new Response(JSON.stringify({ error: 'Identity not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!user.identities || user.identities.length <= 1) {
      return new Response(JSON.stringify({ error: 'Cannot unlink the only login method' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Delete the identity directly
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}/identities/${targetIdentity.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })

    if (!res.ok) {
      // Fallback: try PUT with remaining identities
      const remainingIdentities = user.identities
        .filter((i: any) => i.provider !== provider)
        .map((i: any) => ({
          id: i.id,
          identity_id: i.id,
          user_id: user.id,
          identity_data: i.identity_data || {},
          provider: i.provider,
          email: i.identity_data?.email || user.email || '',
          last_sign_in_at: i.last_sign_in_at || new Date().toISOString(),
          created_at: i.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))

      const putRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identities: remainingIdentities }),
      })

      if (!putRes.ok) {
        const err = await putRes.text()
        return new Response(JSON.stringify({ error: `DELETE failed, PUT also failed: ${err}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
