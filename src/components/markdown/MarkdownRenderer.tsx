import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkMath from 'remark-math'
import rehypeMathjax from 'rehype-mathjax'
import { useSettingsStore } from '@/stores/settings-store'
import { useThemeStore } from '@/stores/theme-store'
import { langDisplay } from '@/lib/lang-names'
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
    // Images — resizable + alignment tools when onImageAction is provided
    img({ src, alt, title, ...props }: any) {
      if (!src) return null
      if (onImageActionRef.current) {
        return <ResizableImage src={src} alt={alt || ''} title={title} onAction={onImageActionRef.current} />
      }
      return (
        <span className="markdown-preview-img-wrap rounded-lg border-2 border-transparent hover:border-primary/30 transition-colors block">
          <img src={src} alt={alt || ''} className="rounded-lg" loading="lazy" {...props} />
        </span>
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
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className || ''}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeRaw, rehypeMathjax]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

// Lazy Shiki highlighter — loaded once and cached
let _highlighter: any = null
let _highlighterLoading: Promise<any> | null = null

async function getHighlighter() {
  if (_highlighter) return _highlighter
  if (_highlighterLoading) return _highlighterLoading

  _highlighterLoading = (async () => {
    const { createHighlighter } = await import('shiki')
    const hl = await createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: [
        'javascript', 'typescript', 'jsx', 'tsx', 'css', 'html', 'json',
        'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust',
        'sql', 'bash', 'shell', 'yaml', 'xml', 'markdown',
        'latex', 'r', 'swift', 'kotlin', 'dart', 'ruby', 'php',
        'scala', 'haskell', 'lua', 'text',
      ],
    })
    _highlighter = hl
    return hl
  })()
  return _highlighterLoading
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

// ── Shiki code highlighter ───────────────────────────────────────────
function CodeBlock({ lang, code, theme }: { lang: string; code: string; theme: string }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getHighlighter().then(async (hl) => {
      if (cancelled) return
      try {
        // Load theme on demand if not already loaded
        const loaded = await hl.getLoadedThemes()
        if (!loaded.includes(theme)) {
          await hl.loadTheme(theme)
        }
        const h = hl.codeToHtml(code, { lang, theme })
        setHtml(h)
      } catch {
        setHtml(`<pre><code>${escapeHtml(code)}</code></pre>`)
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
        <pre className="rounded-lg bg-muted p-3 pt-7 overflow-x-auto text-xs">
          <code>{code}</code>
        </pre>
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

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
