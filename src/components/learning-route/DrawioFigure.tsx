import {
  forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react'
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DRAWIO_EMBED_ORIGIN, isDiagramXml, wrapDiagramXml } from '@/lib/route-map/drawio'

export interface DrawioFigureHandle {
  /** 向编辑器索取当前 XML(编辑器未就绪/无响应时返回 null) */
  exportXml: () => Promise<string | null>
  /** 编辑器是否已完成握手 */
  isReady: () => boolean
  /** 用新内容覆盖编辑器内容 */
  loadXml: (xml: string) => void
}

interface Props {
  /** 已保存的 mxfile 数据; 空则用 fallbackXml */
  xml?: string | null
  /** 路线尚无保存数据时展示的自动生成图 */
  fallbackXml?: string
  /** true = 内嵌 draw.io 编辑器(工具栏 Save 会触发 onSave); false = 只读浏览 */
  editable?: boolean
  /** draw.io 内触发保存(Ctrl+S / 工具栏 Save)时回调 */
  onSave?: (xml: string) => void | Promise<void>
  height?: number
  className?: string
}

interface EmbedMessage {
  event?: string
  xml?: string
  data?: string
  format?: string
  message?: string
}

const INIT_TIMEOUT_MS = 15000
const EXPORT_TIMEOUT_MS = 5000

/** 学习路线 draw.io 面板: 内嵌 embed.diagrams.net, 用 postMessage 装载/取回 mxGraph 数据 */
export const DrawioFigure = memo(
  forwardRef<DrawioFigureHandle, Props>(function DrawioFigure(
    { xml, fallbackXml, editable = false, onSave, height = 620, className },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null)
    const frameRef = useRef<HTMLIFrameElement | null>(null)
    const readyRef = useRef(false)
    const exportResolveRef = useRef<((xml: string | null) => void) | null>(null)
    const [ready, setReady] = useState(false)
    const [failed, setFailed] = useState(false)
    const [retryKey, setRetryKey] = useState(0)

    const initialXml = useMemo(() => {
      if (isDiagramXml(xml)) return wrapDiagramXml(xml as string)
      if (isDiagramXml(fallbackXml)) return wrapDiagramXml(fallbackXml as string)
      return ''
    }, [xml, fallbackXml])

    const initialXmlRef = useRef(initialXml)
    initialXmlRef.current = initialXml
    const onSaveRef = useRef(onSave)
    onSaveRef.current = onSave
    /** 编辑器内当前内容, 用于避免外部 prop 变化时无谓覆盖(会清掉撤销栈/视口) */
    const syncedRef = useRef('')

    const post = useCallback((payload: Record<string, unknown>) => {
      try {
        frameRef.current?.contentWindow?.postMessage(JSON.stringify(payload), '*')
      } catch {
        /* 跨窗口消息失败时静默: 下一次握手/重试兜底 */
      }
    }, [])

    const src = useMemo(() => {
      const params = new URLSearchParams({
        embed: '1',
        proto: 'json',
        spin: '1',
        ui: 'atlas',
        lang: 'zh',
        libraries: '1',
        saveAndExit: '0',
        noExitBtn: '1',
      })
      if (editable) {
        params.set('noSaveBtn', '0')
        params.set('keepmodified', '1')
      } else {
        params.set('noSaveBtn', '1')
        params.set('chrome', '0')
      }
      return `${DRAWIO_EMBED_ORIGIN}/?${params.toString()}`
    }, [editable])

    const requestExport = useCallback((format: string) => new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => {
        exportResolveRef.current = null
        resolve(null)
      }, EXPORT_TIMEOUT_MS)
      exportResolveRef.current = (value) => {
        window.clearTimeout(timer)
        exportResolveRef.current = null
        resolve(value)
      }
      post({ action: 'export', format })
    }), [post])

    useImperativeHandle(ref, () => ({
      exportXml: async () => {
        if (!readyRef.current) return null
        // xmlpng/xmlsvg 的应答里带 xml 字段, 是 embed 协议下取回当前数据最稳的方式
        const viaPng = await requestExport('xmlpng')
        if (viaPng) return viaPng
        return requestExport('xmlsvg')
      },
      isReady: () => readyRef.current,
      loadXml: (next: string) => {
        if (!isDiagramXml(next)) return
        const wrapped = wrapDiagramXml(next)
        syncedRef.current = wrapped
        post({ action: 'load', xml: wrapped, autosave: 0 })
      },
    }), [post, requestExport])

    useEffect(() => {
      const host = hostRef.current
      if (!host) return
      let cancelled = false
      const timer = window.setTimeout(() => {
        if (!cancelled && !readyRef.current) setFailed(true)
      }, INIT_TIMEOUT_MS)

      const onMessage = (e: MessageEvent) => {
        const frame = frameRef.current
        if (!frame || e.source !== frame.contentWindow) return
        let msg: EmbedMessage | null = null
        if (typeof e.data === 'string') {
          try { msg = JSON.parse(e.data) as EmbedMessage } catch { return }
        } else if (e.data && typeof e.data === 'object') {
          msg = e.data as EmbedMessage
        }
        if (!msg?.event) return

        if (msg.event === 'init') {
          window.clearTimeout(timer)
          readyRef.current = true
          setReady(true)
          if (initialXmlRef.current) {
            syncedRef.current = initialXmlRef.current
            post({ action: 'load', xml: initialXmlRef.current, autosave: 0 })
          }
          return
        }
        if (msg.event === 'save') {
          if (typeof msg.xml === 'string' && msg.xml.trim()) {
            syncedRef.current = msg.xml
            void onSaveRef.current?.(msg.xml)
          }
          return
        }
        if (msg.event === 'export') {
          const resolve = exportResolveRef.current
          const value = typeof msg.xml === 'string' && msg.xml.trim() ? msg.xml : null
          if (value) syncedRef.current = value
          if (resolve) resolve(value)
        }
      }

      // 先挂监听再插 iframe: 否则命中缓存时 init 可能早于监听注册
      window.addEventListener('message', onMessage)
      readyRef.current = false
      exportResolveRef.current = null
      syncedRef.current = ''
      setReady(false)
      setFailed(false)

      const frame = document.createElement('iframe')
      frame.title = editable ? 'draw.io 路线图编辑器' : 'draw.io 路线图'
      frame.src = src
      frame.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads',
      )
      frame.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#fff;'
      frameRef.current = frame
      host.appendChild(frame)

      return () => {
        cancelled = true
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        frameRef.current = null
        readyRef.current = false
        exportResolveRef.current = null
        frame.remove()
      }
    }, [src, retryKey, post, editable])

    // 外部传入的新数据(如「重新生成」): 内容确有变化时才覆盖编辑器
    useEffect(() => {
      if (!ready) return
      const next = isDiagramXml(xml) ? wrapDiagramXml(xml as string) : ''
      if (!next || next === syncedRef.current) return
      syncedRef.current = next
      post({ action: 'load', xml: next, autosave: 0 })
    }, [ready, xml, post])

    return (
      <div className={cn('relative overflow-hidden rounded-xl border bg-card', className)} style={{ height }}>
        <div ref={hostRef} className="h-full w-full" />

        {!ready && !failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            正在加载 draw.io…
          </div>
        )}

        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-6 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <p className="text-sm text-muted-foreground">
              draw.io 编辑器加载超时，可能是网络无法访问 embed.diagrams.net。
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRetryKey((v) => v + 1)}
            >
              <RotateCw className="mr-1 h-3.5 w-3.5" />
              重新加载
            </Button>
          </div>
        )}
      </div>
    )
  }),
)
