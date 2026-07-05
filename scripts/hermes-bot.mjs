// Hermes Agent Bot — runs in GitHub Actions, processes one @bot command per invocation
// GH Actions: every 2 min cron. Local: node scripts/hermes-bot.mjs --once

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const FEISHU_HOOK = process.env.FEISHU_BOT_HOOK || ''
const CHAT_ID = process.env.CHAT_ID || 'oc_f4d1b1b0478f4b910038a0bd6311a5fe'

if (!DEEPSEEK_KEY) { console.error('Set DEEPSEEK_API_KEY'); process.exit(1) }

// ---- Persist last processed message ID ----
const STATE_DIR = join(process.env.GITHUB_WORKSPACE || process.cwd(), '.hermes-state')
const STATE_FILE = join(STATE_DIR, 'last-msg-id.txt')

function getLastId() {
  try { return readFileSync(STATE_FILE, 'utf-8').trim() } catch { return '' }
}
function saveLastId(id) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, id)
}

// ---- DeepSeek ----
async function chat(system, prompt, maxTokens = 2000) {
  const r = await fetch(`${DEEPSEEK_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.3 }),
  })
  const j = await r.json()
  return j.choices?.[0]?.message?.content || '分析失败'
}

// ---- Reply via Feishu webhook ----
async function reply(text) {
  if (!FEISHU_HOOK) { console.log('No webhook, skip reply'); return }
  await fetch(FEISHU_HOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: text.slice(0, 4000) } }),
  })
}

// ---- Commands ----
async function prReview() {
  const gh = process.env.GITHUB_TOKEN
  const r = gh ? await fetch('https://api.github.com/repos/rand777gg/react-practice-web/pulls?state=all&per_page=8&sort=updated', {
    headers: { Authorization: `Bearer ${gh}`, 'User-Agent': 'hermes' },
  }).catch(() => null) : null
  const prs = r ? await r.json() : []
  const s = Array.isArray(prs) && prs.length ? prs.map(p => `#${p.number} ${p.title} (${p.user?.login}) — ${p.state}`).join('\n') : '无 PR 活动'
  return chat('代码审查助手。审查 PR 安全/性能/架构。中文500字内。', 'PR 列表:\n' + s)
}

async function audit() {
  return chat('过度工程审计专家。列出前5个可删除/简化的代码，每条2行。', '审计 react-practice-web (React19+TS+shadcn/ui+Supabase 题库)')
}

async function security() {
  return chat('安全审计专家。XSS/CSRF/泄露/依赖/认证。中文500字内。', '审计 react-practice-web (React19+Supabase,anon key暴露,R2,edge functions)')
}

const HELP = 'Hermes Agent\n/pr-review — PR审查\n/audit — 过度工程审计\n/security — 安全审计\n/help — 帮助'

function parseCmd(text) {
  if (text.includes('/pr-review')) return prReview
  if (text.includes('/audit')) return audit
  if (text.includes('/security')) return security
  if (text.includes('/help')) return () => HELP
  return null
}

// ---- One-shot: check latest messages, process the newest matching one ----
async function once() {
  const lastId = getLastId()
  let newLastId = lastId

  try {
    const raw = execSync(`lark-cli im +chat-messages-list --chat-id ${CHAT_ID} --page-size 10 --as user`, {
      encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const data = JSON.parse(raw)
    const msgs = data?.data?.messages
    if (!msgs?.length) { console.log('No messages'); return }

    // Find the newest unprocessed @bot message
    let target = null
    for (const m of msgs) {
      if (!m.message_id || m.message_id <= lastId) continue
      if (newLastId < m.message_id) newLastId = m.message_id
      if (m.sender?.id?.startsWith('cli_')) continue
      if (m.msg_type !== 'text') continue
      const text = m.content || ''
      if (!text.includes('<at') || !text.includes('cli_')) continue
      target = m
    }

    if (target) {
      console.log(`Processing: ${target.content.slice(0, 80)}`)
      const handler = parseCmd(target.content)
      if (handler) {
        const result = await handler()
        await reply(result)
        console.log('Replied')
      }
    } else {
      console.log('No new command')
    }

    saveLastId(newLastId)
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString()
    console.error(msg.slice(0, 200))
    saveLastId(newLastId || lastId)
  }
}

await once()
