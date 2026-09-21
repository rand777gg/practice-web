export interface TtsVoice {
  id: string
  name: string
  desc: string
}

/** 服务端 (edge-tts) 支持的中文音色，取朗读助记最实用的几个 */
export const TTS_VOICES: TtsVoice[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', desc: '女声 · 温柔' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', desc: '女声 · 甜美' },
  { id: 'zh-CN-XiaochenNeural', name: '晓辰', desc: '女声 · 知性' },
  { id: 'zh-CN-XiaoxuanNeural', name: '晓萱', desc: '女声 · 清新' },
  { id: 'zh-CN-YunxiNeural', name: '云希', desc: '男声 · 清朗' },
  { id: 'zh-CN-YunjianNeural', name: '云健', desc: '男声 · 稳重' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', desc: '男声 · 阳光' },
  { id: 'zh-CN-YunzeNeural', name: '云泽', desc: '男声 · 深沉' },
]

export const TTS_SPEEDS = [0.75, 1, 1.25, 1.5, 2]

export interface TtsPrefs {
  voice: string
  speed: number
  /** 先读题、停下来等回忆，再读答案 —— 被动听记不住，主动回忆才记住 */
  askFirst: boolean
}

const PREFS_KEY = 'tts_prefs'
const DEFAULT_BASE_URL = 'https://tts-server.pguide.dev'

export const DEFAULT_TTS_PREFS: TtsPrefs = {
  voice: TTS_VOICES[0].id,
  speed: 1,
  askFirst: true,
}

export function getTtsBaseUrl(): string {
  const raw = (import.meta.env.VITE_TTS_BASE_URL as string | undefined) || DEFAULT_BASE_URL
  return raw.replace(/\/+$/, '')
}

export function loadTtsPrefs(): TtsPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_TTS_PREFS }
    const parsed = JSON.parse(raw) as Partial<TtsPrefs>
    const speed = Number(parsed.speed)
    return {
      voice: TTS_VOICES.some((v) => v.id === parsed.voice) ? (parsed.voice as string) : DEFAULT_TTS_PREFS.voice,
      speed: TTS_SPEEDS.includes(speed) ? speed : DEFAULT_TTS_PREFS.speed,
      askFirst: typeof parsed.askFirst === 'boolean' ? parsed.askFirst : DEFAULT_TTS_PREFS.askFirst,
    }
  } catch {
    return { ...DEFAULT_TTS_PREFS }
  }
}

export function saveTtsPrefs(prefs: TtsPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch { /* noop */ }
}
