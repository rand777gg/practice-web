import { useState } from 'react'
import { useThemeStore } from '@/stores/theme-store'
import { Button } from '@/components/ui/button'
import { PlanProgress } from './PlanProgress'
import { AiSummaryDialog } from '@/components/ai/AiSummaryDialog'
import { Link } from 'react-router-dom'
import { Settings, Menu, Moon, Sparkles, Sun } from 'lucide-react'
import { hasAiConfig } from '@/lib/ai'
import { useAuthStore } from '@/stores/auth-store'
import { useRefreshStore } from '@/stores/refresh-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useT } from '@/i18n/use-t'

interface Props {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: Props) {
  const { t } = useT()
  const { theme, toggle } = useThemeStore()
  const { profile } = useAuthStore()
  const planV = useRefreshStore((s) => s.planVersion)
  const { isEnabled } = useSettingsStore()
  const summaryVisible = hasAiConfig() && isEnabled('summary')
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
        <PlanProgress key={planV} />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {summaryVisible && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAiOpen(true)}
            title="AI 学习总结"
          >
            <Sparkles className="h-5 w-5 text-blue-400 dark:text-blue-300" />
          </Button>
        )}
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
        <Button variant="ghost" size="icon" asChild title={t('settings.title')}>
          <Link to="/settings">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
      </div>
      <AiSummaryDialog open={aiOpen} onOpenChange={setAiOpen} />
    </header>
  )
}
