import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MINERU_V1_BASE = 'https://mineru.net/api/v1/agent'
const MINERU_V4_BASE = 'https://mineru.net/api/v4'

// 平台自己那把 MinerU token 只存在 secret, 不再随前端产物下发(以前是 VITE_MINERU_TOKEN,
// 构建期内联, 谁打开产物都能抠走)。
// 调用方带 X-MinerU-Token = 用他自己的额度(AI 设置页里填的); 不带就用平台的。
const PLATFORM_TOKEN = Deno.env.get('MINERU_TOKEN') ?? ''

// ── 鉴权 ──
// 这个函数以前没有任何身份校验, 而它手里有平台的 MinerU token(计费)和"服务端拉任意 URL"
// 的能力。线上实测过: 只带公开的前端 key 就能建出真实的 MinerU 解析任务, 也能把
// /pdf-proxy?url= 当任意地址的代理(SSRF: 内网服务、云元数据都能读)。
// 现在所有路由都要求**已登录的用户**; url 类路由再加一层目标主机白名单。
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function currentUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await adminClient.auth.getUser(token)
  return user ?? null
}

/** 只允许拉"MinerU 自己"和"我们自己的存储"; 纯 IP 一律拒(挡掉 127.0.0.1 / 169.254.169.254) */
const ALLOWED_FETCH_HOSTS = ['mineru.net', 'cdn-mineru.openxlab.org.cn', '.supabase.co', '.r2.cloudflarestorage.com']

function isAllowedTarget(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':') || host === 'localhost') return false
    const r2Host = (Deno.env.get('R2_PUBLIC_HOST') ?? '').toLowerCase()
    if (r2Host && host === r2Host) return true
    return ALLOWED_FETCH_HOSTS.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h))
  } catch {
    return false
  }
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MinerU-Token',
}

// ponytail: gzip text responses to cut egress ~80% for markdown/JSON
async function compressIfAccepted(body: string, req: Request): Promise<Uint8Array> {
  const accept = req.headers.get('Accept-Encoding') || ''
  if (!accept.includes('gzip')) return new TextEncoder().encode(body)

  const stream = new CompressionStream('gzip')
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  writer.write(new TextEncoder().encode(body))
  writer.close()

  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) { out.set(c, pos); pos += c.length }
  return out
}

function jsonResponse(body: string, req: Request, extraHeaders?: Record<string, string>): Promise<Response> {
  return compressIfAccepted(body, req).then(compressed => {
    const bodyBytes = new TextEncoder().encode(body)
    const headers = new Headers({ ...corsHeaders, 'Content-Type': 'application/json' })
    if (compressed.length < bodyBytes.length) {
      headers.set('Content-Encoding', 'gzip')
    } else {
      return new Response(bodyBytes, { headers })
    }
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v)
    }
    return new Response(compressed, { headers })
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathname = url.pathname

  const user = await currentUser(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // GET /pdf-proxy?url=<url> — proxy PDF binary with CORS (for pdfjsLib)
    if (req.method === 'GET' && pathname.endsWith('/pdf-proxy')) {
      const targetUrl = url.searchParams.get('url')
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'missing url param' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!isAllowedTarget(targetUrl)) {
        return new Response(JSON.stringify({ error: 'target_not_allowed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const fetchHeaders: Record<string, string> = {}
      if (targetUrl.includes('/storage/v1/')) {
        const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''
        if (anonKey) fetchHeaders['Authorization'] = `Bearer ${anonKey}`
      }
      const res = await fetch(targetUrl, { headers: fetchHeaders })
      return new Response(res.body, {
        status: res.status,
        headers: {
          ...corsHeaders,
          'Content-Type': res.headers.get('Content-Type') || 'application/pdf',
          'Content-Length': res.headers.get('Content-Length') || '',
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }

    // GET /download?url=<url> — proxy content download (for lightweight v1 markdown)
    if (req.method === 'GET' && pathname.endsWith('/download')) {
      const targetUrl = url.searchParams.get('url')
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'missing url param' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!isAllowedTarget(targetUrl)) {
        return new Response(JSON.stringify({ error: 'target_not_allowed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const res = await fetch(targetUrl)
      const text = await res.text()
      return jsonResponse(JSON.stringify({ text }), req)
    }

    // GET /zip-proxy?url=<url> — 把 MinerU 的结果 zip 原样流给浏览器, 由前端解压。
    //
    // 为什么不继续在服务端解压: 结果里除了 full.md 还有 images/, 一本 300 页的书图片有几十 MB,
    // 服务端解压 + base64 要同时持有 zip 原字节、解压后字节和 base64 字符串(约 2.4 倍),
    // 256MB 的函数内存很容易被打爆, 而浏览器不在乎这点内存。
    // 流式转发也让这里不用关心 zip 的实际大小。
    if (req.method === 'GET' && pathname.endsWith('/zip-proxy')) {
      const targetUrl = url.searchParams.get('url')
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'missing url param' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!isAllowedTarget(targetUrl)) {
        return new Response(JSON.stringify({ error: 'target_not_allowed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const res = await fetch(targetUrl)
      return new Response(res.body, {
        status: res.status,
        headers: {
          ...corsHeaders,
          'Content-Type': res.headers.get('Content-Type') || 'application/zip',
          'Content-Length': res.headers.get('Content-Length') || '',
        },
      })
    }

    // GET /download-zip?url=<url> — proxy zip download and extract full.md (for v4 precision)
    if (req.method === 'GET' && pathname.endsWith('/download-zip')) {
      const targetUrl = url.searchParams.get('url')
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'missing url param' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!isAllowedTarget(targetUrl)) {
        return new Response(JSON.stringify({ error: 'target_not_allowed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const res = await fetch(targetUrl)
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `download failed: ${res.status}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const zipBytes = new Uint8Array(await res.arrayBuffer())
      const { markdown, jsonData } = await extractZipFiles(zipBytes)
      return jsonResponse(JSON.stringify({ text: markdown, jsonData }), req)
    }

    // GET /config — 平台配没配 MinerU(前端据此决定默认解析模式/是否显示"请自填 token")。
    // 只吐一个布尔值, 拿不到 token 本身。
    if (req.method === 'GET' && pathname.endsWith('/config')) {
      return jsonResponse(JSON.stringify({ platform_token: !!PLATFORM_TOKEN }), req)
    }

    // Determine if this is a v4 precision request
    const mineruToken = req.headers.get('X-MinerU-Token') || PLATFORM_TOKEN

    if (pathname.includes('/v4/')) {
      // 精确解析必须带 token: 调用方没给、平台也没配, 就明确说清楚,
      // 别把一个 401 从 MinerU 那边原样抛给用户(那看不出是谁的问题)。
      if (!mineruToken) {
        return new Response(JSON.stringify({
          error: 'mineru_token_missing',
          message: '平台未配置 MinerU Token, 请在 AI 设置里填写自己的 token',
        }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const afterFn = pathname.split('/v4')[1] || ''
      const targetUrl = `${MINERU_V4_BASE}${afterFn}`

      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mineruToken}`,
      }

      const fetchOpts: RequestInit = {
        method: req.method,
        headers: fetchHeaders,
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        fetchOpts.body = await req.text()
      }
      const res = await fetch(targetUrl, fetchOpts)
      const data = await res.text()
      return jsonResponse(data, req)
    }

    // v1 lightweight routes (backward compatible)
    const afterFn = pathname.split('/mineru-proxy')[1] || ''
    const targetUrl = `${MINERU_V1_BASE}${afterFn}`

    const fetchOpts: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (req.method === 'POST') fetchOpts.body = await req.text()
    const res = await fetch(targetUrl, fetchOpts)
    const data = await res.text()
    return jsonResponse(data, req)
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function extractZipFiles(zipBytes: Uint8Array): Promise<{ markdown: string; jsonData?: string }> {
  const decoder = new TextDecoder()
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)

  let markdown = ''
  let jsonData: string | undefined
  let jsonPriority = 0  // 5=layout, 4=middle, 3=content_list_v2, 2=content_list, 1=model

  let offset = 0
  while (offset < zipBytes.length - 30) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      offset++
      continue
    }

    const compression = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const uncompressedSize = view.getUint32(offset + 22, true)
    const fileNameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)

    const fileName = decoder.decode(zipBytes.slice(offset + 30, offset + 30 + fileNameLen))
    const dataStart = offset + 30 + fileNameLen + extraLen
    const dataEnd = dataStart + compressedSize

    if (dataEnd <= zipBytes.length) {
      const compressed = zipBytes.slice(dataStart, dataEnd)

      const tryDecompress = async (): Promise<string | null> => {
        if (compression === 0) return decoder.decode(compressed)
        if (compression === 8) {
          const inflated = await inflateAsync(compressed)
          if (inflated) return decoder.decode(inflated)
        }
        return null
      }

      if (fileName === 'full.md') {
        const text = await tryDecompress()
        if (text) markdown = text
      }
      const isLayout = fileName === 'layout.json' || fileName.endsWith('_layout.json')
      const isMiddle = fileName === 'middle.json' || fileName.endsWith('_middle.json')
      // v2 必须排在 v1 前面判断: xxx_content_list_v2.json 也以 content_list 开头
      const isContentListV2 = fileName === 'content_list_v2.json' || fileName.endsWith('_content_list_v2.json')
      const isContentList = !isContentListV2
        && (fileName === 'content_list.json' || fileName.endsWith('_content_list.json'))
      const isModel = fileName === 'model.json' || fileName.endsWith('_model.json')
      const filePriority = isLayout ? 5
        : isMiddle ? 4
        : isContentListV2 ? 3
        : isContentList ? 2
        : isModel ? 1
        : 0
      if (filePriority > jsonPriority) {
        const text = await tryDecompress()
        if (text) { jsonData = text; jsonPriority = filePriority }
      }

      if (markdown && jsonPriority >= 5) break
    }

    offset = dataEnd
  }

  if (!markdown) {
    let binary = ''
    for (let i = 0; i < zipBytes.length; i++) binary += String.fromCharCode(zipBytes[i])
    return { markdown: `__B64ZIP__${btoa(binary)}`, jsonData }
  }

  return { markdown, jsonData }
}

async function inflateAsync(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const ds = new DecompressionStream('deflate-raw')
    const writer = ds.writable.getWriter()
    writer.write(data)
    writer.close()

    const reader = ds.readable.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
    const result = new Uint8Array(totalLen)
    let pos = 0
    for (const chunk of chunks) {
      result.set(chunk, pos)
      pos += chunk.length
    }
    return result
  } catch {
    return null
  }
}
