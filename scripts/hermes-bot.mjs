// Hermes Agent Bot — GitHub Actions cron, polls Feishu for @bot commands
// Uses Feishu REST API directly (no lark-cli dependency required)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const LARK_APP_ID = process.env.LARK_APP_ID || ''
const LARK_APP_SECRET = process.env.LARK_APP_SECRET || ''
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const FEISHU_HOOK = process.env.FEISHU_BOT_HOOK || ''
const CHAT_ID = process.env.CHAT_ID || 'oc_f4d1b1b0478f4b910038a0bd6311a5fe'

const STATE_DIR = join(process.env.GITHUB_WORKSPACE || process.cwd(), '.hermes-state')
const STATE_FILE = join(STATE_DIR, 'last-msg-id.txt')

function getLastId() { try { return readFileSync(STATE_FILE, 'utf-8').trim() } catch { return '' } }
function saveLastId(id) { if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(STATE_FILE, id) }

// ---- Feishu API ----
let _token = null, _tokenExp = 0
async function getToken() {
  if (_token && Date.now() < _tokenExp) return _token
  const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: LARK_APP_ID, app_secret: LARK_APP_SECRET }),
  })
  const j = await r.json()
  _token = j.tenant_access_token
  _tokenExp = Date.now() + (j.expire - 60) * 1000
  return _token
}

async function feishuApi(path) {
  const token = await getToken()
  const r = await fetch(`https://open.feishu.cn${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  return r.json()
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
  if (!FEISHU_HOOK) return
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

const HELP = 'Hermes Agent\n/pr-review — PR审查\n/audit — 过度工程审计\n/security — 安全审计'

function parseCmd(text) {
  if (text.includes('/pr-review')) return prReview
  if (text.includes('/audit')) return audit
  if (text.includes('/security')) return security
  if (text.includes('/help')) return () => HELP
  return null
}

// ---- Main ----
async function main() {
  const lastId = getLastId()
  let newLastId = lastId

  // List recent messages
  const path = `/open-apis/im/v1/messages?receive_id_type=chat_id&receive_id=${CHAT_ID}&page_size=10&sort_type=ByCreateTimeDesc`
  const list = await feishuApi(path)
  console.log('API:', JSON.stringify(list).slice(0, 300))

  const items = list?.data?.items
  if (!items?.length) { console.log('No messages'); saveLastId(lastId); return }

  // Find newest unprocessed @bot text message
  let target = null
  for (const m of items) {
    if (!m.message_id || m.message_id <= lastId) continue
    if (newLastId < m.message_id) newLastId = m.message_id
    if (m.msg_type !== 'text') continue
    if (m.sender?.id_type !== 'user') continue

    // Check if message @mentions any bot
    const mentions = m.mentions || []
    if (!mentions.some(at => at.key?.startsWith('cli_'))) continue

    target = m
  }

  if (target) {
    const text = JSON.stringify(target.body?.content || '') || ''
    console.log(`Processing: ${text.slice(0, 100)}`)

    // Parse body content (may be JSON string or plain text)
    let content = ''
    try { content = JSON.parse(target.body?.content || '{}').text || '' } catch { content = target.body?.content || '' }
    if (typeof content === 'string' && content) {
      const handler = parseCmd(content)
      if (handler) {
        const result = await handler()
        await reply(result)
        console.log('Replied')
      }
    }
  } else {
    console.log('No new command')
  }

  saveLastId(newLastId)
}

await main()
