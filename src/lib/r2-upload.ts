/**
 * 大文件直传 R2。
 *
 * 单次预签名 PUT 只能吃到一个连接的速率: 一份 200MB 的 PDF 或 1GB 的视频, 上行带宽是瓶颈时
 * 传几分钟都很正常。所以超过两个分片的文件改走 S3 分片上传 —— 每片直接 PUT 到 R2(不经过
 * Edge Function, 不吃函数内存和出网流量), 4 片并发把上行跑满。
 *
 * ETag 不由客户端读取: 分片的 PUT 响应里确实带 ETag, 但跨域时它默认不可见(桶的 CORS 没配
 * Access-Control-Expose-Headers, 而 ETag 不在 CORS 安全响应头名单里, 浏览器里读出来是 null)。
 * 所以 r2 函数在 complete 时用 ListParts 从 R2 侧把 ETag 补齐, 这样不必改桶的 CORS 配置。
 */
import { supabase } from '@/lib/supabase'

/** 单个分片大小。低于 R2/S3 的 5MB 下限会被拒, 取 8MB 是在往返次数和并发粒度之间折中。 */
const PART_SIZE = 8 * 1024 * 1024
/** 并发上传几片。再多也不会更快 —— 瓶颈是上行带宽, 不是连接数。 */
const UPLOAD_CONCURRENCY = 4
/** R2 单次 ListParts 上限, 也是分片数的硬上限; 超过就自动把分片调大。 */
const MAX_PARTS = 1000

async function callR2<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('r2', { body })
  if (error) throw new Error(`R2 ${String(body.action)} 失败: ${error.message}`)
  const payload = data as (T & { error?: string }) | null
  if (!payload) throw new Error(`R2 ${String(body.action)} 没有返回内容`)
  if (payload.error) throw new Error(`R2 ${String(body.action)} 失败: ${payload.error}`)
  return payload
}

/**
 * 分片 PUT 失败重试一次。
 * 一份几百 MB 的文件要传一分多钟, 中途被网络抖一下的概率不低, 为了一片就整份重传太亏。
 */
async function putPart(url: string, blob: Blob, partNumber: number): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'PUT', body: blob })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return
    } catch (err) {
      if (attempt >= 2) {
        const reason = err instanceof Error ? err.message : String(err)
        throw new Error(`第 ${partNumber} 片上传失败: ${reason}`, { cause: err })
      }
    }
  }
}

async function multipartUpload(
  file: Blob,
  key: string,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  // 分片数封顶 1000, 超大的文件自动把分片调大而不是报错
  const partSize = Math.max(PART_SIZE, Math.ceil(file.size / MAX_PARTS))
  const partCount = Math.ceil(file.size / partSize)

  const { uploadId } = await callR2<{ uploadId: string }>({ action: 'create-multipart', key, contentType })

  try {
    const { urls } = await callR2<{ urls: { partNumber: number; url: string }[] }>({
      action: 'upload-part-urls',
      key,
      uploadId,
      partNumbers: Array.from({ length: partCount }, (_, i) => i + 1),
    })

    let loaded = 0
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, urls.length) }, async () => {
      for (;;) {
        const i = cursor++
        if (i >= urls.length) return
        const { partNumber, url } = urls[i]
        const blob = file.slice((partNumber - 1) * partSize, partNumber * partSize)
        await putPart(url, blob, partNumber)
        loaded += blob.size
        onProgress?.(loaded, file.size)
      }
    }))

    const { publicUrl } = await callR2<{ publicUrl: string }>({
      action: 'complete-multipart', key, uploadId, partCount,
    })
    return publicUrl
  } catch (err) {
    // 放弃这次上传: 不然未完成的分片会一直留在 R2 上占空间
    await callR2({ action: 'abort-multipart', key, uploadId }).catch(() => {})
    throw err
  }
}

/**
 * 把 blob 传到 R2 并返回公网地址。
 * 小文件走单次预签名 PUT(一次往返就完事, 分片反而多个来回); 大文件走分片并发。
 */
export async function uploadBlobToR2(
  file: Blob,
  key: string,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  if (file.size > PART_SIZE * 2) return multipartUpload(file, key, contentType, onProgress)

  const { url, publicUrl } = await callR2<{ url: string; publicUrl: string }>({
    action: 'upload-url', key, contentType,
  })
  const res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
  if (!res.ok) throw new Error(`R2 上传失败: HTTP ${res.status}`)
  onProgress?.(file.size, file.size)
  return publicUrl
}
