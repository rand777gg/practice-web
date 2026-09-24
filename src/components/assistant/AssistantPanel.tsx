/**
 * 全局小Q 面板 —— 在任何登录后的页面都能唤起, 不用跳到 /assistant。
 *
 * 停靠而不是弹窗: 大屏时内容区自己让出宽度(见 AppLayout 的 padding), 面板不压住正文,
 * 所以可以一边看文献/刷题一边问; 小屏才退化成整屏浮层, 那时点引用跳转会把面板收起来。
 */
import { useEffect } from 'react'
import { History, MessageSquarePlus, MessagesSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssistantChat } from '@/components/assistant/AssistantChat'
import { ConversationList } from '@/components/assistant/ConversationList'
import { useAssistantStore } from '@/stores/assistant-store'
import { Separator } from '@/components/ui/separator'

export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open)
  const view = useAssistantStore((s) => s.view)
  const setView = useAssistantStore((s) => s.setView)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const startNewConversation = useAssistantStore((s) => s.startNewConversation)
  const activeId = useAssistantStore((s) => s.activeId)
  const conversations = useAssistantStore((s) => s.conversations)
  const questionScope = useAssistantStore((s) => s.questionScope)
  const error = useAssistantStore((s) => s.error)
  const clearError = useAssistantStore((s) => s.clearError)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  // 题目会话不在 conversations 里(它属于某道题), 找不到时按"本题解释"显示, 而不是"新会话"
  const title = conversations.find((c) => c.id === activeId)?.title
    ?? (questionScope ? '本题解释' : '新会话')

  return (
    <>
      {/* 小屏是整屏浮层, 给一个点一下就能收起的背景 */}
      <div
        className="fixed inset-0 z-30 bg-black/20 lg:hidden"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-2xl lg:w-[400px]"
        aria-label="小Q 助手"
      >
        <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <span className="relative inline-flex shrink-0 rounded-full bg-primary p-[2px]">
            <img src="/littleq.webp" alt="" aria-hidden="true" className="h-7 w-7 rounded-full object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{view === 'history' ? '会话记录' : title}</p>
            <p className="text-[10px] text-muted-foreground">备考搭子<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />基于平台资料作答</p>
          </div>
          <Button
            size="icon" variant="ghost" className="h-7 w-7 shrink-0"
            onClick={() => { startNewConversation() }} aria-label="新会话" title="新会话"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-7 w-7 shrink-0"
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
            aria-label={view === 'history' ? '回到对话' : '会话记录'}
            title={view === 'history' ? '回到对话' : '会话记录'}
          >
            {view === 'history' ? <MessagesSquare className="h-4 w-4" /> : <History className="h-4 w-4" />}
          </Button>
          <Button
            size="icon" variant="ghost" className="h-7 w-7 shrink-0"
            onClick={() => setOpen(false)} aria-label="关闭" title="关闭 (Esc)"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {error && (
          <button
            type="button"
            onClick={clearError}
            className="shrink-0 border-b bg-destructive/10 px-3 py-1.5 text-left text-[11px] text-destructive"
          >
            {error}（点一下关掉）
          </button>
        )}

        <div className="min-h-0 flex-1">
          {view === 'history' ? <ConversationList /> : <AssistantChat variant="panel" />}
        </div>
      </aside>
    </>
  )
}
