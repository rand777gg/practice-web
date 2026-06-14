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
import { Check, ChevronDown, CheckCircle, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { QUESTION_TYPE_OPTIONS, QUESTION_TYPE_LABELS } from '@/lib/constants'
import type { ParsedQuestion } from '@/lib/ai/types'
import type { QuestionType } from '@/types'
import { generateKeyPoints, hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'

const BLANK_RE = /_{2,}/g

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
  const [kpGlow, setKpGlow] = useState(false)
  const [kpFade, setKpFade] = useState(false)

  const handleGenerateKeyPoints = async () => {
    if (!question.question_text.trim()) return
    setKpLoading(true)
    setKpGlow(true)
    setKpFade(false)
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
      })
      patch({ key_points: result })
      setKpFade(true)
      requestAnimationFrame(() => {
        setKpGlow(false)
        setTimeout(() => setKpFade(false), 1500)
      })
    } catch { /* ignore */ }
    setKpLoading(false)
  }

  const handleCleanOptions = () => {
    const re = /^[A-Za-z]\s*[.)、，,．:：]\s*/
    const cleaned = question.options.map(opt => opt.replace(re, '').trim())
    const hasChange = cleaned.some((c, i) => c !== question.options[i])
    if (hasChange) patch({ options: cleaned })
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 backdrop-blur-xl ${
      selected
        ? 'border-primary/50 bg-primary/10 dark:bg-primary/10'
        : 'bg-white/50 dark:bg-zinc-800/50 border-white/20 dark:border-zinc-700/30'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <button type="button"
          className={`shrink-0 w-5 h-5 rounded flex items-center justify-center border-2 transition-colors
            ${selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'}`}
          onClick={onToggleSelect}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>

        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm font-bold tabular-nums">{index + 1}</span>

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

        <Button
          variant={question.verified ? 'default' : 'ghost'}
          size="icon"
          className={`h-7 w-7 shrink-0 ${question.verified ? 'bg-green-500 hover:bg-green-600' : ''}`}
          onClick={() => patch({ verified: !question.verified })}
          title={question.verified ? '已验证' : '标记为已验证'}
        >
          <CheckCircle className={`h-3.5 w-3.5 ${question.verified ? 'text-white' : 'text-muted-foreground'}`} />
        </Button>

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

      {/* Options (for choice types) */}
      {['single_choice','multi_select'].includes(type) && (
        <div className="space-y-1 pl-1">
          {question.options.map((opt, oi) => {
            const isCorrect = type === 'single_choice'
              ? question.correct_answer === oi
              : Array.isArray(question.correct_answer) && (question.correct_answer as number[]).includes(oi)

            return (
              <div key={oi} className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 ${isCorrect ? 'bg-green-100 dark:bg-green-900/40' : ''}`}>
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
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => patch({ options: [...question.options, ''] })}>
              + 添加选项
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 gap-1 text-muted-foreground hover:text-foreground"
              onClick={handleCleanOptions}
              title="清理选项前缀（去除 A. B) C、等字母/序号标记）"
            >
              <Wand2 className="h-3 w-3" />
              清理选项格式
            </Button>
          </div>
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
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">修正后的正确表述</label>
              <Input
                value={typeof question.correct_answer === 'string' && question.correct_answer !== 'true' && question.correct_answer !== 'false' ? question.correct_answer : ''}
                onChange={(e) => patch({ correct_answer: e.target.value })}
                className="h-8 text-xs"
                placeholder="指明错在哪里，并给出修正后的正确答案"
              />
            </div>
          )}
        </div>
      )}

      {/* Fill blank / short answer expected answer */}
      {['fill_blank','short_answer'].includes(type) && (
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">答案</label>
          {type === 'fill_blank' ? (() => {
            const blankCount = (question.question_text.match(BLANK_RE) || ['____']).length
            const answers = Array.isArray(question.correct_answer) ? question.correct_answer as string[] : blankCount > 1 ? [] : [String(question.correct_answer ?? '')]
            return (
              <div className="space-y-1.5">
                {Array.from({ length: blankCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground shrink-0 w-8">空{i + 1}</span>
                    <Input
                      value={answers[i] || ''}
                      onChange={(e) => {
                        const next = [...answers]
                        next[i] = e.target.value
                        // Store as string if single blank, array if multiple
                        patch({ correct_answer: blankCount > 1 ? next : next[0] || '' })
                      }}
                      className="h-7 text-xs"
                      placeholder={`答案${i + 1}`}
                    />
                  </div>
                ))}
              </div>
            )
          })() : (
            <Input
              value={Array.isArray(question.correct_answer) ? question.correct_answer.join('; ') : String(question.correct_answer ?? '')}
              onChange={(e) => patch({ correct_answer: e.target.value })}
              className="h-8 text-xs"
              placeholder="可接受答案（多个用分号分隔）"
            />
          )}
        </div>
      )}

      {/* Key points */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">知识点</label>
        <div className="relative">
          <Input
            value={question.key_points || ''}
            onChange={(e) => patch({ key_points: e.target.value })}
            className={`h-8 text-xs pr-8 transition-[border-color,box-shadow] duration-1000 ${
              kpGlow ? '[animation:colorWheel_3s_linear_infinite,geminiBorderGlow_3s_ease-in-out_infinite]' :
              kpFade ? 'border-purple-500 shadow-[0_0_12px_rgba(139,92,246,0.4)]' : ''
            }`}
            placeholder="逗号分隔"
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
      </div>

      {/* Analysis */}
      <MarkdownEditor
        value={question.analysis || ''}
        onChange={(v) => patch({ analysis: v })}
        placeholder="解释正确答案..."
        minHeight="60px"
        className="text-sm"
      />
    </div>
  )
}
