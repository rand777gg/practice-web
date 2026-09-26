/**
 * 看最近的客户端事件（migration Section 104 的 client_events）。
 *
 * 为什么要这个脚本：加这张表的目的就是"让线上看不见的东西看得见"，而如果看它需要手打一长串
 * SSH + psql，那等于没加。所以把它做成一条命令：`npm run events`。
 *
 * 两条刻意的设计：
 *   · **不经过 PostgREST**。这张表只给管理员读，而浏览器里拿到的 JWT 是不是管理员要先有 UI 才能知道；
 *     走 SSH 直连库反而最直接，也顺手避开了"RLS 配错就看不到"这种自证循环。
 *   · **先按 (kind, name) 聚合成"有没有 / 最后一次是什么时候"**，再列最近几条明细。
 *     日常真正要回答的问题是"降级分支有没有被触发过"，不是逐条读日志。
 *
 * 依赖 `~/.ssh/config` 里的 `hk-sb` 别名（自建库只绑 127.0.0.1，外部连不上，见
 * docs/architecture-optimization.md 的「迁移真正落地了」）。
 *
 * 用法：npm run events [条数]     默认 30
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SSH_HOST = process.env.DSH_SUPABASE_SSH ?? 'hk-sb'
const limit = Number(process.argv[2] ?? 30)
if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
  console.error('条数要是 1..500 的整数')
  process.exit(1)
}

const sql = `\\pset pager off
\\echo == 按 (kind, name) 聚合：有没有、共几次、最近一次 ==
select kind, name, count(*) as hits, max(created_at) as last_seen
  from public.client_events
 group by kind, name
 order by last_seen desc;
\\echo
\\echo == 最近 ${limit} 条明细 ==
select id, created_at, kind, name, app_version,
       case when user_id is null then '(未登录)' else 'user' end as who,
       left(detail::text, 160) as detail
  from public.client_events
 order by id desc
 limit ${limit};
`

const work = mkdtempSync(join(tmpdir(), 'client-events-'))
try {
  const local = join(work, 'show-events.sql')
  writeFileSync(local, sql)
  // 用 scp + 远端重定向而不是本地管道：管道捕获在受限环境下会被拒，
  // 而远端 bash 的 `<` 是把文件喂给**容器里**的 psql stdin（`-f` 不行 —— 那找的是容器自己的文件系统）
  execFileSync('scp', ['-q', '-o', 'BatchMode=yes', local, `${SSH_HOST}:/tmp/dsh-show-events.sql`], { stdio: ['ignore', 'inherit', 'inherit'] })
  const remote = `docker exec -i supabase-db psql -U supabase_admin -d postgres -X -q < /tmp/dsh-show-events.sql`
  const out = execFileSync('ssh', ['-o', 'BatchMode=yes', SSH_HOST, remote], { encoding: 'utf8' })
  process.stdout.write(out)
} catch (e) {
  console.error('读取 client_events 失败。')
  console.error(`依赖 ~/.ssh/config 里的 \`${SSH_HOST}\` 别名（可用 DSH_SUPABASE_SSH 覆盖）。`)
  const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
  console.error(`底层错误: ${msg.slice(0, 300)}`)
  process.exit(1)
} finally {
  rmSync(work, { recursive: true, force: true })
}
