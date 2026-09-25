import { useEffect, useState, type ReactNode } from 'react'

/**
 * 把「后台看门狗」这类不影响首屏的组件推迟到浏览器空闲再挂载。
 *
 * 全局布局里的 watcher（考试预约到点、计划轮次检测、在线状态、护眼提醒）都是纯副作用，
 * 用户看不到它们；但它们的 store、轮询和依赖会一起进首屏包。等首屏渲染完再挂，
 * 首屏的解析和执行时间就不用替它们买单。
 * 用 requestIdleCallback 而不是固定延时：真的闲就早挂，忙就等，超时兜底保证最终一定会挂。
 */
export function DeferredMount({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (typeof w.requestIdleCallback === 'function') {
      const handle = w.requestIdleCallback(() => setReady(true), { timeout: 3000 })
      return () => w.cancelIdleCallback?.(handle)
    }
    const timer = setTimeout(() => setReady(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  return ready ? <>{children}</> : null
}
