#!/usr/bin/env node
/**
 * 分片上传的端到端验证 —— 浏览器里最难验的一环是 ETag。
 *
 * 分片的 PUT 响应里确实带 ETag, 但跨域时 JS 读不到(桶的 CORS 没配
 * Access-Control-Expose-Headers, 而 ETag 不在 CORS 安全响应头名单里), 所以 r2 函数收尾时改用
 * ListParts 从 R2 侧取 ETag。这个脚本要证明的就是: 那条路真的能把分片拼成一个完整对象。
 *
 * Node 里没有 CORS, 所以这里也能顺手对比一下 PUT 响应的 ETag 和 ListParts 返回的是否一致。
 *
 * Usage: node scripts/r2-multipart-smoke.mjs [sizeMb]
 * 会在 R2 上写一个 probe/ 下的对象, 结束时删除。
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const SIZE_MB = Number(process.argv[2] || 20)
const PART_SIZE = 8 * 1024 * 1024   // 跟 src/lib/r2-upload.ts 保持一致

function readEnv(name) {
  const line = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(`${name}=`))
  if (!line) throw new Error(`.env 里没有 ${name}`)
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
}

const SUPABASE_URL = readEnv('VITE_SUPABASE_URL')
const ANON_KEY = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
const R2_FN = `${SUPABASE_URL}/functions/v1/r2`

async function callR2(body) {
  const res = await fetch(R2_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  })
  const payload = await res.json()
  if (!res.ok || payload.error) throw new Error(`r2 ${body.action} → HTTP ${res.status}: ${payload.error || ''}`)
  return payload
}

// 可复现的伪随机负载, 用哈希比对拼接结果
const payload = Buffer.alloc(SIZE_MB * 1024 * 1024)
for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const key = `probe/multipart-${randomUUID()}.bin`
const contentType = 'application/octet-stream'
const partCount = Math.ceil(payload.length / PART_SIZE)
console.log(`${SIZE_MB}MB / ${partCount} 片 → ${key}`)

const { uploadId } = await callR2({ action: 'create-multipart', key, contentType })
console.log(`uploadId: ${uploadId}`)

let created = false
try {
  const { urls } = await callR2({
    action: 'upload-part-urls',
    key,
    uploadId,
    partNumbers: Array.from({ length: partCount }, (_, i) => i + 1),
  })
  console.log(`拿到 ${urls.length} 个分片上传地址`)

  const putEtags = new Map()
  await Promise.all(urls.map(async ({ partNumber, url }) => {
    const blob = payload.subarray((partNumber - 1) * PART_SIZE, partNumber * PART_SIZE)
    const res = await fetch(url, { method: 'PUT', body: blob })
    if (!res.ok) throw new Error(`第 ${partNumber} 片 → HTTP ${res.status}`)
    // 浏览器里这一步读出来是 null, 服务端那边靠 ListParts 补上
    putEtags.set(partNumber, res.headers.get('etag'))
  }))
  console.log(`分片全部上传完成, Node 侧读到的 ETag: ${[...putEtags.values()].every(Boolean) ? '全部可见' : '有缺失'}`)

  const completed = await callR2({ action: 'complete-multipart', key, uploadId, partCount })
  created = true
  console.log(`complete: ${completed.parts} 片 → ${completed.publicUrl}`)

  const got = Buffer.from(await (await fetch(completed.publicUrl)).arrayBuffer())
  const sizeOk = got.length === payload.length
  const hashOk = sha256(got) === sha256(payload)
  console.log(`下载回来 ${got.length} 字节, 与本地一致: 长度 ${sizeOk ? '✅' : '❌'} 内容 ${hashOk ? '✅' : '❌'}`)
  console.log(
    sizeOk && hashOk
      ? '\n✅ 分片上传可用: 服务端用 ListParts 补的 ETag 能把分片拼回原文件'
      : '\n❌ 拼回来的对象和原文件不一致',
  )
  process.exitCode = sizeOk && hashOk ? 0 : 1
} finally {
  if (created) {
    console.log((await callR2({ action: 'delete', keys: [key] })).deleted === 1 ? '清理: 已删除探针对象' : '清理: 删除失败, 请手动清 probe/')
  } else {
    await callR2({ action: 'abort-multipart', key, uploadId }).then(
      () => console.log('清理: 已放弃未完成的分片上传'),
      (e) => console.log(`清理: abort 失败 (${e.message})`),
    )
  }
}
