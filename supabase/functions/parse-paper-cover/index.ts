/**
 * parse-paper-cover: 扫描件试卷首页 PNG → 结构化封面 (DeepSeek Vision)
 *
 * 前端已完成: pdfjs 抽文本判断文字层; 有文字层走本地规则解析, 不需要本函数。
 * 无文字层 (扫描件) 时, 前端渲染首页 PNG 传过来, 这里调 DeepSeek Vision
 * (deepseek-v4-flash-vision-exp) 输出结构化封面 JSON。
 *
 * sections (题型/题号/分值) 由前端走 MinerU OCR 全文 + 规则解析, 不在这里做。
 *
 * 入参: { page1PngDataUrl: string }
 * 出参: { cover, sections: [], pageCount: 1, hasTextLayer: false, source: 'vision'|'none' }
 *
 * 配置 (supabase secrets):
 *   DEEPSEEK_API_KEY        —— 必配 (从 .env 的 VITE_DEEPSEEK_API_KEY 部署)
 *   DEEPSEEK_BASE_URL       —— 可选, 默认 https://api.deepseek.com
 *   DEEPSEEK_VISION_MODEL   —— 可选, 默认 deepseek-v4-flash-vision-exp
 */

function getSecret(...names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n)
    if (v) return v
  }
  return ''
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VISION_MODEL_DEFAULT = 'deepseek-v4-flash-vision-exp'
const VISION_BASE_URL_DEFAULT = 'https://api.deepseek.com'

interface ClientBody {
  page1PngDataUrl: string
  fileName?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const VISION_PROMPT = `你是一个试卷封面解析器。给定一张中国考研/高考/四六级/通用考试试卷的封面 PNG, 请严格按下面的 JSON schema 输出, 不要任何其它文字:

{
  "cover": {
    "banner": "左上角密级/装订条, 没有则 null",
    "examName": "居中副标题(考试名), 没有则 null",
    "title": "居中主标题(科目名), 没有则 null",
    "codeLine": "主标题下副标题(科目代码), 没有则 null",
    "noticeTitle": "居中加粗小标题(考生注意事项), 没有则 null",
    "notices": ["按编号 1./2./3. 顺序列出的注意事项"],
    "infoHint": "信息表上方居中小字提示, 没有则 null",
    "infoTable": [{ "label": "考生编号/姓名等行首标签", "boxes": 15 }]
  }
}

字段说明:
- cover.banner: 左上角小字, 例如「绝密★启用前」, 没看到就 null
- cover.examName: 居中考试名, 例如「2025 年全国硕士研究生招生考试」
- cover.title: 居中最大字号主标题, 例如「计算机学科专业基础」
- cover.codeLine: 主标题下方括号行, 例如「(科目代码: 408)」
- cover.noticeTitle: 居中加粗的小标题, 例如「考生注意事项」
- cover.notices: 按 1./2./3. 顺序列出, 完整保留每条文字
- cover.infoHint: 信息表上方居中小字, 例如「(以下信息考生必须认真填写)」
- cover.infoTable: 底部填涂表每行的标签 + 框数(估算填涂小方块数量); 没有就 []

只输出 JSON, 不要 markdown 代码块包裹, 不要解释。`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405)

  let body: ClientBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid json body' }, 400)
  }
  if (!body.page1PngDataUrl) {
    return jsonResponse({ error: 'page1PngDataUrl required' }, 400)
  }

  const apiKey = getSecret('DEEPSEEK_API_KEY', 'VITE_DEEPSEEK_API_KEY')
  if (!apiKey) {
    return jsonResponse({ cover: null, sections: [], pageCount: 1, hasTextLayer: false, source: 'none' })
  }

  const baseUrl = (getSecret('DEEPSEEK_BASE_URL') || VISION_BASE_URL_DEFAULT).replace(/\/+$/, '')
  const model = getSecret('DEEPSEEK_VISION_MODEL') || VISION_MODEL_DEFAULT

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 3000,
        messages: [
          { role: 'system', content: '你是一个结构化输出引擎, 只输出 JSON, 不要任何其它文字。' },
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: body.page1PngDataUrl } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) {
      console.warn('deepseek vision failed', res.status, (await res.text()).slice(0, 300))
      return jsonResponse({ cover: null, sections: [], pageCount: 1, hasTextLayer: false, source: 'none' })
    }
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      return jsonResponse({ cover: null, sections: [], pageCount: 1, hasTextLayer: false, source: 'none' })
    }
    // 剥离可能存在的 markdown code fence
    const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(stripped)
    return jsonResponse({
      cover: parsed.cover && typeof parsed.cover === 'object' ? parsed.cover : null,
      sections: [],
      pageCount: 1,
      hasTextLayer: false,
      source: parsed.cover && typeof parsed.cover === 'object' ? 'vision' : 'none',
    })
  } catch (e) {
    console.warn('vision error', e)
    return jsonResponse({ cover: null, sections: [], pageCount: 1, hasTextLayer: false, source: 'none' })
  }
})
