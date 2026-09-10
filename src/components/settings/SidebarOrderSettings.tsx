import { useSettingsStore } from '@/stores/settings-store'
import { useLangStore } from '@/stores/lang-store'
import {
  SIDEBAR_ITEMS,
  SIDEBAR_GROUPS,
  SIDEBAR_GROUP_LABELS,
  moveItem,
  type SidebarGroup,
} from '@/lib/nav-order'
import { Button } from '@/components/ui/button'
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'

function GroupList({ group }: { group: SidebarGroup }) {
  const { t } = useT()
  const { lang } = useLangStore()
  const sidebarOrder = useSettingsStore((s) => s.sidebarOrder)
  const setSidebarOrder = useSettingsStore((s) => s.setSidebarOrder)

  const ids = sidebarOrder[group]
  const meta = new Map(SIDEBAR_ITEMS.map((i) => [i.id, i]))

  const move = (from: number, to: number) => {
    setSidebarOrder(group, moveItem(ids, from, to))
  }

  return (
    <div className="space-y-1">
      {ids.map((id, idx) => {
        const item = meta.get(id)
        if (!item) return null
        const label = lang === 'en' ? item.labelEn : item.labelZh
        return (
          <div
            key={id}
            className="flex items-center gap-1 rounded-md border bg-background px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                disabled={idx === 0}
                title={t('examTemplate.moveUp')}
                onClick={() => move(idx, idx - 1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                disabled={idx === ids.length - 1}
                title={t('examTemplate.moveDown')}
                onClick={() => move(idx, idx + 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function SidebarOrderSettings() {
  const { t } = useT()
  const { lang } = useLangStore()
  const resetSidebarOrder = useSettingsStore((s) => s.resetSidebarOrder)

  return (
    <div className="space-y-4">
      {SIDEBAR_GROUPS.map((group) => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {lang === 'en' ? SIDEBAR_GROUP_LABELS[group].labelEn : SIDEBAR_GROUP_LABELS[group].labelZh}
          </p>
          <GroupList group={group} />
        </div>
      ))}

      <div className="flex justify-end pt-1">
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1 text-xs')}
          onClick={resetSidebarOrder}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('settings.sidebarOrderReset')}
        </Button>
      </div>
    </div>
  )
}
