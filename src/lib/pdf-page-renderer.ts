import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '@/lib/supabase'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface PageUrl {
  p: number
  w: number
  h: number
  src: string
}

const RENDER_SCALE = 2.0

function parsePageNumbers(ranges: string | undefined, totalPages: number): number[] {
  if (!ranges || !ranges.trim()) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const set = new Set<number>()
  for (const part of ranges.split(',')) {
    const trimmed = part.trim()
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number)
      for (let i = Math.max(1, start); i <= Math.min(totalPages, end || start); i++) {
        set.add(i)
      }
    } else {
      const n = Number(trimmed)
      if (n >= 1 && n <= totalPages) set.add(n)
    }
  }
  return set.size > 0 ? Array.from(set).sort((a, b) => a - b) : Array.from({ length: totalPages }, (_, i) => i + 1)
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

// Upload a blob to R2, return the public URL
async function uploadBlobToR2(blob: Blob, key: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('r2', {
    body: { action: 'upload-url', key, contentType: 'image/webp' },
  })
  if (error || !(data as any)?.url) throw new Error(`r2 upload-url failed: ${error}`)
  const { url: presignedUrl, publicUrl } = data as { url: string; publicUrl: string }

  const uploadRes = await fetch(presignedUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'image/webp' },
  })
  if (!uploadRes.ok) throw new Error(`R2 upload failed: HTTP ${uploadRes.status}`)
  return publicUrl
}

// Render+upload page by page — each page is persisted to R2 as soon as it's rendered
export async function renderAndUploadPdfPages(
  pdfUrl: string,
  prefix: string,
  pageRanges?: string,
  onPageDone?: (done: number, total: number, pageUrl: PageUrl) => void,
): Promise<PageUrl[]> {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise
  const targetPages = parsePageNumbers(pageRanges, pdf.numPages)
  const total = targetPages.length
  const results: PageUrl[] = []

  for (let i = 0; i < targetPages.length; i++) {
    const pageNum = targetPages[i]
    try {
      const page = await pdf.getPage(pageNum)
      const vp = page.getViewport({ scale: RENDER_SCALE })
      const blob = await renderPageToBlob(page)
      page.cleanup()

      const key = `${prefix}/p-${String(pageNum).padStart(4, '0')}.webp`
      const src = await uploadBlobToR2(blob, key)

      const pageUrl: PageUrl = { p: pageNum, w: vp.width, h: vp.height, src }
      results.push(pageUrl)
      onPageDone?.(i + 1, total, pageUrl)
    } catch (err) {
      console.warn(`Page ${pageNum} render/upload failed:`, err)
      onPageDone?.(i + 1, total, { p: pageNum, w: 0, h: 0, src: '' })
    }
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
