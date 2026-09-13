import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { SequentialKpNav, type GroupDist, type SessionDistEntry } from '@/components/practice/SequentialKpNav'
import {
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from '@/components/ui/resizable'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useT } from '@/i18n/use-t'
import type { Question, CorrectAnswer } from '@/types'
import type { ShortcutConfig } from '@/stores/settings-store'
import {
  ListChecks, List, ChevronLeft, ChevronRight, Star, Flag, Keyboard,
  BookOpen, Filter, X, ChevronDown,
} from 'lucide-react'

function keyDisplay(key: string): string {
  const KEY: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Enter: '⏎', Escape: 'Esc', Control: 'Ctrl', Shift: '⇧', Alt: 'Alt', Meta: '⌘', Space: 'Space',
  }
  return KEY[key] || (key.length === 1 ? key.toUpperCase() : key)
}

function ShortcutKbd({ shortcut }: { shortcut: string }) {
  const parts = shortcut.split('+').filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return <Kbd data-icon="inline-end" className="translate-x-0.5">{keyDisplay(parts[0])}</Kbd>
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((p, i) => <Kbd key={i}>{keyDisplay(p)}</Kbd>)}
    </span>
  )
}

interface SubjectBlock { subject: string; start: number; end: number; count: number }

interface KpNavProps {
  userId: string
  questionIds: string[]
  questionKps: (string | null)[]
  questionSubjects: (string | null)[]
  currentIndex: number
  onJump: (index: number) => void
  subjectResets?: Record<string, string> | null
  planResetAt?: string | null
  subject?: string | null
  selectedKps?: string[]
  onExcludedRestored?: () => void
  answeredThisSession?: Set<string>
  sessionDist?: Map<string, SessionDistEntry>
  showDist: boolean
  onShowDistChange: (v: boolean) => void
  onCurrentKpDist?: (d: GroupDist | null) => void
}

interface Props {
  // header
  subjectName: string | null
  subjectBlocks: SubjectBlock[]
  onSwitchSubject: (block: SubjectBlock) => void
  relIndex: number
  total: number
  accuracy: number | null

  onOpenSessions: () => void

  // question card
  question: Question
  selectedAnswer: CorrectAnswer | null
  isSubmitted: boolean
  attemptCount: number
  wrongCount: number
  note: string
  isPublic: boolean
  onNoteChange: (v: string) => void
  onPublicToggle: (v: boolean) => void
  onSelect: (a: CorrectAnswer) => void
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string) => void
  onMarkTooEasy: () => void
  onMarkUnsure: () => void
  onFlagIssue: () => void
  isAdmin: boolean
  onVerify: (() => void) | undefined
  allowLocalJudge: boolean
  practiceShortcuts: ShortcutConfig

  // kp explanation
  availableKpEntries: { subject: string; kp: string }[]
  onShowKpExplain: (e: { subject: string; kp: string }) => void

  // answered banner
  justAnsweredId: string | null
  answeredThisSession: Set<string>
  onSkipToNextUnanswered: () => void

  // prev/next/submit
  hasPrev: boolean
  onPrev: () => void
  onNext: () => void
  onSubmit: () => void

  // directory + progress
  isMobile: boolean
  kpInfo: { kpName: string | null; kpCurrent: number; kpTotal: number }
  qKp: string | null | undefined
  sessionProgress: { done: number; total: number }
  overallProgress: { done: number; total: number }
  kpNav: KpNavProps
}

function ProgressRow({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{done} / {total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function SequentialPracticeNewUi(props: Props) {
  const { t } = useT()
  const {
    subjectName, subjectBlocks, onSwitchSubject, relIndex, total, accuracy,
    onOpenSessions,
    question, selectedAnswer, isSubmitted, attemptCount, wrongCount,
    note, isPublic, onNoteChange, onPublicToggle, onSelect, isFavorite, onToggleFavorite,
    onMarkTooEasy, onMarkUnsure, onFlagIssue, isAdmin, onVerify, allowLocalJudge, practiceShortcuts,
    availableKpEntries, onShowKpExplain,
    justAnsweredId, answeredThisSession, onSkipToNextUnanswered,
    hasPrev, onPrev, onNext, onSubmit,
    isMobile, kpInfo, qKp, sessionProgress, overallProgress, kpNav,
  } = props

  const [dirOpen, setDirOpen] = useState(!isMobile)

  const uniqueSubjects = subjectBlocks.filter((b, i, arr) => arr.findIndex((x) => x.subject === b.subject) === i)

  const directory = (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="truncate">{kpInfo.kpName || qKp || '当前知识点'}</span>
          <span className="tabular-nums shrink-0">{kpInfo.kpCurrent} / {kpInfo.kpTotal}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: kpInfo.kpTotal > 0 ? `${Math.round((kpInfo.kpCurrent / kpInfo.kpTotal) * 100)}%` : '0%' }} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <SequentialKpNav {...kpNav} variant="dots" />
      </div>
      <div className="flex flex-col gap-3 border-t pt-3">
        <ProgressRow label="学科进度" done={sessionProgress.done} total={sessionProgress.total} />
        <ProgressRow label="总进度" done={overallProgress.done} total={overallProgress.total} />
      </div>
      {!isMobile && (
        <div className="flex items-center gap-1.5 border-t pt-3">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenSessions}>
            <Filter className="h-3.5 w-3.5" />筛选
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDirOpen(false)}>
            <X className="h-3.5 w-3.5" />收起
          </Button>
        </div>
      )}
    </div>
  )

  const questionArea = (
    <>
      <QuestionCard
        key={question.id}
        question={question}
        selectedAnswer={selectedAnswer}
        showResult={isSubmitted}
        onSelect={onSelect}
        disabled={isSubmitted}
        showEditLink={isAdmin}
        allowLocalJudge={allowLocalJudge}
        attemptCount={attemptCount}
        wrongCount={wrongCount}
        note={note}
        isFavorited={isFavorite(question.id)}
        onMarkTooEasy={!isSubmitted ? onMarkTooEasy : undefined}
        onFlagIssue={isAdmin ? onFlagIssue : undefined}
        tooEasyKbd={!isMobile ? keyDisplay(practiceShortcuts.tooEasy) : undefined}
        flagIssueKbd={!isMobile ? keyDisplay(practiceShortcuts.flagIssue) : undefined}
        onVerify={onVerify}
      />

      {/* 知识点解读 */}
      {availableKpEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium">知识点解读</span>
          <span className="text-[11px] text-muted-foreground">本题涉及的知识点，可点击查看解读</span>
          {availableKpEntries.map((e) => (
            <button
              key={`${e.subject}:${e.kp}`}
              type="button"
              onClick={() => onShowKpExplain(e)}
              className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary/20"
            >
              {e.kp}
            </button>
          ))}
        </div>
      )}

      {/* 已作答提示 */}
      {answeredThisSession.has(question.id) && justAnsweredId !== question.id && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-amber-50/60 px-3 py-2 dark:bg-amber-950/20">
          <span className="flex-1 text-xs text-amber-700 dark:text-amber-300">本题此次会话已作答过</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSkipToNextUnanswered}>跳到下一未做题</Button>
        </div>
      )}

      {/* 笔记 */}
      {isSubmitted && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('practice.note')}</p>
          <NoteEditor placeholder={t('practice.notePlaceholder')} value={note} onChange={onNoteChange} />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">{t('notes.makePublic')}</p>
              <p className="text-xs text-muted-foreground">{isPublic ? t('notes.publicLabel') : t('notes.privateLabel')}</p>
            </div>
            <Checkbox checked={isPublic} onCheckedChange={(v) => onPublicToggle(v === true)} />
          </div>
        </div>
      )}

      {/* 底部导航 */}
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button variant="outline" onClick={onPrev} disabled={!hasPrev}>
          <ChevronLeft className="h-3.5 w-3.5" />
          上一题
          {!isMobile && <ShortcutKbd shortcut={practiceShortcuts.prev} />}
        </Button>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" onClick={() => onToggleFavorite(question.id)}>
            <Star className={cn('h-3.5 w-3.5', isFavorite(question.id) && 'fill-yellow-500 text-yellow-500')} />
            收藏
          </Button>
          {!isSubmitted && (
            <Button variant="ghost" onClick={onMarkUnsure}>
              <Flag className="h-3.5 w-3.5" />
              存疑
            </Button>
          )}
          {isSubmitted ? (
            <Button onClick={onNext}>
              下一题
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button onClick={onSubmit} disabled={selectedAnswer == null}>
              提交答案
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Keyboard className="h-3 w-3" />
        快捷键：← 上一题 · → 下一题 · 1-4 选择 · {keyDisplay(practiceShortcuts.markUnsure)} 存疑
      </div>
    </>
  )

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* 顶部信息头: 顺序刷题 · 学科(可切换) | 第 X/Y 题 | 正确率 */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
          <ListChecks className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium">顺序刷题</span>
          <span className="text-muted-foreground">·</span>
          {subjectName && (
            uniqueSubjects.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-accent">
                    <span className="truncate">{subjectName}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {uniqueSubjects.map((b) => (
                    <DropdownMenuItem key={b.subject} onClick={() => onSwitchSubject(b)}>
                      {b.subject}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="truncate text-muted-foreground">{subjectName}</span>
            )
          )}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm">
          <span className="font-medium tabular-nums">第 {relIndex + 1} / {total} 题</span>
          {accuracy != null && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-500">
              正确率 {accuracy}%
            </span>
          )}
        </span>
      </div>

      {isMobile ? (
        <div className="min-w-0 space-y-4 p-4">
          {questionArea}
          {!dirOpen && (
            <div className="flex items-center justify-end gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDirOpen(true)}>
                <List className="h-3.5 w-3.5" />目录
              </Button>
            </div>
          )}
          <Drawer open={dirOpen} onOpenChange={setDirOpen}>
            <DrawerContent className="h-[70vh] max-h-[70vh]">
              <DrawerHeader>
                <DrawerTitle>本组目录</DrawerTitle>
                <Button variant="ghost" size="icon" className="absolute right-4 top-3 h-7 w-7" onClick={() => setDirOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{directory}</div>
            </DrawerContent>
          </Drawer>
        </div>
      ) : (
        <>
          <ResizablePanelGroup orientation="horizontal" className="min-h-[62vh]">
            <ResizablePanel defaultSize={dirOpen ? 66 : 100} minSize={45}>
              <div className="min-w-0 space-y-4 p-4 lg:p-5">{questionArea}</div>
            </ResizablePanel>
            {dirOpen && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={34} minSize={20}>
                  {directory}
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
          {!dirOpen && (
            <div className="flex items-center justify-end gap-1.5 border-t px-4 py-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDirOpen(true)}>
                <List className="h-3.5 w-3.5" />目录
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
