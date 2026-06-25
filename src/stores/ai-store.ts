import { create } from 'zustand'
import type { AiProviderConfig } from '@/types'

const OFFICIAL_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '深度求索推出的高性能大语言模型，支持 DeepSeek-V3 和 DeepSeek-R1 推理模型。',
    type: 'official',
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
]

const OPENROUTER_FREE_MODELS = [
  // Smart router
  { id: 'openrouter/auto', name: 'Auto (自动选择最优)', enabled: true },
  // Featured
  { id: 'openrouter/owl-alpha', name: 'Owl Alpha (Agent · 1M ctx)', enabled: false },
  { id: 'nvidia/nemotron-3-ultra', name: 'Nemotron 3 Ultra (550B MoE · 1M ctx)', enabled: false },
  { id: 'nvidia/nemotron-3-super', name: 'Nemotron 3 Super (120B MoE · 1M ctx)', enabled: false },
  { id: 'nex-agi/nex-n2-pro', name: 'Nex-N2-Pro (397B MoE · Coding)', enabled: false },
  { id: 'poolside/laguna-m.1', name: 'Laguna M.1 (Coding Agent)', enabled: false },
  { id: 'poolside/laguna-xs.2', name: 'Laguna XS.2 (Efficient Coding)', enabled: false },
  { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B (MoE · Reasoning)', enabled: false },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (Apache 2.0)', enabled: false },
  // Google
  { id: 'google/gemma-4-31b', name: 'Gemma 4 31B (多模态 · 140+语言)', enabled: false },
  { id: 'google/gemma-4-26b-a4b', name: 'Gemma 4 26B A4B (MoE · 多模态)', enabled: false },
  { id: 'google/gemma-3-27b', name: 'Gemma 3 27B', enabled: false },
  { id: 'google/gemma-3-12b', name: 'Gemma 3 12B', enabled: false },
  // NVIDIA
  { id: 'nvidia/nemotron-3-nano-30b-a3b', name: 'Nemotron 3 Nano 30B A3B', enabled: false },
  { id: 'nvidia/nemotron-nano-9b-v2', name: 'Nemotron Nano 9B V2', enabled: false },
  { id: 'nvidia/nemotron-3-nano-omni', name: 'Nemotron 3 Nano Omni (多模态)', enabled: false },
  // Cohere
  { id: 'cohere/north-mini-code', name: 'North Mini Code (30B MoE · Apache 2.0)', enabled: false },
  // Meta
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', enabled: false },
  { id: 'meta-llama/llama-3.2-3b-instruct', name: 'Llama 3.2 3B Instruct', enabled: false },
  // Qwen
  { id: 'qwen/qwen3-coder-480b', name: 'Qwen3 Coder 480B', enabled: false },
  { id: 'qwen/qwen3-next-80b', name: 'Qwen3 Next 80B', enabled: false },
  // DeepSeek
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (推理)', enabled: false },
  // Other
  { id: 'moonshotai/kimi-k2', name: 'Kimi K2', enabled: false },
  { id: 'z-ai/glm-4.5-air', name: 'GLM 4.5 Air', enabled: false },
  { id: 'liquid/lfm-2.5', name: 'Liquid LFM 2.5', enabled: false },
  { id: 'nousresearch/hermes-3-405b', name: 'Hermes 3 405B', enabled: false },
]

const COMMUNITY_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云通义千问 Qwen3.7-Plus，支持图片、文字输入输出的多模态模型。通过 DashScope API 接入。',
    type: 'community',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-vl-plus', name: 'Qwen-VL-Plus（轻量多模态）', enabled: true },
      { id: 'qwen3.7-plus', name: 'Qwen3.7-Plus（多模态）', enabled: false },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenRouter 免费模型聚合平台，一个 API 接入 25+ 免费模型。无需付费，速率限制 ~20 RPM / 50 次/天。',
    type: 'community',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: OPENROUTER_FREE_MODELS,
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
        }
      }
      // Auto-fill env keys and auto-enable providers that have env keys
      for (const p of saved) {
        const envKey = (import.meta.env as Record<string, string>)[`VITE_${p.id.toUpperCase()}_API_KEY`]
        if (envKey) {
          if (!p.apiKey) p.apiKey = envKey
          p.enabled = true
        }
      }
      // Remove providers that no longer exist in defaults
      return saved.filter((s) => DEFAULT_PROVIDERS.find((d) => d.id === s.id))
    }
  } catch { /* noop */ }
  return [...DEFAULT_PROVIDERS]
}

interface AiState {
  providers: AiProviderConfig[]
  save: (providers: AiProviderConfig[]) => void
  toggleProvider: (id: string) => void
  toggleModel: (providerId: string, modelId: string) => void
  setApiKey: (providerId: string, apiKey: string) => void
  setBaseUrl: (providerId: string, baseUrl: string) => void
  getEnabledModels: (providerId: string) => string[]
  getActiveProviders: () => AiProviderConfig[]
}

export const useAiStore = create<AiState>((set, get) => ({
  providers: loadProviders(),

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
