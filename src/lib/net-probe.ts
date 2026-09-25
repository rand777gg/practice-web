// 网络路径探针 —— 只上报，不改任何行为。
//
// 历史：2026-09-25 曾把生产入口 supabase.pguide.dev 从 Cloudflare 代理切成直连香港源站
// （实测同机对比：直连 87ms vs 经 CF 1328ms，CF 给这条域名分到的边缘机房是漂的，
// 先后见过 AMS / SJC / PDX）。但真实用户端体感没有差别，同日晚些时候已回滚：
// supabase.pguide.dev 恢复 CF 代理，直连入口 api.pguide.dev 的 DNS 记录已删除。
//
// 所以现在这个探针测的是「生产入口」本身，用于长期记录真实用户网络下的往返耗时。
// 若将来还想做两条路径的横向对比，再配 VITE_NET_PROBE_CONTROL_HOST 即可，无需改代码。
//
// 三条硬性约束没变：
//   1. 绝不阻塞、绝不抛错：任何失败都静默吞掉，探针挂掉不能影响刷题
//   2. 绝不改变应用行为：请求的是无副作用的探活端点，不用它替换任何现有调用
//   3. 不做精确 IP 定位：只记 CF 边缘机房和粗粒度信息

import { supabase } from './supabase'

// 探针端点选 /storage/v1/version 而不是 /auth/v1/health：
// 前者不带 apikey 就返回 200（且带 CORS 头），所以 ok 字段有真实含义；
// /auth/v1/health 不带 apikey 会被网关挡成 401，ok 恒为 false，数据读起来容易误解。
// 两者服务端开销都是毫秒级，相对网络差异可以忽略。
const PROBE_PATH = '/storage/v1/version'

// 生产入口：跟随 VITE_SUPABASE_URL，这样入口换到哪就测哪，不用改代码。
const PROD_HOST = import.meta.env.VITE_SUPABASE_URL as string

// 对照组（可选）：想同时测另一条入口时才配（例如临时开一个直连域名做 A/B）。
//
// ⚠️ 两个坑：
//   · 别指向一个不存在的域名 —— 浏览器会报 ERR_NAME_NOT_RESOLVED（try/catch 拦不住）；
//     之前的 api.pguide.dev 已删除，别再写回去。
//   · 别指向非 Cloudflare 的入口 —— readColo() 读的是 CF 专有的 /cdn-cgi/trace，
//     源站没这个端点，会 404 且不带 CORS 头，浏览器每次会话多 2 条控制台错误。
const CONTROL_HOST = import.meta.env.VITE_NET_PROBE_CONTROL_HOST as string | undefined

// 每个浏览器最多每 6 小时报一次，避免刷量
const THROTTLE_KEY = 'net-probe:last'
const THROTTLE_MS = 6 * 60 * 60 * 1000

async function timeOnce(url: string): Promise<{ ms: number | null; ok: boolean }> {
  const t0 = performance.now()
  try {
    const res = await fetch(url, { cache: 'no-store', mode: 'cors' })
    // 必须读掉 body，否则 timeOnce 只量到响应头
    await res.arrayBuffer()
    return { ms: performance.now() - t0, ok: res.ok }
  } catch {
    return { ms: null, ok: false }
  }
}

async function readColo(host: string): Promise<string | null> {
  try {
    const res = await fetch(`${host}/cdn-cgi/trace`, { cache: 'no-store', mode: 'cors' })
    const text = await res.text()
    const m = text.match(/^colo=(\S+)/m)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function connInfo() {
  const c = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean } }).connection
  return {
    conn_type: c?.effectiveType ?? null,
    downlink_mbps: typeof c?.downlink === 'number' ? c.downlink : null,
    client_rtt_ms: typeof c?.rtt === 'number' ? c.rtt : null,
    save_data: typeof c?.saveData === 'boolean' ? c.saveData : null,
  }
}

export async function runNetProbe(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.onLine) return
    const last = Number(localStorage.getItem(THROTTLE_KEY) ?? 0)
    if (Number.isFinite(last) && Date.now() - last < THROTTLE_MS) return
    localStorage.setItem(THROTTLE_KEY, String(Date.now()))

    const direct = await timeOnce(`${PROD_HOST}${PROBE_PATH}`)

    // 顺序测，不并行：并行时两条 TLS 握手会在窄带上互相抢带宽，
    // 3G 上实测把两条路径的差值抹平成了同一个数（420.6 vs 419.8ms），等于白测。
    let cdn: { ms: number | null; ok: boolean } = { ms: null, ok: false }
    let colo: string | null = null
    if (CONTROL_HOST) {
      cdn = await timeOnce(`${CONTROL_HOST}${PROBE_PATH}`)
      colo = await readColo(CONTROL_HOST)
    }

    if (direct.ms === null && cdn.ms === null) return

    await supabase.functions.invoke('net-probe', {
      body: {
        direct_ms: direct.ms,
        cdn_ms: cdn.ms,
        direct_ok: direct.ok,
        cdn_ok: cdn.ok,
        colo,
        ...connInfo(),
        region: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        ua: navigator.userAgent,
      },
    })
  } catch {
    // 探针永远不该影响应用
  }
}
