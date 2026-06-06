import type { DocumentParseResult } from './types'

const BASE_URL = 'https://mineru.net/api/v1/agent'

export class MinerUClient {
  async uploadAndParse(file: File, onProgress?: (msg: string) => void): Promise<DocumentParseResult> {
    onProgress?.('正在创建解析任务...')

    // 1. Get signed upload URL
    const initRes = await fetch(`${BASE_URL}/parse/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    // 2. PUT file to OSS
    const putRes = await fetch(file_url, {
      method: 'PUT',
      body: file,
    })

    if (putRes.status !== 200 && putRes.status !== 201) {
      throw new Error(`MinerU file upload failed: HTTP ${putRes.status}`)
    }

    onProgress?.('文档解析中 (MinerU)...')

    // 3. Poll for result (max 5 min, every 2s)
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 2000))

      const res = await fetch(`${BASE_URL}/parse/${task_id}`)
      const data = await res.json() as {
        code: number; data: { state: string; markdown_url?: string; err_msg?: string }
      }

      const { state } = data.data

      if (state === 'done' && data.data.markdown_url) {
        // Fetch the markdown content from CDN
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
