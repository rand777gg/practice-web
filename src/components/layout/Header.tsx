import { useState } from 'react'
import { useThemeStore } from '@/stores/theme-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { PlanProgress } from './PlanProgress'
import { AiSummaryDialog } from '@/components/ai/AiSummaryDialog'
import { Link } from 'react-router-dom'
import { Camera, Moon, Settings, Sparkles, Sun } from 'lucide-react'
import { hasAiConfig } from '@/lib/ai'
import { QrScanner } from '@/components/auth/QrScanner'
import { useSettingsStore } from '@/stores/settings-store'
import { useT } from '@/i18n/use-t'

interface Props {
  className?: string
}

export function Header({ className }: Props) {
  const { t } = useT()
  const { theme, toggle } = useThemeStore()
  const { isEnabled } = useSettingsStore()
  const summaryVisible = hasAiConfig() && isEnabled('summary')
  const [aiOpen, setAiOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  return (
    <header className={cn(
      'sticky top-0 z-20 h-14 border-b bg-background flex items-center justify-between px-4 xl:px-6 shrink-0 gap-2',
      className,
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger className="-ml-1 size-8 md:hidden" />
        <PlanProgress />
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
        <Button variant="ghost" size="icon" onClick={() => setQrOpen(true)} title="扫码登录">
          <Camera className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" asChild title={t('settings.title')}>
          <Link to="/settings">
            <Settings className="h-5 w-5" />
          </Link>
        </Button>
      </div>
      <AiSummaryDialog open={aiOpen} onOpenChange={setAiOpen} />
      <QrScanner open={qrOpen} onOpenChange={setQrOpen} />
    </header>
  )
}
