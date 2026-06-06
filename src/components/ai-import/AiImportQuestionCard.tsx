import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Check, ChevronDown, Trash2 } from 'lucide-react'
import { QUESTION_TYPE_OPTIONS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { QuestionType } from '@/types'

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

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${selected ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/10' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
            ${selected ? 'bg-blue-500 border-blue-500 text-white' : 'border-muted-foreground/30'}`}
          onClick={onToggleSelect}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>

        <span className="text-xs text-muted-foreground font-medium tabular-nums">#{index + 1}</span>

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
      <Textarea
        value={question.question_text}
        onChange={(e) => patch({ question_text: e.target.value })}
        className="text-sm min-h-[60px]"
        placeholder="题干"
      />

      {/* Options (for choice types) */}
      {['single_choice','multi_select'].includes(type) && (
        <div className="space-y-1 pl-1">
          {question.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5 tabular-nums">{String.fromCharCode(65 + oi)}.</span>
              <Input
                value={opt}
                onChange={(e) => {
                  const newOpts = [...question.options]
                  newOpts[oi] = e.target.value
                  patch({ options: newOpts })
                }}
                className="h-7 text-xs"
                placeholder={`选项 ${String.fromCharCode(65 + oi)}`}
              />
              {/* Correct answer marker */}
              <button
                type="button"
                className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]
                  ${type === 'single_choice'
                    ? question.correct_answer === oi ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground/30'
                    : Array.isArray(question.correct_answer) && (question.correct_answer as number[]).includes(oi) ? 'bg-green-500 border-green-500 text-white' : 'border-muted-foreground/30'
                  }`}
                onClick={() => {
                  if (type === 'single_choice') {
                    patch({ correct_answer: oi })
                  } else {
                    const arr: number[] = Array.isArray(question.correct_answer) ? [...question.correct_answer as number[]] : []
                    const idx = arr.indexOf(oi)
                    if (idx >= 0) arr.splice(idx, 1)
                    else arr.push(oi)
                    patch({ correct_answer: arr })
                  }
                }}
              >
                {type === 'single_choice' ? (question.correct_answer === oi ? '✓' : '') : (Array.isArray(question.correct_answer) && (question.correct_answer as number[]).includes(oi) ? '✓' : '')}
              </button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => patch({ options: [...question.options, ''] })}>
            + 添加选项
          </Button>
        </div>
      )}

      {/* True/False toggle */}
      {type === 'true_false' && (
        <div className="flex gap-2 pl-1">
          {['正确', '错误'].map((label, ti) => (
            <button
              key={label}
              type="button"
              className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors
                ${question.correct_answer === (ti === 0) ? 'bg-green-500 border-green-500 text-white' : 'border-border hover:bg-accent'}`}
              onClick={() => patch({ correct_answer: ti === 0 })}
            >
              {label}
            </button>
          ))}
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
        placeholder="解析（可选）"
      />

      {/* Key points */}
      <Input
        value={question.key_points || ''}
        onChange={(e) => patch({ key_points: e.target.value })}
        className="h-8 text-xs"
        placeholder="知识点，逗号分隔（可选）"
      />
    </div>
  )
}
