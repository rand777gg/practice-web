// MinerU proxy — relays browser requests to MinerU API to avoid CORS issues

const MINERU_BASE = 'https://mineru.net/api/v1/agent'

Deno.serve(async (req: Request) => {
  // CORS headers
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  const url = new URL(req.url)
  const path = url.pathname.replace('/mineru-proxy', '')
  const targetUrl = `${MINERU_BASE}${path}`

  try {
    if (req.method === 'PUT') {
      // File upload to OSS — forward raw body
      const body = await req.arrayBuffer()
      const res = await fetch(targetUrl, {
        method: 'PUT',
        body,
        headers: { 'Content-Type': req.headers.get('Content-Type') || 'application/octet-stream' },
      })
      return new Response(res.body, { status: res.status, headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    // GET or POST — forward as JSON
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
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
})
