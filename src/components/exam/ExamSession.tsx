import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useExamStore } from '@/stores/exam-store'
import { ExamTimer } from './ExamTimer'
import { MarkdownRenderer } from '@/components/markdown/MarkdownRenderer'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronLeft, ChevronRight, FileText, LayoutGrid, Play, Sparkles, PanelLeftClose, PanelLeftOpen, Columns2, Send } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExamTemplatePanel } from './ExamTemplatePanel'
import { ExamHistory } from './ExamHistory'
import { ExamSchedulePanel } from './ExamSchedulePanel'
import { PaperPreview } from './PaperPreview'
import { buildPaperSections, type PaperSection } from '@/lib/exam-compose'

import {
  EXAM_DEFAULT_COUNT,
  EXAM_MIN_COUNT,
  EXAM_MAX_COUNT,
  EXAM_DEFAULT_DURATION_MIN,
  EXAM_MIN_DURATION_MIN,
  EXAM_MAX_DURATION_MIN,
} from '@/lib/constants'
import type { ExamSession as ExamSessionType, ExamTemplate, ExamTemplateSection, QuestionType, Question, CaseQuestion, CaseAnswer, CorrectAnswer } from '@/types'
import { QUESTION_TYPE_OPTIONS, QUESTION_TYPE_LABELS, OPTION_LABELS, EXAM_PAPER_TITLE_KEY } from '@/lib/constants'
import { suggestExamConfig, hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'
import { useIsMobile } from '@/hooks/use-mobile'
import { useT } from '@/i18n/use-t'

/** 占位题固定创建时间(避免渲染期取系统时间的不纯调用) */
const PREVIEW_CREATED = '2024-01-01T00:00:00.000Z'

const OPT = ['选项 A', '选项 B', '选项 C', '选项 D']

function mockQuestionText(type: QuestionType, i: number): string {
  const idx = `（第 ${i + 1} 题示例）`
  switch (type) {
    case 'single_choice':
      return `${idx} 以下哪个说法是正确的？`
    case 'multi_select':
      return `${idx} 下列选项中正确的有哪些？`
    case 'true_false':
      return `${idx} 判断：学习需要持之以恒。`
    case 'judge_correct':
      return `${idx} 判断改错：先判断对错，若错误请写出正确表述。`
    case 'fill_blank':
      return `${idx} 填空：马克思主义中国化的最新理论成果是______。`
    case 'short_answer':
      return `${idx} 简答：请简述你的解题思路。`
    case 'analysis':
      return `${idx} 分析：请结合所学知识进行分析。`
    case 'coding':
      return `${idx} 编程：编写一个函数，计算两个整数之和并返回结果。`
    case 'case_analysis':
      return `${idx} 案例材料：阅读以下材料，回答后面的小题。`
    default:
      return `${idx} 示例题干占位文本。`
  }
}

/** 生成一份用于“开始页右侧试卷预览”的占位卷(纯本地, 不访问题库) */
function buildPreviewSections(tpl: ExamTemplate): PaperSection[] {
  const CAP_PER_SECTION = 6
  let n = 0
  const makeQuestion = (type: QuestionType, subject: string | null, i: number): Question => {
    const qid = `preview-${++n}`
    let caseQuestions: CaseQuestion[] | undefined
    if (type === 'case_analysis') {
      caseQuestions = [0, 1, 2].map((si) => ({
        id: `${qid}-sub-${si}`,
        type: 'single_choice' as const,
        text: `小题（${si + 1}）：选出符合材料的一项。`,
        options: [...OPT],
        answer: 0,
      }))
    }
    return {
      id: qid,
      question_type: type,
      question_text: mockQuestionText(type, i),
      options: type === 'single_choice' || type === 'multi_select' ? [...OPT] : [],
      correct_answer: type === 'single_choice' || type === 'multi_select' ? 0 : type === 'true_false' ? true : null,
      category: null,
      categories: [],
      subject,
      analysis: null,
      key_points: null,
      answer_explanation: null,
      seq_number: null,
      created_at: PREVIEW_CREATED,
      created_by: null,
      verified: true,
      import_mode: null,
      allow_unordered: false,
      unordered_blanks: null,
      source_page: null,
      case_questions: caseQuestions,
    }
  }

  const out: PaperSection[] = []
  for (const s of tpl.sections) {
    if (!s.type || s.count <= 0) continue
    const subject = s.subject?.length ? s.subject[0] : tpl.subject?.[0] ?? null
    const count = Math.min(s.count, CAP_PER_SECTION)
    const base = QUESTION_TYPE_LABELS[s.type] ?? s.type
    out.push({
      name: s.subject?.length ? `${base}（${s.subject.join('、')}）` : base,
      scorePerQuestion: s.score,
      questions: Array.from({ length: count }, (_, i) => makeQuestion(s.type as QuestionType, subject, i)),
    })
  }
  return out
}

type ExamViewMode = 'card' | 'sheet' | 'spread'

/** 判断改错题: 只有“选正确”或“选错误且已填改正内容”才算完成该题 */
function isJudgeAnswered(value: CorrectAnswer): boolean {
  if (value === true) return true
  return typeof value === 'string' && value.trim().length > 0
}

/** 题干中“___”空缺的数量(单空按 1 计) */
function blankNumber(text: string): number {
  return (text.match(/_{2,}/g) || []).length || 1
}

/** 填空题: 多空时任意一空未填都不能算完成, 需全部空位均有非空作答 */
function isFillBlankAnswered(value: CorrectAnswer | null | undefined, nBlanks: number): boolean {
  if (value === null || value === undefined) return false
  const vals = Array.isArray(value)
    ? (value as string[])
    : typeof value === 'string'
      ? [value]
      : []
  if (vals.length === 0) return false
  for (let i = 0; i < nBlanks; i++) {
    const v = vals[i]
    if (v === null || v === undefined || String(v).trim() === '') return false
  }
  return true
}

/** 题目是否已完成作答(空改正内容的判断改错题、未填满全部空的填空题均不算完成) */
function isQuestionAnswered(q: Question, value: CorrectAnswer | null | undefined): boolean {
  if (value === null || value === undefined) return false
  if (q.question_type === 'judge_correct') return isJudgeAnswered(value)
  if (q.question_type === 'fill_blank') return isFillBlankAnswered(value, blankNumber(q.question_text))
  if (q.question_type === 'case_analysis') {
    const shape = value as CaseAnswer
    if (!shape || !Array.isArray(shape.subs)) return false
    return shape.subs.some((s) => {
      if (s.value === null || s.value === undefined) return false
      const sub = q.case_questions?.find((c) => c.id === s.id)
      if (sub?.type === 'judge_correct') return isJudgeAnswered(s.value)
      // 案例小题里的填空(多空)同样要求全部空位填写完成
      if (sub?.type === 'fill_blank') return isFillBlankAnswered(s.value, blankNumber(sub.text))
      return true
    })
  }
  return true
}

export function ExamSession() {
  const { t } = useT()
  const { user } = useAuthStore()
  const { isEnabled } = useSettingsStore()
  const {
    session,
    questions,
    currentIndex,
    answers,
    isLoading,
    isSubmitting,
    error,
    startExam,
    resumeExam,
    answerQuestion,
    jumpTo,
    submitExam,
  } = useExamStore()

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [hasStarted, setHasStarted] = useState(false)
  const [showStart, setShowStart] = useState(true)
  const [questionCount, setQuestionCount] = useState(EXAM_DEFAULT_COUNT)
  const [durationMin, setDurationMin] = useState(EXAM_DEFAULT_DURATION_MIN)

  const [pendingSession, setPendingSession] = useState<ExamSessionType | null>(null)
  const [showResumeDialog, setShowResumeDialog] = useState(false)
  const [checkingSession, setCheckingSession] = useState(false)

  const [subjects, setSubjects] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [filteredCategories, setFilteredCategories] = useState<string[]>([])
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiGlow, setAiGlow] = useState(false)
  const [aiFade, setAiFade] = useState(false)
  const [aiReason, setAiReason] = useState('')
  const [showSheet, setShowSheet] = useState(false)
  const [template, setTemplate] = useState<ExamTemplate | null>(null)
  // 卷面/卡片呈现模式初值来自持久化偏好(考试中手动切换会即时写回, 刷新/重进沿用)
  const [paperMode, setPaperMode] = useState(() => useSettingsStore.getState().examViewMode !== 'card')
  const [sheetOpen, setSheetOpen] = useState(true)          // 桌面答题卡展开/收起
  const [paperLayout, setPaperLayout] = useState<'sheet' | 'spread'>(() => (useSettingsStore.getState().examViewMode === 'spread' ? 'spread' : 'sheet'))
  const [tab, setTab] = useState<'settings' | 'appointment' | 'history'>('settings')
  const [paperNotice, setPaperNotice] = useState('')
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [submitError, setSubmitError] = useState('')
  // 开始页「试卷预览」的单页/双页切换
  const [previewView, setPreviewView] = useState<'sheet' | 'spread'>('sheet')

  // 正式考试样式(formalExam): 封面「考生填涂信息表」在交卷前必须填写完整; 值按行下标存
  const infoRows = useMemo(() => {
    if (!template?.layout?.formalExam || !template.cover?.infoTable?.length) return [] as { label: string; boxes: number }[]
    return template.cover.infoTable
  }, [template])
  const [candidateValues, setCandidateValues] = useState<string[]>([])
  // 双页视图查看工具栏(缩放/平移/全屏)锚点: 桌面端挂在顶部工具栏内; 移动端回退浮层
  const [spreadToolbarEl, setSpreadToolbarEl] = useState<HTMLElement | null>(null)
  const isMobile = useIsMobile()
  const { setSidebarCollapsed, setExamViewMode } = useSettingsStore()

  const viewMode: ExamViewMode = paperMode ? (paperLayout === 'spread' ? 'spread' : 'sheet') : 'card'
  const applyViewMode = (next: ExamViewMode) => {
    if (next === viewMode) return
    if (next === 'card') {
      setPaperMode(false)
    } else {
      setPaperLayout(next)
      setPaperMode(true)
    }
    setExamViewMode(next)
  }

  // 移动端卡片模式左右滑动切题: 记录触点起点(渲染路径内是纯函数, 无额外 hook)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  // 卡片模式切题动画(进入方向): 下一题从右滑入, 上一题从左滑入(只作用于题目+作答内容, 不动导航/标题栏)
  const [cardSlide, setCardSlide] = useState<{ id: number; cls: string }>({ id: 0, cls: 'wb-slide-in-right' })

  // 卷面「自动定位当前题目」开关(默认关闭) + 答题卡显式跳题的定位令牌
  const [autoLocate, setAutoLocate] = useState(false)
  const [locateNonce, setLocateNonce] = useState(0)

  /** 卡片模式切题: 同步触发方向滑入动画并跳题(答题卡跳题 / 上下一题 / 滑动共用) */
  const switchTo = (i: number) => {
    if (i === currentIndex) return
    const goNext = i > currentIndex
    setCardSlide((s) => ({ id: s.id + 1, cls: goNext ? 'wb-slide-in-right' : 'wb-slide-in-left' }))
    jumpTo(i)
  }

  const jumpLocate = (i: number, closeSheet = false) => {
    if (closeSheet) setShowSheet(false)
    if (i !== currentIndex) switchTo(i)
    setLocateNonce((n) => n + 1)
  }

  useEffect(() => {
    async function loadFilters() {
      const { data } = await supabase.from('questions').select('subject, category')
      const subs = new Set<string>()
      const cats = new Set<string>()
      for (const row of data ?? []) {
        if (row.subject) subs.add(row.subject)
        if (row.category) cats.add(row.category)
      }
      setSubjects([...subs].sort())
      setCategories([...cats].sort())
      setFilteredCategories([...cats].sort())
    }
    loadFilters()
  }, [])

  useEffect(() => {
    let cancelled = false
    if (selectedSubjects.length === 0) {
      setFilteredCategories(categories)
    } else {
      async function loadCats() {
        const { data } = await supabase
          .from('questions')
          .select('category')
          .in('subject', selectedSubjects)
        if (cancelled) return
        const cats = new Set<string>()
        for (const row of data ?? []) {
          if (row.category) cats.add(row.category)
        }
        setFilteredCategories([...cats].sort())
      }
      loadCats()
    }
    return () => { cancelled = true }
  }, [selectedSubjects, categories])

  // 续考后回填模板: DB 快照优先; 加列前开的旧会话回退到开考时写入 localStorage 的卷首元信息(标题+分区分值)
  const restoreResumedTemplate = useCallback(() => {
    const sess = useExamStore.getState().session
    if (!sess) return
    const snap = (sess as ExamSessionType & { template?: ExamTemplate | null }).template
    if (snap) { setTemplate(snap); return }
    try {
      const map = JSON.parse(localStorage.getItem(EXAM_PAPER_TITLE_KEY) || '{}') as Record<string, unknown>
      const v = map[sess.id]
      const title = typeof v === 'string' ? v : (v && typeof v === 'object' && typeof (v as { title?: unknown }).title === 'string' ? (v as { title: string }).title : '')
      const sections = v && typeof v === 'object' && Array.isArray((v as { sections?: unknown }).sections)
        ? (v as { sections: ExamTemplateSection[] }).sections
        : []
      if (title || sections.length) {
        setTemplate({
          id: '__resumed__',
          user_id: null,
          name: title,
          subject: null,
          duration_min: 0,
          order_mode: 'section',
          sample_mode: 'random',
          sections,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        })
      }
    } catch { /* localStorage 不可用 */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    const sessionId = searchParams.get('sessionId')
    if (sessionId && user) {
      // Optimistically show exam UI immediately to avoid flash
      setShowStart(false)
      setHasStarted(true)
      resumeExam(sessionId)
        .then(() => { if (!cancelled) restoreResumedTemplate() })
        .catch(() => {
          if (!cancelled) { setShowStart(true); setHasStarted(false) }
        })
      return () => { cancelled = true }
    }

    if (!user) return
    const urlHasSession = searchParams.has('sessionId')
    if (urlHasSession) return
    setCheckingSession(true)
    supabase
      .from('exam_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          setPendingSession(data as unknown as ExamSessionType)
          setShowResumeDialog(true)
        }
        setCheckingSession(false)
      })
    return () => { cancelled = true }
  }, [searchParams, user?.id, resumeExam, restoreResumedTemplate])

  const filterArgs = {
    subjects: selectedSubjects.length ? selectedSubjects : undefined,
    categories: selectedCategories.length ? selectedCategories : undefined,
    questionTypes: selectedTypes.length ? selectedTypes : undefined,
  }

  const handleStart = async () => {
    if (!user) return
    const count = Math.max(EXAM_MIN_COUNT, Math.min(EXAM_MAX_COUNT, questionCount || EXAM_DEFAULT_COUNT))
    const mins = Math.max(EXAM_MIN_DURATION_MIN, Math.min(EXAM_MAX_DURATION_MIN, durationMin || EXAM_DEFAULT_DURATION_MIN))
    const result = await startExam({
      userId: user.id,
      questionCount: count,
      durationMs: mins * 60 * 1000,
      template,
      ...filterArgs,
    })
    const s = useExamStore.getState().session
    if (!s) return
    // 记录本场考试元信息(模板封面科目标题 + 分区分值快照), 供历史/成绩页回顾卷的卷首标题与得分框使用
    try {
      const map = JSON.parse(localStorage.getItem(EXAM_PAPER_TITLE_KEY) || '{}') as Record<string, unknown>
      if (template) {
        map[s.id] = {
          title: template.cover?.title?.trim() || template.cover?.examName?.trim() || template.name,
          sections: JSON.parse(JSON.stringify(template.sections ?? [])),
        }
      }
      localStorage.setItem(EXAM_PAPER_TITLE_KEY, JSON.stringify(map))
    } catch { /* localStorage 不可用时忽略 */ }
    setPaperNotice(result.stats?.some((x) => x.got < x.requested) ? t('examTemplate.insufficient') : '')
    setSearchParams({ sessionId: s.id }, { replace: true })
    setSidebarCollapsed(true)
    setShowStart(false)
    setHasStarted(true)
  }

  const handleResume = async () => {
    if (!pendingSession) return
    setShowResumeDialog(false)
    setSearchParams({ sessionId: pendingSession.id }, { replace: true })
    await resumeExam(pendingSession.id)
    restoreResumedTemplate()
    setSidebarCollapsed(true)
    setShowStart(false)
    setHasStarted(true)
  }

  const handleDiscard = async () => {
    if (pendingSession) {
      await supabase.from('exam_sessions').delete().eq('id', pendingSession.id)
    }
    setShowResumeDialog(false)
    setPendingSession(null)
    setSidebarCollapsed(false)
    setSearchParams({}, { replace: true })
  }

  const doSubmit = async (): Promise<boolean> => {
    const st = useExamStore.getState()
    if (!st.session || st.session.status === 'completed' || st.isSubmitting) return false
    setSubmitError('')
    await submitExam()
    if (useExamStore.getState().error) {
      setSubmitError(t('exam.submitFailed'))
      return false
    }
    return true
  }

  // 打开交卷确认: 若有必填考生信息表则同步输入框行数
  const openSubmitConfirm = () => {
    if (infoRows.length) {
      setCandidateValues((prev) => infoRows.map((_, i) => prev[i] ?? ''))
    }
    setSubmitError('')
    setConfirmSubmitOpen(true)
  }

  const handleTimerExpire = () => {
    // 到点自动交卷, 不弹确认
    void doSubmit()
  }

  // 交卷成功 / 续考时发现已交卷 → 不再弹结果弹窗, 直接进入成绩页
  useEffect(() => {
    if (session?.status === 'completed' && hasStarted) {
      navigate(`/exam/result/${session.id}`, { replace: true })
    }
  }, [session, hasStarted, navigate])

  const questionIds = useMemo(() => questions.map((q) => q.id), [questions])
  // 开始页「试卷预览」使用的本地占位卷(选中模板时生成, 不访问题库)
  const previewSections = useMemo(() => (template ? buildPreviewSections(template) : ([] as PaperSection[])), [template])

  if (checkingSession) {
    return (
      <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-4 animate-pulse">
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
    )
  }

  if (showStart) {
    return (
      <>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <FileText className="h-5 w-5 text-primary" />
              {t('exam.title')}
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t('exam.setupDesc')}</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'settings' | 'appointment' | 'history')}>
          <TabsList>
            <TabsTrigger value="settings">{t('exam.tabSetup')}</TabsTrigger>
            <TabsTrigger value="appointment">{t('exam.tabAppoint')}</TabsTrigger>
            <TabsTrigger value="history">{t('exam.tabHistory')}</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4">
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(340px,400px)_minmax(0,1fr)]">
              <Card className="min-w-0 overflow-hidden xl:sticky xl:top-24">
                <CardContent className="space-y-5 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">{t('exam.ready')}</h2>
                    {hasAiConfig() && isEnabled('exam') && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  disabled={aiLoading}
                  onClick={async () => {
                    if (!user) return
                    setAiLoading(true)
                    setAiGlow(true)
                    try {
                      const { data: history } = await supabase
                        .from('user_answers')
                        .select('is_correct, questions(subject, category, question_type)')
                        .eq('user_id', user.id)

                      const wrongBySubject = new Map<string, { wrong: number; total: number }>()
                      const wrongByCategory = new Map<string, number>()
                      const wrongByType = new Map<string, number>()
                      for (const r of (history ?? [])) {
                        const q = (r.questions as any)
                        if (!q) continue
                        const s = q.subject || 'Other'
                        const c = q.category || 'Other'
                        const t = q.question_type || 'single_choice'
                        const se = wrongBySubject.get(s) || { wrong: 0, total: 0 }
                        se.total++
                        if (!r.is_correct) { se.wrong++; wrongByCategory.set(c, (wrongByCategory.get(c) ?? 0) + 1); wrongByType.set(t, (wrongByType.get(t) ?? 0) + 1) }
                        wrongBySubject.set(s, se)
                      }

                      const result = await suggestExamConfig({
                        totalPractice: (history ?? []).length,
                        wrongBySubject: [...wrongBySubject.entries()].map(([subject, v]) => ({ subject, ...v })),
                        wrongByCategory: [...wrongByCategory.entries()].map(([category, wrong]) => ({ category, wrong })),
                        wrongByType: [...wrongByType.entries()].map(([type, wrong]) => ({ type, wrong })),
                        availableSubjects: subjects,
                        availableCategories: categories,
                        availableTypes: QUESTION_TYPE_OPTIONS.map(o => o.value),
                      })

                      setSelectedSubjects(result.subjects.filter(s => subjects.includes(s)))
                      setSelectedCategories(result.categories.filter(c => categories.includes(c)))
                      setSelectedTypes(result.types.filter(t => QUESTION_TYPE_OPTIONS.some(o => o.value === t)) as QuestionType[])
                      setQuestionCount(Math.max(EXAM_MIN_COUNT, Math.min(EXAM_MAX_COUNT, result.questionCount)))
                      setDurationMin(Math.max(EXAM_MIN_DURATION_MIN, Math.min(EXAM_MAX_DURATION_MIN, result.durationMin)))
                      setAiReason(result.reason)
                    } catch (e) {
                      console.error('AI suggest exam failed:', e)
                      setAiReason('AI 推荐失败，请手动设置参数')
                    }
                    setAiLoading(false)
                    setTimeout(() => {
                      setAiFade(true)
                      requestAnimationFrame(() => {
                        setAiGlow(false)
                        setTimeout(() => setAiFade(false), 1500)
                      })
                    }, 500)
                  }}
                >
                  <Sparkles className={`h-3.5 w-3.5 ${aiLoading ? 'animate-pulse' : ''}`} />
                  AI 智能出题
                </Button>
              )}
            </div>
            <div className="space-y-4">
              {aiLoading && (
                <p className="text-xs text-muted-foreground font-medium inline-flex items-center gap-1">
                  {[...'正在为您智能出题'].map((ch, i) => (
                    <span key={i} className="animate-[charReveal_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.04}s` }}>{ch}</span>
                  ))}
                  <span className="inline-flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground animate-[thinking_1.4s_ease-in-out_infinite]" />
                    <span className="w-1 h-1 rounded-full bg-muted-foreground animate-[thinking_1.4s_ease-in-out_0.2s_infinite]" />
                    <span className="w-1 h-1 rounded-full bg-muted-foreground animate-[thinking_1.4s_ease-in-out_0.4s_infinite]" />
                  </span>
                </p>
              )}
              {aiReason && (
                <p className="text-xs text-muted-foreground">
                  {[...aiReason].map((ch, i) => (
                    <span key={i} className="animate-[charReveal_0.3s_ease-out_both]" style={{ animationDelay: `${i * 0.03}s` }}>{ch}</span>
                  ))}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={`gap-1 text-xs transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}>
                        {selectedSubjects.length ? `学科(${selectedSubjects.length})` : t('questions.subject')}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                      {subjects.map((s) => {
                        const checked = selectedSubjects.includes(s)
                        return (
                          <DropdownMenuCheckboxItem key={s} checked={checked} onCheckedChange={() => {
                            setSelectedSubjects(prev => checked ? prev.filter(x => x !== s) : [...prev, s])
                          }}>
                            {s}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={`gap-1 text-xs transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}>
                        {selectedCategories.length ? `分类(${selectedCategories.length})` : t('questions.category')}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                      {(selectedSubjects.length ? filteredCategories : categories).map((c) => {
                        const checked = selectedCategories.includes(c)
                        return (
                          <DropdownMenuCheckboxItem key={c} checked={checked} onCheckedChange={() => {
                            setSelectedCategories(prev => checked ? prev.filter(x => x !== c) : [...prev, c])
                          }}>
                            {c}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={`gap-1 text-xs transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}>
                        {selectedTypes.length ? `类型(${selectedTypes.length})` : t('questions.questionType')}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {QUESTION_TYPE_OPTIONS.map((o) => {
                        const checked = selectedTypes.includes(o.value)
                        return (
                          <DropdownMenuCheckboxItem key={o.value} checked={checked} onCheckedChange={() => {
                            setSelectedTypes(prev => checked ? prev.filter(x => x !== o.value) : [...prev, o.value])
                          }}>
                            {t(`questionTypes.${o.value}` as any)}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t('examTemplate.sections')}</Label>
                  {user && (
                    <ExamTemplatePanel
                      userId={user.id}
                      subjects={subjects}
                      categories={categories}
                      value={template}
                      onChange={(next) => {
                        setTemplate(next)
                        if (next) setDurationMin(next.duration_min)
                      }}
                    />
                  )}
                </div>
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="questionCount" className="text-xs">{t('exam.questionCount')}</Label>
                    <Input
                      id="questionCount"
                      type="number"
                      min={EXAM_MIN_COUNT}
                      max={EXAM_MAX_COUNT}
                      value={questionCount}
                      disabled={!!template}
                      onChange={(e) => setQuestionCount(Number(e.target.value))}
                      className={`transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}
                    />
                    <p className="text-[10px] text-muted-foreground">{EXAM_MIN_COUNT}-{EXAM_MAX_COUNT}</p>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="duration" className="text-xs">{t('exam.duration')}</Label>
                    <Input
                      id="duration"
                      type="number"
                      min={EXAM_MIN_DURATION_MIN}
                      max={EXAM_MAX_DURATION_MIN}
                      value={durationMin}
                      onChange={(e) => setDurationMin(Number(e.target.value))}
                      className={`transition-[border-color,box-shadow] duration-1500 ease-out ${aiGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' : aiFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''}`}
                    />
                    <p className="text-[10px] text-muted-foreground">{EXAM_MIN_DURATION_MIN}-{EXAM_MAX_DURATION_MIN} {t('exam.minutes')}</p>
                  </div>
                </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('exam.viewSelect')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { m: 'card' as const, label: t('examTemplate.cardMode'), Icon: LayoutGrid },
                  { m: 'sheet' as const, label: t('examTemplate.singlePage'), Icon: FileText },
                  { m: 'spread' as const, label: t('examTemplate.spreadPage'), Icon: Columns2 },
                ]).map(({ m, label, Icon }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => applyViewMode(m)}
                    className={cn(
                      'flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors',
                      viewMode === m ? 'border-primary/60 bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{t('settings.examViewModeDesc')}</p>
            </div>
            <Button onClick={handleStart} disabled={isLoading} size="lg" className="w-full">
              {isLoading ? <Spinner /> : <Play className="h-4 w-4" />}
              {t('exam.startExam')}
            </Button>
            {paperNotice && <p className="text-xs text-amber-600 dark:text-amber-500">{paperNotice}</p>}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
                </CardContent>
              </Card>

              {/* ── 右侧: 试卷预览(选中模板后本地合成占位卷; 支持 单页/双页 预览, 双页下封面独占一页) ── */}
              <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card/30">
                <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-background/70 px-3 py-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">{t('examTemplate.preview')}</h2>
                  <span className="hidden text-[10px] text-muted-foreground lg:inline">{t('exam.previewPaneHint')}</span>
                  <div className="ml-auto flex items-center gap-1">
                    {template && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewView('sheet')}
                          className={cn(
                            'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]',
                            previewView === 'sheet' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent',
                          )}
                          title={t('examTemplate.singlePage')}
                        >
                          <FileText className="h-3 w-3" />
                          <span className="hidden sm:inline">{t('examTemplate.singlePage')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewView('spread')}
                          className={cn(
                            'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]',
                            previewView === 'spread' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent',
                          )}
                          title={t('examTemplate.spreadPage')}
                        >
                          <Columns2 className="h-3 w-3" />
                          <span className="hidden sm:inline">{t('examTemplate.spreadPage')}</span>
                        </button>
                      </>
                    )}
                  </div>
                </header>
                <div
                  className={cn(
                    'flex-1 bg-neutral-200/40 dark:bg-neutral-950/40',
                    previewView === 'spread' ? 'overflow-hidden' : 'overflow-auto p-3',
                  )}
                >
                  {!template ? (
                    <div className="flex min-h-[380px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
                      {t('exam.previewRequiresTemplate')}
                    </div>
                  ) : previewView === 'spread' ? (
                    <div className="flex h-[62vh] min-h-[420px] w-full justify-center overflow-hidden">
                      <PaperPreview
                        title={template.name}
                        meta={[
                          template.subject?.length ? template.subject.join('、') : '',
                          `${durationMin} ${t('exam.minutes')}`,
                        ].filter(Boolean).join(' · ')}
                        sections={previewSections}
                        answers={new Map()}
                        readOnly
                        layout="spread"
                        cover={template.cover ?? null}
                        paperLayout={template.layout ?? null}
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-[380px] justify-center">
                      <PaperPreview
                        title={template.name}
                        meta={[
                          template.subject?.length ? template.subject.join('、') : '',
                          `${durationMin} ${t('exam.minutes')}`,
                        ].filter(Boolean).join(' · ')}
                        sections={previewSections}
                        answers={new Map()}
                        readOnly
                        layout="sheet"
                        cover={template.cover ?? null}
                        paperLayout={template.layout ?? null}
                      />
                    </div>
                  )}
                </div>
              </section>
            </div>

          </TabsContent>

          <TabsContent value="appointment" className="mt-4">
            {user && <ExamSchedulePanel userId={user.id} />}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ExamHistory />
          </TabsContent>
        </Tabs>

        <AlertDialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('exam.resumeTitle')}</AlertDialogTitle>
              <AlertDialogDescription asChild className="space-y-2">
                <div>
                  <div>{t('exam.resumeDesc')}</div>
                  {pendingSession && (
                    <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                      <div>{t('exam.resumeTotal')}: {pendingSession.question_ids.length} {t('questions.total')}</div>
                      <div>{t('exam.resumeProgress')}: {pendingSession.current_index + 1} / {pendingSession.question_ids.length}</div>
                      <div>{t('exam.resumeStarted')}: {new Date(pendingSession.started_at).toLocaleString()}</div>
                      <div>{t('exam.resumeTime')}: {Math.ceil(Math.max(0, pendingSession.duration_ms - (Date.now() - new Date(pendingSession.started_at).getTime())) / 60000)} {t('exam.minutes')}</div>
                    </div>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleDiscard}>{t('exam.resumeDiscard')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleResume}>{t('exam.resumeContinue')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 lg:p-6 space-y-4 animate-pulse">
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
    )
  }

  if (error && !hasStarted) {
    return <p className="text-destructive">{error}</p>
  }

  if (!session || questions.length === 0) {
    return <p className="text-muted-foreground">{t('exam.noExam')}</p>
  }

  const currentQuestion = questions[currentIndex]
  const currentAnswer = currentQuestion ? answers.get(currentQuestion.id) ?? null : null
  const currentAnswered = currentQuestion ? isQuestionAnswered(currentQuestion, currentAnswer) : false
  const answeredCount = questions.filter((q) => isQuestionAnswered(q, answers.get(q.id))).length
  // 尚未完成的题目下标(供交卷确认时逐题提醒), 与答题卡题号(1-based)对齐
  const unfinishedIndexes = questions.reduce<number[]>((acc, q, i) => {
    if (!isQuestionAnswered(q, answers.get(q.id))) acc.push(i)
    return acc
  }, [])

  // 案例分析题计分口径展示: 模板分区「每题分值」均分到小题 (如 15 分 = 3 小题 × 5 分)
  const caseScoreText = (() => {
    const q = currentQuestion
    if (!q || q.question_type !== 'case_analysis' || !template) return ''
    const subs = q.case_questions ?? []
    if (subs.length === 0) return ''
    const sec =
      template.sections?.find(
        (s) => s.type === 'case_analysis' && (!s.subject?.length || (q.subject != null && s.subject.includes(q.subject))),
      ) ?? template.sections?.find((s) => s.type === 'case_analysis')
    const total = sec?.score ?? 0
    if (total <= 0) return ''
    const per = Math.round((total / subs.length) * 100) / 100
    const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''))
    return `总分 ${fmt(total)} 分 · 每小题 ${fmt(per)} 分`
  })()

  // 移动端卡片模式: 在整个做题区域左右滑动切换上一题/下一题
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t) swipeStartRef.current = { x: t.clientX, y: t.clientY }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    // 明显横向滑动才切题, 避免与纵向滚动 / 点按冲突
    if (Math.abs(dx) < 64 || Math.abs(dy) > Math.abs(dx) * 1.2) return
    if (dx < 0) {
      if (currentIndex < questions.length - 1) switchTo(currentIndex + 1)
    } else if (currentIndex > 0) {
      switchTo(currentIndex - 1)
    }
  }

  return (
    <div className="flex flex-col gap-0 lg:h-[calc(100vh-7rem)]">
      {/* ── 顶部工具栏: 答题卡开关 / 模式切换(单页·双页·卡片) / 计时 / 进度 / 交卷 (所有模式统一显示) ─────────── */}
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b bg-background/90 px-2 py-1.5 text-xs text-muted-foreground backdrop-blur">
        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          className={cn(
            'hidden lg:flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 transition-colors',
            sheetOpen ? 'text-muted-foreground hover:bg-accent' : 'border-primary/50 bg-accent text-foreground',
          )}
          title={sheetOpen ? t('exam.collapseSheet') : t('exam.expandSheet')}
        >
          {sheetOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          <span className="hidden lg:inline">{t('exam.answerSheet')}</span>
        </button>

        <span className="mx-1 hidden h-4 w-px shrink-0 bg-border sm:block" />

        <span className="min-w-0 max-w-[26%] shrink truncate font-medium text-foreground" title={template?.name ?? t('exam.title')}>
          {template?.name ?? t('exam.title')}
        </span>
        <span className="hidden shrink-0 text-muted-foreground md:inline">共 {questions.length} 题</span>

        {/* paper 视图(单页缩放/双页缩放·平移·全屏)查看工具栏锚点: 桌面端渲染进顶部工具栏, 移动端双页回退浮层 */}
        {paperMode && !isMobile && (
          <span ref={setSpreadToolbarEl} className="flex shrink-0 items-center gap-1" />
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {(
            [
              { m: 'sheet' as const, label: t('examTemplate.singlePage'), Icon: FileText },
              { m: 'spread' as const, label: t('examTemplate.spreadPage'), Icon: Columns2 },
              { m: 'card' as const, label: t('examTemplate.cardMode'), Icon: LayoutGrid },
            ]
          ).map(({ m, label, Icon }) => (
            <button
              key={m}
              type="button"
              onClick={() => applyViewMode(m)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 transition-colors',
                viewMode === m ? 'border-primary/60 bg-accent text-foreground' : 'hover:bg-accent',
              )}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <span className="hidden shrink-0 items-center gap-0.5 tabular-nums sm:flex">
            <span className="font-semibold text-emerald-600 dark:text-emerald-500">{answeredCount}</span>
            <span>/</span>
            <span>{questions.length}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={openSubmitConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner className="h-3 w-3" /> : <Send className="h-3 w-3" />}
            {t('exam.submitPaper')}
          </Button>
        </div>
      </div>
      {submitError && <p className="border-b px-3 py-1 text-xs text-destructive">{submitError}</p>}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── Left: Answer Sheet (desktop; 收起后侧边栏完全隐藏, 展开入口在顶部工具栏「答题卡」) ── */}
        <aside
          className={cn(
            'hidden lg:flex shrink-0 flex-col overflow-hidden bg-muted/20 transition-[width] duration-300 ease-in-out',
            sheetOpen ? 'w-[300px] border-r' : 'w-0',
          )}
        >
          {sheetOpen && (
            <div className="flex h-full min-h-0 w-[300px] flex-col">
              <div className="border-b p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">答题卡</p>
                  <div className="flex items-center gap-1.5">
                    <ExamTimer startedAt={session.started_at} durationMs={session.duration_ms} onExpire={handleTimerExpire} />
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                      title={t('exam.collapseSheet')}
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/80" />已答</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted border border-dashed border-muted-foreground/20" />未答</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="flex flex-wrap gap-2 content-start">
                  {questionIds.map((id, i) => {
                    const q = questions[i]
                    const isAnswered = q ? isQuestionAnswered(q, answers.get(id)) : false
                    const isCurrent = i === currentIndex
                    return (
                      <button key={id}
                        onClick={() => jumpLocate(i)}
                        className={cn(
                          'w-8 h-8 rounded text-xs tabular-nums transition-all border border-dashed flex items-center justify-center',
                          isCurrent && 'bg-primary text-primary-foreground border-primary',
                          !isCurrent && isAnswered && 'bg-emerald-500/80 text-white border-emerald-500',
                          !isCurrent && !isAnswered && 'text-muted-foreground border-muted-foreground/20 hover:border-muted-foreground/40',
                        )}
                      >
                        {i + 1}
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* 进度回填到答题卡底部 */}
              <div className="space-y-1.5 border-t p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">进度</span>
                  <span className="tabular-nums">{answeredCount}/{questions.length}</span>
                </div>
                <Progress value={(answeredCount / questions.length) * 100} className="h-2 [&>div]:bg-emerald-500" />
              </div>
            </div>
          )}
        </aside>


      {paperMode && (
        <div key="paper" className="wb-slide-in-right flex-1 min-w-0 flex flex-col bg-neutral-200/60 dark:bg-neutral-950/40">
          {/* 单页长卷由外层滚动; 双页摊开由 PaperSpreadView 内部 scroller 滚动, 外层不再滚动, 避免右侧叠两根滚动条 */}
          <div
            key={paperLayout}
            className={cn('wb-fade-in flex-1 min-h-0', paperLayout === 'spread' ? 'overflow-hidden' : 'overflow-y-auto')}
          >
            <PaperPreview
              title={template?.name ?? t('exam.title')}
              meta={`${Math.round(session.duration_ms / 60000)} ${t('exam.minutes')} · 共 ${questions.length} 题`}
              sections={buildPaperSections(questions, template)}
              answers={answers}
              onAnswer={answerQuestion}
              currentQuestionId={currentQuestion?.id ?? null}
              onFocus={(id) => {
                const i = questionIds.indexOf(id)
                if (i >= 0 && i !== currentIndex) jumpTo(i)
              }}
              layout={paperLayout}
              cover={template?.cover ?? null}
              paperLayout={template?.layout ?? null}
              spreadToolbarAnchor={!isMobile ? spreadToolbarEl : null}
              autoLocate={autoLocate}
              locateNonce={locateNonce}
              onToggleAutoLocate={() => setAutoLocate((v) => !v)}
            />
          </div>
        </div>
      )}
      {!paperMode && (
        <div
          className="min-w-0 flex-1 flex flex-col lg:flex-row"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
      {/* ── Center: Question ──────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col min-w-0 lg:overflow-hidden lg:border-0 border border-dashed border-muted-foreground/20 rounded-lg lg:rounded-none m-2 lg:m-0"
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b text-xs text-muted-foreground">
          <span className="font-medium text-foreground">第 {currentIndex + 1} 题</span>
          <span className="text-border">|</span>
          <span>{currentQuestion?.subject || '未分类'}</span>
          <span className="text-border">|</span>
          <span>{currentQuestion?.question_type ? t(`questionTypes.${currentQuestion.question_type}` as any) : ''}</span>
          <span className="ml-auto md:hidden">共 {questions.length} 题</span>
        </div>
        <div key={`card-qbody-${cardSlide.id}`} className={cn('flex-1 overflow-y-auto p-4 sm:p-6', cardSlide.cls)}>
          {currentQuestion && (
            <div className="max-w-2xl mx-auto space-y-6 lg:h-full flex flex-col">
              <div className="flex-1">
                <MarkdownRenderer content={currentQuestion.question_text} className="text-base leading-relaxed" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Answer Area ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 lg:border-l bg-muted/20 flex flex-col lg:border-0 border border-dashed border-muted-foreground/20 rounded-lg lg:rounded-none m-2 lg:m-0">
        <div className="p-3 border-b">
          <p className="text-sm font-semibold">作答区</p>
          <span className="text-xs text-muted-foreground">
            {currentAnswered ? `已作答 ${currentIndex + 1}/${questions.length}` : `${currentIndex + 1}/${questions.length}`}
          </span>
        </div>
        <div key={`card-answer-${cardSlide.id}`} className={cn('flex-1 overflow-y-auto p-3', cardSlide.cls)}>
          {currentQuestion && (() => {
            const q = currentQuestion
            const type = q.question_type

            if (type === 'single_choice' || type === 'multi_select') {
              const isMulti = type === 'multi_select'
              return (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">{isMulti ? '多选题，点击选项选中/取消' : '单选题，点击选项选择'}</p>
                  {q.options.map((opt, i) => {
                    const selected = currentAnswer
                    const checked = isMulti
                      ? Array.isArray(selected) && (selected as number[]).includes(i)
                      : selected === i
                    return (
                      <button key={i}
                        onClick={() => {
                          if (isMulti) {
                            const prev = (Array.isArray(selected) ? selected as number[] : [])
                            answerQuestion(q.id, prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
                          } else {
                            answerQuestion(q.id, i)
                          }
                        }}
                        className={cn(
                          'w-full text-left flex items-center gap-3 p-3 rounded-lg border transition-all text-sm',
                          checked ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30 hover:bg-accent/50',
                        )}
                      >
                        <span className={cn(
                          'w-5 h-5 border-2 flex items-center justify-center shrink-0 text-[10px] font-bold',
                          isMulti ? 'rounded' : 'rounded-full',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30',
                        )}>
                          {checked ? (isMulti ? '✓' : '●') : String.fromCharCode(65 + i)}
                        </span>
                        <span>{opt}</span>
                      </button>
                    )
                  })}
                </div>
              )
            }

            if (type === 'fill_blank') {
              const blankCount = (q.question_text.match(/_{2,}/g) || []).length || 1
              const answers = (Array.isArray(currentAnswer) ? currentAnswer as string[] : typeof currentAnswer === 'string' ? [currentAnswer] : new Array(blankCount).fill('')) as string[]
              return (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">填空题，共 {blankCount} 个空</p>
                  {Array.from({ length: blankCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 shrink-0">({i + 1})</span>
                      <input
                        type="text"
                        className="flex-1 h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder={`第 ${i + 1} 个空`}
                        value={answers[i] || ''}
                        onChange={(e) => {
                          const next = [...answers]
                          next[i] = e.target.value
                          answerQuestion(q.id, next.filter(Boolean).length ? next : next)
                        }}
                      />
                    </div>
                  ))}
                </div>
              )
            }

            if (type === 'true_false') {
              return (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">判断题，点击选择答案</p>
                  <div className="flex gap-3">
                    {[true, false].map(v => (
                      <button key={String(v)} onClick={() => answerQuestion(q.id, v)}
                        className={cn('flex-1 py-4 rounded-lg border text-base font-medium transition-all',
                          currentAnswer === v ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30')}
                      >{v ? '✓ 正确' : '✗ 错误'}</button>
                    ))}
                  </div>
                </div>
              )
            }

            if (type === 'judge_correct') {
              return (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">判断改错题，先判断对错，若错误请输入修正后的正确表述</p>
                  <div className="flex gap-3">
                    <button onClick={() => answerQuestion(q.id, true)}
                      className={cn('flex-1 py-4 rounded-lg border text-base font-medium transition-all',
                        currentAnswer === true ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30')}
                    >✓ 正确</button>
                    <button onClick={() => answerQuestion(q.id, '')}
                      className={cn('flex-1 py-4 rounded-lg border text-base font-medium transition-all',
                        currentAnswer !== null && currentAnswer !== true ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30')}
                    >✗ 错误</button>
                  </div>
                  {currentAnswer !== null && currentAnswer !== true && (
                    <input
                      type="text"
                      className="w-full h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="输入修正后的正确表述"
                      value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                      onChange={(e) => answerQuestion(q.id, e.target.value)}
                    />
                  )}
                </div>
              )
            }

            if (type === 'case_analysis') {
              const subs = q.case_questions ?? []
              const cur: CaseAnswer =
                currentAnswer && typeof currentAnswer === 'object' && !Array.isArray(currentAnswer) && 'subs' in currentAnswer
                  ? (currentAnswer as CaseAnswer)
                  : { subs: [] }
              const subValue = (id: string) => cur.subs.find((s) => s.id === id)?.value
              const setSub = (id: string, value: CorrectAnswer) => {
                answerQuestion(q.id, { subs: [...cur.subs.filter((s) => s.id !== id), { id, value }] })
              }
              const inputCls = 'w-full h-9 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring'
              return (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    案例分析题 · 共 {subs.length} 个小题{caseScoreText ? `，${caseScoreText}` : ''}，均基于上方材料作答
                  </p>
                  {subs.length === 0 && <p className="text-sm text-muted-foreground">该案例尚未配置小题</p>}
                  {subs.map((sub, si) => {
                    const val = subValue(sub.id)
                    const isSingle = sub.type === 'single_choice'
                    const isMulti = sub.type === 'multi_select'
                    const isTF = sub.type === 'true_false'
                    const isJudge = sub.type === 'judge_correct'
                    const isFill = sub.type === 'fill_blank'
                    const isShort = sub.type === 'short_answer'
                    const choice = isSingle || isMulti
                    const blanks = isFill ? Math.max(1, (sub.text.match(/_{2,}/g) || []).length) : 0
                    const blankVals = Array.isArray(val) ? (val as string[]) : val ? [String(val)] : Array(blanks).fill('')
                    return (
                      <div key={sub.id} className="space-y-2 rounded-lg border p-3">
                        <p className="text-sm leading-relaxed"><span className="mr-1.5 font-semibold text-muted-foreground">({si + 1})</span>{sub.text}</p>
                        {choice && (
                          <div className="space-y-1.5">
                            {sub.options.map((opt, oi) => {
                              const checked = isSingle ? val === oi : Array.isArray(val) && (val as number[]).includes(oi)
                              return (
                                <button key={oi} onClick={() => {
                                  if (isSingle) setSub(sub.id, oi)
                                  else {
                                    const arr = Array.isArray(val) ? [...(val as number[])] : []
                                    setSub(sub.id, arr.includes(oi) ? arr.filter((x) => x !== oi) : [...arr, oi])
                                  }
                                }}
                                  className={cn('w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-all text-sm',
                                    checked ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30 hover:bg-accent/50')}>
                                  <span className={cn('w-5 h-5 border-2 flex items-center justify-center shrink-0 text-[10px] font-bold',
                                    isMulti ? 'rounded' : 'rounded-full',
                                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30')}>
                                    {checked ? (isMulti ? '✓' : '●') : OPTION_LABELS[oi]}
                                  </span>
                                  <span>{opt}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {(isTF || isJudge) && (
                          <div className="flex gap-3">
                            {[true, false].map((v) => {
                              const on = v ? val === true : isTF ? val === false : val !== null && val !== undefined && val !== true
                              return (
                                <button key={String(v)} onClick={() => setSub(sub.id, v ? true : (isJudge ? '' : false))}
                                  className={cn('flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all',
                                    on ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/30')}>
                                  {v ? '✓ 正确' : '✗ 错误'}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {isJudge && val !== null && val !== undefined && val !== true && (
                          <input className={inputCls} value={typeof val === 'string' ? val : ''}
                            onChange={(e) => setSub(sub.id, e.target.value)} placeholder="输入修正后的正确表述" />
                        )}
                        {isFill && (
                          <div className="space-y-2">
                            {Array.from({ length: blanks }).map((_, bi) => (
                              <div key={bi} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-6 shrink-0">({bi + 1})</span>
                                <input className={inputCls} value={blankVals[bi] ?? ''}
                                  onChange={(e) => {
                                    const next = [...(Array.isArray(val) ? (val as string[]) : Array(blanks).fill(''))]
                                    next[bi] = e.target.value
                                    setSub(sub.id, next)
                                  }} placeholder={`第 ${bi + 1} 个空`} />
                              </div>
                            ))}
                          </div>
                        )}
                        {isShort && (
                          <input className={inputCls} value={typeof val === 'string' ? val : ''}
                            onChange={(e) => setSub(sub.id, e.target.value)} placeholder="输入简答答案" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            }

            return (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {{ fill_blank: '填空题，输入答案', short_answer: '简答题，输入答案', analysis: '分析题，输入分析内容', coding: '编程题，编写代码并运行测试' }[type] || '请输入答案'}
                </p>
                <textarea
                  className="w-full min-h-[200px] p-3 rounded-lg border bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="请输入答案..."
                  value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                  onChange={(e) => answerQuestion(q.id, e.target.value)}
                />
              </div>
            )
          })()}
        </div>
        <div className="p-3 border-t">
          <Button
            size="sm"
            className="w-full"
            disabled={!currentAnswered}
            onClick={() => {
              if (currentIndex < questions.length - 1) switchTo(currentIndex + 1)
            }}
          >
            {currentAnswered ? '提交本题作答' : '请先作答'}
          </Button>
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => switchTo(currentIndex - 1)} disabled={currentIndex === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />上一题
            </Button>
            <span className="text-xs text-muted-foreground">{currentIndex + 1}/{questions.length}</span>
            {currentIndex < questions.length - 1 ? (
              <Button variant="ghost" size="sm" onClick={() => switchTo(currentIndex + 1)}>
                下一题<ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      </div>)}
      </div>
      {/* Mobile answer sheet floating button */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <Button size="sm" className="shadow-lg gap-1 rounded-full px-4" onClick={() => setShowSheet(true)}>
          <span className="text-xs">答题卡</span>
          <span className="tabular-nums text-[10px] opacity-70">{answeredCount}/{questions.length}</span>
        </Button>
      </div>

      {/* Mobile answer sheet — bottom drawer */}
      {showSheet && <div className="lg:hidden fixed inset-0 z-50" onClick={() => setShowSheet(false)}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute bottom-0 inset-x-0 bg-background rounded-t-2xl p-4 pb-8 safe-area-bottom max-h-[70vh] overflow-y-auto animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">答题卡</p>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/80" />已答</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-muted border border-dashed" />未答</span>
              </div>
            </div>
            <div className="flex justify-center">
              <ExamTimer startedAt={session.started_at} durationMs={session.duration_ms} onExpire={handleTimerExpire} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>进度</span><span>{answeredCount}/{questions.length}</span>
              </div>
              <Progress value={(answeredCount / questions.length) * 100} className="h-2 [&>div]:bg-emerald-500" />
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {questionIds.map((id, i) => {
                const q = questions[i]
                const isAnswered = q ? isQuestionAnswered(q, answers.get(id)) : false
                const isCurrent = i === currentIndex
                return (
                  <button key={id} onClick={() => jumpLocate(i, true)}
                    className={cn('w-8 h-8 rounded text-xs tabular-nums border border-dashed flex items-center justify-center transition-all',
                      isCurrent && 'bg-primary text-primary-foreground border-primary',
                      !isCurrent && isAnswered && 'bg-emerald-500/80 text-white border-emerald-500',
                      !isCurrent && !isAnswered && 'text-muted-foreground border-muted-foreground/20')}>
                    {i + 1}
                  </button>
              )})}
            </div>
            <Button size="sm" className="w-full" onClick={openSubmitConfirm} disabled={isSubmitting}>
              {isSubmitting ? t('exam.submitting') : t('exam.submitPaper')}
            </Button>
          </div>
        </div>
      </div>}

      {/* 交卷二次确认弹窗 (正式考试样式下含考生信息必填) */}
      <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('exam.submitConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {t('exam.submitConfirmDesc')
                    .replace('{total}', String(questions.length))
                    .replace('{done}', String(answeredCount))
                    .replace('{left}', String(questions.length - answeredCount))}
                </p>
                {unfinishedIndexes.length > 0 && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-left">
                    <p className="mb-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      {t('exam.incompleteTitle')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {unfinishedIndexes.map((i) => (
                        <span
                          key={questions[i].id}
                          className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-amber-500/50 bg-background px-1 text-[11px] tabular-nums text-amber-600 dark:text-amber-400"
                          title={questions[i].question_text}
                        >
                          {i + 1}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      {t('exam.incompleteNote')}
                    </p>
                  </div>
                )}
                {infoRows.length > 0 && (
                  <div className="rounded-lg border p-3 text-left">
                    <p className="mb-2 text-xs font-semibold text-foreground">{t('exam.infoFillTitle')}</p>
                    <div className="space-y-2">
                      {infoRows.map((row, i) => (
                        <label key={i} className="flex items-center gap-2 text-sm">
                          <span className="w-20 shrink-0 text-xs text-foreground">{row.label}</span>
                          <input
                            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            value={candidateValues[i] ?? ''}
                            onChange={(e) =>
                              setCandidateValues((prev) => {
                                const next = [...prev]
                                next[i] = e.target.value
                                return next
                              })
                            }
                            placeholder={row.label}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {submitError && <p className="text-xs text-destructive">{submitError}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('exam.submitConfirmCancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (infoRows.length && infoRows.some((_, i) => !(candidateValues[i] ?? '').trim())) {
                  setSubmitError(t('exam.infoRequired'))
                  return
                }
                setConfirmSubmitOpen(false)
                setSubmitError('')
                await doSubmit()
              }}
            >
              {t('exam.submitConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
