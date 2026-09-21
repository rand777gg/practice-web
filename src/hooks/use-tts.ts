import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  acquire, getState, play, release, resumeAnswer, setPrefs, stop, subscribe, togglePause,
} from '@/lib/tts/runtime'
import type { TtsPrefs } from '@/lib/tts/config'

export function useTts() {
  const state = useSyncExternalStore(subscribe, getState, getState)

  // 页面上的朗读按钮全部卸载 = 用户离开了这个场景，声音该停
  useEffect(() => {
    acquire()
    return () => release()
  }, [])

  const speak = useCallback((id: string, prompt: string[], answer: string[] = []) => {
    play(id, prompt, answer)
  }, [])

  return { ...state, speak, resume: resumeAnswer, stop, togglePause, setPrefs: setPrefs as (patch: Partial<TtsPrefs>) => void }
}
