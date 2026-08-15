#!/usr/bin/env node
/**
 * Build status notifier — sends build success/failure to Feishu.
 * Runs on push to master via GitHub Actions (replaces perf-check bundle report).
 *
 * Usage: node scripts/build-check.mjs <success|failure>
 */
const STATUS = process.argv[2] || 'unknown'
const FEISHU_URL = process.env.FEISHU_WEBHOOK_URL
const REPO = process.env.GITHUB_REPOSITORY || ''
const SHA = (process.env.GITHUB_SHA || '').slice(0, 7)
const RUN_URL = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`

const text = STATUS === 'success'
  ? `✅ 构建成功\n${REPO} @${SHA}\n${RUN_URL}`
  : `❌ 构建失败\n${REPO} @${SHA}\n${RUN_URL}`

async function sendFeishu() {
  if (!FEISHU_URL) {
    console.log('[build] no FEISHU_WEBHOOK_URL, skipping notification')
    return
  }
  const res = await fetch(FEISHU_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: `[Build] ${text}` } }),
  })
  console.log(`[build] Feishu: ${res.status} ${await res.text()}`)
}

await sendFeishu()
console.log(`[build] status=${STATUS}`)
