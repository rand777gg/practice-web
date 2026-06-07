import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useThemeStore } from '@/stores/theme-store'
import { Button } from '@/components/ui/button'
import { PlanProgress } from './PlanProgress'
import { AiSummaryDialog } from '@/components/ai/AiSummaryDialog'
import { LogOut, Menu, Moon, Sparkles, Sun } from 'lucide-react'
import { useT } from '@/i18n/use-t'

interface Props {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: Props) {
  const { t } = useT()
  const { signOut } = useAuthStore()
  const { theme, toggle } = useThemeStore()
  const [aiOpen, setAiOpen] = useState(false)

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 lg:px-6 shrink-0 gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden shrink-0"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <PlanProgress />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setAiOpen(true)}
          title="AI 学习总结"
        >
          <Sparkles className="h-5 w-5 text-blue-400 dark:text-blue-300" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        >
          {theme === 'light' ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">{t('auth.logout')}</span>
        </Button>
      </div>
      <AiSummaryDialog open={aiOpen} onOpenChange={setAiOpen} />
    </header>
  )
}
