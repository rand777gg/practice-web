// Supabase Edge Function: r2-list
// Lists objects in an R2 folder
import { S3Client, ListObjectsV2Command } from 'npm:@aws-sdk/client-s3@3'

function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

const R2_ACCESS_KEY = requireEnv('R2_ACCESS_KEY_ID')
const R2_SECRET_KEY = requireEnv('R2_SECRET_ACCESS_KEY')
const R2_ENDPOINT = requireEnv('R2_ENDPOINT')
const R2_BUCKET = requireEnv('R2_BUCKET')
const R2_PUBLIC_HOST = Deno.env.get('R2_PUBLIC_HOST') || 'r2-rpw.pguide.dev'

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  forcePathStyle: true,
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { prefix = 'pdf/', maxKeys = 50 } = await req.json() as { prefix?: string; maxKeys?: number }
    const cmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, MaxKeys: maxKeys })
    const result = await s3.send(cmd)

    const files = (result.Contents || []).map(o => ({
      key: o.Key || '',
      url: `https://${R2_PUBLIC_HOST}/${o.Key}`,
      size: o.Size || 0,
      lastModified: o.LastModified?.toISOString() || '',
    }))

    return new Response(JSON.stringify({ files, truncated: result.IsTruncated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
