#!/usr/bin/env node
/**
 * Commit review — performance analysis via DeepSeek, sent to Feishu.
 * Triggered by Claude Code PostToolUse hook after git commit.
 */
import { execFileSync } from 'node:child_process'

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY
const FEISHU_URL = process.env.FEISHU_WEBHOOK_URL

if (!DEEPSEEK_KEY) { console.error('[commit-review] Missing DEEPSEEK_API_KEY'); process.exit(1) }

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', timeout: 30_000 }).trim()
}

async function sendFeishu(title, body) {
  if (!FEISHU_URL) return
  const text = `${title}\n\n${body}`.slice(0, 20_000)
  const res = await fetch(FEISHU_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: `[Commit Review] ${text}` } }),
  })
  console.log(`[commit-review] Feishu: ${res.status}`)
}

async function analyze(diff, msg) {
  const prompt = `你是资深前端性能专家。对以下 git commit 做性能分析，只关注性能，用中文输出。

## Commit: ${msg}

## Diff:
${diff.slice(0, 25_000)}

## 分析要点（仅性能相关）
- 不必要的重渲染（useEffect 依赖、useMemo/useCallback 缺失）
- N+1 查询或冗余数据获取
- 内存泄漏（未清理的 listener/timer/subscription）
- 大依赖引入或 bundle 膨胀
- 阻塞主线程的同步操作
- 可以懒加载的组件或数据

## 输出格式
按严重度排序，每条：
**文件:行号** | 🔴严重 / 🟡注意
- 问题：一句话
- 建议：一句话

性能无影响回复"✅ 无性能问题"。
总共不超过 15 条。`

  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 2000 }),
  })
  const j = await res.json()
  return j.choices?.[0]?.message?.content || ''
}

async function main() {
  const msg = git(['log', '-1', '--format=%s'])
  const diff = git(['diff', 'HEAD~1..HEAD'])
  if (!diff) { console.log('[commit-review] No diff, skipping.'); return }

  console.log(`[commit-review] Analyzing: ${msg}`)
  const result = await analyze(diff, msg)
  console.log(result)
  await sendFeishu(`📝 ${msg}`, result)
  console.log('[commit-review] Done.')
}

main().catch(e => { console.error(e); process.exit(1) })
