import { supabase } from '@/lib/supabase'
import JSZip from 'jszip'
import type { DocumentParseResult } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/mineru-proxy`
const AUTH_HEADER = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

export type MinerUMode = 'lightweight' | 'precise'

export class MinerUClient {
  private mode: MinerUMode
  private token?: string

  constructor(mode: MinerUMode = 'lightweight', token?: string) {
    this.mode = mode
    this.token = token
  }

  async uploadAndParse(file: File, onProgress?: (msg: string) => void): Promise<DocumentParseResult> {
    const { mode, token } = this

    // 1. Upload to Supabase Storage
    onProgress?.('正在上传文档...')
    const filePath = `mineru-temp/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('files')
      .upload(filePath, file, { upsert: true })

    if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`)

    const { data: urlData } = supabase.storage.from('files').getPublicUrl(filePath)
    const publicUrl = urlData.publicUrl

    // 2. Submit parse task
    onProgress?.('正在创建解析任务...')
    let taskId: string

    if (mode === 'lightweight') {
      taskId = await this.submitLightweight(publicUrl, file.name)
    } else {
      taskId = await this.submitPrecise(publicUrl, file.name)
    }

    // 3. Poll for result
    onProgress?.('文档解析中...')
    const markdown = mode === 'lightweight'
      ? await this.pollLightweight(taskId, onProgress)
      : await this.pollPrecise(taskId, onProgress)

    // Clean up temp file
    supabase.storage.from('files').remove([filePath]).catch(() => {})

    return { markdown, fileName: file.name }
  }

  // ---- Lightweight (agent API) ----
  private async submitLightweight(url: string, fileName: string): Promise<string> {
    const res = await fetch(`${PROXY_BASE}/parse/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ url, file_name: fileName, language: 'ch' }),
    })
    const data = await res.json() as { code: number; msg: string; data: { task_id: string } }
    if (data.code !== 0) throw new Error(`MinerU init failed: ${data.msg}`)
    return data.data.task_id
  }

  private async pollLightweight(taskId: string, onProgress?: (msg: string) => void): Promise<string> {
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 2000))
      const res = await fetch(`${PROXY_BASE}/parse/${taskId}`, { headers: { ...AUTH_HEADER } })
      const data = await res.json() as { code: number; data: { state: string; markdown_url?: string; err_msg?: string } }

      if (data.data.state === 'done' && data.data.markdown_url) {
        const mdRes = await fetch(`${PROXY_BASE}/download?url=${encodeURIComponent(data.data.markdown_url)}`, { headers: { ...AUTH_HEADER } })
        const mdJson = await mdRes.json() as { text: string }
        return mdJson.text
      }
      if (data.data.state === 'failed') throw new Error(`MinerU parsing failed: ${data.data.err_msg}`)
      if (i % 5 === 0) onProgress?.(`文档解析中... ${data.data.state}`)
    }
    throw new Error('MinerU parsing timed out')
  }

  // ---- Precise (v4 API) ----
  private async submitPrecise(url: string, fileName: string): Promise<string> {
    const res = await fetch(`${PROXY_BASE}/v4/extract/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ url, file_name: fileName, model_version: 'vlm', language: 'ch', token: this.token }),
    })
    const data = await res.json() as { code: number; msg: string; data: { task_id: string } }
    if (data.code !== 0) throw new Error(`MinerU init failed: ${data.msg}`)
    return data.data.task_id
  }

  private async pollPrecise(taskId: string, onProgress?: (msg: string) => void): Promise<string> {
    for (let i = 0; i < 300; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const res = await fetch(`${PROXY_BASE}/v4/extract/task/${taskId}`, { headers: { ...AUTH_HEADER } })
      const data = await res.json() as {
        code: number; data: { state: string; full_zip_url?: string; err_msg?: string }
      }

      if (data.data.state === 'done' && data.data.full_zip_url) {
        // Download zip via proxy, extract full.md client-side
        const zipRes = await fetch(`${PROXY_BASE}/download?url=${encodeURIComponent(data.data.full_zip_url)}`, { headers: { ...AUTH_HEADER } })
        const zipBlob = await zipRes.blob()
        const zip = await JSZip.loadAsync(zipBlob)
        const mdFile = zip.file('full.md')
        if (!mdFile) throw new Error('full.md not found in zip')
        return await mdFile.async('text')
      }
      if (data.data.state === 'failed') throw new Error(`MinerU parsing failed: ${data.data.err_msg}`)
      if (i % 5 === 0) onProgress?.(`文档解析中... ${data.data.state}`)
    }
    throw new Error('MinerU parsing timed out')
  }
}
