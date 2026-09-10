/**
 * AI 供应商的接口一览 + 中转（relay）整合。
 *
 * 两部分：
 * 1. 各家「获取模型列表」的接口（路径 / 鉴权头 / 响应形状）——用来在 AI 设置页直接查，
 *    也避免每个中转站都要重新猜一遍该调哪个 endpoint。
 * 2. cc-switch 等中转插件的接入方式：本地代理地址、环境变量、以及从它的导出配置导入供应商。
 *
 * 说明：路径均以各家官方文档为准，核对时间 2026-09。中转站地址会变，导入后请自行核对。
 */

import type { ProviderProtocol } from './ai-error-codes'

export interface ProviderEndpoints {
  id: string
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  /** 对话 / 补全 */
  chat: { method: 'POST'; path: string; curl: string }
  /** 获取模型列表 */
  models: {
    method: 'GET'
    path: string
    curl: string
    /** 响应体形状 */
    shape: string
    notes: string
  }
  /** 鉴权请求头 */
  authHeader: string
  /** 额外必需请求头 */
  extraHeaders?: string[]
  docsUrl: string
}

export const PROVIDER_ENDPOINTS: ProviderEndpoints[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    chat: {
      method: 'POST',
      path: '/chat/completions',
      curl: 'curl https://api.deepseek.com/chat/completions \\\n  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}]}\'',
    },
    models: {
      method: 'GET',
      path: '/models',
      curl: 'curl https://api.deepseek.com/models \\\n  -H "Authorization: Bearer $DEEPSEEK_API_KEY"',
      shape: '{ "object": "list", "data": [{ "id": "deepseek-chat", "object": "model", "owned_by": "deepseek" }] }',
      notes: '与 OpenAI 兼容；也可把 base_url 写成 https://api.deepseek.com/v1 后调 /v1/models（官方说明 v1 与模型版本无关）。',
    },
    authHeader: 'Authorization: Bearer <API_KEY>',
    docsUrl: 'https://api-docs.deepseek.com/',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    chat: {
      method: 'POST',
      path: '/chat/completions',
      curl: 'curl https://api.openai.com/v1/chat/completions \\\n  -H "Authorization: Bearer $OPENAI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}\'',
    },
    models: {
      method: 'GET',
      path: '/models',
      curl: 'curl https://api.openai.com/v1/models \\\n  -H "Authorization: Bearer $OPENAI_API_KEY"',
      shape: '{ "object": "list", "data": [{ "id": "gpt-4o", "object": "model", "created": 1715367049, "owned_by": "system" }] }',
      notes: '只列出当前 Key 有权访问的模型；项目级 Key 与组织级 Key 返回的集合可能不同。',
    },
    authHeader: 'Authorization: Bearer <API_KEY>',
    docsUrl: 'https://platform.openai.com/docs/api-reference/models/list',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    chat: {
      method: 'POST',
      path: '/v1/messages',
      curl: 'curl https://api.anthropic.com/v1/messages \\\n  -H "x-api-key: $ANTHROPIC_API_KEY" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "content-type: application/json" \\\n  -d \'{"model":"claude-sonnet-5","max_tokens":1024,"messages":[{"role":"user","content":"hi"}]}\'',
    },
    models: {
      method: 'GET',
      path: '/v1/models',
      curl: 'curl https://api.anthropic.com/v1/models \\\n  -H "x-api-key: $ANTHROPIC_API_KEY" \\\n  -H "anthropic-version: 2023-06-01"',
      shape: '{ "data": [{ "id": "claude-sonnet-5", "display_name": "Claude Sonnet 5", "created_at": "…", "type": "model" }], "first_id": "…", "last_id": "…", "has_more": false }',
      notes: '支持 limit / before_id / after_id 分页；浏览器直连需额外带 anthropic-dangerous-direct-browser-access。',
    },
    authHeader: 'x-api-key: <API_KEY>',
    extraHeaders: ['anthropic-version: 2023-06-01'],
    docsUrl: 'https://platform.claude.com/docs/en/api/models-list',
  },
  {
    id: 'qwen',
    name: '通义千问（DashScope）',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chat: {
      method: 'POST',
      path: '/chat/completions',
      curl: 'curl https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions \\\n  -H "Authorization: Bearer $DASHSCOPE_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"model":"qwen-plus","messages":[{"role":"user","content":"hi"}]}\'',
    },
    models: {
      method: 'GET',
      path: '/models',
      curl: 'curl https://dashscope.aliyuncs.com/compatible-mode/v1/models \\\n  -H "Authorization: Bearer $DASHSCOPE_API_KEY"',
      shape: '{ "object": "list", "data": [{ "id": "qwen-plus", "object": "model", "owned_by": "system" }] }',
      notes: '兼容模式下路径与 OpenAI 一致；各地域（北京 / 新加坡 / 弗吉尼亚）的 Key 与 Endpoint 不通用。',
    },
    authHeader: 'Authorization: Bearer <API_KEY>',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/models',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    chat: {
      method: 'POST',
      path: '/chat/completions',
      curl: 'curl https://openrouter.ai/api/v1/chat/completions \\\n  -H "Authorization: Bearer $OPENROUTER_API_KEY" \\\n  -d \'{"model":"openai/gpt-4o","messages":[{"role":"user","content":"hi"}]}\'',
    },
    models: {
      method: 'GET',
      path: '/models',
      curl: 'curl https://openrouter.ai/api/v1/models \\\n  -H "Authorization: Bearer $OPENROUTER_API_KEY"',
      shape: '{ "data": [{ "id": "openai/gpt-4o", "name": "OpenAI: GPT-4o", "context_length": 128000, "pricing": { "prompt": "…", "completion": "…" } }] }',
      notes: '聚合了所有上游模型，列表较大；建议本地缓存。免费模型 id 以 :free 结尾。',
    },
    authHeader: 'Authorization: Bearer <API_KEY>',
    docsUrl: 'https://openrouter.ai/docs/api-reference/list-available-models',
  },
]

/** 常见中转 / 聚合站预设；地址可能随服务商调整，导入后请自行核对 */
export interface RelayPreset {
  id: string
  name: string
  baseUrl: string
  protocol: ProviderProtocol
  note: string
}

export const RELAY_PRESETS: RelayPreset[] = [
  { id: 'anyrouter', name: 'AnyRouter', baseUrl: 'https://anyrouter.top/v1', protocol: 'openai', note: 'cc-switch 内置预设之一，OpenAI 兼容' },
  { id: 'aihubmix', name: 'AiHubMix', baseUrl: 'https://aihubmix.com/v1', protocol: 'openai', note: 'cc-switch 内置预设之一，OpenAI 兼容' },
  { id: 'dmxapi', name: 'DMXAPI', baseUrl: 'https://www.dmxapi.com/v1', protocol: 'openai', note: 'cc-switch 内置预设之一，OpenAI 兼容' },
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', protocol: 'openai', note: '国内节点，OpenAI 兼容，模型 id 形如 Qwen/Qwen2.5-72B-Instruct' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', protocol: 'openai', note: '聚合上百模型，支持 fallback 路由' },
  { id: 'cc-switch-proxy', name: 'cc-switch 本地代理', baseUrl: 'http://127.0.0.1:15721', protocol: 'anthropic', note: '本机代理，自动做 Anthropic ↔ OpenAI 格式转换，Key 填 PROXY_MANAGED' },
]

export const CC_SWITCH = {
  name: 'cc-switch',
  repoUrl: 'https://github.com/farion1231/cc-switch',
  proxyUrl: 'http://127.0.0.1:15721',
  envSample: `// ~/.claude/settings.json —— 由 cc-switch 启用代理后自动写入
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "PROXY_MANAGED",
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:15721"
  }
}`,
}

export interface AiProviderDraft {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  protocol: ProviderProtocol
  models: string[]
}

export interface ImportResult {
  drafts: AiProviderDraft[]
  errors: string[]
  /** 原始条目数，便于提示「识别到 N 个，成功 M 个」 */
  total: number
}

function slug(value: string, index: number): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `relay-${index + 1}`
}

function pick(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function detectProtocol(text: string): ProviderProtocol {
  const lower = text.toLowerCase()
  if (lower.includes('anthropic') || lower.includes('messages')) return 'anthropic'
  return 'openai'
}

function normalizeModels(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,;]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

/**
 * 解析 cc-switch 的导出配置。
 *
 * cc-switch 是 Tauri + SQLite 的桌面工具，导出格式会随版本变化，这里按「能认出就认」的思路做宽容匹配：
 * 支持顶层是数组，或 { providers: [...] }；字段同时接受 name/label、endpoint/baseUrl/base_url/apiUrl、
 * key/apiKey/api_key/token、model/defaultModel/modelName/models。
 * 认不出来的条目会进 errors，不会静默丢弃。
 */
export function parseRelayConfig(raw: string): ImportResult {
  const errors: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { drafts: [], errors: ['不是合法的 JSON，请检查是否复制完整'], total: 0 }
  }

  let list: unknown[] = []
  if (Array.isArray(parsed)) list = parsed
  else if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>
    const candidate = record.providers ?? record.configs ?? record.data ?? record.items
    if (Array.isArray(candidate)) list = candidate
    else if (candidate && typeof candidate === 'object') {
      // { providers: { "xxx": {...} } } 这种以 id 为 key 的字典
      list = Object.values(candidate as Record<string, unknown>)
    }
  }

  if (list.length === 0) {
    return { drafts: [], errors: ['没找到供应商条目，期望是数组或 { providers: [...] } 结构'], total: 0 }
  }

  const drafts: AiProviderDraft[] = []
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`第 ${index + 1} 条不是对象，已跳过`)
      return
    }
    const record = entry as Record<string, unknown>
    const name = pick(record, ['name', 'label', 'title', 'provider'])
    const baseUrl = pick(record, ['baseUrl', 'base_url', 'endpoint', 'apiUrl', 'api_url', 'url'])
    const apiKey = pick(record, ['apiKey', 'api_key', 'key', 'token', 'authToken'])
    const models = normalizeModels(record.models ?? record.model ?? record.defaultModel ?? record.modelName)

    if (!baseUrl) {
      errors.push(`第 ${index + 1} 条缺少 Base URL，已跳过${name ? `（${name}）` : ''}`)
      return
    }
    drafts.push({
      id: `relay-${slug(name || baseUrl, index)}`,
      name: name || baseUrl,
      baseUrl,
      apiKey,
      protocol: detectProtocol(`${name} ${baseUrl} ${pick(record, ['format', 'apiFormat', 'protocol', 'wire_api'])}`),
      models,
    })
  })

  return { drafts, errors, total: list.length }
}
