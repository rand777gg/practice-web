// ============================================================================
// study-room —— 自习室「打卡状态 + 提醒邮件」
// ----------------------------------------------------------------------------
// 依赖的环境变量(Supabase Dashboard → Edge Functions → study-room → Secrets):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (平台自动提供)
//   RESEND_API_KEY   Resend 发信 API Key(必填, 否则提醒邮件会报 resend_not_configured)
//   RESEND_FROM      发件人, 形如 "自习室 <reminder@你的域名>"(域名需先在 Resend 验证)
//   APP_URL          应用首页地址(拼邮件里的链接), 如 https://practice.example.com
//
// 部署:
//   supabase functions deploy study-room
//   supabase secrets set --env-file .env RESEND_API_KEY=... RESEND_FROM=... APP_URL=...
//
// 动作(action):
//   status  {roomId}            返回房间成员及每人今日打卡状态(服务端计算)
//   remind  {roomId, memberIds?} 给今日未打卡成员发提醒邮件(同人同房 2h 内限一次)
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const DAY_MS = 86400000

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

/** 取请求里的用户 JWT → user id(所有动作都要求已登录) */
async function authUserId(req: Request, supabaseAdmin: ReturnType<typeof createClient>): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

/** 北京时间(Asia/Shanghai)今天的日期 YYYY-MM-DD */
function shDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

/** 与前端 normalizeDailyTargets 保持一致的解析(旧格式兼容忽略, 走当前格式为主) */
interface DailyTarget { subjects: { subject: string; count: number }[]; deadline: string | null }

function normalizeDailyTargets(raw: string | null | undefined): DailyTarget[] {
  const arr = parseJsonArray<Record<string, unknown>>(raw)
  const out: DailyTarget[] = []
  for (const t of arr) {
    const subjects = t?.subjects
    if (!Array.isArray(subjects) || subjects.length === 0) continue
    const first = subjects[0]
    if (!first || typeof first !== "object" || !("subject" in first)) continue
    const parsed: { subject: string; count: number }[] = []
    for (const s of subjects as { subject?: unknown; count?: unknown }[]) {
      const subject = typeof s.subject === "string" ? s.subject.trim() : ""
      if (!subject) continue
      parsed.push({ subject, count: typeof s.count === "number" && s.count > 0 ? Math.floor(s.count) : 5 })
    }
    if (parsed.length === 0) continue
    out.push({
      subjects: parsed,
      deadline: typeof t.deadline === "string" ? t.deadline : null,
    })
  }
  return out
}

function subjectKey(s: string) {
  return s || "Other"
}

type ProgressRow = { subject: string; total: number; done_all: number; done_today: number }

/** 调 DB 的 get_subject_progress(与前端 PlanProgress 同口径) */
async function subjectProgress(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  planResetAt: string | null,
  todaySince: string,
  subjects: string[] | null,
  subjectResets: Record<string, string> | null,
): Promise<ProgressRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_subject_progress", {
    p_user_id: userId,
    p_plan_reset_at: planResetAt,
    p_today_since: todaySince,
    p_subjects: subjects && subjects.length > 0 ? subjects : null,
    p_subject_resets: subjectResets,
  })
  if (error) {
    console.error("get_subject_progress failed", userId, error.message)
    return []
  }
  return (data ?? []) as ProgressRow[]
}

type ProfileRow = {
  nickname: string | null
  deadline: string | null
  plan_subjects: string | null
  daily_targets: string | null
  plan_reset_at: string | null
  daily_reset_at: string | null
  subject_reset_at: Record<string, string> | null
}

export interface MemberStatus {
  user_id: string
  nickname: string
  is_owner: boolean
  /** 是否设置了目标(长线 deadline 或每日目标); 没设置不参与打卡/提醒 */
  has_goal: boolean
  done: boolean
  today_goal: number
  today_done: number
  last_reminded_at: string | null
}

/**
 * 计算单人“今日是否完成计划目标”。
 * 口径(与前端的计划进度一致):
 *  - 每日目标(daily_targets): 每个目标按学科配额, 今日完成数按学科封顶相加
 *  - 长线截止日(deadline):    今日应做 = ceil(剩余量 / 剩余天数)
 *  - 都配置时全部满足才算打卡; 都没配置 => has_goal=false
 */
async function computeMemberStatus(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  ownerId: string,
): Promise<{ profile: ProfileRow | null; status: Omit<MemberStatus, "user_id" | "nickname" | "is_owner"> }> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("nickname, deadline, plan_subjects, daily_targets, plan_reset_at, daily_reset_at, subject_reset_at")
    .eq("id", userId)
    .single()
  const p = (profile ?? null) as ProfileRow | null

  const empty = {
    profile: p,
    status: {
      has_goal: false,
      done: false,
      today_goal: 0,
      today_done: 0,
      last_reminded_at: null,
    },
  }
  if (!p) return empty

  const todaySince = `${shDate()}T00:00:00+08:00`
  const subjectResets = p.subject_reset_at ?? null
  const planSubjects = parseJsonArray<string>(p.plan_subjects)
  const dailyTargets = normalizeDailyTargets(p.daily_targets)
  const hasDeadline = !!p.deadline
  const hasTargets = dailyTargets.length > 0
  if (!hasDeadline && !hasTargets) return empty

  const components: { ok: boolean }[] = []
  let longGoal = 0
  let longDone = 0

  if (hasDeadline) {
    const rows = await subjectProgress(
      supabaseAdmin,
      userId,
      p.plan_reset_at ?? null,
      todaySince,
      planSubjects.length > 0 ? planSubjects : null,
      subjectResets,
    )
    let scopeTotal = 0
    let scopeDoneAll = 0
    let scopeDoneToday = 0
    for (const r of rows) {
      scopeTotal += Number(r.total)
      scopeDoneAll += Number(r.done_all)
      scopeDoneToday += Number(r.done_today)
    }
    const daysLeft = Math.max(
      Math.ceil((Date.parse(`${p.deadline}T23:59:59+08:00`) - Date.now()) / DAY_MS),
      1,
    )
    longGoal = Math.ceil(Math.max(scopeTotal - scopeDoneAll, 0) / daysLeft)
    longDone = scopeDoneToday
    components.push({ ok: longDone >= longGoal })
  }

  let targetGoal = 0
  let targetDone = 0
  if (hasTargets) {
    const targetSubjects = [...new Set(dailyTargets.flatMap((t) => t.subjects.map((s) => s.subject)))]
    const rows = await subjectProgress(
      supabaseAdmin,
      userId,
      p.daily_reset_at ?? null,
      todaySince,
      targetSubjects.length > 0 ? targetSubjects : null,
      subjectResets,
    )
    const subjTotal = new Map<string, number>()
    const subjDoneAll = new Map<string, number>()
    const subjDoneToday = new Map<string, number>()
    for (const r of rows) {
      subjTotal.set(r.subject, Number(r.total))
      subjDoneAll.set(r.subject, Number(r.done_all))
      subjDoneToday.set(r.subject, Number(r.done_today))
    }

    let computedGoal = 0
    for (const target of dailyTargets) {
      if (!target.deadline) continue
      const daysLeft = Math.max(
        Math.ceil((Date.parse(`${target.deadline}T23:59:59+08:00`) - Date.now()) / DAY_MS),
        1,
      )
      for (const s of target.subjects) {
        const key = subjectKey(s.subject)
        const total = subjTotal.get(key) ?? 0
        const doneSubj = subjDoneAll.get(key) ?? 0
        computedGoal += Math.ceil(Math.max(total - doneSubj, 0) / daysLeft)
      }
    }
    const manualTotal = dailyTargets
      .filter((t) => !t.deadline)
      .reduce((sum, t) => sum + t.subjects.reduce((acc, s) => acc + s.count, 0), 0)
    targetGoal = computedGoal + manualTotal

    targetDone = dailyTargets.reduce((sum, t) => {
      let entry = 0
      for (const s of t.subjects) {
        const key = subjectKey(s.subject)
        entry += Math.min(subjDoneToday.get(key) ?? 0, s.count)
      }
      return sum + entry
    }, 0)
    components.push({ ok: targetGoal === 0 || targetDone >= targetGoal })
  }

  const done = components.length > 0 && components.every((c) => c.ok)
  return {
    profile: p,
    status: {
      has_goal: true,
      done,
      today_goal: hasTargets && targetGoal > 0 ? targetGoal : longGoal,
      today_done: hasTargets && targetGoal > 0 ? Math.min(targetDone, targetGoal) : longDone,
      last_reminded_at: null,
    },
  }
}

async function sendResendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  const from = Deno.env.get("RESEND_FROM")
  if (!apiKey || !from) return false
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    })
    if (!res.ok) {
      console.error("resend failed", res.status, await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error("resend error", String(e))
    return false
  }
}

async function loadRoomMembers(
  supabaseAdmin: ReturnType<typeof createClient>,
  roomId: string,
): Promise<{ id: string; user_id: string; joined_at: string }[]> {
  const { data } = await supabaseAdmin
    .from("study_room_members")
    .select("id, user_id, joined_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true })
  return (data ?? []) as { id: string; user_id: string; joined_at: string }[]
}

async function recentReminders(
  supabaseAdmin: ReturnType<typeof createClient>,
  roomId: string,
): Promise<Map<string, string>> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data } = await supabaseAdmin
    .from("study_room_reminders")
    .select("user_id, reminded_at")
    .eq("room_id", roomId)
    .gte("reminded_at", since)
  const map = new Map<string, string>()
  for (const r of (data ?? []) as { user_id: string; reminded_at: string }[]) {
    if (!map.has(r.user_id)) map.set(r.user_id, r.reminded_at)
  }
  return map
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  let callerId: string
  try {
    const uid = await authUserId(req, supabaseAdmin)
    if (!uid) return json({ error: "unauthorized" }, 401)
    callerId = uid
  } catch {
    return json({ error: "unauthorized" }, 401)
  }

  let body: { action?: string; roomId?: string; memberIds?: string[] } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: "bad_json" }, 400)
  }

  const roomId = typeof body.roomId === "string" ? body.roomId : ""
  if (!roomId) return json({ error: "room_required" }, 400)

  const { data: room } = await supabaseAdmin
    .from("study_rooms")
    .select("id, owner_id, name, description, invite_code")
    .eq("id", roomId)
    .single()
  if (!room) return json({ error: "room_not_found" }, 404)

  const ownerId = room.owner_id as string
  const isMember = await supabaseAdmin
    .from("study_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", callerId)
    .maybeSingle()
  const canView = ownerId === callerId || !!isMember.data
  if (!canView) return json({ error: "forbidden" }, 403)

  // ---------- status ----------
  if (body.action === "status") {
    const members = await loadRoomMembers(supabaseAdmin, roomId)
    const recent = await recentReminders(supabaseAdmin, roomId)

    const results = await Promise.all(
      members.map(async (m) => {
        const { profile, status } = await computeMemberStatus(supabaseAdmin, m.user_id, ownerId)
        const nickname =
          profile?.nickname && profile.nickname.trim() !== ""
            ? profile.nickname
            : `用户${m.user_id.slice(0, 6)}`
        return {
          user_id: m.user_id,
          nickname,
          is_owner: m.user_id === ownerId,
          has_goal: status.has_goal,
          done: status.done,
          today_goal: status.today_goal,
          today_done: status.today_done,
          last_reminded_at: recent.get(m.user_id) ?? null,
        } as MemberStatus
      }),
    )

    const sorted = [...results].sort((a, b) => {
      if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1
      return 0
    })

    return json({
      room: {
        id: room.id,
        name: room.name,
        description: room.description,
        invite_code: room.invite_code,
        owner_id: ownerId,
      },
      date: shDate(),
      members: sorted,
    })
  }

  // ---------- remind ----------
  if (body.action === "remind") {
    const apiKey = Deno.env.get("RESEND_API_KEY")
    const from = Deno.env.get("RESEND_FROM")
    if (!apiKey || !from) {
      return json({ error: "resend_not_configured" }, 500)
    }

    const members = await loadRoomMembers(supabaseAdmin, roomId)
    const requested = Array.isArray(body.memberIds) && body.memberIds.length > 0
      ? new Set(body.memberIds)
      : null
    const recent = await recentReminders(supabaseAdmin, roomId)
    const appUrl = Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || ""

    const sent: { user_id: string; nickname: string }[] = []
    const skipped: { user_id: string; reason: string }[] = []
    const todayStr = shDate()
    const roomLink = appUrl ? `${appUrl}/study-rooms?room=${roomId}` : "/study-rooms"

    for (const m of members) {
      if (requested && !requested.has(m.user_id)) continue
      const { profile, status } = await computeMemberStatus(supabaseAdmin, m.user_id, ownerId)
      if (!profile) {
        skipped.push({ user_id: m.user_id, reason: "no_profile" })
        continue
      }
      if (status.done) {
        skipped.push({ user_id: m.user_id, reason: "already_done" })
        continue
      }
      if (!status.has_goal) {
        skipped.push({ user_id: m.user_id, reason: "no_goal" })
        continue
      }
      if (recent.has(m.user_id)) {
        skipped.push({ user_id: m.user_id, reason: "throttled" })
        continue
      }
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id)
      const email = userData?.user?.email
      if (!email) {
        skipped.push({ user_id: m.user_id, reason: "no_email" })
        continue
      }
      const nickname =
        profile.nickname && profile.nickname.trim() !== ""
          ? profile.nickname
          : `用户${m.user_id.slice(0, 6)}`
      const subject = `【自习室】「${room.name}」今日打卡提醒`
      const text =
        `${nickname},你好!\n\n` +
        `你在自习室「${room.name}」里今天的计划目标还没有完成。\n` +
        `今日进度: ${Math.min(status.today_done, status.today_goal)} / ${status.today_goal} 题\n\n` +
        `打开应用完成今天的练习打卡吧: ${roomLink}\n` +
        (todayStr ? `今天是 ${todayStr}。` : "") +
        `\n如果你已经完成, 请忽略这封邮件。`

      const ok = await sendResendEmail(email, subject, text)
      if (!ok) {
        skipped.push({ user_id: m.user_id, reason: "send_failed" })
        continue
      }
      await supabaseAdmin
        .from("study_room_reminders")
        .insert({ room_id: roomId, user_id: m.user_id })
      sent.push({ user_id: m.user_id, nickname })
    }

    return json({ sent, skipped })
  }

  return json({ error: "unknown_action" }, 400)
})
