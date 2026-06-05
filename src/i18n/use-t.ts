import { useCallback } from 'react'
import { useLangStore } from '@/stores/lang-store'
import { zh, en } from './translations'

const langs = { zh, en }

type KeyPath = string

export function useT() {
  const lang = useLangStore((s) => s.lang)

  const t = useCallback(
    (key: KeyPath): string => {
      const keys = key.split('.')
      let value: unknown = langs[lang]
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = (value as Record<string, unknown>)[k]
        } else {
          return key
        }
      }
      return typeof value === 'string' ? value : key
    },
    [lang],
  )

  return { t, lang }
}
