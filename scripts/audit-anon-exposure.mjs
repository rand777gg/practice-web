/**
 * 线上暴露面审计：用**匿名身份**（只有 publishable key、没有用户 JWT）去打线上 PostgREST，
 * 看哪些表能读到行、哪些 RPC 能调通，再把 `supabase/migrations/001_initial_schema.sql` 里
 * 「没有 TO 子句的策略」列出来做人工确认。
 *
 * 为什么要这么审：RLS 的默认值是"没有策略就全拒"，但一条 `FOR SELECT USING (is_public = true)`
 * 如果没写 `TO authenticated`，它对 anon 同样生效 —— 这在 DDL 里看不出来，只有以匿名身份真的请求
 * 一次才暴露。而且 `supabase link` 指向的是切换前的旧项目，读不到线上的 pg_policies，
 * 所以只能从外部实测。
 *
 * 只读、不写：全部是 GET，以及 POST 调用**白名单里明确只读**的 RPC。
 * 绝不打印行内容（只报行数与是否命中），避免把用户数据带进日志。
 *
 * 用法：node scripts/audit-anon-exposure.mjs
 * 退出码：发现任何表对 anon 返回行 → 1（需要逐条确认是否预期）；否则 0。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 允许以匿名身份探测的 RPC —— **只放只读的**。
 * 任何带 merge/save/delete/reset/clear/admin/start 的都在白名单外：它们会写库，
 * 拿线上数据做探测的代价太高。加新条目时必须先确认函数体只读。
 */
const READ_ONLY_RPCS = [
  { name: 'rag_admin_stats', args: {} },
  { name: 'count_question_items', args: {} },
  { name: 'get_question_meta', args: {} },
  { name: 'get_plan_stats', args: { p_user_id: '00000000-0000-0000-0000-000000000000', p_plan: {} } },
  { name: 'get_subject_progress', args: { p_user_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'get_review_count', args: { p_user_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'get_kp_exclusion_stats', args: { p_user_id: '00000000-0000-0000-0000-000000000000', p_kps: [] } },
  { name: 'get_excluded_kp_questions', args: { p_user_id: '00000000-0000-0000-0000-000000000000', p_kp: '' } },
  { name: 'load_practice_session', args: { p_user_id: '00000000-0000-0000-0000-000000000000', p_session_key: '' } },
  { name: 'ai_usage_overview', args: { p_days: 1 } },
]

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

/** 从生成的类型文件里抽出表名（与 check-schema-drift 同一套解析） */
function readTableNames() {
  const src = readFileSync(join(root, 'src/types/database.ts'), 'utf8')
  const names = []
  let inTables = false
  for (const line of src.split(/\r?\n/)) {
    if (/^    Tables: \{/.test(line)) { inTables = true; continue }
    if (inTables && /^    \w+: \{/.test(line)) break
    if (!inTables) continue
    const t = /^      ([a-z_]+): \{$/.exec(line)
    if (t) names.push(t[1])
  }
  return names
}

/**
 * 判定一条策略是否依赖"当前是谁"。三种写法都要认：
 *   · auth.uid()            —— 具体用户
 *   · auth.role() = 'authenticated' —— 至少得登录（anon 的 role 是 'anon'，所以恒假）
 *   · auth.jwt()            —— 自定义 claim
 * 只认 auth.uid() 会把 `USING (auth.role() = 'authenticated')` 误判成"对匿名放行"，
 * 而那其实是登录即可读 —— 这个误判会让报告里多出一堆假漏洞。
 */
const AUTH_PREDICATE = /auth\.uid\(\)|auth\.role\(\)|auth\.jwt\(\)|is_admin\(\)/

/** 深度判断"这个响应里有没有真东西"（空数组、全零、空对象都算没东西） */
function hasPayload(value, depth = 0) {
  if (depth > 6) return true
  if (value === null || value === undefined || value === false || value === 0 || value === '') return false
  if (Array.isArray(value)) return value.some((v) => hasPayload(v, depth + 1))
  if (typeof value === 'object') return Object.values(value).some((v) => hasPayload(v, depth + 1))
  return true
}

/** 静态部分：列出没有 TO 子句的策略（它们对 anon 也生效） */
function scanOpenPolicies() {
  const sql = readFileSync(join(root, 'supabase/migrations/001_initial_schema.sql'), 'utf8')
  const flat = sql.replace(/\r\n/g, '\n')
  const out = []
  const re = /CREATE POLICY\s+"?([\w]+)"?\s+ON\s+([\w.]+)([\s\S]*?);/g
  for (const m of flat.matchAll(re)) {
    const [, name, table, body] = m
    // 文件里 DROP + CREATE 成对出现，同一个策略名会命中多次；保留最后一次定义（与重放语义一致）
    const entry = {
      name,
      table: table.replace(/^public\./, ''),
      roles: null,
      command: null,
      usesAuth: AUTH_PREDICATE.test(body),
      // 只按数据条件放行（例如 is_public = true）——这类对 anon 生效时是"公开内容"语义
      dataOnly: !AUTH_PREDICATE.test(body),
    }
    const roles = /\bTO\s+([\w, ]+?)(?=\s+(?:USING|WITH CHECK)|$)/.exec(body)
    if (roles) entry.roles = roles[1].trim()
    const cmd = /\bFOR\s+(\w+)/.exec(body)
    if (cmd) entry.command = cmd[1].toUpperCase()
    const prev = out.findIndex((p) => p.name === name && p.table === entry.table)
    if (prev >= 0) out[prev] = entry
    else out.push(entry)
  }
  return out.filter((p) => !p.roles)
}

/**
 * 静态部分：函数 EXECUTE 权限清单。
 *
 * ⚠ **这一节的输出只是候选集，不是结论。** 真正能定论的只有
 * `has_function_privilege('anon', oid, 'EXECUTE')`（SQL）或以匿名身份真调一次
 * （本脚本对白名单里的只读 RPC 做的就是后者）。
 *
 * 为什么静态扫不准：函数的 EXECUTE 同时来自**两处**默认授权，撤掉任意一处都不够 ——
 * 实测 proacl 形如
 *     {=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
 * 开头没有受让者的 `=X/postgres` 是 **PUBLIC**（PostgreSQL 对函数的内建默认就是
 * GRANT EXECUTE TO PUBLIC），后面那条 `anon=` 是 Supabase 给 public schema 设的默认权限。
 * 于是：
 *   · 没有 REVOKE FROM anon   → 平台的默认授权仍在，匿名可调（本节据此标记 reachable）；
 *   · 只有 REVOKE FROM anon   → PUBLIC 那条还在，**匿名照样能调**（migration Section 101 的实测）；
 *   · 只有 REVOKE FROM PUBLIC → 只撤掉那条显式 anon 授权（Section 68 记的是这个方向）。
 * 必须 `FROM anon, PUBLIC` 才收得干净。所以下面 `anonReachable` 是一个**上界**：
 * 它列出的每个函数都值得去看一眼，但"没列出"也未必就安全。
 *
 * SECURITY DEFINER 再叠上去，就是「匿名可调 + 用属主权限跑」这一组，必须先看函数体有没有自我校验。
 */
function scanFunctionGrants() {
  const sql = readFileSync(join(root, 'supabase/migrations/001_initial_schema.sql'), 'utf8')
  const flat = sql.replace(/\r\n/g, '\n')

  const defs = new Map()
  for (const m of flat.matchAll(/CREATE OR REPLACE FUNCTION\s+public\.(\w+)\s*\(([^)]*)\)([\s\S]*?)(?=\n\$\$;|\n\$\$ LANGUAGE)/g)) {
    const [, fn, params, body] = m
    defs.set(fn, {
      fn,
      params: params.replace(/\s+/g, ' ').trim(),
      securityDefiner: /SECURITY\s+DEFINER/i.test(body),
      checksIdentity: /auth\.uid\(\)|auth\.role\(\)|auth\.jwt\(\)|is_admin\(\)/.test(body),
      grants: new Set(),
      revokes: new Set(),
    })
  }

  const roleList = (s) => s.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)
  for (const m of flat.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.(\w+)\s*\([^)]*\)\s+TO\s+([^;]+);/g)) {
    const def = defs.get(m[1])
    if (def) for (const r of roleList(m[2])) def.grants.add(r)
  }
  for (const m of flat.matchAll(/REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION\s+public\.(\w+)\s*\([^)]*\)\s+FROM\s+([^;]+);/g)) {
    const def = defs.get(m[1])
    if (def) for (const r of roleList(m[2])) def.revokes.add(r)
  }

  const rows = [...defs.values()].map((d) => ({
    fn: d.fn,
    securityDefiner: d.securityDefiner,
    checksIdentity: d.checksIdentity,
    explicitGrant: d.grants.has('anon') || d.grants.has('public'),
    revokedFromAnon: d.revokes.has('anon'),
    revokedFromPublic: d.revokes.has('public'),
    // 两处默认授权都撤掉了才算真的收干净 —— 只撤一处都还够匿名调用
    anonReachable: !(d.revokes.has('anon') && d.revokes.has('public')),
  }))

  rows.sort((a, b) =>
    (Number(b.anonReachable && b.securityDefiner && !b.checksIdentity) - Number(a.anonReachable && a.securityDefiner && !a.checksIdentity)) ||
    (Number(b.anonReachable && b.securityDefiner) - Number(a.anonReachable && a.securityDefiner)) ||
    a.fn.localeCompare(b.fn))
  return rows
}

const env = loadEnv()
const baseUrl = env.VITE_SUPABASE_URL
const apiKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!baseUrl || !apiKey) {
  console.error('审计失败: 缺少 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY')
  process.exit(1)
}
const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }

console.log(`匿名暴露面审计：线上 ${baseUrl}（只读探测，不打印行内容）\n`)

// ── A. 表读取 ──
const tables = readTableNames()
const exposed = []
const blocked = []
const errored = []
for (const table of tables) {
  const url = `${baseUrl}/rest/v1/${table}?select=*&limit=1`
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      errored.push({ table, status: res.status })
      continue
    }
    const body = await res.json().catch(() => null)
    const rows = Array.isArray(body) ? body.length : 0
    // 只报行数，不报内容
    if (rows > 0) exposed.push({ table, rows })
    else blocked.push(table)
  } catch (e) {
    errored.push({ table, status: `fetch 失败: ${e instanceof Error ? e.message : String(e)}` })
  }
}

console.log(`A. 表：匿名能读到行的有 ${exposed.length} / ${tables.length}`)
for (const e of exposed) console.log(`   · ${e.table}  （至少 ${e.rows} 行）`)
const noRows = blocked.length - 0
console.log(`   其余 ${noRows} 张表匿名读到 0 行（可能是 RLS 拦住了，也可能是表本来就是空的 —— 这个检查分不出来）`)
if (errored.length) {
  console.log(`   另有 ${errored.length} 张表返回非 200：`)
  for (const e of errored) console.log(`   · ${e.table}: ${e.status}`)
}

// ── B. 只读 RPC ──
console.log(`\nB. 只读 RPC：匿名调用结果`)
const rpcOpen = []
for (const rpc of READ_ONLY_RPCS) {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/rpc/${rpc.name}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(rpc.args),
    })
    const text = await res.text().catch(() => '')
    if (res.ok) {
      const parsed = (() => { try { return JSON.parse(text) } catch { return null } })()
      // 只看"有没有真东西"：{found:false}、空数组、全零汇总都算没有内容。
      // 早先只判空数组/空对象，会把 {found:false} 误报成"拿到了内容" —— 假阳性和假阴性一样有害。
      const label = hasPayload(parsed) ? '调通，且返回了实际内容 ⚠' : '调通，但没有返回任何内容（函数内部按身份过滤了）'
      console.log(`   · ${rpc.name}: ${label}`)
      if (hasPayload(parsed)) rpcOpen.push(rpc.name)
    } else {
      let code = ''
      try { code = (JSON.parse(text).code ?? '') } catch { /* 非 JSON 错误体 */ }
      console.log(`   · ${rpc.name}: HTTP ${res.status}${code ? ` / ${code}` : ''}（被拒，符合预期）`)
    }
  } catch (e) {
    console.log(`   · ${rpc.name}: fetch 失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ── C. 没有 TO 子句的策略 ──
const openPolicies = scanOpenPolicies()
console.log(`\nC. migration 里没有 TO 子句的策略：共 ${openPolicies.length} 条（这些对 anon 也生效）`)
for (const p of openPolicies) {
  const kind = p.dataOnly ? '只按数据条件放行' : '含 auth.uid()/is_admin()'
  console.log(`   · ${p.table} / ${p.name}  FOR ${p.command ?? '?'}  —— ${kind}`)
}
console.log('   这些不一定是漏洞：公开内容的策略本来就该对匿名放行。逐条确认「这条内容是否真的有理由给未登录的人看」，')
console.log('   没有理由的加 `TO authenticated` 即可，不影响已登录用户的任何功能。')

// ── D. 函数 EXECUTE 权限 ──
const fnGrants = scanFunctionGrants()
const anonReachable = fnGrants.filter((g) => g.anonReachable)
const definerReachable = anonReachable.filter((g) => g.securityDefiner)
const risky = definerReachable.filter((g) => !g.checksIdentity)
console.log(`\nD. 函数 EXECUTE 授权：解析到 ${fnGrants.length} 个函数定义`)
console.log(`   其中 ${anonReachable.length} 个**可能**对匿名可调（anon / PUBLIC 两处默认授权没有一起撤掉）`)
console.log('   注意：这里是候选**上界**，不是结论 —— DDL 静态扫不出最终结果，')
console.log('         函数的 EXECUTE 同时来自 PUBLIC（PG 内建默认）与 anon（Supabase 默认权限），')
console.log('         只撤一处仍然够匿名调用。定论请查 has_function_privilege 或用匿名身份真调。')
console.log(`   再叠加 SECURITY DEFINER（用属主权限跑）的有 ${definerReachable.length} 个`)
if (risky.length) {
  console.log(`   最需要看的一组（匿名可调 + SECURITY DEFINER + 函数体不自我校验）共 ${risky.length} 个：`)
  for (const g of risky) console.log(`   · ${g.fn}(${g.params})`)
} else {
  console.log('   没有「匿名可调 + SECURITY DEFINER + 不自我校验」三件套同时成立的函数。')
}
if (definerReachable.length) {
  console.log(`   已是 SECURITY DEFINER 且对匿名可调、但函数体里有身份判断的（${definerReachable.length - risky.length} 个，抽查即可）：`)
  console.log(`     ${definerReachable.filter((g) => g.checksIdentity).slice(0, 12).map((g) => g.fn).join(', ')}`)
}
const anonPlain = anonReachable.filter((g) => !g.securityDefiner)
if (anonPlain.length) {
  console.log(`\n   其余 ${anonPlain.length} 个「匿名可调但不是 SECURITY DEFINER」的（按 RLS 权限跑，风险低得多，但仍是多余的暴露面）：`)
  console.log(`     ${anonPlain.map((g) => g.fn).join(', ')}`)
  console.log('   处理方式：确认登录前不会调用后，逐个收回 —— **两个授权都要撤**：')
  console.log('     REVOKE EXECUTE ON FUNCTION public.xxx(...) FROM anon, PUBLIC;')
  console.log('     （只写 FROM anon 收不掉 PUBLIC 那条内建默认，匿名照样能调；migration Section 101.1 有实测。）')
  console.log('   登录前真正需要的只有 qr_login_status（扫码页在未登录时轮询它）；其余都走 authenticated。')
}

// ── 结论 ──
console.log('\n结论')
const dataOnlyOpen = openPolicies.filter((p) => p.dataOnly)
if (exposed.length === 0) {
  console.log('  · 匿名读不到任何表的行。')
} else {
  console.log(`  · 匿名能读到 ${exposed.length} 张表的行：${exposed.map((e) => e.table).join(', ')}`)
  console.log('    逐条确认这是"公开内容"而不是漏写的 TO 子句。')
}
if (rpcOpen.length) {
  console.log(`  · 匿名能调到并拿到非空返回的 RPC：${rpcOpen.join(', ')}（注意：非空 ≠ 敏感，见上面逐条的值摘要）`)
}
console.log(`  · ${openPolicies.length} 条策略没有 TO 子句，其中 ${dataOnlyOpen.length} 条完全不引用身份（只按数据条件放行）。`)
console.log('    不一定是漏洞：公开内容的策略本来就该对匿名放行。要收紧就加 `TO authenticated`。')
if (risky.length) {
  console.log(`  · 有 ${risky.length} 个函数属于「匿名可调 + SECURITY DEFINER + 不自我校验」，优先处理。`)
}
process.exit(exposed.length === 0 && rpcOpen.length === 0 && risky.length === 0 ? 0 : 1)
