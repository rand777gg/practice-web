import type { DocumentParseResult } from './types'

// Route through Supabase Edge Function proxy to avoid CORS
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/mineru-proxy`
const AUTH_HEADER = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

export class MinerUClient {
  async uploadAndParse(file: File, onProgress?: (msg: string) => void): Promise<DocumentParseResult> {
    onProgress?.('正在创建解析任务...')

    // 1. Get signed upload URL via proxy
    const initRes = await fetch(`${PROXY_BASE}/parse/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
      body: JSON.stringify({ file_name: file.name, language: 'ch' }),
    })

    const initData = await initRes.json() as {
      code: number; msg: string; data: { task_id: string; file_url: string }
    }

    if (initData.code !== 0) {
      throw new Error(`MinerU init failed: ${initData.msg}`)
    }

    const { task_id, file_url } = initData.data
    onProgress?.('正在上传文档...')

    // 2. PUT file to OSS via proxy (OSS signed URLs also block CORS)
    const proxyUploadUrl = `${PROXY_BASE}/upload?url=${encodeURIComponent(file_url)}`
    const putRes = await fetch(proxyUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', ...AUTH_HEADER },
      body: file,
    })

    if (putRes.status !== 200 && putRes.status !== 201) {
      throw new Error(`MinerU file upload failed: HTTP ${putRes.status}`)
    }

    onProgress?.('文档解析中 (MinerU)...')

    // 3. Poll for result via proxy
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
        return { markdown, fileName: file.name }
      }

      if (state === 'failed') {
        throw new Error(`MinerU parsing failed: ${data.data.err_msg || 'unknown'}`)
      }

      if (i % 5 === 0) {
        onProgress?.(`文档解析中... ${state}`)
      }
    }

    throw new Error('MinerU parsing timed out')
  }
}
