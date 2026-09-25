/**
 * schema 漂移检查：核对 src/types/database.ts 里的表和列在线上 PostgREST 上是否真的存在。
 *
 * 为什么需要单独一个检查：database.ts 是生成的，而生成它的项目不一定就是线上那个 ——
 * 本仓库做过一次入口切换（见 .env.bak-before-cutover），`supabase link` 指向的还是切换前
 * 的旧项目。旧项目缺的列，在新项目里可能已经有了，反之亦然；而类型文件不会告诉你这件事，
 * 它只会让代码按错的形状编译通过，然后在运行时静默丢字段。
 *
 * 检查方式是只读的：对每张表发一次 `select=<database.ts 里的全部列>&limit=0`。
 *   · 200 → 这些列线上都在；
 *   · 400 + 42703 → 报出线上没有的列（PostgREST 一次只报一个，所以逐个剔除后重试）。
 * 局限：只能查出「代码需要的列线上没有」，查不出「线上多出来的列」——
 * 后者不影响前端运行，且 PostgREST 在没有 OpenAPI 根文档时拿不到（本仓库线上正是 403）。
 *
 * 用法：node scripts/check-schema-drift.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const out = { ...process.env }
  const envPath = join(root, '.env')
  if (!existsSync(envPath)) return out
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !out[m[1]]) out[m[1]] = m[2].trim()
  }
  return out
}

/** 从生成的类型文件里抽出 表 → 列名[]  */
function readGeneratedSchema() {
  const src = readFileSync(join(root, 'src/types/database.ts'), 'utf8')
  const lines = src.split(/\r?\n/)
  const tables = {}
  let inTables = false
  let table = null
  let inRow = false
  for (const line of lines) {
    if (/^    Tables: \{/.test(line)) { inTables = true; continue }
    if (inTables && /^    \w+: \{/.test(line)) break
    if (!inTables) continue
    const t = /^      ([a-z_]+): \{$/.exec(line)
    if (t) { table = t[1]; tables[table] = []; continue }
    if (/^        Row: \{/.test(line)) { inRow = true; continue }
    if (inRow && /^        \}/.test(line)) { inRow = false; continue }
    if (inRow && table) {
      const c = /^          ([a-z_0-9]+): /.exec(line)
      if (c) tables[table].push(c[1])
    }
  }
  return tables
}

const env = loadEnv()
const baseUrl = env.VITE_SUPABASE_URL
const apiKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!baseUrl || !apiKey) {
  console.error('schema 漂移检查失败: 缺少 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY')
  process.exit(1)
}

const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }

async function probe(table, columns) {
  // PostgREST 一次只报第一个不存在的列，所以逐个剔除后重试（列数很少，循环有界）
  const missing = []
  let candidates = [...columns]
  for (let attempt = 0; attempt <= columns.length; attempt++) {
    const url = `${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(candidates.join(','))}&limit=0`
    let res
    try {
      res = await fetch(url, { headers })
    } catch (e) {
      return { ok: false, error: `请求失败: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (res.ok) return { ok: missing.length === 0, missing }
    const body = await res.text().catch(() => '')
    const m = /column [a-z_.]+\.([a-z_0-9]+) does not exist/i.exec(body)
    const m2 = /"code":"42703"/.test(body)
    if (!m && !m2) {
      // 不是"列不存在"（可能是权限、表不存在等），如实报出来而不是当成通过
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    if (!m) return { ok: false, error: `HTTP ${res.status} 42703 但解析不出列名: ${body.slice(0, 200)}` }
    const col = m[1]
    missing.push(col)
    candidates = candidates.filter((c) => c !== col)
    if (candidates.length === 0) return { ok: false, missing }
  }
  return { ok: missing.length === 0, missing }
}

const schema = readGeneratedSchema()
const tableNames = Object.keys(schema)
console.log(`schema 漂移检查：线上 ${baseUrl}`)
console.log(`database.ts 里共 ${tableNames.length} 张表\n`)

const drifted = []
const failed = []
for (const table of tableNames) {
  const columns = schema[table]
  const result = await probe(table, columns)
  if (result.error) {
    failed.push({ table, error: result.error })
    continue
  }
  if (result.missing.length > 0) drifted.push({ table, missing: result.missing })
}

if (drifted.length > 0) {
  console.log('以下表在 database.ts 里有、但线上没有的列（前端按这个形状写会静默丢字段）：')
  for (const d of drifted) console.log(`  · ${d.table}: ${d.missing.join(', ')}`)
  console.log('')
}
if (failed.length > 0) {
  console.log('以下表无法判定（不是缺列，而是别的错误）：')
  for (const f of failed) console.log(`  · ${f.table}: ${f.error}`)
  console.log('')
}

if (drifted.length === 0 && failed.length === 0) {
  console.log('结论：database.ts 里的每一列在线上都存在。')
  console.log('注意：本检查证明不了反向 —— 线上多出来的列不会出现在结果里。')
  process.exit(0)
}
console.log(`结论：${drifted.length} 张表有缺列，${failed.length} 张表无法判定。`)
process.exit(1)
