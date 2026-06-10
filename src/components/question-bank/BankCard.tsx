import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Globe, Library, Lock, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

function LogoImage({ src, alt, className, fallbackClassName }: { src: string; alt: string; className?: string; fallbackClassName?: string }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return (
      <div className={cn('bg-primary/10 flex items-center justify-center shrink-0', className)}>
        <Library className={cn('text-primary/60', fallbackClassName)} />
      </div>
    )
  }
  return (
    <div className={cn('relative shrink-0', className)}>
      {!loaded && <Skeleton className={cn('absolute inset-0 rounded-xl', className)} />}
      <img src={src} alt={alt} className={cn('object-cover', className, loaded ? 'opacity-100' : 'opacity-0')}
        onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    </div>
  )
}
import type { QuestionBank } from '@/hooks/use-question-banks'

interface Props {
  bank: QuestionBank
  onEdit: (bank: QuestionBank) => void
  onDelete: (id: string) => Promise<void>
  onClick: (bank: QuestionBank) => void
}

export function BankCard({ bank, onEdit, onDelete, onClick }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <>
      <Card className="hover:shadow-md transition-shadow cursor-pointer group relative" onClick={() => onClick(bank)}>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            {bank.logo_url ? (
              <LogoImage src={bank.logo_url} alt={bank.name} className="h-12 w-12 rounded-xl" fallbackClassName="h-6 w-6" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Library className="h-6 w-6 text-primary/60" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm truncate">{bank.name}</h3>
              {bank.description ? (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{bank.description}</p>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic mt-0.5">暂无简介</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${bank.is_public ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
              {bank.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
              {bank.is_public ? '公开' : '私有'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {(bank.question_count ?? 0)} 道题目
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onEdit(bank) }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setDeleteOpen(true) }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>删除试题库</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除「{bank.name}」吗？此操作不可撤销，试题库内的所有题目关联将被移除（题目本身不会删除）。
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end mt-4">
            <AlertDialogCancel asChild>
              <Button variant="outline" size="sm" disabled={deleting}>取消</Button>
            </AlertDialogCancel>
            <Button variant="destructive" size="sm" disabled={deleting}
              onClick={async () => {
                setDeleting(true)
                await onDelete(bank.id)
                setDeleting(false)
                setDeleteOpen(false)
              }}>
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
