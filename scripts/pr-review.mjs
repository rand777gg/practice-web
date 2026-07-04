#!/usr/bin/env node
/**
 * Automated PR review script — runs via GitHub Actions on schedule.
 * Review comments posted to PR, summary sent to Feishu.
 */
import { execFileSync } from 'node:child_process'

const REPO = process.env.GITHUB_REPOSITORY || 'rand777gg/react-practice-web'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
const FEISHU_URL = process.env.FEISHU_WEBHOOK_URL
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
  const body = { msg_type: 'text', content: { text: `[PR Review] ${summary}` } }
  const res = await fetch(FEISHU_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await res.text()
  console.log(`[pr-review] Feishu response: ${res.status} ${result}`)
}

async function reviewDiff(diff, title) {
  const prompt = `你是一个资深前端代码审查专家。请仔细审查以下 PR 的代码变更，用中文输出结果。

## PR 标题：${title}

## 代码变更（Diff）：
${diff.slice(0, 30_000)}

## 审查要点
- 逻辑错误：空值处理、边界条件、异步竞态
- 安全问题：XSS、注入、敏感信息泄露、权限绕过
- 代码质量：命名规范、TypeScript 类型、错误处理、死代码
- 过度工程：不必要的抽象层、过早优化、冗余代码
- 性能隐患：不必要的重渲染、N+1 查询、内存泄漏

## 输出格式要求
对每个发现的问题，按以下格式输出：

**文件:行号** | 🔴严重 / 🟡注意 / 🟢建议
- 问题：具体描述
- 建议：如何修复

如果没有发现问题，回复"✅ 未发现问题"。
注意：要具体引用代码行，给出可操作的建议。`

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 3000 }),
  })
  const j = await res.json()
  return j.choices?.[0]?.message?.content || ''
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
    if (!review || /未发现问题/i.test(review)) continue
    findings.push({ number: pr.number, title: pr.title, author: pr.author.login, review })
    gh(['pr', 'review', String(pr.number), '--repo', REPO, '--comment', '-b', review])
    console.log(`[pr-review] Posted review for #${pr.number}`)
  }

  if (findings.length) {
    const lines = findings.map(f =>
      `📋 **#${f.number}** ${f.title}（作者：${f.author}）\n\n${f.review}`
    )
    await sendFeishu(`代码审查报告\n\n${lines.join('\n\n---\n\n')}`)
    console.log('[pr-review] Feishu notification sent.')
  } else {
    console.log('[pr-review] No issues found in any PR.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
