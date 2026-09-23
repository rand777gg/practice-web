import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useBankPapers } from '@/hooks/use-bank-papers'
import type { BankItem, QuestionBank } from '@/hooks/use-question-banks'
import { useAuthStore } from '@/stores/auth-store'
import { useExamStore } from '@/stores/exam-store'
import { PaperGenerateDialog, type PaperGenerateInput } from './PaperGenerateDialog'
import { PaperPreviewDialog } from './PaperPreviewDialog'
import {
  collectBankPaperScopes,
  countQuestionsInScope,
  findPaperForScope,
  mergePaperScopeValues,
  mergePaperYears,
  paperScopeLabel,
  realYearCategory,
  type BankPaperScope,
} from '@/lib/bank-papers'
import { EXAM_PAPER_TITLE_KEY, QUESTION_TYPE_LABELS } from '@/lib/constants'
import { BookOpen, CalendarDays, Eye, FileText, Layers, Loader2, Play, Plus, RefreshCw, Target, Trash2 } from 'lucide-react'
import type { ExamComposeStat, QuestionBankPaper } from '@/types'

interface Props {
  bank: QuestionBank
  /** 库里的题目(由详情页带下来, 套卷的可选范围就从这些题的标签里长出来) */
  items: BankItem[]
  canEdit: boolean
}

/** 分区实抽不足模板要求时的一句话提示; 都抽满了返回空串 */
function shortageNotice(stats: ExamComposeStat[]): string {
  const short = stats.filter((s) => s.got < s.requested)
  if (short.length === 0) return ''
  const detail = short
    .map((s) => `${s.type ? QUESTION_TYPE_LABELS[s.type] ?? s.type : '不限题型'} 缺 ${s.requested - s.got} 题`)
    .join('，')
  return `题库不足，已按现有题目组卷：${detail}。可以往试题库补题后重新组卷。`
}

function day(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('zh-CN') : '—'
}

export function BankPapers({ bank, items, canEdit }: Props) {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const startExam = useExamStore((s) => s.startExam)
  const { papers, isLoading, load, generate, regenerate, remove } = useBankPapers(bank.id)

  const [target, setTarget] = useState<BankPaperScope | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)
  const [preview, setPreview] = useState<QuestionBankPaper | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState('')
  const [startingId, setStartingId] = useState('')
  const [pendingDelete, setPendingDelete] = useState<QuestionBankPaper | null>(null)
  const [showAllChapters, setShowAllChapters] = useState(false)
  const [showAllKps, setShowAllKps] = useState(false)

  useEffect(() => { load() }, [load])

  const questions = useMemo(() => items.map((i) => i.questions), [items])
  const scopes = useMemo(() => collectBankPaperScopes(questions), [questions])
  // 展示用范围 = 库里标签 + 已有卷自带的(题目被移出库后卷子仍要能打开/删除)
  const years = useMemo(() => mergePaperYears(scopes.years, papers), [scopes.years, papers])
  const chapters = useMemo(() => mergePaperScopeValues(scopes.chapters, papers, 'chapter'), [scopes.chapters, papers])
  const keyPointOptions = useMemo(() => mergePaperScopeValues(scopes.keyPoints, papers, 'key_point'), [scopes.keyPoints, papers])

  const openGenerate = (scope: BankPaperScope) => {
    setNotice('')
    setTarget(scope)
    // 换 key 让生成弹窗每次打开都是干净的表单
    setDialogKey((k) => k + 1)
    setDialogOpen(true)
  }

  const handleGenerate = async (input: PaperGenerateInput) => {
    const res = await generate({ ...input, bankId: bank.id })
    if (!res.ok) return { ok: false, error: res.error }
    setNotice(shortageNotice(res.stats))
    return { ok: true }
  }

  const handleRegenerate = async (paper: QuestionBankPaper) => {
    setBusyId(paper.id)
    setNotice('')
    const res = await regenerate(paper)
    setBusyId('')
    if (!res.ok) {
      setNotice(res.error ?? '重新组卷失败：这个范围里已经抽不到题了')
      return
    }
    setNotice(shortageNotice(res.stats))
  }

  const handleStart = async (paper: QuestionBankPaper) => {
    if (!user) return
    if (paper.question_ids.length === 0) {
      setNotice('这套卷还没有题目，请先重新组卷')
      return
    }
    setNotice('')
    setStartingId(paper.id)
    const result = await startExam({
      userId: user.id,
      questionCount: paper.question_ids.length,
      durationMs: Math.max(1, paper.duration_min) * 60 * 1000,
      template: paper.template,
      questionIds: paper.question_ids,
    })
    const session = useExamStore.getState().session
    if (!result.ok || !session) {
      setStartingId('')
      setNotice(useExamStore.getState().error ?? '开考失败，请重试')
      return
    }
    // 与考试页开考一致: 记下卷首标题与分区分值, 供历史/成绩页回顾整卷
    try {
      const map = JSON.parse(localStorage.getItem(EXAM_PAPER_TITLE_KEY) || '{}') as Record<string, unknown>
      map[session.id] = {
        title: paper.template.cover?.title?.trim() || paper.template.cover?.examName?.trim() || paper.name,
        sections: JSON.parse(JSON.stringify(paper.template.sections ?? [])),
      }
      localStorage.setItem(EXAM_PAPER_TITLE_KEY, JSON.stringify(map))
    } catch { /* localStorage 不可用时忽略 */ }
    navigate(`/exam?sessionId=${session.id}`)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    await remove(pendingDelete.id)
    setPendingDelete(null)
  }

  const renderRow = (scope: BankPaperScope, label: string, icon: ReactNode) => {
    const paper = findPaperForScope(papers, scope)
    const available = countQuestionsInScope(questions, scope)
    const busy = !!paper && busyId === paper.id
    const starting = !!paper && startingId === paper.id
    return (
      <div key={`${scope.scopeType}-${scope.year ?? ''}-${scope.values.join('|')}`} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{paper?.name ?? label}</span>
            {paper ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {paper.question_ids.length} 题
              </span>
            ) : (
              <span className="shrink-0 text-[10px] text-muted-foreground">未生成</span>
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {paper
              ? `${paper.template.name} · ${paper.duration_min} 分钟 · 生成于 ${day(paper.generated_at)}`
              : `库里 ${available} 道题`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {paper ? (
            <>
              <Button size="sm" className="h-7 text-xs" disabled={starting} onClick={() => handleStart(paper)}>
                {starting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
                开始考试
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setPreview(paper); setPreviewOpen(true) }}
              >
                <Eye className="mr-1 h-3 w-3" />预览
              </Button>
              {canEdit && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => handleRegenerate(paper)}>
                    {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                    重新组卷
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingDelete(paper)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </>
          ) : canEdit ? (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openGenerate(scope)}>
              <Plus className="mr-1 h-3 w-3" />生成
            </Button>
          ) : (
            <span className="pr-1 text-[11px] text-muted-foreground">—</span>
          )}
        </div>
      </div>
    )
  }

  const SCOPE_LIMIT = 8
  const visibleChapters = showAllChapters ? chapters : chapters.slice(0, SCOPE_LIMIT)
  const visibleKeyPoints = showAllKps ? keyPointOptions : keyPointOptions.slice(0, SCOPE_LIMIT)

  if (isLoading && papers.length === 0) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          共 {papers.length} 套卷
          <span className="ml-1 text-xs text-muted-foreground/70">套卷 = 题库范围 + 组卷模板，题单生成后固定，可反复练同一套</span>
        </p>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => openGenerate({ kind: 'mock', scopeType: 'comprehensive', year: null, values: [] })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />生成综合模拟卷
          </Button>
        )}
      </div>

      {notice && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          {notice}
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">历年真题</h3>
          <span className="text-[11px] text-muted-foreground">按年份 · 题目带「2024年真题」分类即出现在这里</span>
        </div>
        {years.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
            库里还没有年份真题。给题目加上「2024年真题」这样的分类后，这里会按年份自动列出，一年生成一套。
          </p>
        ) : (
          <div className="space-y-1.5">
            {years.map((year) =>
              renderRow(
                { kind: 'real', scopeType: 'year', year, values: [realYearCategory(year)] },
                `${year} 年真题`,
                <FileText className="h-4 w-4" />,
              ),
            )}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">模拟真题 · 按章节</h3>
          <span className="text-[11px] text-muted-foreground">章节 = 题目的分类（年份标签除外）</span>
        </div>
        {chapters.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">库里还没有章节分类。</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {visibleChapters.map((chapter) =>
                renderRow(
                  { kind: 'mock', scopeType: 'chapter', year: null, values: [chapter] },
                  chapter,
                  <Layers className="h-4 w-4" />,
                ),
              )}
            </div>
            {chapters.length > SCOPE_LIMIT && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShowAllChapters((v) => !v)}
              >
                {showAllChapters ? '收起' : `展开全部 ${chapters.length} 个章节`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">模拟真题 · 按知识点</h3>
          <span className="text-[11px] text-muted-foreground">知识点取自题目的 key_points</span>
        </div>
        {keyPointOptions.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">库里还没有知识点。</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {visibleKeyPoints.map((kp) =>
                renderRow(
                  { kind: 'mock', scopeType: 'key_point', year: null, values: [kp] },
                  kp,
                  <Target className="h-4 w-4" />,
                ),
              )}
            </div>
            {keyPointOptions.length > SCOPE_LIMIT && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setShowAllKps((v) => !v)}
              >
                {showAllKps ? '收起' : `展开全部 ${keyPointOptions.length} 个知识点`}
              </button>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">模拟真题 · 综合</h3>
          <span className="text-[11px] text-muted-foreground">整个试题库按模板组卷</span>
        </div>
        {renderRow(
          { kind: 'mock', scopeType: 'comprehensive', year: null, values: [] },
          '综合模拟卷',
          <Layers className="h-4 w-4" />,
        )}
      </section>

      <PaperGenerateDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={user?.id ?? ''}
        scope={target}
        available={target ? countQuestionsInScope(questions, target) : 0}
        subjectOptions={scopes.subjects}
        categoryOptions={[...chapters, ...years.map(realYearCategory)]}
        onSubmit={handleGenerate}
      />

      <PaperPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} paper={preview} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null) }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除套卷</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `删除「${pendingDelete.name}」（${paperScopeLabel(pendingDelete)}）？已考过的场次与成绩不受影响。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm">取消</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" size="sm" onClick={confirmDelete}>删除</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
