import { NavLink } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import {
  LayoutDashboard, Pencil, Clock, RotateCcw, FileQuestion, Users,
  GraduationCap, Star, BookOpen, Sparkles, Library, PanelLeftOpen, PanelLeftClose,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
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
  collapsed?: boolean
  onToggleCollapse?: () => void
}

function NavItem({ to, icon, label, collapsed, end, onClick, badge }: {
  to: string; icon: React.ReactNode; label: string; collapsed?: boolean
  end?: boolean; onClick?: () => void; badge?: React.ReactNode
}) {
  return (
    <NavLink to={to} end={end} className={linkClass} onClick={onClick}
      title={collapsed ? label : undefined}>
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badge}
    </NavLink>
  )
}

function SidebarNav({ onClose, collapsed }: { onClose?: () => void; collapsed?: boolean }) {
  const profile = useAuthStore((s) => s.profile)
  const isAdmin = profile?.role === 'admin'
  const { t } = useT()
  const handleClick = () => onClose?.()

  return (
    <nav className={cn('flex-1 overflow-y-auto', collapsed ? 'p-2 space-y-1' : 'p-3 space-y-1')}>
      <NavItem to="/" end icon={<LayoutDashboard className="h-4 w-4" />} label={t('nav.dashboard')} collapsed={collapsed} onClick={handleClick} />
      <NavItem to="/practice" icon={<Pencil className="h-4 w-4" />} label={t('nav.practice')} collapsed={collapsed} onClick={handleClick} />
      <NavItem to="/exam" icon={<Clock className="h-4 w-4" />} label={t('nav.exam')} collapsed={collapsed} onClick={handleClick} />
      <NavItem to="/favorites" icon={<Star className="h-4 w-4" />} label={t('nav.favorites')} collapsed={collapsed} onClick={handleClick} />
      <NavItem to="/review" icon={<RotateCcw className="h-4 w-4" />} label={t('nav.wrongReview')} collapsed={collapsed} onClick={handleClick} />
      <NavItem to="/notes" icon={<BookOpen className="h-4 w-4" />} label={t('nav.publicNotes')} collapsed={collapsed} onClick={handleClick} />
      <NavItem to="/question-bank" icon={<Library className="h-4 w-4" />} label={t('nav.questionBank')} collapsed={collapsed} onClick={handleClick} />

      {isAdmin && (
        <>
          <Separator className="my-2" />
          {!collapsed && <p className="px-3 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">{t('nav.admin')}</p>}
          <NavItem to="/admin/questions" icon={<FileQuestion className="h-4 w-4" />} label={t('nav.questions')} collapsed={collapsed} onClick={handleClick} />
          <NavItem to="/admin/users" icon={<Users className="h-4 w-4" />} label={t('nav.users')} collapsed={collapsed} onClick={handleClick} />
          <NavItem to="/admin/ai" icon={<Sparkles className="h-4 w-4" />} label={t('nav.ai')} collapsed={collapsed} onClick={handleClick} />
        </>
      )}
    </nav>
  )
}

function AppVersion({ collapsed }: { collapsed?: boolean }) {
  const [release, setRelease] = useState<{ tag_name: string; html_url: string } | null>(null)
  useEffect(() => {
    fetch('https://api.github.com/repos/rand777gg/react-practice-web/releases/latest')
      .then((r) => r.json())
      .then((d) => { if (d?.tag_name) setRelease({ tag_name: d.tag_name, html_url: d.html_url }) })
      .catch(() => {})
  }, [])
  if (!release) return null
  return (
    <a href={release.html_url} target="_blank" rel="noopener noreferrer"
      className={cn('flex items-center gap-1 text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors', collapsed ? 'justify-center' : 'ml-auto')}>
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
      {!collapsed && <span>{release.tag_name}</span>}
    </a>
  )
}

export function Sidebar({ className, overlay, isOpen, onClose, collapsed, onToggleCollapse }: Props) {
  const { t } = useT()

  const sidebarContent = (
    <aside className={cn(
      'shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col h-screen sticky top-0 transition-all duration-300',
      collapsed ? 'w-14' : 'w-64',
      className,
    )}>
      <div className={cn('flex items-center border-b border-sidebar-border', collapsed ? 'h-14 justify-center' : 'h-14 px-4')}>
        {collapsed ? (
          !overlay && (
            <button type="button" onClick={onToggleCollapse} className="p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )
        ) : (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <GraduationCap className="h-6 w-6 text-sidebar-primary shrink-0" />
              <span className="font-semibold text-sidebar-foreground truncate">{t('app.shortTitle')}</span>
            </div>
            {!overlay && (
              <button type="button" onClick={onToggleCollapse} className="p-1 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors shrink-0">
                <PanelLeftClose className="h-5 w-5" />
              </button>
            )}
          </>
        )}
      </div>
      <SidebarNav onClose={onClose} collapsed={collapsed} />
      <div className={cn('border-t border-sidebar-border', collapsed ? 'p-1 flex justify-center' : 'p-3')}>
        <AppVersion collapsed={collapsed} />
      </div>
    </aside>
  )

  if (!overlay) return sidebarContent

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}
      <div className={cn('fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:hidden', isOpen ? 'translate-x-0' : '-translate-x-full')}>
        {sidebarContent}
      </div>
    </>
  )
}
