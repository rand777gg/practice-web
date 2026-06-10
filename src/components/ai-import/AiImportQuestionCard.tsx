import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MarkdownEditor } from '@/components/markdown/MarkdownEditor'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Check, ChevronDown, Sparkles, Trash2 } from 'lucide-react'
import { QUESTION_TYPE_OPTIONS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { QuestionType } from '@/types'
import { generateKeyPoints, hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'

function circled(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x245f + n)
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21)
  return `#${n}`
}

interface Props {
  question: ParsedQuestion
  index: number
  selected: boolean
  onToggleSelect: () => void
  onChange: (q: ParsedQuestion) => void
  onRemove: () => void
}

export function AiImportQuestionCard({ question, index, selected, onToggleSelect, onChange, onRemove }: Props) {
  const patch = (partial: Partial<ParsedQuestion>) => onChange({ ...question, ...partial })
  const type = question.question_type
  const { isEnabled } = useSettingsStore()
  const [kpLoading, setKpLoading] = useState(false)

  const handleGenerateKeyPoints = async () => {
    if (!question.question_text.trim()) return
    setKpLoading(true)
    try {
      let answerStr = ''
      if (type === 'single_choice' && typeof question.correct_answer === 'number') answerStr = question.options[question.correct_answer] ?? ''
      else if (type === 'multi_select' && Array.isArray(question.correct_answer)) answerStr = (question.correct_answer as number[]).map((i) => question.options[i]).join('、')
      else if (type === 'true_false') answerStr = question.correct_answer ? '正确' : '错误'
      else if (type === 'judge_correct') answerStr = question.correct_answer === true ? '正确' : `修正：${question.correct_answer}`
      else if (typeof question.correct_answer === 'string') answerStr = question.correct_answer
      else if (Array.isArray(question.correct_answer)) answerStr = question.correct_answer.join('；')
      const result = await generateKeyPoints({
        questionText: question.question_text.trim(),
        questionType: QUESTION_TYPE_LABELS[type] || type,
        options: ['single_choice', 'multi_select'].includes(type) ? question.options.filter((o) => o.trim()) : undefined,
        correctAnswer: answerStr || undefined,
        analysis: question.analysis?.trim() || undefined,
        answerExplanation: question.answer_explanation?.trim() || undefined,
      })
      patch({ key_points: result })
    } catch { /* ignore */ }
    setKpLoading(false)
  }

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${selected ? 'border-primary bg-primary/5' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <button type="button"
          className={`shrink-0 w-5 h-5 rounded flex items-center justify-center border-2 transition-colors
            ${selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'}`}
          onClick={onToggleSelect}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>

        <span className="text-xs text-muted-foreground font-medium">{circled(index + 1)}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              {QUESTION_TYPE_LABELS[type]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {QUESTION_TYPE_OPTIONS.map((o) => (
              <DropdownMenuItem key={o.value} onClick={() => {
                const newType = o.value as QuestionType
                if (newType === 'true_false') patch({ question_type: newType, options: ['正确', '错误'], correct_answer: true })
                else if (newType === 'judge_correct') patch({ question_type: newType, options: [], correct_answer: true })
                else if (['fill_blank','short_answer','analysis'].includes(newType)) patch({ question_type: newType, options: [], correct_answer: '' })
                else patch({ question_type: newType })
              }}>
                {o.label}
                {type === o.value && <Check className="h-3.5 w-3.5 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      {/* Question text */}
      <MarkdownEditor
        value={question.question_text}
        onChange={(v) => patch({ question_text: v })}
        placeholder="题干"
        minHeight="60px"
        className="text-sm"
      />

      {/* Key points — right after question text, always visible */}
      <div className="relative">
        <Input
          value={question.key_points || ''}
          onChange={(e) => patch({ key_points: e.target.value })}
          className="h-8 text-xs pr-8"
          placeholder="知识点，逗号分隔"
        />
        {hasAiConfig() && isEnabled('keypoints') && (
          <Button type="button" variant="ghost" size="icon"
            className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7"
            disabled={kpLoading || !question.question_text.trim()}
            onClick={handleGenerateKeyPoints}
            title="AI 生成知识点"
          >
            <Sparkles className={`h-3.5 w-3.5 ${kpLoading ? 'animate-pulse' : ''}`} />
          </Button>
        )}
      </div>

      {/* Options (for choice types) */}
      {['single_choice','multi_select'].includes(type) && (
        <div className="space-y-1 pl-1">
          {question.options.map((opt, oi) => {
            const isCorrect = type === 'single_choice'
              ? question.correct_answer === oi
              : Array.isArray(question.correct_answer) && (question.correct_answer as number[]).includes(oi)

            return (
              <div key={oi} className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5">
                {type === 'single_choice' ? (
                  <input type="radio" name={`q-${index}`} checked={isCorrect} onChange={() => patch({ correct_answer: oi })}
                    className="shrink-0 h-3.5 w-3.5 accent-primary cursor-pointer" />
                ) : (
                  <input type="checkbox" checked={isCorrect} onChange={() => {
                    const arr: number[] = Array.isArray(question.correct_answer) ? [...question.correct_answer as number[]] : []
                    const idx = arr.indexOf(oi)
                    if (idx >= 0) arr.splice(idx, 1)
                    else arr.push(oi)
                    patch({ correct_answer: arr })
                  }}
                    className="shrink-0 h-3.5 w-3.5 accent-primary cursor-pointer" />
                )}
                <span className="text-[11px] text-muted-foreground w-4 tabular-nums shrink-0">{String.fromCharCode(65 + oi)}</span>
                <Input
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...question.options]
                    newOpts[oi] = e.target.value
                    patch({ options: newOpts })
                  }}
                  className="h-6 text-[11px]"
                  placeholder={`选项 ${String.fromCharCode(65 + oi)}`}
                />
              </div>
            )
          })}
          <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => patch({ options: [...question.options, ''] })}>
            + 添加选项
          </Button>
        </div>
      )}

      {/* True/False toggle */}
      {type === 'true_false' && (
        <div className="flex gap-2 pl-1">
          <Button
            size="sm"
            variant={question.correct_answer === true ? 'default' : 'outline'}
            className={`flex-1 h-8 text-xs ${question.correct_answer === true ? 'bg-green-500 hover:bg-green-600' : ''}`}
            onClick={() => patch({ correct_answer: true })}
          >
            正确
          </Button>
          <Button
            size="sm"
            variant={question.correct_answer === false ? 'default' : 'outline'}
            className={`flex-1 h-8 text-xs ${question.correct_answer === false ? 'bg-green-500 hover:bg-green-600' : ''}`}
            onClick={() => patch({ correct_answer: false })}
          >
            错误
          </Button>
        </div>
      )}

      {/* Judge & Correct */}
      {type === 'judge_correct' && (
        <div className="space-y-2 pl-1">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={question.correct_answer === true ? 'default' : 'outline'}
              className={`flex-1 h-8 text-xs ${question.correct_answer === true ? 'bg-green-500 hover:bg-green-600' : ''}`}
              onClick={() => patch({ correct_answer: true })}
            >
              正确
            </Button>
            <Button
              size="sm"
              variant={question.correct_answer !== true ? 'default' : 'outline'}
              className={`flex-1 h-8 text-xs ${question.correct_answer !== true ? 'bg-red-500 hover:bg-red-600' : ''}`}
              onClick={() => patch({ correct_answer: '' })}
            >
              错误
            </Button>
          </div>
          {question.correct_answer !== true && (
            <Input
              value={typeof question.correct_answer === 'string' ? question.correct_answer : ''}
              onChange={(e) => patch({ correct_answer: e.target.value })}
              className="h-8 text-xs"
              placeholder="修正后的正确表述"
            />
          )}
        </div>
      )}

      {/* Fill blank / short answer / analysis expected answer */}
      {['fill_blank','short_answer'].includes(type) && (
        <Input
          value={Array.isArray(question.correct_answer) ? question.correct_answer.join('; ') : String(question.correct_answer ?? '')}
          onChange={(e) => patch({ correct_answer: e.target.value })}
          className="h-8 text-xs"
          placeholder={type === 'fill_blank' ? '预期答案' : '可接受答案（多个用分号分隔）'}
        />
      )}

      {/* Analysis */}
      <Input
        value={question.analysis || ''}
        onChange={(e) => patch({ analysis: e.target.value })}
        className="h-8 text-xs"
        placeholder="解析"
      />
    </div>
  )
}
