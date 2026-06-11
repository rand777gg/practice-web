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

const COMMUNITY_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: '统一的 LLM 路由网关，提供对 OpenAI、Anthropic、Google 等多个厂商模型的统一 API 访问。',
    type: 'community',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o', enabled: false },
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', enabled: false },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', enabled: false },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', enabled: false },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云通义千问系列模型，支持多模态视觉识别（公式、表格、OCR）。通过 DashScope API 接入。',
    type: 'community',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-vl-max', name: 'Qwen-VL-Max（多模态）', enabled: false },
      { id: 'qwen-vl-plus', name: 'Qwen-VL-Plus（多模态）', enabled: false },
      { id: 'qwen-plus', name: 'Qwen-Plus', enabled: false },
      { id: 'qwen-max', name: 'Qwen-Max', enabled: false },
    ],
  },
  {
    id: 'dify',
    name: 'Dify',
    description: '开源的 LLM 应用开发平台，支持可视化编排 AI 工作流和自定义应用。',
    type: 'community',
    enabled: false,
    apiKey: '',
    baseUrl: 'https://api.dify.ai/v1',
    models: [
      { id: 'dify-default', name: 'Dify App', enabled: false },
    ],
  },
]

function loadProviders(): AiProviderConfig[] {
  try {
    const stored = localStorage.getItem('ai_providers')
    if (stored) return JSON.parse(stored) as AiProviderConfig[]
  } catch { /* noop */ }
  return [...OFFICIAL_PROVIDERS, ...COMMUNITY_PROVIDERS]
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
