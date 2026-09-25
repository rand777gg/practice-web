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

/** verify-totp 的 status 响应：不要求二次验证、已引导完毕，好让 OtpGuard 放行；role 给 admin 才进得了 /admin */
const MFA_STATUS = {
  needsMfa: false,
  sessionVerified: true,
  deviceTrusted: true,
  deviceExpiresAt: null,
  graceUntil: null,
  validityDays: 7,
  onboarded: true,
  role: 'admin',
  availableMethods: { passkey: false, totp: false, recovery: false },
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
  deadline: null,
  plan_subjects: null,
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

  await context.route('**/auth/v1/**', (route) => {
    const url = route.request().url()
    if (url.includes('/user')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: USER_ID, email: 'smoke@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() }) })
    }
    if (url.includes('/logout')) return route.fulfill({ status: 204, body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await context.route('**/functions/v1/verify-totp', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MFA_STATUS) }))

  await context.route('**/functions/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))

  // 表查询：profiles 给一份真资料（否则 /admin/* 会被弹回仪表盘，"能挂载"就是假的）；
  // 其余表回空数组，RPC 回 null，配合各服务的默认值走空态 / not_found 分支
  await context.route('**/rest/v1/rpc/**', (route) => json(route, null))
  await context.route('**/rest/v1/**', (route) => {
    const req = route.request()
    const url = req.url()
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (url.includes('/profiles')) return json(route, wantsObject ? PROFILE : [PROFILE])
    if (wantsObject) {
      // 与 PostgREST 对齐：向 .single() 要一行却没有行时是 406 + PGRST116
      return json(route, { code: 'PGRST116', details: 'Results contain 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406)
    }
    return json(route, [])
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
