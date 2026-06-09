import { useMemo, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import { useSettingsStore } from '@/stores/settings-store'

interface Props {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: Props) {
  const codeTheme = useSettingsStore((s) => s.codeTheme)

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
    // Images from R2 or other sources
    img({ src, alt, ...props }: any) {
      if (!src) return null
      return (
        <img
          src={src}
          alt={alt || ''}
          className="rounded-lg max-w-full h-auto my-2"
          loading="lazy"
          {...props}
        />
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
      <ReactMarkdown rehypePlugins={[rehypeRaw]} components={components}>
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
      <pre className="my-2 rounded-lg bg-muted p-3 overflow-x-auto text-xs">
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="my-2 rounded-lg overflow-hidden [&_pre]:!bg-muted/70 [&_pre]:p-3 [&_pre]:overflow-x-auto [&_code]:text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
