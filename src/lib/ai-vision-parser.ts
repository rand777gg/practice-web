/**
 * 客户端试卷 PDF → 封面 + sections 预设解析 (编排层)
 *
 * 三条路 (按成本从低到高):
 *   1. PDF 有文字层 → 浏览器 pdfjs + 本地规则解析 (零后端, 毫秒级)
 *   2. 扫描件 → 并行:
 *      a. 首页 PNG → supabase edge `parse-paper-cover` → DeepSeek Vision 封面 JSON
 *      b. 整本 PDF → MinerU v4 OCR (复用项目 MinerUClient) → 全文 → 规则解析 sections
 *
 * 降级: 无 MinerU token 时 sections 空; 无 DeepSeek key 时 cover 空; 调用方各自手动兜底。
 */
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '@/lib/supabase'
import { MinerUClient } from '@/lib/ai/mineru'
import { getMinerUToken } from '@/lib/ai/config'
import { hasCoverContent, parsePdf, parseSectionsFromText, type ExamTemplateCover, type ParsedSection as RuleParsedSection } from '@/lib/paper-cover'
import type { ExamTemplateSection, QuestionType } from '@/types'

let pdfjsWorkerReady = false
function ensurePdfjsWorker() {
  if (pdfjsWorkerReady) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  pdfjsWorkerReady = true
}

export interface ParsedSection {
  ordinal: string
  name: string
  type: QuestionType | null
  range: [number, number] | null
  count: number
  score: number
  total: number | null
}

/** 返回给调用方的统一 schema */
export interface VisionParseResult {
  cover: ExamTemplateCover | null
  sections: ParsedSection[]
  pageCount: number
  /** false = 扫描件; true = 有文字层走规则解析 */
  hasTextLayer: boolean
  /** 'rule' 规则解析 / 'vision' DeepSeek Vision / 'ocr' MinerU OCR / 'mixed' vision+ocr / 'none' 全失败 */
  source: 'rule' | 'vision' | 'ocr' | 'mixed' | 'none'
}

/** 把 file 转 base64 (不带 data: URL 前缀) 给 edge function */
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/** pdfjs 渲染第 1 页为 PNG dataURL (scale 由页面尺寸决定, 保证清晰度又不至于过大) */
async function renderPage1Png(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(2, 1600 / Math.max(base.width, base.height))
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({ canvasContext: ctx, viewport: vp }).promise
    return canvas.toDataURL('image/png')
  } catch (e) {
    console.warn('renderPage1Png failed', e)
    return null
  }
}

export interface ParseProgress {
  stage: 'loading' | 'uploading' | 'parsing' | 'done' | 'error'
  message?: string
}

export type ParseProgressCallback = (p: ParseProgress) => void

function mapRuleSection(s: RuleParsedSection): ParsedSection {
  return {
    ordinal: s.ordinal,
    name: s.name,
    type: s.type,
    range: s.range,
    count: s.count,
    score: s.score,
    total: s.total,
  }
}

/** 从 MinerU OCR 全文用规则解析 sections (复用 paper-cover.ts 同一份逻辑) */
function parseSectionsFromOcrText(text: string): ParsedSection[] {
  return parseSectionsFromText(text) as ParsedSection[]
}

/**
 * 把 PDF 文件解析成 cover + sections 预设
 *
 * @throws Error message 为 i18n 错误码 (PDF_TOO_LARGE / READ_FAILED / AUTH_FAILED / RATE_LIMIT / SERVER_ERROR / NETWORK_ERROR / EMPTY_RESULT)
 */
export async function parsePaperFromPdf(
  file: File,
  onProgress?: ParseProgressCallback,
): Promise<VisionParseResult> {
  ensurePdfjsWorker()
  onProgress?.({ stage: 'loading', message: 'PDF' })

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('PDF_TOO_LARGE')
  }

  let fileBytes: Uint8Array
  try {
    fileBytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new Error('READ_FAILED')
  }

  // 路径 1: 有文字层 → 本地规则解析 (免费)
  try {
    const pdf = await pdfjsLib.getDocument({ data: fileBytes }).promise
    const page1 = await pdf.getPage(1)
    const tc = await page1.getTextContent()
    if (tc.items.length > 0) {
      onProgress?.({ stage: 'parsing' })
      const result = await parsePdf(pdfjsLib as unknown as typeof import('pdfjs-dist'), fileBytes)
      onProgress?.({ stage: 'done' })
      return {
        cover: result.cover,
        sections: result.sections.map(mapRuleSection),
        pageCount: result.pageCount,
        hasTextLayer: true,
        source: 'rule',
      }
    }
  } catch (e) {
    console.warn('local rule parse failed, fallback to edge', e)
  }

  // 路径 2: 扫描件 → DeepSeek Vision (cover) + MinerU OCR (sections) 并行
  onProgress?.({ stage: 'uploading', message: file.name })

  const [visionPromise, ocrPromise] = await Promise.allSettled([
    (async () => {
      const png = await renderPage1Png(file)
      if (!png) return null
      const fileBase64 = await fileToBase64(file).catch(() => '')
      const { data, error } = await supabase.functions.invoke<{
        cover: ExamTemplateCover | null
        source: string
      }>('parse-paper-cover', {
        body: { page1PngDataUrl: png, fileName: file.name, fileBase64: fileBase64 || undefined },
      })
      if (error) throw error
      return data?.cover ?? null
    })(),
    (async () => {
      const token = getMinerUToken()
      if (!token) return null
      const mineru = new MinerUClient()
      onProgress?.({ stage: 'parsing', message: 'OCR' })
      const result = await mineru.uploadAndParsePrecision(file, {
        token,
        modelVersion: 'vlm',
        isOcr: true,
        language: 'ch',
        enableFormula: true,
        enableTable: true,
      })
      if (!result.markdown) return null
      return { markdown: result.markdown }
    })(),
  ])

  const cover = visionPromise.status === 'fulfilled' ? visionPromise.value : null
  const ocr = ocrPromise.status === 'fulfilled' ? ocrPromise.value : null
  const ocrSections = ocr ? parseSectionsFromOcrText(ocr.markdown) : []

  onProgress?.({ stage: 'done' })
  const source: VisionParseResult['source'] = cover
    ? (ocrSections.length ? 'mixed' : 'vision')
    : (ocrSections.length ? 'ocr' : 'none')

  return {
    cover,
    sections: ocrSections,
    pageCount: 1,
    hasTextLayer: false,
    source,
  }
}

/** 把 VisionParseResult 转成 ExamTemplate 的 patch 对象 (cover + sections) */
export function visionResultToDraftPatch(result: VisionParseResult): {
  cover: ExamTemplateCover | null
  sections: ExamTemplateSection[]
  hasCover: boolean
  hasSections: boolean
} {
  return {
    cover: result.cover,
    sections: result.sections.map((s, i) => ({
      id: `parsed-${i}-${s.range ? `${s.range[0]}-${s.range[1]}` : ''}`,
      type: s.type,
      count: s.count || 0,
      score: s.score || 0,
      categories: [],
    })),
    hasCover: hasCoverContent(result.cover),
    hasSections: result.sections.length > 0,
  }
}