import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { useSettingsStore } from '@/stores/settings-store'
import { useThemeStore } from '@/stores/theme-store'
import { langDisplay } from '@/lib/lang-names'

interface Props {
  content: string
  className?: string
  onImageAction?: (action: 'left' | 'center' | 'right', src: string) => void
}

function ResizableImage({ src, alt, onAction }: { src: string; alt: string; onAction?: (action: 'left' | 'center' | 'right', src: string) => void }) {
  const [showTools, setShowTools] = useState(false)
  const [align, setAlign] = useState<'left' | 'center' | 'right' | null>(null)

  const handleAlign = useCallback((a: 'left' | 'center' | 'right') => {
    setAlign(a)
    setShowTools(false)
    onAction?.(a, src)
  }, [onAction, src])

  const alignClass = align === 'center' ? 'mx-auto' : align === 'right' ? 'ml-auto' : ''

  // Click outside to dismiss
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowTools((v) => !v)
  }

  return (
    <div className="relative my-2" onMouseLeave={() => setShowTools(false)}>
      <span className={`markdown-preview-img-wrap rounded-lg border-2 border-transparent hover:border-primary/30 transition-colors block ${alignClass}`}>
        <img src={src} alt={alt || ''} className="rounded-lg cursor-pointer" loading="lazy" onClick={handleClick} />
      </span>
      {showTools && (
        <div className="absolute top-0 left-0 z-10 flex gap-0.5 bg-background border rounded-lg shadow-md p-1 -translate-y-full -mt-1">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} type="button"
              className={`px-2 py-1 text-[10px] rounded border border-dashed transition-colors ${
                align === a
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-blue-300 dark:border-blue-700 text-muted-foreground hover:border-primary hover:text-primary'
              }`}
              onClick={(e) => { e.stopPropagation(); handleAlign(a) }}
              title={`${a === 'left' ? '靠左' : a === 'center' ? '居中' : '靠右'}`}
            >
              {a === 'left' ? '⬅' : a === 'center' ? '⬆' : '➡'}
            </button>
          ))}
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
      const inline = !match
      if (inline) {
        return (
          <code className="px-1 py-0.5 rounded text-[0.85em] bg-muted font-mono" {...props}>
            {children}
          </code>
        )
      }
      const lang = match[1]
      const text = String(children).replace(/\n$/, '')
      return <CodeBlock lang={lang} code={text} theme={codeTheme} />
    },
    // Images — resizable + alignment tools when onImageAction is provided
    img({ src, alt, ...props }: any) {
      if (!src) return null
      if (onImageActionRef.current) {
        return <ResizableImage src={src} alt={alt || ''} onAction={onImageActionRef.current} />
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
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} components={components}>
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
