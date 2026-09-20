import { AlertCircle, CheckCircle2, Info, Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RUBRIC, type GradingResult } from '@/lib/written-grading'
import { Separator } from '@/components/ui/separator'

const CONFIDENCE_LABEL = { high: '较有把握', medium: '一般', low: '把握较低' } as const

/**
 * 建议分展示面板。
 *
 * 三条规矩写在界面上，不含糊：
 *   1. 抬头就写「建议分」——不是终审分；
 *   2. 展示置信度，低置信明确提示人工复核；
 *   3. 失败时显示「评分失败」，**绝不显示 0 分**。
 */
export function WrittenGradingPanel({
  result,
  grading,
  onGrade,
  onRegrade,
  className,
}: {
  /** 已出的结果；null 表示还没评 */
  result: GradingResult | null
  /** 正在评 */
  grading?: boolean
  onGrade?: () => void
  onRegrade?: () => void
  className?: string
}) {
  if (grading) {
    return (
      <div className={cn('flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        正在按评分标准给建议分…
      </div>
    )
  }

  if (!result) {
    return (
      <div className={cn('flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground', className)}>
        <Sparkles className="h-3.5 w-3.5" />
        <span>还没评。AI 按官方分档给建议分 + 逐句批注，仅供参考。</span>
        {onGrade && (
          <Button size="sm" variant="outline" className="ml-auto h-6 text-[11px]" onClick={onGrade}>
            给建议分
          </Button>
        )}
      </div>
    )
  }

  if (!result.ok) {
    return (
      <div className={cn('rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3 text-xs', className)}>
        <div className="flex items-center gap-1.5 font-medium text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          评分失败
        </div>
        <p className="mt-1 text-muted-foreground">{result.overall}</p>
        {onRegrade && (
          <Button size="sm" variant="outline" className="mt-2 h-6 text-[11px]" onClick={onRegrade}>
            重试
          </Button>
        )}
      </div>
    )
  }

  const rule = RUBRIC[result.kind]
  const pct = result.max > 0 ? (result.total / result.max) * 100 : 0
  const tone = pct >= 80 ? 'text-emerald-600 dark:text-emerald-500'
    : pct >= 60 ? 'text-foreground'
      : 'text-amber-600 dark:text-amber-500'

  return (
    <div className={cn('space-y-3 rounded-md border px-3 py-3 text-xs', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-transparent bg-violet-100 text-[10px] font-normal text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
          建议分<Separator orientation="vertical" className="mx-1.5 inline-block h-3 align-middle" />仅供参考
        </Badge>
        <span className="text-muted-foreground">按{RUBRIC[result.kind].label}的官方分档</span>
        {result.model && <span className="text-[10px] text-muted-foreground">{result.model}</span>}
        {onRegrade && (
          <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px]" onClick={onRegrade}>
            重评
          </Button>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={cn('text-2xl font-semibold tabular-nums', tone)}>{result.total}</span>
        <span className="text-muted-foreground">/ {result.max} 分</span>
        {result.band && <Badge variant="outline" className="text-[10px] font-normal">{result.band}</Badge>}
        <span className={cn(
          'ml-auto rounded px-1.5 py-0.5 text-[10px]',
          result.confidence === 'high'
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : result.confidence === 'medium'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-destructive/10 text-destructive',
        )}>
          {CONFIDENCE_LABEL[result.confidence]}
        </span>
      </div>

      {result.dimensions.length > 0 && (
        <div className="space-y-1.5">
          {result.dimensions.map((d) => (
            <div key={d.name} className="flex items-start gap-2">
              <span className="w-20 shrink-0 text-muted-foreground">{d.name}</span>
              <span className="w-14 shrink-0 tabular-nums">{d.score} / {d.max}</span>
              <span className="min-w-0 flex-1 leading-relaxed text-muted-foreground">{d.comment}</span>
            </div>
          ))}
        </div>
      )}

      {result.sentenceNotes.length > 0 && (
        <div className="space-y-2 border-t pt-2">
          <p className="flex items-center gap-1 font-medium text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" />
            逐句批注
          </p>
          {result.sentenceNotes.map((n) => (
            <div key={`${n.ref}-${n.note.slice(0, 8)}`} className="space-y-0.5 leading-relaxed">
              <span className="mr-1 font-medium tabular-nums">{n.ref}</span>
              <span>{n.note}</span>
              {n.student && <p className="text-muted-foreground">你的译文：{n.student}</p>}
              {n.suggestion && <p className="text-emerald-700 dark:text-emerald-400">参考：{n.suggestion}</p>}
            </div>
          ))}
        </div>
      )}

      {result.overall && (
        <p className="whitespace-pre-wrap border-t pt-2 leading-relaxed text-muted-foreground">{result.overall}</p>
      )}

      <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        这是 AI 按{rule.label}评分标准给的建议分，存在主观判断与识别误差；不计入考试成绩统计，最终以人工阅卷为准。
      </p>
    </div>
  )
}
