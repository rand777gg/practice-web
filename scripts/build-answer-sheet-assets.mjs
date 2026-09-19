/**
 * 一次性资源生成器：把桌面上的三张统考答题卡（数学 / 英语一 / 政治）的每一面
 * 光栅化成 200dpi WebP，放到 public/answer-sheet/ 下。
 *
 * 这三份原件是「字体转曲」的矢量 PDF（没有文字层，也没嵌位图），页面本身是 A3 横向
 * 420×294mm，所以只要按固定 DPI 出图就能拿到清晰可打印的底图；网页端按 1:1 mm 显示即可。
 *
 * 用法（需要在项目根目录跑，且本机有 Playwright 浏览器）：
 *   node scripts/build-answer-sheet-assets.mjs ["<放 PDF 的目录>"]
 * 默认从桌面读：
 *   数学答题卡.pdf / 英语答题卡（英语一）.pdf / 政治答题卡.pdf
 */
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright'

const DPI = 200
const QUALITY = 0.85
const MIME = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.json': 'application/json', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
  '.css': 'text/css', '.ttf': 'font/ttf',
}

const SOURCES = [
  { slug: 'math', file: '数学答题卡.pdf' },
  { slug: 'english', file: '英语答题卡（英语一）.pdf' },
  { slug: 'politics', file: '政治答题卡.pdf' },
]

const sourceDir = process.argv[2] ?? join(homedir(), 'Desktop')
const root = resolve('.')
const outDir = join(root, 'public', 'answer-sheet')

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (url === '/__blank') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!doctype html><html><body></body></html>')
    return
  }
  const file = join(root, url)
  if (!existsSync(file) || !file.startsWith(root)) { res.writeHead(404); res.end('nope'); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(await readFile(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 400, height: 300 } })
await page.goto(`http://127.0.0.1:${port}/__blank`, { waitUntil: 'load' })
await page.evaluate(async (src) => {
  const pdfjs = await import(src)
  pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'
  window.__pdfjs = pdfjs
}, '/node_modules/pdfjs-dist/build/pdf.mjs')

for (const { slug, file } of SOURCES) {
  const src = join(sourceDir, file)
  if (!existsSync(src)) {
    console.log(`跳过 ${file}：${src} 不存在`)
    continue
  }
  const bytes = await readFile(src)
  const numPages = await page.evaluate(async (b64) => {
    const bin = atob(b64)
    const data = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
    window.__doc = await window.__pdfjs.getDocument({ data }).promise
    return window.__doc.numPages
  }, bytes.toString('base64'))

  for (let n = 1; n <= numPages; n++) {
    const dataUrl = await page.evaluate(async ({ n, scale, quality }) => {
      const p = await window.__doc.getPage(n)
      const vp = p.getViewport({ scale })
      const c = document.createElement('canvas')
      c.width = Math.round(vp.width); c.height = Math.round(vp.height)
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      await p.render({ canvasContext: ctx, viewport: vp }).promise
      return c.toDataURL('image/webp', quality)
    }, { n, scale: DPI / 72, quality: QUALITY })
    const out = join(outDir, `${slug}-${n}.webp`)
    await writeFile(out, Buffer.from(dataUrl.split(',')[1], 'base64'))
    const size = (await readFile(out)).length
    console.log(`${file} 第 ${n} 面 -> public/answer-sheet/${slug}-${n}.webp  ${(size / 1024).toFixed(0)}KB`)
  }
}
void 0
await browser.close()
server.close()
