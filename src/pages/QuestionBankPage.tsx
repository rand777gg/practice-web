import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingTips } from '@/components/layout/LoadingTips'
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
      <div className="max-w-5xl">
        <BankDetail bank={selectedBank} onBack={() => { setSelectedBank(null); fetchBanks() }} onEdit={handleEdit} />
        <BankDialog open={dialogOpen} onOpenChange={handleDialogOpenChange} onSave={handleUpdate} initialData={editingBank} />
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl lg:text-2xl font-bold">{t('nav.questionBank')}</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />创建试题库
        </Button>
      </div>

      {isLoading ? (
        <LoadingTips className="py-12" compact />
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
