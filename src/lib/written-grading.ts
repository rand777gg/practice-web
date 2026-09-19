/**
 * 主观题「建议分」判题。
 *
 * 定位很清楚：**只给建议分，不做终审**。考研的翻译和写作本来就没有唯一解，
 * AI 打分必定有方差，所以：
 *   - 按**官方评分标准**打（分档 + 维度），不是让模型自由发挥；
 *   - 输出结构化 JSON（总分 / 维度分 / 逐句批注 / 置信度），前端能一条条展示；
 *   - 标明 confidence；两种模型交叉时差距大就落低置信，提醒人工复核；
 *   - 界面上必须写「仅供参考、不计入考试统计」。
 *
 * 这里只放**纯函数**：评分标准数据、prompt 构造、结果解析。
 * 真正调模型的部分在别处（要 key，也不好单测），这样评分口径能被单测钉住。
 */

export type WrittenKind = 'translation' | 'writing_small' | 'writing_large'

/** 官方分档（照抄公开评分细则；改口径就改这里） */
export interface BandRule {
  band: string
  range: [number, number]
  desc: string
}

export interface Rubric {
  label: string
  maxScore: number
  /**
   * 计分单位：翻译是**逐句给分**（46–50 每句 2 分），写作是**整篇给分**。
   * 这两种的分档表含义完全不同，必须显式区分——否则「第五档 9–10 分」用在每句 2 分的题上就错位了。
   */
  scoringUnit: 'per_sentence' | 'whole'
  /** per_sentence 时才有：几小题、每题满分 */
  items?: number
  perItemMax?: number
  dimensions: string[]
  bands: BandRule[]
  /** 特别提醒模型注意的点 */
  notes: string[]
}

export const RUBRIC: Record<WrittenKind, Rubric> = {
  translation: {
    label: '翻译（英语一 Part C）',
    maxScore: 10,
    scoringUnit: 'per_sentence',
    items: 5,
    perItemMax: 2,
    dimensions: ['理解准确', '表达通顺'],
    bands: [
      { band: '到位', range: [1.6, 2], desc: '完整准确地理解原文，译文通顺、无明显语病' },
      { band: '基本到位', range: [1.2, 1.5], desc: '大意正确，个别词句理解偏差或表达生硬，不影响整体理解' },
      { band: '有偏差', range: [0.6, 1.1], desc: '部分关键词或结构理解错误，译文勉强可读' },
      { band: '基本未译出', range: [0.1, 0.5], desc: '只译出个别词，或整体意思错误' },
      { band: '未作答', range: [0, 0], desc: '空白或与原文无关' },
    ],
    notes: [
      '逐句给分：46–50 每句 2 分，合计 10 分；total 是 5 句之和，sentenceNotes 要给出每句的分数与扣分点',
      '判分看「意思对不对」优先于「译文漂不漂亮」；意思对但表达生硬，扣表达分不扣理解分',
      '专有名词、代词指代、长句的修饰关系是常见失分点，指出具体漏译/误译的词',
    ],
  },
  writing_small: {
    label: '应用文写作（英语一 Part A）',
    maxScore: 10,
    scoringUnit: 'whole',
    dimensions: ['内容要点', '语言准确', '篇章衔接'],
    bands: [
      { band: '第五档', range: [9, 10], desc: '很好地完成了试题规定的任务，要点完整，语言流畅，几乎没有语言错误' },
      { band: '第四档', range: [7, 8], desc: '较好地完成，要点齐全，语言基本准确，个别错误不影响理解' },
      { band: '第三档', range: [5, 6], desc: '基本完成，要点基本齐全，语言错误较多但尚能理解' },
      { band: '第二档', range: [3, 4], desc: '未恰当完成，遗漏主要要点，语言错误多，影响理解' },
      { band: '第一档', range: [1, 2], desc: '未完成，内容与要求无关或只有零星正确表述' },
      { band: '0 分', range: [0, 0], desc: '未作答、誊写题目原文或内容完全无关' },
    ],
    notes: [
      '小作文是「约 100 词」的固定格式书信/通知，格式（称呼、落款）与语域（正式程度）算分',
      '英语一要求不得署真名，需用「Li Ming」；署真名或格式缺失要指出',
      '要点遗漏按个扣，不要把「要点不全」笼统写一句就完事',
    ],
  },
  writing_large: {
    label: '短文写作（英语一 Part B）',
    maxScore: 20,
    scoringUnit: 'whole',
    dimensions: ['内容要点', '语言准确', '篇章结构', '词汇句式'],
    bands: [
      { band: '第五档', range: [17, 20], desc: '很好地完成了任务，内容充实，结构清晰，语言流畅，用词和句式多样' },
      { band: '第四档', range: [13, 16], desc: '较好地完成，内容较充实，结构较清晰，语言基本准确' },
      { band: '第三档', range: [9, 12], desc: '基本完成，内容不够充实或结构不够清晰，语言错误较多' },
      { band: '第二档', range: [5, 8], desc: '未恰当完成，内容空洞或结构混乱，语言错误多，影响理解' },
      { band: '第一档', range: [1, 4], desc: '未完成，内容与要求无关或只有个别可读句子' },
      { band: '0 分', range: [0, 0], desc: '未作答或内容完全无关' },
    ],
    notes: [
      '大作文是看图/表作文，题目给的三点要求（describe / interpret / comment）必须逐点覆盖，漏一点要明确指出来',
      '字数低于 160 词开始扣分，低于 120 词扣分加重；明显超出 200 词也提示',
      '重点看「有没有具体论证」而不是「有没有高级词」；堆砌难词但逻辑空，不给高档',
    ],
  },
}

export interface GradingDimension {
  name: string
  score: number
  max: number
  comment: string
}

/** 逐句批注（翻译必给；写作可选，用来点具体句子） */
export interface SentenceNote {
  /** 题号或句序，如 46 */
  ref: string
  /** 学生译文 / 原句（可缺） */
  student?: string
  /** 参考译文或修改建议（可缺） */
  suggestion?: string
  note: string
}

export interface GradingResult {
  kind: WrittenKind
  total: number
  max: number
  band: string
  dimensions: GradingDimension[]
  sentenceNotes: SentenceNote[]
  overall: string
  confidence: 'high' | 'medium' | 'low'
  /** 用了哪些模型，交叉复核时展示 */
  model?: string
  /** 是否解析成功；false 表示调用或解析失败，界面不要当成分数展示 */
  ok: boolean
}

export interface GradingInput {
  kind: WrittenKind
  /** 题干 / 要求原文 */
  prompt: string
  /** 学生作答（手写要先 OCR 并让用户确认过再送进来） */
  answer: string
  /** 参考译文（翻译题传）/ 范文锚点（写作题可传） */
  reference?: string
  /** 字数要求提示，如「约 100 词」 */
  wordHint?: string
  /** 图表要点（大作文），文字描述即可 */
  chartHint?: string
}

/**
 * 构造评分 prompt。
 * 刻意把分档表和维度都写进去：口径来自代码，不指望模型自己回忆评分标准。
 */
export function buildGradingPrompt(input: GradingInput): { system: string; user: string } {
  const rule = RUBRIC[input.kind]
  const bands = rule.bands.map((b) => `- ${b.band}（${b.range[0]}–${b.range[1]} 分）：${b.desc}`).join('\n')
  const unit = rule.scoringUnit === 'per_sentence'
    ? `这道题是逐句给分：共 ${rule.items} 句，每句满分 ${rule.perItemMax} 分，每句都要落一个分数。`
    : '这道题整篇给分，直接落一个总分。'

  const system = [
    `你是考研英语（一）阅卷老师，正在批改「${rule.label}」。满分 ${rule.maxScore} 分。`,
    unit,
    '',
    '评分档次（必须落在其中一档）：',
    bands,
    '',
    `评分维度：${rule.dimensions.join('、')}。`,
    '',
    '判分要求：',
    ...rule.notes.map((n) => `- ${n}`),
    '',
    '重要：你给的是**建议分**，不是终审。不确定就降低 confidence，不要硬凑一个精确分数。',
    '只输出一个 JSON 对象，不要任何解释文字、不要 markdown 代码块。JSON 结构：',
    '{',
    '  "total": 数字（0 到满分）,',
    '  "band": "命中的档次名",',
    '  "dimensions": [{"name":"维度名","score":数字,"max":数字,"comment":"一句点评"}],',
    '  "sentenceNotes": [{"ref":"46","student":"学生译文","suggestion":"参考译文","note":"扣分点"}],',
    '  "overall": "两三句话总评，先说优点再说问题",',
    '  "confidence": "high" | "medium" | "low"',
    '}',
  ].join('\n')

  const parts = ['【题目要求】', input.prompt.trim() || '（无）']
  if (input.reference?.trim()) parts.push('', '【参考答案 / 范文锚点】', input.reference.trim())
  if (input.chartHint?.trim()) parts.push('', '【图表要点】', input.chartHint.trim())
  if (input.wordHint) parts.push('', `【字数要求】${input.wordHint}`)
  parts.push('', '【学生作答】', input.answer.trim() || '（空白，直接判 0 分并在 overall 里说明未作答）')

  return { system, user: parts.join('\n') }
}

/** 从模型输出里抠 JSON：容忍 ```json 代码块、前后夹带解释文字 */
function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const candidates: string[] = [trimmed]
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1))
  for (const c of candidates) {
    try {
      return JSON.parse(c)
    } catch { /* 试下一个候选 */ }
  }
  return null
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * 解析模型返回的评分结果。
 * 解析不出来就返回 ok:false —— **界面据此显示「评分失败」，绝不能把 0 分当分数展示**。
 */
export function parseGradingResult(raw: string, kind: WrittenKind, model?: string): GradingResult {
  const rule = RUBRIC[kind]
  const failed: GradingResult = {
    kind, total: 0, max: rule.maxScore, band: '', dimensions: [],
    sentenceNotes: [], overall: '', confidence: 'low', model, ok: false,
  }
  const parsed = extractJsonObject(raw)
  if (!parsed || typeof parsed !== 'object') return failed

  const obj = parsed as Record<string, unknown>
  const totalRaw = Number(obj.total)
  if (!Number.isFinite(totalRaw)) return failed

  const dimensions: GradingDimension[] = Array.isArray(obj.dimensions)
    ? (obj.dimensions as Record<string, unknown>[]).flatMap((d) => {
      const name = typeof d?.name === 'string' ? d.name : ''
      const score = Number(d?.score)
      if (!name || !Number.isFinite(score)) return []
      const max = Number(d?.max)
      const maxSafe = Number.isFinite(max) && max > 0 ? max : rule.maxScore
      return [{ name, score: clamp(score, 0, maxSafe), max: maxSafe, comment: typeof d?.comment === 'string' ? d.comment : '' }]
    })
    : []

  const sentenceNotes: SentenceNote[] = Array.isArray(obj.sentenceNotes)
    ? (obj.sentenceNotes as Record<string, unknown>[]).flatMap((s) => {
      const ref = s?.ref
      const note = typeof s?.note === 'string' ? s.note : ''
      if (ref == null || !note) return []
      return [{
        ref: String(ref),
        student: typeof s?.student === 'string' ? s.student : undefined,
        suggestion: typeof s?.suggestion === 'string' ? s.suggestion : undefined,
        note,
      }]
    })
    : []

  const confidence = obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low'
    ? obj.confidence
    : 'low'

  return {
    kind,
    total: clamp(totalRaw, 0, rule.maxScore),
    max: rule.maxScore,
    band: typeof obj.band === 'string' ? obj.band : '',
    dimensions,
    sentenceNotes,
    overall: typeof obj.overall === 'string' ? obj.overall : '',
    confidence,
    model,
    ok: true,
  }
}

/**
 * 多个模型交叉评分后的收敛结果：分歧大就压低置信，提醒人工复核。
 * 只成功一个就原样返回；全失败返回 null。
 */
export function mergeGradings(results: GradingResult[]): GradingResult | null {
  const ok = results.filter((r) => r.ok)
  if (ok.length === 0) return null
  if (ok.length === 1) return ok[0]

  const max = ok[0].max
  const scores = ok.map((r) => r.total)
  const spread = Math.max(...scores) - Math.min(...scores)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  const base = ok[0]
  // 差距超过满分 15% 落低置信，超过 8% 落中置信
  const confidence: GradingResult['confidence'] = spread > max * 0.15 ? 'low' : spread > max * 0.08 ? 'medium' : base.confidence

  return {
    ...base,
    total: Math.round(avg * 10) / 10,
    confidence,
    model: ok.map((r) => r.model).filter(Boolean).join(' + ') || undefined,
    overall: base.overall
      + `\n\n（${ok.length} 个模型独立打分：${scores.join(' / ')}，${confidence === 'low' ? '分歧较大，建议人工复核' : '结果接近'}）`,
  }
}
