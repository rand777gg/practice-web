import type { AiConfig } from './types'

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

export function hasMineruToken(): boolean {
  return !!import.meta.env.VITE_MINERU_TOKEN
}

export function getMineruToken(): string {
  return import.meta.env.VITE_MINERU_TOKEN || ''
}
