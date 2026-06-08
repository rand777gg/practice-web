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
  Star,
  BookOpen,
  Sparkles,
  Library,
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
      <NavLink to="/favorites" className={linkClass} onClick={handleClick}>
        <Star className="h-4 w-4" />
        {t('nav.favorites')}
      </NavLink>
      <NavLink to="/review" className={linkClass} onClick={handleClick}>
        <RotateCcw className="h-4 w-4" />
        {t('nav.wrongReview')}
      </NavLink>
      <NavLink to="/notes" className={linkClass} onClick={handleClick}>
        <BookOpen className="h-4 w-4" />
        {t('nav.publicNotes')}
      </NavLink>
      <NavLink to="/question-bank" className={linkClass} onClick={handleClick}>
        <Library className="h-4 w-4" />
        {t('nav.questionBank')}
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
          <NavLink to="/admin/ai" className={(p) => cn(linkClass(p), 'ai-nav-item border border-transparent')} onClick={handleClick}>
            <Sparkles className="h-4 w-4" />
            {t('nav.ai')}
            <span className="ml-auto text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
              BETA
            </span>
          </NavLink>
        </>
      )}
    </nav>
  )
}

function AppVersion() {
  const [release, setRelease] = useState<{ tag_name: string; html_url: string } | null>(null)
  useEffect(() => {
    fetch('https://api.github.com/repos/rand777gg/react-practice-web/releases/latest')
      .then((r) => r.json())
      .then((d) => { if (d?.tag_name) setRelease({ tag_name: d.tag_name, html_url: d.html_url }) })
      .catch(() => {})
  }, [])
  if (!release) return null
  return (
    <a
      href={release.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 ml-auto text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
      <span>{release.tag_name}</span>
    </a>
  )
}

export function Sidebar({ className, overlay, isOpen, onClose }: Props) {
  const { t } = useT()

  const sidebarContent = (
    <aside
      className={cn(
        'w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col h-screen sticky top-0',
        className,
      )}
    >
      <div className="flex items-center h-14 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-sidebar-primary" />
          <span className="font-semibold text-sidebar-foreground">{t('app.shortTitle')}</span>
        </div>
        <AppVersion />
      </div>
      <SidebarNav onClose={onClose} />
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
