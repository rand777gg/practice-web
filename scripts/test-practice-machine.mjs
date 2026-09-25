/**
 * 练习会话状态机的测试。
 *
 * 为什么不引入 vitest：仓库里没有测试框架，为了几个纯函数引一套 runner + 依赖是笔不划算的账。
 * 这里用仓库本来就有的 typescript 把被测模块转成一段 ESM（它只有 `import type`，转完没有运行时
 * 依赖，所以不需要打包器），再交给 `node:assert` 断言 —— 零新增依赖就能真正跑起来。
 * （只测纯逻辑；有副作用的部分不在这里，也就不需要 jsdom。）
 *
 * 用法：npm run test:machine
 */
import ts from 'typescript'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = mkdtempSync(join(tmpdir(), 'practice-machine-'))

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failures += 1
    console.error(`  ✗ ${name}`)
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`    ${msg.split('\n').join('\n    ')}`)
  }
}

try {
  // 直接转译被测模块：它只有 `import type`，转完就是一段自洽的 ESM，不需要打包器
  const source = readFileSync(join(root, 'src/lib/practice-session.ts'), 'utf8')
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  })
  if (diagnostics && diagnostics.length > 0) {
    const text = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    })
    throw new Error(`转译 practice-session.ts 失败：\n${text}`)
  }
  writeFileSync(join(outDir, 'machine.mjs'), outputText)

  const {
    initialPracticeQuestionState: init,
    practiceQuestionReducer: reduce,
    staleResponse,
    canSubmit,
  } = await import(pathToFileURL(join(outDir, 'machine.mjs')).href)

  const q = (id) => ({ id, question_type: 'single_choice', question_text: `题 ${id}` })
  const stats = (over = {}) => ({ attempts: 3, wrongs: 1, note: '笔记', is_public: true, ...over })

  console.log('practice-session 状态机')

  // ── 加载：该清什么、不该清什么 ──
  check('load/begin 只清"作答"，保留当前题目与上一题的笔记/统计', () => {
    const dirty = { ...init, loadId: 4, question: q('old'), selectedAnswer: 1, submitted: true, answerId: 'a1', note: 'x', isPublic: true, attempts: 9, wrongs: 8 }
    const next = reduce(dirty, { type: 'load/begin' })
    // 要清的
    assert.equal(next.selectedAnswer, null)
    assert.equal(next.submitted, false)
    assert.equal(next.answerId, null)
    // 不能清的：下一题到达前要继续显示上一题（首屏用缓存的那道题），清掉会闪白
    assert.equal(next.question, dirty.question, '题目要留到新题到达')
    assert.equal(next.note, 'x')
    assert.equal(next.isPublic, true)
    assert.equal(next.attempts, 9)
    assert.equal(next.wrongs, 8)
  })

  check('load/begin 每次让 loadId 加一', () => {
    const a = reduce(init, { type: 'load/begin' })
    const b = reduce(a, { type: 'load/begin' })
    assert.equal(b.loadId - a.loadId, 1)
  })

  check('load/hydrate 换题并搬进统计；stats 为 null 时走默认值', () => {
    const loading = reduce(reduce(init, { type: 'load/begin' }), { type: 'load/begin' })
    const ok = reduce(loading, { type: 'load/hydrate', loadId: loading.loadId, question: q('n1'), stats: stats() })
    assert.equal(ok.question.id, 'n1')
    assert.equal(ok.attempts, 3)
    assert.equal(ok.wrongs, 1)
    assert.equal(ok.note, '笔记')
    assert.equal(ok.isPublic, true)

    const bare = reduce(loading, { type: 'load/hydrate', loadId: loading.loadId, question: q('n2'), stats: null })
    assert.equal(bare.attempts, 0)
    assert.equal(bare.wrongs, 0)
    assert.equal(bare.note, '')
    assert.equal(bare.isPublic, false)
  })

  // ── 过期响应：这次改造的核心规则 ──
  check('过期的 load/hydrate 被整条丢弃（不会把上一道题的结果写到新题上）', () => {
    const s1 = reduce(init, { type: 'load/begin' })
    const staleGen = s1.loadId
    const s2 = reduce(s1, { type: 'load/begin' }) // 用户已经切到下一题
    const after = reduce(s2, { type: 'load/hydrate', loadId: staleGen, question: q('stale'), stats: stats() })
    assert.equal(after, s2, '应当原样返回同一个对象（reducer 幂等）')
    assert.equal(after.question, null)
  })

  check('staleResponse 只认最新那个号', () => {
    const s = reduce(init, { type: 'load/begin' })
    assert.equal(staleResponse(s, s.loadId), false)
    assert.equal(staleResponse(s, s.loadId - 1), true)
  })

  // ── 作答规则 ──
  check('交卷后不能再改选项', () => {
    let s = reduce(reduce(init, { type: 'load/begin' }), { type: 'load/hydrate', loadId: 1, question: q('a'), stats: null })
    s = reduce(s, { type: 'answer/select', answer: 0 })
    s = reduce(s, { type: 'answer/id', answerId: 'row-1' })
    s = reduce(s, { type: 'answer/submitted' })
    assert.equal(s.submitted, true)
    const after = reduce(s, { type: 'answer/select', answer: 2 })
    assert.equal(after.selectedAnswer, 0, '交卷后选中的答案必须保持不变')
  })

  check('没有题就不可能有"已交卷"', () => {
    const s = reduce(init, { type: 'answer/submitted' })
    assert.equal(s.submitted, false)
  })

  check('先落 id 再标记交卷（两步顺序）', () => {
    let s = reduce(reduce(init, { type: 'load/begin' }), { type: 'load/hydrate', loadId: 1, question: q('a'), stats: null })
    s = reduce(s, { type: 'answer/id', answerId: 'row-9' })
    assert.equal(s.answerId, 'row-9')
    assert.equal(s.submitted, false, '只落 id 不该顺带标记交卷')
    s = reduce(s, { type: 'answer/submitted' })
    assert.equal(s.answerId, 'row-9', '标记交卷不该丢掉已经拿到的 id')
  })

  check('answer/reopen 解锁作答并清掉 id', () => {
    let s = reduce(reduce(init, { type: 'load/begin' }), { type: 'load/hydrate', loadId: 1, question: q('a'), stats: null })
    s = reduce(s, { type: 'answer/id', answerId: 'row-1' })
    s = reduce(s, { type: 'answer/submitted' })
    const reopened = reduce(s, { type: 'answer/reopen' })
    assert.equal(reopened.submitted, false)
    assert.equal(reopened.answerId, null)
    assert.equal(reopened.question.id, 'a', '解锁不该影响当前题目')
  })

  check('answer/clear 只清作答、不动加载号（顺序刷题那条路径靠它）', () => {
    let s = reduce(reduce(init, { type: 'load/begin' }), { type: 'load/hydrate', loadId: 1, question: q('a'), stats: null })
    s = reduce(s, { type: 'answer/select', answer: 2 })
    s = reduce(s, { type: 'answer/id', answerId: 'row-1' })
    s = reduce(s, { type: 'answer/submitted' })
    const cleared = reduce(s, { type: 'answer/clear' })
    assert.equal(cleared.selectedAnswer, null)
    assert.equal(cleared.submitted, false)
    assert.equal(cleared.answerId, null)
    assert.equal(cleared.loadId, s.loadId, '不该作废加载号')
    assert.equal(cleared.question.id, 'a', '不该动题目')
  })

  check('canSubmit 只在"有题 + 已选 + 未交"时为真', () => {
    let s = reduce(init, { type: 'load/begin' })
    assert.equal(canSubmit(s), false, '还没题')
    s = reduce(s, { type: 'load/hydrate', loadId: s.loadId, question: q('a'), stats: null })
    assert.equal(canSubmit(s), false, '还没选')
    s = reduce(s, { type: 'answer/select', answer: 1 })
    assert.equal(canSubmit(s), true)
    s = reduce(s, { type: 'answer/submitted' })
    assert.equal(canSubmit(s), false, '已交卷')
  })

  check('stats/set 只改传进来的那个计数', () => {
    const s = reduce(init, { type: 'stats/set', attempts: 5 })
    assert.equal(s.attempts, 5)
    assert.equal(s.wrongs, 0)
  })

  check('question/replace 只换题，作答状态不动', () => {
    let s = reduce(reduce(init, { type: 'load/begin' }), { type: 'load/hydrate', loadId: 1, question: q('a'), stats: null })
    s = reduce(s, { type: 'answer/select', answer: 3 })
    const verified = reduce(s, { type: 'question/replace', question: { ...q('a'), verified: true } })
    assert.equal(verified.question.verified, true)
    assert.equal(verified.selectedAnswer, 3, '切换"已验证"不该清掉用户已选的答案')
  })

  check('reset 清空题目与作答但保留 loadId', () => {
    let s = reduce(reduce(init, { type: 'load/begin' }), { type: 'load/hydrate', loadId: 1, question: q('a'), stats: null })
    s = reduce(s, { type: 'answer/select', answer: 1 })
    const cleared = reduce(s, { type: 'reset' })
    assert.equal(cleared.question, null)
    assert.equal(cleared.selectedAnswer, null)
    assert.equal(cleared.loadId, s.loadId)
  })
} finally {
  rmSync(outDir, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`\n${failures} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')
