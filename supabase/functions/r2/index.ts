import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, ListPartsCommand } from "npm:@aws-sdk/client-s3@3"
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
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
// 批量签名的条数上限。一本 600 页的书一次要签 600 个键, 响应体约 300KB, 留够余量;
// 分片上传也复用这个上限, 所以不能低于客户端的最大分片数。
const MAX_PRESIGN_BATCH = 1000

// ── 鉴权 ──
// 这个函数以前**没有任何身份校验**: 谁把前端产物里的公开 key 抠出来, 谁就能列举整桶、
// 下载任意对象、往任意 key 上传, 还能用 action:'delete' + prefix 一次删掉最多 1000 个对象
// (文献 PDF、页图都躺在桶里)。线上实测过匿名 list 能读到真实的 pdf/*.pdf。
//
// 现在的规矩:
//   · 必须登录(函数内自己查 JWT, 网关那道 anon key 不算身份);
//   · list / delete 只有管理员能做(delete 的 prefix 形式尤其);
//   · 普通用户只能在自己内容那几类前缀里 上传 / 删除, 碰不到 pdf/ 这类资料库对象。
const SUPABASE_URL = requireEnv("SUPABASE_URL")
const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
const USER_KEY_PREFIXES = ["notes/", "videos/", "images/", "bank/", "avatars/"]

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function currentUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (!token) return null
  const { data: { user } } = await adminClient.auth.getUser(token)
  return user ?? null
}

async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await adminClient.from("profiles").select("role").eq("id", userId).maybeSingle()
  return data?.role === "admin"
}

/** 普通用户只允许碰自己内容的前缀; 顺带挡掉 ../ 这类越界写法 */
function keyAllowedForUser(key: string): boolean {
  if (!key || key.startsWith("/") || key.includes("..")) return false
  return USER_KEY_PREFIXES.some((p) => key.startsWith(p))
}

function folderAllowedForUser(folder: string): boolean {
  return USER_KEY_PREFIXES.some((p) => `${folder}/`.startsWith(p))
}

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
    const user = await currentUser(req)
    if (!user) {
      return corsResponse(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } })
    }
    // 管理员判定按需查库: 绝大多数请求是普通用户上传, 不该每次都多打一次 profiles
    let adminFlag: boolean | null = null
    const isAdmin = async () => (adminFlag ??= await isAdminUser(user.id))
    const deny = (msg: string) => corsResponse(JSON.stringify({ error: msg }), { status: 403, headers: { "Content-Type": "application/json" } })

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

      if (!(await isAdmin()) && !folderAllowedForUser(folder)) return deny("该目录不允许上传")

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
      if (!(await isAdmin()) && !keyAllowedForUser(key)) return deny("该路径不允许上传")

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
      if (!(await isAdmin()) && !items.every((it) => keyAllowedForUser(String(it.key ?? "")))) return deny("有路径不允许上传")

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

    // ── 分片上传 ──
    // 大文件单次 PUT 只能吃到一个连接的速率, 几百 MB 到 1GB 的视频全靠它非常慢。分片让浏览器
    // 直传 R2(不走函数, 不吃函数内存和出网), 4 片并发跑满上行带宽。
    //
    // 三件事必须由服务端做, 所以是三个 action 而不是一个:
    //   - create-multipart  拿到 uploadId
    //   - upload-part-urls  给每片签一个直传地址
    //   - complete-multipart 补 ETag 并收尾
    // ETag 不能让客户端读: 分片的 PUT 响应里确实有 ETag, 但桶的 CORS 没配
    // Access-Control-Expose-Headers, 而 ETag 不在 CORS 安全响应头名单里, 浏览器里读出来是 null。
    // 所以收尾时用 ListParts 从 R2 侧把 ETag 捞出来, 这样不用动桶的 CORS 配置。
    if (action === "create-multipart") {
      const key = body.key as string
      const ct = (body.contentType as string) || "application/octet-stream"
      if (!key) return corsResponse(JSON.stringify({ error: "Missing key" }), { status: 400, headers: { "Content-Type": "application/json" } })
      if (!(await isAdmin()) && !keyAllowedForUser(key)) return deny("该路径不允许上传")

      const created = await s3.send(new CreateMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, ContentType: ct }))
      if (!created.UploadId) return corsResponse(JSON.stringify({ error: "R2 未返回 uploadId" }), { status: 500, headers: { "Content-Type": "application/json" } })
      return corsResponse(JSON.stringify({ key, uploadId: created.UploadId, publicUrl: `https://${R2_PUBLIC_HOST}/${key}` }), { headers: { "Content-Type": "application/json" } })
    }

    if (action === "upload-part-urls") {
      const key = body.key as string
      const uploadId = body.uploadId as string
      const partNumbers = (body.partNumbers as number[]) || []
      if (!key || !uploadId || !partNumbers.length) return corsResponse(JSON.stringify({ error: "Missing key/uploadId/partNumbers" }), { status: 400, headers: { "Content-Type": "application/json" } })
      if (partNumbers.length > MAX_PRESIGN_BATCH) return corsResponse(JSON.stringify({ error: `Too many parts: ${partNumbers.length} > ${MAX_PRESIGN_BATCH}` }), { status: 400, headers: { "Content-Type": "application/json" } })

      const urls = await Promise.all(partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(s3, new UploadPartCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 }),
      })))
      return corsResponse(JSON.stringify({ urls }), { headers: { "Content-Type": "application/json" } })
    }

    if (action === "complete-multipart") {
      const key = body.key as string
      const uploadId = body.uploadId as string
      const partCount = body.partCount as number
      if (!key || !uploadId || !partCount) return corsResponse(JSON.stringify({ error: "Missing key/uploadId/partCount" }), { status: 400, headers: { "Content-Type": "application/json" } })
      if (!(await isAdmin()) && !keyAllowedForUser(key)) return deny("该路径不允许上传")

      const listed = await s3.send(new ListPartsCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, MaxParts: MAX_PRESIGN_BATCH }))
      const uploaded = (listed.Parts || []).filter(p => p.PartNumber && p.ETag)
      if (uploaded.length !== partCount || listed.IsTruncated) {
        await s3.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }))
        return corsResponse(JSON.stringify({ error: `分片数对不上: R2 上有 ${uploaded.length} 片, 客户端传了 ${partCount} 片, 已放弃这次上传` }), { status: 400, headers: { "Content-Type": "application/json" } })
      }

      const parts = uploaded
        .map(p => ({ PartNumber: p.PartNumber as number, ETag: p.ETag as string }))
        .sort((a, b) => a.PartNumber - b.PartNumber)
      await s3.send(new CompleteMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }))

      return corsResponse(JSON.stringify({ key, parts: parts.length, publicUrl: `https://${R2_PUBLIC_HOST}/${key}` }), { headers: { "Content-Type": "application/json" } })
    }

    if (action === "abort-multipart") {
      const key = body.key as string
      const uploadId = body.uploadId as string
      if (!key || !uploadId) return corsResponse(JSON.stringify({ error: "Missing key/uploadId" }), { status: 400, headers: { "Content-Type": "application/json" } })

      await s3.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: key, UploadId: uploadId }))
      return corsResponse(JSON.stringify({ aborted: true, key }), { headers: { "Content-Type": "application/json" } })
    }

    if (action === "delete") {
      const admin = await isAdmin()
      let keys = (body.keys as string[]) || []
      if (body.prefix) {
        // 按前缀删是"一次最多 1000 个"的批量操作, 只给管理员
        if (!admin) return deny("只有管理员能按前缀删除")
        if (!keys.length) {
          const listCmd = new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: body.prefix as string, MaxKeys: 1000 })
          const result = await s3.send(listCmd)
          keys = (result.Contents || []).map(o => o.Key!).filter(Boolean)
        }
      }
      if (!admin && !keys.every(keyAllowedForUser)) return deny("有路径不允许删除")
      if (!keys.length) return corsResponse(JSON.stringify({ deleted: 0 }), { headers: { "Content-Type": "application/json" } })

      await s3.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: keys.map(k => ({ Key: k })) } }))
      return corsResponse(JSON.stringify({ deleted: keys.length }), { headers: { "Content-Type": "application/json" } })
    }

    if (action === "list") {
      if (!(await isAdmin())) return deny("只有管理员能列举存储")
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
