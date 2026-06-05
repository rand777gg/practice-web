import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useT } from '@/i18n/use-t'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}

export function PlanDialog({ open, onOpenChange }: Props) {
  const { t } = useT()
  const { user, profile, refreshProfile } = useAuthStore()
  const theme = useThemeStore((s) => s.theme)
  const [deadline, setDeadline] = useState(profile?.deadline ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ deadline: deadline || null })
      .eq('id', user.id)
    await refreshProfile()
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('plan.title')}</DialogTitle>
          <DialogDescription>{t('plan.desc')}</DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={() => inputRef.current?.showPicker()}
          className="relative flex items-center justify-between w-full h-10 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        >
          <span className={deadline ? '' : 'text-muted-foreground'}>
            {deadline ? formatDate(deadline) : t('plan.pickDate')}
          </span>
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            style={{ colorScheme: theme }}
          />
        </button>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">{t('plan.cancel')}</Button>
          </DialogClose>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? t('questions.saving') : t('plan.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
