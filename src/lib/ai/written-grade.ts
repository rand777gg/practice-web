/**
 * 主观题「建议分」的实际调用层。
 *
 * 口径（分档表 / prompt / 解析）在 `@/lib/written-grading`，这里是把它接到现有 AI 基建上：
 * 跟 `deepseek.ts` 一样的 `createDeepSeek` + `ai` SDK, 但 key 在服务端 —— 请求经 Edge Function
 * 代理转发(见 src/lib/ai/config.ts), 前端不再持有任何 AI key。
 *
 * 手写识图用的是 DeepSeek 的多模态模型（V4-Flash-Vision-Exp，同一个 key、同一个 endpoint），
 * 所以**不需要额外的 edge function**：图片从浏览器直连过去，跟文本调用是同一条路。
 *
 * 失败一律返回 `ok:false`，由调用方显示「评分失败」，绝不把 0 分当分数展示。
 */
import { createDeepSeek } from '@ai-sdk/deepseek'
import { generateText } from 'ai'
import { getAiConfig } from './config'
import {
  buildGradingPrompt, mergeGradings, parseGradingResult, RUBRIC,
  type GradingInput, type GradingResult, type WrittenKind,
} from '@/lib/written-grading'

/** 识图模型 id。DeepSeek 原生多模态，与文本模型共用 key / baseURL */
export const VISION_MODEL = (import.meta.env.VITE_DEEPSEEK_VISION_MODEL as string | undefined)
  || 'deepseek-v4-flash-vision-exp'

export interface OcrResult {
  text: string
  ok: boolean
  error?: string
  model?: string
}

function client() {
  const config = getAiConfig()
  if (!config.apiKey) return null
  return { model: createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL, fetch: config.fetch }), config }
}

/**
 * 手写笔迹 PNG → 文字。
 *
 * 手写作答必须先过这一步才能判分。刻意**不**让用户先改再判：真考场上字迹潦草本来
 * 就由考生自己承担风险，而且允许改完再判等于给了改答案再评分的口子。
 * OCR 原文会跟分数并排展示，出问题看得见。
 */
export async function ocrHandwriting(pngDataUrl: string, hint?: string, modelOverride?: string): Promise<OcrResult> {
  const c = client()
  const model = modelOverride ?? VISION_MODEL
  if (!c) return { text: '', ok: false, error: '平台模型未配置（服务端 secret DEEPSEEK_API_KEY）', model }

  // data URL 前缀要去掉，SDK 收的是裸 base64 + mediaType
  const base64 = pngDataUrl.replace(/^data:image\/\w+;base64,/, '')
  if (!base64) return { text: '', ok: false, error: '没有可识别的笔迹图片', model }

  try {
    const { text } = await generateText({
      model: c.model(model),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              '这是一份手写作答的图片，请把它**逐字转写**成纯文本。',
              hint ? `题目背景：${hint}` : '',
              '要求：',
              '1. 只输出转写结果，不要任何解释、不要 markdown 代码块；',
              '2. 保留原有的换行与段落；',
              '3. 看不清的字符用 [[?]] 标记，不要猜；',
              '4. 如果图片是空白的，只输出「（空白）」。',
            ].filter(Boolean).join('\n'),
          },
          { type: 'image', image: base64, mediaType: 'image/png' },
        ],
      }],
      temperature: 0,
      maxOutputTokens: 4000,
    })
    const cleaned = text.trim().replace(/^```(?:\w+)?\s*/, '').replace(/```$/, '').trim()
    if (!cleaned) return { text: '', ok: false, error: '模型没返回文字', model }
    return { text: cleaned, ok: true, model }
  } catch (e) {
    return { text: '', ok: false, error: `识别失败：${e instanceof Error ? e.message : String(e)}`, model }
  }
}

/**
 * 手写作答 → 先识别、再给建议分，两道结果一起返回。
 * 界面上 OCR 原文和分数要并排展示，用户能看到"它以为我写了什么"。
 */
export async function gradeHandwrittenAnswer(
  input: Omit<GradingInput, 'answer'>,
  pngDataUrl: string,
): Promise<{ ocr: OcrResult; result: GradingResult }> {
  const ocr = await ocrHandwriting(pngDataUrl, input.prompt.slice(0, 200))
  if (!ocr.ok) {
    return { ocr, result: failed(input.kind, `手写识别失败，没法判分：${ocr.error ?? ''}`) }
  }
  const result = await gradeWrittenAnswer({ ...input, answer: ocr.text })
  return { ocr, result }
}

function failed(kind: WrittenKind, reason: string, model?: string): GradingResult {
  return {
    kind,
    total: 0,
    max: RUBRIC[kind].maxScore,
    band: '',
    dimensions: [],
    sentenceNotes: [],
    overall: reason,
    confidence: 'low',
    model,
    ok: false,
  }
}

/** 单模型评分。未配置 key 或调用/解析失败都返回 ok:false */
export async function gradeWrittenAnswer(input: GradingInput, modelOverride?: string): Promise<GradingResult> {
  const config = getAiConfig()
  const model = modelOverride ?? config.model ?? 'deepseek-chat'
  if (!config.apiKey) {
    return failed(input.kind, '平台模型未配置, 无法给建议分', model)
  }

  const { system, user } = buildGradingPrompt(input)
  try {
    const client = createDeepSeek({ apiKey: config.apiKey, baseURL: config.baseURL, fetch: config.fetch })
    const { text } = await generateText({
      model: client(model),
      system,
      prompt: user,
      // 判分要稳，不要发挥：温度压到最低
      temperature: 0,
      maxOutputTokens: 2000,
    })
    const result = parseGradingResult(text, input.kind, model)
    if (!result.ok) {
      return { ...result, overall: '模型没按要求返回 JSON，本次不给分（可重试）' }
    }
    return result
  } catch (e) {
    return failed(input.kind, `评分调用失败：${e instanceof Error ? e.message : String(e)}`, model)
  }
}

/**
 * 双模型交叉评分：两个模型分别打，分歧大就落低置信并提示人工复核。
 * 只有一个成功就用那一个；都失败返回 ok:false。
 */
export async function gradeWrittenAnswerDual(input: GradingInput, models: [string, string]): Promise<GradingResult> {
  const [a, b] = await Promise.all([
    gradeWrittenAnswer(input, models[0]),
    gradeWrittenAnswer(input, models[1]),
  ])
  const merged = mergeGradings([a, b])
  if (merged) return merged
  return failed(input.kind, a.overall || b.overall || '两个模型都没能给出结果', `${models[0]} + ${models[1]}`)
}
