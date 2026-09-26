/**
 * 用 stats.html 做**按 chunk 的模块归属**分析。
 *
 * 上一轮的教训：visualizer 的 `tree` 是跟着**导入图**走的，一个模块会出现在每个引用它的
 * 分支下面，所以"把入口子树加起来"会远远超过入口文件的体积（我那次得到 4535KB，而入口只有
 * 2149KB），而且会把**懒加载 chunk**（例如 chunk-OB3PAWPO.mjs，实测不在 index.html 里）
 * 也算进来。差点据此去优化一个不影响首屏的东西。
 *
 * `nodeMetas[uid].moduleParts` 才是权威的归属信息：它形如
 *   { "assets/index-xxx.js": "<partUid>", ... }
 * 也就是"这个模块被 emit 进了哪些 chunk"。`nodeParts[partUid].renderedLength` 是**压缩前**的
 * 长度，所以按 chunk 求和会比产物文件大若干倍 —— 这是正常的，比例本身可以当自检。
 *
 * 用法：node scripts/analyze-bundle.mjs [chunk关键字]
 */
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const STATS = 'stats.html'
if (!existsSync(STATS)) {
  console.error('找不到 stats.html —— 先 npm run build（vite.config.ts 里的 visualizer 会产出它）')
  process.exit(1)
}

const html = readFileSync(STATS, 'utf8')
const at = html.indexOf('const data')
if (at < 0) { console.error('stats.html 里找不到 `const data`，模板可能变了'); process.exit(1) }
const objStart = html.indexOf('{', at)
let depth = 0, end = -1
for (let i = objStart; i < html.length; i++) {
  const c = html[i]
  if (c === '{') depth++
  else if (c === '}') { depth--; if (depth === 0) { end = i; break } }
}
const { nodeParts, nodeMetas } = JSON.parse(html.slice(objStart, end + 1))

/** chunk 名 → 模块列表 */
const byChunk = new Map()
for (const [uid, meta] of Object.entries(nodeMetas)) {
  if (!meta.moduleParts) continue
  for (const chunkName of Object.keys(meta.moduleParts)) {
    if (!byChunk.has(chunkName)) byChunk.set(chunkName, [])
    byChunk.get(chunkName).push({ uid, id: (meta.id ?? '').replace(/\\/g, '/'), size: nodeParts[meta.moduleParts[chunkName]]?.renderedLength ?? 0 })
  }
}

/** 从 index.html 读出真正的首屏引用（这是唯一可信的"在不在首屏"判据） */
const indexHtml = existsSync('dist/index.html') ? readFileSync('dist/index.html', 'utf8') : ''
const critical = new Set()
for (const m of indexHtml.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)) critical.add(m[1])

const filter = process.argv[2]
console.log(`共 ${byChunk.size} 个 chunk；index.html 引用了 ${critical.size} 个文件\n`)

const rows = [...byChunk].map(([name, mods]) => {
  const rendered = mods.reduce((a, m) => a + m.size, 0)
  const file = existsSync(`dist/${name}`) ? readFileSync(`dist/${name}`) : null
  return { name, mods, rendered, raw: file?.length ?? 0, gzip: file ? gzipSync(file, { level: 9 }).length : 0, critical: critical.has(name) }
})

for (const r of rows.filter((x) => x.critical).sort((a, b) => b.gzip - a.gzip)) {
  const ratio = r.raw ? (r.rendered / r.raw).toFixed(2) : '?'
  console.log(`■ ${r.name}  ${(r.gzip / 1024).toFixed(1)}KB gzip / ${(r.raw / 1024).toFixed(0)}KB raw（压缩前合计 ${(r.rendered / 1024).toFixed(0)}KB，比 ${ratio}）`)
  if (!filter || r.name.includes(filter)) {
    const pkg = new Map()
    for (const m of r.mods) {
      const mm = m.id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)
      const key = mm ? mm[1] : (m.id.includes('/src/') ? `src/${m.id.split('/src/')[1].split('/')[0]}` : m.id.slice(0, 44) || '(?)')
      pkg.set(key, (pkg.get(key) ?? 0) + m.size)
    }
    for (const [k, v] of [...pkg].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`     ${(v / 1024).toFixed(1).padStart(8)} KB  ${k}`)
    }
  }
}

const totalGzip = rows.filter((x) => x.critical).reduce((a, b) => a + b.gzip, 0)
console.log(`\n首屏 JS 合计 ${(totalGzip / 1024).toFixed(1)}KB gzip（应接近 npm run budget 报的 JS 数）`)
