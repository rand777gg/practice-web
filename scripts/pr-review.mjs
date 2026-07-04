#!/usr/bin/env node
/**
 * Automated PR review script — runs via GitHub Actions on schedule.
 */
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'

const REPO = process.env.GITHUB_REPOSITORY || 'rand777gg/react-practice-web'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
const FEISHU_URL = process.env.FEISHU_WEBHOOK_URL
const FEISHU_SECRET = process.env.FEISHU_WEBHOOK_SECRET || ''
const LOOKBACK_HOURS = Number(process.env.LOOKBACK_HOURS || 4)

if (!DEEPSEEK_KEY) { console.error('Missing DEEPSEEK_API_KEY'); process.exit(1) }

function gh(args) {
  const r = execFileSync('gh', args, { encoding: 'utf8', timeout: 60_000 })
  return r.trim()
}

function ghJson(args) {
  return JSON.parse(gh([...args, '--jq', '.']))
}

async function sendFeishu(summary) {
  if (!FEISHU_URL) return
  const body = { msg_type: 'interactive', card: { header: { title: { tag: 'plain_text', content: 'PR Review Report' } }, elements: [{ tag: 'markdown', content: summary }] } }
  if (FEISHU_SECRET) {
    const ts = String(Math.floor(Date.now() / 1000))
    const sign = createHmac('sha256', FEISHU_SECRET).update(ts + '\n' + FEISHU_SECRET, 'utf8').digest('base64')
    body.timestamp = ts
    body.sign = sign
  }
  await fetch(FEISHU_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function reviewDiff(diff, title) {
  const prompt = `Review this pull request diff for bugs, security issues, over-engineering, and code quality.

## PR: ${title}

## Diff:
${diff.slice(0, 30_000)}

## Review Guidelines
- Bugs: logic errors, null/undefined, race conditions
- Security: XSS, injection, auth bypass, secrets in code
- Over-engineering: unnecessary abstractions, dead code
- Code quality: naming, TypeScript types, missing error handling

Output each finding as a bullet. If no issues, say "No issues found."
Keep it concise — one line per finding.`

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 2000 }),
  })
  const j = await res.json()
  return j.choices?.[0]?.message?.content || 'No review response'
}

async function main() {
  console.log(`[pr-review] Checking PRs updated in last ${LOOKBACK_HOURS}h on ${REPO}...`)

  const prs = ghJson(['pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '10', '--json', 'number,title,author,updatedAt'])
  if (!prs.length) { console.log('[pr-review] No open PRs.'); return }

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600_000)
  const recent = prs.filter(p => new Date(p.updatedAt) > cutoff)
  if (!recent.length) { console.log(`[pr-review] No PRs updated since ${cutoff.toISOString()}.`); return }

  const findings = []
  for (const pr of recent) {
    console.log(`[pr-review] Reviewing #${pr.number}: ${pr.title}`)
    const diff = gh(['pr', 'diff', String(pr.number), '--repo', REPO])
    const review = await reviewDiff(diff, pr.title)
    if (review && review !== 'No review response' && !/no issues found/i.test(review)) {
      findings.push({ number: pr.number, title: pr.title, author: pr.author.login, review })
      gh(['pr', 'review', String(pr.number), '--repo', REPO, '--comment', '-b', review])
      console.log(`[pr-review] Posted review for #${pr.number}`)
    }
  }

  if (findings.length) {
    const lines = findings.map(f => `**#${f.number}** ${f.title} (by ${f.author})\n${f.review}`)
    const summary = 'PR Review Report\n\n' + lines.join('\n\n---\n\n')
    await sendFeishu(summary)
    console.log('[pr-review] Feishu notification sent.')
  } else {
    console.log('[pr-review] No issues found in any PR.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
