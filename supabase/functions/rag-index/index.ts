// Supabase Edge Function: rag-index
//
// 索引同步: 把各来源的内容切成块、算向量、写进 rag_chunks。
//
// 五个设计点:
//   1. 只索引"所有登录用户都能看到"的内容(已发布文献 + 公开笔记 + 题库/解读),
//      这样 rag_chunks 对 authenticated 直接开放读也不会泄露草稿或私密笔记。
//   2. 文献块带**所在标题路径**做前缀。单独一句「破坏其中任意一个条件, 死锁便不会发生」
//      离开标题几乎没有检索价值; 加上「第三章 死锁 › 3.1 死锁产生的必要条件」才能被搜到。
//   3. 内容差分: 先切块拿到文本(不花钱), 跟库里已有的块逐条比文本, **只给文本变了的块算向量**。
//      读取便宜(几千行), embedding 才花钱 —— 这是"新增一篇文献/改一道题不必整库重跑"的关键。
//      差集里多出来的旧块也就是被删掉的源内容, 顺手 remove, 不靠调用方记得清理。
//   4. 范围可以整表, 也可以单条(source_id)。单条范围只在本条内做差集, 绝不碰同源的其它块,
//      所以公开笔记的作者保存时能安全地只同步自己那一条 —— 不用等管理员全量重建。
//   5. 带时间预算。一本 295 页的书近千个块, 按 10 条一批要发近百次请求,
//      塞进一次调用会被网关掐掉 —— 到点把**已经算好的批次先写进去**再返回 remaining, 前端接着调。
//      先写后断而不是攒到最后写: 中断后重跑时差分会跳过已写入的块, 进度不丢。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { embedTexts, toVectorLiteral, EMBED_BATCH } from '../_shared/embed.ts'

type SB = ReturnType<typeof createClient>

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface Chunk {
  source: string
  source_id: string
  chunk_index: number
  label: string
  sub_label: string | null
  content: string
  page_no: number | null
  bbox: number[] | null
  block_index: number | null
  anchor: string | null
}

interface Scope {
  source: string
  /** 有值 = 只同步这一条; 没有 = 整表(会清掉整表里对不上源内容的孤儿块) */
  sourceId?: string
}

const TIME_BUDGET_MS = 100_000
const BLOCK_PAGE = 1000

/**
 * 太短的块不进索引。
 * 实测《医学史（第3版）》400 个块里 138 个不足 20 字(最短 1 个字) —— 页眉页脚、页码、
 * 孤立字符。它们既无法承载语义, 也算不上有效出处, 进索引只会挤占召回名额。
 * 标题块也在被过滤之列: 它的价值在于成为后续块的标题路径前缀, 那部分由 path 传递, 不靠它自己命中。
 */
const MIN_CHUNK_CHARS = 20

/**
 * 分页取全量。
 *
 * 必须分页: PostgREST 有 db-max-rows=1000 的硬上限, 客户端写 .limit(5000) 也不生效 ——
 * 实测题库 2009 道题只索引进去 1000 道, 剩下 1009 道**静默消失**(查询返回的是成功 + 1000 行)。
 * 所以这里一律按 1000 一行翻页, 取到不满一页为止。
 */
async function fetchAllRows<T>(makeQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function optionLines(options: unknown): string {
  if (Array.isArray(options)) {
    return options.map((o, i) => `${String.fromCharCode(65 + i)}. ${String(o)}`).join(' ')
  }
  if (options && typeof options === 'object') {
    return Object.entries(options as Record<string, unknown>).map(([k, v]) => `${k}. ${String(v)}`).join(' ')
  }
  return ''
}

function answerText(answer: unknown): string {
  if (answer === null || answer === undefined) return ''
  return Array.isArray(answer) ? answer.map(String).join(', ') : String(answer)
}

// ── 各来源 → 块 ──

async function chunksForResource(sb: SB, documentId: string): Promise<Chunk[]> {
  const { data: doc } = await sb
    .from('resource_documents')
    .select('id, title, is_published')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) throw new Error(`文献不存在: ${documentId}`)
  // 下架不报错、返回空集: 差分会把它已有的块当孤儿删掉。
  // 之前这里是 throw, 结果是"下架一篇文献"只在源表上生效, 它的正文照旧被小Q 检索和引用 ——
  // 索引对全部登录用户可读, 这就等于下架没下架。
  if (!doc.is_published) return []

  const blocks: { block_index: number; page_no: number; bbox: number[] | null; heading_level: number; text: string }[] = []
  for (let from = 0; ; from += BLOCK_PAGE) {
    const { data, error } = await sb
      .from('resource_blocks')
      .select('block_index, page_no, bbox, heading_level, text')
      .eq('document_id', documentId)
      .order('block_index', { ascending: true })
      .range(from, from + BLOCK_PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as typeof blocks
    blocks.push(...rows)
    if (rows.length < BLOCK_PAGE) break
  }

  // 顺着标题目录压栈, 得到每个块所属的标题路径
  const stack: { level: number; title: string }[] = []
  const out: Chunk[] = []
  for (const b of blocks) {
    const text = b.text.trim()
    if (b.heading_level > 0) {
      // 标题即使太短也要进栈: 它是后续块的路径前缀
      while (stack.length > 0 && stack[stack.length - 1].level >= b.heading_level) stack.pop()
      if (text) stack.push({ level: b.heading_level, title: text })
    }
    if (text.length < MIN_CHUNK_CHARS) continue
    const path = stack.map((s) => s.title).join(' › ')
    out.push({
      source: 'resource',
      source_id: documentId,
      chunk_index: b.block_index,
      label: doc.title,
      sub_label: path || `${b.page_no} 页`,
      content: path ? `【${doc.title} › ${path}】${text}` : `【${doc.title}】${text}`,
      page_no: b.page_no,
      bbox: b.bbox,
      block_index: b.block_index,
      anchor: `/resource-library/${documentId}?block=${b.block_index}`,
    })
  }
  return out
}

async function chunksForQuestion(sb: SB, onlyId?: string): Promise<Chunk[]> {
  const rows = await fetchAllRows<{
    id: string; subject: string | null; category: string | null; question_text: string | null
    options: unknown; correct_answer: unknown; analysis: string | null
    answer_explanation: string | null; key_points: string | null
  }>(() => {
    const q = sb
      .from('questions')
      .select('id, subject, category, question_text, options, correct_answer, analysis, answer_explanation, key_points')
      // 按 id 排序而不是 created_at: 分页要求排序键唯一, 否则翻页会漏行或重复
      .order('id', { ascending: true })
    return onlyId ? q.eq('id', onlyId) : q
  })

  return rows.map((r) => {
    const explanation = (r.analysis || r.answer_explanation || '').trim()
    const content = [
      `【${r.subject ?? '未分类'}${r.category ? ` / ${r.category}` : ''}】`,
      (r.question_text ?? '').trim(),
      optionLines(r.options),
      answerText(r.correct_answer) && `答案: ${answerText(r.correct_answer)}`,
      explanation && `解析: ${explanation}`,
      r.key_points && `知识点: ${r.key_points}`,
    ].filter(Boolean).join(' ')

    return {
      source: 'question',
      source_id: String(r.id),
      chunk_index: 0,
      label: (r.question_text ?? '').trim().slice(0, 60),
      sub_label: [r.subject, r.category].filter(Boolean).join(' / ') || null,
      content,
      page_no: null, bbox: null, block_index: null, anchor: null,
    }
  }).filter((c) => c.content.length >= MIN_CHUNK_CHARS)
}

async function chunksForKp(sb: SB): Promise<Chunk[]> {
  const rows = await fetchAllRows<{ subject: string; kp: string; content: string | null }>(() =>
    // (subject, kp) 是主键, 排序唯一, 分页安全
    sb.from('kp_explanations').select('subject, kp, content').order('subject').order('kp'))
  return rows
    .filter((r) => (r.content ?? '').trim())
    .map((r) => ({
      source: 'kp',
      source_id: `${r.subject}::${r.kp}`,
      chunk_index: 0,
      label: r.kp,
      sub_label: r.subject,
      content: `【${r.subject} 知识点: ${r.kp}】${r.content.trim()}`,
      page_no: null, bbox: null, block_index: null, anchor: null,
    }))
}

async function chunksForSubject(sb: SB): Promise<Chunk[]> {
  const rows = await fetchAllRows<{ subject: string; content: string | null }>(() =>
    sb.from('subject_explanations').select('subject, content').order('subject'))
  return rows
    .filter((r) => (r.content ?? '').trim())
    .map((r) => ({
      source: 'subject',
      source_id: r.subject,
      chunk_index: 0,
      label: r.subject,
      sub_label: '学科解读',
      content: `【${r.subject} 学科解读】${r.content.trim()}`,
      page_no: null, bbox: null, block_index: null, anchor: null,
    }))
}

async function chunksForNote(sb: SB, onlyId?: string): Promise<Chunk[]> {
  const rows = await fetchAllRows<{
    id: number; note: string | null
    questions: { question_text?: string; subject?: string; category?: string } | null
  }>(() => {
    const q = sb
      .from('user_answers')
      .select('id, note, questions(question_text, subject, category)')
      .eq('is_public', true)
      .not('note', 'is', null)
      .order('id', { ascending: true })
    // 单条同步时同样带上 is_public 过滤: 否则"取消公开"会变成"把私密笔记索引进去"
    return onlyId ? q.eq('id', onlyId) : q
  })

  return rows
    .filter((r) => (r.note ?? '').trim())
    .map((r) => {
      const question = r.questions ?? {}
      const where = [question.subject, question.category].filter(Boolean).join(' / ')
      return {
        source: 'note',
        source_id: String(r.id),
        chunk_index: 0,
        label: (question.question_text ?? '公开笔记').slice(0, 60),
        sub_label: where || '公开笔记',
        content: `【笔记${where ? ` · ${where}` : ''}】${(r.note ?? '').trim()}`,
        page_no: null, bbox: null, block_index: null,
        anchor: '/notes',
      }
    })
}

// ── 差分同步 ──

interface ExistingRow {
  id: number
  source_id: string
  chunk_index: number
  content: string
}

interface SyncResult {
  /** 同步后该范围内的块总数 */
  total: number
  /** 本次真正算了向量的块数 —— 没变动的块不会出现在这里, 也就是省下来的钱 */
  embedded: number
  added: number
  updated: number
  removed: number
  unchanged: number
  /** >0 表示时间预算用完, 前端要接着调 */
  pending: number
}

function chunkKey(sourceId: string, chunkIndex: number): string {
  return `${sourceId}\u0000${chunkIndex}`
}

async function readExisting(sb: SB, scope: Scope): Promise<Map<string, ExistingRow>> {
  const rows = await fetchAllRows<ExistingRow>(() => {
    const q = sb
      .from('rag_chunks')
      // 按 id 排序: 分页要求排序键唯一
      .select('id, source_id, chunk_index, content')
      .eq('source', scope.source)
      .order('id', { ascending: true })
    return scope.sourceId ? q.eq('source_id', scope.sourceId) : q
  })
  return new Map(rows.map((r) => [chunkKey(r.source_id, r.chunk_index), r]))
}

async function upsertRows(sb: SB, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('rag_chunks')
      .upsert(rows.slice(i, i + 200), { onConflict: 'source,source_id,chunk_index' })
    if (error) throw new Error(`写入向量失败: ${error.message}`)
  }
}

async function deleteByIds(sb: SB, ids: number[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from('rag_chunks').delete().in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`清理孤儿块失败: ${error.message}`)
  }
}

/**
 * 把 desired 同步进 rag_chunks。
 *
 * 顺序很重要: 一开始写的是"先删旧块再逐批 embed", 结果重跑索引时 embedding 服务
 * 中途报错(实测撞上 DashScope 欠费), 已经删掉的旧索引就永久丢了 —— 重跑一次索引
 * 反而把线上搜得到的东西弄没了。现在删只发生在"孤儿块"上, 而且放在向量都算完之后:
 * 中途失败最多是"这次没更新", 不会破坏已有索引。
 */
async function syncChunks(sb: SB, scope: Scope, desired: Chunk[], started: number): Promise<SyncResult> {
  const existing = await readExisting(sb, scope)
  const wanted = new Set(desired.map((c) => chunkKey(c.source_id, c.chunk_index)))

  const stale: { chunk: Chunk; isNew: boolean }[] = []
  for (const chunk of desired) {
    const prev = existing.get(chunkKey(chunk.source_id, chunk.chunk_index))
    if (!prev) stale.push({ chunk, isNew: true })
    else if (prev.content !== chunk.content) stale.push({ chunk, isNew: false })
  }
  const orphans = [...existing.values()].filter((r) => !wanted.has(chunkKey(r.source_id, r.chunk_index)))

  const result: SyncResult = {
    total: desired.length,
    embedded: 0,
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: desired.length - stale.length,
    pending: 0,
  }

  if (stale.length === 0 && orphans.length === 0) return result

  let stopped = false
  for (let i = 0; i < stale.length; i += EMBED_BATCH) {
    // 至少算完一批再考虑收工, 否则小改动会永远卡在"预算已用完"上
    if (result.embedded > 0 && Date.now() - started > TIME_BUDGET_MS) {
      stopped = true
      result.pending = stale.length - i
      break
    }
    const slice = stale.slice(i, i + EMBED_BATCH)
    const vectors = await embedTexts(slice.map((s) => s.chunk.content))
    const rows = slice.map((s, k) => ({
      ...s.chunk,
      // pgvector 的文本输入格式; PostgREST 按列类型 cast
      embedding: toVectorLiteral(vectors[k]),
      embedded_at: new Date().toISOString(),
    }))
    for (const s of slice) {
      if (s.isNew) result.added += 1
      else result.updated += 1
    }
    result.embedded += slice.length
    // 每批都落盘: 中断后重跑时差分会跳过这些块, 进度不丢
    await upsertRows(sb, rows)
  }

  // 孤儿块只在整轮跑完时删 —— 中途停下说明还没看全, 这时候删可能删掉正要重建的块
  if (!stopped && orphans.length > 0) {
    await deleteByIds(sb, orphans.map((r) => r.id))
    result.removed = orphans.length
  }

  return result
}

interface Job {
  kind: string
  /** 整表来源没有这个字段; 单条同步(文献/题目/笔记)才有 */
  sourceId?: string
  label: string
}

async function runJob(sb: SB, job: Job, started: number): Promise<SyncResult> {
  const scope: Scope = { source: job.kind, sourceId: job.sourceId }
  switch (job.kind) {
    case 'resource':
      return syncChunks(sb, scope, await chunksForResource(sb, job.sourceId!), started)
    case 'question':
      return syncChunks(sb, scope, await chunksForQuestion(sb, job.sourceId), started)
    case 'kp':
      return syncChunks(sb, { source: 'kp' }, await chunksForKp(sb), started)
    case 'subject':
      return syncChunks(sb, { source: 'subject' }, await chunksForSubject(sb), started)
    case 'note':
      return syncChunks(sb, scope, await chunksForNote(sb, job.sourceId), started)
    default:
      throw new Error(`unknown source: ${job.kind}`)
  }
}

/** 登录用户能自己触发的范围: 只影响单条, 且只索引"本来就是公开可读"的内容 */
const SELF_SERVE_SOURCES = new Set(['resource', 'question', 'note'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const started = Date.now()
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user: caller } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!caller) return json({ error: 'unauthorized' }, 401)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle()
    const isAdmin = profile?.role === 'admin'

    const body = await req.json().catch(() => ({})) as { source?: string; id?: string }
    const source = body.source ?? 'resource'

    // 全量重建(整表扫描 + 清孤儿块)只有管理员能做; 单条增量谁都能触发 ——
    // 公开笔记是普通用户写的, 让他们等管理员点一次重建就等于这条笔记永远搜不到。
    // 单条增量既不越权也不会重复花钱: 内容没变时差集为空, 一次 embedding 都不发。
    if (!isAdmin && (!body.id || !SELF_SERVE_SOURCES.has(source))) {
      return json({ error: 'forbidden' }, 403)
    }

    let jobs: Job[] = []
    if (source === 'resource') {
      if (body.id) {
        const { data, error } = await admin.from('resource_documents')
          .select('id, title').eq('id', body.id).maybeSingle()
        if (error) return json({ error: error.message }, 500)
        if (!data) return json({ error: `文献不存在: ${body.id}` }, 404)
        jobs = [{ kind: 'resource', sourceId: data.id, label: data.title }]
      } else {
        const { data, error } = await admin.from('resource_documents')
          .select('id, title').eq('is_published', true).order('created_at').limit(200)
        if (error) return json({ error: error.message }, 500)
        jobs = (data ?? []).map((d) => ({ kind: 'resource', sourceId: d.id, label: d.title }))
      }
    } else if (source === 'question') {
      jobs = [{ kind: 'question', sourceId: body.id, label: body.id ? `题目 ${body.id}` : '题库(全部)' }]
    } else if (source === 'kp') {
      jobs = [{ kind: 'kp', label: '知识点解读' }]
    } else if (source === 'subject') {
      jobs = [{ kind: 'subject', label: '学科解读' }]
    } else if (source === 'note') {
      jobs = [{ kind: 'note', sourceId: body.id, label: body.id ? `笔记 ${body.id}` : '公开笔记' }]
    } else {
      return json({ error: `unknown source: ${source}` }, 400)
    }

    const results: (SyncResult & { source: string; id: string | null; label: string })[] = []
    const remaining: Job[] = []
    let pending = 0
    for (const job of jobs) {
      if (results.length > 0 && Date.now() - started > TIME_BUDGET_MS) { remaining.push(job); continue }
      const r = await runJob(admin, job, started)
      results.push({ ...r, source: job.kind, id: job.sourceId ?? null, label: job.label })
      pending += r.pending
      if (r.pending > 0) remaining.push(job)
    }

    const sum = (pick: (r: SyncResult) => number) => results.reduce((n, r) => n + pick(r), 0)
    return json({
      ok: true,
      elapsed_ms: Date.now() - started,
      total_chunks: sum((r) => r.total),
      embedded: sum((r) => r.embedded),
      added: sum((r) => r.added),
      updated: sum((r) => r.updated),
      removed: sum((r) => r.removed),
      unchanged: sum((r) => r.unchanged),
      pending_chunks: pending,
      results,
      remaining: remaining.map((j) => ({ source: j.kind, id: j.sourceId ?? null, label: j.label })),
      done: remaining.length === 0,
    })
  } catch (err) {
    console.error('[rag-index]', err)
    return json({ error: String(err) }, 500)
  }
})
