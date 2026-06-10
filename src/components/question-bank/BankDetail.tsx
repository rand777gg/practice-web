import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { LoadingTips } from '@/components/layout/LoadingTips'
import { useQuestionBanks, type QuestionBank } from '@/hooks/use-question-banks'
import { QuestionPicker } from './QuestionPicker'
import { ArrowLeft, Globe, Library, Lock, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QUESTION_TYPE_LABELS } from '@/lib/constants'

function LogoImage({ src, alt, className, fallbackClassName }: { src?: string | null; alt: string; className?: string; fallbackClassName?: string }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  if (errored || !src) {
    return (
      <div className={cn('bg-primary/10 flex items-center justify-center shrink-0', className)}>
        <Library className={cn('text-primary/60', fallbackClassName)} />
      </div>
    )
  }
  return (
    <div className={cn('relative shrink-0', className)}>
      {!loaded && <Skeleton className={cn('absolute inset-0 rounded-lg', className)} />}
      <img src={src} alt={alt} className={cn('object-cover', className, loaded ? 'opacity-100' : 'opacity-0')}
        onLoad={() => setLoaded(true)} onError={() => setErrored(true)} />
    </div>
  )
}

interface Props {
  bank: QuestionBank
  onBack: () => void
  onEdit: (bank: QuestionBank) => void
}

export function BankDetail({ bank, onBack, onEdit }: Props) {
  const { fetchBankItems, addBankItems, removeBankItem } = useQuestionBanks()
  const [items, setItems] = useState<Array<{ id: string; bank_id: string; question_id: string; added_at: string; questions: Record<string, unknown> }>>([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  const loadItems = async () => {
    setLoading(true)
    const data = await fetchBankItems(bank.id)
    setItems(data)
    setLoading(false)
  }

  useEffect(() => { loadItems() }, [bank.id])

  const existingIds = new Set(items.map((i) => i.question_id))

  const handleAddQuestions = async (questionIds: string[]) => {
    setSavingIds(new Set(questionIds))
    await addBankItems(bank.id, questionIds)
    setPickerOpen(false)
    setSavingIds(new Set())
    loadItems()
  }

  const handleRemove = async (itemId: string) => {
    await removeBankItem(itemId)
    loadItems()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <LogoImage src={bank.logo_url} alt={bank.name} className="h-8 w-8 rounded-lg" fallbackClassName="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate">{bank.name}</h1>
          {bank.description && <p className="text-xs text-muted-foreground truncate">{bank.description}</p>}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${bank.is_public ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
          {bank.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {bank.is_public ? '公开' : '私有'}
        </span>
        <Button variant="outline" size="sm" onClick={() => onEdit(bank)}>编辑</Button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">共 {items.length} 道题目</p>
        <Button size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />添加题目
        </Button>
      </div>

      {loading ? (
        <LoadingTips compact className="py-12" />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Library className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">试题库为空</p>
            <p className="text-xs text-muted-foreground/60 mt-1">点击"添加题目"从题库中选择</p>
            <Button size="sm" className="mt-4" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />添加题目
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">题目</TableHead>
                  <TableHead className="text-xs w-[80px]">学科</TableHead>
                  <TableHead className="text-xs w-[80px]">分类</TableHead>
                  <TableHead className="text-xs w-[80px]">题型</TableHead>
                  <TableHead className="text-xs w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const q = item.questions
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs py-2 max-w-[300px] truncate">{q?.question_text as string || '—'}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{q?.subject as string || '—'}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{((q as any)?.categories?.length ? (q as any).categories.join(', ') : q?.category as string) || '—'}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{QUESTION_TYPE_LABELS[q?.question_type as keyof typeof QUESTION_TYPE_LABELS] || '—'}</TableCell>
                      <TableCell className="text-xs py-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <QuestionPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAdd={handleAddQuestions}
        existingIds={existingIds}
        savingIds={savingIds}
      />
    </div>
  )
}
