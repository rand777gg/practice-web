const MINERU_V1_BASE = 'https://mineru.net/api/v1/agent'
const MINERU_V4_BASE = 'https://mineru.net/api/v4'

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

  try {
    // GET /pdf-proxy?url=<url> — proxy PDF binary with CORS (for pdfjsLib)
    if (req.method === 'GET' && pathname.endsWith('/pdf-proxy')) {
      const targetUrl = url.searchParams.get('url')
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'missing url param' }), {
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
      const res = await fetch(targetUrl)
      const text = await res.text()
      return jsonResponse(JSON.stringify({ text }), req)
    }

    // GET /download-zip?url=<url> — proxy zip download and extract full.md (for v4 precision)
    if (req.method === 'GET' && pathname.endsWith('/download-zip')) {
      const targetUrl = url.searchParams.get('url')
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'missing url param' }), {
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

    // Determine if this is a v4 precision request
    const mineruToken = req.headers.get('X-MinerU-Token')

    if (pathname.includes('/v4/')) {
      const afterFn = pathname.split('/v4')[1] || ''
      const targetUrl = `${MINERU_V4_BASE}${afterFn}`

      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (mineruToken) {
        fetchHeaders['Authorization'] = `Bearer ${mineruToken}`
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
  let jsonPriority = 0  // 3=layout, 2=middle, 1=content_list

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
      const isContentList = fileName === 'content_list.json' || fileName.endsWith('_content_list.json')
      const filePriority = isLayout ? 3 : isMiddle ? 2 : isContentList ? 1 : 0
      if (filePriority > jsonPriority) {
        const text = await tryDecompress()
        if (text) { jsonData = text; jsonPriority = filePriority }
      }

      if (markdown && jsonPriority >= 3) break
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
