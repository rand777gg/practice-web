import { memo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface RouteMapStageNode {
  id: string
  label: string
  sublabel?: string
}

export type RouteMapNodeState = 'todo' | 'current' | 'done'

interface Props {
  title: string
  stages: RouteMapStageNode[]
  /** 节点着色:按阶段 id -> 状态(缺省视为 todo) */
  state?: Record<string, RouteMapNodeState>
  className?: string
  height?: number
}

function stagesKey(title: string, stages: RouteMapStageNode[]) {
  return title + '|' + stages.map(s => `${s.id}:${s.label}:${s.sublabel ?? ''}`).join('~')
}

/**
 * 用 archify(浏览器内编译)把路线阶段画成可交互路线图。
 * 编译较重, 仅随 title/stages 变化执行一次; 进度变化只通过 postMessage 通知 iframe 着色。
 */
export const RouteMapFigure = memo(function RouteMapFigure({ title, stages, state, className, height = 620 }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const key = stagesKey(title, stages)

  useEffect(() => {
    let cancelled = false
    if (stages.length === 0) { setHtml(null); setReady(false); return }
    setFailed(false)
    setReady(false)
    ;(async () => {
      try {
        const m = await import('@/lib/route-map')
        const spec = m.buildRouteWorkflowSpec({ title, stages })
        const compiled = m.compileRouteMapSvg(spec)
        if ('error' in compiled && compiled.error) throw new Error(compiled.error)
        const doc = m.assembleRouteMapHtml({ spec, svg: (compiled as { svg: string }).svg })
        if (!cancelled) setHtml(doc)
      } catch (e) {
        console.error('route map render failed', e)
        if (!cancelled) { setHtml(null); setFailed(true) }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const frame = frameRef.current
      if (!frame || e.source !== frame.contentWindow) return
      if (e.data && e.data.type === 'route-map-ready') {
        try {
          frame.contentWindow?.postMessage({ type: 'route-map-state', state: stateRef.current ?? {} }, '*')
        } catch { /* ignore */ }
        setReady(true)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame || !html) return
    try {
      frame.contentWindow?.postMessage({ type: 'route-map-state', state: state ?? {} }, '*')
    } catch { /* ignore */ }
    // 兜底:若握手消息丢失, 延迟重发一次
    const timer = window.setTimeout(() => {
      try {
        frame.contentWindow?.postMessage({ type: 'route-map-state', state: stateRef.current ?? {} }, '*')
      } catch { /* ignore */ }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [state, html, ready])

  if (failed) {
    return (
      <div className={cn('rounded-xl border bg-card p-4', className)}>
        <p className="text-sm text-muted-foreground mb-3">路线图渲染失败，已退回文字版阶段总览：</p>
        <div className="flex flex-wrap gap-2">
          {stages.map((s, i) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs text-foreground">
              <span className="font-semibold text-muted-foreground">{i + 1}</span>
              {s.label}
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (!html) {
    return <div className={cn('rounded-xl border bg-card animate-pulse', className)} style={{ height }} />
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      <iframe
        ref={frameRef}
        title="route-map"
        sandbox="allow-scripts allow-same-origin"
        srcDoc={html}
        style={{ width: '100%', height, border: 'none', display: 'block' }}
      />
    </div>
  )
})
