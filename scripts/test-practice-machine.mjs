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

/**
 * 把被测模块（及其运行时依赖）转成 ESM 写进临时目录。
 *
 * `@/` 别名在 node 里解析不了，所以顺手把值导入改写成同目录的相对路径；
 * `import type` 会被 transpileModule 直接抹掉，不用管。
 * 依赖链刻意写死成清单 —— 多一个文件就多加一行，比实现一个通用打包器划算。
 */
function buildModules(outDir) {
  const MODULES = ['lib/practice-session.ts', 'lib/exam-session.ts', 'lib/answer-utils.ts', 'lib/constants.ts']
  for (const rel of MODULES) {
    const source = readFileSync(join(root, 'src', rel), 'utf8')
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
      throw new Error(`转译 ${rel} 失败：\n${text}`)
    }
    const rewritten = outputText.replace(/from '@\/([^']+)'/g, (_m, p) => `from './${p.split('/').pop()}.mjs'`)
    writeFileSync(join(outDir, `${rel.split('/').pop().replace(/\.ts$/, '')}.mjs`), rewritten)
  }
}

try {
  buildModules(outDir)

  const {
    initialPracticeQuestionState: init,
    practiceQuestionReducer: reduce,
    staleResponse,
    canSubmit,
    pickRandomFrom,
  } = await import(pathToFileURL(join(outDir, 'practice-session.mjs')).href)

  const {
    initialExamSessionState: examInit,
    examSessionReducer: examReduce,
    examCardCount,
  } = await import(pathToFileURL(join(outDir, 'exam-session.mjs')).href)

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

  check('load/apply 不做过期判定，但走同一条"换题 + 搬统计 + 清作答"规则', () => {
    // 顺序刷题路径自己判过期，所以这里即便 loadId 对不上也必须落状态
    const s = reduce(init, { type: 'load/begin' })
    const applied = reduce(s, { type: 'load/apply', question: q('seq-1'), stats: stats() })
    assert.equal(applied.question.id, 'seq-1')
    assert.equal(applied.attempts, 3)
    assert.equal(applied.wrongs, 1)
    assert.equal(applied.note, '笔记')
    assert.equal(applied.isPublic, true)
    assert.equal(applied.selectedAnswer, null, '换题要清掉上一题的作答')
    assert.equal(applied.submitted, false)
  })

  check('load/apply 与 load/hydrate 的落状态结果一致', () => {
    const base = reduce(init, { type: 'load/begin' })
    const viaHydrate = reduce(base, { type: 'load/hydrate', loadId: base.loadId, question: q('x'), stats: stats() })
    const viaApply = reduce(base, { type: 'load/apply', question: q('x'), stats: stats() })
    assert.deepEqual(viaApply, viaHydrate)
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

  // ── 挑题：收藏 / 复习 / 仅错题 三条分支共用的那条规则 ──
  console.log('\npickRandomFrom')

  const cand = (id, over = {}) => ({
    question_id: id,
    question: { subject: '数学', category: '代数', categories: ['代数'], question_type: 'single_choice', key_points: '一元二次', ...over },
  })
  const noFilters = { subjects: [], category: '', type: '', keyPoint: '' }

  check('空候选返回 null', () => {
    assert.equal(pickRandomFrom([], noFilters), null)
  })

  check('无筛选时从全部里取，且只看注入的随机数', () => {
    const rows = [cand('a'), cand('b'), cand('c')]
    assert.equal(pickRandomFrom(rows, noFilters, () => 0), 'a')
    assert.equal(pickRandomFrom(rows, noFilters, () => 0.5), 'b')
    // 上界必须夹住：Math.random 理论上是 [0,1)，但注入 1 时不能越界拿到 undefined
    assert.equal(pickRandomFrom(rows, noFilters, () => 1), 'c')
  })

  check('学科筛选', () => {
    const rows = [cand('a', { subject: '数学' }), cand('b', { subject: '英语' })]
    assert.equal(pickRandomFrom(rows, { ...noFilters, subjects: ['英语'] }, () => 0), 'b')
  })

  check('分类筛选命中 category 或 categories 任一', () => {
    const rows = [cand('a', { category: '代数', categories: ['代数'] }), cand('b', { category: null, categories: ['几何'] })]
    assert.equal(pickRandomFrom(rows, { ...noFilters, category: '几何' }, () => 0), 'b', 'categories 里有也算命中')
    assert.equal(pickRandomFrom(rows, { ...noFilters, category: '代数' }, () => 0), 'a')
  })

  check('题型与知识点筛选', () => {
    const rows = [cand('a', { question_type: 'single_choice', key_points: '一元二次' }), cand('b', { question_type: 'multi_select', key_points: '极限' })]
    assert.equal(pickRandomFrom(rows, { ...noFilters, type: 'multi_select' }, () => 0), 'b')
    assert.equal(pickRandomFrom(rows, { ...noFilters, keyPoint: '极限' }, () => 0), 'b')
    assert.equal(pickRandomFrom(rows, { ...noFilters, keyPoint: '不存在' }), null, '筛完没有候选要回 null，而不是硬取一个')
  })

  check('多个筛选条件是「与」的关系', () => {
    const rows = [cand('a', { subject: '数学', question_type: 'single_choice' }), cand('b', { subject: '数学', question_type: 'multi_select' })]
    assert.equal(pickRandomFrom(rows, { subjects: ['数学'], category: '', type: 'multi_select', keyPoint: '' }, () => 0), 'b')
    assert.equal(pickRandomFrom(rows, { subjects: ['英语'], category: '', type: 'multi_select', keyPoint: '' }), null)
  })

  check('subject 为 null 的题不会被学科筛选命中（三条分支口径一致）', () => {
    const rows = [cand('a', { subject: null })]
    assert.equal(pickRandomFrom(rows, { ...noFilters, subjects: ['数学'] }), null)
    assert.equal(pickRandomFrom(rows, noFilters, () => 0), 'a', '不筛学科时仍然可选')
  })

  // ── 考试会话状态机 ──
  console.log('\nexam-session 状态机')

  const examSession = (over = {}) => ({
    id: 's1', user_id: 'u1', status: 'in_progress', total_questions: 2, correct_count: 0,
    score: null, question_ids: ['q1', 'q2'], current_index: 0, duration_ms: 60_000,
    started_at: new Date(0).toISOString(), completed_at: null, ...over,
  })
  const examQ = (id, over = {}) => ({ id, question_type: 'single_choice', question_text: id, options: [], correct_answer: 0, category: null, categories: [], subject: null, analysis: null, key_points: null, answer_explanation: null, seq_number: null, created_at: new Date(0).toISOString(), created_by: null, verified: true, import_mode: null, allow_unordered: false, unordered_blanks: null, source_page: null, ...over })

  /** 走完"组卷成功"这一步 */
  const examStarted = () => examReduce(
    examReduce(examInit, { type: 'compose/begin' }),
    { type: 'compose/loaded', session: examSession(), questions: [examQ('q1'), examQ('q2')] },
  )

  check('compose/begin 只翻阶段并清错误，载荷留着（失败时还看得见上一场）', () => {
    const dirty = { ...examStarted(), error: 'old' }
    const next = examReduce(dirty, { type: 'compose/begin' })
    assert.equal(next.phase, 'composing')
    assert.equal(next.error, null)
    assert.equal(next.session, dirty.session, '不该清掉上一场的会话')
    assert.equal(next.questions.length, 2)
  })

  check('组卷成功后进入 in_progress 且清空上一场的答案与游标', () => {
    const dirty = { ...examStarted(), answers: new Map([['q1', 0]]), currentIndex: 1 }
    const next = examReduce(dirty, { type: 'compose/loaded', session: examSession({ id: 's2' }), questions: [examQ('x')] })
    assert.equal(next.phase, 'in_progress')
    assert.equal(next.session.id, 's2')
    assert.equal(next.currentIndex, 0)
    assert.equal(next.answers.size, 0)
  })

  check('只有开考后才改得了答案', () => {
    const idle = examReduce(examInit, { type: 'answer/set', questionId: 'q1', answer: 1 })
    assert.equal(idle.answers.size, 0, 'idle 下作答必须被忽略')
    const composing = examReduce(examReduce(examInit, { type: 'compose/begin' }), { type: 'answer/set', questionId: 'q1', answer: 1 })
    assert.equal(composing.answers.size, 0, '组卷中也不该改答案')
    const started = examReduce(examStarted(), { type: 'answer/set', questionId: 'q1', answer: 1 })
    assert.equal(started.answers.get('q1'), 1)
  })

  check('交卷中不能改答案', () => {
    const submitting = examReduce(examStarted(), { type: 'submit/begin' })
    assert.equal(submitting.phase, 'submitting')
    const after = examReduce(submitting, { type: 'answer/set', questionId: 'q1', answer: 1 })
    assert.equal(after.answers.size, 0, '交卷在途时改答案必须被忽略')
  })

  check('游标夹在 [0, 卡片数-1]，越界与空题集都不会得到非法下标', () => {
    const s = examStarted()
    assert.equal(examReduce(s, { type: 'index/move', delta: 99 }).currentIndex, 1, '上界夹住')
    assert.equal(examReduce(s, { type: 'index/move', delta: -99 }).currentIndex, 0, '下界夹住')
    assert.equal(examReduce(s, { type: 'index/set', index: 5 }).currentIndex, 1)
    const empty = examReduce(examInit, { type: 'index/set', index: 3 })
    assert.equal(empty.currentIndex, 0, '没有题时游标恒为 0')
  })

  check('卷面题型按小题数算上界（sessionItemCount 的口径）', () => {
    const paper = examQ('p1', { question_type: 'case_analysis', case_questions: [
      { id: 'a', type: 'single_choice', text: 'a', options: [], answer: 0 },
      { id: 'b', type: 'single_choice', text: 'b', options: [], answer: 0 },
      { id: 'c', type: 'single_choice', text: 'c', options: [], answer: 0 },
    ] })
    assert.equal(examCardCount([paper]), 3, '一条记录 3 张卡')
    const s = examReduce(examReduce(examInit, { type: 'compose/begin' }), { type: 'compose/loaded', session: examSession(), questions: [paper] })
    assert.equal(examReduce(s, { type: 'index/move', delta: 5 }).currentIndex, 2, '按小题数夹到第 3 张')
  })

  check('没有会话就不可能开始交卷；重复提交只认第一次', () => {
    assert.equal(examReduce(examInit, { type: 'submit/begin' }).phase, 'idle')
    const s = examStarted()
    const once = examReduce(s, { type: 'submit/begin' })
    const twice = examReduce(once, { type: 'submit/begin' })
    assert.equal(twice, once, '已经在交卷中，第二次 begin 应当原样返回')
  })

  check('交卷成功才进 completed，并带上分数', () => {
    const submitting = examReduce(examStarted(), { type: 'submit/begin' })
    const done = examReduce(submitting, { type: 'submit/done', patch: { status: 'completed', correct_count: 2, score: 100 } })
    assert.equal(done.phase, 'completed')
    assert.equal(done.session.status, 'completed')
    assert.equal(done.session.score, 100)
    assert.equal(done.session.correct_count, 2, 'patch 要合进会话')
  })

  check('交卷失败退回 in_progress（还能再交一次），组卷失败才是 failed', () => {
    const submitting = examReduce(examStarted(), { type: 'submit/begin' })
    const back = examReduce(submitting, { type: 'request/failed', message: '网络炸了' })
    assert.equal(back.phase, 'in_progress', '交卷失败不该把整场考试判死')
    assert.equal(back.error, '网络炸了')
    assert.equal(back.session.status, 'in_progress')

    const composing = examReduce(examInit, { type: 'compose/begin' })
    assert.equal(examReduce(composing, { type: 'request/failed', message: '组卷失败' }).phase, 'failed')
  })

  check('续考：游标用会话里的值并夹住，答案一起恢复', () => {
    const restored = examReduce(examInit, {
      type: 'session/restored',
      session: examSession({ current_index: 9 }),
      questions: [examQ('q1'), examQ('q2')],
      answers: new Map([['q1', 0]]),
    })
    assert.equal(restored.phase, 'in_progress')
    assert.equal(restored.currentIndex, 1, '会话里的越界游标要夹住')
    assert.equal(restored.answers.get('q1'), 0)
  })

  check('续考读到已完成的会话：进 completed 且没有题目可做', () => {
    const done = examReduce(examInit, { type: 'session/history', session: examSession({ status: 'completed', score: 88 }) })
    assert.equal(done.phase, 'completed')
    assert.equal(done.questions.length, 0)
    assert.equal(done.currentIndex, 0)
  })

  check('reset 回到初始态，answers 是新 Map（不能把上一场的引用带过去）', () => {
    const s = examReduce(examStarted(), { type: 'answer/set', questionId: 'q1', answer: 1 })
    const reset = examReduce(s, { type: 'reset' })
    assert.equal(reset.phase, 'idle')
    assert.equal(reset.session, null)
    assert.equal(reset.questions.length, 0)
    assert.equal(reset.answers.size, 0)
    assert.notEqual(reset.answers, examInit.answers, '必须是新对象')
  })
} finally {
  rmSync(outDir, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`\n${failures} 项失败`)
  process.exit(1)
}
console.log('\n全部通过')
