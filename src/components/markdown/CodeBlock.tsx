import { useEffect, useState } from 'react'

import { highlightCode } from '@/lib/shiki-highlight'

/**
 * MinerU 区块里的代码块(code / code_body / algorithm)。
 *
 * 上色本身在 @/lib/shiki-highlight 里(整篇视图的 markdown 代码块共用同一套按需高亮器),
 * 这里只负责: 上色前先原样显示代码(同一段文字、同样的换行, 所以不会有跳动), 语言取 MinerU 给的
 * guess_lang / code_language, 认不出来就按纯文本。
 */
export function CodeBlock({ code, lang, className }: {
  code: string
  lang?: string | null
  className?: string
}) {
  const [html, setHtml] = useState<string | null>(null)
  const text = code.replace(/\s+$/, '')

  useEffect(() => {
    if (!text) return
    let cancelled = false
    highlightCode(text, lang)
      .then((out) => { if (!cancelled) setHtml(out) })
      .catch(() => { /* 上色失败就保持纯文本 —— 代码本身还是要看得见 */ })
    return () => { cancelled = true }
  }, [text, lang])

  if (!html) {
    return (
      <pre className={className}>
        <code>{text}</code>
      </pre>
    )
  }
  return (
    <div
      className={`${className ?? ''} [&>pre]:m-0 [&>pre]:bg-transparent [&>pre]:p-0`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
