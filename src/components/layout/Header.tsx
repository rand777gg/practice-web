import { useState, useEffect } from 'react'
import { useThemeStore } from '@/stores/theme-store'
import { useSyncStore } from '@/stores/sync-store'
import { Button } from '@/components/ui/button'
import { PlanProgress } from './PlanProgress'
import { AiSummaryDialog } from '@/components/ai/AiSummaryDialog'
import { Link } from 'react-router-dom'
import { Settings, Menu, Moon, Sparkles, Sun, CloudOff, Upload } from 'lucide-react'
import { hasAiConfig } from '@/lib/ai'
import { useSettingsStore } from '@/stores/settings-store'
import { useT } from '@/i18n/use-t'

interface Props {
  onMenuClick: () => void
}

export function SyncBadge() {
  const { pendingCount, syncing, refresh, sync } = useSyncStore()
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    refresh()
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (pendingCount === 0) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 text-xs"
      onClick={sync}
      disabled={syncing}
      title={`${pendingCount} 条答案待同步`}
    >
      {syncing ? (
        <Upload className="h-3.5 w-3.5 animate-pulse" />
      ) : isOnline ? (
        <Upload className="h-3.5 w-3.5 text-amber-500" />
      ) : (
        <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="hidden sm:inline">{pendingCount}</span>
    </Button>
  )
}

export function Header({ onMenuClick }: Props) {
  const { t } = useT()
  const { theme, toggle } = useThemeStore()
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
        <PlanProgress />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <SyncBadge />
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
