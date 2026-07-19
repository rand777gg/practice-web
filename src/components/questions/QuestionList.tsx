import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import type { Question } from '@/types'
import { Pencil, Trash2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { TYPE_COLORS } from '@/lib/constants'

interface Props {
  questions: Question[]
  onDelete: (id: string) => Promise<void>
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
}

export function QuestionList({ questions, onDelete, selectedIds, onToggleSelect, onToggleAll }: Props) {
  const { t } = useT()
  const allSelected = questions.length > 0 && selectedIds.size === questions.length

  if (questions.length === 0) {
    return <p className="text-muted-foreground text-center py-12">{t('questions.noQuestions')}</p>
  }

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <button type="button" onClick={onToggleAll}
                className={cn('h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
                  allSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50')}>
                {allSelected && <Check className="h-3 w-3" />}
              </button>
            </TableHead>
            <TableHead className="min-w-[180px]">{t('questions.question')}</TableHead>
            <TableHead>{t('questions.subject')}</TableHead>
            <TableHead>{t('questions.category')}</TableHead>
            <TableHead>知识点</TableHead>
            <TableHead>{t('questions.questionType')}</TableHead>
            <TableHead className="w-[70px]">导入</TableHead>
            <TableHead className="w-[70px]">验证</TableHead>
            <TableHead className="w-20">{t('questions.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => {
            const isSelected = selectedIds.has(q.id)
            return (
              <TableRow key={q.id} className={isSelected ? 'bg-primary/5' : ''}>
                <TableCell>
                  <button type="button" onClick={() => onToggleSelect(q.id)}
                    className={cn('h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
                      isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50')}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </button>
                </TableCell>
                <TableCell className="max-w-[200px] lg:max-w-xs truncate">{q.question_text}</TableCell>
                <TableCell className="whitespace-nowrap">{q.subject ?? '-'}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {(() => {
                    const cats = q.categories?.length ? q.categories : q.category ? [q.category] : []
                    if (!cats.length) return '-'
                    const years = cats.filter(c => /^\d{4}年真题$/.test(c))
                    const others = cats.filter(c => !/^\d{4}年真题$/.test(c))
                    return <span className="inline-flex items-center gap-1">
                      {years.length > 1 ? (
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <span className="inline-block rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1 text-[10px] font-medium cursor-default">
                              {years.length}年真题
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent side="bottom" align="start" className="w-auto px-3 py-2 text-xs">
                            <p className="text-muted-foreground mb-1.5">该题在以下年份出现过：</p>
                            <div className="flex flex-wrap gap-1">
                              {years.map((y) => (
                                <span key={y} className="rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 font-medium whitespace-nowrap">{y}</span>
                              ))}
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      ) : years.map(c => (
                        <span key={c}>{c}</span>
                      ))}
                      {others.length > 0 && <span className="text-muted-foreground">{others.join(', ')}</span>}
                    </span>
                  })()}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs max-w-[120px] truncate">{q.key_points || '-'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${TYPE_COLORS[q.question_type]}`}>
                    {t(`questionTypes.${q.question_type}` as any) || q.question_type}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {q.source_page && (q.import_mode === 'lightweight' || q.import_mode === 'precision') ? (
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <span className="text-[10px] text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/40">
                          {{ lightweight: '轻量', precision: '精准' }[q.import_mode] || q.import_mode}
                        </span>
                      </HoverCardTrigger>
                      <HoverCardContent side="bottom" align="start" className="w-auto px-3 py-2 text-xs">
                        <p className="text-muted-foreground">来源页码：{q.source_page}</p>
                      </HoverCardContent>
                    </HoverCard>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {{ manual: '手动', lightweight: '轻量', precision: '精准', generate: 'AI生成' }[q.import_mode || 'manual'] || q.import_mode || '手动'}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {q.verified ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">待验证</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to={`/admin/questions/${q.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(q.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
