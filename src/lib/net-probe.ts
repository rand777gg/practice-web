// 网络路径对照探针 —— 只上报，不改任何行为。
//
// 背景：实测中国大陆直连香港源站 170ms，而经 Cloudflare 免费版 1416ms（8.3 倍），
// 但那只是一条电信线路的样本。这里从真实用户浏览器里收集两条路径的对比，
// 决定是否把 API 整体切到直连。
//
// 三条硬性约束：
//   1. 绝不阻塞、绝不抛错：任何失败都静默吞掉，探针挂掉不能影响刷题
//   2. 绝不改变应用行为：请求的是 /auth/v1/health（无副作用的探活端点），
//      不用它替换任何现有调用
//   3. 不做精确 IP 定位：只记 CF 边缘机房和粗粒度信息

import { supabase } from './supabase'

// 探针端点选 /storage/v1/version 而不是 /auth/v1/health：
// 前者不带 apikey 就返回 200（且带 CORS 头），所以 ok 字段有真实含义；
// /auth/v1/health 不带 apikey 会被网关挡成 401，ok 恒为 false，数据读起来容易误解。
// 两者服务端开销都是毫秒级，相对 170ms / 1400ms 的网络差异可以忽略。
const PROBE_PATH = '/storage/v1/version'

const DIRECT_HOST = 'https://api.pguide.dev'
const CDN_HOST = 'https://supabase.pguide.dev'

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

async function readColo(): Promise<string | null> {
  try {
    const res = await fetch(`${CDN_HOST}/cdn-cgi/trace`, { cache: 'no-store', mode: 'cors' })
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

    // 并行发两条，避免先后顺序带来的连接复用/预热偏差；载荷都很小，带宽不构成干扰
    const [direct, cdn, colo] = await Promise.all([
      timeOnce(`${DIRECT_HOST}${PROBE_PATH}`),
      timeOnce(`${CDN_HOST}${PROBE_PATH}`),
      readColo(),
    ])

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
