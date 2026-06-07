import { supabase } from '@/lib/supabase'
import type { DocumentParseResult, MinerUPrecisionOptions, MinerUTaskResult, MinerUBatchFileResult } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/mineru-proxy`
const AUTH_HEADER = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

async function fetchZipAndExtractMd(zipUrl: string): Promise<string> {
  // Proxy the zip download through the edge function to avoid CORS issues
  const res = await fetch(`${PROXY_BASE}/download-zip?url=${encodeURIComponent(zipUrl)}`, {
    headers: { ...AUTH_HEADER },
  })
  if (!res.ok) throw new Error(`Failed to download zip: ${res.status}`)

  const { text } = await res.json() as { text: string }

  // Edge function may fall back to base64 zip if server-side decompression fails
  if (text.startsWith('__B64ZIP__')) {
    const b64 = text.slice('__B64ZIP__'.length)
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(bytes)
    const mdFile = zip.file('full.md')
    if (!mdFile) throw new Error('full.md not found in zip archive')
    return mdFile.async('text')
  }

  return text
}

export class MinerUClient {
  private getProxyHeaders(mineruToken?: string): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...AUTH_HEADER }
    if (mineruToken) {
      headers['X-MinerU-Token'] = mineruToken
    }
    return headers
  }

  // Lightweight parsing — v1 agent API, no token required
  async uploadAndParse(file: File, options?: { pageRanges?: string }, onProgress?: (msg: string) => void): Promise<DocumentParseResult> {
    onProgress?.('正在上传文档...')
    const filePath = `mineru-temp/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('files')
      .upload(filePath, file, { upsert: true })

    if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`)

    const { data: urlData } = supabase.storage.from('files').getPublicUrl(filePath)
    const publicUrl = urlData.publicUrl

    onProgress?.('正在创建解析任务...')
    const v1Body: Record<string, string> = { url: publicUrl, language: 'ch' }
    if (options?.pageRanges) v1Body.page_ranges = options.pageRanges

    const res = await fetch(`${PROXY_BASE}/parse/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify(v1Body),
    })
    const data = await res.json() as { code: number; msg: string; data: { task_id: string } }
    if (data.code !== 0) throw new Error(`MinerU init failed: ${data.msg}`)
    const { task_id } = data.data

    onProgress?.('文档解析中 (MinerU)...')
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const pollRes = await fetch(`${PROXY_BASE}/parse/${task_id}`, { headers: { ...AUTH_HEADER } })
      const pollData = await pollRes.json() as {
        code: number; data: { state: string; markdown_url?: string; err_msg?: string }
      }

      if (pollData.data.state === 'done' && pollData.data.markdown_url) {
        const mdRes = await fetch(`${PROXY_BASE}/download?url=${encodeURIComponent(pollData.data.markdown_url)}`, { headers: { ...AUTH_HEADER } })
        const mdJson = await mdRes.json() as { text: string }
        supabase.storage.from('files').remove([filePath]).catch(() => {})
        return { markdown: mdJson.text, fileName: file.name }
      }
      if (pollData.data.state === 'failed') {
        supabase.storage.from('files').remove([filePath]).catch(() => {})
        throw new Error(`MinerU parsing failed: ${pollData.data.err_msg}`)
      }
      if (i % 5 === 0) onProgress?.(`文档解析中... ${pollData.data.state}`)
    }

    supabase.storage.from('files').remove([filePath]).catch(() => {})
    throw new Error('MinerU parsing timed out')
  }

  // Precision parsing — v4 API with token
  async uploadAndParsePrecision(
    file: File,
    options: MinerUPrecisionOptions,
    onProgress?: (msg: string) => void,
  ): Promise<DocumentParseResult> {
    onProgress?.('正在上传文档...')
    const filePath = `mineru-temp/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('files')
      .upload(filePath, file, { upsert: true })

    if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`)

    const { data: urlData } = supabase.storage.from('files').getPublicUrl(filePath)
    const publicUrl = urlData.publicUrl

    try {
      onProgress?.('正在创建精准解析任务...')
      const taskResult = await this.createTask(publicUrl, options)
      const taskId = taskResult.taskId

      onProgress?.('精准解析中...')
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const pollResult = await this.pollTask(taskId, options.token)

        if (pollResult.state === 'done' && pollResult.fullZipUrl) {
          onProgress?.('正在提取解析结果...')
          const markdown = await fetchZipAndExtractMd(pollResult.fullZipUrl)
          return { markdown, fileName: file.name }
        }
        if (pollResult.state === 'failed') {
          throw new Error(`MinerU precision parsing failed: ${pollResult.errMsg}`)
        }
        if (i % 5 === 0) {
          const progress = pollResult.extractProgress
          if (progress) {
            onProgress?.(`精准解析中... ${progress.extractedPages}/${progress.totalPages} 页 (${pollResult.state})`)
          } else {
            onProgress?.(`精准解析中... ${pollResult.state}`)
          }
        }
      }
      throw new Error('MinerU precision parsing timed out')
    } finally {
      supabase.storage.from('files').remove([filePath]).catch(() => {})
    }
  }

  // Create a precision parsing task (single URL)
  async createTask(url: string, options: MinerUPrecisionOptions): Promise<MinerUTaskResult> {
    const body: Record<string, unknown> = {
      url,
      model_version: options.modelVersion,
      language: options.language || 'ch',
      enable_formula: options.enableFormula ?? true,
      enable_table: options.enableTable ?? true,
    }
    if (options.isOcr !== undefined) body.is_ocr = options.isOcr
    if (options.pageRanges) body.page_ranges = options.pageRanges
    if (options.extraFormats?.length) body.extra_formats = options.extraFormats
    if (options.noCache !== undefined) body.no_cache = options.noCache
    if (options.cacheTolerance !== undefined && options.cacheTolerance >= 0) body.cache_tolerance = options.cacheTolerance
    if (options.dataId) body.data_id = options.dataId

    const res = await fetch(`${PROXY_BASE}/v4/extract/task`, {
      method: 'POST',
      headers: this.getProxyHeaders(options.token),
      body: JSON.stringify(body),
    })
    const data = await res.json() as { code: number; msg: string; data: { task_id: string } }
    if (data.code !== 0) throw new Error(`MinerU v4 create task failed: ${data.msg}`)
    return { taskId: data.data.task_id, state: 'pending' }
  }

  // Poll a precision parsing task
  async pollTask(taskId: string, token: string): Promise<MinerUTaskResult> {
    const res = await fetch(`${PROXY_BASE}/v4/extract/task/${taskId}`, {
      method: 'GET',
      headers: this.getProxyHeaders(token),
    })
    const data = await res.json() as {
      code: number; msg: string
      data: {
        task_id: string; state: string; full_zip_url?: string; err_msg?: string
        extract_progress?: { extracted_pages: number; total_pages: number; start_time: string }
      }
    }
    if (data.code !== 0) throw new Error(`MinerU v4 poll failed: ${data.msg}`)
    return {
      taskId: data.data.task_id,
      state: data.data.state as MinerUTaskResult['state'],
      fullZipUrl: data.data.full_zip_url,
      errMsg: data.data.err_msg,
      extractProgress: data.data.extract_progress ? {
        extractedPages: data.data.extract_progress.extracted_pages,
        totalPages: data.data.extract_progress.total_pages,
        startTime: data.data.extract_progress.start_time,
      } : undefined,
    }
  }

  // Batch URL-based precision parsing
  async createBatchTask(
    files: { url: string; dataId?: string }[],
    options: MinerUPrecisionOptions,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      files: files.map(f => {
        const item: Record<string, string> = { url: f.url }
        if (f.dataId) item.data_id = f.dataId
        return item
      }),
      model_version: options.modelVersion,
      language: options.language || 'ch',
      enable_formula: options.enableFormula ?? true,
      enable_table: options.enableTable ?? true,
    }
    if (options.pageRanges) body.page_ranges = options.pageRanges
    if (options.extraFormats?.length) body.extra_formats = options.extraFormats
    if (options.noCache !== undefined) body.no_cache = options.noCache
    if (options.cacheTolerance !== undefined && options.cacheTolerance >= 0) body.cache_tolerance = options.cacheTolerance

    const res = await fetch(`${PROXY_BASE}/v4/extract/task/batch`, {
      method: 'POST',
      headers: this.getProxyHeaders(options.token),
      body: JSON.stringify(body),
    })
    const data = await res.json() as { code: number; msg: string; data: { batch_id: string } }
    if (data.code !== 0) throw new Error(`MinerU v4 batch create failed: ${data.msg}`)
    return data.data.batch_id
  }

  // Poll batch results
  async pollBatch(batchId: string, token: string): Promise<MinerUBatchFileResult[]> {
    const res = await fetch(`${PROXY_BASE}/v4/extract-results/batch/${batchId}`, {
      method: 'GET',
      headers: this.getProxyHeaders(token),
    })
    const data = await res.json() as {
      code: number; msg: string
      data: {
        batch_id: string
        extract_result: {
          file_name: string; state: string; full_zip_url?: string; err_msg?: string
          data_id?: string
          extract_progress?: { extracted_pages: number; total_pages: number; start_time: string }
        }[]
      }
    }
    if (data.code !== 0) throw new Error(`MinerU v4 batch poll failed: ${data.msg}`)
    return (data.data.extract_result || []).map(r => ({
      fileName: r.file_name,
      state: r.state as MinerUBatchFileResult['state'],
      fullZipUrl: r.full_zip_url,
      errMsg: r.err_msg,
    }))
  }

  // Batch precision parsing for multiple uploaded files
  async uploadAndParseBatchPrecision(
    files: File[],
    options: MinerUPrecisionOptions,
    onProgress?: (msg: string) => void,
  ): Promise<DocumentParseResult[]> {
    // Upload all files to Supabase Storage first
    onProgress?.(`正在上传 ${files.length} 个文件...`)
    const uploads = await Promise.all(files.map(async (file) => {
      const filePath = `mineru-temp/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from('files')
        .upload(filePath, file, { upsert: true })
      if (uploadErr) throw new Error(`Upload failed for ${file.name}: ${uploadErr.message}`)
      const { data: urlData } = supabase.storage.from('files').getPublicUrl(filePath)
      return { url: urlData.publicUrl, fileName: file.name, filePath }
    }))

    try {
      onProgress?.('正在创建批量精准解析任务...')
      const batchId = await this.createBatchTask(
        uploads.map(u => ({ url: u.url })),
        options,
      )

      onProgress?.('批量精准解析中...')
      const results: DocumentParseResult[] = []

      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000))
        const batchResults = await this.pollBatch(batchId, options.token)

        const done = batchResults.filter(r => r.state === 'done')
        const failed = batchResults.filter(r => r.state === 'failed')

        if (done.length + failed.length === batchResults.length) {
          // All completed
          for (const r of done) {
            if (r.fullZipUrl) {
              onProgress?.(`正在提取 ${r.fileName} 的解析结果...`)
              const markdown = await fetchZipAndExtractMd(r.fullZipUrl)
              results.push({ markdown, fileName: r.fileName })
            }
          }
          if (failed.length > 0) {
            const names = failed.map(r => r.fileName).join(', ')
            onProgress?.(`部分文件解析失败: ${names}`)
          }
          break
        }

        const running = batchResults.filter(r => r.state === 'running').length
        onProgress?.(`批量解析中... 完成 ${done.length}, 进行中 ${running}, 失败 ${failed.length}`)
      }

      return results
    } finally {
      for (const u of uploads) {
        supabase.storage.from('files').remove([u.filePath]).catch(() => {})
      }
    }
  }
}
