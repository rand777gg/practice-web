// ============================================================================
// notify-exam —— 预约考试「到点提醒」服务端定时任务
// ----------------------------------------------------------------------------
// 作用: 每分钟扫一次 exam_schedules, 凡满足「当前时刻(按该预约记录的 IANA 时区)
//   已是开考时刻 && 当天还没推送过」的, 向该用户所有 push_subscriptions 推送
//   一条系统通知(Web Push), 点击后回到 /exam 开始考试。浏览器/手机关闭也能收到。
//   若预约开启了「定时邮件通知」(email_enabled && email_time), 到达用户自选的
//   email_time 后另发一封 Resend 提醒邮件(与 Web Push 相互独立, 每天各发一次)。
//
// 依赖的环境变量(Supabase Dashboard → Edge Functions → notify-exam → Secrets):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   (平台自动提供, 无需手工设置)
//   CRON_SECRET         任意随机串, 与下方 cron.schedule 的请求头保持一致
//   VAPID_SUBJECT       mailto: 邮箱(推送服务需要), 如 mailto:you@example.com
//   VAPID_PUBLIC_KEY    Web Push 公钥(URL-safe base64, 前端 VITE_VAPID_PUBLIC_KEY 同值)
//   VAPID_PRIVATE_KEY   Web Push 私钥(URL-safe base64, 只放服务端, 勿进前端)
//   RESEND_API_KEY      定时邮件用 Resend API Key(未配置则自动跳过邮件, 不影响推送)
//   RESEND_FROM         发件人, 形如 "刷题网 <reminder@你的域名>"
//   APP_URL             应用首页地址, 用于拼邮件里的链接
//
// 部署:
//   supabase functions deploy notify-exam
//   supabase secrets set CRON_SECRET=<随机串> VAPID_SUBJECT=mailto:... \
//     VAPID_PUBLIC_KEY=<公钥> VAPID_PRIVATE_KEY=<私钥>
//
// 定时注册(二选一):
//   ① Dashboard 扩展若未启用 pg_cron / pg_net, 先去
//      Database → Extensions 启用 pg_cron、pg_net(免费版也可)。
//   ② 然后执行(每分钟调一次; 请把 URL / SECRET 换成自己的):
//   select cron.schedule(
//     'exam-notify',
//     '* * * * *',
//     $cron$
//       select net.http_post(
//         url   := 'https://<project-ref>.supabase.co/functions/v1/notify-exam',
//         headers := jsonb_build_object('content-type','application/json','x-cron-secret','<你的 CRON_SECRET>'),
//         body  := '{}'
//       );
//     $cron$
//   );
//
// 没有 pg_cron 时, 也可用仓库里的 GitHub Actions 定时工作流每 5 分钟
// curl 该 URL(带 x-cron-secret), 效果等价(到点提醒最多晚 5 分钟)。
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

type ScheduleRow = {
  id: string
  user_id: string
  name: string
  days_of_week: number[]
  fire_time: number
  tz: string
  last_notify_date: string | null
  template: { name?: string }
  email_enabled: boolean
  email_time: number | null
  email_send_date: string | null
  last_email_date: string | null
}

const WEEKDAY_KEY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/** 取某时区的"墙上时间"(日历日期/星期/当日分钟) */
function wallClock(tz: string, now: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`
  return {
    dateKey,
    weekday: WEEKDAY_KEY[parts.weekday] ?? 7,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function minutesToTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

async function sendPush(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  payload: { title: string; body: string; url: string },
) {
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
  if (!subs || subs.length === 0) return 0

  let sent = 0
  const dead: string[] = []
  for (const sub of subs as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 600, urgency: "high" },
      )
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0
      if (status === 404 || status === 410) {
        dead.push(sub.id)
      } else {
        console.error("push failed", sub.id, String(e))
      }
    }
  }
  if (dead.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", dead)
  }
  return sent
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    })
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  }
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: corsHeaders })

  // ---- 测试动作: 登录用户给自己发一封测试邮件(与正式提醒同款排版) ----
  const body = await req.json().catch(() => ({})) as {
    action?: string
    name?: string
    sendDate?: string
    sendTime?: string
    startTime?: string
  }
  if (body.action === "test_email") {
    const auth = req.headers.get("authorization") ?? ""
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
    const { data: userData } = token
      ? await supabaseAdmin.auth.getUser(token)
      : { data: null }
    const email = userData?.user?.email
    if (!email) return json({ error: "unauthorized" }, 401)

    const apiKey = Deno.env.get("RESEND_API_KEY")
    const from = Deno.env.get("RESEND_FROM")
    if (!apiKey || !from) return json({ error: "resend_not_configured" }, 500)

    const name = body.name || "预约考试"
    const whenLabel = body.sendDate
      ? `${body.sendDate} ${body.sendTime || "--:--"}`
      : `每周重复日 ${body.sendTime || "--:--"}`
    const subject = `【预约考试·测试】${name}`
    const text =
      `这是一封测试邮件, 用于确认预约考试的邮件提醒能正常送达。\n\n` +
      `考试: ${name}\n` +
      `计划发送时间: ${whenLabel}\n` +
      `开考时间: ${body.startTime || "--:--"}\n\n` +
      `收到即表示发信链路正常, 正式到点提醒将按此格式自动发送。`

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject, text }),
      })
      const txt = await res.text()
      if (!res.ok) {
        console.error("exam email test failed", res.status, txt)
        return json({ ok: false, error: "resend_error", detail: txt }, 500)
      }
      return json({ ok: true })
    } catch (e) {
      console.error("exam email test error", String(e))
      return json({ ok: false, error: String(e) }, 500)
    }
  }

  const expected = Deno.env.get("CRON_SECRET")
  if (!expected || req.headers.get("x-cron-secret") !== expected) {
    return json({ error: "unauthorized" }, 401)
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  )

  const now = new Date()
  const { data: schedules } = await supabaseAdmin
    .from("exam_schedules")
    .select("id, user_id, name, days_of_week, fire_time, tz, last_notify_date, template, email_enabled, email_time, email_send_date, last_email_date")
    .eq("enabled", true)
    .limit(200)

  let notified = 0
  let emailed = 0
  let scanned = 0
  for (const raw of (schedules ?? []) as unknown as ScheduleRow[]) {
    const wall = wallClock(raw.tz || "Asia/Shanghai", now)
    const dueDay = (raw.days_of_week ?? []).includes(wall.weekday)
    const emailEnabled = raw.email_enabled && raw.email_time != null
    // 邮件触发日: 用户选了发送日期 → 只在那天发; 没选 → 兼容旧行为(每周重复日)
    const emailDay =
      emailEnabled && (raw.email_send_date ? wall.dateKey === raw.email_send_date : dueDay)
    const pushDue =
      dueDay && wall.minutes >= raw.fire_time && raw.last_notify_date !== wall.dateKey
    const emailDue =
      emailDay && wall.minutes >= raw.email_time! && raw.last_email_date !== wall.dateKey
    if (!pushDue && !emailDue) continue
    scanned++

    // ---- 到点 Web Push(开考时刻 fire_time) ----
    if (pushDue) {
      // 原子认领: 只有更新成功(=今天还没推过)的这一方才真正发送, 避免多实例重复
      const { data: claimed } = await supabaseAdmin
        .from("exam_schedules")
        .update({ last_notify_date: wall.dateKey })
        .eq("id", raw.id)
        .eq("user_id", raw.user_id)
        .eq("enabled", true)
        .or(`last_notify_date.is.null,last_notify_date.neq.${wall.dateKey}`)
        .select("id")
      if (claimed && claimed.length > 0) {
        const body = `${raw.template?.name ?? "考试"} · ${minutesToTime(raw.fire_time)} 到点`
        notified += await sendPush(supabaseAdmin, raw.user_id, {
          title: raw.name || "预约考试",
          body,
          url: "/exam?from=push",
        })
      }
    }

    // ---- 定时邮件通知(发送日期/时间由用户自选; 每个业务日只发一次) ----
    if (emailDue) {
      const { data: claimedMail } = await supabaseAdmin
        .from("exam_schedules")
        .update({ last_email_date: wall.dateKey })
        .eq("id", raw.id)
        .eq("user_id", raw.user_id)
        .eq("enabled", true)
        .or(`last_email_date.is.null,last_email_date.neq.${wall.dateKey}`)
        .select("id")
      if (!claimedMail || claimedMail.length === 0) continue

      const apiKey = Deno.env.get("RESEND_API_KEY")
      const from = Deno.env.get("RESEND_FROM")
      if (!apiKey || !from) {
        console.error("exam email skipped: RESEND_API_KEY / RESEND_FROM not configured")
        continue
      }
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(raw.user_id)
      if (!user?.email) continue
      const appUrl = Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || ""
      const startAt = minutesToTime(raw.fire_time)
      const whenLabel = raw.email_send_date
        ? `${raw.email_send_date} ${minutesToTime(raw.email_time ?? raw.fire_time)}`
        : `每周重复日 ${minutesToTime(raw.email_time ?? raw.fire_time)}`
      const subject = `【预约考试提醒】${raw.name || "考试"}`
      const text =
        `你好!\n\n` +
        `你预约的考试「${raw.name || "考试"}」(${raw.template?.name ?? ""}) 将于 ${startAt} 开始。\n` +
        `本条为定时邮件提醒(计划发送时间: ${whenLabel})。\n` +
        `到点后应用会为你自动组卷并计时, 别错过这场练习。\n\n` +
        `前往考试: ${appUrl ? `${appUrl}/exam` : "/exam"}\n\n` +
        `如果已经考完, 请忽略这封邮件。`
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from, to: [user.email], subject, text }),
        })
        if (res.ok) {
          emailed++
        } else {
          console.error("exam email failed", res.status, await res.text())
        }
      } catch (e) {
        console.error("exam email error", String(e))
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, scanned, notified, emailed }), {
    headers: { "Content-Type": "application/json" },
  })
})
