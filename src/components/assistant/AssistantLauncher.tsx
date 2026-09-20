/**
 * 小Q 的悬浮入口。面板收起时才有它 —— 面板展开时再挂一个按钮, 除了挡住正文没有别的用。
 *
 * 底色用主题色而不是 ai-ring: ai-ring 是那圈彩虹流光(conic-gradient), 而且它是 index.css 里
 * 的无层级规则, 会盖掉任何 bg-* 工具类 —— 挂上去的结果是整个胶囊自己变成跑马灯。
 */
import { MessageCircleQuestion } from 'lucide-react'
import { useAssistantStore } from '@/stores/assistant-store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function AssistantLauncher() {
  const open = useAssistantStore((s) => s.open)
  const setOpen = useAssistantStore((s) => s.setOpen)
  if (open) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="问问小Q"
          className="fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-full bg-primary p-1.5 pr-3 text-primary-foreground shadow-xl shadow-primary/25 transition-transform hover:scale-[1.03] xl:bottom-6 xl:right-6"
        >
          <img src="/littleq.webp" alt="" aria-hidden="true" className="h-8 w-8 rounded-full object-cover" />
          <span className="text-xs font-medium">问小Q</span>
          <MessageCircleQuestion className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">不用离开当前页面，直接问文献/题库里的知识点</TooltipContent>
    </Tooltip>
  )
}
