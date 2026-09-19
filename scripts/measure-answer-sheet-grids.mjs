/**
 * 量统考答题卡上「涂卡格」阵列的坐标（给点击填涂用）。
 *
 * 背景：数学 / 英语一 / 政治这三张原件是字体转曲的矢量 PDF，没有文字层也没有字段结构，
 * 只能从 200dpi 底图里把印刷的涂卡格反推出来。做法是：
 *   1. 取粉色掩膜（印刷是品红）；
 *   2. 找长度 2.3~5.4mm 的横向粉色游程 = 格子的上/下边；
 *   3. 把「上边」和它正下方的「下边」配对成格（框内不能再有同宽横线，否则是跨两行的假框）；
 *   4. 按 y 聚成行，输出每行的格中心、格尺寸和间距分布。
 *
 * 用法（项目根目录，需要有 Playwright）：
 *   B4_SRCS='["/public/answer-sheet/math-1.webp"]' node scripts/measure-answer-sheet-grids.mjs
 * 可选 B4_MINH / B4_MAXH 调格子高度范围（mm，默认 1.9~2.6）。
 * 结果同时落一份 JSON 到 tmp-b4/scan/<name>.json，里面有每行完整的 xs 数组。
 *
 * 注意：准考证号格那种「隔列有底色」的阵列，只能量到其中的白底列（间距是真实列距的 2 倍），
 * 真实列距要除以 2，列数按 15 补全——数学那张已经用叠加图逐格核对过。
 */
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve('.')
const MIME = {
  '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.json': 'application/json', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
  '.css': 'text/css', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp',
}
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  const file = join(root, url)
  if (url === '/__blank') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!doctype html><html><body></body></html>')
    return
  }
  if (!existsSync(file) || !file.startsWith(root)) { res.writeHead(404); res.end('nope'); return }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(await readFile(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

await mkdir('tmp-b4/scan', { recursive: true })
const srcs = JSON.parse(process.env.B4_SRCS ?? '["/public/answer-sheet/math-1.webp"]')
const minHmm = Number(process.env.B4_MINH ?? 1.9)
const maxHmm = Number(process.env.B4_MAXH ?? 2.6)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 600, height: 400 } })
await page.goto(`http://127.0.0.1:${port}/__blank`, { waitUntil: 'load' })

for (const src of srcs) {
  const out = await page.evaluate(async ({ src, minHmm, maxHmm }) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
    const ppm = img.width / 420
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const W = c.width, H = c.height
    const isPink = (x, y) => {
      const i = (y * W + x) * 4
      const r = d[i], g = d[i + 1], b = d[i + 2]
      return r > 140 && r - g > 45 && b > 60 && g < 205
    }

    const MINLEN = Math.round(2.3 * ppm), MAXLEN = Math.round(5.4 * ppm)
    const runsByRow = []
    for (let y = 0; y < H; y++) {
      const row = []
      let x = 0
      while (x < W) {
        if (!isPink(x, y)) { x++; continue }
        const s = x
        while (x < W && isPink(x, y)) x++
        if (x - s >= MINLEN && x - s <= MAXLEN) row.push({ s, e: x - 1 })
      }
      runsByRow.push(row)
    }
    const sameRun = (y, r) => y >= 0 && y < H && runsByRow[y].some((q) => Math.abs(q.s - r.s) <= 2 && Math.abs(q.e - r.e) <= 2)
    const MINH = Math.round(minHmm * ppm), MAXH = Math.round(maxHmm * ppm)
    const boxes = []
    for (let y = 0; y < H; y++) {
      for (const r of runsByRow[y]) {
        if (sameRun(y - 3, r)) continue
        for (let dy = MINH; dy <= MAXH; dy++) {
          const y2 = y + dy
          if (y2 >= H) break
          const hit = runsByRow[y2].find((q) => Math.abs(q.s - r.s) <= 2 && Math.abs(q.e - r.e) <= 2)
          if (!hit || sameRun(y2 + 3, hit)) continue
          let hollow = true
          for (let yy = y + 3; yy <= y2 - 3; yy++) if (sameRun(yy, r)) { hollow = false; break }
          if (!hollow) continue
          boxes.push({
            cx: +(((r.s + r.e) / 2) / ppm).toFixed(2),
            cy: +((y + dy / 2) / ppm).toFixed(2),
            w: +(((r.e - r.s + 1) / ppm)).toFixed(2),
            h: +(dy / ppm).toFixed(2),
          })
          break
        }
      }
    }

    const rowList = []
    for (const b of [...boxes].sort((a, b) => a.cy - b.cy)) {
      const prev = rowList[rowList.length - 1]
      if (prev && b.cy - prev.cy < 0.7) prev.items.push(b)
      else rowList.push({ cy: b.cy, items: [b] })
    }
    const rows = rowList.map((r) => {
      const items = [...r.items].sort((a, b) => a.cx - b.cx)
      const gaps = items.slice(1).map((b, i) => +(b.cx - items[i].cx).toFixed(2))
      const tally = {}
      for (const g of gaps) tally[g] = (tally[g] ?? 0) + 1
      return {
        cy: +(items.reduce((s, b) => s + b.cy, 0) / items.length).toFixed(2),
        n: items.length,
        x0: items[0].cx,
        x1: items[items.length - 1].cx,
        w: items[0].w,
        h: items[0].h,
        gaps: Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => `${g}x${n}`),
        xs: items.map((b) => b.cx),
      }
    })
    return { ppm: +ppm.toFixed(3), boxCount: boxes.length, rows }
  }, { src, minHmm, maxHmm })

  console.log(`\n=== ${src}  boxes=${out.boxCount} ===`)
  for (const r of out.rows) {
    if (r.n < 4) continue
    console.log(`  y=${String(r.cy).padStart(7)} n=${String(r.n).padStart(3)} x ${String(r.x0).padStart(6)}..${String(r.x1).padStart(6)} box=${r.w}x${r.h}  gaps ${r.gaps.join(' ')}`)
  }
  await writeFile(`tmp-b4/scan/${src.split('/').pop().replace('.webp', '')}.json`, JSON.stringify(out, null, 1))
}
await browser.close()
server.close()
