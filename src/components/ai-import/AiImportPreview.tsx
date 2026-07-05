import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { AiImportQuestionCard } from './AiImportQuestionCard'
import { Check, ChevronDown, ListRestart, Plus, Sparkles, Wand2, X } from 'lucide-react'
import type { ParsedQuestion } from '@/lib/ai/types'
import { generateKeyPoints, hasAiConfig } from '@/lib/ai'
import { useT } from '@/i18n/use-t'
import { useSettingsStore } from '@/stores/settings-store'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'
import { normalizeChineseText, cleanOptionText } from '@/lib/utils'

interface Props {
  questions: ParsedQuestion[]
  selectedIds: Set<number>
  subject: string
  category: string
  existingSubjects: string[]
  existingCategories: string[]
  onSubjectChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onToggleSelect: (index: number) => void
  onToggleAll: () => void
  onChangeQuestion: (index: number, q: ParsedQuestion) => void
  onRemoveQuestion: (index: number) => void
}

export function AiImportPreview({
  questions, selectedIds, subject, category,
  existingSubjects, existingCategories,
  onSubjectChange, onCategoryChange,
  onToggleSelect, onToggleAll, onChangeQuestion, onRemoveQuestion,
}: Props) {
  const { t } = useT()
  const { isEnabled } = useSettingsStore()
  const allSelected = questions.length > 0 && selectedIds.size === questions.length
  const [batchKpLoading, setBatchKpLoading] = useState(false)
  const [showBatchManualKp, setShowBatchManualKp] = useState(false)
  const [batchManualKp, setBatchManualKp] = useState('')

  const handleBatchManualKeyPoints = () => {
    const v = batchManualKp.trim()
    if (!v || selectedIds.size === 0) return
    questions.forEach((q, i) => {
      if (selectedIds.has(i)) onChangeQuestion(i, { ...q, key_points: v })
    })
    setBatchManualKp('')
    setShowBatchManualKp(false)
  }

  const handleBatchNormalize = () => {
    questions.forEach((q, i) => {
      if (!selectedIds.has(i)) return
      onChangeQuestion(i, {
        ...q,
        question_text: normalizeChineseText(q.question_text),
        options: q.options.map(normalizeChineseText),
        analysis: q.analysis ? normalizeChineseText(q.analysis) : q.analysis,
        answer_explanation: q.answer_explanation ? normalizeChineseText(q.answer_explanation) : q.answer_explanation,
      })
    })
  }

  const handleBatchCleanOptions = () => {
    questions.forEach((q, i) => {
      if (!selectedIds.has(i)) return
      onChangeQuestion(i, {
        ...q,
        options: q.options.map(cleanOptionText),
      })
    })
  }

  const handleBatchKeyPoints = async () => {
    setBatchKpLoading(true)
    const targets = questions.filter((q, i) => selectedIds.has(i) && q.question_text.trim() && !q.key_points?.trim())
    for (const q of targets) {
      try {
        const idx = questions.indexOf(q)
        let answerStr = ''
        const type = q.question_type
        if (type === 'single_choice' && typeof q.correct_answer === 'number') answerStr = q.options[q.correct_answer] ?? ''
        else if (type === 'multi_select' && Array.isArray(q.correct_answer)) answerStr = (q.correct_answer as number[]).map((i) => q.options[i]).join('、')
        else if (type === 'true_false') answerStr = q.correct_answer ? '正确' : '错误'
        else if (type === 'judge_correct') answerStr = q.correct_answer === true ? '正确' : `修正：${q.correct_answer}`
        else if (typeof q.correct_answer === 'string') answerStr = q.correct_answer
        else if (Array.isArray(q.correct_answer)) answerStr = q.correct_answer.join('；')
        const result = await generateKeyPoints({
          questionText: q.question_text.trim(),
          questionType: QUESTION_TYPE_LABELS[type] || type,
          options: ['single_choice', 'multi_select'].includes(type) ? q.options.filter((o) => o.trim()) : undefined,
          correctAnswer: answerStr || undefined,
          analysis: q.analysis?.trim() || undefined,
        })
        onChangeQuestion(idx, { ...q, key_points: result })
      } catch { /* skip */ }
    }
    setBatchKpLoading(false)
  }

  const [subjectList, setSubjectList] = useState<string[]>([])
  const [categoryList, setCategoryList] = useState<string[]>([])
  const [newSubject, setNewSubject] = useState('')
  const [newCategory, setNewCategory] = useState('')

  // Use combined list: existing + locally added
  const allSubjects = [...new Set([...existingSubjects, ...subjectList])].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const allCategories = [...new Set([...existingCategories, ...categoryList])].sort((a, b) => a.localeCompare(b, 'zh-CN'))

  const handleAddSubject = () => {
    const v = newSubject.trim()
    if (!v) return
    if (!allSubjects.includes(v)) setSubjectList(prev => [...prev, v])
    onSubjectChange(v)
    setNewSubject('')
  }

  const handleAddCategory = () => {
    const v = newCategory.trim()
    if (!v) return
    if (!allCategories.includes(v)) setCategoryList(prev => [...prev, v])
    onCategoryChange(v)
    setNewCategory('')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t('ai_import.preview')} ({questions.length})
        </h3>
        <div className="flex items-center gap-2">
          <button type="button"
            className={`shrink-0 w-4 h-4 rounded flex items-center justify-center border-2 transition-colors cursor-pointer ${
              allSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'
            }`}
            onClick={onToggleAll}
          >
            {allSelected && <Check className="h-3 w-3" />}
          </button>
          <button type="button" className="text-xs hover:text-foreground text-muted-foreground transition-colors" onClick={onToggleAll}>
            {allSelected ? '取消全选' : '全选'}
            <span className="ml-1 text-muted-foreground/60 tabular-nums">({selectedIds.size}/{questions.length})</span>
          </button>
          {hasAiConfig() && isEnabled('keypoints') && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-6 gap-1"
              disabled={batchKpLoading || selectedIds.size === 0}
              onClick={handleBatchKeyPoints}
              title="对选中题目批量 AI 生成知识点（跳过已有知识点的题目）"
            >
              <Sparkles className={`h-3 w-3 ${batchKpLoading ? 'animate-pulse' : ''}`} />
              批量生成知识点
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-6 gap-1"
            disabled={selectedIds.size === 0}
            onClick={handleBatchNormalize}
            title="对选中题目的题干、选项、解析进行文字标准化（中英文间加空格、标点全角化）"
          >
            <Wand2 className="h-3 w-3" />
            标准化
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-6 gap-1"
            disabled={selectedIds.size === 0}
            onClick={handleBatchCleanOptions}
            title="清理选中题目选项中的 AI 生成标签前缀（A. / A、/ 1. 等）"
          >
            <ListRestart className="h-3 w-3" />
            清理选项
          </Button>
          {showBatchManualKp ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                placeholder="知识点..."
                value={batchManualKp}
                onChange={(e) => setBatchManualKp(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBatchManualKeyPoints() }}
                className="h-6 text-xs w-[120px]"
              />
              <Button size="sm" className="text-xs h-6 px-2" onClick={handleBatchManualKeyPoints} disabled={!batchManualKp.trim() || selectedIds.size === 0}>
                确定
              </Button>
              <Button size="sm" variant="ghost" className="text-xs h-6 px-1" onClick={() => { setShowBatchManualKp(false); setBatchManualKp('') }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-6 gap-1"
              disabled={selectedIds.size === 0}
              onClick={() => setShowBatchManualKp(true)}
              title="对选中的题目统一设置相同的知识点"
            >
              <Plus className="h-3 w-3" />
              统一设置知识点
            </Button>
          )}
        </div>
      </div>

      {/* Subject & Category */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">{t('questions.subject')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
              {subject || t('questions.subject')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => onSubjectChange('')}>
              <span className="text-muted-foreground">{t('questions.subject')}</span>
              {!subject && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {allSubjects.map((s) => (
              <DropdownMenuItem key={s} onClick={() => onSubjectChange(s)}>
                {s}
                {subject === s && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <div className="flex items-center gap-1 px-2 py-1" onKeyDown={(e) => e.stopPropagation()}>
              <Input
                placeholder="新增学科..."
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubject() } }}
                className="h-7 text-xs flex-1"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleAddSubject} disabled={!newSubject.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-xs text-muted-foreground shrink-0">{t('questions.category')}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8">
              {category || t('questions.category')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => onCategoryChange('')}>
              <span className="text-muted-foreground">{t('questions.category')}</span>
              {!category && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            {allCategories.map((c) => (
              <DropdownMenuItem key={c} onClick={() => onCategoryChange(c)}>
                {c}
                {category === c && <Check className="h-4 w-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <div className="flex items-center gap-1 px-2 py-1" onKeyDown={(e) => e.stopPropagation()}>
              <Input
                placeholder="新增分类..."
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory() } }}
                className="h-7 text-xs flex-1"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleAddCategory} disabled={!newCategory.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="max-h-[70vh] pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {questions.map((q, i) => (
            <AiImportQuestionCard
              key={i}
              question={q}
              index={i}
              selected={selectedIds.has(i)}
              subject={subject}
              category={category}
              onToggleSelect={() => onToggleSelect(i)}
              onChange={(updated) => onChangeQuestion(i, updated)}
              onRemove={() => onRemoveQuestion(i)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
