import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import {
  LayoutDashboard,
  Pencil,
  Clock,
  RotateCcw,
  FileQuestion,
  Users,
  GraduationCap,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useT } from '@/i18n/use-t'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
  )

interface Props {
  className?: string
  overlay?: boolean
  isOpen?: boolean
  onClose?: () => void
}

function SidebarNav({ onClose }: { onClose?: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  const { t } = useT()

  const handleClick = () => onClose?.()

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      <NavLink to="/" end className={linkClass} onClick={handleClick}>
        <LayoutDashboard className="h-4 w-4" />
        {t('nav.dashboard')}
      </NavLink>
      <NavLink to="/practice" className={linkClass} onClick={handleClick}>
        <Pencil className="h-4 w-4" />
        {t('nav.practice')}
      </NavLink>
      <NavLink to="/exam" className={linkClass} onClick={handleClick}>
        <Clock className="h-4 w-4" />
        {t('nav.exam')}
      </NavLink>
      <NavLink to="/review" className={linkClass} onClick={handleClick}>
        <RotateCcw className="h-4 w-4" />
        {t('nav.wrongReview')}
      </NavLink>

      {isAdmin && (
        <>
          <Separator className="my-2" />
          <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
            {t('nav.admin')}
          </p>
          <NavLink to="/admin/questions" className={linkClass} onClick={handleClick}>
            <FileQuestion className="h-4 w-4" />
            {t('nav.questions')}
          </NavLink>
          <NavLink to="/admin/users" className={linkClass} onClick={handleClick}>
            <Users className="h-4 w-4" />
            {t('nav.users')}
          </NavLink>
        </>
      )}
    </nav>
  )
}

function SidebarFooter() {
  const { user, profile } = useAuthStore()
  const { t } = useT()
  if (!user) return null
  return (
    <div className="p-3 border-t border-sidebar-border space-y-1">
      <p className="text-xs text-sidebar-foreground/70 truncate">{user.email}</p>
      {profile && (
        <Badge
          variant={profile.role === 'admin' ? 'default' : 'secondary'}
          className="text-[10px] h-5"
        >
          {profile.role === 'admin' ? t('users.admin') : t('users.user')}
        </Badge>
      )}
    </div>
  )
}

export function Sidebar({ className, overlay, isOpen, onClose }: Props) {
  const { t } = useT()

  const sidebarContent = (
    <aside
      className={cn(
        'w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col h-full',
        className,
      )}
    >
      <div className="flex items-center justify-between h-14 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-sidebar-primary" />
          <span className="font-semibold text-sidebar-foreground">{t('app.shortTitle')}</span>
        </div>
        {overlay && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
      <SidebarNav onClose={onClose} />
      <SidebarFooter />
    </aside>
  )

  if (!overlay) return sidebarContent

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebarContent}
      </div>
    </>
  )
}
