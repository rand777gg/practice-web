import { getTtsBaseUrl, loadTtsPrefs, saveTtsPrefs, type TtsPrefs } from './config'

export type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused'

export interface TtsState {
  status: TtsStatus
  /** 当前在播（或暂停）的调用方 id —— 别的卡片靠它判断"播的是不是我" */
  id: string | null
  /** 'answer' = 先问后答模式下题干读完了，等用户点一下才继续 */
  cue: 'none' | 'answer'
  error: string | null
  /** 报错的那个调用方 —— 错误只该出现在按下去的那张卡上 */
  errorId: string | null
  prefs: TtsPrefs
}

interface Session {
  id: string
  segments: string[]
  index: number
  /** 读到这个下标就停住等用户；null = 一路读到底 */
  boundary: number | null
  prefs: TtsPrefs
}

let state: TtsState = {
  status: 'idle',
  id: null,
  cue: 'none',
  error: null,
  errorId: null,
  prefs: loadTtsPrefs(),
}

const listeners = new Set<() => void>()

function emit(patch: Partial<TtsState>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getState(): TtsState {
  return state
}

// ── 播放器 ────────────────────────────────────────────────────────────
// 模块级单例：全局同时只该有一个声音在响，跨卡片切歌的语义也在这儿。

let session: Session | null = null
let audio: HTMLAudioElement | null = null
let currentUrl: string | null = null
/** 正在预取、还没交给播放器的那一段 —— 被打断时要负责回收它的 URL */
let inFlight: Promise<string | null> | null = null
let runId = 0
let settle: (() => void) | null = null

function ensureAudio(): HTMLAudioElement {
  if (!audio) audio = new Audio()
  return audio
}

async function fetchChunk(text: string, prefs: TtsPrefs): Promise<string> {
  const res = await fetch(`${getTtsBaseUrl()}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, voice: prefs.voice, speed: prefs.speed, pitch: 0, style: 'general' }),
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) detail = body.error.message
    } catch { /* 错误体不是 JSON，用状态码兜底 */ }
    throw new Error(detail)
  }
  return URL.createObjectURL(await res.blob())
}

function playUrl(src: string): Promise<void> {
  const el = ensureAudio()
  if (currentUrl && currentUrl !== src) URL.revokeObjectURL(currentUrl)
  currentUrl = src

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { el.onended = null; el.onerror = null; settle = null }
    settle = () => { cleanup(); resolve() }
    el.onended = () => { cleanup(); resolve() }
    el.onerror = () => { cleanup(); reject(new Error('音频播放失败')) }
    el.src = src
    el.play().then(undefined, (e: unknown) => {
      cleanup()
      reject(e instanceof Error ? e : new Error('浏览器拦截了自动播放'))
    })
  })
}

async function run(): Promise<void> {
  if (!session) return
  const myRun = ++runId
  emit({ status: 'loading', error: null })

  let prefetch: Promise<string | null> | null = null

  // 循环条件必须自己带边界：boundary 只负责在题干和答案之间刹车，
  // 少了 index < length 这半截，读完最后一段会拿着 segments[length] 无限请求下去
  while (session && myRun === runId && session.index < session.segments.length) {
    const s = session

    if (s.boundary !== null && s.index >= s.boundary) {
      emit({ status: 'idle', cue: 'answer' })
      return
    }

    let src: string | null = null
    if (prefetch) { src = await prefetch; prefetch = null; inFlight = null }
    if (myRun !== runId) { if (src) URL.revokeObjectURL(src); return }

    if (!src) {
      try {
        src = await fetchChunk(s.segments[s.index], s.prefs)
      } catch (e) {
        if (myRun !== runId) return
        session = null
        emit({ status: 'idle', id: null, cue: 'none', error: e instanceof Error ? e.message : '语音合成失败', errorId: s.id })
        return
      }
    }
    if (myRun !== runId) { URL.revokeObjectURL(src); return }

    // 下一段趁现在这段还在放的时候先合成好，段间才不会有空档
    const next = s.index + 1
    const stopsAtNext = s.boundary !== null && next >= s.boundary
    if (next < s.segments.length && !stopsAtNext) {
      inFlight = fetchChunk(s.segments[next], s.prefs).catch(() => null)
      prefetch = inFlight
    }

    emit({ status: 'playing' })
    try {
      await playUrl(src)
    } catch {
      if (myRun !== runId) return
      // 单段放不出来不该掐掉整段朗读，跳过继续
    }
    if (myRun !== runId || !session) return
    session.index = next
  }

  if (myRun !== runId) return
  session = null
  emit({ status: 'idle', id: null, cue: 'none' })
}

export function play(id: string, prompt: string[], answer: string[]): void {
  stop()

  const segments = [...prompt, ...answer]
  if (segments.length === 0) {
    emit({ status: 'idle', id: null, cue: 'none', error: null, errorId: null })
    return
  }

  // 有题干也有答案时才谈得上"先问后答"，缺一头就直接读完
  const askFirst = state.prefs.askFirst && prompt.length > 0 && answer.length > 0
  session = {
    id,
    segments,
    index: 0,
    boundary: askFirst ? prompt.length : null,
    prefs: { ...state.prefs },
  }
  emit({ id, cue: 'none', status: 'loading', error: null })
  void run()
}

/** 题干读完了，用户表示"我回忆过了" —— 接着读答案 */
export function resumeAnswer(): void {
  if (!session || state.cue !== 'answer') return
  session.boundary = null
  emit({ cue: 'none' })
  void run()
}

export function stop(): void {
  runId++
  session = null
  settle?.()
  settle = null
  // 预取中的那一段还没交给播放器，run() 已经不认它了，这里负责收尸
  if (inFlight) {
    void inFlight.then((url) => { if (url) URL.revokeObjectURL(url) }).catch(() => { /* 合成失败没有 URL 可回收 */ })
    inFlight = null
  }
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null }
  emit({ status: 'idle', id: null, cue: 'none', error: null, errorId: null })
}

export function togglePause(): void {
  if (!audio) return
  if (state.status === 'playing') {
    audio.pause()
    emit({ status: 'paused' })
  } else if (state.status === 'paused') {
    void audio.play().then(() => emit({ status: 'playing' }), () => { /* 被拦截就保持暂停 */ })
  }
}

export function setPrefs(patch: Partial<TtsPrefs>): void {
  const prefs = { ...state.prefs, ...patch }
  saveTtsPrefs(prefs)
  emit({ prefs })
  if (session) session.prefs = prefs
}

// 没有任何朗读按钮挂在页面上时，声音就该停 —— 换页/关弹窗都靠这个收尾
let mounted = 0

export function acquire(): void {
  mounted++
}

export function release(): void {
  mounted--
  if (mounted <= 0) {
    mounted = 0
    stop()
  }
}
