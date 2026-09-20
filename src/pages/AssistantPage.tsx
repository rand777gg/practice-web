import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, GraduationCap, HeartHandshake, History, MessageSquarePlus, ShieldCheck,
  Sparkles, TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LittleQAvatar } from '@/components/assistant/LittleQAvatar'
import { AssistantChat } from '@/components/assistant/AssistantChat'
import { ConversationList } from '@/components/assistant/ConversationList'
import { DemoBadge } from '@/components/topics/TopicSidebar'
import { hasAiConfig } from '@/lib/ai/config'
import { useAssistantStore } from '@/stores/assistant-store'

export function Component() {
  const emotion = useAssistantStore((s) => s.emotion)
  const typing = useAssistantStore((s) => s.sending)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const startNewConversation = useAssistantStore((s) => s.startNewConversation)
  const loadConversations = useAssistantStore((s) => s.loadConversations)
  const conversationsLoaded = useAssistantStore((s) => s.conversationsLoaded)
  const activeId = useAssistantStore((s) => s.activeId)
  const conversations = useAssistantStore((s) => s.conversations)
  const [historyOpen, setHistoryOpen] = useState(false)

  // 这一页本身就装着对话, 再挂一个悬浮面板会出现两份一样的对话
  useEffect(() => { setOpen(false) }, [setOpen])

  useEffect(() => {
    if (!conversationsLoaded) {
      void loadConversations()
      return
    }
    // 列表拿到之后再判断"上次那条还在不在", 顺序反了会把已被删掉的会话又接回来
    const { activeId: id, messages, openConversation } = useAssistantStore.getState()
    if (id && messages.length === 0) void openConversation(id)
  }, [conversationsLoaded, loadConversations])

  const title = conversations.find((c) => c.id === activeId)?.title ?? '新会话'

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative inline-flex rounded-full bg-primary p-[2px]">
          <img src="/littleq.webp" alt="" aria-hidden="true" className="h-11 w-11 rounded-full object-cover" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            小Q
            {!hasAiConfig() && <DemoBadge />}
          </h1>
          <p className="text-sm text-muted-foreground">
            备考心理陪伴 + 基于平台文献、题库与专题的专业课答疑
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,268px)_minmax(0,1fr)]">
        <div className="order-2 space-y-5 lg:order-1">
          <Card className="flex h-[380px] flex-col overflow-hidden py-0">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="flex-1 text-xs font-medium">会话记录</p>
              <span className="text-[10px] text-muted-foreground">
                {conversations.length > 0 ? `${conversations.length} 个` : ''}
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <ConversationList />
            </div>
          </Card>

          <Card className="overflow-hidden py-0">
            <div className="relative">
              <LittleQAvatar className="h-[260px]" emotion={emotion} typing={typing} />
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full border bg-background/80 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur">
                <span className={typing ? 'h-1.5 w-1.5 animate-pulse rounded-full bg-primary' : 'h-1.5 w-1.5 rounded-full bg-emerald-500'} />
                {typing ? '正在组织语言…' : '在听你说'}
              </div>
            </div>
            <p className="border-t px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
              立绘会跟着鼠标移动视线，也会随对话切换情绪；说话的是右边那个对话框。
            </p>
          </Card>
        </div>

        <Card className="order-1 flex h-[640px] flex-col overflow-hidden py-0 lg:order-2">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
            <Button
              size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-[11px] lg:hidden"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <History className="h-3 w-3" />
              {historyOpen ? '回到对话' : '会话记录'}
            </Button>
            <Button
              size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-[11px]"
              onClick={startNewConversation}
            >
              <MessageSquarePlus className="h-3 w-3" />
              新会话
            </Button>
          </div>

          <div className="min-h-0 flex-1">
            {historyOpen && (
              <div className="h-full lg:hidden"><ConversationList /></div>
            )}
            <div className={historyOpen ? 'hidden lg:block lg:h-full' : 'h-full'}>
              <AssistantChat variant="page" />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">小Q能做什么</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-1">
            <div className="flex gap-2.5">
              <HeartHandshake className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div>
                <p className="text-xs font-medium">备考心理陪伴</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  焦虑、拖延、失眠、与人比较、二战压力、想放弃——用结构化提问帮你把情绪落到可执行的一步。
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium">专业课答疑</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  先跨来源检索文献、题库、知识点解读与公开笔记，再据此作答，并标出依据来源。
                  文献引用可以点「看原文」直接落到那一页那一段。
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <Link to="/topics" className="mt-0.5 inline-flex shrink-0 text-primary" aria-label="前往专业专题">
                <GraduationCap className="h-4 w-4" />
              </Link>
              <div>
                <p className="text-xs font-medium">转接到专题</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  问到某门课时，小Q引用的题库都能在
                  <Link to="/topics" className="mx-0.5 text-primary hover:underline">
                    专业专题
                  </Link>
                  里找到并直接练习。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              边界说明
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-1 text-[11px] leading-relaxed text-muted-foreground">
            <p>· 小Q不是真人，也不是心理咨询师，回答基于固定规则与平台资料，可能出错。</p>
            <p>· 涉及专业课结论请以教材与真题为准，小Q给出的解析只作为思路提示。</p>
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              如果情绪低落、失眠或进食异常持续两周以上，请务必联系学校心理中心或专业机构，不要只依赖这里。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              关于这个形象与记录
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-1 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              左侧的小Q是平台品牌立绘
              <span className="mx-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">littleq.webp</span>
              ：会呼吸、会跟着鼠标移动视线，情绪也会随对话换成不同的姿态与色温。
            </p>
            <p>
              {hasAiConfig()
                ? '对话由真实模型按人格提示词生成，仍可能出错，别当结论用。'
                : '对话目前由内置剧本驱动，未接入真实模型。'}
            </p>
            <p>
              会话记录保存在你的账号下（只有你能看到），换设备或清缓存都还在；
              左边的会话列表和任何页面右下角的小Q 面板共用同一份记录。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
