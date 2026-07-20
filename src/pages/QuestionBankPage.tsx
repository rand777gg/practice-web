import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuestionBanks, type QuestionBank } from '@/hooks/use-question-banks'
import { BankCard } from '@/components/question-bank/BankCard'
import { BankDialog } from '@/components/question-bank/BankDialog'
import { BankDetail } from '@/components/question-bank/BankDetail'
import { Library, Plus } from 'lucide-react'
import { useT } from '@/i18n/use-t'

export function Component() {
 const { t } = useT()
 const { banks, isLoading, fetchBanks, createBank, updateBank, deleteBank } = useQuestionBanks()
 const [dialogOpen, setDialogOpen] = useState(false)
 const [editingBank, setEditingBank] = useState<QuestionBank | null>(null)
 const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null)

 useEffect(() => { fetchBanks() }, [fetchBanks])

 const handleCreate = async (data: { name: string; description?: string; logo_url?: string; is_public?: boolean }) => {
 await createBank(data)
 fetchBanks()
 }

 const handleUpdate = async (data: { name: string; description?: string; logo_url?: string; is_public?: boolean }) => {
 if (!editingBank) return
 await updateBank(editingBank.id, data)
 setEditingBank(null)
 fetchBanks()
 }

 const handleDelete = async (id: string) => {
 await deleteBank(id)
 fetchBanks()
 }

 const handleEdit = (bank: QuestionBank) => {
 setEditingBank(bank)
 setDialogOpen(true)
 }

 const handleDialogOpenChange = (open: boolean) => {
 if (!open) setEditingBank(null)
 setDialogOpen(open)
 }

 if (selectedBank) {
 return (
 <div className="">
 <BankDetail bank={selectedBank} onBack={() => { setSelectedBank(null); fetchBanks() }} onEdit={handleEdit} />
 <BankDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} onSave={handleUpdate} initialData={editingBank} />
 </div>
 )
 }

 return (
 <div className="">
 <div className="flex items-center justify-between mb-6">
 <Button size="sm" onClick={() => setDialogOpen(true)}>
 <Plus className="h-4 w-4 mr-1" />创建试题库
 </Button>
 </div>

 {isLoading ? (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
 {[...Array(6)].map((_, i) => (
 <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
 <div className="flex items-center gap-3">
 <Skeleton className="h-12 w-12 rounded-lg" />
 <div className="flex-1 space-y-1.5">
 <Skeleton className="h-4 w-2/3" />
 <Skeleton className="h-3 w-full" />
 </div>
 </div>
 <Skeleton className="h-3 w-full" />
 <div className="flex justify-between">
 <Skeleton className="h-4 w-12 rounded-full" />
 <Skeleton className="h-4 w-12 rounded-full" />
 </div>
 </div>
 ))}
 </div>
 ) : banks.length === 0 ? (
 <div className="text-center py-20 space-y-4">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted">
 <Library className="h-8 w-8 text-muted-foreground/40" />
 </div>
 <p className="text-muted-foreground text-sm">还没有试题库，创建一个吧！</p>
 <Button size="sm" onClick={() => setDialogOpen(true)}>
 <Plus className="h-4 w-4 mr-1" />创建试题库
 </Button>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {banks.map((bank) => (
 <BankCard key={bank.id} bank={bank} onEdit={handleEdit} onDelete={handleDelete} onClick={setSelectedBank} />
 ))}
 </div>
 )}

 <BankDialog open={dialogOpen} onOpenChange={handleDialogOpenChange}
 onSave={editingBank ? handleUpdate : handleCreate}
 initialData={editingBank} />
 </div>
 )
}
