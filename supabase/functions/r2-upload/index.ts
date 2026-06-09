// Supabase Edge Function: r2-upload
// Uploads files to Cloudflare R2 (private bucket), returns presigned URL
import { S3Client, PutObjectCommand, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3'

const R2_ACCESS_KEY = Deno.env.get('R2_ACCESS_KEY_ID')!
const R2_SECRET_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY')!
const R2_ENDPOINT = Deno.env.get('R2_ENDPOINT')!
const R2_BUCKET = Deno.env.get('R2_BUCKET')!
// Optional: custom domain that proxies presigned URLs (can be omitted)
const R2_PUBLIC_URL = Deno.env.get('R2_PUBLIC_URL') || ''

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const PRESIGNED_EXPIRE_S = 365 * 24 * 60 * 60 * 10 // 10 years — effectively permanent

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
  'Access-Control-Max-Age': '86400',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string) || 'questions'

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return new Response(JSON.stringify({ error: `Unsupported file type: ${file.type}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large (max 10MB)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ext = file.name.split('.').pop() || 'bin'
    const key = `${folder}/${crypto.randomUUID()}.${ext}`

    const buf = await file.arrayBuffer()
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: new Uint8Array(buf),
      ContentType: file.type,
    }))

    // Generate presigned URL — bucket stays private, no public access needed
    const presignedUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }), { expiresIn: PRESIGNED_EXPIRE_S })

    // If a custom domain is configured, rewrite URL to use it
    const url = R2_PUBLIC_URL
      ? presignedUrl.replace(new URL(R2_ENDPOINT).host, new URL(R2_PUBLIC_URL).host)
      : presignedUrl

    return new Response(JSON.stringify({ url, key, name: file.name, type: file.type, size: file.size }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
