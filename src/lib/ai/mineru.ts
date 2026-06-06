import { supabase } from '@/lib/supabase'
import type { DocumentParseResult } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/mineru-proxy`
const AUTH_HEADER = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

export class MinerUClient {
  async uploadAndParse(file: File, onProgress?: (msg: string) => void): Promise<DocumentParseResult> {
    // 1. Upload file to Supabase Storage temp bucket
    onProgress?.('正在上传文档...')
    const filePath = `mineru-temp/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('public')
      .upload(filePath, file, { upsert: true })

    if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`)

    // 2. Get public URL
    const { data: urlData } = supabase.storage.from('public').getPublicUrl(filePath)
    const publicUrl = urlData.publicUrl

    // 3. Submit URL to MinerU via proxy
    onProgress?.('正在创建解析任务...')
    const initRes = await fetch(`${PROXY_BASE}/parse/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ url: publicUrl, language: 'ch' }),
    })

    const initData = await initRes.json() as {
      code: number; msg: string; data: { task_id: string }
    }

    if (initData.code !== 0) {
      throw new Error(`MinerU init failed: ${initData.msg}`)
    }

    const { task_id } = initData.data
    onProgress?.('文档解析中 (MinerU)...')

    // 4. Poll for result via proxy
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 2000))

      const res = await fetch(`${PROXY_BASE}/parse/${task_id}`, {
        headers: { ...AUTH_HEADER },
      })

      const data = await res.json() as {
        code: number; data: { state: string; markdown_url?: string; err_msg?: string }
      }

      const { state } = data.data

      if (state === 'done' && data.data.markdown_url) {
        const mdRes = await fetch(data.data.markdown_url)
        const markdown = await mdRes.text()

        // Clean up temp file
        supabase.storage.from('public').remove([filePath]).catch(() => {})

        return { markdown, fileName: file.name }
      }

      if (state === 'failed') {
        supabase.storage.from('public').remove([filePath]).catch(() => {})
        throw new Error(`MinerU parsing failed: ${data.data.err_msg || 'unknown'}`)
      }

      if (i % 5 === 0) {
        onProgress?.(`文档解析中... ${state}`)
      }
    }

    supabase.storage.from('public').remove([filePath]).catch(() => {})
    throw new Error('MinerU parsing timed out')
  }
}
