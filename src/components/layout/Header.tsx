import { useAuthStore } from '@/stores/auth-store'
import { useLangStore, type Lang } from '@/stores/lang-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { LogOut, Menu } from 'lucide-react'
import { useT } from '@/i18n/use-t'

interface Props {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: Props) {
  const { t } = useT()
  const { user, profile, signOut } = useAuthStore()
  const { lang, setLang } = useLangStore()

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
        <span className="text-sm text-muted-foreground truncate">{user?.email}</span>
        {profile && (
          <Badge
            variant={profile.role === 'admin' ? 'default' : 'secondary'}
            className="hidden sm:inline-flex shrink-0"
          >
            {profile.role === 'admin' ? t('users.admin') : t('users.user')}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="h-8 w-16 text-xs"
        >
          <option value="zh">中</option>
          <option value="en">EN</option>
        </Select>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline ml-1">{t('auth.logout')}</span>
        </Button>
      </div>
    </header>
  )
}
