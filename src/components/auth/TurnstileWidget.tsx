import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'

const SITE_KEY = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY as string
if (!SITE_KEY) console.error('VITE_CF_TURNSTILE_SITE_KEY is not set — Turnstile will not work')
const SCRIPT_ID = 'cf-turnstile-script'

export interface TurnstileHandle {
  getFreshToken: () => Promise<string>
}

function loadScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) { resolve(); return }
    if (document.getElementById(SCRIPT_ID)) {
      const check = setInterval(() => { if (window.turnstile) { clearInterval(check); resolve() } }, 100)
      return
    }
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
}

export const TurnstileWidget = forwardRef<TurnstileHandle>(function TurnstileWidget(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string>('')
  const resolveRef = useRef<((token: string) => void) | null>(null)
  useImperativeHandle(ref, () => ({
    getFreshToken: () => new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolveRef.current = null
        reject(new Error('验证超时，请检查网络后重试'))
      }, 20000)

      const doReset = () => {
        if (!widgetId.current || !window.turnstile) {
          setTimeout(doReset, 200)
          return
        }
        resolveRef.current = (token: string) => {
          clearTimeout(timer)
          resolveRef.current = null
          if (!token) reject(new Error('验证未通过，请重试'))
          else resolve(token)
        }
        try {
          window.turnstile.reset(widgetId.current)
        } catch {
          clearTimeout(timer)
          reject(new Error('验证组件加载失败，请刷新页面'))
        }
      }
      doReset()
    }),
  }))

  useEffect(() => {
    let cancelled = false
    let retries = 0

    async function init() {
      await loadScript()
      if (cancelled) return

      while (retries < 5) {
        if (!containerRef.current) {
          await new Promise(r => setTimeout(r, 300))
          retries++
          continue
        }
        try {
          widgetId.current = window.turnstile!.render(containerRef.current, {
            sitekey: SITE_KEY,
            callback: (token: string) => {
              if (resolveRef.current) {
                resolveRef.current(token)
                resolveRef.current = null
              }
            },
          })
          return
        } catch {
          // 600010: container not ready (StrictMode remount, slow DOM)
          await new Promise(r => setTimeout(r, 500))
          retries++
        }
      }
    }

    init()
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current) } catch {}
      }
    }
  }, [])

  return <div ref={containerRef} className="flex justify-center min-h-[65px] min-w-[300px] max-w-full" />
})

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}
