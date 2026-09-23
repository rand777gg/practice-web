#!/usr/bin/env node
/**
 * 验证 MinerU 批量接口能不能用来并行解析同一份 PDF 的不同分卷。
 *
 * 多卷文献只有一个 PDF URL, 分卷全靠每卷不同的 page_ranges。所以整套批量方案成立的前提是:
 * 同一个 URL 的多个 entry 会被当成互相独立的任务, 而不是按 URL 命中缓存把整篇发回来。
 * 一旦命中缓存, 页码映射会整体错位却全程不报错, resource-library 里那个
 * `layoutPageCount > expectedPages` 的兜底就是为这件事准备的 —— 这个脚本用来确认它会不会真的触发。
 *
 * 顺带验证响应里的 data_id 会原样回来: 多卷的 file_name 都是 URL 末段, 认领结果只能靠 data_id。
 *
 * Usage: node scripts/mineru-batch-probe.mjs [pdfUrl]
 * 默认用 MinerU 文档里的示例 PDF。会真实消耗解析额度(默认两卷 × 3 页)。
 */
import { readFileSync } from 'node:fs'

const DEMO_PDF = 'https://cdn-mineru.openxlab.org.cn/demo/example.pdf'
const PROBE_PAGES = ['1-3', '4-6']

function readEnv(name) {
  const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(`${name}=`))
  if (!line) throw new Error(`.env 里没有 ${name}`)
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
}

const SUPABASE_URL = readEnv('VITE_SUPABASE_URL')
const ANON_KEY = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
// token 现在是服务端 secret(MINERU_TOKEN); 这个脚本仍支持显式传一把覆盖平台那把
const MINERU_TOKEN = readEnv('MINERU_TOKEN')
const PROXY = `${SUPABASE_URL}/functions/v1/mineru-proxy`

const pdfUrl = process.argv[2] || DEMO_PDF

async function proxy(path, init = {}) {
  const res = await fetch(`${PROXY}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      'X-MinerU-Token': MINERU_TOKEN,
      ...(init.headers || {}),
    },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`proxy ${path} → HTTP ${res.status}: ${JSON.stringify(body)}`)
  return body
}

/** 解析产物覆盖的页数, 跟 resource-blocks.ts 的 layoutPageCount 同款判断 */
function layoutPageCount(jsonData) {
  if (!jsonData) return 0
  let data
  try { data = JSON.parse(jsonData) } catch { return 0 }
  const info = data?.pdf_info
  return Array.isArray(info) ? info.length : 0
}

const files = PROBE_PAGES.map((range, i) => ({
  url: pdfUrl,
  data_id: `probe${i}`,
  page_ranges: range,
}))

console.log(`PDF: ${pdfUrl}`)
console.log(`提交 ${files.length} 卷: ${PROBE_PAGES.join(', ')}`)

const created = await proxy('/v4/extract/task/batch', {
  method: 'POST',
  body: JSON.stringify({
    files,
    model_version: 'vlm',
    language: 'ch',
    enable_formula: true,
    enable_table: true,
  }),
})
if (created.code !== 0) throw new Error(`批量任务创建失败: ${created.msg}`)
const batchId = created.data.batch_id
console.log(`batch_id: ${batchId}`)

let results = []
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 3000))
  const status = await proxy(`/v4/extract-results/batch/${batchId}`)
  if (status.code !== 0) throw new Error(`批量查询失败: ${status.msg}`)
  results = status.data.extract_result || []
  const states = results.map((r) => `${r.data_id ?? '(无 data_id)'}=${r.state}`).join(' ')
  process.stdout.write(`\r轮询 ${i + 1}: ${states}          `)
  if (results.length === files.length && results.every((r) => r.state === 'done' || r.state === 'failed')) break
}
console.log()

const gotDataId = results.filter((r) => r.data_id).length
console.log(`\ndata_id 原样返回: ${gotDataId}/${results.length} ${gotDataId === results.length ? '✅' : '❌ 认领结果不可靠'}`)

const rangeOf = new Map(PROBE_PAGES.map((range, i) => [`probe${i}`, range]))
const measured = []

for (const r of results) {
  const range = rangeOf.get(r.data_id)
  const [from, to] = (range || '0-0').split('-').map(Number)
  const expected = to - from + 1

  if (r.state !== 'done' || !r.full_zip_url) {
    console.log(`  ${r.data_id} [${range}]: ${r.state} ${r.err_msg || ''}`)
    measured.push({ range, pages: 0, expected })
    continue
  }

  const { text, jsonData } = await proxy(`/download-zip?url=${encodeURIComponent(r.full_zip_url)}`)
  const pages = layoutPageCount(jsonData)
  measured.push({ range, pages, expected })
  console.log(`  ${r.data_id} [${range}]: ${pages} 页 | ${text.replace(/\s+/g, ' ').slice(0, 60)}…`)
}

const ok = measured.every((m) => m.pages === m.expected)
console.log(
  ok
    ? `\n✅ 同一 URL 的多卷按 page_ranges 独立解析 (期望 ${measured.map((m) => m.expected).join('/')} 页, ` +
      `实测 ${measured.map((m) => m.pages).join('/')} 页), 批量并行可用`
    : `\n❌ 没有按 page_ranges 分开解析 (期望 ${measured.map((m) => m.expected).join('/')} 页, ` +
      `实测 ${measured.map((m) => m.pages).join('/')} 页) —— 多半是按 URL 命中了缓存。` +
      'resource-library 的页数校验会把这些卷退回单任务重解析, 功能不受影响, 但批量拿不到收益。',
)
process.exit(ok ? 0 : 1)
