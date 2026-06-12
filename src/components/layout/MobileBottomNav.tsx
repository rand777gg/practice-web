import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Pencil, Clock, Star, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/use-t'
import { useSettingsStore, BOTTOM_NAV_TABS, type BottomNavTabKey } from '@/stores/settings-store'

const iconMap: Record<BottomNavTabKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  practice: Pencil,
  exam: Clock,
  favorites: Star,
  review: RotateCcw,
}

const routeMap: Record<BottomNavTabKey, string> = {
  dashboard: '/',
  practice: '/practice',
  exam: '/exam',
  favorites: '/favorites',
  review: '/review',
}

const labelKeyMap: Record<BottomNavTabKey, string> = {
  dashboard: 'nav.dashboard',
  practice: 'nav.practice',
  exam: 'nav.exam',
  favorites: 'nav.favorites',
  review: 'nav.wrongReview',
}

export function MobileBottomNav() {
  const { t } = useT()
  const bottomNavTabs = useSettingsStore((s) => s.bottomNavTabs)

  if (bottomNavTabs.length === 0) return null

  return (
    <nav className="xl:hidden fixed bottom-0 inset-x-0 z-50 bg-background/80 backdrop-blur-lg border-t border-border/50 safe-area-bottom">
      <div className="flex items-stretch h-14">
        {BOTTOM_NAV_TABS.filter((tab) => bottomNavTabs.includes(tab.key)).map(({ key }) => {
          const Icon = iconMap[key]
          const to = routeMap[key]
          const labelKey = labelKeyMap[key]
          return (
            <NavLink
              key={key}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{t(labelKey as any)}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
