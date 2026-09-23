import { create } from 'zustand'
import type { AiProviderConfig } from '@/types'

const OFFICIAL_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '深度求索推出的高性能大语言模型，OpenAI 兼容格式。注意 402 表示账户余额不足。',
    type: 'official',
    protocol: 'openai',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3', enabled: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1', enabled: false },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI 提供的 GPT 系列模型，包括 GPT-4o、o3-mini 等旗舰模型。',
    type: 'official',
    protocol: 'openai',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', enabled: false },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', enabled: false },
      { id: 'o3-mini', name: 'o3-mini', enabled: false },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', enabled: false },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Anthropic Messages API 格式，与 OpenAI 不同：走 /v1/messages，鉴权用 x-api-key。529 表示服务过载。',
    type: 'official',
    protocol: 'anthropic',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', enabled: false },
      { id: 'claude-opus-5', name: 'Claude Opus 5', enabled: false },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', enabled: false },
    ],
  },
]

const COMMUNITY_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云通义千问 Qwen3.7-Plus，支持图片、文字输入输出的多模态模型。通过 DashScope API 接入。',
    type: 'community',
    protocol: 'openai',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-vl-plus', name: 'Qwen-VL-Plus（轻量多模态）', enabled: true },
      { id: 'qwen3.7-plus', name: 'Qwen3.7-Plus（多模态）', enabled: false },
    ],
  },
]

const DEFAULT_PROVIDERS = [...OFFICIAL_PROVIDERS, ...COMMUNITY_PROVIDERS]

function loadProviders(): AiProviderConfig[] {
  try {
    const stored = localStorage.getItem('ai_providers')
    if (stored) {
      const saved = JSON.parse(stored) as AiProviderConfig[]
      // Merge: add new providers, prune removed models, sync existing
      for (const def of DEFAULT_PROVIDERS) {
        const existing = saved.find((s) => s.id === def.id)
        if (!existing) {
          saved.push(def)
        } else {
          // Keep only models that still exist in defaults
          existing.models = existing.models.filter((m) =>
            def.models.some((dm) => dm.id === m.id),
          )
          // Add new models
          for (const dm of def.models) {
            if (!existing.models.find((m) => m.id === dm.id)) {
              existing.models.push({ ...dm })
            }
          }
          // protocol 是结构字段、不由用户编辑，始终跟随默认定义（兼容旧版本地缓存）
          existing.protocol = def.protocol
        }
      }
      // 这里以前会按 `VITE_<ID>_API_KEY` 动态拼键名去 import.meta.env 里取默认 Key。
      // 已经去掉: 动态访问会让 Vite 把**整个 env 对象**打进产物, 于是所有 VITE_ 变量
      // (Qwen / OpenRouter / MinerU token…) 都明文躺在线上 JS 里。
      // 现在平台自己的模型走 Edge Function 代理(见 src/lib/ai/config.ts),
      // 这里的 Key 一律由使用者在本机填写, 只存 localStorage。
      // Remove providers that no longer exist in defaults
      return saved.filter((s) => DEFAULT_PROVIDERS.find((d) => d.id === s.id))
    }
  } catch { /* noop */ }
  return [...DEFAULT_PROVIDERS]
}

interface AiState {
  providers: AiProviderConfig[]
  /** 是否优先使用用户自己填的 Key（false 时跟随管理员配置的平台默认供应商） */
  preferOwnKey: boolean
  setPreferOwnKey: (value: boolean) => void
  save: (providers: AiProviderConfig[]) => void
  toggleProvider: (id: string) => void
  toggleModel: (providerId: string, modelId: string) => void
  setApiKey: (providerId: string, apiKey: string) => void
  setBaseUrl: (providerId: string, baseUrl: string) => void
  getEnabledModels: (providerId: string) => string[]
  getActiveProviders: () => AiProviderConfig[]
}

function loadPreferOwnKey(): boolean {
  try {
    return localStorage.getItem('ai_prefer_own_key') !== '0'
  } catch {
    return true
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  providers: loadProviders(),
  preferOwnKey: loadPreferOwnKey(),

  setPreferOwnKey: (value) => {
    try { localStorage.setItem('ai_prefer_own_key', value ? '1' : '0') } catch { /* noop */ }
    set({ preferOwnKey: value })
  },

  save: (providers) => {
    try { localStorage.setItem('ai_providers', JSON.stringify(providers)) } catch { /* noop */ }
    set({ providers })
  },

  toggleProvider: (id) => {
    const next = get().providers.map((p) =>
      p.id === id ? { ...p, enabled: !p.enabled } : p,
    )
    get().save(next)
  },

  toggleModel: (providerId, modelId) => {
    const next = get().providers.map((p) => {
      if (p.id !== providerId) return p
      return {
        ...p,
        models: p.models.map((m) =>
          m.id === modelId ? { ...m, enabled: !m.enabled } : m,
        ),
      }
    })
    get().save(next)
  },

  setApiKey: (providerId, apiKey) => {
    const next = get().providers.map((p) =>
      p.id === providerId ? { ...p, apiKey } : p,
    )
    get().save(next)
  },

  setBaseUrl: (providerId, baseUrl) => {
    const next = get().providers.map((p) =>
      p.id === providerId ? { ...p, baseUrl } : p,
    )
    get().save(next)
  },

  getEnabledModels: (providerId) => {
    const p = get().providers.find((p) => p.id === providerId)
    if (!p?.enabled) return []
    return p.models.filter((m) => m.enabled).map((m) => m.id)
  },

  getActiveProviders: () => {
    return get().providers.filter((p) => p.enabled && p.models.some((m) => m.enabled))
  },
}))
