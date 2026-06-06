import { supabase } from '@/lib/supabase'
import type { DocumentParseResult } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/mineru-proxy`
const AUTH_HEADER = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

export class MinerUClient {
  async uploadAndParse(file: File, onProgress?: (msg: string) => void): Promise<DocumentParseResult> {
    // 1. Upload to Supabase Storage
    onProgress?.('正在上传文档...')
    const filePath = `mineru-temp/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('files')
      .upload(filePath, file, { upsert: true })

    if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`)

    const { data: urlData } = supabase.storage.from('files').getPublicUrl(filePath)
    const publicUrl = urlData.publicUrl

    // 2. Submit URL to MinerU via proxy
    onProgress?.('正在创建解析任务...')
    const res = await fetch(`${PROXY_BASE}/parse/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ url: publicUrl, language: 'ch' }),
    })
    const data = await res.json() as { code: number; msg: string; data: { task_id: string } }
    if (data.code !== 0) throw new Error(`MinerU init failed: ${data.msg}`)
    const { task_id } = data.data

    // 3. Poll for result
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
}
