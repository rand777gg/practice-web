import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { SessionInfo } from '@/stores/sequential-store'

/**
 * 顺序刷题的会话列表抽屉（纯展示）。
 *
 * 从 PracticeSession.tsx 里整块搬出来的：它原来是页面 JSX 里的一段，一边渲染列表一边直接
 * 读 `useAuthStore.getState()`、调 `seqSwitchSession` / `loadSequentialQuestion` /
 * `saveCurrentSession`，还伸手到 `kpToSubjectRef` 里查学科。结果是"这个列表长什么样"和
 * "点一下要发生什么"缠在一起，改前者必须读懂后者。
 *
 * 现在这里只认数据和回调：学科归属由调用方算好（`subjectOfKp`），点击只发出 `onPick`／
 * `onNew`／`onDelete`。要在别处复用或单独渲染它都成立了。
 */
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobile: boolean
  /** 只有顺序刷题模式才列出会话 */
  visible: boolean
  sessions: SessionInfo[]
  /** sessionKey → 本轮已作答题数；拿不到就是 null（界面显示"统计中…"） */
  answeredBySession: Map<string, number> | null
  activeSessionKey: string
  /** 知识点 → 学科；用来在每行上汇总学科分布 */
  subjectOfKp: (kp: string) => string | undefined
  onNew: () => void
  onPick: (sessionKey: string) => void | Promise<void>
  onDelete: (sessionKey: string) => void
}

export function SessionListDrawer({
  open,
  onOpenChange,
  isMobile,
  visible,
  sessions,
  answeredBySession,
  activeSessionKey,
  subjectOfKp,
  onNew,
  onPick,
  onDelete,
}: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction={isMobile ? 'bottom' : 'right'}>
      <DrawerContent className={isMobile ? '' : '!inset-y-0 !right-0 !left-auto !top-0 !mt-0 !h-full w-[400px] max-w-[85vw] !rounded-l-[10px] !rounded-t-none'}>
        <DrawerHeader>
          <DrawerTitle>刷题会话</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 scroll-fade overflow-y-auto p-4">
          {visible && (
            <>
              <div className="flex items-center justify-end mb-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onNew}>
                  <Plus className="h-3 w-3 mr-1" />新建
                </Button>
              </div>
              {sessions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">暂无会话</p>
              ) : (
                <div className="space-y-1.5">
                  {sessions.map((s) => {
                    const total = s.questionIds.length
                    const answered = answeredBySession?.get(s.sessionKey)
                    const progress = answered != null && total > 0 ? Math.min(Math.round((answered / total) * 100), 100) : 0
                    const isActive = s.sessionKey === activeSessionKey
                    const subjCounts: Record<string, number> = {}
                    for (const kp of s.selectedKps) {
                      const subj = subjectOfKp(kp)
                      if (subj) subjCounts[subj] = (subjCounts[subj] || 0) + 1
                    }
                    const subjEntries = Object.entries(subjCounts)
                    return (
                      <div
                        key={s.sessionKey}
                        role="button"
                        tabIndex={0}
                        className={cn('w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-accent cursor-pointer', isActive && 'border-primary/50 bg-primary/5')}
                        onClick={() => { void onPick(s.sessionKey) }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); (ev.currentTarget as HTMLElement).click() }
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {subjEntries.length > 0 ? subjEntries.map(([subj, n], idx) => (
                            <span key={subj} className="inline-flex items-center gap-1.5">
                              {idx > 0 && <Separator orientation="vertical" className="h-3" />}
                              <span className="text-xs font-medium">{subj}</span>
                              <span className="text-[10px] text-muted-foreground">{n}个</span>
                            </span>
                          )) : <span className="text-xs text-muted-foreground">{s.selectedKps.length}个知识点</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-1.5">
                          {new Date(s.createdAt || s.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 创建
                        </p>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="h-1 flex-1" />
                          <span className="text-[10px] text-muted-foreground tabular-nums">{progress}%</span>
                          <span
                            className="text-[10px] text-muted-foreground tabular-nums"
                            title={answered != null
                              ? `本轮已作答 ${answered}/${total} 题 · 上次刷到第 ${s.currentIndex} 题`
                              : `上次刷到第 ${s.currentIndex}/${total} 题`}
                          >
                            {answered != null ? `${answered}/${total}` : `统计中…`}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-destructive/60 hover:text-destructive"
                            onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); onDelete(s.sessionKey) }}
                            title="删除会话"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <DrawerFooter>
          <DrawerClose asChild><Button variant="outline" className="w-full">关闭</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
