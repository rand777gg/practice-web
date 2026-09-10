import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Check, Eye, Languages, Moon, Settings, Sparkles, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AiSummaryDialog } from '@/components/ai/AiSummaryDialog'
import { QrScanner } from '@/components/auth/QrScanner'
import { hasAiConfig } from '@/lib/ai'
import { useLangStore } from '@/stores/lang-store'
import { useSettingsStore, EYE_CARE_PALETTES, HEADER_ACTIONS } from '@/stores/settings-store'
import { useThemeStore } from '@/stores/theme-store'
import { useT } from '@/i18n/use-t'
import { cn } from '@/lib/utils'

export function HeaderActions() {
  const { t } = useT()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const eyeCare = useSettingsStore((s) => s.eyeCare)
  const setEyeCare = useSettingsStore((s) => s.setEyeCare)
  const headerActions = useSettingsStore((s) => s.headerActions)
  const isEnabled = useSettingsStore((s) => s.isEnabled)

  const [qrOpen, setQrOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  const aiAvailable = hasAiConfig() && isEnabled('summary')
  const visible = HEADER_ACTIONS.filter((a) => headerActions.includes(a.key))
    .filter((a) => a.key !== 'aiSummary' || aiAvailable)

  if (visible.length === 0) return null

  const activePalette = EYE_CARE_PALETTES.find((p) => p.value === eyeCare) ?? EYE_CARE_PALETTES[0]

  return (
    <div className="ml-auto flex items-center gap-0.5">
      {visible.map((action) => {
        if (action.key === 'theme') {
          return (
            <Button
              key={action.key}
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={theme === 'light' ? t('settings.themeDark') : t('settings.themeLight')}
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
          )
        }

        if (action.key === 'lang') {
          return (
            <Button
              key={action.key}
              variant="ghost"
              size="icon"
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              title={t('settings.language')}
            >
              <Languages className="h-5 w-5" />
            </Button>
          )
        }

        if (action.key === 'eyeCare') {
          return (
            <Popover key={action.key}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  title={`${t('settings.eyeCare')} · ${activePalette.label}`}
                  className={cn(eyeCare && 'bg-accent text-accent-foreground')}
                >
                  <Eye className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-44 p-1">
                {EYE_CARE_PALETTES.map((palette) => (
                  <button
                    key={palette.value}
                    type="button"
                    onClick={() => setEyeCare(palette.value)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <span
                      className="size-3.5 shrink-0 rounded-full border"
                      style={{ backgroundColor: palette.preview }}
                    />
                    {palette.label}
                    {eyeCare === palette.value && <Check className="ml-auto size-4" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )
        }

        if (action.key === 'qr') {
          return (
            <Button
              key={action.key}
              variant="ghost"
              size="icon"
              onClick={() => setQrOpen(true)}
              title={t('settings.qrLogin')}
            >
              <Camera className="h-5 w-5" />
            </Button>
          )
        }

        if (action.key === 'settings') {
          return (
            <Button key={action.key} variant="ghost" size="icon" asChild title={t('settings.title')}>
              <Link to="/settings">
                <Settings className="h-5 w-5" />
              </Link>
            </Button>
          )
        }

        return (
          <Button
            key={action.key}
            variant="ghost"
            size="icon"
            onClick={() => setAiOpen(true)}
            title={t('settings.aiSummary')}
          >
            <Sparkles className="h-5 w-5 text-blue-400 dark:text-blue-300" />
          </Button>
        )
      })}

      <QrScanner open={qrOpen} onOpenChange={setQrOpen} />
      {aiAvailable && <AiSummaryDialog open={aiOpen} onOpenChange={setAiOpen} />}
    </div>
  )
}
