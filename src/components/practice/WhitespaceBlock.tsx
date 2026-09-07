import { cn } from '@/lib/utils'

/** 行尾空格显示成 `·` 的等宽块,保留换行与空行。用于看清单测的输入/期望/实际输出里的尾部空白。 */
export function WhitespaceBlock({ text, className, dim = true }: { text: string; className?: string; dim?: boolean }) {
  const lines = (text ?? '').split('\n').map((line) => line.replace(/[ \t]+$/, (m) => m.replace(/ /g, '·').replace(/\t/g, '·')))
  return (
    <pre
      className={cn(
        'whitespace-pre-wrap break-words font-mono text-xs leading-relaxed',
        dim ? 'text-muted-foreground' : 'text-foreground',
        className,
      )}
    >
      {lines.map((line, i) => (
        <span key={i} className="block">
          {line || '\u00A0'}
        </span>
      ))}
    </pre>
  )
}
