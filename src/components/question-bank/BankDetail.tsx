import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { useQuestionBanks, type QuestionBank } from '@/hooks/use-question-banks'
import { QuestionPicker } from './QuestionPicker'
import { ArrowLeft, Check, Globe, Library, Lock, Plus, Trash2 } from 'lucide-react'
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
  const { fetchBankItems, addBankItems, removeBankItem, removeBankItems } = useQuestionBanks()
  const [items, setItems] = useState<Array<{ id: string; bank_id: string; question_id: string; added_at: string; questions: Record<string, unknown> }>>([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

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
    setSelectedItems((prev) => { const next = new Set(prev); next.delete(itemId); return next })
    loadItems()
  }

  const handleBatchRemove = async () => {
    if (selectedItems.size === 0) return
    await removeBankItems([...selectedItems])
    setSelectedItems(new Set())
    loadItems()
  }

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedItems.size >= items.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(items.map((i) => i.id)))
    }
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">共 {items.length} 道题目</p>
          {selectedItems.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBatchRemove}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />删除选中 ({selectedItems.size})
            </Button>
          )}
        </div>
        <Button size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />添加题目
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-0 overflow-x-scroll scrollbar-visible">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead className="text-xs w-[200px]">题目</TableHead>
                  <TableHead className="text-xs w-[90px]">学科</TableHead>
                  <TableHead className="text-xs w-[120px]">分类</TableHead>
                  <TableHead className="text-xs w-[90px]">题型</TableHead>
                  <TableHead className="text-xs w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-4 w-36" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-4 w-14" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-4 w-14" /></TableCell>
                    <TableCell className="py-2"><Skeleton className="h-7 w-7" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
          <CardContent className="p-0 overflow-x-scroll scrollbar-visible">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <button type="button" onClick={toggleAll} className="flex items-center">
                      <div className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${selectedItems.size >= items.length && items.length > 0 ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                        {selectedItems.size >= items.length && items.length > 0 && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  </TableHead>
                  <TableHead className="text-xs w-[200px]">题目</TableHead>
                  <TableHead className="text-xs w-[90px]">学科</TableHead>
                  <TableHead className="text-xs w-[120px]">分类</TableHead>
                  <TableHead className="text-xs w-[90px]">题型</TableHead>
                  <TableHead className="text-xs w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const q = item.questions
                  const checked = selectedItems.has(item.id)
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <button type="button" onClick={() => toggleItem(item.id)}
                          className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-primary/50'}`}>
                          {checked && <Check className="h-3 w-3" />}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs py-2 whitespace-nowrap">{q?.question_text as string || '—'}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{q?.subject as string || '—'}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">
                        {(() => {
                          const cats = ((q as any)?.categories?.length ? (q as any).categories : (q as any)?.category ? [(q as any).category] : []) as string[]
                          const yearPattern = /^\d{4}年真题$/
                          const yearCats = cats.filter((c: string) => yearPattern.test(c))
                          const otherCats = cats.filter((c: string) => !yearPattern.test(c))
                          const parts: string[] = []
                          if (yearCats.length >= 2) parts.push(`${yearCats.length}年真题`)
                          else if (yearCats.length === 1) parts.push(yearCats[0])
                          parts.push(...otherCats)
                          return parts.join('、') || '—'
                        })()}
                      </TableCell>
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
