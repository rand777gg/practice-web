/**
 * 文本向量 —— 用通义千问 text-embedding-v4(DashScope 的 OpenAI 兼容接口)。
 *
 * 为什么选它: DeepSeek 没有 embeddings 接口(实测 /v1/embeddings 返回 404), 中文语料上
 * Qwen 的向量质量也好。key 只放在 Edge Function 的 QWEN_API_KEY secret 里, 前端拿不到。
 *
 * 实测约束(2026-09):
 *   - 默认维度 1024, 也支持 dimensions 传 512/1536
 *   - 单次批量上限 10 条: 传 12 条会被拒 ("batch size is invalid, it should not be larger than 10")
 */

const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings'
const MODEL = 'text-embedding-v4'

export const EMBED_DIM = 1024
export const EMBED_BATCH = 10

// 单条最长截断: 表格块拍平后可能很长, 截一下免得单条就超模型输入上限
const MAX_CHARS = 2000

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function embedBatch(batch: string[], key: string, attempt = 0): Promise<number[][]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: batch, dimensions: EMBED_DIM, encoding_format: 'float' }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const retryable = res.status === 429 || res.status >= 500
    if (retryable && attempt < 2) {
      await sleep(800 * (attempt + 1))
      return embedBatch(batch, key, attempt + 1)
    }
    throw new Error(`embedding HTTP ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json() as {
    data?: { index: number; embedding: number[] }[]
    usage?: unknown
  }
  const rows = json.data ?? []
  if (rows.length !== batch.length) {
    throw new Error(`embedding 返回条数不符: 期望 ${batch.length}, 实际 ${rows.length}`)
  }
  // 按 index 排序而不是依赖返回顺序
  return [...rows].sort((a, b) => a.index - b.index).map((r) => r.embedding)
}

/** 按 10 条一批切分请求; 返回顺序与输入一致 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = Deno.env.get('QWEN_API_KEY')
  if (!key) throw new Error('missing QWEN_API_KEY secret')

  const clean_ = texts.map(clean)
  const bad = clean_.findIndex((t) => t.length === 0)
  if (bad >= 0) throw new Error(`第 ${bad} 条文本为空, 不能送去 embed`)

  const out: number[][] = []
  for (let i = 0; i < clean_.length; i += EMBED_BATCH) {
    out.push(...await embedBatch(clean_.slice(i, i + EMBED_BATCH), key))
  }
  return out
}

/** 单条查询向量; 失败返回 null, 让调用方降级成纯全文检索 */
export async function embedQuery(text: string): Promise<{ vector: number[] | null; error: string | null }> {
  try {
    const [v] = await embedTexts([text])
    return { vector: v ?? null, error: v ? null : 'empty_vector' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[rag] 查询向量失败, 降级为纯全文检索:', message)
    return { vector: null, error: message.slice(0, 300) }
  }
}

/** pgvector 的文本输入格式, 直接塞给 SQL 里的 ::vector */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}
