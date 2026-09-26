/**
 * 路由冒烟测试：在**假后端**上把每条路由都打开一遍，确认它们能挂载。
 *
 * 为什么需要它：`smoke-boot.mjs` 只能到未登录的落地页，而这一轮改的东西（练习页状态机、
 * 各页的加载路径）全在登录之后。没有测试账号，所以这里换一条路：把认证会话塞进 localStorage、
 * 把 /rest、/auth、/functions 全部拦下来返回"空但合法"的数据，让应用以为自己登录了，
 * 于是每条路由的组件真的被挂载一次。
 *
 * 它能抓到的是**渲染期崩溃**（未捕获异常、白屏），这正是拆组件/改状态归属最容易踩的雷，
 * 也正是 tsc 和构建都看不见的。它**不校验业务正确性**——后端是我编的。
 *
 * 为什么不动生产库：全程只读且被拦截，不写任何数据，不需要测试账号，也就不会在线上留下垃圾。
 *
 * 用法：npm run smoke:routes（需要先 npm run build）
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('路由冒烟测试失败: 找不到 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

/**
 * 从 router/index.tsx 里抽出要访问的路由，跟着源码走，避免手维护一份清单。
 * 判定父子关系靠 admin 那段的位置：它在之前的相对路径属于应用根，之后的属于 /admin。
 */
function collectRoutes() {
  const src = readFileSync(join(root, 'src/router/index.tsx'), 'utf8')
  const adminAt = src.indexOf("path: 'admin'")
  const paths = [...src.matchAll(/path: '([^']*)'/g)].map((m) => ({ path: m[1], at: m.index }))
  const out = []
  for (const { path, at } of paths) {
    if (path === 'admin') continue
    if (path.includes(':')) continue // 参数路由没有真实 id 可访问
    if (path.startsWith('/')) out.push(path === '/' ? '/' : path)
    else if (adminAt >= 0 && at > adminAt) out.push(`/admin/${path}`)
    else out.push(`/${path}`)
  }
  return [...new Set(out)]
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

function serveDist() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
      const candidate = normalize(join(distDir, urlPath))
      const file = candidate.startsWith(distDir) && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : join(distDir, 'index.html')
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
      createReadStream(file).pipe(res)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** 造一个格式合法、未过期的 JWT —— supabase-js 会解它看 exp，但不会验签（验签在服务端，而我们拦掉了请求） */
function fakeJwt(sub) {
  const now = Math.floor(Date.now() / 1000)
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now }),
    'smoke-signature',
  ].join('.')
}

const USER_ID = '00000000-0000-0000-0000-0000000000aa'

/**
 * verify-totp 的 status 响应。
 *
 * 两个字段必须一起看：
 *   · `availableMethods` 至少给一个方法且 `needsMfa: false` —— 否则 OtpGuard 会因为
 *     "admin 必须配 2FA" 把整个应用跳到 /guide（我第一版就是这么写的，而当时的假象是
 *     它其实一直在重试、页面还能渲染，所以没暴露）；
 *   · `role: 'admin'` 与 profiles 那份资料保持一致，/admin/* 才进得去。
 */
const MFA_STATUS = {
  needsMfa: false,
  sessionVerified: true,
  deviceTrusted: true,
  deviceExpiresAt: null,
  graceUntil: null,
  validityDays: 7,
  onboarded: true,
  role: 'admin',
  availableMethods: { passkey: true, totp: true, recovery: true },
}

/**
 * 一份能过 ProtectedRoute(requiredRole='admin') 的资料。
 * 没有它，/admin/* 会被弹回仪表盘 —— 那样"56 条路由都能挂载"是假的：
 * 挂载的是仪表盘，不是那些页面。
 */
const PROFILE = {
  id: USER_ID,
  role: 'admin',
  nickname: '冒烟测试',
  avatar_url: null,
  avatar_preset: null,
  created_at: new Date(0).toISOString(),
  // 给一个截止日期 + 一份 get_subject_progress 数据，头部计划菜单里那张 echarts 小图才会渲染
  // （它现在走懒加载，见「计划菜单图表」那条断言）。没截止日期时那一段只会显示"未设置计划"。
  deadline: '2099-01-01',
  // 有学科才不会被"尚未设置学习计划"挡住 —— 练习页在没计划时不挑题，也就测不到题目卡片。
  // SMOKE_PLAN_SUBJECTS 可覆盖：传一个**畸形值**（例如裸字符串）就能验证读取端是否真的容错
  plan_subjects: process.env.SMOKE_PLAN_SUBJECTS ?? '["冒烟学科"]',
  plan_rounds: null,
  plan_goals: null,
  daily_targets: null,
  daily_deadline: null,
  milestones: null,
  goal_type: null,
  exam_status: null,
  target_school: null,
  profile_visibility: {},
  plan_reset_at: null,
  plan_scope: null,
  subject_reset_at: null,
  daily_reset_at: null,
  totp_enabled: false,
  preferred_2fa: 'totp',
  passkey_timeout_minutes: 30,
  mfa_grace_until: null,
  mfa_validity_days: 7,
  onboarded_at: new Date(0).toISOString(),
}

const json = (route, body, status = 200, headers = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'content-range': '*/0', ...headers }, body: JSON.stringify(body) })

/**
 * 除了逐条打开路由，还要对关键页面断言"该出现的内容出现了"——
 * 只断言"没抛异常"会让一个渲染成空壳的页面也算通过。
 * 这里挑的是本轮改过状态归属的两条路径。
 */
const CONTENT_PROBES = [
  { url: '/practice?mode=random', expect: '冒烟测试题', why: '练习页随机模式要真的把题目渲染出来（状态机 hydrate 的结果）' },
  { url: '/practice', expect: '冒烟测试题', why: '顺序刷题分支：恢复上次会话后要把题渲染出来（走 applyLoaded 那条）' },
]

/**
 * 交互式断言：选题 → 交卷 → 结果。
 *
 * 只断言"题目渲染出来了"覆盖不到交卷那一半：`answer/select` 被交卷锁住、`answer/id` 与
 * `answer/submitted` 两步顺序、以及判分（isAnswerCorrect）走没走通，都在这之后。
 * 点的是**正确**选项（fixture 的 correct_answer = 1，即选项 B='7'），所以交卷后题卡上会同时出现
 * 「正确」标记与「下一题」按钮 —— 前者证明判分结果被渲染，后者证明 `isSubmitted` 真的翻了。
 *
 * 名字用正则而不是字面量：选项按钮是 `<span>B</span><span>7</span>` 两个相邻内联元素，
 * JSX 会把它们之间的空白去掉，所以**可访问名是 "B7"**，而 innerText 看起来是 "B 7"。
 * 按 "B 7" 精确匹配会一直超时（我试过）。
 */
const SUBMIT_FLOW = { url: '/practice?mode=random', optionName: /^B\s*7$/, optionLabel: 'B 7' }

/**
 * 考试状态机的端到端断言：开考 → 作答 → 交卷 → 成绩页。
 *
 * 为什么非要在浏览器里跑一遍：考试那台状态机（composing / in_progress / submitting / completed）
 * 是这一轮改出来的，`test:machine` 只覆盖 reducer 本身，组件里"阶段到了没、这一跳有没有跳"没人验。
 * 拆 `ExamSession.tsx`（1900 行）之前必须有这条线 —— 否则拆完只能说"它还能渲染"。
 *
 * 断言分两半，缺一不可：
 *   · 跳转到 `/exam/result/<本场 id>` 且成绩页渲染出来 —— 证明 completed 阶段真的到达并被消费；
 *   · 网络侧真的有 POST /user_answers 与 PATCH /exam_sessions —— 否则"跳过去了"也可能只是
 *     本地状态翻了个布尔，写完库那一刻没人管。
 * 后者是特意用请求记录而不是读 DOM 的：进度计数是三个相邻内联 span，innerText 里带不带空格
 * 取决于 flex 布局，按文本断言会飘（练习页那个 "B 7" vs "B7" 已经栽过一次）。
 *
 * 开考之后还要把三种视图各切一遍：卷面（单页/双页）与卡片模式渲染的是完全不同的组件
 * （`PaperPreview` / `PaperSpreadView` 对 `ExamSession` 里那张卡片区），而它们此前**只被
 * "路由能挂载"覆盖**——挂载时默认是卡片模式，卷面组件根本没被执行过。判据用 `[data-qid]`：
 * 那是卷面组件给每道题打的锚，卡片模式下不存在，所以它的有无就能证明"真的换了一套渲染"，
 * 而不是靠读标题文案（那个在侧边栏里也有同名文字）。
 */
const EXAM_FLOW = {
  url: '/exam',
  startLabel: '开始考试',
  toolbarHint: '共 2 题',
  // 卷面模式下这几个键切换的是渲染路径，卡片模式下题目才会以选项按钮出现
  modes: [
    { key: 'sheet', label: '单页摊开', paper: true },
    { key: 'spread', label: '双页摊开', paper: true },
    { key: 'card', label: '卡片模式', paper: false },
  ],
  optionName: /^B\s*7$/,
  submitLabel: '交卷',
  confirmLabel: '确认交卷',
  resultExpect: '考试成绩',
}

/**
 * 喂了畸形 plan_subjects 时，练习页**正确地**停在"尚未设置学习计划"，不会挑题 ——
 * 那种模式下内容断言必然不成立，所以跳过它。这一轮仍会跑完整路由扫描，
 * 而要证明的正是"畸形值不再把整个应用炸掉"（改之前 PlanDialog 里那句裸 JSON.parse 会）。
 */
const planSubjectsUsable = (() => {
  const raw = process.env.SMOKE_PLAN_SUBJECTS
  if (!raw) return true
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0
  } catch { return false }
})()

/**
 * 让练习页真的渲染出一道题。
 *
 * 默认的空后端下练习页只到"尚未设置学习计划"就停了，题目卡片、选项、交卷按钮都不会出现 ——
 * 而这一轮改的正是那道题的状态归属，所以必须喂数据才测得到。
 * 挑题走的是 get_random_question_id（随机模式），所以那个 RPC 也要给一个 id，
 * 否则页面在"挑不到题"那一步就结束了。
 */
const QUESTION_ID = '11111111-1111-1111-1111-111111111111'
const QUESTION_ROW = {
  id: QUESTION_ID,
  question_type: 'single_choice',
  question_text: '冒烟测试题：以下哪个是质数？',
  options: ['4', '7', '9', '15'],
  correct_answer: 1,
  category: '冒烟分类',
  categories: ['冒烟分类'],
  subject: '冒烟学科',
  analysis: null,
  key_points: null,
  answer_explanation: null,
  seq_number: 1,
  created_at: new Date(0).toISOString(),
  created_by: null,
  verified: true,
  import_mode: null,
  allow_unordered: false,
  unordered_blanks: null,
  source_page: null,
  test_cases: null,
  runtime_config: null,
  execution_mode: null,
  examples: null,
  case_questions: null,
  paper: null,
  issue_flag: 'none',
  issue_note: null,
  flagged_at: null,
}

const QUESTION_META_CACHE = {
  subjects: ['冒烟学科'],
  categories: ['冒烟分类'],
  key_points_by_subject: { 冒烟学科: ['冒烟知识点'] },
  updated_at: new Date(0).toISOString(),
}

/**
 * 第二道题：只为「答题卡绑定」那条断言而存在。
 *
 * 一道题的卷子测不出答题卡是干什么的 —— 得有两题才能证明"点第 2 格真的会切到第 2 题"，
 * 以及"第 1 格在第 1 题作答后变成已答"。练习页那边仍然只有一道题（它的会话行写死了一个 id）。
 */
const QUESTION_ID_2 = '22222222-2222-2222-2222-222222222222'
const QUESTION_ROW_2 = {
  ...QUESTION_ROW,
  id: QUESTION_ID_2,
  question_text: '冒烟测试题 2：以下哪个是偶数？',
  options: ['3', '8', '5', '7'],
  seq_number: 2,
}

/**
 * 一份已存在的顺序刷题进度。
 *
 * 顺序模式的入口是"恢复上次会话"：页面先列会话（practice_sequential_state），
 * 找到学科范围一致的一条就 load_practice_session 恢复，再 loadSequentialQuestion 渲染。
 * 没有这条记录，练习页只会停在"尚未选择知识点"，顺序分支（走 applyLoaded 那条）就永远测不到。
 */
const SEQUENTIAL_STATE_ROW = {
  session_key: 'smoke-session',
  selected_kps: ['冒烟知识点'],
  plan_subjects: ['冒烟学科'],
  question_ids: [QUESTION_ID],
  current_index: 0,
  subject_positions: {},
  short_id: 'smk1',
  updated_at: new Date(0).toISOString(),
  created_at: new Date(0).toISOString(),
}

/**
 * 一场进行中的考试。
 *
 * 会话 id 是钉死的常量而不是随机值：`handleStart` 成功后会 `setSearchParams({sessionId})`，
 * 而那个 effect 依赖 searchParams —— 于是紧接着会用这个 id 再 `resumeExam` 一次（线上也这样）。
 * 插入返回的行与按 id 查返回的行必须是**同一场**，否则那一跳会读到另一份数据。
 */
const EXAM_SESSION_ID = 'eeeeeeee-1111-1111-1111-111111111111'
const EXAM_SESSION_ROW = {
  id: EXAM_SESSION_ID,
  user_id: USER_ID,
  status: 'in_progress',
  total_questions: 2,
  correct_count: 0,
  score: null,
  question_ids: [QUESTION_ID, QUESTION_ID_2],
  current_index: 0,
  duration_ms: 3600000,
  started_at: new Date().toISOString(),
  completed_at: null,
  template: null,
}

/** RPC → 返回值。只放首屏真的会调的；其余仍是 null（走空态） */
const RPC_FIXTURES = {
  get_random_question_id: QUESTION_ID,
  // 组卷：两道题 —— 一道走完「开考 → 作答 → 交卷」，第二道给答题卡绑定断言用
  compose_exam: { question_ids: [QUESTION_ID, QUESTION_ID_2], sections: [] },
  // Section 102：交卷 RPC 返回整行 exam_sessions（服务端算好的分数与时长）
  complete_exam: {
    ...EXAM_SESSION_ROW,
    status: 'completed',
    correct_count: 1,
    score: 100,
    duration_ms: 42000,
    completed_at: new Date().toISOString(),
  },
  // Section 103：保存路线返回路线 id（标量，不是行）
  save_learning_route: 'smoke-route-1',
  // Section 106：练习提交返回 (answer_id, created)，PostgREST 对 RETURNS TABLE 回的是数组
  submit_answer: [{ answer_id: 'smoke-answer-1', created: true }],
  // 头部计划菜单那张图的数据源（配上面 PROFILE.deadline）
  get_subject_progress: [{ subject: '冒烟学科', total: 10, done_all: 3, done_today: 1 }],
  get_review_pool_count: 0,
  get_review_count: 0,
  count_question_items: 1,
  load_practice_session: {
    found: true,
    sessionKey: 'smoke-session',
    shortId: 'smk1',
    savedKps: ['冒烟知识点'],
    questionIds: [QUESTION_ID],
    questionKps: ['冒烟知识点'],
    questionSubjects: ['冒烟学科'],
    currentIndex: 0,
    subjectPositions: {},
  },
}

/**
 * 故意让某些请求失败：给「真实错误路径会不会上报」那条断言用。
 * 用法是加一个 URL 片段进去、跑完删掉，免得影响别的断言。
 */
const failPaths = new Set()

async function installStubs(context) {
  // 会话直接写进 localStorage（键名与 lib/supabase.ts 里钉死的 storageKey 一致）
  await context.addInitScript(({ userId, jwt }) => {
    const now = Math.floor(Date.now() / 1000)
    localStorage.setItem('sb-supabase-auth-token', JSON.stringify({
      access_token: jwt,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: 'smoke-refresh',
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'smoke@example.test',
        created_at: new Date(0).toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
      },
    }))
  }, { userId: USER_ID, jwt: fakeJwt(USER_ID) })

  /*
   * 注意顺序：Playwright 的路由是「后注册的先匹配」，所以通配要写在前面、具体路径写在后面。
   * 反过来的话通配会把 verify-totp 吃掉 —— 那正是我踩过的坑：MFA 状态接口一直返回 {}，
   * "mfa status malformed" 让 OtpGuard 进入重试，而每条路由只等 1.2s，恰好落在重试窗口里，
   * 于是"56 条路由都渲染出内容"看起来全对，实际上 4.5 秒后整个应用会被 MFA 门禁盖住。
   * （这段注释里不能出现星号加斜杠，会提前结束块注释 —— 也是踩过的。）
   */
  await context.route('**/functions/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))

  await context.route('**/functions/v1/verify-totp', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MFA_STATUS) }))

  await context.route('**/auth/v1/**', (route) => {
    const url = route.request().url()
    if (url.includes('/user')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: USER_ID, email: 'smoke@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() }) })
    }
    if (url.includes('/logout')) return route.fulfill({ status: 204, body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // 表查询：profiles 给一份真资料（否则 /admin/* 会被弹回仪表盘，"能挂载"就是假的）；
  // questions / question_meta_cache 喂数据好让练习页真的渲染出题目；其余表回空数组
  await context.route('**/rest/v1/**', (route) => {
    const req = route.request()
    const url = req.url()
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    // 写入路径几乎都是 `.insert(...).select(...).single()`，必须回一行才走得下去 ——
    // 回 406 会让 saveAnswer 抛错，交卷那半条链路就测不到了。
    // exam_sessions 是个例外：`createExamSession` 把整行读进领域对象，只回一个 id 会让
    // started_at 变成 undefined（计时器 / 成绩页都读它），所以必须回完整的一场。
    if (req.method() !== 'GET') {
      if (url.includes('/exam_sessions')) return json(route, wantsObject ? EXAM_SESSION_ROW : [EXAM_SESSION_ROW])
      return json(route, wantsObject ? { id: 'smoke-row-1' } : [{ id: 'smoke-row-1' }])
    }
    if (url.includes('/profiles')) return json(route, wantsObject ? PROFILE : [PROFILE])
    for (const p of failPaths) {
      // 500 是「服务端瞬时故障」：run 会重试两次再抛，正好走完真实的失败路径
      if (url.includes(p)) return json(route, { code: 'XX000', message: 'stub: 故意失败', details: null, hint: null }, 500)
    }
    if (url.includes('/questions')) {
      const withSecond = url.includes(QUESTION_ID_2)
      // 组卷组了两道题时把两道都给出来（答题卡绑定那条断言要两题才有意义）。
      // 注意 PostgREST 的过滤是 `id=in.%28a%2Cb%29` —— 括号和逗号都被转义了，
      // 所以判据只能用「URL 里有没有第二个 id」，不能去正则匹配 `id=in.(`。
      return json(route, wantsObject
        ? (withSecond ? QUESTION_ROW_2 : QUESTION_ROW)
        : (withSecond ? [QUESTION_ROW, QUESTION_ROW_2] : [QUESTION_ROW]))
    }
    if (url.includes('/question_meta_cache')) return json(route, wantsObject ? QUESTION_META_CACHE : [QUESTION_META_CACHE])
    if (url.includes('/practice_sequential_state')) return json(route, wantsObject ? SEQUENTIAL_STATE_ROW : [SEQUENTIAL_STATE_ROW])
    if (url.includes('/exam_sessions')) {
      // 「有没有在考的」→ 回 406，开始页才会出现（有行的话弹的是续考弹窗，开考按钮就点不到了）
      if (url.includes('status=eq.in_progress')) {
        return json(route, { code: 'PGRST116', details: 'Results contain 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406)
      }
      return json(route, wantsObject ? EXAM_SESSION_ROW : [EXAM_SESSION_ROW])
    }
    if (wantsObject) {
      // 与 PostgREST 对齐：向 .single() 要一行却没有行时是 406 + PGRST116
      return json(route, { code: 'PGRST116', details: 'Results contain 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406)
    }
    return json(route, [])
  })

  /*
   * RPC 必须写在 `rest` 通配**之后** —— Playwright 是「后注册的先匹配」，写在前面就会被那条
   * 通配整个吃掉。我一开始就是写在前面，于是 RPC_FIXTURES 一个字都没生效过：组卷请求收到的是
   * 通配给 POST 的 `[{id:'smoke-row-1'}]`，toComposeExamResult 解析出空题单，页面停在
   * "No questions available"。而练习页看起来是好的（它从 practice_sequential_state 的行里
   * 拿到了题号），所以这个洞藏了很久 —— 直到考试链路非要 compose_exam 不可才露出来。
   */
  await context.route('**/rest/v1/rpc/**', (route) => {
    const name = route.request().url().split('/rpc/')[1]?.split('?')[0] ?? ''
    const fixture = Object.prototype.hasOwnProperty.call(RPC_FIXTURES, name) ? RPC_FIXTURES[name] : null
    return json(route, fixture)
  })

  // 静态资源之外的外部请求（字体/CDN）直接放行会变慢，这里给个空响应
  await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await context.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ status: 200, body: '' }))
}

const routes = collectRoutes()
// 传参时只跑指定路由，并把正文打出来 —— 用来核对"这条路由到底渲染了它自己的内容，
// 还是所有路由都撞在同一个门禁页上"（各路由正文字数异常一致时就有这个嫌疑）
const filter = process.argv.slice(2)
const selected = filter.length > 0 ? routes.filter((r) => filter.some((f) => r.includes(f))) : routes
const server = await serveDist()
const { port } = server.address()
const base = `http://127.0.0.1:${port}`

console.log(`路由冒烟测试: ${base}`)
console.log(`共 ${selected.length} 条路由（参数路由已跳过）\n`)

const browser = await chromium.launch()
const results = []
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } })
  await installStubs(context)
  const page = await context.newPage()

  let currentErrors = []
  page.on('pageerror', (err) => currentErrors.push(err.message))

  // 写请求单独记一份：断言"某个阶段真的落库了"，比读 DOM 文案稳
  let currentWrites = []
  page.on('request', (req) => {
    // 记 body：离线队列那条断言要证明"重发用的是同一个 client_operation_id"，
    // 只看 URL 分不出是排空重发还是又插了一次
    if (req.method() !== 'GET') currentWrites.push({ method: req.method(), url: req.url(), body: req.postData() ?? '' })
  })
  page.on('requestfailed', (req) => {
    console.log(`        ⚠ 请求失败 ${req.method()} ${req.url().replace(base, '')} ${req.failure()?.errorText ?? ''}`)
  })

  for (const route of selected) {
    currentErrors = []
    let length = 0
    let note = ''
    let text = ''
    try {
      await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 30_000 })
      await page.waitForTimeout(1200)
      text = await page.locator('body').innerText().catch(() => '')
      length = text.trim().length
      if (length < 20) note = '（正文几乎为空）'
    } catch (e) {
      note = `导航失败: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`
    }
    const ok = currentErrors.length === 0
    results.push({ route, ok, length, errors: [...currentErrors], note, text: text.replace(/\s+/g, ' ').slice(0, 300) })
    console.log(`  ${ok ? '✓' : '✗'} ${route.padEnd(34)} ${String(length).padStart(5)} 字符 ${note}`)
    if (filter.length > 0) console.log(`        正文: ${JSON.stringify(text.replace(/\s+/g, ' ').slice(0, 300))}`)
    if (!ok) for (const e of currentErrors.slice(0, 3)) console.log(`        ${e.slice(0, 160)}`)
  }

  // ── 关键页面的内容断言 ──
  // 只断言"没抛异常"会让一个渲染成空壳的页面也算通过，所以这里额外要求该出现的内容出现
  console.log('')
  if (!planSubjectsUsable) {
    console.log(`  – 跳过内容断言：SMOKE_PLAN_SUBJECTS=${JSON.stringify(process.env.SMOKE_PLAN_SUBJECTS)} 不是合法数组，练习页正确地停在"尚未设置学习计划"`)
  }
  for (const probe of (planSubjectsUsable ? CONTENT_PROBES : [])) {
    currentErrors = []
    let body = ''
    try {
      await page.goto(`${base}${probe.url}`, { waitUntil: 'load', timeout: 30_000 })
      await page.waitForTimeout(1500)
      body = await page.locator('body').innerText().catch(() => '')
    } catch (e) {
      results.push({ route: `${probe.url} ⇒ ${probe.expect}`, ok: false, length: 0, errors: [String(e)], note: '导航失败' })
      console.log(`  ✗ ${probe.url} 期望出现「${probe.expect}」—— 导航失败`)
      continue
    }
    const hit = body.includes(probe.expect)
    const ok = hit && currentErrors.length === 0
    console.log(`  ${ok ? '✓' : '✗'} ${probe.url} 期望出现「${probe.expect}」`)
    if (!hit) {
      console.log(`        ${probe.why}`)
      console.log(`        实际正文: ${JSON.stringify(body.replace(/\s+/g, ' ').slice(0, 220))}`)
    }
    results.push({ route: `${probe.url} ⇒ ${probe.expect}`, ok, length: body.length, errors: [...currentErrors], note: hit ? '' : '未出现期望内容' })
  }

  // ── 交互式断言：选题 → 交卷 → 结果 ──
  if (planSubjectsUsable) {
    currentErrors = []
    currentWrites = []
    const label = '选题交卷'
    try {
      await page.goto(`${base}${SUBMIT_FLOW.url}`, { waitUntil: 'load', timeout: 30_000 })
      await page.getByRole('button', { name: SUBMIT_FLOW.optionName }).first().click({ timeout: 10_000 })
      const submitBtn = page.getByRole('button', { name: '提交' }).first()
      console.log(`        · 已点选项；交卷按钮文案=「${(await submitBtn.innerText()).replace(/\s+/g, ' ').trim()}」`)
      await submitBtn.click({ timeout: 10_000 })
      console.log('        · 已点交卷')
      await page.waitForTimeout(1200)
      const body = await page.locator('body').innerText()
      // 交卷后：提交按钮换成「下一题」，且正确答案上出现「正确」标记
      const submitGone = !body.includes('提交本题作答')
      const nextShown = body.includes('下一题')
      const graded = body.includes('正确')
      // 提交现在必须是那一次 RPC（Section 106：作答行 + 顺序进度在服务端一个事务里），
      // 并且**不允许**再出现直接写 user_answers —— 那是 isFunctionMissing 回退分支的特征。
      const submitRpc = currentWrites.some((r) => r.method === 'POST' && r.url.includes('/rest/v1/rpc/submit_answer'))
      const directInsert = currentWrites.some((r) => r.method === 'POST' && r.url.includes('/user_answers'))
      const ok = submitGone && nextShown && graded && submitRpc && !directInsert && currentErrors.length === 0
      console.log(`  ${ok ? '✓' : '✗'} ${SUBMIT_FLOW.url} 选题「${SUBMIT_FLOW.optionLabel}」→ 交卷(RPC) → 结果`)
      if (!ok) {
        console.log(`        提交按钮消失=${submitGone} 出现「下一题」=${nextShown} 出现判分标记=${graded} 提交 RPC=${submitRpc} 退回旧路径=${directInsert}`)
        console.log(`        实际正文: ${JSON.stringify(body.replace(/\s+/g, ' ').slice(0, 260))}`)
        const wrote = currentWrites.map((r) => `${r.method} ${r.url.split('/rest/v1/')[1]?.split('?')[0] ?? r.url.split('/').pop()}`)
        console.log(`        写请求: ${JSON.stringify(wrote.slice(0, 12))}`)
      }
      results.push({ route: `${SUBMIT_FLOW.url} ⇒ ${label}`, ok, length: body.length, errors: [...currentErrors], note: ok ? '' : '交卷链路断言未通过' })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`  ✗ ${SUBMIT_FLOW.url} 选题交卷 —— 操作失败: ${msg.slice(0, 160)}`)
      // 选择器一飘就会超时，而"超时"本身说不出按钮现在叫什么 —— 把候选名字打出来。
      // 注意 allInnerTexts 是 DOM 顺序，侧边栏按钮排在最前面，所以这里按形状筛选项按钮。
      try {
        const names = (await page.getByRole('button').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
        const optionish = names.filter((n) => /^[A-D]\s/.test(n))
        console.log(`        按钮总数=${names.length}，形如选项的=${JSON.stringify(optionish.slice(0, 8))}`)
        // 交卷按钮可能是 disabled（未选中）或者压根没渲染 —— 两种情况要区分开
        const submitBtn = page.getByRole('button', { name: '提交' })
        console.log(`        名字含「提交」的按钮数=${await submitBtn.count()}，disabled=${await submitBtn.first().isDisabled().catch(() => 'n/a')}`)
        if (optionish.length === 0) console.log(`        前 12 个按钮: ${JSON.stringify(names.slice(0, 12))}`)
      } catch { /* 页面可能已经崩了，忽略 */ }
      results.push({ route: `${SUBMIT_FLOW.url} ⇒ ${label}`, ok: false, length: 0, errors: [msg], note: '操作失败' })
    }
  }
  // ── 交互式断言：卷面缩放 + 真实答题卡绑定 ──
  // 这两条是 P1-5「展示层拆分」的前置条件：拆卷面/答题卡/工具栏之前先把它们的行为钉住，
  // 否则拆完只能靠眼睛看（文档里那句"先补渲染断言再动结构"说的就是这个）。
  //   · 缩放：百分比读数与 .paper-sheet 上的 transform 必须**一起**变 —— 只变读数就是假的；
  //   · 答题卡：作答后对应的格子要变"已答"，点第 2 格要真的切到第 2 题（题号与题干都换）。
  {
    currentErrors = []
    const label = '缩放与答题卡'
    try {
      await page.goto(`${base}${EXAM_FLOW.url}`, { waitUntil: 'load', timeout: 30_000 })
      await page.getByRole('button', { name: EXAM_FLOW.startLabel }).first().click({ timeout: 15_000 })
      // 等工具栏（模式切换按钮）真的出现再往下走 —— 开始页那张预览里也有"共 N 题"，
      // 直接等那行文字会匹配到预览，读到的是"还没开考"时的数字
      await page.getByRole('button', { name: '单页摊开' }).first().waitFor({ timeout: 15_000 })

      await page.getByRole('button', { name: '单页摊开' }).first().click({ timeout: 10_000 })
      await page.waitForTimeout(700)

      const sheetScale = () => page.locator('.paper-sheet').first().evaluate((el) => {
        const m = /matrix\(([\d.]+)/.exec(getComputedStyle(el).transform)
        return m ? Number(m[1]) : 1
      })
      // 百分比读数：工具条里那个 "NN%" 的 span
      const pct = page.locator('span.tabular-nums').filter({ hasText: /^\d+%$/ }).first()
      const pctBefore = await pct.innerText({ timeout: 10_000 })
      const scaleBefore = await sheetScale()
      // 「+」就是读数后面那个按钮（工具条结构：缩放选择框 / − / 读数 / + / 平移 / 全屏）
      await pct.locator('xpath=following-sibling::button[1]').click({ timeout: 10_000 })
      await page.waitForTimeout(500)
      const pctAfter = await pct.innerText()
      const scaleAfter = await sheetScale()
      const zoomOk = Number.parseInt(pctAfter, 10) > Number.parseInt(pctBefore, 10) && scaleAfter > scaleBefore
      console.log(`        · 缩放：${pctBefore} → ${pctAfter}，.paper-sheet transform ${scaleBefore.toFixed(3)} → ${scaleAfter.toFixed(3)} ${zoomOk ? '✓' : '✗'}`)

      // 答题卡：先作答第 1 题，再点第 2 格
      await page.getByRole('button', { name: '卡片模式' }).first().click({ timeout: 10_000 })
      await page.waitForTimeout(500)
      await page.getByRole('button', { name: EXAM_FLOW.optionName }).first().click({ timeout: 10_000 })
      await page.waitForTimeout(500)

      const cell1 = page.locator('button[title^="第 1 题"]').first()
      const cell2 = page.locator('button[title^="第 2 题"]').first()
      const cellsOk = (await cell1.count()) > 0 && (await cell2.count()) > 0
      if (cellsOk) await cell2.click({ timeout: 10_000 })
      await page.waitForTimeout(600)
      const bodyText = await page.locator('body').innerText()
      const jumped = cellsOk && bodyText.includes('冒烟测试题 2')
      // 切走之后第 1 格才该显示"已答"（当前格是 bg-primary，已答格才是 emerald —— 见答题卡的
      // 三态样式）。所以这一条要在跳题之后再读，否则读到的是"当前格"的样式。
      await page.waitForTimeout(200)
      const answeredCell = (await cell1.getAttribute('class')) ?? ''
      const markedAnswered = /emerald/.test(answeredCell)
      const currentCell = (await cell2.getAttribute('class')) ?? ''
      const cellIsCurrent = /bg-primary/.test(currentCell)
      const sheetText = await page.locator('aside').first().innerText().catch(() => '')
      const progressOk = /1\/2/.test(sheetText.replace(/\s+/g, ' '))
      const cardOk = cellsOk && jumped && markedAnswered && cellIsCurrent && progressOk
      console.log(`        · 答题卡：格子齐=${cellsOk} 跳题=${jumped} 第 1 格转已答=${markedAnswered} 当前格高亮=${cellIsCurrent} 进度 1/2=${progressOk} ${cardOk ? '✓' : '✗'}`)
      if (!cardOk) {
        const classes = await page.locator('aside button').evaluateAll((els) => els.map((e) => `${e.getAttribute('title')}=${e.className}`).slice(0, 8))
        console.log(`        答题卡格子: ${JSON.stringify(classes)}`)
        console.log(`        实际正文: ${JSON.stringify(bodyText.replace(/\s+/g, ' ').slice(0, 200))}`)
      }

      const ok = zoomOk && cardOk && currentErrors.length === 0
      console.log(`  ${ok ? '✓' : '✗'} ${EXAM_FLOW.url} 卷面缩放 + 真实答题卡绑定`)
      if (!ok) for (const e of currentErrors.slice(0, 3)) console.log(`        未捕获异常: ${e.slice(0, 200)}`)
      results.push({ route: `${EXAM_FLOW.url} ⇒ ${label}`, ok, length: bodyText.length, errors: [...currentErrors], note: ok ? '' : '缩放或答题卡断言未通过' })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`  ✗ ${EXAM_FLOW.url} 缩放与答题卡 —— 操作失败: ${msg.slice(0, 200)}`)
      const body = await page.locator('body').innerText().catch(() => '')
      console.log(`        实际正文: ${JSON.stringify(body.replace(/\s+/g, ' ').slice(0, 200))}`)
      for (const err of currentErrors.slice(0, 3)) console.log(`        未捕获异常: ${err.slice(0, 200)}`)
      results.push({ route: `${EXAM_FLOW.url} ⇒ ${label}`, ok: false, length: 0, errors: [...currentErrors, msg], note: '操作失败' })
    }
  }

  // ── 交互式断言：开考 → 作答 → 交卷 → 成绩页（考试状态机的四个阶段） ──
  {
    currentErrors = []
    currentWrites = []
    const label = '开考作答交卷'
    try {
      await page.goto(`${base}${EXAM_FLOW.url}`, { waitUntil: 'load', timeout: 30_000 })
      await page.getByRole('button', { name: EXAM_FLOW.startLabel }).first().click({ timeout: 15_000 })
      console.log('        · 已点「开始考试」')

      // composing → in_progress：工具栏带着本场题数出现，说明 compose/loaded 走到了
      await page.getByText(EXAM_FLOW.toolbarHint).first().waitFor({ timeout: 15_000 })

      // ── 三种视图各切一遍：卷面组件（单页 PaperPreview / 双页 PaperSpreadView）此前只被
      //    "路由能挂载"覆盖过，而挂载时默认是卡片模式，那些组件根本没执行 ──
      const paperAnchors = () => page.locator(`[data-qid="${QUESTION_ID}"]`)
      const modeChecks = []
      for (const mode of EXAM_FLOW.modes) {
        await page.getByRole('button', { name: mode.label }).first().click({ timeout: 10_000 })
        await page.waitForTimeout(800)
        const anchors = await paperAnchors().count()
        const options = await page.getByRole('button', { name: EXAM_FLOW.optionName }).count()
        // 卷面模式：题锚在、选项按钮不在；卡片模式：反过来
        const ok = mode.paper ? anchors > 0 && options === 0 : anchors === 0 && options > 0
        modeChecks.push({ ...mode, anchors, options, ok })
        console.log(`        · 切到「${mode.label}」: 题锚=${anchors} 选项按钮=${options} ${ok ? '✓' : '✗'}`)
      }
      const modesOk = modeChecks.every((m) => m.ok) && currentErrors.length === 0

      await page.getByRole('button', { name: EXAM_FLOW.optionName }).first().click({ timeout: 15_000 })
      console.log('        · 已作答第 1 题')

      await page.getByRole('button', { name: EXAM_FLOW.submitLabel }).first().click({ timeout: 15_000 })
      await page.getByRole('button', { name: EXAM_FLOW.confirmLabel }).first().click({ timeout: 15_000 })
      console.log('        · 已确认交卷')

      // submitting → completed：会话翻成 completed 后组件跳到成绩页
      await page.waitForURL(`**/exam/result/${EXAM_SESSION_ID}`, { timeout: 15_000 })
      await page.waitForTimeout(800)
      const body = await page.locator('body').innerText()
      const scoreShown = body.includes(EXAM_FLOW.resultExpect)
      const answerWrote = currentWrites.some((r) => r.method === 'POST' && r.url.includes('/user_answers'))
      // 交卷现在必须是那一次 RPC（Section 102：作答入库 + 会话完成在服务端一个事务里）。
      // 同时要求**没有** PATCH exam_sessions —— 那是 isFunctionMissing 回退分支的特征，
      // 少了这一条就分不清"走了新路径"和"悄悄退回旧的两步写法"。
      const submitRpc = currentWrites.some((r) => r.method === 'POST' && r.url.includes('/rest/v1/rpc/complete_exam'))
      const submitPatch = currentWrites.some((r) => r.method === 'PATCH' && r.url.includes('/exam_sessions'))
      const ok = scoreShown && answerWrote && submitRpc && !submitPatch && modesOk && currentErrors.length === 0
      console.log(`  ${ok ? '✓' : '✗'} ${EXAM_FLOW.url} 开考 → 三种视图 → 作答 → 交卷(RPC) → 跳 /exam/result`)
      if (!ok) {
        const wrote = currentWrites.map((r) => `${r.method} ${r.url.split('/rest/v1/')[1]?.split('?')[0] ?? r.url.split('/').pop()}`)
        console.log(`        成绩页出现「${EXAM_FLOW.resultExpect}」=${scoreShown} 作答落库=${answerWrote} 交卷 RPC=${submitRpc} 回退到旧路径=${submitPatch} 视图切换=${modesOk}`)
        for (const m of modeChecks.filter((x) => !x.ok)) console.log(`        视图「${m.label}」不符: 题锚=${m.anchors}（期望${m.paper ? '>0' : '0'}）选项按钮=${m.options}（期望${m.paper ? '0' : '>0'}）`)
        console.log(`        写请求: ${JSON.stringify(wrote.slice(0, 12))}`)
        console.log(`        实际 URL=${page.url()}`)
        console.log(`        实际正文: ${JSON.stringify(body.replace(/\s+/g, ' ').slice(0, 260))}`)
        for (const e of currentErrors.slice(0, 5)) console.log(`        未捕获异常: ${e.slice(0, 200)}`)
      }
      results.push({ route: `${EXAM_FLOW.url} ⇒ ${label}`, ok, length: body.length, errors: [...currentErrors], note: ok ? '' : '考试链路断言未通过' })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`  ✗ ${EXAM_FLOW.url} 开考作答交卷 —— 操作失败: ${msg.slice(0, 160)}`)
      // 选择器飘了就超时，而超时说不出页面上现在有什么 —— 把按钮名和写请求都打出来
      try {
        const names = (await page.getByRole('button').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
        console.log(`        URL=${page.url()} 按钮总数=${names.length}`)
        console.log(`        前 12 个按钮: ${JSON.stringify(names.slice(0, 12))}`)
        const wrote = currentWrites.map((r) => `${r.method} ${r.url.split('/rest/v1/')[1]?.split('?')[0] ?? r.url.split('/').pop()}`)
        console.log(`        写请求: ${JSON.stringify(wrote.slice(0, 12))}`)
        const body = await page.locator('body').innerText().catch(() => '')
        console.log(`        实际正文: ${JSON.stringify(body.replace(/\s+/g, ' ').slice(0, 260))}`)
      } catch { /* 页面可能已经崩了，忽略 */ }
      results.push({ route: `${EXAM_FLOW.url} ⇒ ${label}`, ok: false, length: 0, errors: [msg], note: '操作失败' })
    }
  }

  // ── 交互式断言：计划菜单里的 echarts 小图真的渲染出来 ──
  // 盯的是懒加载那条边：echarts + zrender（压缩前约 2.4MB）是上一轮从首屏挪走的，
  // 而"挪走了"的另一面是"点开时得能装上"。这里的图表只在 Popover 打开时才挂载，
  // 路由挂载测试覆盖不到它 —— 懒加载的 import 路径写错、chunk 加载失败，都只有点开才看得见。
  {
    currentErrors = []
    const label = '计划菜单图表'
    try {
      await page.goto(`${base}/`, { waitUntil: 'load', timeout: 30_000 })
      await page.waitForTimeout(1200)
      // 触发器是那个进度环（PlanRing 渲染成 button，里面是两段 circle）——
      // 按文字找不稳（环上的"今日 x/y"是数字），按结构找才稳。
      const trigger = page.locator('header button:has(svg circle)').first()
      await trigger.click({ timeout: 10_000 })
      // echarts 默认用 canvas 渲染：canvas 出现 = 懒加载的那份代码装上并画出来了
      const chart = page.locator('canvas').first()
      await chart.waitFor({ state: 'visible', timeout: 15_000 })
      const box = await chart.boundingBox()
      const drawn = !!box && box.width > 0 && box.height > 0
      const ok = drawn && currentErrors.length === 0
      console.log(`  ${ok ? '✓' : '✗'} / 首页头部计划菜单 → echarts 小图真的画出来了（懒加载生效）`)
      if (!ok) {
        console.log(`        canvas=${drawn ? `${Math.round(box.width)}x${Math.round(box.height)}` : '没有尺寸'}`)
        for (const e of currentErrors.slice(0, 3)) console.log(`        未捕获异常: ${e.slice(0, 200)}`)
      }
      results.push({ route: `/ ⇒ ${label}`, ok, length: 0, errors: [...currentErrors], note: ok ? '' : '懒加载的图表没画出来' })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`  ✗ / 首页计划菜单图表 —— 操作失败: ${msg.slice(0, 200)}`)
      const body = await page.locator('body').innerText().catch(() => '')
      console.log(`        实际正文: ${JSON.stringify(body.replace(/\s+/g, ' ').slice(0, 200))}`)
      const headerButtons = await page.locator('header button').count().catch(() => -1)
      console.log(`        header 里的按钮数=${headerButtons}`)
      for (const err of currentErrors.slice(0, 3)) console.log(`        未捕获异常: ${err.slice(0, 200)}`)
      results.push({ route: `/ ⇒ ${label}`, ok: false, length: 0, errors: [...currentErrors, msg], note: '操作失败' })
    }
  }

  // ── 交互式断言：断网答题 → 恢复网络 → 队列排空（drainOutbox 端到端） ──
  // 文档里这一条长期写着"只能人工验"（要 IndexedDB + 离线状态 + 真实的失败响应）。
  // Playwright 三样都能给：context.setOffline 会真的把 navigator.onLine 变成 false 并派发
  // online/offline 事件，IndexedDB 就在这个浏览器上下文里，桩可以按需回 500。
  // 要证明的是三件事：离线时**不发**写请求、作答真的进了队列、恢复网络后**只发一次**
  // 且带的是同一个 client_operation_id（重发而不是新插一行）。
  if (planSubjectsUsable) {
    currentErrors = []
    currentWrites = []
    const label = '离线队列排空'
    try {
      await page.goto(`${base}${SUBMIT_FLOW.url}`, { waitUntil: 'load', timeout: 30_000 })
      await page.getByRole('button', { name: SUBMIT_FLOW.optionName }).first().click({ timeout: 15_000 })
      await page.getByRole('button', { name: '提交' }).first().waitFor({ timeout: 15_000 })

      await context.setOffline(true)
      await page.getByRole('button', { name: '提交' }).first().click({ timeout: 10_000 })
      await page.waitForTimeout(1000)
      const writesWhileOffline = currentWrites.filter((r) => r.url.includes('/rest/v1/user_answers'))
      console.log(`        · 已断网并提交：离线期间的 user_answers 写请求 = ${writesWhileOffline.length}`)

      await context.setOffline(false)
      // online 事件 → installOutboxTriggers 的回调 → sync() → drainOutbox → insertAnswers
      let drain = null
      for (let i = 0; i < 20 && !drain; i++) {
        drain = currentWrites.find((r) => r.url.includes('/rest/v1/user_answers')) ?? null
        if (!drain) await page.waitForTimeout(500)
      }
      const drainCount = currentWrites.filter((r) => r.url.includes('/rest/v1/user_answers')).length
      const keySent = /client_operation_id/.test(drain?.body ?? '')
      const answerSent = /selected_answer/.test(drain?.body ?? '')
      const ok = writesWhileOffline.length === 0 && drainCount === 1 && keySent && answerSent && currentErrors.length === 0
      console.log(`  ${ok ? '✓' : '✗'} ${SUBMIT_FLOW.url} 断网答题 → 恢复网络 → 队列排空（一次写、带幂等键）`)
      if (!ok) {
        console.log(`        离线期间写请求=${writesWhileOffline.length}（期望 0）排空后写请求=${drainCount}（期望 1）带幂等键=${keySent} 带作答=${answerSent}`)
        console.log(`        排空请求体: ${JSON.stringify((drain?.body ?? '').slice(0, 260))}`)
        for (const e of currentErrors.slice(0, 3)) console.log(`        未捕获异常: ${e.slice(0, 200)}`)
      }
      results.push({ route: `${SUBMIT_FLOW.url} ⇒ ${label}`, ok, length: 0, errors: [...currentErrors], note: ok ? '' : '离线队列排空断言未通过' })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`  ✗ ${SUBMIT_FLOW.url} 离线队列排空 —— 操作失败: ${msg.slice(0, 200)}`)
      results.push({ route: `${SUBMIT_FLOW.url} ⇒ ${label}`, ok: false, length: 0, errors: [...currentErrors, msg], note: '操作失败' })
    } finally {
      // 失败也要把网络恢复回来，否则后面每条断言都会"导航失败"
      await context.setOffline(false).catch(() => {})
    }
  }

  // ── 交互式断言：真实错误路径真的会上报（client_events 那条链路的最后一环） ──
  // 文档里这一条也一直写着"没有自动化断言（冒烟里那个通配桩会把函数调用吞掉）"。
  // 现在把收藏列表这一次读打成 500：run 重试两次后抛出 → useFavorites 的 catch → logError，
  // 而生产构建里 logError 会走上报出口（installErrorReporting）→ POST /functions/v1/report-client-event。
  // 断言落在**请求**上（kind=error 且带 context），所以桩把函数吞掉也不影响。
  {
    currentErrors = []
    currentWrites = []
    const label = '错误路径上报'
    try {
      failPaths.add('/rest/v1/favorites')
      const eventReq = page.waitForRequest(
        (r) => r.method() === 'POST' && r.url().includes('/functions/v1/report-client-event') && (r.postData() ?? '').includes('"kind":"error"'),
        { timeout: 15_000 },
      )
      await page.goto(`${base}${SUBMIT_FLOW.url}`, { waitUntil: 'load', timeout: 30_000 })
      const req = await eventReq.catch(() => null)
      const body = req?.postData() ?? ''
      const hasContext = body.includes('useFavorites')
      const ok = !!req && hasContext
      console.log(`  ${ok ? '✓' : '✗'} 真实错误路径 → 生产上报出口真的发出了 error 事件`)
      if (!ok) console.log(`        上报请求体: ${JSON.stringify(body.slice(0, 260))}`)
      results.push({ route: `错误路径上报 ⇒ ${label}`, ok, length: 0, errors: [...currentErrors], note: ok ? '' : '没有等到上报请求' })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`  ✗ 真实错误路径上报 —— 操作失败: ${msg.slice(0, 200)}`)
      results.push({ route: `错误路径上报 ⇒ ${label}`, ok: false, length: 0, errors: [...currentErrors, msg], note: '操作失败' })
    } finally {
      failPaths.delete('/rest/v1/favorites')
    }
  }

  // ── 交互式断言：路线保存必须走那一次 RPC，而不是旧的十几个顺序请求 ──
  // 这是唯一能证明「客户端真的改成新路径」的断言：服务端函数的行为已经在库里验过
  // （新建/交换分区顺序/改样式/删题/删分区/幂等，全部符合预期后回滚），tsc 只证明类型对得上，
  // 而"点一下保存到底发出去了什么请求"只有在浏览器里点一次才知道。
  // 判据用请求记录而不是 DOM：保存成功后页面会跳到 /admin/learning-routes/<id>/edit，
  // 而假后端里这条路线详情是空的（回 406），页面上看不出走了哪条路径。
  {
    currentErrors = []
    currentWrites = []
    const label = '路线保存'
    try {
      await page.goto(`${base}/admin/learning-routes/new`, { waitUntil: 'load', timeout: 30_000 })
      await page.getByPlaceholder(/给学习路线起个名字/).first().fill('冒烟路线', { timeout: 15_000 })
      await page.getByRole('button', { name: '保存路线' }).first().click({ timeout: 15_000 })
      await page.waitForTimeout(1500)
      const viaRpc = currentWrites.some((r) => r.method === 'POST' && r.url.includes('/rest/v1/rpc/save_learning_route'))
      // 旧路径会往这三处发写请求（而且按分区/题目逐个发）
      const legacy = currentWrites.filter((r) => /\/rest\/v1\/(learning_routes|learning_route_stages|learning_route_questions)/.test(r.url))
      const ok = viaRpc && legacy.length === 0 && currentErrors.length === 0
      console.log(`  ${ok ? '✓' : '✗'} /admin/learning-routes/new 保存 → 一次 rpc/save_learning_route`)
      if (!ok) {
        const wrote = currentWrites.map((r) => `${r.method} ${r.url.split('/rest/v1/')[1]?.split('?')[0] ?? r.url.split('/').pop()}`)
        console.log(`        走 RPC=${viaRpc} 旧路径写请求数=${legacy.length}`)
        console.log(`        写请求: ${JSON.stringify(wrote.slice(0, 12))}`)
        for (const e of currentErrors.slice(0, 3)) console.log(`        未捕获异常: ${e.slice(0, 180)}`)
      }
      results.push({ route: `路线保存 ⇒ ${label}`, ok, length: 0, errors: [...currentErrors], note: ok ? '' : '未走 RPC 路径' })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`  ✗ 路线保存 —— 操作失败: ${msg.slice(0, 160)}`)
      try {
        const names = (await page.getByRole('button').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
        console.log(`        URL=${page.url()} 前 10 个按钮: ${JSON.stringify(names.slice(0, 10))}`)
      } catch { /* 页面可能已经崩了 */ }
      results.push({ route: `路线保存 ⇒ ${label}`, ok: false, length: 0, errors: [msg], note: '操作失败' })
    }
  }

  // ── 守住"看起来渲染了、其实没登录上"这一类假通过 ──
  // 这一轮就栽在这里：MFA 桩被通配路由吃掉，OtpGuard 一直在重试，每条路由只等 1.2s
  // 恰好落在重试窗口里 —— 页面渲染得好好的，4.5 秒后却被门禁盖住。所以这里显式断言
  // 登录态下看不到落地页的 CTA、也看不到门禁的重试按钮。
  if (planSubjectsUsable) {
    currentErrors = []
    const label = '登录态确实建立'
    try {
      await page.goto(`${base}/`, { waitUntil: 'load', timeout: 30_000 })
      await page.waitForTimeout(5000) // 比 OtpGuard 的重试窗口(约 4.5s)长
      const body = await page.locator('body').innerText()
      const landingShown = body.includes('免费注册')
      const gateShown = body.includes('重试') && body.includes('退出')
      const ok = !landingShown && !gateShown && currentErrors.length === 0
      console.log(`  ${ok ? '✓' : '✗'} 登录态确实建立（既没被弹回落地页，也没被 MFA 门禁盖住）`)
      if (!ok) console.log(`        落地页CTA=${landingShown} 门禁=${gateShown}`)
      results.push({ route: `session ⇒ ${label}`, ok, length: body.length, errors: [...currentErrors], note: ok ? '' : '会话/门禁状态不对' })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      console.log(`  ✗ 登录态确实建立 —— 失败: ${msg.slice(0, 160)}`)
      results.push({ route: `session ⇒ ${label}`, ok: false, length: 0, errors: [msg], note: '操作失败' })
    }
  }
} finally {
  await browser.close()
  server.close()
}

const crashed = results.filter((r) => !r.ok)
const blank = results.filter((r) => r.ok && r.length < 20)

console.log('')
if (blank.length) {
  console.log(`正文几乎为空的路由（可能没问题：空后端下就是没有内容，但值得看一眼）:`)
  for (const b of blank) console.log(`  · ${b.route}`)
}
if (crashed.length) {
  console.error(`\n有 ${crashed.length}/${results.length} 条路由抛了未捕获异常：`)
  for (const c of crashed) console.error(`  · ${c.route}`)
  process.exit(1)
}
console.log(`全部 ${results.length} 条路由都能挂载，无未捕获异常。`)
console.log('注意：后端是假的，这里只证明"渲染期不炸"，不证明业务正确。')
