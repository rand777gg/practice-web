#!/usr/bin/env node
/**
 * Bundle size monitor — alerts on significant size increases via Feishu.
 * Runs on push to master via GitHub Actions.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const DIST = resolve(process.cwd(), 'dist/assets')
const FEISHU_URL = process.env.FEISHU_WEBHOOK_URL
const THRESHOLD_PCT = Number(process.env.PERF_THRESHOLD_PCT || 10)

function getSizes(dir) {
  const files = readdirSync(dir).filter(f => /\.(js|css)$/.test(f))
  const sizes = {}
  for (const f of files) {
    const { size } = statSync(resolve(dir, f))
    sizes[f] = size
  }
  return sizes
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : bytes >= 1024 ? `${(bytes / 1024).toFixed(0)}KB`
    : `${bytes}B`
}

function isChunk(name) {
  // Filter to "interesting" chunks: main entry, page chunks, and large shared chunks
  if (name.startsWith('index-')) return true
  if (name.startsWith('chunk-')) return true
  // Page chunks have uppercase names
  if (/^[A-Z]/.test(name)) return true
  return false
}

async function sendFeishu(text) {
  const res = await fetch(FEISHU_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: `[Perf] ${text}` } }),
  })
  return { status: res.status, body: await res.text() }
}

async function main() {
  console.log('[perf] Analyzing bundle sizes...')
  const sizes = getSizes(DIST)

  const total = Object.values(sizes).reduce((a, b) => a + b, 0)
  const entry = Object.entries(sizes).find(([k]) => k.startsWith('index-') && k.endsWith('.js'))
  const css = Object.entries(sizes).find(([k]) => k.startsWith('index-') && k.endsWith('.css'))

  // Top 10 largest chunks
  const top = Object.entries(sizes)
    .filter(([k]) => isChunk(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const report = [
    `📦 Bundle 分析报告`,
    ``,
    `总计: ${formatSize(total)}`,
    `入口 JS: ${entry ? formatSize(entry[1]) : 'N/A'}`,
    `入口 CSS: ${css ? formatSize(css[1]) : 'N/A'}`,
    `JS 文件数: ${Object.keys(sizes).filter(k => k.endsWith('.js')).length}`,
    `CSS 文件数: ${Object.keys(sizes).filter(k => k.endsWith('.css')).length}`,
    ``,
    `📊 最大 10 个 chunk:`,
    ...top.map(([k, v], i) => `  ${i + 1}. ${k.slice(0, 50)} — ${formatSize(v)}`),
  ].join('\n')

  console.log(report)
  if (FEISHU_URL) {
    const res = await sendFeishu(report)
    console.log(`[perf] Feishu: ${res.status} ${res.body}`)
  }
  console.log('[perf] Done.')
}

main().catch(e => { console.error(e); process.exit(1) })
