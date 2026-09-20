/**
 * /skill、/export、/help 的回执卡片。
 *
 * 合成一个文件: 三个都很薄, 放在一起比拆三个文件更容易看出"指令的产物长什么样"这件事。
 */
import { Download, FileArchive, GraduationCap, Power, Sparkles, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAssistantStore } from '@/stores/assistant-store'
import { ASSISTANT_COMMANDS, type ExportMeta, type SkillMeta } from '@/lib/assistant-commands'
import { cn } from '@/lib/utils'

export function SkillCard({ meta }: { meta: SkillMeta }) {
  const send = useAssistantStore((s) => s.send)
  const active = meta.action === 'set'
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]',
      active ? 'border-primary/30 bg-primary/5' : 'bg-muted/40 text-muted-foreground',
    )}>
      <GraduationCap className={cn('h-3 w-3', active ? 'text-primary' : 'text-muted-foreground')} />
      {meta.action === 'list'
        ? <span>技能列表（当前{meta.skillId ? `已启用 ${meta.skillId}` : '没有启用技能'}）</span>
        : active
          ? <span>已启用技能：<span className="font-medium">{meta.skillTitle}</span></span>
          : <span>已关闭技能</span>}
      {active && (
        <Button
          size="sm" variant="ghost" className="ml-auto h-6 gap-1 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => void send('/skill off')}
        >
          <Power className="h-3 w-3" />
          关掉
        </Button>
      )}
    </div>
  )
}

export function ExportCard({ meta }: { meta: ExportMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
      <FileArchive className="h-3 w-3" />
      <span className="font-mono text-[10px]">{meta.filename}</span>
      <Badge variant="secondary" className="border-transparent text-[9px] font-normal">
        {Math.max(1, Math.round(meta.bytes / 1024))} KB · {meta.turns} 条消息
      </Badge>
      <span className="flex items-center gap-1"><Download className="h-3 w-3" />已存到浏览器下载目录</span>
    </div>
  )
}

/**
 * /help 和"用了不存在的指令"共用这张卡 —— 后者的重点其实也是"你能用哪些",
 * 没必要为它单独写一套提示。
 */
export function HelpCard({ onPickCommand }: { onPickCommand: (command: string) => void }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-primary/20 bg-background/70 p-2">
      <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Terminal className="h-2.5 w-2.5" />
        小Q 指令
      </p>
      {ASSISTANT_COMMANDS.map((cmd) => (
        <div key={cmd.id} className="flex items-start gap-2">
          <Button
            size="sm" variant="outline" className="h-6 shrink-0 font-mono text-[10px]"
            onClick={() => onPickCommand(`/${cmd.name} `)}
          >
            <Sparkles className="mr-1 h-2.5 w-2.5" />
            /{cmd.name}
          </Button>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[11px] leading-tight">{cmd.summary}</p>
            <p className="font-mono text-[9px] text-muted-foreground">{cmd.usage}</p>
          </div>
        </div>
      ))}
      <p className="pt-0.5 text-[10px] text-muted-foreground">
        在输入框里打 <span className="font-mono">/</span> 会弹出候选；↑↓ 选择，Tab 补全，Enter 发送。
      </p>
    </div>
  )
}
