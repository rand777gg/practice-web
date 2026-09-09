import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Checkbox } from '@/components/ui/checkbox'
import { QuestionCard } from '@/components/questions/QuestionCard'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { SequentialProgressBar } from '@/components/practice/SequentialProgressBar'
import { SequentialKpNav, type GroupDist, type SessionDistEntry } from '@/components/practice/SequentialKpNav'
import { useT } from '@/i18n/use-t'
import type { Question, CorrectAnswer } from '@/types'
import type { PracticeUiVariant, ShortcutConfig } from '@/stores/settings-store'
import {
  ListChecks, MoveHorizontal, List, Filter, ChevronLeft, ChevronRight,
  Star, Flag, Keyboard, BookOpen,
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
  uiVariant: PracticeUiVariant
  onUiVariantChange: (v: PracticeUiVariant) => void

  // header
  subjectName: string | null
  relIndex: number
  total: number
  accuracy: number | null

  // subject switcher
  subjectBlocks: SubjectBlock[]
  currentSubject: string | null
  onSwitchSubject: (block: SubjectBlock) => void

  // draggable progress bar
  kpInfo: { kpName: string | null; kpCurrent: number; kpTotal: number }
  qKp: string | null | undefined
  deviceIcon: string
  deviceName: string
  syncText: string | null
  syncStatus: 'idle' | 'syncing' | 'synced'
  kpSeekMode: boolean
  onToggleKpSeek: () => void
  onSeekKp: (rel: number) => void
  distMode: boolean
  currentKpDist: GroupDist | null

  // controls
  isMobile: boolean
  tocVisible: boolean
  onToggleToc: () => void
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

  // prev/next
  hasPrev: boolean
  onPrev: () => void
  onNext: () => void
  onSubmit: () => void

  // sidebar (本组目录)
  kpNav: KpNavProps
  sessionProgress: { done: number; total: number }
}

export function SequentialPracticeNewUi(props: Props) {
  const { t } = useT()
  const {
    uiVariant, onUiVariantChange,
    subjectName, relIndex, total, accuracy,
    subjectBlocks, currentSubject, onSwitchSubject,
    kpInfo, qKp, deviceIcon, deviceName, syncText, syncStatus,
    kpSeekMode, onToggleKpSeek, onSeekKp, distMode, currentKpDist,
    isMobile, tocVisible, onToggleToc, onOpenSessions,
    question, selectedAnswer, isSubmitted, attemptCount, wrongCount,
    note, isPublic, onNoteChange, onPublicToggle, onSelect, isFavorite, onToggleFavorite,
    onMarkTooEasy, onMarkUnsure, onFlagIssue, isAdmin, onVerify, allowLocalJudge, practiceShortcuts,
    availableKpEntries, onShowKpExplain,
    justAnsweredId, answeredThisSession, onSkipToNextUnanswered,
    hasPrev, onPrev, onNext, onSubmit,
    kpNav, sessionProgress,
  } = props

  const sessionPct = sessionProgress.total > 0 ? Math.round((sessionProgress.done / sessionProgress.total) * 100) : 0

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* 顶部信息头: 顺序刷题 · 学科 | 第 X/Y 题 | 正确率 */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
          <ListChecks className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium">顺序刷题</span>
          {subjectName && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="truncate text-muted-foreground">{subjectName}</span>
            </>
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

      <div className="lg:flex lg:items-stretch">
        {/* 左侧主区 */}
        <div className="min-w-0 flex-1 space-y-4 p-4 lg:p-5">
          {/* 学科切换 + 控制按钮 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {subjectBlocks.length > 1 ? subjectBlocks
              .filter((b, i, arr) => arr.findIndex((x) => x.subject === b.subject) === i)
              .map((b) => {
                const active = b.subject === currentSubject
                return (
                  <button
                    key={b.subject}
                    type="button"
                    onClick={() => onSwitchSubject(b)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-md border transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30',
                    )}
                  >
                    {b.subject}
                  </button>
                )
              }) : null}
            <div className="ml-auto flex items-center gap-1">
              {/* 新/旧 UI 切换 — 位于拖动按钮左侧 */}
              <div className="flex items-center gap-1 rounded-md border p-0.5" title="切换新/旧练习界面">
                <Button
                  type="button"
                  size="sm"
                  className={cn('h-6 px-2 text-[11px]', uiVariant === 'old' ? 'bg-muted text-foreground' : 'bg-transparent text-muted-foreground hover:bg-accent')}
                  onClick={() => onUiVariantChange('old')}
                >
                  旧
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={cn('h-6 px-2 text-[11px]', uiVariant === 'new' ? 'bg-muted text-foreground' : 'bg-transparent text-muted-foreground hover:bg-accent')}
                  onClick={() => onUiVariantChange('new')}
                >
                  新
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7 shrink-0', kpSeekMode && 'bg-accent text-accent-foreground')}
                onClick={onToggleKpSeek}
                title={kpSeekMode ? '关闭拖动进度条切换题目' : '开启拖动进度条切换题目'}
              >
                <MoveHorizontal className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7 shrink-0', !isMobile && tocVisible && 'bg-accent text-accent-foreground')}
                onClick={onToggleToc}
                title={isMobile ? '知识点目录' : tocVisible ? '隐藏目录' : '显示目录'}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onOpenSessions} title="筛选条件">
                <Filter className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* 拖动进度条 */}
          <SequentialProgressBar
            currentIndex={relIndex}
            total={total}
            kpCurrent={kpInfo.kpCurrent || 0}
            kpTotal={kpInfo.kpTotal || 0}
            kpName={kpInfo.kpName || qKp || null}
            deviceIcon={deviceIcon}
            deviceName={deviceName}
            syncText={syncText}
            syncStatus={syncStatus}
            seekable={kpSeekMode}
            onSeekKp={onSeekKp}
            distMode={distMode}
            dist={currentKpDist}
            done={sessionProgress.done}
            doneTotal={sessionProgress.total}
          />

          {/* 题干/选项(复用 QuestionCard,覆盖全题型) */}
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
            unsureKbd={!isMobile ? keyDisplay(practiceShortcuts.markUnsure) : undefined}
            favoriteKbd={!isMobile ? keyDisplay(practiceShortcuts.favorite) : undefined}
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
        </div>

        {/* 右侧目录 + 本组进度 */}
        {tocVisible && (
          <aside className="hidden w-72 shrink-0 border-l p-4 lg:block">
            <div className="mb-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">本组进度</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="tabular-nums">{sessionProgress.done} / {sessionProgress.total}</span>
                <span className="tabular-nums">{sessionPct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${sessionPct}%` }} />
              </div>
            </div>
            <SequentialKpNav {...kpNav} />
          </aside>
        )}
      </div>
    </div>
  )
}
