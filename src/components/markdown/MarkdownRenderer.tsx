import { useMemo, useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { PluggableList } from 'unified'
import { X, ZoomIn } from 'lucide-react'
import 'katex/dist/katex.min.css'
import 'katex/contrib/mhchem'

// Video player chunk is only fetched when a <video> appears in the markdown
const MarkdownVideo = lazy(() => import('./MarkdownVideo'))
import { useSettingsStore } from '@/stores/settings-store'
import { useThemeStore } from '@/stores/theme-store'
import { langDisplay } from '@/lib/lang-names'
import { highlightCode } from '@/lib/shiki-highlight'
import { cn } from '@/lib/utils'

interface Props {
  content: string
  className?: string
  onImageAction?: (action: 'left' | 'center' | 'right', src: string) => void
}

function parseAlignFromTitle(title?: string): 'left' | 'center' | 'right' | null {
  if (!title) return null
  const m = title.match(/align:(left|center|right)/)
  return m ? (m[1] as 'left' | 'center' | 'right') : null
}

function ResizableImage({ src, alt, title, onAction }: { src: string; alt: string; title?: string; onAction?: (action: 'left' | 'center' | 'right', src: string) => void }) {
  const [align, setAlign] = useState<'left' | 'center' | 'right' | null>(() => parseAlignFromTitle(title))
  const [dragOverZone, setDragOverZone] = useState<'left' | 'center' | 'right' | null>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlign(parseAlignFromTitle(title))
  }, [title])

  const handleAlign = useCallback((a: 'left' | 'center' | 'right') => {
    setAlign(a)
    onAction?.(a, src)
  }, [onAction, src])

  const handleDragStart = (e: React.DragEvent<HTMLImageElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setDragOverZone(null)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, zone: 'left' | 'center' | 'right') => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverZone(zone)
  }

  const handleDragLeave = () => setDragOverZone(null)

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, zone: 'left' | 'center' | 'right') => {
    e.preventDefault()
    setDragOverZone(null)
    setIsDragging(false)
    handleAlign(zone)
  }

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    if (el.offsetWidth && el.offsetHeight) {
      setImgSize({ w: el.offsetWidth, h: el.offsetHeight })
    }
  }

  const justifyClass = align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
  const zoneH = imgSize ? imgSize.h : 120

  return (
    <div className="relative my-2 w-full">
      <div className={`flex w-full ${justifyClass}`}>
        <span className="markdown-preview-img-wrap rounded-lg border-2 border-transparent hover:border-primary/30 transition-colors">
          <img
            src={src}
            alt={alt || ''}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onLoad={handleImgLoad}
            className="rounded-lg cursor-grab active:cursor-grabbing"
            loading="lazy"
          />
        </span>
      </div>
      {isDragging && (
        <div className="flex gap-1.5 mt-1.5 w-full" style={{ height: zoneH }}>
          {(['left', 'center', 'right'] as const).map((zone) => {
            const isActive = align === zone
            const isOver = dragOverZone === zone
            return (
              <div
                key={zone}
                onDragOver={(e) => handleDragOver(e, zone)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, zone)}
                style={{ flex: '1 1 0', height: zoneH, minWidth: 0 }}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-md border-2 border-dashed cursor-pointer select-none transition-all duration-150 overflow-hidden',
                  isActive && !isOver && 'border-blue-400 bg-blue-50 dark:bg-blue-950/30',
                  isOver && 'border-blue-500 bg-blue-100 dark:bg-blue-900/40 scale-[0.98]',
                  !isActive && !isOver && 'border-muted-foreground/30 hover:border-blue-300 hover:bg-muted/40',
                )}
              >
                {isActive ? (
                  <img
                    src={src}
                    alt={alt || ''}
                    className="max-h-full max-w-full rounded object-contain"
                  />
                ) : (
                  <span className="text-[11px] font-medium text-muted-foreground/70 pointer-events-none">
                    {{ left: '靠左', center: '居中', right: '靠右' }[zone]}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function MarkdownRenderer({ content, className, onImageAction }: Props) {
  const darkCodeTheme = useSettingsStore((s) => s.darkCodeTheme)
  const lightCodeTheme = useSettingsStore((s) => s.lightCodeTheme)
  const siteTheme = useThemeStore((s) => s.theme)
  const codeTheme = siteTheme === 'dark' ? darkCodeTheme : lightCodeTheme

  const onImageActionRef = useRef(onImageAction)
  useEffect(() => { onImageActionRef.current = onImageAction }, [onImageAction])

  const containerRef = useRef<HTMLDivElement>(null)

  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!zoomedSrc) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomedSrc(null) }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [zoomedSrc])

  /*
   * 公式交给本地的 rehype-katex 排版。
   *
   * 原来是从 cdn.jsdelivr.net 拉 MathJax 脚本, 再异步 typesetPromise —— 首次要等网络, 拿不到就
   * 整篇一个公式都不显示; 而且那之前公式已经被插件换成裸 \(...\) 文本, 用户看到的是定界符本身。
   * KaTeX 是本地依赖, 渲染在构建好的 HTML 里, 既没有网络依赖也没有那次异步排版。
   */
  // PluggableList 是显式标注: 不标的话 [plugin, options] 这种元组会被推断成联合数组, 对不上类型
  const rehypePlugins = useMemo<PluggableList>(
    () => [rehypeRaw, [rehypeKatex, { throwOnError: false, errorColor: '#dc2626', strict: false }]],
    [],
  )

  const components = useMemo(() => ({
    // Inline code
    code({ className: cls, children, ...props }: any) {
      const match = /language-(\w+)/.exec(cls || '')
      const lang = match?.[1]
      const inline = !match
      if (inline) {
        return (
          <code className="px-1 py-0.5 rounded text-[0.85em] bg-muted font-mono" {...props}>
            {children}
          </code>
        )
      }
      const text = String(children).replace(/\n$/, '')
      if (lang === 'mermaid') return <MermaidBlock code={text} />
      if (lang === 'plantuml') return <PlantUMLBlock code={text} />
      return <CodeBlock lang={lang || 'text'} code={text} theme={codeTheme} />
    },
    // Images — click to zoom, with alignment tools when onImageAction is provided
    img({ src, alt, title, ...props }: any) {
      if (!src) return null
      if (onImageActionRef.current) {
        return (
          <div className="relative group/image">
            <ResizableImage src={src} alt={alt || ''} title={title} onAction={onImageActionRef.current} />
            <button
              type="button"
              onClick={() => setZoomedSrc(src)}
              className="absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-white opacity-0 group-hover/image:opacity-100 transition-opacity"
              title="放大查看"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      }
      return (
        <span className="markdown-preview-img-wrap rounded-lg border-2 border-transparent hover:border-primary/30 transition-colors block relative group/image cursor-pointer" onClick={() => setZoomedSrc(src)}>
          <img src={src} alt={alt || ''} className="rounded-lg" loading="lazy" {...props} />
          <span className="absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-white opacity-0 group-hover/image:opacity-100 transition-opacity">
            <ZoomIn className="h-3.5 w-3.5" />
          </span>
        </span>
      )
    },
    // Raw HTML <video> — R2-hosted MP4/WebM rendered with a styled player
    video({ src, poster, title }: any) {
      if (!src) return null
      return (
        <Suspense fallback={
          <div className="my-2 flex h-40 items-center justify-center rounded-xl border bg-muted/30 text-xs text-muted-foreground">视频加载中…</div>
        }>
          <MarkdownVideo src={String(src)} poster={poster ? String(poster) : undefined} title={title ? String(title) : undefined} />
        </Suspense>
      )
    },
    // Links open in new tab
    a({ href, children, ...props }: any) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...props}>
          {children}
        </a>
      )
    },
    // Better looking tables
    table({ children, ...props }: any) {
      return (
        <div className="overflow-x-auto my-2">
          <table className="min-w-full border-collapse border text-sm" {...props}>
            {children}
          </table>
        </div>
      )
    },
    th({ children, ...props }: any) {
      return <th className="border bg-muted px-3 py-1.5 text-left font-medium" {...props}>{children}</th>
    },
    td({ children, ...props }: any) {
      return <td className="border px-3 py-1.5" {...props}>{children}</td>
    },
    // Blockquotes
    blockquote({ children, ...props }: any) {
      return <blockquote className="border-l-3 border-muted-foreground/30 pl-3 my-2 italic text-muted-foreground" {...props}>{children}</blockquote>
    },
  } as any), [codeTheme])

  if (!content) return null

  return (
    <>
      <div ref={containerRef} className={`prose prose-sm dark:prose-invert max-w-none ${className || ''}`}>
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={rehypePlugins} components={components}>
          {content}
        </ReactMarkdown>
      </div>

      {zoomedSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in-0"
          onClick={() => setZoomedSrc(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedSrc(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={zoomedSrc}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// ── Shiki code highlighter ───────────────────────────────────────────
function CodeBlock({ lang, code, theme }: { lang: string; code: string; theme: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // 主题名来自设置项(用户可改), 高亮器按需加载语言与主题, 见 @/lib/shiki-highlight
    highlightCode(code, lang, { theme })
      .then((h) => { if (!cancelled) setHtml(h) })
      .catch(() => {
        if (!cancelled) {
          setHtml(`<div class="rounded-lg bg-muted p-3 overflow-x-auto"><code class="text-xs">${escapeHtml(code)}</code></div>`)
        }
      })
    return () => { cancelled = true }
  }, [lang, code, theme])

  if (!html) {
    return (
      <div className="relative my-2">
        <span className="absolute top-2 right-2.5 text-[10px] text-muted-foreground/60 font-mono z-10 pointer-events-none">
          {langDisplay(lang)}
        </span>
        <div className="rounded-lg bg-muted p-3 pt-7 overflow-x-auto text-xs">
          <pre className="text-xs">{code}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="relative my-2">
      <span className="absolute top-2 right-2.5 text-[10px] text-muted-foreground/60 font-mono z-10 pointer-events-none">
        {langDisplay(lang)}
      </span>
      <div
        className="rounded-lg overflow-hidden [&_pre]:!bg-muted/70 [&_pre]:p-3 [&_pre]:pt-7 [&_pre]:overflow-x-auto [&_code]:text-xs"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

// ── Mermaid diagram renderer ─────────────────────────────────────────
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    setSvg(null)
    setErr(null)
    let cancelled = false
    ;(async () => {
      try {
        const mermaid = await import('mermaid')
        mermaid.default.initialize({ startOnLoad: false, theme: 'default' })
        const id = `mermaid-${Math.random().toString(36).slice(2, 8)}`
        const { svg: s } = await mermaid.default.render(id, code)
        if (!cancelled && mountedRef.current) setSvg(s)
      } catch (e) {
        if (!cancelled && mountedRef.current) setErr(e instanceof Error ? e.message : 'Mermaid error')
      }
    })()
    return () => { cancelled = true; mountedRef.current = false }
  }, [code])

  if (err) return <pre className="text-xs text-red-500 p-2 rounded bg-red-50 dark:bg-red-950">{err}</pre>
  if (!svg) return <div className="h-20 bg-muted/30 rounded animate-pulse" />
  return <div className="my-2 flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

// ── PlantUML renderer (via kroki.io) ────────────────────────────────
function PlantUMLBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvg(null); setErr(null)
    ;(async () => {
      try {
        const { encode } = await import('plantuml-encoder')
        const encoded = encode(code)
        const res = await fetch(`https://www.plantuml.com/plantuml/svg/${encoded}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        if (!cancelled) setSvg(text)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'PlantUML error')
      }
    })()
    return () => { cancelled = true }
  }, [code])

  if (err) return <pre className="text-xs text-red-500 p-2 rounded bg-red-50 dark:bg-red-950">{err}</pre>
  if (!svg) return <div className="h-20 bg-muted/30 rounded animate-pulse" />
  return <div className="my-2 flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
