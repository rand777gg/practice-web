// MinerU proxy — relays browser requests to avoid CORS issues
// Supports both lightweight (agent v1) and precise (v4) APIs

const AGENT_BASE = 'https://mineru.net/api/v1/agent'
const V4_BASE = 'https://mineru.net/api/v4'

Deno.serve(async (req: Request) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathname = url.pathname

  try {
    // GET /download?url=<url> — proxy content download
    if (req.method === 'GET' && pathname.endsWith('/download')) {
      const targetUrl = url.searchParams.get('url')
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'missing url param' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const res = await fetch(targetUrl)
      // For zip files, return as binary; for markdown, return as JSON { text }
      const ct = res.headers.get('Content-Type') || ''
      if (ct.includes('zip') || ct.includes('octet-stream')) {
        const blob = await res.arrayBuffer()
        return new Response(blob, {
          status: res.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/zip' },
        })
      }
      const text = await res.text()
      return new Response(JSON.stringify({ text }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // v4 precise API — proxy to mineru.net/api/v4/...
    if (pathname.includes('/v4/')) {
      const v4Path = pathname.split('/v4')[1] || ''
      const targetUrl = `${V4_BASE}${v4Path}`

      const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      const mineruToken = req.headers.get('X-MinerU-Token')
      if (mineruToken) fetchHeaders['Authorization'] = `Bearer ${mineruToken}`

      const fetchOpts: RequestInit = { method: req.method, headers: fetchHeaders }
      if (req.method === 'POST') fetchOpts.body = await req.text()

      const res = await fetch(targetUrl, fetchOpts)
      const data = await res.text()
      return new Response(data, {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Agent lightweight API — forward to mineru.net/api/v1/agent
    const afterFn = pathname.split('/mineru-proxy')[1] || ''
    const targetUrl = `${AGENT_BASE}${afterFn}`

    const fetchOpts: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (req.method === 'POST') {
      fetchOpts.body = await req.text()
    }
    const res = await fetch(targetUrl, fetchOpts)
    const data = await res.text()
    return new Response(data, {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
