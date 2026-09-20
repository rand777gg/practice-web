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
// 以前这里有硬编码兜底域名, 域名一过期整个函数就静默发死链(页图全白、MinerU 拉到停放页),
// 所以改成必须显式配置: 少配置就报错, 比悄悄发死链好排查。
const R2_PUBLIC_HOST = requireEnv("R2_PUBLIC_HOST")

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"]
const ALLOWED_FILE_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, "application/pdf", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
// Multipart uploads buffer the whole file in function memory, so keep the cap
// low; large videos must use the presigned "upload-url" path (direct to R2).
const MAX_SIZE = 200 * 1024 * 1024
// 批量签名的条数上限。一本 600 页的书一次要签 600 个键, 响应体约 300KB, 留够余量。
const MAX_PRESIGN_BATCH = 800

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

    // 一次签一批。签名是本地 HMAC, 不产生网络请求, 所以批量签名几乎不花时间; 而前端渲染页图时
    // 每页都来一次函数调用的话, 几百页就是几百次往返, 光排队等待就比渲染本身还久。
    if (action === "upload-urls") {
      const items = (body.items as { key?: string; contentType?: string }[]) || []
      if (!items.length) return corsResponse(JSON.stringify({ error: "Missing items" }), { status: 400, headers: { "Content-Type": "application/json" } })
      if (items.length > MAX_PRESIGN_BATCH) {
        return corsResponse(JSON.stringify({ error: `Too many items: ${items.length} > ${MAX_PRESIGN_BATCH}` }), { status: 400, headers: { "Content-Type": "application/json" } })
      }

      // 有效期给到 1 小时而不是单签那样的 5 分钟: 这一批是在开始渲染之前一次性签好的, 之后每页
      // 渲染完才 PUT 上来。几百页渲染 + 上传要跑几分钟, 5 分钟会让排在后面的页全部 403。
      const urls = await Promise.all(items.map(async (item) => {
        const key = item.key as string
        const ct = item.contentType || "application/octet-stream"
        const signedUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: ct }), { expiresIn: 3600 })
        return { key, url: signedUrl, publicUrl: `https://${R2_PUBLIC_HOST}/${key}` }
      }))
      return corsResponse(JSON.stringify({ urls }), { headers: { "Content-Type": "application/json" } })
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
