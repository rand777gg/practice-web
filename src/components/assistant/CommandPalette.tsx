/**
 * 输入框里打了「/」之后的候选列表。
 *
 * 只有四种指令, 所以不做模糊搜索也不做分组 —— 要的是"我现在有哪些能用的"一眼看完。
 * 键盘上下选择与补全在 AssistantChat 里处理, 这里只负责画。
 */
import { CornerDownLeft } from 'lucide-react'
import type { CommandSpec } from '@/lib/assistant-commands'
import { cn } from '@/lib/utils'

export function CommandPalette({ commands, activeIndex, onPick }: {
  commands: CommandSpec[]
  activeIndex: number
  onPick: (command: CommandSpec) => void
}) {
  if (commands.length === 0) return null
  return (
    <div className="overflow-hidden rounded-lg border bg-popover shadow-lg">
      {commands.map((cmd, i) => (
        <button
          key={cmd.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onPick(cmd) }}
          className={cn(
            'flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors',
            i === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
          )}
        >
          <span className="shrink-0 font-mono text-[11px] font-medium">/{cmd.name}</span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{cmd.summary}</span>
          {i === activeIndex && <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </button>
      ))}
    </div>
  )
}
