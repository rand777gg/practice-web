import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { naturalSort } from '@/lib/utils'
import { useQuestions } from '@/hooks/use-questions'
import { useQuestionFilters } from '@/hooks/use-question-filters'
import type { QuestionType } from '@/types'
import { QUESTION_TYPE_OPTIONS, IMPORT_MODE_OPTIONS, PAGE_SIZE_OPTIONS } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
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
import { Skeleton } from '@/components/ui/skeleton'
import { QuestionImportDialog } from '@/components/questions/QuestionImportDialog'
import { SubjectExplanationManagerDialog } from '@/components/practice/SubjectExplanationManagerDialog'
import { QuestionList } from '@/components/questions/QuestionList'
import { Upload, Plus, Check, ChevronDown, ChevronLeft, ChevronRight, Sparkles, Trash2, FlaskConical, BookOpen } from 'lucide-react'
import { useT } from '@/i18n/use-t'

export function Component() {
  const { t } = useT()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const { questions, count, isLoading, page, totalPages, pageSize, deleteQuestion, fetchQuestions, refetch } = useQuestions()
  const currentFilterParams = () => ({ search, subject: selectedSubject, category: selectedCategory, questionType: selectedType, importMode: selectedImportMode, verified: selectedVerified, keyPoints: selectedKeyPoints, issueFlag: selectedIssueFlag })
  const { subjects, filteredCategories, updateFilteredCategories } = useQuestionFilters()
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single'; id: string } | { type: 'bulk'; count: number } | null>(null)
  const [selectedSubject, setSelectedSubject] = useState(() => new URLSearchParams(window.location.search).get('subject') || '')
  const [selectedCategory, setSelectedCategory] = useState(() => new URLSearchParams(window.location.search).get('category') || '')
  const [selectedType, setSelectedType] = useState<QuestionType | ''>(() => (new URLSearchParams(window.location.search).get('type') || '') as QuestionType | '')
  const [selectedImportMode, setSelectedImportMode] = useState(() => new URLSearchParams(window.location.search).get('import') || '')
  const [selectedVerified, setSelectedVerified] = useState<'' | 'true' | 'false'>(() => (new URLSearchParams(window.location.search).get('verified') || '') as '' | 'true' | 'false')
  const [selectedKeyPoints, setSelectedKeyPoints] = useState(() => new URLSearchParams(window.location.search).get('kp') || '')
  const [selectedIssueFlag, setSelectedIssueFlag] = useState<'' | 'suspected' | 'confirmed'>(() => (new URLSearchParams(window.location.search).get('issue') || '') as '' | 'suspected' | 'confirmed')

  const [expandedBtn, setExpandedBtn] = useState<number | null>(null)
  const btnRowRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initRef = useRef(true)

  useEffect(() => {
    if (expandedBtn === null) return
    const handler = (e: MouseEvent) => {
      if (btnRowRef.current && !btnRowRef.current.contains(e.target as Node)) {
        setExpandedBtn(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expandedBtn])

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [subjects],
  )
  const yearCategories = useMemo(
    () => filteredCategories.filter((c) => /^\d{4}年真题$/.test(c)).sort((a, b) => b.localeCompare(a)),
    [filteredCategories],
  )
  const nonYearCategories = useMemo(
    () => filteredCategories.filter((c) => !/^\d{4}年真题$/.test(c)),
    [filteredCategories],
  )

  // Load distinct key_points — re-fetch when subject changes
  const [kpsBySubject, setKpsBySubject] = useState<Map<string, string[]>>(new Map())
  const [subjectCounts, setSubjectCounts] = useState<Map<string, number>>(new Map())
  const [categoryCounts, setCategoryCounts] = useState<Map<string, number>>(new Map())
  const [kpCounts, setKpCounts] = useState<Map<string, number>>(new Map())

  // Load metadata grouped by subject (paginated, for submenu structure + counts)
  const loadMetaData = useCallback(async () => {
    const kpMap = new Map<string, Set<string>>()
    const subCounts = new Map<string, number>()
    const catCounts = new Map<string, number>()
    const kpCounts = new Map<string, number>()
    const PAGE = 1000; let from = 0
    while (true) {
      const { data } = await supabase.from('questions').select('subject, key_points, category, categories').order('id').range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      for (const q of data) {
        const s = q.subject || '未分类'
        subCounts.set(s, (subCounts.get(s) ?? 0) + 1)
        if (q.key_points) {
          let kps = kpMap.get(s); if (!kps) { kps = new Set(); kpMap.set(s, kps) }
          kps.add(q.key_points)
          kpCounts.set(q.key_points, (kpCounts.get(q.key_points) ?? 0) + 1)
        }
        const cats: string[] = (q.categories?.length ? q.categories : q.category ? [q.category] : []) as string[]
        for (const c of cats) catCounts.set(c, (catCounts.get(c) ?? 0) + 1)
      }
      if (data.length < PAGE) break
      from += PAGE
    }
    const result = new Map<string, string[]>()
    for (const [s, kps] of kpMap) result.set(s, [...kps].sort(naturalSort))
    setKpsBySubject(result)
    setSubjectCounts(subCounts)
    setCategoryCounts(catCounts)
    setKpCounts(kpCounts)
  }, [])

  useEffect(() => { loadMetaData() }, [loadMetaData])

  // Trigger fetch when filters or search change
  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchQuestions({
        page: 1,
        search,
        subject: selectedSubject,
        category: selectedCategory,
        questionType: selectedType,
        importMode: selectedImportMode,
        verified: selectedVerified,
        keyPoints: selectedKeyPoints,
        issueFlag: selectedIssueFlag,
      })
    }, 300)
    return () => { if (debounceRef.current !== null) clearTimeout(debounceRef.current) }
  }, [search, selectedSubject, selectedCategory, selectedType, selectedImportMode, selectedVerified, selectedKeyPoints, selectedIssueFlag, fetchQuestions])

  // Update filtered categories and reset category when subject changes
  // Update filtered categories and reset category when subject changes
  useEffect(() => {
    updateFilteredCategories(selectedSubject)
    if (initRef.current) { initRef.current = false; return }
    setSelectedCategory('')
  }, [selectedSubject, updateFilteredCategories])

  // Sync filters to URL params
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedSubject) params.set('subject', selectedSubject)
    if (selectedCategory) params.set('category', selectedCategory)
    if (selectedType) params.set('type', selectedType)
    if (selectedImportMode) params.set('import', selectedImportMode)
    if (selectedVerified) params.set('verified', selectedVerified)
    if (selectedKeyPoints) params.set('kp', selectedKeyPoints)
    if (selectedIssueFlag) params.set('issue', selectedIssueFlag)
    setSearchParams(params, { replace: true })
  }, [selectedSubject, selectedCategory, selectedType, selectedImportMode, selectedVerified, selectedKeyPoints, selectedIssueFlag, setSearchParams])

  // Pre-fill bulk key points from filter
  useEffect(() => {
    if (selectedKeyPoints) { setBulkKeyPoints(selectedKeyPoints); setNewKeyPointsInput(selectedKeyPoints) }
  }, [selectedKeyPoints])

  // Pre-fill bulk category from filter
  useEffect(() => {
    if (selectedCategory) setBulkCategory(selectedCategory)
  }, [selectedCategory])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === questions.length && questions.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)))
    }
  }

  const [bulkSubject, setBulkSubject] = useState('')
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkKeyPoints, setBulkKeyPoints] = useState('')
  const [newSubjectInput, setNewSubjectInput] = useState('')
  const [newKeyPointsInput, setNewKeyPointsInput] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    setDeleteConfirm(null)
    const ids = [...selectedIds]
    await supabase.from('questions').delete().in('id', ids)
    setSelectedIds(new Set())
    setBulkDeleting(false)
    refetch()
  }

  const handleSingleDelete = async (id: string) => {
    setDeleteConfirm(null)
    await deleteQuestion(id)
  }

  const setIssueFlag = async (id: string, flag: 'none' | 'suspected' | 'confirmed') => {
    await supabase.from('questions').update({
      issue_flag: flag,
      issue_note: flag === 'none' ? null : undefined,
      flagged_at: flag === 'none' ? null : new Date().toISOString(),
    }).eq('id', id)
    refetch()
  }

  const [kpConfirm, setKpConfirm] = useState<{ oldKp: string; newKp: string; selectedCount: number; totalCount: number } | null>(null)
  const [catConfirm, setCatConfirm] = useState<{ oldCat: string; newCat: string; selectedCount: number; totalCount: number } | null>(null)

  const applyBulkUpdate = async (ids: string[], data: Record<string, unknown>) => {
    setBulkUpdating(true)
    if (ids.length > 0) {
      await supabase.from('questions').update(data).in('id', ids)
    } else if (catConfirm) {
      await supabase.from('questions').update({ category: data.category, categories: data.categories }).eq('category', catConfirm.oldCat)
    } else {
      await supabase.from('questions').update({ key_points: data.key_points }).eq('key_points', kpConfirm?.oldKp ?? '')
    }
    setBulkSubject('')
    setBulkCategory('')
    setBulkKeyPoints('')
    setSelectedIds(new Set())
    setBulkUpdating(false)
    if (kpConfirm?.oldKp && selectedKeyPoints === kpConfirm.oldKp) {
      setSelectedKeyPoints(kpConfirm.newKp)
    } else if (data.key_points && selectedKeyPoints) {
      setSelectedKeyPoints(data.key_points as string)
    }
    setKpConfirm(null)
    setCatConfirm(null)
    refetch()
    loadMetaData()
  }

  const handleBulkUpdate = async () => {
    if (!bulkSubject && !bulkCategory && !bulkKeyPoints) return
    const ids = [...selectedIds]
    const data: Record<string, unknown> = {}
    if (bulkSubject) data.subject = bulkSubject
    if (bulkCategory) { data.category = bulkCategory; data.categories = [bulkCategory] }
    if (bulkKeyPoints) data.key_points = bulkKeyPoints

    // If changing key points with active filter, check for unselected matching questions
    if (bulkKeyPoints && selectedKeyPoints && selectedKeyPoints !== bulkKeyPoints) {
      const { count } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('key_points', selectedKeyPoints)
      const total = count ?? 0
      if (total > ids.length) {
        setKpConfirm({ oldKp: selectedKeyPoints, newKp: bulkKeyPoints, selectedCount: ids.length, totalCount: total })
        return
      }
    }
    // Same check for category
    if (bulkCategory && selectedCategory && selectedCategory !== bulkCategory) {
      const { count } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('category', selectedCategory)
      const total = count ?? 0
      if (total > ids.length) {
        setCatConfirm({ oldCat: selectedCategory, newCat: bulkCategory, selectedCount: ids.length, totalCount: total })
        return
      }
    }
    applyBulkUpdate(ids, data)
  }

  const clearSelection = () => setSelectedIds(new Set())

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
<p className="text-sm text-muted-foreground">{count} {t('questions.total')}</p>
        </div>
        <div className="flex gap-2" ref={btnRowRef}>
          {([
            { icon: Sparkles, label: 'AI 智能解析', to: '/admin/ai-import', variant: 'outline' as const, className: 'ai-nav-item' },
            { icon: FlaskConical, label: '测试题目', to: '/admin/questions/test', variant: 'outline' as const },
            { icon: BookOpen, label: '编排说明', action: () => setExplainOpen(true), variant: 'outline' as const },
            { icon: Upload, label: t('questions.import'), action: () => setShowImport(true), variant: 'outline' as const },
            { icon: Plus, label: t('questions.addQuestion'), to: '/admin/questions/new', variant: 'default' as const },
          ]).map((btn, i) => {
            const isExpanded = expandedBtn === i
            const Icon = btn.icon
            const sharedClass = `shrink-0 gap-0 transition-all duration-300 ease-out sm:px-3 sm:gap-2 ${isExpanded ? 'px-3 gap-2' : 'px-1.5'}`
            const labelSpan = (
              <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ease-out sm:max-w-[120px] sm:opacity-100 sm:pl-0 ${isExpanded ? 'max-w-[120px] opacity-100 pl-2' : 'max-w-0 opacity-0 pl-0'}`}>
                {btn.label}
              </span>
            )

            const handleClick = () => {
              if (window.innerWidth >= 640) {
                if ('to' in btn && btn.to) navigate(btn.to)
                else btn.action?.()
              } else if (isExpanded) {
                setExpandedBtn(null)
                if ('to' in btn && btn.to) navigate(btn.to)
                else btn.action?.()
              } else {
                setExpandedBtn(i)
              }
            }

            return (
              <Button
                key={i}
                variant={btn.variant}
                size="sm"
                className={`${sharedClass} ${btn.className ?? ''}`}
                onClick={handleClick}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {labelSpan}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedSubject || t('questions.subject')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedSubject('')}>
              <span className="text-muted-foreground">学科（A-Z）</span>
              {!selectedSubject && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {sortedSubjects.map((s) => (
              <DropdownMenuItem key={s} onClick={() => setSelectedSubject(s)}>
                <span>{s}</span>
                <span className="ml-auto text-muted-foreground text-[10px] tabular-nums mr-1">{subjectCounts.get(s) ?? 0}</span>
                {selectedSubject === s && <Check className="h-3 w-3" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedCategory || t('questions.category')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => setSelectedCategory('')}>
              <span className="text-muted-foreground">{t('questions.category')}</span>
              {!selectedCategory && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSelectedCategory('__unset__')}>
              未分类
              {selectedCategory === '__unset__' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {yearCategories.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    历年真题
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {yearCategories.map((c) => (
                      <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                        <span>{c}</span>
                        <span className="ml-auto text-muted-foreground text-[10px] tabular-nums mr-1">{categoryCounts.get(c) ?? 0}</span>
                        {selectedCategory === c && <Check className="h-3 w-3" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            {nonYearCategories.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {nonYearCategories.map((c) => (
                  <DropdownMenuItem key={c} onClick={() => setSelectedCategory(c)}>
                    <span>{c}</span>
                    <span className="ml-auto text-muted-foreground text-[10px] tabular-nums mr-1">{categoryCounts.get(c) ?? 0}</span>
                    {selectedCategory === c && <Check className="h-3 w-3" />}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedType ? t(`questionTypes.${selectedType}` as any) : t('questions.questionType')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedType('')}>
              <span className="text-muted-foreground">{t('questions.questionType')}</span>
              {!selectedType && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {QUESTION_TYPE_OPTIONS.map((qt) => (
              <DropdownMenuItem key={qt.value} onClick={() => setSelectedType(qt.value)}>
                {qt.label}
                {selectedType === qt.value && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedImportMode ? IMPORT_MODE_OPTIONS.find((m) => m.value === selectedImportMode)?.label : '导入模式'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedImportMode('')}>
              <span className="text-muted-foreground">导入模式</span>
              {!selectedImportMode && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {IMPORT_MODE_OPTIONS.map((m) => (
              <DropdownMenuItem key={m.value} onClick={() => setSelectedImportMode(m.value)}>
                {m.label}
                {selectedImportMode === m.value && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              {selectedVerified === 'true' ? '已验证' : selectedVerified === 'false' ? '待验证' : '验证状态'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedVerified('')}>
              <span className="text-muted-foreground">验证状态</span>
              {!selectedVerified && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedVerified('true')}>
              已验证
              {selectedVerified === 'true' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedVerified('false')}>
              待验证
              {selectedVerified === 'false' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={`gap-1 text-xs ${selectedIssueFlag ? 'border-amber-500/60 text-amber-600 dark:text-amber-400' : ''}`}>
              {selectedIssueFlag === 'suspected' ? '⚠ 疑似有错' : selectedIssueFlag === 'confirmed' ? '⚠ 已确认' : '问题标记'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setSelectedIssueFlag('')}>
              <span className="text-muted-foreground">问题标记</span>
              {!selectedIssueFlag && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedIssueFlag('suspected')}>
              疑似有错
              {selectedIssueFlag === 'suspected' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedIssueFlag('confirmed')}>
              已确认有错
              {selectedIssueFlag === 'confirmed' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {kpsBySubject.size > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 text-xs">
                {selectedKeyPoints === '__none__' ? '未设置' : (selectedKeyPoints || '知识点')}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              <DropdownMenuItem onClick={() => setSelectedKeyPoints('')}>
                <span className="text-muted-foreground">知识点</span>
                {!selectedKeyPoints && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSelectedKeyPoints('__none__')}>
                <span className="text-amber-500">未设置</span>
                {selectedKeyPoints === '__none__' && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {[...kpsBySubject.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([subject, kps]) => (
                <DropdownMenuSub key={subject}>
                  <DropdownMenuSubTrigger>{subject}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                    {kps.map((kp) => (
                      <DropdownMenuItem key={kp} onClick={() => setSelectedKeyPoints(kp)}>
                        <span>{kp}</span>
                        <span className="ml-auto text-muted-foreground text-[10px] tabular-nums mr-1">{kpCounts.get(kp) ?? 0}</span>
                        {selectedKeyPoints === kp && <Check className="h-3 w-3" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Input
        placeholder={t('questions.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="flex gap-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-md" />)}
          </div>
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <div className="flex gap-6">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-4 w-16" />)}
              </div>
            </div>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="border-b px-4 py-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <QuestionList
            questions={questions}
            onDelete={async (id) => { setDeleteConfirm({ type: 'single', id }) }}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onSetIssue={setIssueFlag}
          />
          {selectedIds.size > 0 && (
            <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 py-3 bg-background border-t flex items-center justify-between gap-3 rounded-b-lg flex-wrap">
              <span className="text-sm text-muted-foreground">已选 <strong className="text-foreground">{selectedIds.size}</strong> 道题目</span>
              <div className="flex items-center gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
                      {bulkSubject || '设置学科'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Input
                        value={newSubjectInput}
                        onChange={(e) => setNewSubjectInput(e.target.value)}
                        placeholder="新建学科"
                        className="h-7 text-xs"
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter' && newSubjectInput.trim()) {
                            setBulkSubject(newSubjectInput.trim())
                            setNewSubjectInput('')
                            e.currentTarget.blur()
                          }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        disabled={!newSubjectInput.trim()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => { setBulkSubject(newSubjectInput.trim()); setNewSubjectInput('') }}
                      >
                        新建
                      </Button>
                    </div>
                    <DropdownMenuItem onClick={() => setBulkSubject('')}>
                      <span className="text-muted-foreground">不设置</span>
                      {!bulkSubject && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                    {bulkSubject && !subjects.includes(bulkSubject) && (
                      <DropdownMenuItem onClick={() => setBulkSubject(bulkSubject)}>
                        {bulkSubject}
                        <Check className="h-4 w-4 ml-auto" />
                      </DropdownMenuItem>
                    )}
                    {subjects.map((s) => (
                      <DropdownMenuItem key={s} onClick={() => setBulkSubject(s)}>
                        {s}
                        {bulkSubject === s && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
                      {bulkCategory || '设置分类'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Input
                        value={bulkCategory}
                        onChange={(e) => setBulkCategory(e.target.value)}
                        placeholder="输入或选择分类"
                        className="h-7 text-xs"
                      />
                    </div>
                    <DropdownMenuItem onClick={() => setBulkCategory('')}>
                      <span className="text-muted-foreground">不设置</span>
                      {!bulkCategory && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {filteredCategories.map((c) => (
                      <DropdownMenuItem key={c} onSelect={(e) => { e.preventDefault(); setBulkCategory(c) }}>
                        {c}
                        {bulkCategory === c && <Check className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
                      {bulkKeyPoints || '设置知识点'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto min-w-[220px]">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b">
                      <Input
                        value={newKeyPointsInput}
                        onChange={(e) => setNewKeyPointsInput(e.target.value)}
                        placeholder="输入或选择知识点"
                        className="h-7 text-xs"
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter' && newKeyPointsInput.trim()) {
                            setBulkKeyPoints(newKeyPointsInput.trim())
                            setNewKeyPointsInput('')
                            e.currentTarget.blur()
                          }
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        disabled={!newKeyPointsInput.trim()}
                        onClick={() => { setBulkKeyPoints(newKeyPointsInput.trim()); setNewKeyPointsInput('') }}
                      >
                        确定
                      </Button>
                    </div>
                    <DropdownMenuItem onClick={() => setBulkKeyPoints('')}>
                      <span className="text-muted-foreground">不设置</span>
                      {!bulkKeyPoints && <Check className="h-4 w-4 ml-auto" />}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {[...kpsBySubject.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([subject, kps]) => (
                      <DropdownMenuSub key={subject}>
                        <DropdownMenuSubTrigger>{subject}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                          {kps.map((kp) => (
                            <DropdownMenuItem key={kp} onSelect={(e) => { e.preventDefault(); setNewKeyPointsInput(kp) }}>
                              <span>{kp}</span>
                              <span className="ml-auto text-muted-foreground text-[10px] tabular-nums mr-1">{kpCounts.get(kp) ?? 0}</span>
                              {bulkKeyPoints === kp && <Check className="h-3 w-3" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="default" size="sm" disabled={bulkUpdating || (!bulkSubject && !bulkCategory && !bulkKeyPoints)}
                  onClick={handleBulkUpdate}>
                  {bulkUpdating ? '应用中...' : '应用'}
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>取消选择</Button>
                <Button variant="destructive" size="sm" disabled={bulkDeleting}
                  onClick={() => setDeleteConfirm({ type: 'bulk', count: selectedIds.size })}>
                  <Trash2 className="h-4 w-4" />
                  {bulkDeleting ? '删除中...' : `删除选中 (${selectedIds.size})`}
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 pt-4">
            {totalPages > 1 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => fetchQuestions({
                    page: page - 1,
                    search,
                    subject: selectedSubject,
                    category: selectedCategory,
                    questionType: selectedType,
                    importMode: selectedImportMode,
                    verified: selectedVerified,
                    keyPoints: selectedKeyPoints,
                    issueFlag: selectedIssueFlag,
                  })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-3 tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => fetchQuestions({
                    page: page + 1,
                    search,
                    subject: selectedSubject,
                    category: selectedCategory,
                    questionType: selectedType,
                    importMode: selectedImportMode,
                    verified: selectedVerified,
                    keyPoints: selectedKeyPoints,
                    issueFlag: selectedIssueFlag,
                  })}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                  {pageSize} 条/页
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <DropdownMenuItem key={n} onClick={() => fetchQuestions({ ...currentFilterParams(), pageSize: n, page: 1 })}>
                    {n} 条/页
                    {pageSize === n && <Check className="h-4 w-4 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}

      <QuestionImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={refetch}
      />

      <SubjectExplanationManagerDialog open={explainOpen} onOpenChange={setExplainOpen} />

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === 'single'
                ? '确定要删除这道题目吗？删除后不可恢复。'
                : `确定要删除选中的 ${deleteConfirm?.type === 'bulk' ? deleteConfirm.count : 0} 道题目吗？删除后不可恢复。`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteConfirm) return
                if (deleteConfirm.type === 'single') handleSingleDelete(deleteConfirm.id)
                else handleBulkDelete()
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!kpConfirm} onOpenChange={() => setKpConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>同步修改知识点</AlertDialogTitle>
            <AlertDialogDescription>
              已选中 {kpConfirm?.selectedCount} 道题，但知识点为「{kpConfirm?.oldKp}」的题目共有 {kpConfirm?.totalCount} 道。
              是否将 {kpConfirm?.totalCount} 道题全部改为「{kpConfirm?.newKp}」？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              if (kpConfirm) applyBulkUpdate([...selectedIds], { key_points: kpConfirm.newKp })
            }}>
              仅修改已选中
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (kpConfirm) applyBulkUpdate([], { key_points: kpConfirm.newKp })
            }}>
              全部修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!catConfirm} onOpenChange={() => setCatConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>同步修改分类</AlertDialogTitle>
            <AlertDialogDescription>
              已选中 {catConfirm?.selectedCount} 道题，但分类为「{catConfirm?.oldCat}」的题目共有 {catConfirm?.totalCount} 道。
              是否将 {catConfirm?.totalCount} 道题全部改为「{catConfirm?.newCat}」？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              if (catConfirm) applyBulkUpdate([...selectedIds], { category: catConfirm.newCat, categories: [catConfirm.newCat] })
            }}>
              仅修改已选中
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (catConfirm) applyBulkUpdate([], { category: catConfirm.newCat, categories: [catConfirm.newCat] })
            }}>
              全部修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
