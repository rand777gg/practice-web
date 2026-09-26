/**
 * 从**线上自建库**重新生成 src/types/database.ts。
 *
 * 为什么换掉原来那一行 `supabase gen types typescript --linked --schema public > src/types/database.ts`：
 *   1. `--linked` 指向的是切换前的**旧项目**（见 .env.bak-before-cutover），那条命令会把
 *      "线上 schema 的子集"当成真相写回来 —— 这正是 database.ts 长期缺列、只能靠 [patch] 手补的原因；
 *   2. `>` 重定向会连文件头那段来源说明一起冲掉。
 *
 * 线上是自建 Supabase（docker compose，见 docs/cutover-runbook.md），Postgres 只绑在 127.0.0.1
 * 且网关宿主端口已回收，所以必须先开 SSH 隧道：
 *
 *   ssh -N -L 0.0.0.0:15433:172.18.0.3:5432 hk-sb        # 172.18.0.3 = supabase-db 容器
 *   $env:SUPABASE_DB_URL = 'postgresql://supabase_admin@host.docker.internal:15433/postgres'
 *   $env:PGPASSWORD = '<POSTGRES_PASSWORD>'               # 或配 PGPASSFILE
 *   $env:PGSSLMODE = 'disable'                            # 见下
 *   npm run types:db
 *
 * 两个坑：
 *   · URL 的 host 必须是 `host.docker.internal`：`gen types` 是经由 postgres-meta **容器**连库的，
 *     写 127.0.0.1 的话容器里的 127.0.0.1 是它自己，会 ECONNREFUSED。
 *   · PGSSLMODE=disable：这个环境下 CLI 会强制 TLS，而自建库的直连端口不提供 TLS。
 *
 * 输出刻意先落到临时文件再由本脚本读：一是绕开"管道捕获"在受限环境下的限制，
 * 二是避免 PowerShell 重定向把文件写成 UTF-16（本轮踩过，Node 按 utf8 读会一个字都找不到）。
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TARGET = 'src/types/database.ts'
const MARKER = 'export type Json ='

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('缺少 SUPABASE_DB_URL。这条命令必须显式给出线上库地址 —— 不要退回 --linked，')
  console.error('它指向的是切换前的旧项目，生成出来的是线上 schema 的子集。')
  console.error('用法见本文件顶部注释（需要先开 SSH 隧道，并设 PGSSLMODE=disable）。')
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), 'gen-types-'))
try {
  const out = join(work, 'types.ts')
  // 用 shell 重定向而不是管道：子进程直接把 UTF-8 字节写进文件，Node 再按 utf8 读回来
  execSync(`npx supabase gen types typescript --db-url "${url}" --schema public > "${out}"`, {
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  const text = readFileSync(out, 'utf8')
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith(MARKER))
  if (start < 0) throw new Error(`生成结果里找不到 "${MARKER}"，输出可能不是类型文件`)
  let end = -1
  for (let i = lines.length - 1; i >= start; i--) {
    if (lines[i].trim() === '} as const') { end = i; break }
  }
  if (end < 0) throw new Error('生成结果里找不到结尾的 "} as const"')
  const body = lines.slice(start, end + 1).join('\n')

  // 保留现有文件的头部说明（`gen types` 不会生成它，原来的 `>` 重定向会把它冲掉）
  let header = ''
  if (existsSync(TARGET)) {
    const old = readFileSync(TARGET, 'utf8')
    const at = old.indexOf(MARKER)
    if (at > 0) header = old.slice(0, at)
  }

  writeFileSync(TARGET, header + body + '\n')
  const tables = (body.match(/^      [a-z_][a-z0-9_]*: \{$/gm) ?? []).length
  console.log(`已写入 ${TARGET}：正文 ${end - start + 1} 行（解析到 ${tables} 个顶层对象）`)
  console.log('下一步：npm run check:schema 会逐表逐列对着线上 PostgREST 核一遍。')
} finally {
  rmSync(work, { recursive: true, force: true })
}
