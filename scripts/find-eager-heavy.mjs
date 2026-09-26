/**
 * 找出"谁把 echarts 拖进入口 chunk 的"。
 *
 * 判据全部来自 `nodeMetas[uid].moduleParts`（权威的 chunk 归属），不用 visualizer 的 tree ——
 * tree 跟着导入图走，会把懒加载 chunk 的模块也算进来（上一轮就栽在这里）。
 *
 * 做法：
 *   1. 求出"被 emit 进入口 chunk 的模块"集合；
 *   2. 在这个集合里找**直接 import** echarts/zrender 的模块；
 *   3. 再顺着 importedBy 往上走到 src/ 的模块，得到"入口里的哪个业务文件拉的"。
 */
import { readFileSync } from 'node:fs'

const html = readFileSync('stats.html', 'utf8')
const at = html.indexOf('const data')
const objStart = html.indexOf('{', at)
let depth = 0, end = -1
for (let i = objStart; i < html.length; i++) {
  const c = html[i]
  if (c === '{') depth++
  else if (c === '}') { depth--; if (depth === 0) { end = i; break } }
}
const { nodeParts, nodeMetas } = JSON.parse(html.slice(objStart, end + 1))
const idOf = (uid) => (nodeMetas[uid]?.id ?? '').replace(/\\/g, '/')
const sizeOf = (uid) => {
  const parts = nodeMetas[uid]?.moduleParts
  if (!parts) return 0
  return Object.values(parts).reduce((a, p) => a + (nodeParts[p]?.renderedLength ?? 0), 0)
}

const target = process.argv[2] ?? 'assets/index-'
const chunkOf = (uid) => Object.keys(nodeMetas[uid]?.moduleParts ?? {})
const inChunk = new Set(Object.keys(nodeMetas).filter((uid) => chunkOf(uid).some((c) => c.includes(target))))

const HEAVY = /node_modules\/(echarts|zrender|echarts-for-react|framer-motion|motion-dom|react-day-picker)\//
const heavyInEntry = [...inChunk].filter((uid) => HEAVY.test(idOf(uid)))
const heavyKb = heavyInEntry.reduce((a, uid) => a + sizeOf(uid), 0)
console.log(`入口 chunk（含 "${target}"）模块数: ${inChunk.size}`)
console.log(`其中 echarts/zrender/framer-motion/react-day-picker 合计 ${(heavyKb / 1024).toFixed(0)} KB（压缩前）\n`)

/** 入口里直接 import 重库的模块 → 再往上找 src/ 引用者 */
const direct = new Map()
for (const uid of inChunk) {
  const imports = (nodeMetas[uid]?.imported ?? []).map((r) => r.uid)
  for (const iu of imports) {
    if (HEAVY.test(idOf(iu))) {
      if (!direct.has(uid)) direct.set(uid, new Set())
      direct.get(uid).add(idOf(iu))
    }
  }
}
console.log(`入口里**直接** import 重库的模块（${direct.size} 个）:`)
for (const [uid, set] of [...direct].sort((a, b) => sizeOf(b[0]) - sizeOf(a[0]))) {
  const id = idOf(uid)
  const short = id.includes('/src/') ? id.split('/src/')[1] : id
  console.log(`  ${(sizeOf(uid) / 1024).toFixed(1).padStart(8)} KB  ${short}   ← ${[...set].map((s) => s.split('node_modules/')[1] ?? s).slice(0, 3).join(', ')}`)
}

/** 从这些模块沿 importedBy 向上，找出入口里最靠近业务的那一层（src/ 文件） */
const roots = new Set()
const seen = new Set()
const up = (uid, hops) => {
  if (hops > 6 || seen.has(uid)) return
  seen.add(uid)
  const meta = nodeMetas[uid]
  for (const ref of meta?.importedBy ?? []) {
    const rid = idOf(ref.uid)
    if (!inChunk.has(ref.uid)) continue
    if (rid.includes('/src/')) roots.add(`src/${rid.split('/src/')[1]}`)
    else up(ref.uid, hops + 1)
  }
}
for (const uid of direct.keys()) up(uid, 0)
console.log(`\n入口里拉进重库的业务文件（沿 importedBy 向上，最多 6 跳）:`)
for (const r of [...roots].sort()) console.log('  · ' + r)
