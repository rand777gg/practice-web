import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from "npm:@aws-sdk/client-s3@3"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3"
import { corsHeaders, corsResponse, corsOk } from "../_shared/cors.ts"

function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

const R2_ACCESS_KEY = requireEnv("R2_ACCESS_KEY_ID")
const R2_SECRET_KEY = requireEnv("R2_SECRET_ACCESS_KEY")
const R2_ENDPOINT = requireEnv("R2_ENDPOINT")
const R2_BUCKET = requireEnv("R2_BUCKET")
const R2_PUBLIC_HOST = Deno.env.get("R2_PUBLIC_HOST") || "r2-rpw.pguide.dev"

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
const MAX_SIZE = 200 * 1024 * 1024

const s3 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  forcePathStyle: true,
})

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsOk()

  const contentType = req.headers.get("content-type") || ""

  try {
    // --- serve ---
    if (req.method === "GET") {
      const key = new URL(req.url).searchParams.get("key")
      if (!key) return corsResponse("Missing key", { status: 400 })

      const result = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
      if (!result.Body) return corsResponse("Not found", { status: 404 })

      const bodyBytes = await result.Body.transformToByteArray()
      return corsResponse(bodyBytes, {
        headers: {
          "Content-Type": result.ContentType || "application/octet-stream",
          "Cache-Control": "public, max-age=86400, immutable",
          "ETag": result.ETag || key,
        },
      })
    }

    // --- upload (multipart form) ---
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData()
      const file = formData.get("file") as File | null
      const folder = (formData.get("folder") as string) || "images"

      if (!file) return corsResponse(JSON.stringify({ error: "No file" }), { status: 400, headers: { "Content-Type": "application/json" } })
      if (!ALLOWED_FILE_TYPES.includes(file.type)) return corsResponse(JSON.stringify({ error: `Unsupported type: ${file.type}` }), { status: 400, headers: { "Content-Type": "application/json" } })
      if (file.size > MAX_SIZE) return corsResponse(JSON.stringify({ error: "File too large" }), { status: 400, headers: { "Content-Type": "application/json" } })

      const ext = file.name.split(".").pop() || "bin"
      const key = `${folder}/${crypto.randomUUID()}.${ext}`
      const buf = await file.arrayBuffer()

      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET, Key: key,
        Body: new Uint8Array(buf), ContentType: file.type,
      }))

      return corsResponse(JSON.stringify({ url: `https://${R2_PUBLIC_HOST}/${key}`, key, name: file.name, type: file.type, size: file.size }), { headers: { "Content-Type": "application/json" } })
    }

    // --- JSON actions ---
    const body: Record<string, unknown> = await req.json()
    const action = body.action as string

    if (action === "upload-url") {
      const key = body.key as string
      const ct = (body.contentType as string) || "application/octet-stream"
      if (!key) return corsResponse(JSON.stringify({ error: "Missing key" }), { status: 400, headers: { "Content-Type": "application/json" } })

      const signedUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: ct }), { expiresIn: 300 })
      return corsResponse(JSON.stringify({ url: signedUrl, publicUrl: `https://${R2_PUBLIC_HOST}/${key}`, key }), { headers: { "Content-Type": "application/json" } })
    }

    if (action === "delete") {
      let keys = (body.keys as string[]) || []
      if (!keys.length && body.prefix) {
        const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: body.prefix as string, MaxKeys: 1000 })
        const result = await s3.send(listCmd)
        keys = (result.Contents || []).map(o => o.Key!).filter(Boolean)
      }
      if (!keys.length) return corsResponse(JSON.stringify({ deleted: 0 }), { headers: { "Content-Type": "application/json" } })

      await s3.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: keys.map(k => ({ Key: k })) } }))
      return corsResponse(JSON.stringify({ deleted: keys.length }), { headers: { "Content-Type": "application/json" } })
    }

    if (action === "list") {
      const prefix = (body.prefix as string) || "pdf/"
      const maxKeys = (body.maxKeys as number) || 50
      const result = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, MaxKeys: maxKeys }))

      const files = (result.Contents || []).map(o => ({
        key: o.Key || "",
        url: `https://${R2_PUBLIC_HOST}/${o.Key}`,
        size: o.Size || 0,
        lastModified: o.LastModified?.toISOString() || "",
      }))

      return corsResponse(JSON.stringify({ files, truncated: result.IsTruncated }), { headers: { "Content-Type": "application/json" } })
    }

    return corsResponse(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { "Content-Type": "application/json" } })
  } catch (err) {
    console.error("r2 error:", err)
    return corsResponse(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})
