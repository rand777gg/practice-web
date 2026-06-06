import type { AiConfig, MinerUModelVersion } from './types'

export function getAiConfig(): AiConfig {
  return {
    apiKey: import.meta.env.VITE_DEEPSEEK_API_KEY || '',
    baseURL: import.meta.env.VITE_DEEPSEEK_BASE_URL,
    model: import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
  }
}

export function hasAiConfig(): boolean {
  return !!import.meta.env.VITE_DEEPSEEK_API_KEY
}

const MINERU_TOKEN_KEY = 'mineru_precision_token'
const MINERU_MODEL_KEY = 'mineru_precision_model'

export function getMinerUToken(): string {
  return localStorage.getItem(MINERU_TOKEN_KEY) || import.meta.env.VITE_MINERU_TOKEN || ''
}

export function setMinerUToken(token: string): void {
  localStorage.setItem(MINERU_TOKEN_KEY, token)
}

export function getMinerUModelVersion(): MinerUModelVersion {
  return (localStorage.getItem(MINERU_MODEL_KEY) as MinerUModelVersion) || 'vlm'
}

export function setMinerUModelVersion(model: MinerUModelVersion): void {
  localStorage.setItem(MINERU_MODEL_KEY, model)
}

export function hasMinerUToken(): boolean {
  return !!getMinerUToken()
}
