// Supabase Edge Function: r2-image
// Serves files from private R2 bucket via proxy
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3'

function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

const R2_ACCESS_KEY = requireEnv('R2_ACCESS_KEY_ID')
const R2_SECRET_KEY = requireEnv('R2_SECRET_ACCESS_KEY')
const R2_ENDPOINT = requireEnv('R2_ENDPOINT')
const R2_BUCKET = requireEnv('R2_BUCKET')

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  forcePathStyle: true,
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const key = url.searchParams.get('key')
    if (!key) {
      return new Response('Missing key parameter', { status: 400, headers: corsHeaders })
    }

    const result = await s3.send(new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }))

    if (!result.Body) {
      return new Response('Not found', { status: 404, headers: corsHeaders })
    }

    // Stream the R2 response body directly
    const headers = new Headers(corsHeaders)
    if (result.ContentType) headers.set('Content-Type', result.ContentType)
    headers.set('Cache-Control', 'public, max-age=86400, immutable')
    headers.set('ETag', result.ETag || key)

    return new Response(result.Body as ReadableStream, { headers })
  } catch (err) {
    console.error('r2-image error:', err)
    return new Response(String(err), { status: 500, headers: corsHeaders })
  }
})
