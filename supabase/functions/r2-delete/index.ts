// Supabase Edge Function: r2-delete
// Deletes objects from R2 by prefix or key list
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from 'npm:@aws-sdk/client-s3@3'

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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json() as { prefix?: string; keys?: string[] }

    let keys: string[] = body.keys || []

    // List by prefix if no explicit keys
    if (!keys.length && body.prefix) {
      const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: body.prefix, MaxKeys: 1000 })
      const result = await s3.send(listCmd)
      keys = (result.Contents || []).map(o => o.Key!).filter(Boolean)
    }

    if (!keys.length) {
      return new Response(JSON.stringify({ deleted: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // S3 deleteObjects supports up to 1000 keys per request
    const cmd = new DeleteObjectsCommand({
      Bucket: R2_BUCKET,
      Delete: { Objects: keys.map(k => ({ Key: k })) },
    })
    await s3.send(cmd)

    return new Response(JSON.stringify({ deleted: keys.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
