import { useState } from 'react'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Keyboard } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import type { ShortcutAction, ShortcutConfig } from '@/stores/settings-store'
import { KeyboardDialog } from '@/components/settings/KeyboardDialog'

const LABELS: Record<ShortcutAction, string> = { prev: '上一题', next: '下一题', submit: '提交答案', markUnsure: '不确定', markWrong: '纠错', favorite: '收藏', tooEasy: '太简单', flagIssue: '标记问题' }

const KEY_DISPLAY: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Enter: '⏎', Escape: 'Esc', Control: 'Ctrl', Shift: '⇧', Alt: 'Alt', Meta: '⌘',
  Backspace: '←', Delete: 'Del', Tab: 'Tab', Space: 'Space', ' ': 'Space',
  CapsLock: 'Caps', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
}

function keyToDisplay(key: string): string {
  if (KEY_DISPLAY[key]) return KEY_DISPLAY[key]
  if (key.startsWith('F') && /^F\d{1,2}$/.test(key)) return key
  if (key.length === 1) return key.toUpperCase()
  return key
}

function parseShortcut(keys: string): string[] {
  if (!keys) return []
  return keys.split('+').filter(Boolean)
}

interface Props { shortcuts: ShortcutConfig; onChange: (action: ShortcutAction, keys: string) => void }

export function ShortcutSettings({ shortcuts, onChange }: Props) {
  const [dialogAction, setDialogAction] = useState<ShortcutAction | null>(null)
  const isMobile = useIsMobile()

  return (
    <div className="space-y-3">
      {(Object.keys(LABELS) as ShortcutAction[]).map(action => {
        const parts = parseShortcut(shortcuts[action])
        const editBtn = (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={isMobile}
            onClick={() => setDialogAction(action)}
          >
            <Keyboard className="h-3.5 w-3.5" />
          </Button>
        )
        return (
          <div key={action} className="flex items-center gap-2">
            <span className="text-sm shrink-0">{LABELS[action]}</span>
            <div className="flex items-center gap-1.5">
              {parts.length > 0 ? (
                <KbdGroup>{parts.map((k, i) => <Kbd key={i}>{keyToDisplay(k)}</Kbd>)}</KbdGroup>
              ) : (
                <span className="text-xs text-muted-foreground">无快捷键</span>
              )}
            </div>
            <div className="flex-1" />
            {isMobile ? (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>{editBtn}</TooltipTrigger>
                  <TooltipContent side="left" className="text-xs max-w-[160px]">
                    请在平板或电脑端修改快捷键
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : editBtn}
          </div>
        )
      })}
      {!isMobile && (
        <KeyboardDialog
          open={dialogAction !== null}
          onOpenChange={(open) => { if (!open) setDialogAction(null) }}
          action={dialogAction}
          currentKeys={dialogAction ? shortcuts[dialogAction] : ''}
          onConfirm={(keys) => { if (dialogAction) onChange(dialogAction, keys); setDialogAction(null) }}
        />
      )}
    </div>
  )
}
