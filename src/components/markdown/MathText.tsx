/**
 * 数学公式 —— 本地 KaTeX 渲染, 不走 CDN。
 *
 * 为什么需要它: MinerU 解析出来的公式块(block_type = interline_equation / inline_equation)
 * 里存的是**裸 LaTeX**, 没有 `$` 定界符 —— 实测一篇文献 45 个含 \frac 的块里 0 个带 `$`。
 * remark-math 和 MathJax 都要求定界符, 所以它们压根不认得这些公式, 直接当普通文本显示,
 * 看到的就是 "\mathrm{SO} _ {2} = \frac {...}" 这种字面串。
 *
 * 另外 MathJax 是从 jsdelivr 拉脚本再异步 typeset 的: 首次要等网络, 拿不到就整页都没有公式。
 * KaTeX 是本地依赖, 同步出 HTML, 既没有这个依赖也没有那次异步排版。
 */
import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
// 化学式 \ce{} 支持(mhchem), 教材里常有
import 'katex/contrib/mhchem'

interface Props {
  tex: string
  /** 独占一行的公式(块级)用 true, 行内公式留 false */
  display?: boolean
  className?: string
}

export function MathText({ tex, display = false, className }: Props) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        // 不认识的命令渲染成红色而不是抛错: 解析产物里难免有 KaTeX 不支持的写法,
        // 整块报错会连公式带正文一起消失
        errorColor: '#dc2626',
        strict: false,
        trust: false,
      })
    } catch {
      return null
    }
  }, [tex, display])

  // 渲染不出来就退回原文 —— 宁可看到 LaTeX 源码, 也别看到空白
  if (!html) return <span className={className}>{tex}</span>

  return (
    <span
      className={className}
      // KaTeX 输出的是受控 HTML(它自己生成的 span/katex 结构), 且 trust: false 关掉了 \href 一类的注入面
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
