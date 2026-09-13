// 平台 MCP 端点 —— 让用户自己的 AI 助手直接操作「他的」刷题数据
//
// 传输:Streamable HTTP(无状态:一次 POST 一次 JSON-RPC 响应,不启用服务端 SSE 推送与会话)。
// 鉴权:Authorization: Bearer <用户的 Supabase access token>。
//   token 直接交给 PostgREST,所以 RLS 全程生效 —— 这个端点既看不到别人的数据,
//   也不需要 service_role;它比前端多出来的能力只有「能被 MCP 客户端调用」这一条。
//
// 部署:npx supabase functions deploy mcp
// 客户端配置见平台「MCP」页面。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? ''

const SERVER_NAME = 'practice-web'
const SERVER_VERSION = '1.0.0'
// 从新到旧:客户端报的版本我们认得就用它,认不得就报自己最新的,由客户端决定是否继续
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

const INSTRUCTIONS = [
  '这是「刷题网站」的平台 MCP,所有工具都以调用者本人的身份运行:',
  '读到的只是他自己的练习数据,以及平台公开题库。',
  '代码题:先用 judge_code 在平台判题上跑一遍,全部测试点通过才说「已通过」;',
  '判题不可用时如实说「未验证」,不要凭感觉宣布通过。',
  '搭本地环境(Docker Supabase、本地 Judge0)不要走这里,那属于平台「AI 扩展」页的 SKILL.md。',
].join('\n')

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, mcp-protocol-version, mcp-session-id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
}

type RpcId = string | number | null

interface RpcRequest {
  jsonrpc?: string
  id?: RpcId
  method?: string
  params?: Record<string, unknown>
}

interface Ctx {
  userId: string
  token: string
  db: ReturnType<typeof createClient>
}

interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown, fallback: number, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), 1), max)
}
const preview = (s: unknown, n = 200): string => {
  const text = typeof s === 'string' ? s : ''
  return text.length > n ? `${text.slice(0, n)}…` : text
}
const fail = (message: string): never => {
  throw new Error(message)
}

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    keyword: { type: 'string', description: '题干里包含的文字' },
    subject: { type: 'string', description: '学科,例如 数据结构 / 操作系统 / 计算机网络' },
    question_type: { type: 'string', description: '题型,例如 single_choice / multiple_choice / fill_blank / short_answer' },
    limit: { type: 'number', description: '返回条数,默认 10,上限 50' },
  },
  additionalProperties: false,
}

const TOOLS: Tool[] = [
  {
    name: 'search_questions',
    description: '按关键词/学科/题型搜索平台题库,返回题目简要信息。要完整题干与解析请用 get_question。',
    inputSchema: SEARCH_SCHEMA,
    async run(ctx, args) {
      const limit = num(args.limit, 10, 50)
      let query = ctx.db
        .from('questions')
        .select('id, question_type, subject, category, question_text, verified')
        .order('updated_at', { ascending: false })
        .limit(limit)
      const keyword = str(args.keyword)
      const subject = str(args.subject)
      const type = str(args.question_type)
      if (keyword) query = query.ilike('question_text', `%${keyword}%`)
      if (subject) query = query.eq('subject', subject)
      if (type) query = query.eq('question_type', type)

      const { data, error } = await query
      if (error) fail(`查询题目失败:${error.message}`)
      return {
        count: data?.length ?? 0,
        questions: (data ?? []).map((row) => ({
          id: row.id,
          question_type: row.question_type,
          subject: row.subject,
          category: row.category,
          verified: row.verified,
          preview: preview(row.question_text),
        })),
      }
    },
  },
  {
    name: 'get_question',
    description: '按 id 取一道题的完整内容:题干、选项、正确答案、解析、知识点。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: '题目 UUID,来自 search_questions 或 list_wrong_questions' } },
      required: ['id'],
      additionalProperties: false,
    },
    async run(ctx, args) {
      const id = str(args.id) ?? fail('缺少 id')
      const { data, error } = await ctx.db.from('questions').select('*').eq('id', id).maybeSingle()
      if (error) fail(`取题失败:${error.message}`)
      if (!data) return { found: false, message: `题库里没有 id=${id} 的题目` }
      return { found: true, question: data }
    },
  },
  {
    name: 'list_wrong_questions',
    description: '列出当前用户做错过的题(按最近答错时间排序,同一题只出现一次),可加学科过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: '学科过滤' },
        limit: { type: 'number', description: '返回条数,默认 20,上限 100' },
      },
      additionalProperties: false,
    },
    async run(ctx, args) {
      const limit = num(args.limit, 20, 100)
      let query = ctx.db
        .from('user_answers')
        .select('question_id, answered_at, questions!inner(id, question_text, subject, category, question_type)')
        // user_answers 的 RLS 还允许读别人 is_public=true 的记录,这里必须显式限定本人
        .eq('user_id', ctx.userId)
        .eq('is_correct', false)
        .order('answered_at', { ascending: false })
        // 同一道题错多次会有多条记录,先多取一些再按题去重
        .limit(limit * 4)
      const subject = str(args.subject)
      if (subject) query = query.eq('questions.subject', subject)

      const { data, error } = await query
      if (error) fail(`查询错题失败:${error.message}`)

      const seen = new Set<string>()
      const items: unknown[] = []
      for (const row of data ?? []) {
        const question = row.questions as unknown as { id: string; question_text: string; subject: string | null; category: string | null; question_type: string } | null
        if (!question || seen.has(question.id)) continue
        seen.add(question.id)
        items.push({
          id: question.id,
          subject: question.subject,
          category: question.category,
          question_type: question.question_type,
          wrong_at: row.answered_at,
          preview: preview(question.question_text),
        })
        if (items.length >= limit) break
      }
      return { count: items.length, wrong_questions: items }
    },
  },
  {
    name: 'get_practice_stats',
    description: '当前用户的练习进度统计:按学科给出题库总量、累计做过、今日做过、缺知识点的题目数。',
    inputSchema: {
      type: 'object',
      properties: {
        subjects: { type: 'array', items: { type: 'string' }, description: '只统计这些学科,不传则统计全部' },
      },
      additionalProperties: false,
    },
    async run(ctx, args) {
      const subjects = Array.isArray(args.subjects) ? args.subjects.filter((s): s is string => typeof s === 'string') : null
      // 库里 get_subject_progress 同时存在 4 参与 5 参两个重载,具名参数必须给全,否则 PostgREST 无法消歧
      const { data, error } = await ctx.db.rpc('get_subject_progress', {
        p_user_id: ctx.userId,
        p_plan_reset_at: null,
        p_today_since: null,
        p_subjects: subjects && subjects.length ? subjects : null,
        p_subject_resets: null,
      })
      if (error) fail(`取统计失败:${error.message}`)
      return { subjects: data ?? [] }
    },
  },
  {
    name: 'list_favorites',
    description: '列出当前用户收藏的题目,按收藏时间倒序。',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', description: '返回条数,默认 20,上限 100' } },
      additionalProperties: false,
    },
    async run(ctx, args) {
      const limit = num(args.limit, 20, 100)
      const { data, error } = await ctx.db
        .from('favorites')
        .select('created_at, questions!inner(id, question_text, subject, category, question_type)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) fail(`查询收藏失败:${error.message}`)
      return {
        count: data?.length ?? 0,
        favorites: (data ?? []).map((row) => {
          const question = row.questions as unknown as { id: string; question_text: string; subject: string | null; category: string | null; question_type: string } | null
          return {
            id: question?.id,
            subject: question?.subject,
            category: question?.category,
            question_type: question?.question_type,
            favorited_at: row.created_at,
            preview: preview(question?.question_text),
          }
        }),
      }
    },
  },
  {
    name: 'judge_code',
    description:
      '用平台中心判题(Judge0)逐测试点跑一段代码。source_code 必须是从 stdin 读入、往 stdout 输出的完整程序;全部测试点通过才算通过。',
    inputSchema: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['c', 'cpp', 'java', 'javascript', 'typescript', 'python'] },
        source_code: { type: 'string', description: '完整可运行程序' },
        test_cases: {
          type: 'array',
          description: '测试点列表,每项给 stdin 输入与期望的标准输出',
          items: {
            type: 'object',
            properties: { input: { type: 'string' }, expected: { type: 'string' } },
            required: ['input', 'expected'],
            additionalProperties: false,
          },
        },
      },
      required: ['language', 'source_code', 'test_cases'],
      additionalProperties: false,
    },
    async run(ctx, args) {
      const language = str(args.language) ?? fail('缺少 language')
      const code = str(args.source_code) ?? fail('缺少 source_code')
      const testCases = Array.isArray(args.test_cases) ? args.test_cases : []
      if (!testCases.length) fail('缺少 test_cases')
      if (testCases.length > 20) fail('一次最多 20 个测试点')

      // 转调已有的 judge 函数:保持只有一份判题实现,也沿用它的语言与参数钳制
      const res = await fetch(`${SUPABASE_URL}/functions/v1/judge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${ctx.token}`,
        },
        body: JSON.stringify({ code, language, test_cases: testCases }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) fail(`判题失败:HTTP ${res.status} ${JSON.stringify(payload).slice(0, 300)}`)
      return payload
    },
  },
]

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  })
}

function rpcResult(id: RpcId, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: RpcId, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function unauthorized(message: string): Response {
  return json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message } },
    401,
    { 'WWW-Authenticate': 'Bearer realm="practice-web mcp"' },
  )
}

function textResult(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function errorResult(message: string) {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** 通知(没有 id)不产生响应体,返回 null */
async function handle(message: RpcRequest, ctx: Ctx): Promise<unknown | null> {
  const id = message.id ?? null
  const isNotification = message.id === undefined
  const method = message.method ?? ''

  switch (method) {
    case 'initialize': {
      const requested = str(message.params?.protocolVersion) ?? ''
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION, title: '刷题网站 MCP' },
        instructions: INSTRUCTIONS,
      })
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, {
        tools: TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      })
    case 'tools/call': {
      const name = str(message.params?.name) ?? ''
      const tool = TOOLS.find((item) => item.name === name)
      if (!tool) return rpcError(id, -32602, `未知工具:${name}`)
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>
      try {
        return rpcResult(id, textResult(await tool.run(ctx, args)))
      } catch (err) {
        // 工具执行失败走 isError 结果(模型能看到原因并自行调整),而不是 JSON-RPC 错误
        return rpcResult(id, errorResult(err instanceof Error ? err.message : String(err)))
      }
    }
    default:
      if (isNotification) return null
      return rpcError(id, -32601, `不支持的方法:${method}`)
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') {
    // 无状态实现没有服务端推送流,也没有会话可删
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: '只接受 POST;本端点不提供 SSE 流' } }, 405, { Allow: 'POST' })
  }
  if (!SUPABASE_URL || !ANON_KEY) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: '服务端未配置 SUPABASE_URL / ANON_KEY' } }, 503)
  }

  const header = req.headers.get('authorization') ?? ''
  const token = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim()
  if (!token) return unauthorized('缺少 Authorization: Bearer <你在刷题网站的 access token>')

  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth?.user) return unauthorized('token 无效或已过期,请重新登录刷题网站后获取')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 解析失败' } }, 400)
  }

  const ctx: Ctx = { userId: auth.user.id, token, db }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((item) => handle(item as RpcRequest, ctx)))).filter((item) => item !== null)
    if (!responses.length) return new Response(null, { status: 202, headers: corsHeaders })
    return json(responses)
  }

  if (!body || typeof body !== 'object') {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: '请求体必须是 JSON-RPC 对象' } }, 400)
  }

  const response = await handle(body as RpcRequest, ctx)
  if (response === null) return new Response(null, { status: 202, headers: corsHeaders })
  return json(response)
})
