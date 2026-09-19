/**
 * 校验：主观题「建议分」的口径与解析。
 *
 * 盯三件事：
 *   1. prompt 里必须真的带上分档表和维度（口径来自代码，不靠模型自己回忆）；
 *   2. 模型输出五花八门（代码块 / 前后带解释 / 分数超范围）时能稳健解析；
 *   3. 解析失败必须落 ok:false —— 绝不能把「0 分」当成分数展示给用户。
 *
 * 用法：node scripts/check-written-grading.mjs
 */
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' })

let failed = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`)
}

try {
  const { RUBRIC, buildGradingPrompt, parseGradingResult, mergeGradings } = await vite.ssrLoadModule('/src/lib/written-grading.ts')

  // 分档表本身要自洽：区间不越界、不重叠；逐句计分的题要跟「题数 × 每题满分」对得上
  for (const [kind, rule] of Object.entries(RUBRIC)) {
    const bands = rule.bands
    const inRange = bands.every((b) => b.range[0] >= 0 && b.range[1] <= rule.maxScore && b.range[0] <= b.range[1])
    const top = bands[0].range
    const bottom = bands[bands.length - 1].range
    check(`${kind}: 分档区间合法`, inRange, true)
    check(`${kind}: 最低档触到 0`, bottom[0], 0)
    if (rule.scoringUnit === 'per_sentence') {
      check(`${kind}: 逐句计分 → 最高档触到每题满分`, top[1], rule.perItemMax)
      check(`${kind}: 题数 × 每题满分 = 总分`, rule.items * rule.perItemMax, rule.maxScore)
    } else {
      check(`${kind}: 整篇计分 → 最高档触到满分`, top[1], rule.maxScore)
    }
  }

  const p = buildGradingPrompt({
    kind: 'translation',
    prompt: 'Translate the underlined segments into Chinese.',
    answer: '(46) 追踪这一术语的历史，我们可以看到科学素养的定义随时间变化。',
    reference: '追溯该术语的历史，我们能看到科学素养的定义如何随时间变化。',
  })
  check('prompt 带上了满分', p.system.includes('满分 10 分'), true)
  check('prompt 带上了档次', p.system.includes('基本未译出'), true)
  check('prompt 带上了维度', p.system.includes('理解准确、表达通顺'), true)
  check('prompt 说明了逐句给分', p.system.includes('共 5 句，每句满分 2 分'), true)
  check('prompt 带上了学生作答', p.user.includes('追踪这一术语的历史'), true)
  check('prompt 带上了参考译文', p.user.includes('追溯该术语的历史'), true)
  check('prompt 要求只输出 JSON', p.system.includes('只输出一个 JSON 对象'), true)
  check('prompt 声明是建议分', p.system.includes('建议分'), true)

  const large = buildGradingPrompt({ kind: 'writing_large', prompt: '看图作文', answer: 'x', wordHint: '160–200 词' })
  check('大作文满分 20', large.system.includes('满分 20 分'), true)
  check('大作文分档到位', large.system.includes('第五档（17–20 分）'), true)
  check('大作文是整篇给分', large.system.includes('整篇给分'), true)

  // 各种脏输出的解析
  const good = parseGradingResult(JSON.stringify({
    total: 7.5, band: '第四档',
    dimensions: [{ name: '内容要点', score: 6, max: 6, comment: '要点齐' }],
    sentenceNotes: [{ ref: '46', student: '译文', suggestion: '参考', note: '漏了限定语' }],
    overall: '总体可以', confidence: 'medium',
  }), 'translation', 'deepseek')
  check('干净 JSON 能解析', [good.ok, good.total, good.max, good.band, good.confidence], [true, 7.5, 10, '第四档', 'medium'])
  check('维度保留', good.dimensions.length, 1)
  check('逐句批注保留', good.sentenceNotes[0].ref, '46')

  const fenced = parseGradingResult('```json\n{"total": 14, "band": "第四档", "overall": "ok", "confidence": "high"}\n```', 'writing_large')
  check('```json 代码块能解析', [fenced.ok, fenced.total, fenced.max], [true, 14, 20])

  const chatty = parseGradingResult('好的，我的评分如下：\n{"total": 9, "overall": "一般", "confidence": "low"}\n希望有帮助。', 'writing_small')
  check('前后带解释也能解析', [chatty.ok, chatty.total], [true, 9])

  check('超范围分数被夹住', parseGradingResult('{"total": 99, "confidence": "high"}', 'translation').total, 10)
  check('负数被夹住', parseGradingResult('{"total": -5}', 'translation').total, 0)

  const bad = parseGradingResult('模型今天不开心，没给 JSON', 'translation')
  check('解析失败 → ok:false（不能当 0 分用）', [bad.ok, bad.total], [false, 0])
  check('非法 confidence 兜底为 low', parseGradingResult('{"total": 5, "confidence": "超级高"}', 'translation').confidence, 'low')

  // 交叉评分
  const a = parseGradingResult('{"total": 15, "band":"第四档", "overall":"A", "confidence":"high"}', 'writing_large', 'deepseek')
  const b = parseGradingResult('{"total": 16, "band":"第四档", "overall":"B", "confidence":"high"}', 'writing_large', 'qwen')
  const merged = mergeGradings([a, b])
  check('两个模型接近 → 取平均且不降置信', [merged.total, merged.confidence, merged.model], [15.5, 'high', 'deepseek + qwen'])

  const c = parseGradingResult('{"total": 8, "overall":"C", "confidence":"high"}', 'writing_large', 'qwen')
  const diverged = mergeGradings([a, c])
  check('两个模型分歧大 → 落低置信并提示复核', [diverged.confidence, diverged.overall.includes('人工复核')], ['low', true])

  check('全部失败 → null', mergeGradings([bad, bad]), null)
  check('单个成功 → 原样返回', mergeGradings([bad, a])?.total, 15)

  console.log(failed ? `\n${failed} 项未通过` : '\n全部通过')
  process.exitCode = failed ? 1 : 0
} finally {
  await vite.close()
}
