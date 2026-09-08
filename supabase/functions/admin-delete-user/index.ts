// Supabase Edge Function: admin-delete-user
// Admin-only: permanently deletes a user AND every row related to them.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

// Every public table that can own rows of a user, with its ownership column.
// Explicit cleanup is used so nothing is left behind even if a FK/cascade is ever dropped.
const USER_TABLES: [table: string, column: string][] = [
  ['user_answers', 'user_id'],
  ['favorites', 'user_id'],
  ['exam_sessions', 'user_id'],
  ['parse_history', 'user_id'],
  ['question_banks', 'created_by'],
  ['user_daily_stats', 'user_id'],
  ['practice_sequential_state', 'user_id'],
  ['user_excluded_questions', 'user_id'],
  ['qr_login_tokens', 'user_id'],
  ['user_preferences', 'user_id'],
  ['user_trusted_devices', 'user_id'],
  ['passkey_credentials', 'user_id'],
  ['auth_challenges', 'user_id'],
  ['auth_log', 'user_id'],
  ['user_totp', 'user_id'],
  ['submissions', 'user_id'],
  ['user_recovery_codes', 'user_id'],
  ['user_mfa_sessions', 'user_id'],
  ['exam_templates', 'user_id'],
  ['exam_schedules', 'user_id'],
  ['push_subscriptions', 'user_id'],
  ['study_room_members', 'user_id'],
  ['study_room_reminders', 'user_id'],
  ['study_rooms', 'owner_id'],
]

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Caller must be a logged-in admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(token)
    if (callerError || !caller) return json({ error: 'unauthorized' }, 401)
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).maybeSingle()
    if (callerProfile?.role !== 'admin') return json({ error: 'forbidden' }, 403)

    const { user_id } = await req.json()
    if (!user_id) return json({ error: 'missing_user_id' }, 400)
    if (user_id === caller.id) return json({ error: 'cannot_delete_self' }, 400)

    const { data: targetProfile } = await supabaseAdmin
      .from('profiles').select('id').eq('id', user_id).maybeSingle()
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(user_id)
    if (!targetProfile && !targetUser?.user) return json({ error: 'user_not_found' }, 404)

    // 1. Wipe every user-owned row (idempotent)
    for (const [table, column] of USER_TABLES) {
      const { error } = await supabaseAdmin.from(table).delete().eq(column, user_id)
      if (error) throw error
    }

    // 2. Delete the profile row (cascades to anything still referencing it)
    if (targetProfile) {
      const { error } = await supabaseAdmin.from('profiles').delete().eq('id', user_id)
      if (error) throw error
    }

    // 3. Remove the auth account (identities / sessions / 2FA / ...)
    if (targetUser?.user) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id)
      if (error) throw error
    }

    return json({ success: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
