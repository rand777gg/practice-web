import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '@/lib/supabase'
import { parsePageNumbers } from '@/lib/page-slices'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface PageUrl {
  p: number
  w: number
  h: number
  src: string
}

export const RENDER_SCALE = 2.0

/**
 * 同时渲染 + 上传多少页。
 *
 * 原来是一页一页来: 取预签名地址(一次函数调用) → PUT 到 R2, 每页两次网络往返, 全程串行。
 * 一本 295 页的书光排队就是近 600 次往返, 比渲染本身慢得多。改成预签名一把签完 + 下面这个
 * 并发数之后, 瓶颈回到 CPU(每页一个 canvas 加 WebP 编码)。
 *
 * 不再往上加是因为内存: 每页 2 倍缩放的画布约 8MB, 4 路并发就是 30MB 上下, 再加会先把标签页拖垮。
 */
export const RENDER_CONCURRENCY = 4

// 预签名一次签多少页。Edge Function 侧上限 800, 这里按 200 一批, 免得单个响应体太大。
const PRESIGN_CHUNK = 200

/**
 * 只读 PDF 页数。
 * 传 File 时走 object URL 而不是把整个文件读进 ArrayBuffer —— 几百 MB 的书只为数页数就吃满内存不值。
 */
export async function countPdfPages(source: File | string): Promise<number> {
  if (typeof source === 'string') {
    const pdf = await pdfjsLib.getDocument(source).promise
    const total = pdf.numPages
    pdf.destroy()
    return total
  }

  const objectUrl = URL.createObjectURL(source)
  try {
    const pdf = await pdfjsLib.getDocument(objectUrl).promise
    const total = pdf.numPages
    pdf.destroy()
    return total
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

// Render a single PDF page to a WebP blob
async function renderPageToBlob(page: pdfjsLib.PDFPageProxy): Promise<Blob> {
  const vp = page.getViewport({ scale: RENDER_SCALE })
  const cvs = document.createElement('canvas')
  cvs.width = vp.width
  cvs.height = vp.height
  const ctx = cvs.getContext('2d')!
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  return new Promise<Blob>((resolve, reject) => {
    cvs.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 0.85)
  })
}

interface PresignedUpload {
  url: string
  publicUrl: string
}

async function putBlob(presigned: PresignedUpload, blob: Blob): Promise<string> {
  const uploadRes = await fetch(presigned.url, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'image/webp' },
  })
  if (!uploadRes.ok) throw new Error(`R2 upload failed: HTTP ${uploadRes.status}`)
  return presigned.publicUrl
}

// Upload a blob to R2, return the public URL
async function uploadBlobToR2(blob: Blob, key: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('r2', {
    body: { action: 'upload-url', key, contentType: 'image/webp' },
  })
  if (error || !(data as any)?.url) throw new Error(`r2 upload-url failed: ${error}`)
  const { url: presignedUrl, publicUrl } = data as { url: string; publicUrl: string }

  return putBlob({ url: presignedUrl, publicUrl }, blob)
}

/** 一次函数调用签完一批 key。失败就返回 null, 让调用方退回逐页签名(老版本函数没有这个 action)。 */
async function presignUploads(keys: string[]): Promise<Map<string, PresignedUpload> | null> {
  const out = new Map<string, PresignedUpload>()
  try {
    for (let i = 0; i < keys.length; i += PRESIGN_CHUNK) {
      const items = keys.slice(i, i + PRESIGN_CHUNK).map((key) => ({ key, contentType: 'image/webp' }))
      const { data, error } = await supabase.functions.invoke('r2', {
        body: { action: 'upload-urls', items },
      })
      if (error) throw new Error(error.message)
      const urls = (data as { urls?: { key: string; url: string; publicUrl: string }[] } | null)?.urls
      if (!urls?.length) throw new Error('未返回上传地址')
      for (const u of urls) out.set(u.key, { url: u.url, publicUrl: u.publicUrl })
    }
    return out
  } catch (err) {
    console.warn('批量预签名失败, 退回逐页签名:', err)
    return null
  }
}

// Render pages and push each one to R2 as soon as it's rendered (RENDER_CONCURRENCY at a time)
export async function renderAndUploadPdfPages(
  pdfUrl: string,
  prefix: string,
  pageRanges?: string,
  onPageDone?: (done: number, total: number, pageUrl: PageUrl) => void,
): Promise<PageUrl[]> {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise
  const targetPages = parsePageNumbers(pageRanges, pdf.numPages)
  const total = targetPages.length
  const keyOf = (pageNum: number) => `${prefix}/p-${String(pageNum).padStart(4, '0')}.webp`
  const presigned = await presignUploads(targetPages.map(keyOf))

  const results: (PageUrl | undefined)[] = new Array(total)

  // 回调按页码顺序冒泡: 调用方(AI 解析页 / 历史记录)拿到一页就直接写库, 并发下按完成顺序回调的话
  // 存下来的页图顺序就是乱的, 阅读器会跳页。所以只在第 n 页之前全部完成时才把它们放出去。
  let nextToReport = 0
  const flushInOrder = () => {
    for (;;) {
      const pageUrl = results[nextToReport]
      if (nextToReport >= total || pageUrl === undefined) return
      onPageDone?.(nextToReport + 1, total, pageUrl)
      nextToReport++
    }
  }

  let cursor = 0
  const workers = Array.from({ length: Math.min(RENDER_CONCURRENCY, total) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= total) return
      const pageNum = targetPages[i]
      try {
        const page = await pdf.getPage(pageNum)
        const vp = page.getViewport({ scale: RENDER_SCALE })
        const blob = await renderPageToBlob(page)
        page.cleanup()

        const key = keyOf(pageNum)
        const signed = presigned?.get(key)
        const src = signed ? await putBlob(signed, blob) : await uploadBlobToR2(blob, key)

        results[i] = { p: pageNum, w: vp.width, h: vp.height, src }
      } catch (err) {
        console.warn(`Page ${pageNum} render/upload failed:`, err)
        results[i] = { p: pageNum, w: 0, h: 0, src: '' }
      }
      flushInOrder()
    }
  })
  await Promise.all(workers)

  pdf.destroy()
  // 失败的页只在 onPageDone 里报出去, 不进返回值 —— 跟串行版本一致, 调用方按 src 过滤也是这个前提
  return results.filter((p): p is PageUrl => p !== undefined)
}

// Render every page to an in-memory data URL. Used as a fallback when the pre-rendered
// R2 page images are missing (parse ran before page upload succeeded, or R2 is unreachable).
export async function renderPdfPagesLocally(
  pdfUrl: string,
  pageRanges?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<PageUrl[]> {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise
  const targetPages = parsePageNumbers(pageRanges, pdf.numPages)
  const results: PageUrl[] = []

  for (let i = 0; i < targetPages.length; i++) {
    const pageNum = targetPages[i]
    try {
      const page = await pdf.getPage(pageNum)
      const vp = page.getViewport({ scale: RENDER_SCALE })
      const cvs = document.createElement('canvas')
      cvs.width = vp.width
      cvs.height = vp.height
      const ctx = cvs.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      page.cleanup()
      results.push({ p: pageNum, w: vp.width, h: vp.height, src: cvs.toDataURL('image/jpeg', 0.82) })
    } catch (err) {
      console.warn(`Local render failed for page ${pageNum}:`, err)
    }
    onProgress?.(i + 1, targetPages.length)
    // Yield to the UI so a long book doesn't freeze the tab
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0))
  }

  pdf.destroy()
  return results
}

// Render first page of a PDF as thumbnail WebP, upload to R2. Caller should try direct URL first.
export async function renderPdfThumbnail(pdfUrl: string, thumbKey: string): Promise<string | null> {
  try {
    const pdf = await pdfjsLib.getDocument(pdfUrl).promise
    const page = await pdf.getPage(1)
    const vp = page.getViewport({ scale: 0.7 })
    const cvs = document.createElement('canvas')
    cvs.width = vp.width
    cvs.height = vp.height
    const ctx = cvs.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    page.cleanup()
    pdf.destroy()

    const blob = await new Promise<Blob>((resolve, reject) => {
      cvs.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/webp', 0.8)
    })

    const { data, error } = await supabase.functions.invoke('r2', {
      body: { key: thumbKey, contentType: 'image/webp' },
    })
    if (error || !(data as any)?.url) return null
    const { url: presignedUrl, publicUrl } = data as { url: string; publicUrl: string }

    const uploadRes = await fetch(presignedUrl, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': 'image/webp' },
    })
    if (!uploadRes.ok) return null
    return publicUrl
  } catch {
    return null
  }
}
