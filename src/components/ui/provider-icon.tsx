import DeepSeek from '@lobehub/icons/es/DeepSeek'
import OpenAI from '@lobehub/icons/es/OpenAI'
import Qwen from '@lobehub/icons/es/Qwen'
import OpenRouter from '@lobehub/icons/es/OpenRouter'
import { useThemeStore } from '@/stores/theme-store'

type ProviderIconComponent = typeof DeepSeek | typeof OpenAI | typeof Qwen | typeof OpenRouter

const iconMap: Record<string, ProviderIconComponent> = {
  deepseek: DeepSeek,
  openai: OpenAI,
  qwen: Qwen,
  openrouter: OpenRouter,
}

const BRAND_COLORS: Record<string, string> = {
  deepseek: '#4D6BFE',
  qwen: '#615ced',
  openrouter: '#6566F1',
}

interface ProviderIconProps {
  provider: string
  size?: number
  type?: string
}

export function ProviderIcon({ provider, size = 20, type }: ProviderIconProps) {
  const isDark = useThemeStore((s) => s.theme) === 'dark'
  const Ico = iconMap[provider]
  if (!Ico) {
    return <div className="rounded-full bg-muted flex items-center justify-center shrink-0" style={{ width: size, height: size }} />
  }
  if (type === 'avatar') {
    return (
      <span
        className="rounded-full flex items-center justify-center shrink-0 overflow-hidden"
        style={{ width: size, height: size, background: Ico.colorPrimary }}
      >
        <Ico size={Math.round(size * 0.75)} style={{ fill: '#fff' }} />
      </span>
    )
  }
  const fill = provider === 'openai' ? (isDark ? '#fff' : '#000') : (BRAND_COLORS[provider] ?? Ico.colorPrimary)
  return <Ico size={size} style={{ fill }} className="shrink-0" />
}
