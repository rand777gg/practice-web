import type { AiConfig, MinerUModelVersion } from './types'
import { supabase } from '@/lib/supabase'

/**
 * 平台模型一律走 Edge Function 代理(supabase/functions/ai), key 只存在服务端 secret。
 *
 * 为什么不再用 VITE_DEEPSEEK_API_KEY: 那个变量是**构建期内联**的 —— 谁打开产物谁就能抠走。
 * 实测线上 /assets/config-*.js 里就躺着明文, 换多少把 key 都会再泄一次。
 * 代理之后前端不再持有任何 AI key, 换 key 只需要改服务端 secret。
 *
 * baseURL 指到函数地址即可: @ai-sdk 会自己接上 /chat/completions, 请求体与响应原样透传,
 * 所以十几处 generateText / generateObject 调用一行都不用改, 只要把 fetch 一起传进去。
 */
const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/ai`
const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1`
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

/**
 * 调用场景。服务端按它分组统计用量(见 supabase/migrations Section 72), 页面上就是
 * "这次调用是谁发起的"。新增一个场景时两边都不用改 SQL —— 加个值、页面自己会显示新分组。
 */
export type AiCallSource =
  | 'assistant' | 'assistant-create' | 'grade' | 'summary' | 'chart'
  | 'markdown' | 'question' | 'import' | 'prompt' | 'profile' | 'probe'

/**
 * 给 @ai-sdk 用的 fetch: 每次请求现取会话 JWT 放进 Authorization。
 *
 * 为什么不靠 apiKey 传身份: SDK 是在**构造 client 时**把 apiKey 读成字符串的, 而会话 token
 * 会过期、刷新后还会变值 —— 构造那一刻抓的快照, 在停留久了的面板上就是过期的那个, 直接 401。
 * 放在 fetch 里是唯一能保证"每次都是当前会话"的位置。
 *
 * 401 时刷新会话再重试一次。但只在 401 **不是上游给的**时候重试: 代理会用 x-ai-upstream
 * 标记"这是模型的答复", 否则"模型 key 失效"也会被当成"我的会话过期", 白发一次请求。
 */
export async function aiFetch(input: RequestInfo | URL, init?: RequestInit, source?: AiCallSource): Promise<Response> {
  const token = await currentSessionToken()
  if (!token) throw new Error('未登录, 无法使用平台模型')

  const res = await sendWith(input, init, token, source)
  if (res.status !== 401 || res.headers.get('x-ai-upstream')) return res

  await supabase.auth.refreshSession().catch(() => {})
  const refreshed = await currentSessionToken()
  if (!refreshed || refreshed === token) return res
  return sendWith(input, init, refreshed, source)
}

function sendWith(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  token: string,
  source?: AiCallSource,
): Promise<Response> {
  const applyHeaders = (headers: Headers) => {
    headers.set('Authorization', `Bearer ${token}`)
    if (ANON_KEY) headers.set('apikey', ANON_KEY)
    // 少了它也能跑, 只是日志里那条记录没有场景(代理函数会存 null)
    if (source) headers.set('x-ai-source', source)
  }
  if (input instanceof Request) {
    const headers = new Headers(input.headers)
    applyHeaders(headers)
    return fetch(new Request(input, { headers }))
  }
  const headers = new Headers(init?.headers)
  applyHeaders(headers)
  return fetch(input, { ...init, headers })
}

async function currentSessionToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

/** source 决定这次调用在用量页里记成哪个场景 */
export function getAiConfig(source?: AiCallSource): AiConfig {
  return {
    // SDK 要求这个字段非空; 真正的凭据由 aiFetch 每次请求时放进 Authorization,
    // 这里放什么都到不了线上产物里。
    apiKey: 'server-side',
    baseURL: PROXY_BASE,
    model: import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
    fetch: (input: RequestInfo | URL, init?: RequestInit) => aiFetch(input, init, source),
  }
}

/**
 * 是否可用平台模型。
 * 以前看的是"前端有没有内置 key", 现在 key 在服务端, 前端只能确认代理出口配好了 ——
 * 服务端漏配 secret 的情况由调用失败(503 ai_not_configured)暴露, 不再靠这个开关兜。
 */
export function hasAiConfig(): boolean {
  return !!import.meta.env.VITE_SUPABASE_URL
}

const MINERU_TOKEN_KEY = 'mineru_precision_token'
const MINERU_MODEL_KEY = 'mineru_precision_model'

/**
 * MinerU 的 token 分两层:
 *   平台那把在服务端 —— mineru-proxy 读 secret `MINERU_TOKEN`, 请求不带 X-MinerU-Token 时由它补上;
 *   这里返回的是**你自己填的**那把(localStorage), 用于走自己的额度、或平台没配时兜底。
 * 所以空字符串是正常状态, 不是"没配置"。
 */
export function getMinerUToken(): string {
  return localStorage.getItem(MINERU_TOKEN_KEY) || ''
}

export function setMinerUToken(token: string): void {
  localStorage.setItem(MINERU_TOKEN_KEY, token)
}

/** 本机有没有自填 token(只用来在设置页显示"用你自己的额度"), 不代表 MinerU 能不能用 */
export function hasMinerUToken(): boolean {
  return !!getMinerUToken()
}

/**
 * 平台服务端配没配 MinerU。
 * 未探测出结果之前按"有"处理 —— 默认是平台提供, 让界面先按可用渲染;
 * 探到没有才把提示换成"请自填 token"。探测结果缓存在内存里, 一次会话只问一次。
 */
let platformMinerU: boolean | null = null

export function probeMinerU(): Promise<boolean> {
  if (platformMinerU !== null) return Promise.resolve(platformMinerU)
  // 这个探测也要带会话(函数现在要求登录), 否则永远拿到 401 而被当成"平台没配"
  return supabase.auth.getSession()
    .then(({ data }) => fetch(`${FUNCTIONS_BASE}/mineru-proxy/config`, {
      headers: {
        apikey: ANON_KEY,
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      },
    }))
    .then((r) => (r.ok ? r.json() : { platform_token: false }))
    .then((body: { platform_token?: boolean }) => {
      platformMinerU = !!body.platform_token
      return platformMinerU
    })
    .catch(() => {
      // 探测失败不该让功能消失: 保持乐观, 真不行时请求本身会报错
      platformMinerU = platformMinerU ?? true
      return platformMinerU
    })
}

/** 精确解析/OCR 能不能用: 平台给了, 或者自己有 */
export function canUseMinerU(): boolean {
  return platformMinerU !== false || hasMinerUToken()
}

export function getMinerUModelVersion(): MinerUModelVersion {
  return (localStorage.getItem(MINERU_MODEL_KEY) as MinerUModelVersion) || 'vlm'
}

export function setMinerUModelVersion(model: MinerUModelVersion): void {
  localStorage.setItem(MINERU_MODEL_KEY, model)
}
