import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'

const SITE_KEY = import.meta.env.VITE_CF_TURNSTILE_SITE_KEY as string
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
    getFreshToken: () => new Promise<string>((resolve) => {
      resolveRef.current = resolve
      if (widgetId.current != null && window.turnstile) {
        window.turnstile.reset(widgetId.current)
      }
    }),
  }))

  useEffect(() => {
    let cancelled = false
    loadScript().then(() => {
      if (cancelled || !containerRef.current) return
      widgetId.current = window.turnstile!.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => {
          if (resolveRef.current) {
            resolveRef.current(token)
            resolveRef.current = null
          }
        },
      })
    })
    return () => { cancelled = true }
  }, [])

  return <div ref={containerRef} className="flex justify-center" />
})

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: Record<string, unknown>) => string
      reset: (id?: string) => void
    }
  }
}
