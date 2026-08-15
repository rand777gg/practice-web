import { NavLink, useLocation } from 'react-router-dom'
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
  const { pathname } = useLocation()

  if (bottomNavTabs.length === 0) return null

  const visibleTabs = BOTTOM_NAV_TABS.filter((tab) => bottomNavTabs.includes(tab.key))
  const n = visibleTabs.length
  const activeIndex = visibleTabs.findIndex((tab) => {
    const to = routeMap[tab.key]
    return to === '/' ? pathname === '/' : pathname.startsWith(to)
  })
  const idx = Math.max(activeIndex, 0)

  return (
    <nav className="xl:hidden fixed bottom-[calc(env(safe-area-inset-bottom,0px)+12px)] inset-x-3 z-30">
      <div className="relative mx-auto flex items-stretch h-14 max-w-lg overflow-hidden rounded-3xl border border-border/40 bg-background/55 shadow-lg shadow-black/10 backdrop-blur-2xl p-1.5">
        {/* Liquid glass specular highlight */}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/45 via-white/10 to-transparent dark:from-white/10 dark:via-white/5 dark:to-transparent" />
        {/* Sliding glass capsule */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1.5 bottom-1.5 left-1.5 z-0 rounded-full bg-gradient-to-b from-primary/25 via-primary/15 to-primary/10 shadow-inner ring-1 ring-inset ring-primary/25 will-change-transform',
            activeIndex < 0 && 'opacity-0',
          )}
          style={{
            width: `calc((100% - 12px)/${n})`,
            transform: `translateX(${idx * 100}%)`,
            transition: 'transform 500ms cubic-bezier(0.34, 1.3, 0.64, 1), opacity 200ms ease',
          }}
        />
        {visibleTabs.map(({ key }) => {
          const Icon = iconMap[key]
          const to = routeMap[key]
          const labelKey = labelKeyMap[key]
          return (
            <NavLink
              key={key}
              to={to}
              end={to === '/'}
              prefetch="viewport"
              className={({ isActive }) =>
                cn(
                  'relative z-10 flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-[color,transform] duration-300 ease-out active:scale-[0.97]',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-5 w-5 transition-transform duration-300 ease-out', isActive && 'scale-110')} />
                  <span>{t(labelKey as any)}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
