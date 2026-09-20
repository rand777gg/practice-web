// Supabase Edge Function: rag-search
//
// 跨来源混合检索(向量 + 全文, RRF 融合)。前端的唯一检索入口。
//
// 两个关键点:
//   1. 查询向量在服务端算 —— QWEN_API_KEY 只存在于 secret, 前端拿不到;
//   2. 检索用**调用者自己的 JWT** 走 PostgREST, 所以 RLS 照常生效,
//      不会因为"服务端代理"而越过权限看到不该看的内容。
//      向量服务不可用时降级为纯全文检索, 不让整条链路挂掉。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { embedQuery, toVectorLiteral } from '../_shared/embed.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!

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

const ALLOWED_SOURCES = ['resource', 'question', 'kp', 'subject', 'note']

/**
 * 从问句里抽关键词。
 *
 * 为什么需要: 全文那一路是子串匹配, 而用户问「灵气学派是什么？」时, 正文里只有
 * "灵气学派", 绝不会有这一整句 —— 拿整句去匹配恒为空。向量那一路能处理这种改写,
 * 但 embedding 服务一旦不可用就会退化成纯全文, 那时没有抽词就等于搜不到任何东西。
 * 这里只做很朴素的尾巴裁剪: 中文没有词边界, 抽错最多是少召回, 不会召回错的。
 */
const QUESTION_TAIL = /(是什么|是什么意思|为什么|怎么样|怎样的|怎么|怎样|如何|有哪些|有哪些特点|哪些|哪个|哪一种|多少|请问|请|解释一下|解释|说明一下|说明|介绍一下|介绍|的定义|定义|的含义|含义|的区别|区别|的作用|作用|的原因|原因|吗|呢)+$/g

function queryTerms(query: string): string[] {
  const cleaned = query.replace(/[，。？！、；："“”'‘’（）()\[\]【】《》\s]+/g, ' ').trim()
  const terms = new Set<string>()
  for (const part of cleaned.split(/\s+/)) {
    if (!part) continue
    const trimmed = part.replace(QUESTION_TAIL, '')
    if (trimmed.length >= 2) terms.add(trimmed)
    // 整段也留一个: 有些查询本身就是正文里的原句
    if (part.length >= 2 && part.length <= 16) terms.add(part)
  }

  // 中文没有词边界, 靠"裁疑问尾巴"只能覆盖少数问法(「古罗马时期有哪些医学流派」就裁不掉)。
  // 再补一层 4 字滑窗: 只要命中其中任意几段就能召回, 命中段数越多排得越前。
  // 4 字而不是 2 字, 是为了压住「这本」「书」这类噪声。
  const compact = cleaned.replace(/\s+/g, '')
  if (compact.length > 4 && compact.length <= 40) {
    for (let i = 0; i + 4 <= compact.length; i++) terms.add(compact.slice(i, i + 4))
  }

  // 长度降序: 长词更能代表意图, 而且 RPC 会按命中词数排序, 长词命中通常更可信
  return [...terms].sort((a, b) => b.length - a.length).slice(0, 12)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({})) as {
      query?: string
      sources?: string[]
      sourceIds?: string[]
      limit?: number
    }
    const query = (body.query ?? '').trim()
    if (!query) return json({ error: 'missing_query' }, 400)
    if (query.length > 500) return json({ error: 'query_too_long' }, 400)

    const sources = Array.isArray(body.sources) && body.sources.length > 0
      ? body.sources.filter((s) => ALLOWED_SOURCES.includes(s))
      : null
    // 限定到具体某几篇(目前只有文献有 source_id)。空数组等同于不过滤 ——
    // 免得前端选了个空选择器就把召回变成零条
    const sourceIds = Array.isArray(body.sourceIds) && body.sourceIds.length > 0
      ? body.sourceIds.filter((s) => typeof s === 'string' && s.length > 0).slice(0, 50)
      : null
    const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 40)

    const { vector: embedding, error: embedError } = await embedQuery(query)

    // 用调用者的身份查, RLS 说了算
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })

    const { data, error } = await supabase.rpc('search_rag', {
      p_query: query,
      p_embedding: embedding ? toVectorLiteral(embedding) : null,
      p_sources: sources,
      p_limit: limit,
      p_terms: queryTerms(query),
      p_source_ids: sourceIds,
    })
    if (error) return json({ error: error.message }, 500)

    return json({
      hits: data ?? [],
      // 前端要能区分"语义+全文"和"只有全文", 以便提示用户
      mode: embedding ? 'hybrid' : 'text-only',
      // 降级时把原因带出来, 否则线上只会看到"检索变差了"却查不出为什么
      embed_error: embedError,
    })
  } catch (err) {
    console.error('[rag-search]', err)
    return json({ error: String(err) }, 500)
  }
})
