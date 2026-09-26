/**
 * 首屏预算检查。
 *
 * 为什么要有这个脚本：vite 的构建产物报告只告诉你"某个 chunk 有多大"，但首屏真正的成本是
 * 「index.html 会立刻拉哪些文件」—— 一个包再大，只要没进首屏就无所谓；反过来，一个静态
 * import 就能把 1.3MB 的 pdf worker 悄悄挂到首屏上，而构建日志里它只是个普通 chunk。
 * 所以这里按 index.html 实际声明的入口和 modulepreload 列表统计，超出预算就让构建失败。
 *
 * 预算值在下面的 BUDGET 里，改动需要理由。
 */
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const indexPath = join(distDir, 'index.html')

/**
 * 首屏预算：JS gzip 总量、CSS gzip 总量、请求数。
 *
 * 基线（P0 改造前，同样是生产构建）：JS 1187.8KB gzip / CSS 114.6KB gzip / 46 个请求。
 * P0 之后：JS 958.1KB gzip（-19.3%）。
 * 摘掉 @radix-ui/themes 之后：CSS 114.6 → 35.5KB gzip（-69%，raw 918 → 250KB），
 * 请求数 44 → 42 —— 整份 Radix Themes 设计系统只是为了 5 个文件里的 ScrollArea×4 与 Badge×1，
 * 而它是以 `import '@radix-ui/themes/styles.css'` 进**入口** CSS 的，所以每个访客都要下。
 * 详见 docs/architecture-optimization.md 的「首屏 CSS 收敛」一节。
 *
 * 现在这三个数就是棘轮：它们不是"理想值"，而是"不许比现在更差"。
 * CSS 那档特意留了一点余量（35.5 → 40），只为新组件留出空间；要涨上去得先说明理由。
 */
const BUDGET = {
  jsGzipKb: 1000,
  cssGzipKb: 40,
  requests: 50,
}

if (!existsSync(indexPath)) {
  console.error('首屏预算检查失败: 找不到 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

const html = readFileSync(indexPath, 'utf8')

/** index.html 里 <script type="module" src> 与 <link rel="modulepreload" href> 都是首屏必须下载的 */
function collectRefs() {
  const refs = new Set()
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) refs.add(m[1])
  for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) refs.add(m[1])
  return [...refs]
}

function collectStyles() {
  const refs = new Set()
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) refs.add(m[1])
  return [...refs]
}

function measure(refs) {
  let raw = 0
  let gzip = 0
  const missing = []
  const rows = []
  for (const ref of refs) {
    const file = join(distDir, ref.replace(/^\//, ''))
    if (!existsSync(file)) {
      missing.push(ref)
      continue
    }
    const buf = readFileSync(file)
    const gz = gzipSync(buf, { level: 9 }).length
    raw += buf.length
    gzip += gz
    rows.push({ ref, rawKb: buf.length / 1024, gzipKb: gz / 1024 })
  }
  rows.sort((a, b) => b.gzipKb - a.gzipKb)
  return { raw, gzip, rows, missing }
}

const js = measure(collectRefs())
const css = measure(collectStyles())
const requests = js.rows.length + css.rows.length
const kb = (n) => (n / 1024).toFixed(1)

const failures = []
if (kb(js.gzip) > BUDGET.jsGzipKb) failures.push(`JS gzip ${kb(js.gzip)}KB > 预算 ${BUDGET.jsGzipKb}KB`)
if (kb(css.gzip) > BUDGET.cssGzipKb) failures.push(`CSS gzip ${kb(css.gzip)}KB > 预算 ${BUDGET.cssGzipKb}KB`)
if (requests > BUDGET.requests) failures.push(`首屏请求数 ${requests} > 预算 ${BUDGET.requests}`)
if (js.missing.length > 0) failures.push(`index.html 引用了不存在的文件: ${js.missing.join(', ')}`)

console.log('首屏预算报告')
console.log(`  JS       ${kb(js.gzip)}KB gzip (${kb(js.raw)}KB raw) / 预算 ${BUDGET.jsGzipKb}KB`)
console.log(`  CSS      ${kb(css.gzip)}KB gzip (${kb(css.raw)}KB raw) / 预算 ${BUDGET.cssGzipKb}KB`)
console.log(`  请求数   ${requests} / 预算 ${BUDGET.requests}`)
console.log('  最大的 10 个文件（按 gzip 排）:')
for (const row of js.rows.slice(0, 10)) {
  console.log(`    ${row.gzipKb.toFixed(1).padStart(7)}KB  ${row.ref}`)
}

if (failures.length > 0) {
  console.error('\n首屏预算超支:')
  for (const f of failures) console.error(`  · ${f}`)
  console.error('\n首屏变大通常是某个静态 import 把重依赖拖进了入口；优先改成按路由或按用户动作动态加载。')
  process.exit(1)
}

console.log('\n首屏预算通过。')
