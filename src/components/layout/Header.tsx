import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useLangStore } from '@/stores/lang-store'
import { useThemeStore } from '@/stores/theme-store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { PlanProgress } from './PlanProgress'
import { AiSummaryDialog } from '@/components/ai/AiSummaryDialog'
import { Check, ChevronDown, LogOut, Menu, Moon, Sparkles, Sun } from 'lucide-react'
import { useT } from '@/i18n/use-t'

interface Props {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: Props) {
  const { t } = useT()
  const { signOut } = useAuthStore()
  const { lang, setLang } = useLangStore()
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
          <Sparkles className="h-5 w-5 text-yellow-500" />
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              {lang === 'zh' ? '中' : 'EN'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setLang('zh')}>
              <span>中文</span>
              {lang === 'zh' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLang('en')}>
              <span>English</span>
              {lang === 'en' && <Check className="h-4 w-4 ml-auto" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">{t('auth.logout')}</span>
        </Button>
      </div>
      <AiSummaryDialog open={aiOpen} onOpenChange={setAiOpen} />
    </header>
  )
}
