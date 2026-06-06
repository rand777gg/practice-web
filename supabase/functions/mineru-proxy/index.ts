const MINERU_BASE = 'https://mineru.net/api/v1/agent'

Deno.serve(async (req: Request) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      const text = await res.text()
      return new Response(JSON.stringify({ text }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Forward to MinerU agent API
    const afterFn = pathname.split('/mineru-proxy')[1] || ''
    const targetUrl = `${MINERU_BASE}${afterFn}`

    const fetchOpts: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    }
    if (req.method === 'POST') fetchOpts.body = await req.text()
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
