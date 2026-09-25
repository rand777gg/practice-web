// 网络路径探针 —— 只上报，不改任何行为。
//
// 背景：实测中国大陆直连香港源站 170ms，而经 Cloudflare 1416ms（8.3 倍）；
// 自测还发现 CF 给这条域名的边缘机房是漂的（一次 AMS、一次 SJC），
// 香港的请求会被甩到美西再回香港。2026-09-25 已把生产入口
// supabase.pguide.dev 从 CF 代理切成直连香港源站（只改 DNS，hostname 不变）。
//
// 这个探针现在的职责变了：不再是为了「决定是否切直连」，而是
//   · 持续记录生产入口(= 直连路径)在真实用户网络下的往返耗时，好发现某运营商直连变差
//   · 若配了对照组 host，则同时记录一条仍走 CF 的路径，用于跨运营商横向对比
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

// 直连路径 = 当前生产入口
const DIRECT_HOST = 'https://api.pguide.dev'

// 对照组（可选）：一个仍经 Cloudflare 的同源入口。
//
// ⚠️ 不要默认填 supabase.pguide.dev。它切直连后已不再是 CF：CF 的
// /cdn-cgi/trace 会 404 且不带 CORS 头，浏览器每次会话会多 2 条控制台错误
// （探针的 try/catch 拦得住异常，拦不住浏览器自己打的 CORS 报错）。
// 另外 nginx 侧给 /cdn-cgi/trace 加了个带 CORS 的空 204 垫片兜住还在跑旧构建的用户。
//
// 留空 = 不做对照，只测生产路径（当前默认）。
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

    const direct = await timeOnce(`${DIRECT_HOST}${PROBE_PATH}`)

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
