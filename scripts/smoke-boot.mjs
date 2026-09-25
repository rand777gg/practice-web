/**
 * 启动冒烟测试：把构建产物跑起来，用真浏览器打开，确认"应用能起来"这件事本身。
 *
 * 为什么需要它：这一轮改了 100 多个文件、还动了状态归属，但一直只能验证"类型过、能构建、
 * 体积没涨" —— 那三件事都证明不了模块初始化不抛异常。settings 迁移、用户级 Store 的 reset
 * 注册表、认证状态机这些都是在 import 或首屏 effect 里跑的代码，写错了浏览器里就是白屏，
 * 而 tsc 完全看不出来。
 *
 * 它测的不是功能（登录后的流程要账号，这里没有），只测第一屏：
 *   · 模块加载/首屏渲染不抛异常（pageerror 必须为空）；
 *   · 控制台没有 error 级日志；
 *   · 未登录时落到落地页，而不是白屏或错误边界。
 *
 * 用法：npm run smoke（需要先 npm run build，或直接让它自己构建）
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, dirname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('冒烟测试失败: 找不到 dist/index.html，请先执行 npm run build')
  process.exit(1)
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

/** 静态服务 + SPA 兜底（未知路径回 index.html，和线上 CDN 行为一致） */
function serveDist() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
      // 防目录穿越：normalize 之后必须仍在 dist 内
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

const failures = []
const consoleErrors = []
const pageErrors = []
const failedRequests = []

const server = await serveDist()
const { port } = server.address()
const base = `http://127.0.0.1:${port}`

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('requestfailed', (req) => {
    // Service Worker / 字体等外部资源失败不算应用的错，只记同源的
    if (req.url().startsWith(base)) failedRequests.push(`${req.url()} — ${req.failure()?.errorText ?? '?'}`)
  })

  console.log(`启动冒烟测试: ${base}`)

  await page.goto(`${base}/`, { waitUntil: 'load', timeout: 30_000 })
  // React 挂载 + AuthInitializer 走完 getSession 之后才决定渲染落地页；等品牌名出现
  await page.getByText('刷题网', { exact: false }).first().waitFor({ timeout: 20_000 })
  console.log('  ✓ 首屏渲染出落地页（未登录路径）')

  const bodyText = await page.locator('body').innerText()
  if (bodyText.trim().length < 40) failures.push('落地页正文几乎是空的，可能是渲染失败')
  else console.log(`  ✓ 落地页有实际内容（${bodyText.trim().length} 字符）`)

  // 走一个静态引入的公开路由，再走一个是懒加载的受保护路由（未登录应被弹回首页）
  await page.goto(`${base}/terms`, { waitUntil: 'load', timeout: 30_000 })
  await page.waitForTimeout(800)
  if (pageErrors.length === 0) console.log('  ✓ 公开路由 /terms 无异常')

  await page.goto(`${base}/practice`, { waitUntil: 'load', timeout: 30_000 })
  await page.waitForTimeout(1500)
  const afterProtected = await page.locator('body').innerText()
  if (afterProtected.trim().length < 40) failures.push('未登录访问 /practice 后页面为空（应当弹回落地页）')
  else console.log('  ✓ 未登录访问受保护路由后仍有内容（弹回首页或登录引导）')

  if (pageErrors.length > 0) failures.push(`有未捕获异常 ${pageErrors.length} 条`)
  if (failedRequests.length > 0) failures.push(`有 ${failedRequests.length} 个同源请求失败`)
  // 控制台 error 里，Supabase 未配置/网络类的噪声单独列出来，不当成"应用崩了"
  const realConsoleErrors = consoleErrors.filter((t) => !/Failed to load resource|net::ERR/i.test(t))
  if (realConsoleErrors.length > 0) failures.push(`控制台有 ${realConsoleErrors.length} 条 error 日志`)
} catch (e) {
  failures.push(`导航或等待失败: ${e instanceof Error ? e.message : String(e)}`)
} finally {
  await browser.close()
  server.close()
}

if (pageErrors.length) {
  console.log('\n未捕获异常:')
  for (const e of pageErrors.slice(0, 10)) console.log(`  · ${e}`)
}
if (consoleErrors.length) {
  console.log('\n控制台 error:')
  for (const e of consoleErrors.slice(0, 10)) console.log(`  · ${e.slice(0, 200)}`)
}
if (failedRequests.length) {
  console.log('\n同源请求失败:')
  for (const e of failedRequests.slice(0, 10)) console.log(`  · ${e.slice(0, 200)}`)
}

if (failures.length > 0) {
  console.error('\n冒烟测试未通过:')
  for (const f of failures) console.error(`  · ${f}`)
  process.exit(1)
}
console.log('\n冒烟测试通过：应用能起来，首屏无异常。')
console.log('注意：这里没有登录，登录后的答题/考试流程仍未验证。')
